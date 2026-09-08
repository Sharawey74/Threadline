package workspace

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// careerRoot builds a career folder with a plan file and one ordinary note.
func careerRoot(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	write(t, filepath.Join(dir, PlanFileName), "# plan\n")
	if err := os.MkdirAll(filepath.Join(dir, "notes"), 0o750); err != nil {
		t.Fatal(err)
	}
	write(t, filepath.Join(dir, "notes", "ideas.md"), "# ideas\n")
	return dir
}

func write(t *testing.T, path, body string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
}

func open(t *testing.T, dir string) *Root {
	t.Helper()
	r, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	return r
}

func TestOpenResolvesTheRootAndPlanFile(t *testing.T) {
	dir := careerRoot(t)
	r := open(t, dir)

	if !filepath.IsAbs(r.Dir()) {
		t.Errorf("Dir() = %q, want absolute", r.Dir())
	}
	if filepath.Base(r.PlanFile()) != PlanFileName {
		t.Errorf("PlanFile() = %q", r.PlanFile())
	}
}

func TestOpenRejectsAFile(t *testing.T) {
	dir := t.TempDir()
	file := filepath.Join(dir, "not-a-folder.md")
	write(t, file, "x")

	if _, err := Open(file); !errors.Is(err, ErrNotADirectory) {
		t.Fatalf("err = %v, want ErrNotADirectory", err)
	}
}

// A career folder without a plan file is a valid state the UI must report,
// not a startup failure.
func TestOpenSucceedsWithoutAPlanFile(t *testing.T) {
	r, err := Open(t.TempDir())
	if err != nil {
		t.Fatalf("empty career folder rejected: %v", err)
	}
	if filepath.Base(r.PlanFile()) != PlanFileName {
		t.Errorf("PlanFile() = %q", r.PlanFile())
	}
}

// The whole point of the package: C3 depends on this answer being right.
func TestIsPlanFile(t *testing.T) {
	dir := careerRoot(t)
	r := open(t, dir)

	tests := []struct {
		name string
		path string
		want bool
	}{
		{"the plan file", filepath.Join(dir, PlanFileName), true},
		{"an ordinary note", filepath.Join(dir, "notes", "ideas.md"), false},
		{"a file that does not exist", filepath.Join(dir, "nothing.md"), false},
		{
			// A different TASKS.md deeper in the tree is not the plan file.
			// Matching on name alone would make every one of them unwritable.
			name: "a same-named file in a subfolder",
			path: filepath.Join(dir, "notes", PlanFileName),
			want: false,
		},
	}

	write(t, filepath.Join(dir, "notes", PlanFileName), "# not the plan\n")

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := r.IsPlanFile(tt.path); got != tt.want {
				t.Errorf("IsPlanFile(%q) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}

// Windows filesystems are case-insensitive: "tasks.md" and "TASKS.md" are the
// same file. Treating them as different would leave the plan file writable
// under a differently-cased name.
func TestIsPlanFileIgnoresCase(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("case-insensitive comparison only matters where the filesystem is")
	}
	dir := careerRoot(t)
	r := open(t, dir)

	if !r.IsPlanFile(filepath.Join(dir, "tasks.md")) {
		t.Error("a differently-cased plan file was treated as an ordinary document")
	}
}

// A junction or OneDrive folder gives the same file two paths. Comparing
// unresolved strings would let the plan file look like an ordinary document
// under its other name - and therefore be writable.
func TestIsPlanFileThroughASymlink(t *testing.T) {
	dir := careerRoot(t)
	link := filepath.Join(t.TempDir(), "linked-career")
	if err := os.Symlink(dir, link); err != nil {
		t.Skipf("cannot create symlinks here: %v", err)
	}

	r := open(t, dir)
	if !r.IsPlanFile(filepath.Join(link, PlanFileName)) {
		t.Error("the plan file reached through a symlink was not recognised")
	}
}

func TestResolveRelativePaths(t *testing.T) {
	dir := careerRoot(t)
	r := open(t, dir)

	got, err := r.Resolve("notes/ideas.md")
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(got) != "ideas.md" {
		t.Errorf("Resolve() = %q", got)
	}
}

// The frontend sends ids, not paths, so this should be unreachable. It is
// checked anyway: "should be unreachable" is not a property worth trusting on
// the one code path that writes to disk.
func TestResolveRefusesEscapes(t *testing.T) {
	r := open(t, careerRoot(t))

	for _, rel := range []string{
		"../outside.md",
		"notes/../../outside.md",
		"..",
	} {
		t.Run(rel, func(t *testing.T) {
			if _, err := r.Resolve(rel); !errors.Is(err, ErrOutsideRoot) {
				t.Errorf("Resolve(%q) err = %v, want ErrOutsideRoot", rel, err)
			}
		})
	}
}

// "Career-old" starts with "Career" as text but is a different folder. A
// string-prefix containment check would accept it.
func TestSiblingFolderIsNotInsideTheRoot(t *testing.T) {
	parent := t.TempDir()
	inside := filepath.Join(parent, "Career")
	sibling := filepath.Join(parent, "Career-old")
	for _, d := range []string{inside, sibling} {
		if err := os.MkdirAll(d, 0o750); err != nil {
			t.Fatal(err)
		}
	}
	write(t, filepath.Join(sibling, "notes.md"), "x")

	r := open(t, inside)
	if r.contains(filepath.Join(sibling, "notes.md")) {
		t.Error("a sibling folder sharing a name prefix was treated as inside the root")
	}
}
