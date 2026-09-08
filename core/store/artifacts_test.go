package store

import (
	"testing"
	"time"
)

var t0 = time.Unix(1_000_000, 0)

func TestUpsertArtifactReturnsAStableID(t *testing.T) {
	s := memStore(t)

	first, err := s.UpsertArtifact("06 - System Design/Fundamentals v3.pdf", t0)
	if err != nil {
		t.Fatal(err)
	}
	second, err := s.UpsertArtifact("06 - System Design/Fundamentals v3.pdf", t0.Add(time.Hour))
	if err != nil {
		t.Fatal(err)
	}

	// The frontend holds this id and sends it back. A fresh id per scan would
	// break every stored position the moment a file was added to a folder.
	if first != second {
		t.Errorf("id changed across scans: %d -> %d", first, second)
	}
}

// Windows hands back both separators and either case for the same file.
// Storing the raw path would create two rows for one document and split its
// history between them.
func TestArtifactPathsAreNormalised(t *testing.T) {
	s := memStore(t)

	a, _ := s.UpsertArtifact("06 - System Design/Notes.pdf", t0)
	b, _ := s.UpsertArtifact(`06 - System Design\notes.pdf`, t0)

	if a != b {
		t.Errorf("the same file got two ids: %d and %d", a, b)
	}
}

func TestArtifactByID(t *testing.T) {
	s := memStore(t)
	id, _ := s.UpsertArtifact("notes/ideas.md", t0)

	got, err := s.ArtifactByID(id)
	if err != nil {
		t.Fatal(err)
	}
	if got.Title != "ideas" || got.Ext != ".md" {
		t.Errorf("got %+v", got)
	}
}

// An id the store does not know is refused rather than guessed at. That is
// what stops a stale or invented id from reaching the filesystem.
func TestUnknownArtifactIDIsRefused(t *testing.T) {
	s := memStore(t)
	if _, err := s.ArtifactByID(9999); err == nil {
		t.Fatal("an unknown id was accepted")
	}
}

func TestArtifactsUnderAPrefix(t *testing.T) {
	s := memStore(t)
	for _, p := range []string{
		"06 - System Design/a.pdf",
		"06 - System Design/b.pdf",
		"02 - Databases/c.pdf",
	} {
		if _, err := s.UpsertArtifact(p, t0); err != nil {
			t.Fatal(err)
		}
	}

	got, err := s.ArtifactsUnder("06 - System Design")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 {
		t.Fatalf("found %d artifacts, want 2: %+v", len(got), got)
	}
}

// A prefix must match on path segments, not as text: "06 - System Design 2"
// starts with "06 - System Design" but is a different folder.
func TestPrefixDoesNotMatchASiblingFolder(t *testing.T) {
	s := memStore(t)
	_, _ = s.UpsertArtifact("06 - System Design/a.pdf", t0)
	_, _ = s.UpsertArtifact("06 - System Design 2/b.pdf", t0)

	got, _ := s.ArtifactsUnder("06 - System Design")
	if len(got) != 1 {
		t.Errorf("found %d, want 1 - a sibling folder matched the prefix: %+v", len(got), got)
	}
}

// A flag, never a delete: the hours recorded against a document were really
// spent, and a file can come back renamed or restored.
func TestMissingArtifactIsFlaggedNotDeleted(t *testing.T) {
	s := memStore(t)
	id, _ := s.UpsertArtifact("gone.pdf", t0)

	if err := s.MarkArtifactMissing(id, t0.Add(time.Hour)); err != nil {
		t.Fatal(err)
	}
	if _, err := s.ArtifactByID(id); err != nil {
		t.Errorf("a missing artifact disappeared from the store: %v", err)
	}
}

// The stored path is what the service opens files by, so it has to be the
// real one. Lowercasing it for lookup and then handing the lowercased form
// back is invisible on Windows, whose filesystem is case-insensitive, and
// fails on every case-sensitive one — which is what CI runs on.
func TestArtifactKeepsItsRealCase(t *testing.T) {
	s := memStore(t)

	const real = "Study guided & notes/06 - System Design/Notes.pdf"
	id, err := s.UpsertArtifact(real, t0)
	if err != nil {
		t.Fatal(err)
	}

	got, err := s.ArtifactByID(id)
	if err != nil {
		t.Fatal(err)
	}
	if got.Path != real {
		t.Errorf("stored path lost its case:\n got  %q\n want %q", got.Path, real)
	}
	if got.Title != "Notes" {
		t.Errorf("title = %q, want %q", got.Title, "Notes")
	}
}
