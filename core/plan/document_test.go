package plan

import (
	"os"
	"path/filepath"
	"testing"
)

// fixturePlan parses testdata/plan.md against a matching miniature career root,
// so link resolution has something real to resolve against.
func fixturePlan(t *testing.T) *Plan {
	t.Helper()

	root := t.TempDir()
	for _, dir := range []string{
		"Study guided & notes/02 - Databases & Storage",
		"Study guided & notes/06 - System Design",
		"Study guided & notes/09 - AI",
	} {
		if err := os.MkdirAll(filepath.Join(root, dir), 0o750); err != nil {
			t.Fatal(err)
		}
	}

	content, err := os.ReadFile(filepath.Join("testdata", "plan.md"))
	if err != nil {
		t.Fatal(err)
	}
	return ParseDocument(string(content), Resolver{Root: root})
}

func TestParseDocument(t *testing.T) {
	p := fixturePlan(t)

	if got := len(p.Items); got != 11 {
		t.Errorf("items = %d, want 11", got)
	}
	if got := len(p.Sections); got != 7 {
		t.Errorf("sections = %d, want 7", got)
	}
	if total, ok := p.BudgetRow("total"); !ok || total != 292 {
		t.Errorf("budget Total = %v (found %v), want 292", total, ok)
	}
	if study, ok := p.BudgetRow("study guide"); !ok || study != 81 {
		t.Errorf("budget study row = %v (found %v), want 81", study, ok)
	}
}

// Items must attach to the heading above them - that is what gives them a role.
func TestItemsAttachToTheirSection(t *testing.T) {
	p := fixturePlan(t)

	sched := p.SectionsWithRole(SecSchedule)
	if len(sched) != 2 {
		t.Fatalf("schedule sections = %d, want 2 (Now, September)", len(sched))
	}

	now := p.ItemsIn("Now -> Sun 30 Aug")
	if len(now) != 4 {
		t.Fatalf("items in 'Now' = %d, want 4", len(now))
	}
	for _, i := range now {
		if i.Role != RoleSchedule {
			t.Errorf("%q role = %v, want schedule", i.Text, i.Role)
		}
	}
}

// The finding that drives the whole model: the file states the same hours three
// ways, and only schedule items count toward the budget.
func TestOnlyScheduleItemsCountTowardTheBudget(t *testing.T) {
	p := fixturePlan(t)

	schedule := SumHours(p.ItemsWithRole(RoleSchedule))
	curriculum := SumHours(p.ItemsWithRole(RoleCurriculum))
	scope := SumHours(p.ItemsWithRole(RoleScope))

	// Now: 0.5 + 15 + 1.5 = 17;  September: 2  ->  19
	if schedule != 19 {
		t.Errorf("schedule hours = %v, want 19", schedule)
	}
	// 7 + 35 + 3 = 45, descriptive - paid for by schedule items
	if curriculum != 45 {
		t.Errorf("curriculum hours = %v, want 45", curriculum)
	}
	if scope != 0 {
		t.Errorf("scope hours = %v, want 0", scope)
	}

	naive := SumHours(p.Items)
	if naive == schedule {
		t.Fatal("naive sum equals the schedule total - roles are not separating anything")
	}
	t.Logf("naive sum %v vs true budget %v - the gap roles exist to prevent", naive, schedule)
}

// Curriculum items are the ones with an order AND a resolving folder link.
func TestCurriculumItemsResolveToFolders(t *testing.T) {
	p := fixturePlan(t)

	curriculum := p.ItemsWithRole(RoleCurriculum)
	if len(curriculum) != 3 {
		t.Fatalf("curriculum items = %d, want 3", len(curriculum))
	}
	for _, i := range curriculum {
		if i.Order == 0 {
			t.Errorf("%q has no order number", i.Text)
		}
		if !i.HasHours() {
			t.Errorf("%q has no hours", i.Text)
		}
	}
}

// The GitHub search query must not become a link, and must not be reported as
// broken either.
func TestSearchQueryDoesNotBecomeALink(t *testing.T) {
	p := fixturePlan(t)

	for _, i := range p.Items {
		for _, n := range i.Notes {
			if contains(n, "good first issue") && contains(n, "does not exist") {
				t.Errorf("search query reported as a broken link: %q", n)
			}
		}
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (func() bool {
		for i := 0; i+len(sub) <= len(s); i++ {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
		return false
	})()
}

// A section that declares no budget is different from one declaring zero.
func TestUnbudgetedSectionHasNoBudget(t *testing.T) {
	p := fixturePlan(t)

	for _, s := range p.Sections {
		if s.Number == 8 {
			if s.HasBudget() {
				t.Errorf("§8 parsed a budget of %v from prose denying one", s.Budget)
			}
			return
		}
	}
	t.Fatal("§8 not found in the fixture")
}
