package plan

import (
	"os"
	"path/filepath"
	"testing"
)

// careerRoot builds a miniature career folder: two topic folders, a PDF inside
// one, and a loose file at the root.
func careerRoot(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	for _, dir := range []string{
		"Study guided & notes/02 - Databases & Storage",
		"Study guided & notes/06 - System Design",
	} {
		if err := os.MkdirAll(filepath.Join(root, dir), 0o750); err != nil {
			t.Fatal(err)
		}
	}
	writeFile(t, filepath.Join(root, "Study guided & notes/06 - System Design/Fundamentals v3.pdf"))
	writeFile(t, filepath.Join(root, "TASKS.md"))
	return root
}

func writeFile(t *testing.T, path string) {
	t.Helper()
	if err := os.WriteFile(path, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
}

// Schema §4.4.
func TestResolve(t *testing.T) {
	r := &Resolver{Root: careerRoot(t)}

	tests := []struct {
		name string
		span string
		kind LinkKind
	}{
		{
			// Found by basename search, not a direct path - this is how the
			// curriculum items in the real file link to their folders.
			name: "topic folder resolves by basename",
			span: "02 - Databases & Storage",
			kind: LinkFolder,
		},
		{
			name: "full relative path resolves directly",
			span: "Study guided & notes/06 - System Design",
			kind: LinkFolder,
		},
		{
			name: "file resolves to a file, not a folder",
			span: "TASKS.md",
			kind: LinkFile,
		},
		{
			name: "nested file resolves by basename",
			span: "Fundamentals v3.pdf",
			kind: LinkFile,
		},
		{
			// The case the whole rule exists for. A GitHub search query is not
			// a path and must never be reported as a broken link.
			name: "github search query is a code snippet, not a broken link",
			span: `label:"good first issue" is:open`,
			kind: LinkNone,
		},
		{
			// Path-shaped and genuinely missing. This one SHOULD be visible -
			// a link that stops working must not vanish quietly.
			name: "missing but path-shaped is unresolved",
			span: "07 - DevOps, Containers & CI-CD",
			kind: LinkUnresolved,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := r.Resolve(tt.span)
			if got.Kind != tt.kind {
				t.Errorf("kind = %v (%s), want %v", got.Kind, got.Reason, tt.kind)
			}
			if tt.kind == LinkFolder || tt.kind == LinkFile {
				if got.Target == "" {
					t.Error("resolved link has no target")
				}
			}
			if got.Kind == LinkUnresolved && got.Reason == "" {
				t.Error("unresolved link recorded no reason")
			}
		})
	}
}

// A code snippet and a dead link are different facts and must not be conflated:
// one is noise, the other is the user's link rotting.
func TestSnippetAndDeadLinkAreDistinct(t *testing.T) {
	r := &Resolver{Root: careerRoot(t)}

	snippet := r.Resolve(`label:"good first issue" is:open`)
	if snippet.Kind != LinkNone {
		t.Errorf("snippet kind = %v, want none", snippet.Kind)
	}

	dead := r.Resolve("99 - Deleted Topic")
	if dead.Kind != LinkUnresolved {
		t.Errorf("dead link kind = %v, want unresolved", dead.Kind)
	}
	if snippet.Kind == dead.Kind {
		t.Fatal("a code snippet and a dead link are indistinguishable")
	}
}

// When several spans resolve and exactly one is a folder, that folder is the
// item's project and the files are references.
func TestResolveAllPicksTheFolderAsProject(t *testing.T) {
	r := &Resolver{Root: careerRoot(t)}

	links, project, notes := r.ResolveAll([]string{
		"06 - System Design",
		"Fundamentals v3.pdf",
	})

	if len(links) != 2 {
		t.Fatalf("got %d links, want 2", len(links))
	}
	if project == nil {
		t.Fatal("no project chosen when exactly one folder resolved")
	}
	if project.Kind != LinkFolder {
		t.Errorf("project kind = %v, want folder", project.Kind)
	}
	if len(notes) == 0 {
		t.Error("multiple spans on one line produced no note")
	}
}

// Two folders is genuinely ambiguous. Guessing would attach a session's hours
// to the wrong project, so the parser refuses and says why.
func TestTwoFoldersIsAmbiguousNotGuessed(t *testing.T) {
	r := &Resolver{Root: careerRoot(t)}

	_, project, notes := r.ResolveAll([]string{
		"02 - Databases & Storage",
		"06 - System Design",
	})
	if project != nil {
		t.Errorf("project = %v, want nil for two folders", project.Span)
	}
	if len(notes) == 0 {
		t.Error("ambiguous project produced no note")
	}
}

// Recursive walking does not descend into symlinked directories - the finding
// that forced direct-path-first. Windows needs privileges to create symlinks,
// so the test skips rather than fails when it cannot.
func TestResolvesThroughSymlinkedDirectory(t *testing.T) {
	root := careerRoot(t)
	target := filepath.Join(root, "hidden", "04 - Messaging & Event Streaming")
	if err := os.MkdirAll(target, 0o750); err != nil {
		t.Fatal(err)
	}
	link := filepath.Join(root, "linked")
	if err := os.Symlink(filepath.Join(root, "hidden"), link); err != nil {
		t.Skipf("cannot create symlinks here: %v", err)
	}

	r := &Resolver{Root: root}
	got := r.Resolve("04 - Messaging & Event Streaming")
	if got.Kind != LinkFolder {
		t.Errorf("kind = %v (%s), want folder through the symlink", got.Kind, got.Reason)
	}
}

func TestFindBackticks(t *testing.T) {
	line := "Delete pages in `Study guided & notes` — see `06 - System Design/x.pdf`"
	got := FindBackticks(line)
	if len(got) != 2 {
		t.Fatalf("found %d spans, want 2: %v", len(got), got)
	}
	if got[0] != "Study guided & notes" {
		t.Errorf("first span = %q", got[0])
	}
}
