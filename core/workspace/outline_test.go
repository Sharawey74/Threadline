package workspace

import (
	"bytes"
	"os"
	"path/filepath"
	"slices"
	"strings"
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

func TestReimportPreservesTicksByTitle(t *testing.T) {
	svc, _ := workspace(t)
	id := pdfID(t, svc)

	first := sections("Preface", "Review", "Indexes — Part 1", "Review", "Joins")
	if err := svc.SaveOutline(id, plan.Outline{Sections: first}); err != nil {
		t.Fatal(err)
	}
	// Tick Preface, the second Review and Indexes.
	for _, i := range []int{0, 3, 2} {
		if err := svc.TickSection(id, i, first[i].Title, true); err != nil {
			t.Fatal(err)
		}
	}

	// Re-import in a new order, so no title keeps its old position: ticks
	// must follow titles, not slots. One title retyped with a different dash
	// and spacing; "preface", differing only in case, comes before "Preface"
	// so a case-blind match would hand it Preface's tick.
	second := []plan.OutlineSection{
		{Title: "preface", Page: 1},
		{Title: "Joins", Page: 3},
		{Title: "Review", Page: 7},
		{Title: "Preface", Page: 9},
		{Title: "Sorting", Page: 11},
		{Title: " Indexes – Part 1 ", Page: 12},
		{Title: "Review", Page: 20},
	}
	if err := svc.SaveOutline(id, plan.Outline{Sections: second}); err != nil {
		t.Fatal(err)
	}

	got, err := svc.Outline(id)
	if err != nil {
		t.Fatal(err)
	}
	var ticks []bool
	var pages []int
	for _, s := range got.Outline.Sections {
		ticks = append(ticks, s.Checked)
		pages = append(pages, s.Page)
	}
	// Repeated titles match in order: the first Review was unticked, the
	// second ticked. "preface" and "Sorting" are new.
	wantTicks := []bool{false, false, false, true, false, true, true}
	if !slices.Equal(ticks, wantTicks) {
		t.Errorf("ticks after re-import = %v, want %v", ticks, wantTicks)
	}
	if !slices.Equal(pages, []int{1, 3, 7, 9, 11, 12, 20}) {
		t.Errorf("pages after re-import = %v, want the re-imported pages", pages)
	}
}

func TestTickSectionRefusesAStaleTitle(t *testing.T) {
	svc, dir := workspace(t)
	id := pdfID(t, svc)
	if err := svc.SaveOutline(id, plan.Outline{Sections: sections("Preface", "Indexes")}); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, scan.StudyDir, "06 - System Design", "paper.outline.md")
	before, _ := os.ReadFile(path)

	for _, tc := range []struct {
		index int
		title string
	}{{1, "Preface"}, {2, "Indexes"}, {-1, "Preface"}} {
		if err := svc.TickSection(id, tc.index, tc.title, true); err == nil {
			t.Errorf("TickSection(%d, %q) succeeded, want refused", tc.index, tc.title)
		}
	}
	if after, _ := os.ReadFile(path); !bytes.Equal(after, before) {
		t.Error("a refused tick changed the outline")
	}
}

// outlineFiles lists every outline sidecar under the career root.
func outlineFiles(t *testing.T, dir string) []string {
	t.Helper()
	var found []string
	err := filepath.WalkDir(dir, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() && strings.HasSuffix(d.Name(), ".outline.md") {
			found = append(found, path)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return found
}

func TestScanNeverCreatesOutlines(t *testing.T) {
	svc, dir := workspace(t)

	// Everything a launch, a scan and an open do.
	if _, err := svc.Topics(); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Plan(); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Reconciliation(); err != nil {
		t.Fatal(err)
	}
	id := pdfID(t, svc)
	if _, err := svc.ReadArtifact(id); err != nil {
		t.Fatal(err)
	}
	view, err := svc.Outline(id)
	if err != nil {
		t.Fatal(err)
	}
	if view.Exists || view.Progress.Sections != 0 {
		t.Errorf("a PDF with no outline reports %+v", view)
	}
	if found := outlineFiles(t, dir); len(found) != 0 {
		t.Fatalf("outlines exist before any import: %v", found)
	}

	if err := svc.SaveOutline(id, plan.Outline{Sections: sections("Preface")}); err != nil {
		t.Fatal(err)
	}
	if found := outlineFiles(t, dir); len(found) != 1 {
		t.Errorf("after one import, outlines = %v, want exactly one", found)
	}
}

// Two identical lines have the same anchor, so the one-byte path cannot tell
// them apart: ticking the second would tick the first. Such an outline is
// refused on save, and a hand-edited one is refused on tick.
func TestIdenticalSectionsAreRefusedRatherThanMisticked(t *testing.T) {
	svc, dir := workspace(t)
	id := pdfID(t, svc)

	twice := []plan.OutlineSection{{Title: "Review", Page: 7}, {Title: "Review", Page: 7}}
	if err := svc.SaveOutline(id, plan.Outline{Sections: twice}); err == nil {
		t.Error("an outline with two identical sections was saved")
	}

	// The same title on different pages is fine.
	if err := svc.SaveOutline(id, plan.Outline{Sections: []plan.OutlineSection{
		{Title: "Review", Page: 7}, {Title: "Review", Page: 20},
	}}); err != nil {
		t.Fatalf("repeated title on different pages refused: %v", err)
	}

	// A hand-edited file with a duplicate: ticking either is refused, and the
	// file does not change.
	path := filepath.Join(dir, scan.StudyDir, "06 - System Design", "paper.outline.md")
	write(t, path, "# Outline\n\n- [ ] Review — p.7\n- [ ] Review — p.7\n")
	before, _ := os.ReadFile(path)
	if err := svc.TickSection(id, 1, "Review", true); err == nil {
		t.Error("ticking one of two identical sections succeeded")
	}
	if after, _ := os.ReadFile(path); !bytes.Equal(after, before) {
		t.Errorf("a refused tick changed the outline:\n%s", after)
	}
}
