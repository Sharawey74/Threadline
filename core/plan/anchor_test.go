package plan

import "testing"

func item(section, text string, role Role) Item {
	return Item{Section: section, Text: text, Role: role}
}

func stateOf(i Item) AnchorState {
	return AnchorState{Anchor: i.Anchor, Role: i.Role, Section: i.Section, Text: i.Text}
}

// Schema §5: identity comes from text, not position.
func TestAnchorIsPositionIndependent(t *testing.T) {
	a := Anchor(RoleSchedule, "September", "ISTQB study - chapters 1-4")
	b := Anchor(RoleSchedule, "September", "ISTQB study - chapters 1-4")
	if a != b {
		t.Fatal("same item hashed differently")
	}
	if len(a) != 16 {
		t.Errorf("anchor length = %d, want 16", len(a))
	}
}

// Re-estimating a task is not a different task. If hours were part of the hash,
// every re-estimate would detach the hours already recorded against it.
func TestAnchorIgnoresHourChanges(t *testing.T) {
	before := Anchor(RoleSchedule, "September", "**Notes track — 15h** (topics 1 and 2)")
	after := Anchor(RoleSchedule, "September", "**Notes track — 25h** (topics 1 and 2)")
	if before != after {
		t.Error("changing an estimate produced a different anchor")
	}
}

func TestAnchorDistinguishesSectionAndRole(t *testing.T) {
	base := Anchor(RoleSchedule, "September", "Notes track")
	if Anchor(RoleSchedule, "October", "Notes track") == base {
		t.Error("same text in different sections shares an anchor")
	}
	if Anchor(RoleAdmin, "September", "Notes track") == base {
		t.Error("same text with different roles shares an anchor")
	}
}

// The evidence run found no collisions, but that is a fact about one file, not
// a property of the scheme.
func TestDuplicateTextGetsDistinctAnchors(t *testing.T) {
	items := []Item{
		item("September", "Review notes", RoleSchedule),
		item("September", "Review notes", RoleSchedule),
	}
	AssignAnchors(items)

	if items[0].Anchor == items[1].Anchor {
		t.Fatal("two identical lines in one section share an anchor")
	}
	if len(items[1].Notes) == 0 {
		t.Error("the disambiguated duplicate recorded no note")
	}
}
