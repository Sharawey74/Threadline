package plan

import (
	"regexp"
	"strconv"
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
