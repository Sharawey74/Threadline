// Package workspace resolves the career folder: where the plan file is, which
// files are artifacts, and which of them is the one that must never be
// rewritten.
//
// It is plain Go and imports no Wails, like everything under core/ (C1).
package workspace

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// PlanFileName is the plan file, by definition: the markdown file at the root
// of the career folder. Everything else is an ordinary document.
const PlanFileName = "TASKS.md"

// ErrNotADirectory reports a career root that is not a folder.
var ErrNotADirectory = errors.New("career root is not a directory")

// ErrOutsideRoot reports a path that resolves outside the career folder.
//
// The frontend never sends paths, only artifact ids, so this should be
// unreachable. It is checked anyway: "should be unreachable" is not a property
// worth trusting on the one code path that writes to disk.
var ErrOutsideRoot = errors.New("path is outside the career root")

// Root is a resolved career folder.
//
// Both paths are absolute and symlink-free. That matters on Windows, where a
// junction or a OneDrive folder gives the same file two different paths - and
// comparing unresolved strings would let the plan file look like an ordinary
// document under its other name.
type Root struct {
	dir      string // absolute, symlinks resolved
	planFile string // absolute, symlinks resolved
}

// Open resolves a career root.
func Open(dir string) (*Root, error) {
	abs, err := resolve(dir)
	if err != nil {
		return nil, fmt.Errorf("career root %q: %w", dir, err)
	}

	info, err := os.Stat(abs)
	if err != nil {
		return nil, fmt.Errorf("career root %q: %w", dir, err)
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("%q: %w", dir, ErrNotADirectory)
	}

	// The plan file is resolved even when it does not exist yet: a career
	// folder without one is a valid state the UI must be able to report.
	plan, err := resolve(filepath.Join(abs, PlanFileName))
	if err != nil {
		plan = filepath.Join(abs, PlanFileName)
	}

	return &Root{dir: abs, planFile: plan}, nil
}

// Dir returns the resolved career folder.
func (r *Root) Dir() string { return r.dir }

// PlanFile returns the resolved path of the plan file.
func (r *Root) PlanFile() string { return r.planFile }

// IsPlanFile reports whether path is the plan file.
//
// Comparison is by resolved path, never by name, id, or anything the caller
// supplied. A caller that could talk the workspace into the wrong answer would
// make every guarantee built on top of this one worthless.
func (r *Root) IsPlanFile(path string) bool {
	resolved, err := resolve(path)
	if err != nil {
		// Unresolvable means it does not exist, so it cannot be the plan file
		// - unless the plan file does not exist either, in which case the
		// literal paths are all there is to compare.
		return sameString(path, r.planFile)
	}
	return sameString(resolved, r.planFile)
}

// Resolve turns a path relative to the career root into an absolute one,
// refusing anything that escapes the root.
func (r *Root) Resolve(rel string) (string, error) {
	joined := filepath.Join(r.dir, filepath.FromSlash(rel))

	resolved, err := resolve(joined)
	if err != nil {
		resolved = joined // not on disk yet; the containment check still applies
	}
	if !r.contains(resolved) {
		return "", fmt.Errorf("%q: %w", rel, ErrOutsideRoot)
	}
	return resolved, nil
}

// contains reports whether path lies inside the career folder.
//
// Compared segment-wise rather than with a string prefix: "Career-old" starts
// with "Career" as text but is a different folder entirely.
func (r *Root) contains(path string) bool {
	rel, err := filepath.Rel(r.dir, path)
	if err != nil {
		return false
	}
	if rel == "." {
		return true
	}
	return rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

// resolve makes a path absolute and follows every symlink in it.
func resolve(path string) (string, error) {
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	real, err := filepath.EvalSymlinks(abs)
	if err != nil {
		return "", err
	}
	return real, nil
}

// sameString compares paths case-insensitively.
//
// Windows filesystems are case-insensitive, so "tasks.md" and "TASKS.md" are
// the same file. Treating them as different would leave the plan file writable
// under a differently-cased name.
func sameString(a, b string) bool {
	return strings.EqualFold(filepath.Clean(a), filepath.Clean(b))
}
