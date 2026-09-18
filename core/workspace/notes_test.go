package workspace

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Sharawey74/Threadline/core/scan"
)

func notesPath(dir string) string {
	return filepath.Join(dir, scan.StudyDir, "06 - System Design", "paper.notes.md")
}

func TestNoteLandsUnderItsSectionHeading(t *testing.T) {
	svc, dir := workspace(t)
	id := pdfID(t, svc)
	path := notesPath(dir)

	// No notes file yet: the first note creates it, with its heading.
	if err := svc.AppendNote(id, "Indexes", "B-trees keep keys sorted."); err != nil {
		t.Fatal(err)
	}
	got, _ := os.ReadFile(path)
	if want := "# Notes\n\n## Indexes\n\nB-trees keep keys sorted.\n"; string(got) != want {
		t.Fatalf("new notes file =\n%q\nwant\n%q", got, want)
	}

	// An existing file: the note goes at the end of its own section, and the
	// bytes around it do not move.
	existing := "# Notes\n\n## Preface\n\nread first\n\n## Indexes\n\nB-trees keep keys sorted.\n\n## Joins\n\nhash join\n"
	write(t, path, existing)
	if err := svc.AppendNote(id, "Indexes", "LSM trees write sequentially."); err != nil {
		t.Fatal(err)
	}
	got, _ = os.ReadFile(path)
	at := strings.Index(existing, "## Joins")
	want := existing[:at] + "LSM trees write sequentially.\n\n" + existing[at:]
	if string(got) != want {
		t.Fatalf("after append =\n%q\nwant\n%q", got, want)
	}

	// A heading that is absent is added at the end; nothing before it moves.
	before := string(got)
	if err := svc.AppendNote(id, "Sorting", "external merge sort"); err != nil {
		t.Fatal(err)
	}
	got, _ = os.ReadFile(path)
	if want := before + "\n## Sorting\n\nexternal merge sort\n"; string(got) != want {
		t.Fatalf("after new heading =\n%q\nwant\n%q", got, want)
	}

	// The last section, with no blank line or newline at the end of the file.
	write(t, path, "# Notes\n\n## Joins\n\nhash join")
	if err := svc.AppendNote(id, "Joins", "merge join"); err != nil {
		t.Fatal(err)
	}
	got, _ = os.ReadFile(path)
	if want := "# Notes\n\n## Joins\n\nhash join\n\nmerge join\n"; string(got) != want {
		t.Fatalf("append to the last section =\n%q\nwant\n%q", got, want)
	}

	// A file the user wrote by hand, in no standard layout: prose above the
	// first heading, CRLF lines, a heading with two spaces and trailing
	// spaces, no blank line after a heading, runs of blank lines, and a
	// sub-heading inside a section. Only the insertion may change it.
	messy := "Read these first.\r\n\r\n##  Joins  \r\nhash join\n\n\n## Indexes\nB-trees.\n### sub\ndetail   \n\n\n## Sorting\nmerge\n"
	for _, tc := range []struct {
		section, text, before string
	}{
		// Under Indexes: after its sub-heading, before Sorting.
		{"Indexes", "LSM trees.", "## Sorting"},
		// The two-space heading is still Joins.
		{"Joins", "merge join", "## Indexes"},
	} {
		write(t, path, messy)
		if err := svc.AppendNote(id, tc.section, tc.text); err != nil {
			t.Fatal(err)
		}
		got, _ = os.ReadFile(path)
		at := strings.Index(messy, tc.before)
		if want := messy[:at] + tc.text + "\n\n" + messy[at:]; string(got) != want {
			t.Errorf("append to %s in a hand-written file =\n%q\nwant\n%q", tc.section, got, want)
		}
	}

	// A new heading goes after everything, and everything before it stays.
	write(t, path, messy)
	if err := svc.AppendNote(id, "Graphs", "BFS"); err != nil {
		t.Fatal(err)
	}
	got, _ = os.ReadFile(path)
	if want := messy + "\n## Graphs\n\nBFS\n"; string(got) != want {
		t.Errorf("new heading in a hand-written file =\n%q\nwant\n%q", got, want)
	}
}

func TestNoteCannotBreakTheNotesFile(t *testing.T) {
	svc, dir := workspace(t)
	id := pdfID(t, svc)

	// A note line that looks like a heading would start a new section.
	if err := svc.AppendNote(id, "Indexes", "first\n## Joins\nsecond"); err != nil {
		t.Fatal(err)
	}
	got, _ := os.ReadFile(notesPath(dir))
	if strings.Count(string(got), "\n## ") != 1 {
		t.Errorf("a note created a heading:\n%s", got)
	}

	for _, tc := range [][2]string{{"", "text"}, {"Indexes", "  \n "}} {
		if err := svc.AppendNote(id, tc[0], tc[1]); err == nil {
			t.Errorf("AppendNote(%q, %q) succeeded, want refused", tc[0], tc[1])
		}
	}
	if err := svc.AppendNote(id+1000, "Indexes", "text"); err == nil {
		t.Error("a note was written for an unknown artifact")
	}
}
