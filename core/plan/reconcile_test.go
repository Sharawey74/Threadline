package plan

import (
	"strings"
	"testing"
)

func fixtureTopics() []Topic {
	return []Topic{
		{Slug: "02 - Databases & Storage", Order: 2},
		{Slug: "06 - System Design", Order: 6},
		{Slug: "09 - AI", Order: 9},
	}
}

// Schema §7. The fixture is internally consistent, so every generated check
// should pass - and the COUNT should follow the plan's shape, not a constant.
func TestReconcileFixtureIsConsistent(t *testing.T) {
	p := fixturePlan(t)
	checks := Reconcile(p, fixtureTopics())

	for _, c := range checks {
		if !c.Passed {
			t.Errorf("FAILED %s%s", c, detailSuffix(c))
		}
	}
	if !Passed(checks) {
		t.Error("Passed() = false")
	}

	// 2 schedule + 1 rollup + 1 scope + 3 curriculum + 1 integrity
	if len(checks) != 8 {
		t.Errorf("generated %d checks, want 8", len(checks))
		for _, c := range checks {
			t.Logf("  %s", c)
		}
	}
}

func detailSuffix(c Check) string {
	if c.Detail == "" {
		return ""
	}
	return "  [" + c.Detail + "]"
}

// The check set is derived. Removing a schedule section must remove its check,
// not leave a stale one passing or failing.
func TestCheckCountFollowsThePlanShape(t *testing.T) {
	p := fixturePlan(t)
	before := len(Reconcile(p, fixtureTopics()))

	// Drop the September block and its item.
	var sections []Section
	for _, s := range p.Sections {
		if s.Title != "September" {
			sections = append(sections, s)
		}
	}
	var items []Item
	for _, i := range p.Items {
		if i.Section != "September" {
			items = append(items, i)
		}
	}
	p.Sections, p.Items = sections, items

	after := len(Reconcile(p, fixtureTopics()))
	if after != before-1 {
		t.Errorf("checks went %d -> %d, want one fewer", before, after)
	}
}

// Rule 7 is the one that catches silence. When a heading fails to parse its
// budget, checks 1-6 simply stop generating - nothing fails, and the plan looks
// fine. This is the regression for the 84 vanished hours.
func TestIntegrityCheckCatchesAnUnparsedBudget(t *testing.T) {
	p := fixturePlan(t)

	// Simulate the old too-strict regex: the scope section loses its budget.
	for i := range p.Sections {
		if p.Sections[i].Role == SecScope {
			p.Sections[i].Budget = 0
			p.Sections[i].BudgetConf = ConfNone
		}
	}

	checks := Reconcile(p, fixtureTopics())
	if Passed(checks) {
		t.Fatal("a section with an unparsed budget produced no failure at all")
	}

	var integrity *Check
	for i := range checks {
		if strings.Contains(checks[i].Label, "declaring a budget") {
			integrity = &checks[i]
		}
	}
	if integrity == nil {
		t.Fatal("no integrity check was generated")
	}
	if integrity.Passed {
		t.Error("integrity check passed despite a missing budget")
	}
	if integrity.Detail == "" {
		t.Error("integrity failure did not name the offending section")
	}
}

// Drift in a month block must be reported, not absorbed.
func TestDriftInAScheduleSectionFails(t *testing.T) {
	p := fixturePlan(t)

	for i := range p.Sections {
		if p.Sections[i].Title == "Now -> Sun 30 Aug" {
			p.Sections[i].Budget = 25 // items still sum to 17
		}
	}

	checks := Reconcile(p, fixtureTopics())
	if Passed(checks) {
		t.Fatal("a section whose items no longer sum to its heading passed")
	}
}

// A topic folder appearing on disk with no matching plan item is drift too.
func TestExtraTopicFolderFails(t *testing.T) {
	p := fixturePlan(t)
	topics := append(fixtureTopics(), Topic{Slug: "07 - DevOps", Order: 7})

	checks := Reconcile(p, topics)
	if Passed(checks) {
		t.Fatal("an unaccounted topic folder on disk passed reconciliation")
	}
}

// The tolerance must absorb float noise from 0.5 + 1.5 sums without ever
// hiding real drift.
func TestToleranceAbsorbsFloatNoiseOnly(t *testing.T) {
	if !newCheck("x", 0.1+0.2, 0.3, "h").Passed {
		t.Error("float noise reported as drift")
	}
	if newCheck("x", 19, 19.5, "h").Passed {
		t.Error("a half-hour difference was absorbed as noise")
	}
}
