// Package watch reports when the plan file changes on disk.
//
// It is plain Go and imports no Wails, like everything under core/ (C1).
package watch

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

// DefaultDebounce is how long to wait after an event before looking at the
// file.
//
// A single save from an editor produces several events — write, chmod,
// sometimes a rename — and reacting to each would re-parse the file three
// times for one edit. 150ms is long enough to collect them and short enough
// that the app still feels like it noticed immediately.
const DefaultDebounce = 150 * time.Millisecond

// Watcher reports changes to one file.
//
// Two things make this harder than it looks:
//
//  1. **It watches the directory, not the file.** Threadline's own writes
//     replace the file by renaming a temp file over it, and most editors do
//     the same. That swaps the inode, so a watch on the file itself stops
//     receiving events after the very first save.
//
//  2. **It compares content, not events.** An event says something happened,
//     not that anything changed — and touching a file, or re-saving it
//     unmodified, produces events with identical content. Hashing turns a
//     stream of "something happened" into "this is genuinely different",
//     which also makes duplicate events from one save free to ignore.
type Watcher struct {
	path     string
	onChange func()
	debounce time.Duration

	mu       sync.Mutex
	lastHash string
}

// New creates a watcher for one file. onChange runs on the watcher's own
// goroutine, so it must not block for long.
func New(path string, onChange func()) *Watcher {
	return &Watcher{
		path:     path,
		onChange: onChange,
		debounce: DefaultDebounce,
		lastHash: hashFile(path),
	}
}

// Run watches until ctx is cancelled.
//
// A missing file is not an error: the plan file may not exist yet, and the
// directory watch will notice when it appears.
func (w *Watcher) Run(ctx context.Context) error {
	fsw, err := fsnotify.NewWatcher()
	if err != nil {
		return fmt.Errorf("create watcher: %w", err)
	}
	defer func() { _ = fsw.Close() }()

	dir := filepath.Dir(w.path)
	if err := fsw.Add(dir); err != nil {
		return fmt.Errorf("watch %s: %w", dir, err)
	}

	var timer *time.Timer
	var timerC <-chan time.Time

	for {
		select {
		case <-ctx.Done():
			if timer != nil {
				timer.Stop()
			}
			return nil

		case event, ok := <-fsw.Events:
			if !ok {
				return nil
			}
			if !w.concerns(event.Name) {
				continue
			}
			// Restart the debounce on every event, so a burst from one save
			// collapses into a single check once the burst stops.
			if timer != nil {
				timer.Stop()
			}
			timer = time.NewTimer(w.debounce)
			timerC = timer.C

		case <-timerC:
			timerC = nil
			w.checkNow()

		case err, ok := <-fsw.Errors:
			if !ok {
				return nil
			}
			// A watch error is not worth stopping over: the file is still
			// re-read on every scan, so the app degrades to manual refresh
			// rather than breaking.
			_ = err
		}
	}
}

// concerns reports whether an event is about the watched file.
//
// The directory is watched, so events arrive for every file in it — including
// the .tmp files Threadline's own atomic writes create.
func (w *Watcher) concerns(name string) bool {
	return strings.EqualFold(filepath.Clean(name), filepath.Clean(w.path))
}

// checkNow re-hashes and fires only if the content actually differs.
func (w *Watcher) checkNow() {
	current := hashFile(w.path)

	w.mu.Lock()
	changed := current != w.lastHash
	w.lastHash = current
	w.mu.Unlock()

	if changed && w.onChange != nil {
		w.onChange()
	}
}

// MarkWritten records a change Threadline made itself, so the watcher does not
// report the app's own tick back to it.
//
// Best-effort by nature: the watcher's goroutine may already be mid-check when
// this is called. The worst case is one redundant re-fetch, not a loop — a
// re-fetch does not write, so nothing can feed itself.
func (w *Watcher) MarkWritten() {
	current := hashFile(w.path)
	w.mu.Lock()
	w.lastHash = current
	w.mu.Unlock()
}

// hashFile returns a content hash, or "" when the file cannot be read.
//
// A missing file hashes to "" and so differs from any real content, which
// makes deletion and re-creation both count as changes — correctly.
func hashFile(path string) string {
	data, err := os.ReadFile(path) // #nosec G304 -- the path the watcher was constructed with
	if err != nil {
		return ""
	}
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
