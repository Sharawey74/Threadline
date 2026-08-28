package scan

import (
	"os"
	"path/filepath"
	"testing"
)

func root(t *testing.T, dirs ...string) string {
	t.Helper()
	r := t.TempDir()
	for _, d := range dirs {
		if err := os.MkdirAll(filepath.Join(r, StudyDir, d), 0o750); err != nil {
			t.Fatal(err)
		}
	}
	return r
}

// Schema §4.6: "NN - Name" directories are topics, and the numeric prefix is
// the canonical order.
func TestTopics(t *testing.T) {
	r := root(t,
		"02 - Databases & Storage",
		"06 - System Design",
		"09 - AI",
	)

	got, err := Topics(r)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 {
		t.Fatalf("found %d topics, want 3", len(got))
	}
	if got[0].Order != 2 || got[0].Slug != "02 - Databases & Storage" {
		t.Errorf("first topic = %+v", got[0])
	}
	if got[2].Order != 9 {
		t.Errorf("last topic order = %d, want 9", got[2].Order)
	}
}

// Folders that are not numbered topics must not become topics - counting an
// _Archive folder as a topic would break the reconciliation check against the
// plan's declared topic count.
func TestTopicsIgnoresUnnumberedFolders(t *testing.T) {
	r := root(t,
		"02 - Databases & Storage",
		"_Archive",
		"scratch notes",
		"1 - Single digit prefix",
	)

	got, err := Topics(r)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Fatalf("found %d topics, want 1: %+v", len(got), got)
	}
	if got[0].Order != 2 {
		t.Errorf("order = %d, want 2", got[0].Order)
	}
}

// A file named like a topic is not a topic.
func TestTopicsIgnoresFiles(t *testing.T) {
	r := root(t, "02 - Databases & Storage")
	if err := os.WriteFile(filepath.Join(r, StudyDir, "07 - Notes.md"), []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}

	got, _ := Topics(r)
	if len(got) != 1 {
		t.Errorf("found %d topics, want 1 - a file was counted", len(got))
	}
}

// A missing study folder is not an error. Reconciliation reporting "0 topics
// vs 9 declared" is more useful than a failure that stops the whole scan.
func TestMissingStudyFolderIsNotAnError(t *testing.T) {
	got, err := Topics(t.TempDir())
	if err != nil {
		t.Fatalf("missing study folder returned an error: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("found %d topics in an empty root", len(got))
	}
}

func TestMaterial(t *testing.T) {
	r := root(t, "06 - System Design")
	dir := filepath.Join(r, StudyDir, "06 - System Design")
	for _, name := range []string{
		"Fundamentals v3.pdf",
		"Interview Q&A.pdf",
		"Lab.html",
		"thumbs.db", // not a known material type
		".gitkeep",  // not a known material type
	} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if err := os.MkdirAll(filepath.Join(dir, "_Archive"), 0o750); err != nil {
		t.Fatal(err)
	}

	got, err := Material(r, "06 - System Design")
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 {
		t.Errorf("found %d material files, want 3 (pdf, pdf, html): %v", len(got), got)
	}
	for _, name := range got {
		if name == "_Archive" {
			t.Error("a directory was listed as material")
		}
	}
}
