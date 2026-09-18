package plan

import (
	"fmt"
	"os"
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
	out := Outline{Sections: []OutlineSection{}}
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

// PageRange is the pages one section covers, inclusive. To is 0 when the end
// is unknown: the last section with no total recorded, or pages that do not
// run forwards.
type PageRange struct {
	From int `json:"from"`
	To   int `json:"to"`
}

// Known reports whether the range has a real end.
func (r PageRange) Known() bool { return r.To >= r.From && r.To > 0 }

// Pages is the number of pages in a known range, and 0 otherwise.
func (r PageRange) Pages() int {
	if !r.Known() {
		return 0
	}
	return r.To - r.From + 1
}

// Ranges gives each section's pages: from its start to the page before the
// next section starts, and for the last section, to the recorded total. An
// end that is missing, before the start, or past the total is unknown.
func (o Outline) Ranges() []PageRange {
	out := make([]PageRange, len(o.Sections))
	for i, s := range o.Sections {
		end := o.Total
		if i+1 < len(o.Sections) {
			end = o.Sections[i+1].Page - 1
		}
		r := PageRange{From: s.Page, To: end}
		if !r.Known() || (o.Total > 0 && end > o.Total) {
			r.To = 0
		}
		out[i] = r
	}
	return out
}

// OutlineProgress is both counts an outline supports. The page figures are
// set only when PagesKnown: without a recorded total the last section has no
// end, so any page figure would be invented (C5).
type OutlineProgress struct {
	SectionsDone int  `json:"sectionsDone"`
	Sections     int  `json:"sections"`
	PagesDone    int  `json:"pagesDone"`
	Pages        int  `json:"pages"`
	PagesKnown   bool `json:"pagesKnown"`
}

// Progress counts ticked sections, and the pages their ranges cover.
func (o Outline) Progress() OutlineProgress {
	p := OutlineProgress{Sections: len(o.Sections)}
	ranges := o.Ranges()
	for i, s := range o.Sections {
		if s.Checked {
			p.SectionsDone++
			p.PagesDone += ranges[i].Pages()
		}
	}
	if o.Total > 0 {
		p.Pages = o.Total
		p.PagesKnown = true
	} else {
		p.PagesDone = 0
	}
	return p
}

// roleOutline scopes an outline line's anchor, so it can never equal a plan
// item's.
const roleOutline Role = "outline"

// ParseOutline reads an outline file's text, ticks included.
func ParseOutline(text string) Outline {
	out := Outline{Sections: []OutlineSection{}}
	for i, line := range strings.Split(text, "\n") {
		line = strings.TrimRight(line, "\r")
		if m := totalRe.FindStringSubmatch(line); m != nil {
			if n, err := strconv.Atoi(m[1]); err == nil {
				out.Total = n
			}
			continue
		}
		if s, ok := ParseOutlineLine(line, i+1); ok {
			out.Sections = append(out.Sections, s)
		}
	}
	return out
}

// ReadOutline reads and parses an outline file.
func ReadOutline(path string) (Outline, error) {
	b, err := os.ReadFile(path) // #nosec G304 -- a sidecar under the career root
	if err != nil {
		return Outline{}, err
	}
	return ParseOutline(string(b)), nil
}

// TickSection sets one section's box through Tick, the plan file's one-byte
// path: the line is found again by its anchor, and the whole file must be
// unchanged since it was read. It returns the bytes changed, 1 or 0.
func TickSection(path string, s OutlineSection, checked bool) (int, error) {
	item, ok := ParseCheckbox(s.Raw, s.LineNo)
	if !ok {
		return 0, ErrAnchorMismatch
	}
	return Tick(TickOptions{
		Path:    path,
		Anchor:  Anchor(roleOutline, "", item.Text),
		Checked: checked,
		Role:    roleOutline,
	})
}
