package plan

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

// An outline is a sidecar checklist beside a PDF, `<stem>.outline.md`, with one
// line per section of the document:
//
//	- [ ] Indexes — p.47
//
// It is written only by an explicit import and ticked through the same
// one-byte path as the plan file. Nothing here reads or writes the plan file.

// sectionRe splits a checkbox line's normalised text into its title and the
// page the section starts on. The text has already had its dashes folded to
// "-", so one pattern covers em dash, en dash and hyphen. The title is greedy:
// only the last dash before p.N is the separator.
var sectionRe = regexp.MustCompile(`^(.*\S)\s*-\s*p\.(\d+)\s*$`)

// OutlineSection is one line of an outline.
type OutlineSection struct {
	Title   string `json:"title"`
	Page    int    `json:"page"` // the page the section starts on
	Checked bool   `json:"checked"`
	LineNo  int    `json:"lineNo"` // 1-based

	// Write-back internals, as on Item.
	Column int    `json:"-"`
	Raw    string `json:"-"`
}

// ParseOutlineLine reads one outline line. A checkbox line is a section only
// when its text ends in `— p.N`; any other line is not.
func ParseOutlineLine(line string, lineNo int) (OutlineSection, bool) {
	item, ok := ParseCheckbox(line, lineNo)
	if !ok {
		return OutlineSection{}, false
	}
	m := sectionRe.FindStringSubmatch(item.Text)
	if m == nil {
		return OutlineSection{}, false
	}
	page, err := strconv.Atoi(m[2])
	if err != nil {
		return OutlineSection{}, false // a page number too large to be real
	}
	return OutlineSection{
		Title:   m[1],
		Page:    page,
		Checked: item.Checked,
		LineNo:  lineNo,
		Column:  item.Column,
		Raw:     line,
	}, true
}

// dotLeaderRe reads a table-of-contents line as a PDF prints it:
//
//  3. Indexes........ 47
//
// numbered, a run of two or more dots, then the page.
var dotLeaderRe = regexp.MustCompile(`^\s*\d+\.\s*(.+?)\s*\.{2,}\s*(\d+)\s*$`)

// totalRe reads the outline's page total, the line FormatOutline writes. The
// total is entered by the user; nothing here guesses it.
var totalRe = regexp.MustCompile(`^\s*Total pages:\s*(\d+)\s*$`)

// Outline is a document's sections in order, and its page total when the
// user has recorded one (0 when not).
type Outline struct {
	Total    int              `json:"total"`
	Sections []OutlineSection `json:"sections"`
}

// ImportOutline reads pasted text into an outline. It accepts dot-leader
// table-of-contents lines and outline lines alike, so an outline file's own
// text imports to the same sections. Every other line is ignored, and every
// imported section starts unticked.
func ImportOutline(text string) Outline {
	var out Outline
	for i, line := range strings.Split(text, "\n") {
		line = strings.TrimRight(line, "\r")
		if m := totalRe.FindStringSubmatch(line); m != nil {
			if n, err := strconv.Atoi(m[1]); err == nil {
				out.Total = n
			}
			continue
		}
		if s, ok := ParseOutlineLine(line, i+1); ok {
			out.Sections = append(out.Sections, OutlineSection{Title: s.Title, Page: s.Page, LineNo: i + 1})
			continue
		}
		m := dotLeaderRe.FindStringSubmatch(line)
		if m == nil {
			continue
		}
		page, err := strconv.Atoi(m[2])
		if err != nil {
			continue
		}
		// Folded and stripped as a checkbox line's text is, so the title reads
		// the same once written out and parsed back.
		title := strings.TrimSpace(StripMarkup(Normalise(m[1])))
		out.Sections = append(out.Sections, OutlineSection{Title: title, Page: page, LineNo: i + 1})
	}
	return out
}

// FormatOutline writes an outline file's text: the page total when there is
// one, then one checkbox line per section, in order.
func FormatOutline(o Outline) string {
	var b strings.Builder
	b.WriteString("# Outline\n\n")
	if o.Total > 0 {
		fmt.Fprintf(&b, "Total pages: %d\n\n", o.Total)
	}
	for _, s := range o.Sections {
		mark := " "
		if s.Checked {
			mark = "x"
		}
		fmt.Fprintf(&b, "- [%s] %s — p.%d\n", mark, s.Title, s.Page)
	}
	return b.String()
}
