package workspace

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Sharawey74/Threadline/core/scan"
	"github.com/Sharawey74/Threadline/core/store"
)

// workspace builds a career folder with a plan file, a topic, a note and a PDF,
// wired to an in-memory store.
func workspace(t *testing.T) (*Service, string) {
	t.Helper()

	dir := t.TempDir()
	topic := filepath.Join(dir, scan.StudyDir, "06 - System Design")
	if err := os.MkdirAll(topic, 0o750); err != nil {
		t.Fatal(err)
	}

	write(t, filepath.Join(dir, PlanFileName), planFixture)
	write(t, filepath.Join(topic, "notes.md"), "# Notes\n\noriginal\n")
	write(t, filepath.Join(topic, "paper.pdf"), "%PDF-1.4 binary-ish\n")

	root, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	st, err := store.OpenMemory()
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = st.Close() })

	svc := NewService(root, st, filepath.Join(t.TempDir(), "snapshots"))
	svc.now = func() time.Time { return time.Unix(1_000_000, 0) }
	return svc, dir
}

const planFixture = `# Plan

## 9. Now -> Sun 30 Aug *(2h)*

- [ ] First task — *2h*
`

func TestPlanParses(t *testing.T) {
	svc, _ := workspace(t)

	p, err := svc.Plan()
	if err != nil {
		t.Fatal(err)
	}
	if len(p.Items) != 1 {
		t.Fatalf("parsed %d items, want 1", len(p.Items))
	}
}

func TestMaterialRegistersFilesWithStableIDs(t *testing.T) {
	svc, _ := workspace(t)

	first, err := svc.Material("06 - System Design")
	if err != nil {
		t.Fatal(err)
	}
	if len(first) != 2 {
		t.Fatalf("found %d files, want 2: %+v", len(first), first)
	}

	second, _ := svc.Material("06 - System Design")
	if first[0].ID != second[0].ID {
		t.Errorf("id changed between scans: %d -> %d", first[0].ID, second[0].ID)
	}
}

func TestReadArtifactEncodesByKind(t *testing.T) {
	svc, _ := workspace(t)
	files, _ := svc.Material("06 - System Design")

	byExt := map[string]int64{}
	for _, f := range files {
		byExt[f.Ext] = f.ID
	}

	md, err := svc.ReadArtifact(byExt[".md"])
	if err != nil {
		t.Fatal(err)
	}
	if md.Kind != "markdown" || !bytes.Contains([]byte(md.Body), []byte("original")) {
		t.Errorf("markdown came back as %+v", md)
	}

	pdf, err := svc.ReadArtifact(byExt[".pdf"])
	if err != nil {
		t.Fatal(err)
	}
	// PDFs are binary and cannot cross a JSON boundary as text.
	if pdf.Kind != "pdf" || pdf.Body == "" {
		t.Errorf("pdf came back as %+v", pdf)
	}
	if bytes.Contains([]byte(pdf.Body), []byte("%PDF")) {
		t.Error("pdf body was not base64-encoded")
	}
}

func TestWriteArtifactSavesMarkdown(t *testing.T) {
	svc, dir := workspace(t)
	files, _ := svc.Material("06 - System Design")

	var id int64
	for _, f := range files {
		if f.Ext == ".md" {
			id = f.ID
		}
	}

	if err := svc.WriteArtifact(id, "# Notes\n\nedited\n"); err != nil {
		t.Fatal(err)
	}

	on := filepath.Join(dir, scan.StudyDir, "06 - System Design", "notes.md")
	got, _ := os.ReadFile(on)
	if string(got) != "# Notes\n\nedited\n" {
		t.Errorf("file holds %q", string(got))
	}

	// And it round-trips back through the service.
	back, _ := svc.ReadArtifact(id)
	if back.Body != "# Notes\n\nedited\n" {
		t.Errorf("read back %q", back.Body)
	}
}

// THE test for C3. A refusal that still wrote would be the worst outcome, so
// the bytes are checked afterwards rather than trusting the error.
func TestWriteArtifactRefusesThePlanFile(t *testing.T) {
	svc, dir := workspace(t)

	planPath := filepath.Join(dir, PlanFileName)
	before, err := os.ReadFile(planPath)
	if err != nil {
		t.Fatal(err)
	}

	// Register the plan file as an artifact, exactly as a UI bug or a stale id
	// could cause it to be.
	a, err := svc.register(PlanFileName)
	if err != nil {
		t.Fatal(err)
	}
	if !a.IsPlanFile {
		t.Fatal("the plan file was not flagged as such")
	}

	err = svc.WriteArtifact(a.ID, "everything replaced")
	if !errors.Is(err, ErrPlanFileNotWritable) {
		t.Fatalf("err = %v, want ErrPlanFileNotWritable", err)
	}

	after, _ := os.ReadFile(planPath)
	if !bytes.Equal(before, after) {
		t.Fatal("the plan file was modified despite the refusal")
	}
}

