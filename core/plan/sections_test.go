package plan

import "testing"

// Schema §4.2, heading budgets. Every case here is a shape the real file has
// contained, including the two that broke the rule in opposite directions.
func TestSectionBudget(t *testing.T) {
	tests := []struct {
		name    string
		heading string
		budget  float64
		conf    Confidence
	}{
		{
			name:    "single field, all hours",
			heading: "9. Now -> Sun 30 Aug *(19h)*",
			budget:  19,
			conf:    ConfHigh,
		},
		{
			name:    "second field, all hours",
			heading: "6. Side project A *(Oct-Nov, 38h)*",
			budget:  38,
			conf:    ConfHigh,
		},
		{
			// Broke the rule the FIRST way. A regex requiring the hours to sit
			// immediately before ')' matched neither this nor its sibling, and
			// 84h of budget vanished with no error at all.
			name:    "middle field with trailing qualifier",
			heading: "6. Certificate project A - Testing *(ISTQB · 38h · timing flexible)*",
			budget:  38,
			conf:    ConfHigh,
		},
		{
			// Broke the rule the SECOND way. Matching hours anywhere inside the
			// parentheses reads a budget out of a phrase written to deny one.
			name:    "prose that mentions hours declares no budget",
			heading: "8. Personal project - Threadline *(unbudgeted - not part of the 292h)*",
			conf:    ConfNone,
		},
		{
			name:    "no parenthetical at all",
			heading: "1. Where you stand",
			conf:    ConfNone,
		},
		{
			// A parenthetical that is not a budget must not become one.
			name:    "italic parenthetical without hours",
			heading: "5. Decisions locked *(reviewed quarterly)*",
			conf:    ConfNone,
		},
		{
			name:    "fractional budget",
			heading: "12. Catch-up *(0.5h)*",
			budget:  0.5,
			conf:    ConfHigh,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, conf, _ := SectionBudget(Normalise(tt.heading))
			if conf != tt.conf {
				t.Errorf("confidence = %v, want %v", conf, tt.conf)
			}
			if conf != ConfNone && got != tt.budget {
				t.Errorf("budget = %v, want %v", got, tt.budget)
			}
		})
	}
}

// Roles come from the title. A section's number must never influence its role -
// inserting a section renumbers everything below it, and a positional test once
// pulled a new section into the budget and doubled the total to 584h.
func TestSectionRoleIgnoresNumber(t *testing.T) {
	tests := []struct {
		heading string
		role    SectionRole
	}{
		{"9. Now -> Sun 30 Aug *(19h)*", SecSchedule},
		{"10. September *(54h)*", SecSchedule},
		{"14. January *(55h)*", SecSchedule},
		{"6. Certificate project A - Testing *(ISTQB · 38h)*", SecScope},
		{"7. Certificate project B - Cloud *(AWS SAA · 46h)*", SecScope},
		{"8. Personal project - Threadline *(unbudgeted)*", SecReference},
		{"3. The budget", SecReference},
		{"16. Standing rules", SecReference},
	}

	for _, tt := range tests {
		t.Run(tt.heading, func(t *testing.T) {
			sec, ok := ParseHeading("## "+tt.heading, 1)
			if !ok {
				t.Fatal("did not parse as a heading")
			}
			if sec.Role != tt.role {
				t.Errorf("role = %v, want %v", sec.Role, tt.role)
			}
		})
	}
}

// The same section keeps its role after renumbering. This is the regression
// that the 584h bug would fail.
func TestRenumberingDoesNotChangeRole(t *testing.T) {
	before, _ := ParseHeading("## 8. September *(54h)*", 1)
	after, _ := ParseHeading("## 11. September *(54h)*", 1)

	if before.Role != after.Role {
		t.Fatalf("role changed with the number: %v -> %v", before.Role, after.Role)
	}
	if before.Role != SecSchedule {
		t.Errorf("role = %v, want schedule", before.Role)
	}
}

func TestParseHeading(t *testing.T) {
	sec, ok := ParseHeading("## 9. Now → Sun 30 Aug *(19h)*", 135)
	if !ok {
		t.Fatal("did not parse")
	}
	if sec.Number != 9 {
		t.Errorf("Number = %d, want 9", sec.Number)
	}
	if sec.Title != "Now -> Sun 30 Aug" {
		t.Errorf("Title = %q", sec.Title)
	}
	if !sec.HasBudget() || sec.Budget != 19 {
		t.Errorf("budget = %v/%v, want 19/high", sec.Budget, sec.BudgetConf)
	}
	if sec.LineNo != 135 {
		t.Errorf("LineNo = %d, want 135", sec.LineNo)
	}
	if sec.RawTitle == "" {
		t.Error("RawTitle empty - parse-integrity reporting needs it")
	}
}

// Only "##" delimits a plan section. Deeper headings are content.
func TestOnlyLevelTwoHeadingsAreSections(t *testing.T) {
	for _, line := range []string{
		"# Career plan",
		"### 9.1 A sub-heading",
		"Not a heading at all",
	} {
		if _, ok := ParseHeading(line, 1); ok {
			t.Errorf("%q was treated as a section", line)
		}
	}
}
