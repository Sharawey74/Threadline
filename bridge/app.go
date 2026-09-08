// Package bridge is the only Wails-aware code in the project.
//
// It owns the window, the lifecycle and the binding of Go methods to the
// frontend. Business logic lives in core/, which must never import Wails
// (constraint C1) — that is what keeps the core headlessly testable and the
// Electron fallback open.
//
// Every method here is deliberately thin: convert arguments, call the service,
// return a value. A decision made in this file is a decision that cannot be
// tested without a window, and one that would have to be rewritten if the
// bridge were ever replaced.
//
// Every exported method on App is one IPC command. The contract is 13 (7
// queries, 6 commands); over 20 means the boundary is leaking (C2).
package bridge

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"github.com/Sharawey74/Threadline/core/plan"
	"github.com/Sharawey74/Threadline/core/store"
	"github.com/Sharawey74/Threadline/core/watch"
	"github.com/Sharawey74/Threadline/core/workspace"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// The three events Go pushes to the frontend. Names are shared with ipc/types.ts;
// a typo here is a listener that never fires, which is why they are constants
// rather than literals scattered through the file.
const (
	EventPlanChanged    = "plan:changed"
	EventSessionTick    = "session:tick"
	EventReconcileDrift = "reconcile:drift"
)

// App is the object Wails binds to the frontend.
type App struct {
	ctx context.Context

	// Nil until a career root is set. Every command checks, because the app
	// starts before the user has chosen a folder and the frontend is allowed
	// to call anything at any time.
	svc   *workspace.Service
	store *store.Store

	watcher    *watch.Watcher
	stopWatch  context.CancelFunc
	lastChecks []plan.Check
}

// NewApp creates the bound application object.
func NewApp() *App { return &App{} }

// Startup is called by Wails when the app starts.
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
}

// Shutdown is called by Wails as the window closes.
//
// Closing the store here is what flushes SQLite's write-ahead log. Skipping it
// leaves a -wal file beside the database that the next start has to recover
// from — survivable, but recovery is not a thing to rely on routinely.
func (a *App) Shutdown(_ context.Context) {
	if a.stopWatch != nil {
		a.stopWatch()
	}
	if a.store != nil {
		_ = a.store.Close()
	}
}

// ─── Commands ─────────────────────────────────────────────────────────

// SetCareerRoot points the app at a career folder.
//
// Everything else fails until this succeeds, and it reports why rather than
// leaving the frontend with an empty screen: F1 requires an invalid path to
// fail with a message a person can act on, not a crash.
func (a *App) SetCareerRoot(path string) error {
	root, err := workspace.Open(path)
	if err != nil {
		return err
	}

	dataDir, err := appDataDir()
	if err != nil {
		return err
	}
	st, err := store.Open(filepath.Join(dataDir, "threadline.db"))
	if err != nil {
		return fmt.Errorf("open database: %w", err)
	}

	// Replace only once the new root is known good, so a failed switch leaves
	// the working one in place rather than a half-open app.
	if a.store != nil {
		_ = a.store.Close()
	}
	a.store = st
	a.svc = workspace.NewService(root, st, filepath.Join(dataDir, plan.SnapshotDir))

	a.startWatching(root.PlanFile())
	return nil
}

// startWatching reports external edits to the plan file as plan:changed.
//
// Switching career roots stops the previous watch first. Leaving it running
// would report the old folder's edits against the new folder's data.
func (a *App) startWatching(planPath string) {
	if a.stopWatch != nil {
		a.stopWatch()
	}

	ctx, cancel := context.WithCancel(context.Background())
	a.stopWatch = cancel

	a.watcher = watch.New(planPath, func() {
		a.emit(EventPlanChanged)
		a.checkDrift()
	})
	go func() { _ = a.watcher.Run(ctx) }()
}

// checkDrift emits reconcile:drift when a check that was passing starts
// failing.
//
// Only on the transition. Emitting on every scan while a check stays red would
// train the user to ignore the event, and drift is meant to be information
// worth reading - either the plan changed or the parser broke.
func (a *App) checkDrift() {
	checks, err := a.svc.Reconciliation()
	if err != nil {
		return
	}

	previous := map[string]bool{}
	for _, c := range a.lastChecks {
		previous[c.Label] = c.Passed
	}

	for _, c := range checks {
		if was, seen := previous[c.Label]; seen && was && !c.Passed {
			a.emit(EventReconcileDrift)
			break
		}
	}
	a.lastChecks = checks
}

