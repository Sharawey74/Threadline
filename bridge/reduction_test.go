package bridge

import (
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// The 9 Sep 2026 reduction deleted everything that observed the user: sessions,
// the hours budget, page positions and the in-app PDF viewer (C11). These tests
// hold that deletion in place. A symbol that creeps back is the first line of a
// feature the product decided not to have.

// observationSymbol matches the deleted names as whole words and ignoring case.
// Case matters because each command has two spellings: Go binds SavePosition
// and the frontend calls savePosition. Whole words keep the Wails runtime's own
// WindowGetPosition from being mistaken for the removed GetPosition. The bare
// word "session" is included because the concept is gone, not just the symbols.
var observationSymbol = regexp.MustCompile(
	`(?i)\b(StartSession|EndSession|GetBudgetStatus|SavePosition|GetPosition|PdfViewer|pdfjs-dist|sessions?|session_artifact|artifact_access|item_session|artifact_position)\b`)

// scannedRoots are the directories that ship. frontend/wailsjs is included
// because it is tracked and generated: stale bindings would still declare the
// commands after the bridge stopped binding them.
var scannedRoots = []string{"core", "bridge", filepath.Join("frontend", "src"), filepath.Join("frontend", "wailsjs")}

// droppedTables are the only words a migration may still use. Applied
// migrations are never edited: 001 created these five tables and 003 drops
// them. Nothing else is exempt, so a migration naming a deleted command fails.
var droppedTables = map[string]bool{
	"session": true, "sessions": true, "session_artifact": true,
	"artifact_access": true, "item_session": true, "artifact_position": true,
}

var migrationsDir = filepath.Join("core", "store", "migrations")

func TestNoObservationSymbolsRemainInSource(t *testing.T) {
	repo := filepath.Join("..")

	for _, root := range scannedRoots {
		err := filepath.WalkDir(filepath.Join(repo, root), func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			rel, _ := filepath.Rel(repo, path)
			if d.IsDir() {
				// Go's testdata directories hold fixtures, not source: the plan
				// fixture mirrors a real plan file that still says "session".
				if d.Name() == "testdata" {
					return filepath.SkipDir
				}
				return nil
			}
			if isTestFile(d.Name()) {
				return nil
			}
			inMigrations := filepath.Dir(rel) == migrationsDir

			src, err := os.ReadFile(path) // #nosec G304 -- walking the repo's own source tree
			if err != nil {
				return err
			}
			for i, line := range strings.Split(string(src), "\n") {
				for _, m := range observationSymbol.FindAllString(line, -1) {
					if inMigrations && droppedTables[strings.ToLower(m)] {
						continue
					}
					t.Errorf("%s:%d still references %s", filepath.ToSlash(rel), i+1, m)
				}
			}
			return nil
		})
		if err != nil {
			t.Fatalf("walk %s: %v", root, err)
		}
	}
}

func TestPdfjsIsNotADependency(t *testing.T) {
	for _, name := range []string{"package.json", "package-lock.json"} {
		path := filepath.Join("..", "frontend", name)
		src, err := os.ReadFile(path) // #nosec G304 -- a fixed path inside the repo
		if err != nil {
			t.Fatalf("read %s: %v", name, err)
		}
		if strings.Contains(string(src), `"pdfjs-dist"`) || strings.Contains(string(src), "node_modules/pdfjs-dist") {
			t.Errorf("frontend/%s still lists pdfjs-dist", name)
		}
	}
}

// isTestFile reports whether a file is a test rather than shipped source. The
// tests guarding the deletion necessarily name what was deleted.
func isTestFile(name string) bool {
	return strings.HasSuffix(name, "_test.go") ||
		strings.HasSuffix(name, ".test.ts") ||
		strings.HasSuffix(name, ".test.tsx")
}
