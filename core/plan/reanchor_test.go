package plan

import "testing"

func TestReAnchorExactMatch(t *testing.T) {
	items := []Item{item("September", "ISTQB study", RoleSchedule)}
	AssignAnchors(items)

	matches := ReAnchor([]AnchorState{stateOf(items[0])}, items)
	if len(matches) != 1 || matches[0].Kind != MatchExact {
		t.Fatalf("got %+v, want one exact match", matches)
	}
}

// An edited line is the same task. History migrates rather than restarting.
func TestReAnchorMigratesHistoryOnReword(t *testing.T) {
	before := []Item{item("September", "ISTQB study - syllabus chapters 1 to 4", RoleSchedule)}
	AssignAnchors(before)
	prev := []AnchorState{stateOf(before[0])}

	after := []Item{item("September", "ISTQB study - syllabus chapters 1 to 5", RoleSchedule)}
	AssignAnchors(after)

	matches := ReAnchor(prev, after)
	if len(matches) != 1 {
		t.Fatalf("got %d matches, want 1", len(matches))
	}
	if matches[0].Kind != MatchReworded {
		t.Errorf("kind = %v, want reworded (similarity %.2f)", matches[0].Kind, matches[0].Similarity)
	}
}

// A genuinely different task must NOT absorb another's history.
func TestReAnchorDoesNotMatchUnrelatedText(t *testing.T) {
	before := []Item{item("September", "ISTQB study - syllabus chapters", RoleSchedule)}
	AssignAnchors(before)
	prev := []AnchorState{stateOf(before[0])}

	after := []Item{item("September", "Refresh CV and LinkedIn profile", RoleSchedule)}
	AssignAnchors(after)

	kinds := map[MatchKind]int{}
	for _, m := range ReAnchor(prev, after) {
		kinds[m.Kind]++
	}
	if kinds[MatchOrphaned] != 1 || kinds[MatchNew] != 1 {
		t.Errorf("got %v, want one orphaned and one new", kinds)
	}
}

// THE FIX. Renaming a heading changes every anchor beneath it, and a fuzzy pass
// confined to the section cannot recover any of them. Without the widened
// fallback every item here orphans at once and its stored hours detach.
func TestSectionRenameDoesNotOrphanEveryItem(t *testing.T) {
	before := []Item{
		item("Now -> Sun 30 Aug", "Delete the duplicate pages", RoleSchedule),
		item("Now -> Sun 30 Aug", "Notes track topics 1 and 2", RoleSchedule),
		item("Now -> Sun 30 Aug", "Shortlist open-source repos", RoleSchedule),
	}
	AssignAnchors(before)
	prev := make([]AnchorState, len(before))
	for i, b := range before {
		prev[i] = stateOf(b)
	}

	// Same three tasks, heading renamed.
	after := []Item{
		item("Week 1 -> Sun 30 Aug", "Delete the duplicate pages", RoleSchedule),
		item("Week 1 -> Sun 30 Aug", "Notes track topics 1 and 2", RoleSchedule),
		item("Week 1 -> Sun 30 Aug", "Shortlist open-source repos", RoleSchedule),
	}
	AssignAnchors(after)

	matches := ReAnchor(prev, after)
	kinds := map[MatchKind]int{}
	for _, m := range matches {
		kinds[m.Kind]++
	}

	if kinds[MatchOrphaned] > 0 {
		t.Errorf("%d items orphaned by a heading rename", kinds[MatchOrphaned])
	}
	if kinds[MatchMoved] != 3 {
		t.Errorf("moved = %d, want 3 (widened fallback did not fire)", kinds[MatchMoved])
	}
	for _, m := range matches {
		if m.Kind == MatchMoved && m.Detail == "" {
			t.Error("a moved item recorded no explanation")
		}
	}
}

// The fallback must stay narrow. One deleted item is a deletion, not a rename,
// and must not go hunting through the whole document for a replacement.
func TestSingleDeletionDoesNotTriggerWidening(t *testing.T) {
	before := []Item{
		item("September", "ISTQB study", RoleSchedule),
		item("September", "OSS PR number one", RoleSchedule),
	}
	AssignAnchors(before)
	prev := make([]AnchorState, len(before))
	for i, b := range before {
		prev[i] = stateOf(b)
	}

	after := []Item{item("September", "ISTQB study", RoleSchedule)}
	AssignAnchors(after)

	kinds := map[MatchKind]int{}
	for _, m := range ReAnchor(prev, after) {
		kinds[m.Kind]++
	}
	if kinds[MatchOrphaned] != 1 {
		t.Errorf("orphaned = %d, want 1 - a deletion is not a rename", kinds[MatchOrphaned])
	}
}

// The store never destroys history because a file changed.
func TestOrphansAreRetainedNotDeleted(t *testing.T) {
	before := []Item{item("September", "Abandoned task", RoleSchedule)}
	AssignAnchors(before)

	matches := ReAnchor([]AnchorState{stateOf(before[0])}, nil)
	if len(matches) != 1 || matches[0].Kind != MatchOrphaned {
		t.Fatalf("got %+v, want one orphaned", matches)
	}
	if matches[0].Previous == nil {
		t.Error("orphan lost its stored anchor")
	}
	if matches[0].Detail == "" {
		t.Error("orphan recorded no explanation")
	}
}

func TestSimilarity(t *testing.T) {
	if s := similarity("ISTQB study chapters", "ISTQB study chapters"); s != 1 {
		t.Errorf("identical text similarity = %v, want 1", s)
	}
	if s := similarity("ISTQB study chapters", "Refresh CV LinkedIn"); s >= similarityThreshold {
		t.Errorf("unrelated text similarity = %v, above threshold", s)
	}
	if s := similarity("", "anything"); s != 0 {
		t.Errorf("empty similarity = %v, want 0", s)
	}
}