// emit pushes an event to the frontend, if a window is listening.
//
// Before Startup there is no context and nothing to emit to. That happens in
// tests and during a failed launch, and is not worth an error.
func (a *App) emit(name string) {
	if a.ctx == nil {
		return
	}
	wailsruntime.EventsEmit(a.ctx, name)
}

// TickItem sets a checkbox in the plan file.
func (a *App) TickItem(anchor string, checked bool) error {
	if err := a.ready(); err != nil {
		return err
	}
	if err := a.svc.Tick(anchor, checked); err != nil {
		return err
	}
	// Record the app's own write so the watcher does not report it back as an
	// external edit. Best-effort: the worst case is one redundant re-fetch.
	if a.watcher != nil {
		a.watcher.MarkWritten()
	}
	return nil
}

// WriteArtifact saves an edited markdown file. Never the plan file (C3).
func (a *App) WriteArtifact(artifactID int64, content string) error {
	if err := a.ready(); err != nil {
		return err
	}
	return a.svc.WriteArtifact(artifactID, content)
}

// SavePosition records where the user stopped in a document.
func (a *App) SavePosition(artifactID int64, page int) error {
	if err := a.ready(); err != nil {
		return err
	}
	return a.svc.SavePosition(artifactID, page)
}

// StartSession opens a session. Sessions are I5; this reserves the command.
func (a *App) StartSession(scopeKind, scopeRef string) (int64, error) {
	if err := a.ready(); err != nil {
		return 0, err
	}
	return a.svc.StartSession(scopeKind, scopeRef)
}

// EndSession closes a session. Sessions are I5; this reserves the command.
func (a *App) EndSession(id int64, note, reason string) error {
	if err := a.ready(); err != nil {
		return err
	}
	return a.svc.EndSession(id, note, reason)
}

// ─── Queries ──────────────────────────────────────────────────────────

// GetPlan returns the parsed plan file.
func (a *App) GetPlan() (*plan.Plan, error) {
	if err := a.ready(); err != nil {
		return nil, err
	}
	return a.svc.Plan()
}

// GetTopics returns the study folders on disk.
func (a *App) GetTopics() ([]plan.Topic, error) {
	if err := a.ready(); err != nil {
		return nil, err
	}
	return a.svc.Topics()
}

// GetMaterial returns a topic's files.
func (a *App) GetMaterial(topicID string) ([]workspace.Artifact, error) {
	if err := a.ready(); err != nil {
		return nil, err
	}
	return a.svc.Material(topicID)
}

// GetReconciliation runs the generated check set.
func (a *App) GetReconciliation() ([]plan.Check, error) {
	if err := a.ready(); err != nil {
		return nil, err
	}
	return a.svc.Reconciliation()
}

// GetBudgetStatus returns hours allocated against hours measured.
func (a *App) GetBudgetStatus() (workspace.Budget, error) {
	if err := a.ready(); err != nil {
		return workspace.Budget{}, err
	}
	return a.svc.BudgetStatus()
}

// GetPosition returns where the user stopped in a document.
func (a *App) GetPosition(artifactID int64) (workspace.Position, error) {
	if err := a.ready(); err != nil {
		return workspace.Position{}, err
	}
	return a.svc.Position(artifactID)
}

// ReadArtifact returns a file's contents.
func (a *App) ReadArtifact(artifactID int64) (workspace.Content, error) {
	if err := a.ready(); err != nil {
		return workspace.Content{}, err
	}
	return a.svc.ReadArtifact(artifactID)
}

// ─── Internals ────────────────────────────────────────────────────────

// ready reports whether a career root has been set.
//
// The message names the fix rather than the fault. "Career root not set" tells
// the user nothing they can do; this tells them what the app is waiting for.
func (a *App) ready() error {
	if a.svc == nil {
		return fmt.Errorf("no career folder chosen yet — pick one to get started")
	}
	return nil
}

// appDataDir is where the database and snapshots live: beside the app's own
// data, never inside the career folder. The career folder is the user's, and
// Threadline putting its bookkeeping in there would break the promise that
// deleting the database costs nothing but history.
func appDataDir() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("locate application data directory: %w", err)
	}
	dir := filepath.Join(base, "Threadline")
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return "", fmt.Errorf("create application data directory: %w", err)
	}
	return dir, nil
}
