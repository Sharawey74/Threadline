package plan

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

// Before the first write of each day, the plan file is copied into the app's
// own storage (Schema §6 rule 5).
//
// This is the layer beneath the round-trip test and the atomic rename. Those
// prevent a bad write; this one survives a bad write that nobody predicted.
// The file is about 15 KB and the user's entire career plan lives in it, so a
// copy per day is free insurance against a bug the tests did not model.

// SnapshotDir is where daily copies are kept, relative to the app's data dir.
const SnapshotDir = "threadline-snapshots"

// snapshotStamp is the day granularity. One copy per day, not per write: a
// hundred copies of the same file differing by one byte is not a backup, it is
// noise that makes the useful copy harder to find.
const snapshotStamp = "2006-01-02"

// Snapshot copies planPath into dir if today's copy does not exist yet.
//
// Returns the path written, or empty when today's copy was already there. A
// failure to snapshot is a failure to write: the whole point is that the copy
// exists before the file is touched.
func Snapshot(planPath, dir string, now time.Time) (string, error) {
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return "", fmt.Errorf("snapshot dir: %w", err)
	}

	name := fmt.Sprintf("%s.%s.md", filepath.Base(planPath), now.Format(snapshotStamp))
	dest := filepath.Join(dir, name)

	if _, err := os.Stat(dest); err == nil {
		return "", nil // today's copy already taken
	} else if !os.IsNotExist(err) {
		return "", err
	}

	src, err := os.Open(planPath) // #nosec G304 -- the plan file the user pointed the app at
	if err != nil {
		return "", err
	}
	defer func() { _ = src.Close() }()

	// Write to a temp file and rename, so an interrupted copy never leaves a
	// truncated snapshot that looks like a real one.
	tmp, err := os.CreateTemp(dir, ".snapshot-*.tmp")
	if err != nil {
		return "", err
	}
	tmpName := tmp.Name()
	defer func() { _ = os.Remove(tmpName) }()

	if _, err := io.Copy(tmp, src); err != nil {
		_ = tmp.Close()
		return "", err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return "", err
	}
	if err := tmp.Close(); err != nil {
		return "", err
	}
	if err := os.Rename(tmpName, dest); err != nil {
		return "", err
	}
	return dest, nil
}

// TickWithSnapshot takes the day's snapshot, then ticks.
//
// The order is the point. A snapshot taken after the write is a copy of the
// damage.
func TickWithSnapshot(opts TickOptions, snapshotDir string, now time.Time) (int, error) {
	if _, err := Snapshot(opts.Path, snapshotDir, now); err != nil {
		return 0, fmt.Errorf("refusing to write without a snapshot: %w", err)
	}
	return Tick(opts)
}
