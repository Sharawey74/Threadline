package plan

import (
	"regexp"
	"strconv"
	"strings"
)

// Emphasis records *how* an hour figure was written. It is the whole basis of
// the selection rule: a marked-up figure is one the author placed deliberately,
// a bare one is usually prose that happens to contain a number.
type Emphasis string

const (
	EmphBold   Emphasis = "bold"   // **Notes track - 15h**
	EmphItalic Emphasis = "italic" // *0.5h*
	EmphTilde  Emphasis = "tilde"  // ~7h  - an estimate, still deliberate
	EmphPlain  Emphasis = "plain"  // 15h  - unmarked
)

// deliberate reports whether the author marked this figure up. Tilde counts:
// "~7h" is an explicit estimate, not an incidental number in a sentence.
func (e Emphasis) deliberate() bool { return e != EmphPlain }

// hourRe finds every hour figure on a line along with the characters around it,
// which is what tells emphasis apart. Schema §4.2.
//
// The surrounding captures are deliberately greedy about '*' and '~' so that
// "**15h**" is seen as bold rather than italic - the count of asterisks is the
// only thing separating the two.
var hourRe = regexp.MustCompile(`(\*{0,2}~?\(?)(\d+(?:\.\d+)?)\s*h\b(\)?\*{0,2})`)

// HourMatch is one hour figure found on a line, kept with enough context to
// explain why it was or was not chosen.
type HourMatch struct {
	Value    float64
	Raw      string
	Emphasis Emphasis
	Offset   int
}

// FindHours returns every hour figure on the line, in the order they appear.
func FindHours(text string) []HourMatch {
	var out []HourMatch
	for _, m := range hourRe.FindAllStringSubmatchIndex(text, -1) {
		pre := text[m[2]:m[3]]
		num := text[m[4]:m[5]]
		post := text[m[6]:m[7]]

		v, err := strconv.ParseFloat(num, 64)
		if err != nil {
			// The regex only admits digits and one dot, so this is
			// unreachable for any realistic figure. Skipping beats guessing.
			continue
		}

		out = append(out, HourMatch{
			Value:    v,
			Raw:      text[m[0]:m[1]],
			Emphasis: classify(pre, post),
			Offset:   m[0],
		})
	}
	return out
}

func classify(pre, post string) Emphasis {
	switch {
	case strings.Contains(pre, "~"):
		return EmphTilde
	case strings.Count(pre, "*") >= 2, strings.Count(post, "*") >= 2:
		return EmphBold
	case strings.Contains(pre, "*"), strings.Contains(post, "*"):
		return EmphItalic
	default:
		return EmphPlain
	}
}

// PickHours chooses the figure representing this item's own allocation.
//
// Rule (Schema §4.2): if any figure is emphasised, take the LAST emphasised
// one; otherwise take the last plain one and mark it low confidence.
//
// Last rather than first because these lines read as a description that ends in
// its allocation - "Notes track - 15h (topics 1 and 2)". A figure earlier in
// the line is usually context, not the number being committed to.
//
// A line with several figures always records a note, even when the choice is
// unambiguous, so the ambiguity is visible rather than resolved in silence.
func PickHours(matches []HourMatch) (value float64, conf Confidence, notes []string) {
	if len(matches) == 0 {
		return 0, ConfNone, nil
	}

	if len(matches) > 1 {
		parts := make([]string, 0, len(matches))
		for _, m := range matches {
			parts = append(parts, strings.TrimSpace(m.Raw)+"("+string(m.Emphasis)+")")
		}
		notes = append(notes, "multiple hour figures: "+strings.Join(parts, ", "))
	}

	for i := len(matches) - 1; i >= 0; i-- {
		if matches[i].Emphasis.deliberate() {
			return matches[i].Value, ConfHigh, notes
		}
	}

	// Nothing was marked up. The figure is probably right, but it was not
	// declared - so it is reported as low confidence rather than as fact (C5).
	return matches[len(matches)-1].Value, ConfLow, notes
}

// applyHours layers the hour rule onto an item parsed by ParseCheckbox.
func (i *Item) applyHours(body string) {
	v, conf, notes := PickHours(FindHours(body))
	i.Hours, i.HoursConf = v, conf
	i.Notes = append(i.Notes, notes...)
}
