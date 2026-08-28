package plan

import (
	"regexp"
	"strings"
)

// checkboxRe matches a task line. Schema §4.1, verified against the real file:
// 55 matches, 0 false positives.
//
// The capture on the mark is what distinguishes done from not-done; the byte
// offset of '[' is recorded separately because write-back splices that one
// position and must never re-serialise the line.
var checkboxRe = regexp.MustCompile(`^\s*-\s*\[([ xX])\]\s*(.*)$`)

// orderRe matches the leading "**N.**" that gives a curriculum item its place
// in the study order.
var orderRe = regexp.MustCompile(`^\*{0,2}(\d+)\.\s`)

// dashes are normalised for *matching only*. They are never normalised on the
// way out: the write path preserves the bytes it read, and rewriting an em-dash
// would corrupt a file the whole plan depends on (Schema §4.7, §6).
var dashReplacer = strings.NewReplacer(
	"—", "-", // em dash
	"–", "-", // en dash
	"→", "->", // rightwards arrow
)

// Normalise folds the dashes and arrows the real file contains so that matching
// is stable. Display and write-back both use the original text.
func Normalise(s string) string { return dashReplacer.Replace(s) }

// markupRe strips bold/italic markers and backticks for display text.
var markupRe = regexp.MustCompile("[*`]+")

// StripMarkup reduces a line to its readable text. Used for display and as one
// input to the anchor, never for write-back.
func StripMarkup(s string) string {
	return strings.TrimSpace(markupRe.ReplaceAllString(s, ""))
}

// ParseCheckbox reads one line and reports whether it is a task line.
//
// It returns the item with only the fields this rule can know: position, done
// state, raw and stripped text, and the leading order number. Hours, pages,
// links, role and anchor are layered on by later rules - each is its own rule in
// the spec and its own failure mode, so each gets its own function.
func ParseCheckbox(line string, lineNo int) (Item, bool) {
	m := checkboxRe.FindStringSubmatch(line)
	if m == nil {
		return Item{}, false
	}

	body := m[2]
	item := Item{
		LineNo:  lineNo,
		Column:  strings.Index(line, "["),
		Checked: strings.EqualFold(m[1], "x"),
		Raw:     line,
		Text:    StripMarkup(Normalise(body)),

		HoursConf: ConfNone,
		PagesConf: ConfNone,
	}

	if om := orderRe.FindStringSubmatch(body); om != nil {
		// The regex guarantees digits, so the only way this fails is an integer
		// too large to represent - which cannot occur in a hand-written plan.
		item.Order = atoiSafe(om[1])
	}

	return item, true
}

// ParseItem parses a task line completely: the checkbox rule first, then each
// extraction rule layered on in turn.
//
// The rules stay separate functions rather than one routine because each is a
// separate rule in the spec with its own failure mode. The parser has already
// lost 84 hours once to a rule that failed quietly inside a larger routine, and
// small units keep a failure attributable to the rule that caused it.
func ParseItem(line string, lineNo int) (Item, bool) {
	item, ok := ParseCheckbox(line, lineNo)
	if !ok {
		return Item{}, false
	}

	// Rules read the normalised body: matching must not depend on which dash
	// the author typed. item.Raw keeps the original bytes for write-back.
	body := Normalise(checkboxRe.FindStringSubmatch(line)[2])
	item.applyHours(body)
	item.applyPages(body)

	return item, true
}

// atoiSafe converts a string the caller has already proven to be digits.
// Returns 0 on overflow rather than erroring: a plan item numbered beyond
// 2^31 is not a case worth an error path.
func atoiSafe(s string) int {
	n := 0
	for _, r := range s {
		d := int(r - '0')
		if n > (1<<31-1-d)/10 {
			return 0
		}
		n = n*10 + d
	}
	return n
}
