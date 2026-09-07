package plan

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// Ticking a checkbox is the only write Threadline makes. It changes exactly
// one byte, and every rule in Schema §6 exists to keep it that way.
//
//	before   - [ ] **1. `02 - Databases & Storage`** - 49pp, ~7h
//	after    - [x] **1. `02 - Databases & Storage`** - 49pp, ~7h
//	                ^ one byte
//
// The file is never re-serialised. Re-serialising would be the obvious
// implementation and it is wrong: it silently rewrites em-dashes, trailing
// spaces, blank-line placement and line endings - in a file the user's entire
// career plan lives in.

// ErrStale reports that the file changed between reading and writing. The
// caller must re-scan; retrying with the same buffer would discard whatever
// the other writer did.
var ErrStale = errors.New("plan file changed on disk since it was read")

// ErrAnchorMismatch reports that the target line is no longer the item it was.
var ErrAnchorMismatch = errors.New("line no longer matches the item's anchor")

// TickOptions describes one checkbox write.
type TickOptions struct {
	Path    string // the plan file
	Anchor  string // the item to tick, verified before writing
	Checked bool   // desired state
	Role    Role   // used to recompute the anchor for verification
	Section string
}

// Tick sets one checkbox to the requested state.
//
// It returns the number of bytes changed, which is 1 for a real change and 0
// when the box already held that value. A caller seeing anything else has found
// a bug worth stopping for.
func Tick(opts TickOptions) (bytesChanged int, err error) {
	original, err := os.ReadFile(opts.Path) // #nosec G304 -- the career root the user chose
	if err != nil {
		return 0, err
	}

	offset, err := locate(original, opts)
	if err != nil {
		return 0, err
	}

	mark := byte(' ')
	if opts.Checked {
		mark = 'x'
	}
	if original[offset] == mark {
		return 0, nil // already in the requested state; touching nothing is correct
	}

	// Splice one byte. Not a re-serialise, not a line rewrite.
	updated := make([]byte, len(original))
	copy(updated, original)
	updated[offset] = mark

	if len(updated) != len(original) {
		return 0, fmt.Errorf("internal: write would change file length %d -> %d",
			len(original), len(updated))
	}

	if err := writeAtomic(opts.Path, original, updated); err != nil {
		return 0, err
	}
	return 1, nil
}

// locate finds the item's checkbox byte and verifies it is still that item.
//
// Verify before writing (Schema §6 rule 1). Line numbers are not identity, so
// the line is confirmed by re-deriving its anchor rather than trusting a
// remembered position.
func locate(content []byte, opts TickOptions) (int, error) {
	lineStart := 0
	for lineStart <= len(content) {
		lineEnd := bytes.IndexByte(content[lineStart:], '\n')
		var line []byte
		if lineEnd < 0 {
			line = content[lineStart:]
		} else {
			line = content[lineStart : lineStart+lineEnd]
		}

		if item, ok := ParseCheckbox(string(bytes.TrimSuffix(line, []byte("\r"))), 0); ok {
			if Anchor(opts.Role, opts.Section, item.Text) == opts.Anchor {
				// Column is the offset of '[' within the line; the mark follows it.
				return lineStart + item.Column + 1, nil
			}
		}

		if lineEnd < 0 {
			break
		}
		lineStart += lineEnd + 1
	}
	return 0, ErrAnchorMismatch
}

// writeAtomic replaces the file only if it still holds the bytes that were
// read, and replaces it in one step.
//
// The staleness check compares the WHOLE file, not just the target line. An
// anchor check confirms the line is still the right item; it says nothing about
// the other two hundred lines, and renaming a temp file over the original would
// discard every edit made elsewhere in the meantime.
func writeAtomic(path string, expected, updated []byte) error {
	current, err := os.ReadFile(path) // #nosec G304 -- same path just read
	if err != nil {
		return err
	}
	if !bytes.Equal(current, expected) {
		return fmt.Errorf("%w: %s -> %s", ErrStale, shortHash(expected), shortHash(current))
	}

	// The temp file must sit in the same directory: rename is only atomic
	// within a filesystem, and a temp directory may be on another volume.
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".threadline-*.tmp")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer func() { _ = os.Remove(tmpName) }() // no-op once the rename succeeds

	if _, err := tmp.Write(updated); err != nil {
		_ = tmp.Close()
		return err
	}
	// fsync before rename: without it the rename can land while the contents
	// are still in the page cache, and a crash leaves an empty plan file.
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmpName, filePerm(path)); err != nil {
		return err
	}
	return os.Rename(tmpName, path)
}

// filePerm carries the original file's permissions onto the replacement, so a
// write never quietly changes who can read the plan.
func filePerm(path string) os.FileMode {
	if fi, err := os.Stat(path); err == nil {
		return fi.Mode().Perm()
	}
	return 0o600
}

func shortHash(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])[:12]
}
