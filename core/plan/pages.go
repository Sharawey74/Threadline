package plan

import (
	"regexp"
	"strconv"
	"strings"
)

// pageRe finds page counts, capturing whether the figure was parenthesised.
// Schema §4.3.
var pageRe = regexp.MustCompile(`(\()?(\d+)\s*(?:pp|pages)\b`)

// PageMatch is one page count found on a line.
type PageMatch struct {
	Value         int
	Raw           string
	Parenthesised bool
}

// FindPages returns every page count on the line, in order.
func FindPages(text string) []PageMatch {
	var out []PageMatch
	for _, m := range pageRe.FindAllStringSubmatchIndex(text, -1) {
		n, err := strconv.Atoi(text[m[4]:m[5]])
		if err != nil {
			continue // unreachable: the regex admits digits only
		}
		out = append(out, PageMatch{
			Value:         n,
			Raw:           strings.TrimSpace(text[m[0]:m[1]]),
			Parenthesised: m[2] != -1,
		})
	}
	return out
}

// PickPages chooses the count that is this item's own size.
//
// Rule (Schema §4.3): an unparenthesised figure is the item's size; a
// parenthesised one describes some *other* file - record it, never use it.
//
//  5. `06 - System Design` - 175pp, ~35h - Fundamentals v3 (102pp), Q&A (25pp)
//
// The item is 175pp. The 102 and 25 belong to two of its PDFs, and summing them
// would both double-count and disagree with the 396pp total the plan declares.
//
// A count that appears ONLY in parentheses is not promoted to the item's size.
// It genuinely describes another file, and guessing would put an invented
// number on screen - which is precisely what C5 forbids.
func PickPages(matches []PageMatch) (value int, conf Confidence, notes []string) {
	if len(matches) == 0 {
		return 0, ConfNone, nil
	}

	var bare []PageMatch
	for _, m := range matches {
		if !m.Parenthesised {
			bare = append(bare, m)
		}
	}

	if len(matches) > 1 {
		parts := make([]string, 0, len(matches))
		for _, m := range matches {
			label := m.Raw
			if m.Parenthesised {
				label += "(describes another file)"
			}
			parts = append(parts, label)
		}
		notes = append(notes, "multiple page counts: "+strings.Join(parts, ", "))
	}

	switch len(bare) {
	case 0:
		notes = append(notes, "page count only appears parenthesised - likely describes another file")
		return 0, ConfNone, notes
	case 1:
		return bare[0].Value, ConfHigh, notes
	default:
		// Two unparenthesised counts on one line is not a shape the real file
		// contains. Take the first and say so, rather than picking silently.
		notes = append(notes, "several unparenthesised page counts - took the first")
		return bare[0].Value, ConfLow, notes
	}
}

// applyPages layers the page rule onto an item parsed by ParseCheckbox.
func (i *Item) applyPages(body string) {
	v, conf, notes := PickPages(FindPages(body))
	i.Pages, i.PagesConf = v, conf
	i.Notes = append(i.Notes, notes...)
}
