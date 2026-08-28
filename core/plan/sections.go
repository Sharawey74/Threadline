package plan

import (
	"regexp"
	"strconv"
	"strings"
)

// SectionRole is what a heading's block of the plan is for. It is derived from
// the TITLE and never from the section number, and never from whether a budget
// happened to parse.
//
// Both of those shortcuts have already failed here. A positional test
// (number >= 8) pulled a newly inserted section into the 292h budget and
// doubled the total to 584h. And deriving the role from the budget is circular:
// a budget that fails to match would quietly remove its own section from its
// own checks, which is the exact failure the integrity check exists to catch.
type SectionRole string

const (
	SecSchedule   SectionRole = "schedule"   // a month or date block
	SecScope      SectionRole = "scope"      // a deliverable definition
	SecCurriculum SectionRole = "curriculum" // ordered items linking topic folders
	SecReference  SectionRole = "reference"  // anything else
)

var (
	headingRe    = regexp.MustCompile(`^(#{1,6})\s+(.*)$`)
	sectionNumRe = regexp.MustCompile(`^(\d+)\.\s+(.*)$`)

	// budgetParenRe captures an italic parenthetical; budgetFieldRe decides
	// whether one of its fields IS an hour figure. Schema §4.2.
	budgetParenRe = regexp.MustCompile(`\*\(([^)]*)\)\*`)
	budgetFieldRe = regexp.MustCompile(`^\s*~?(\d+(?:\.\d+)?)\s*h\s*$`)
	budgetSepRe   = regexp.MustCompile(`[·,]`)
)

// Section is one "## N. Title" block.
type Section struct {
	Number   int
	Title    string
	RawTitle string // the heading as written, for parse-integrity reporting
	LineNo   int
	Role     SectionRole

	Budget     float64
	BudgetConf Confidence
}

// HasBudget reports whether the heading declared an hour budget. A section that
// declares none is a different fact from one declaring zero.
func (s Section) HasBudget() bool { return s.BudgetConf != ConfNone }

var monthPrefixes = []string{
	"january", "february", "march", "april", "may", "june",
	"july", "august", "september", "october", "november", "december",
}

var scopePrefixes = []string{"certificate project", "side project"}

// SectionBudget extracts the hour budget from a heading.
//
// Rule (Schema §4.2): split the italic parenthetical on '·' and ',', and accept
// a field only if the ENTIRE field is an hour figure. Take the last such field;
// if none qualifies, the section has no budget.
//
// This rule has been wrong in both directions. Requiring the hours to sit
// immediately before the closing paren silently dropped two sections once they
// grew trailing qualifiers - 84 hours vanished with no error. Relaxing it to
// find hours anywhere inside the parentheses read 292h out of the phrase
// "unbudgeted - not part of the 292h", a budget taken from prose written to
// deny having one. The figure must BE the field, not merely appear in it.
func SectionBudget(heading string) (value float64, conf Confidence, parenStart int) {
	m := budgetParenRe.FindStringSubmatchIndex(heading)
	if m == nil {
		return 0, ConfNone, -1
	}

	inner := heading[m[2]:m[3]]
	found := false
	for _, field := range budgetSepRe.Split(inner, -1) {
		fm := budgetFieldRe.FindStringSubmatch(field)
		if fm == nil {
			continue
		}
		v, err := strconv.ParseFloat(fm[1], 64)
		if err != nil {
			continue
		}
		value, found = v, true // last qualifying field wins
	}

	if !found {
		return 0, ConfNone, -1
	}
	return value, ConfHigh, m[0]
}

// ParseHeading reads a "## N. Title" line into a Section.
func ParseHeading(line string, lineNo int) (Section, bool) {
	m := headingRe.FindStringSubmatch(line)
	if m == nil || len(m[1]) != 2 { // only "##" delimits a plan section
		return Section{}, false
	}

	body := Normalise(m[2])
	sec := Section{LineNo: lineNo, RawTitle: body, BudgetConf: ConfNone}

	if v, conf, start := SectionBudget(body); conf != ConfNone {
		sec.Budget, sec.BudgetConf = v, conf
		body = strings.TrimSpace(body[:start])
	}

	if nm := sectionNumRe.FindStringSubmatch(body); nm != nil {
		sec.Number = atoiSafe(nm[1])
		body = nm[2]
	}

	sec.Title = StripMarkup(body)
	sec.Role = classifySection(sec.Title)
	return sec, true
}

func classifySection(title string) SectionRole {
	t := strings.ToLower(strings.TrimSpace(title))
	if strings.HasPrefix(t, "now") || hasAnyPrefix(t, monthPrefixes) {
		return SecSchedule
	}
	if hasAnyPrefix(t, scopePrefixes) {
		return SecScope
	}
	return SecReference
}

func hasAnyPrefix(s string, prefixes []string) bool {
	for _, p := range prefixes {
		if strings.HasPrefix(s, p) {
			return true
		}
	}
	return false
}