// The refusal must not depend on anything the caller supplied. Even if a
// frontend sent IsPlanFile=false, the service re-derives it from the path.
func TestPlanFileRefusalDoesNotTrustTheCaller(t *testing.T) {
	svc, dir := workspace(t)

	// A second registration under a differently-cased path: on Windows this is
	// the same file reached by another name.
	a, err := svc.register("tasks.md")
	if err != nil {
		t.Skipf("cannot register the alternate casing here: %v", err)
	}

	before, _ := os.ReadFile(filepath.Join(dir, PlanFileName))
	err = svc.WriteArtifact(a.ID, "replaced through the other name")
	after, _ := os.ReadFile(filepath.Join(dir, PlanFileName))

	if !bytes.Equal(before, after) {
		t.Fatalf("the plan file was rewritten under a differently-cased name (err = %v)", err)
	}
}

func TestWriteArtifactRefusesNonMarkdown(t *testing.T) {
	svc, _ := workspace(t)
	files, _ := svc.Material("06 - System Design")

	var pdf int64
	for _, f := range files {
		if f.Ext == ".pdf" {
			pdf = f.ID
		}
	}

	if err := svc.WriteArtifact(pdf, "not a pdf any more"); err == nil {
		t.Fatal("a PDF was overwritten with text")
	}
}

func TestWriteArtifactRefusesAnUnknownID(t *testing.T) {
	svc, _ := workspace(t)
	if err := svc.WriteArtifact(9999, "anything"); err == nil {
		t.Fatal("an unknown id was accepted")
	}
}

func TestTickWritesThroughTheByteExactPath(t *testing.T) {
	svc, dir := workspace(t)

	p, err := svc.Plan()
	if err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(filepath.Join(dir, PlanFileName))

	if err := svc.Tick(p.Items[0].Anchor, true); err != nil {
		t.Fatal(err)
	}

	after, _ := os.ReadFile(filepath.Join(dir, PlanFileName))
	if len(after) != len(before) {
		t.Fatalf("file length changed: %d -> %d", len(before), len(after))
	}

	diff := 0
	for i := range before {
		if before[i] != after[i] {
			diff++
		}
	}
	if diff != 1 {
		t.Errorf("%d bytes changed, want 1", diff)
	}
}

func TestTickRefusesAStaleAnchor(t *testing.T) {
	svc, dir := workspace(t)
	before, _ := os.ReadFile(filepath.Join(dir, PlanFileName))

	if err := svc.Tick("0000000000000000", true); err == nil {
		t.Fatal("a stale anchor was accepted")
	}

	after, _ := os.ReadFile(filepath.Join(dir, PlanFileName))
	if !bytes.Equal(before, after) {
		t.Error("the plan file changed despite the stale anchor")
	}
}

func TestReconciliationRuns(t *testing.T) {
	svc, _ := workspace(t)

	checks, err := svc.Reconciliation()
	if err != nil {
		t.Fatal(err)
	}
	if len(checks) == 0 {
		t.Fatal("no checks were generated")
	}
}

func TestPositionRoundTrip(t *testing.T) {
	svc, _ := workspace(t)
	files, _ := svc.Material("06 - System Design")
	id := files[0].ID

	// Never opened: nil, not zero. A viewer told 0 would jump to the top of a
	// document the user was halfway through.
	before, err := svc.Position(id)
	if err != nil {
		t.Fatal(err)
	}
	if before.Page != nil {
		t.Errorf("an unopened document reported page %v", *before.Page)
	}

	if err := svc.SavePosition(id, 41); err != nil {
		t.Fatal(err)
	}
	after, _ := svc.Position(id)
	if after.Page == nil || *after.Page != 41 {
		t.Errorf("position = %+v, want page 41", after)
	}
}

func TestSavePositionRefusesAnUnknownArtifact(t *testing.T) {
	svc, _ := workspace(t)
	if err := svc.SavePosition(9999, 1); err == nil {
		t.Fatal("an unknown artifact id was accepted")
	}
}

// Until sessions record anything, every period must report as unmeasured
// rather than as zero hours (C5).
func TestBudgetReportsUnmeasuredRatherThanZero(t *testing.T) {
	svc, _ := workspace(t)

	b, err := svc.BudgetStatus()
	if err != nil {
		t.Fatal(err)
	}

	if b.AllocatedHours != 2 {
		t.Errorf("allocated = %v, want 2 from the fixture's schedule section", b.AllocatedHours)
	}
	if b.SpentHours != nil {
		t.Errorf("spent = %v, want nil when nothing was recorded", *b.SpentHours)
	}
	if len(b.Periods) != 1 {
		t.Fatalf("got %d periods, want 1", len(b.Periods))
	}
	if b.Periods[0].Measured {
		t.Error("a period was reported measured before any session existed")
	}
	if b.Periods[0].SpentHours != nil {
		t.Error("an unmeasured period reported spent hours")
	}
}

func TestSessionLifecycle(t *testing.T) {
	svc, _ := workspace(t)

	id, err := svc.StartSession("topic", "06 - System Design")
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.EndSession(id, "stuck on consistent hashing", "app_close"); err != nil {
		t.Fatal(err)
	}
	// Closing twice must fail rather than silently reopening a closed session.
	if err := svc.EndSession(id, "", "manual"); err == nil {
		t.Error("a closed session was closed again")
	}
}
