package plan

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestSnapshotCopiesThePlanFile(t *testing.T) {
	path, _ := writable(t)
	dir := filepath.Join(t.TempDir(), SnapshotDir)
	now := time.Date(2026, 9, 7, 20, 0, 0, 0, time.UTC)

	dest, err := Snapshot(path, dir, now)
	if err != nil {
		t.Fatal(err)
	}
	if dest == "" {
		t.Fatal("no snapshot was taken")
	}

	original, copied := read(t, path), read(t, dest)
	if !bytes.Equal(original, copied) {
		t.Error("the snapshot is not byte-identical to the plan file")
	}
	if !strings.Contains(filepath.Base(dest), "2026-09-07") {
		t.Errorf("snapshot name %q does not carry the date", filepath.Base(dest))
	}
}

// One copy per day, not per write. A hundred copies differing by one byte is
// not a backup, it is noise that hides the useful one.
func TestSnapshotIsOncePerDay(t *testing.T) {
	path, _ := writable(t)
	dir := filepath.Join(t.TempDir(), SnapshotDir)
	morning := time.Date(2026, 9, 7, 9, 0, 0, 0, time.UTC)
	evening := time.Date(2026, 9, 7, 23, 0, 0, 0, time.UTC)

	first, err := Snapshot(path, dir, morning)
	if err != nil || first == "" {
		t.Fatalf("first snapshot: %v, %q", err, first)
	}
	second, err := Snapshot(path, dir, evening)
	if err != nil {
		t.Fatal(err)
	}
	if second != "" {
		t.Errorf("a second snapshot was taken the same day: %s", second)
	}

	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Errorf("%d snapshots for one day, want 1", len(entries))
	}
}

func TestSnapshotIsTakenAgainTheNextDay(t *testing.T) {
	path, _ := writable(t)
	dir := filepath.Join(t.TempDir(), SnapshotDir)

	day1 := time.Date(2026, 9, 7, 9, 0, 0, 0, time.UTC)
	day2 := day1.AddDate(0, 0, 1)

	if _, err := Snapshot(path, dir, day1); err != nil {
		t.Fatal(err)
	}
	second, err := Snapshot(path, dir, day2)
	if err != nil {
		t.Fatal(err)
	}
	if second == "" {
		t.Error("no snapshot taken on the following day")
	}

	entries, _ := os.ReadDir(dir)
	if len(entries) != 2 {
		t.Errorf("%d snapshots across two days, want 2", len(entries))
	}
}

// The snapshot must exist BEFORE the file is touched. One taken afterwards is
// a copy of the damage.
func TestSnapshotPrecedesTheWrite(t *testing.T) {
	path, r := writable(t)
	dir := filepath.Join(t.TempDir(), SnapshotDir)
	now := time.Date(2026, 9, 7, 20, 0, 0, 0, time.UTC)

	before := read(t, path)
	target := firstUnchecked(t, ParseDocument(string(before), r))

	if _, err := TickWithSnapshot(optsFor(target, path, true), dir, now); err != nil {
		t.Fatal(err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 1 {
		t.Fatalf("expected one snapshot, got %d (%v)", len(entries), err)
	}

	// The snapshot holds the PRE-write bytes, and the plan file has moved on.
	snap := read(t, filepath.Join(dir, entries[0].Name()))
	if !bytes.Equal(snap, before) {
		t.Error("the snapshot captured the file after the write, not before")
	}
	if bytes.Equal(read(t, path), before) {
		t.Error("the tick did not happen")
	}
}

// If the snapshot cannot be taken, the write must not happen. The copy is the
// point; writing without it is the failure mode it exists to prevent.
func TestWriteIsRefusedWhenTheSnapshotFails(t *testing.T) {
	path, r := writable(t)
	before := read(t, path)
	target := firstUnchecked(t, ParseDocument(string(before), r))

	// A file where the snapshot directory should be: MkdirAll cannot succeed.
	blocked := filepath.Join(t.TempDir(), "blocked")
	if err := os.WriteFile(blocked, []byte("not a directory"), 0o600); err != nil {
		t.Fatal(err)
	}

	_, err := TickWithSnapshot(optsFor(target, path, true), blocked, time.Now())
	if err == nil {
		t.Fatal("the write proceeded without a snapshot")
	}
	if !strings.Contains(err.Error(), "refusing to write without a snapshot") {
		t.Errorf("error does not explain the refusal: %v", err)
	}
	if after := read(t, path); !bytes.Equal(before, after) {
		t.Error("the plan file was modified despite the snapshot failing")
	}
}

// An interrupted copy must not leave a truncated file that looks like a real
// snapshot.
func TestSnapshotLeavesNoTempFiles(t *testing.T) {
	path, _ := writable(t)
	dir := filepath.Join(t.TempDir(), SnapshotDir)

	if _, err := Snapshot(path, dir, time.Now()); err != nil {
		t.Fatal(err)
	}

	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".tmp") {
			t.Errorf("temp file left behind: %s", e.Name())
		}
	}
}
