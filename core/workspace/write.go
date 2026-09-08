package workspace

import (
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
)

// writeFileAtomic replaces a file in one step.
//
// The same machinery as the plan-file write path, minus the byte-exact
// splicing: this is a full-file save, which is the correct shape for a
// document the user is editing freely. What it keeps is the part that protects
// against a crash — write a temp file beside the original, fsync it, then
// rename over the top.
//
// The temp file must sit in the same directory. Rename is only atomic within a
// filesystem, and a temp directory may be on another volume.
func writeFileAtomic(path string, data []byte) error {
	dir := filepath.Dir(path)

	tmp, err := os.CreateTemp(dir, ".threadline-*.tmp")
	if err != nil {
		return fmt.Errorf("create temp file beside %s: %w", filepath.Base(path), err)
	}
	tmpName := tmp.Name()
	defer func() { _ = os.Remove(tmpName) }() // a no-op once the rename succeeds

	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	// fsync before rename: without it the rename can land while the contents
	// are still in the page cache, and a crash leaves an empty file.
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}

	// Carry the original permissions across, so saving never quietly changes
	// who can read the file.
	if info, err := os.Stat(path); err == nil {
		if err := os.Chmod(tmpName, info.Mode().Perm()); err != nil {
			return err
		}
	}

	return os.Rename(tmpName, path)
}

func base64Encode(raw []byte) string {
	return base64.StdEncoding.EncodeToString(raw)
}
