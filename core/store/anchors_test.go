package store

import (
	"testing"
	"time"

	"github.com/Sharawey74/Threadline/core/plan"
)

func anchorState(id, section, text string) plan.AnchorState {
	return plan.AnchorState{
		Anchor: id, Role: plan.RoleSchedule, Section: section, Text: text,
	}
}

func TestUpsertAndReadAnchors(t *testing.T) {
	s := memStore(t)
	now := time.Unix(1_000_000, 0)

	if err := s.UpsertAnchor(anchorState("aaa", "September", "ISTQB study"), now); err != nil {
		t.Fatal(err)
	}

	got, err := s.Anchors()
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Fatalf("read %d anchors, want 1", len(got))
	}
	if got[0].Anchor != "aaa" || got[0].Section != "September" {
		t.Errorf("round-tripped wrong: %+v", got[0])
	}
	if got[0].Role != plan.RoleSchedule {
		t.Errorf("role = %v, want schedule", got[0].Role)
	}
}

// An item the user has worked on for weeks must not look new because it was
// reworded. first_seen is what "going cold" is measured against.
func TestUpsertPreservesFirstSeen(t *testing.T) {
	s := memStore(t)
	first := time.Unix(1_000_000, 0)
	later := first.Add(72 * time.Hour)

	if err := s.UpsertAnchor(anchorState("aaa", "September", "ISTQB study"), first); err != nil {
		t.Fatal(err)
	}
	if err := s.UpsertAnchor(anchorState("aaa", "September", "ISTQB study, chapters 1-4"), later); err != nil {
		t.Fatal(err)
	}

	var firstSeen, lastSeen int64
	if err := s.DB().QueryRow(
		`SELECT first_seen, last_seen FROM item_anchor WHERE anchor = 'aaa'`,
	).Scan(&firstSeen, &lastSeen); err != nil {
		t.Fatal(err)
	}
	if firstSeen != first.Unix() {
		t.Errorf("first_seen moved: %d, want %d", firstSeen, first.Unix())
	}
	if lastSeen != later.Unix() {
		t.Errorf("last_seen = %d, want %d", lastSeen, later.Unix())
	}
}

// Schema §5: the store never destroys history because a file changed.
func TestOrphaningIsAFlagNotADelete(t *testing.T) {
	s := memStore(t)
	now := time.Unix(1_000_000, 0)

	if err := s.UpsertAnchor(anchorState("aaa", "September", "Abandoned task"), now); err != nil {
		t.Fatal(err)
	}
	if err := s.MarkOrphaned("aaa", now.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}

	orphaned, err := s.IsOrphaned("aaa")
	if err != nil {
		t.Fatal(err)
	}
	if !orphaned {
		t.Error("anchor was not marked orphaned")
	}

	// Still readable, and still a re-anchoring candidate.
	got, _ := s.Anchors()
	if len(got) != 1 {
		t.Fatalf("orphaned anchor disappeared from the store: %d rows", len(got))
	}
}

// An orphan that reappears is no longer an orphan. Without clearing the flag,
// an item reworded back to its original text would stay marked as gone.
func TestReappearingAnchorIsNoLongerOrphaned(t *testing.T) {
	s := memStore(t)
	now := time.Unix(1_000_000, 0)

	_ = s.UpsertAnchor(anchorState("aaa", "September", "ISTQB study"), now)
	_ = s.MarkOrphaned("aaa", now.Add(time.Hour))
	_ = s.UpsertAnchor(anchorState("aaa", "September", "ISTQB study"), now.Add(2*time.Hour))

	orphaned, err := s.IsOrphaned("aaa")
	if err != nil {
		t.Fatal(err)
	}
	if orphaned {
		t.Error("an anchor that came back is still flagged as orphaned")
	}
}

func TestHistoryIsAppendOnlyAndOrdered(t *testing.T) {
	s := memStore(t)
	now := time.Unix(1_000_000, 0)
	_ = s.UpsertAnchor(anchorState("aaa", "September", "ISTQB study"), now)

	for i, ev := range []string{"created", "checked", "unchecked"} {
		if err := s.RecordEvent("aaa", ev, "", now.Add(time.Duration(i)*time.Minute)); err != nil {
			t.Fatal(err)
		}
	}

	events, err := s.History("aaa")
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 3 {
		t.Fatalf("got %d events, want 3", len(events))
	}
	for i, want := range []string{"created", "checked", "unchecked"} {
		if events[i].Event != want {
			t.Errorf("event %d = %q, want %q", i, events[i].Event, want)
		}
	}
}

// Orphaning writes a history entry, so "when did this leave the file" is
// answerable later.
func TestOrphaningRecordsAnEvent(t *testing.T) {
	s := memStore(t)
	now := time.Unix(1_000_000, 0)
	_ = s.UpsertAnchor(anchorState("aaa", "September", "Abandoned"), now)
	_ = s.MarkOrphaned("aaa", now.Add(time.Hour))

	events, _ := s.History("aaa")
	if len(events) != 1 || events[0].Event != "orphaned" {
		t.Fatalf("orphaning left no history entry: %+v", events)
	}
	if events[0].Detail == "" {
		t.Error("orphan event recorded no reason")
	}
}

// Orphaning twice must not append a second event - the item left the file once.
func TestOrphaningIsIdempotent(t *testing.T) {
	s := memStore(t)
	now := time.Unix(1_000_000, 0)
	_ = s.UpsertAnchor(anchorState("aaa", "September", "Abandoned"), now)

	_ = s.MarkOrphaned("aaa", now.Add(time.Hour))
	_ = s.MarkOrphaned("aaa", now.Add(2*time.Hour))

	events, _ := s.History("aaa")
	if len(events) != 1 {
		t.Errorf("got %d orphan events, want 1", len(events))
	}
}
