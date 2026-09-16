package workspace

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"

	"github.com/Sharawey74/Threadline/core/plan"
	"github.com/Sharawey74/Threadline/core/scan"
)

// pdfID registers the fixture PDF and returns its id.
func pdfID(t *testing.T, svc *Service) int64 {
	t.Helper()
	files, err := svc.Material("06 - System Design")
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range files {
		if f.Ext == ".pdf" {
			return f.ID
		}
	}
	t.Fatal("fixture has no PDF")
	return 0
}

func sections(titles ...string) []plan.OutlineSection {
	out := make([]plan.OutlineSection, len(titles))
	for i, title := range titles {
		out[i] = plan.OutlineSection{Title: title, Page: i*10 + 1}
	}
	return out
}

func TestImportWritesOutlineBesideTheSource(t *testing.T) {
	svc, dir := workspace(t)
	id := pdfID(t, svc)
	topic := filepath.Join(dir, scan.StudyDir, "06 - System Design")
	source := filepath.Join(topic, "paper.pdf")
	before, _ := os.ReadFile(source)

	err := svc.SaveOutline(id, plan.Outline{Total: 30, Sections: sections("Preface", "Indexes")})
	if err != nil {
		t.Fatal(err)
	}

	written, err := os.ReadFile(filepath.Join(topic, "paper.outline.md"))
	if err != nil {
		t.Fatalf("no outline beside the source: %v", err)
	}
	want := "# Outline\n\nTotal pages: 30\n\n- [ ] Preface — p.1\n- [ ] Indexes — p.11\n"
	if string(written) != want {
		t.Errorf("outline file =\n%s\nwant\n%s", written, want)
	}
	if after, _ := os.ReadFile(source); !bytes.Equal(after, before) {
		t.Error("importing an outline changed the source PDF")
	}

	got, err := svc.Outline(id)
	if err != nil || !got.Exists || len(got.Outline.Sections) != 2 {
		t.Errorf("Outline() = %+v, %v; want the two saved sections", got, err)
	}
}

func TestSaveOutlineCleansTitlesAndRefusesNonPDFs(t *testing.T) {
	svc, dir := workspace(t)
	id := pdfID(t, svc)

	// A title is one line of the file: a newline in it would split the
	// section, and markup would not read back the same.
	err := svc.SaveOutline(id, plan.Outline{Sections: []plan.OutlineSection{{Title: "  B-Trees\n**Part 2**  ", Page: 4}}})
	if err != nil {
		t.Fatal(err)
	}
	got, _ := svc.Outline(id)
	if s := got.Outline.Sections; len(s) != 1 || s[0].Title != "B-Trees Part 2" {
		t.Errorf("saved sections = %+v, want one titled %q", s, "B-Trees Part 2")
	}

	if err := svc.SaveOutline(id, plan.Outline{Sections: []plan.OutlineSection{{Title: "  ", Page: 1}}}); err == nil {
		t.Error("a section with a blank title was saved")
	}

	files, _ := svc.Material("06 - System Design")
	for _, f := range files {
		if f.Ext == ".md" {
			if err := svc.SaveOutline(f.ID, plan.Outline{Sections: sections("A")}); err == nil {
				t.Error("an outline was saved for a markdown file")
			}
		}
	}
	if _, err := os.Stat(filepath.Join(dir, scan.StudyDir, "06 - System Design", "notes.outline.md")); err == nil {
		t.Error("a refused save still wrote a file")
	}
}
