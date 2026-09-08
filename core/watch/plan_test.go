package watch

import (
	"context"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

// harness starts a watcher over a plan file and returns the file's path plus a
// counter of how many changes were reported.
func harness(t *testing.T, initial string) (path string, changes *atomic.Int32) {
	t.Helper()

	dir := t.TempDir()
	path = filepath.Join(dir, "TASKS.md")
	if err := os.WriteFile(path, []byte(initial), 0o600); err != nil {
		t.Fatal(err)
	}

	changes = &atomic.Int32{}
	w := New(path, func() { changes.Add(1) })
	w.debounce = 20 * time.Millisecond // keep the tests quick

	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	ready := make(chan struct{})
	go func() {
		close(ready)
		_ = w.Run(ctx)
	}()
	<-ready
	time.Sleep(50 * time.Millisecond) // let the watch register

	t.Cleanup(func() { _ = w })
	return path, changes
}

// waitFor polls until the condition holds or the deadline passes, so a slow
// filesystem does not make the test flaky.
func waitFor(t *testing.T, want int32, got *atomic.Int32) {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if got.Load() >= want {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("reported %d changes, want %d", got.Load(), want)
}

func TestReportsAnExternalEdit(t *testing.T) {
	path, changes := harness(t, "# plan\n")

	if err := os.WriteFile(path, []byte("# plan\n\nedited elsewhere\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	waitFor(t, 1, changes)
}

// Threadline replaces the plan file by renaming a temp file over it, and most
// editors do the same. That swaps the inode, so a watch on the file itself
// would stop receiving events after the first save.
func TestSurvivesAnAtomicReplace(t *testing.T) {
	path, changes := harness(t, "# plan\n")
	dir := filepath.Dir(path)

	for i, body := range []string{"# one\n", "# two\n", "# three\n"} {
		tmp := filepath.Join(dir, ".tmp-replace")
		if err := os.WriteFile(tmp, []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
		if err := os.Rename(tmp, path); err != nil {
			t.Fatal(err)
		}
		waitFor(t, int32(i+1), changes)
	}
}

// An event says something happened, not that anything changed. Touching a file
// or re-saving it unmodified must not be reported as an edit.
func TestIgnoresAWriteThatChangesNothing(t *testing.T) {
	path, changes := harness(t, "# plan\n")

	for range 3 {
		if err := os.WriteFile(path, []byte("# plan\n"), 0o600); err != nil {
			t.Fatal(err)
		}
		time.Sleep(40 * time.Millisecond)
	}

	if n := changes.Load(); n != 0 {
		t.Errorf("reported %d changes for identical content, want 0", n)
	}
}

// One save from an editor produces several events. Reacting to each would
// re-parse the file three times for one edit.
func TestCollapsesABurstIntoOneReport(t *testing.T) {
	path, changes := harness(t, "# plan\n")

	for i := range 5 {
		if err := os.WriteFile(path, []byte("# plan\nburst\n"+string(rune('a'+i))), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	waitFor(t, 1, changes)
	time.Sleep(100 * time.Millisecond)
	if n := changes.Load(); n != 1 {
		t.Errorf("reported %d changes for one burst, want 1", n)
	}
}

// Other files in the same directory must not trigger a re-parse. The directory
// is watched, so events arrive for everything in it - including the .tmp files
// Threadline's own atomic writes create.
func TestIgnoresOtherFilesInTheDirectory(t *testing.T) {
	path, changes := harness(t, "# plan\n")
	dir := filepath.Dir(path)

	for _, name := range []string{"notes.md", ".threadline-abc.tmp", "README.md"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	time.Sleep(100 * time.Millisecond)

	if n := changes.Load(); n != 0 {
		t.Errorf("reported %d changes for unrelated files, want 0", n)
	}
}

// MarkWritten lets Threadline record its own tick so the watcher does not
// report the app's change back to it.
func TestMarkWrittenSuppressesTheAppsOwnWrite(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "TASKS.md")
	if err := os.WriteFile(path, []byte("- [ ] task\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	changes := &atomic.Int32{}
	w := New(path, func() { changes.Add(1) })

	// Simulate a tick, then tell the watcher about it before it looks.
	if err := os.WriteFile(path, []byte("- [x] task\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	w.MarkWritten()
	w.checkNow()

	if n := changes.Load(); n != 0 {
		t.Errorf("reported %d changes for the app's own write, want 0", n)
	}
}

// A missing plan file is a state, not a crash. Deleting and recreating it both
// count as changes.
func TestReportsDeletionAndRecreation(t *testing.T) {
	path, changes := harness(t, "# plan\n")

	if err := os.Remove(path); err != nil {
		t.Fatal(err)
	}
	waitFor(t, 1, changes)

	if err := os.WriteFile(path, []byte("# plan\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	waitFor(t, 2, changes)
}

func TestRunStopsWhenTheContextIsCancelled(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "TASKS.md")
	if err := os.WriteFile(path, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}

	w := New(path, func() {})
	ctx, cancel := context.WithCancel(context.Background())

	done := make(chan error, 1)
	go func() { done <- w.Run(ctx) }()

	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Errorf("Run returned %v, want nil on cancellation", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Run did not return after cancellation")
	}
}
