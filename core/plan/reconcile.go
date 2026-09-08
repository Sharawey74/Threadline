package plan

import (
	"fmt"
	"math"
	"strings"
)

// Check is one reconciliation result: a claim the plan makes about itself,
// compared against what the plan actually contains.
type Check struct {
	Label  string  `json:"label"`
	Got    float64 `json:"got"`
	Want   float64 `json:"want"`
	Unit   string  `json:"unit"` // "h", "pp", or "" for counts
	Passed bool    `json:"passed"`
	Detail string  `json:"detail"` // on failure, so a red line explains itself
}

func (c Check) String() string {
	status := "OK "
	if !c.Passed {
		status = "X  "
	}
	return fmt.Sprintf("%s %-44s %7g%s vs %g%s", status, c.Label, c.Got, c.Unit, c.Want, c.Unit)
}

// tolerance absorbs float noise from summing figures like 0.5 and 1.5. It is
// far below the smallest allocation the plan uses, so it can never hide drift.
const tolerance = 0.01

func newCheck(label string, got, want float64, unit string) Check {
	return Check{
		Label:  label,
		Got:    got,
		Want:   want,
		Unit:   unit,
		Passed: math.Abs(got-want) < tolerance,
	}
}

// Topic is a study folder on disk, supplied by the scanner. Reconciliation
// takes it as input rather than reading the filesystem itself, which keeps
// these rules pure and testable without a career folder.
type Topic struct {
	Slug  string `json:"slug"`
	Order int    `json:"order"`
}

// Reconcile generates the check set from roles and runs it.
//
// The set is GENERATED, never a fixed list. Adding a month block adds a check
// and removing one removes it, so the plan's own shape decides what is
// verified. A hardcoded count was itself a bug: ten checks happened to hold
// only while the plan had exactly six schedule blocks.
func Reconcile(p *Plan, topics []Topic) []Check {
	var checks []Check

	schedule := p.SectionsWithRole(SecSchedule)
	scope := p.SectionsWithRole(SecScope)

	checks = append(checks, p.scheduleChecks(schedule)...)
	checks = append(checks, p.scopeChecks(scope, schedule)...)
	checks = append(checks, p.curriculumChecks(topics)...)
	checks = append(checks, integrityCheck(schedule, scope))

	return checks
}

// 1 & 2: every schedule section sums to its budget, and the schedule as a whole
// equals the declared total.
func (p *Plan) scheduleChecks(schedule []Section) []Check {
	var checks []Check
	var total float64

	for _, sec := range schedule {
		if !sec.HasBudget() {
			continue // the integrity check owns this failure
		}
		total += sec.Budget
		checks = append(checks, newCheck(
			fmt.Sprintf("§%d %s tasks vs heading", sec.Number, sec.Title),
			SumHours(p.ItemsIn(sec.Title)), sec.Budget, "h",
		))
	}

	declared, _ := p.BudgetRow("total")
	return append(checks, newCheck("schedule headings vs budget table total", total, declared, "h"))
}

// 3: every scope section is funded by the schedule items that name it.
//
// Scope items carry no hours of their own - the money for them is spent in the
// month blocks. An item funds a scope section when it carries the explicit
// "(Section N)" marker, or leads with the section's title up to its first
// separator: "Certificate project A - Testing" gives the key
// "Certificate project A".
func (p *Plan) scopeChecks(scope, schedule []Section) []Check {
	var checks []Check

	scheduled := map[string]bool{}
	for _, s := range schedule {
		scheduled[s.Title] = true
	}

	for _, sec := range scope {
		if !sec.HasBudget() {
			continue // the integrity check owns this failure
		}
		key := strings.TrimSpace(strings.Split(sec.Title, " - ")[0])
		marker := fmt.Sprintf("(Section %d)", sec.Number)

		var funded float64
		for _, i := range p.Items {
			if !scheduled[i.Section] {
				continue
			}
			if strings.HasPrefix(i.Text, key) || strings.Contains(i.Text, marker) {
				if i.HasHours() {
					funded += i.Hours
				}
			}
		}

		checks = append(checks, newCheck(
			fmt.Sprintf("§%d %s funded by the schedule", sec.Number, key),
			funded, sec.Budget, "h",
		))
	}

	return checks
}

// 4, 5 & 6: the curriculum against its three declared denominators.
func (p *Plan) curriculumChecks(topics []Topic) []Check {
	items := p.ItemsWithRole(RoleCurriculum)

	declaredHours, _ := p.BudgetRow("study guide")
	checks := []Check{
		newCheck("curriculum hours vs budget table row", SumHours(items), declaredHours, "h"),
		newCheck("curriculum items vs topic folders on disk",
			float64(len(items)), float64(len(topics)), ""),
	}

	var pages float64
	for _, i := range items {
		if i.HasPages() {
			pages += float64(i.Pages)
		}
	}
	return append(checks, newCheck("curriculum pages vs total declared in §3",
		pages, declaredPages(p), "pp"))
}

// declaredPages reads the aggregate page count out of the §3 row label, e.g.
// "Study guide & notes - 9 topics, 396 pages". Both sides of the check come
// from the file; neither is ours.
func declaredPages(p *Plan) float64 {
	for k := range p.Budget {
		if !strings.HasPrefix(strings.ToLower(k), "study guide") {
			continue
		}
		if m := FindPages(k); len(m) > 0 {
			return float64(m[0].Value)
		}
	}
	return 0
}

// 7: every schedule or scope section declares a budget.
//
// Checks 1-6 compare parsed values, so a section that fails to parse produces
// no check and therefore no failure - the set silently shrinks and everything
// still looks green. This is the only rule that watches for checks that should
// exist and do not, and it is what caught 84 hours vanishing.
func integrityCheck(schedule, scope []Section) Check {
	var missing []string
	total := len(schedule) + len(scope)

	for _, sec := range append(append([]Section{}, schedule...), scope...) {
		if !sec.HasBudget() {
			missing = append(missing, fmt.Sprintf("§%d %s", sec.Number, sec.RawTitle))
		}
	}

	c := newCheck("schedule/scope sections declaring a budget",
		float64(total-len(missing)), float64(total), "")
	if len(missing) > 0 {
		c.Detail = "parse failure: " + strings.Join(missing, "; ")
	}
	return c
}

// Passed reports whether every check in the set passed.
func Passed(checks []Check) bool {
	for _, c := range checks {
		if !c.Passed {
			return false
		}
	}
	return true
}
