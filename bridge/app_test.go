package bridge

import (
	"strings"
	"testing"
)

// The app starts before the user has chosen a folder, and the frontend may
// call anything at any time. Every command has to survive that.

func TestEveryCommandRefusesBeforeAFolderIsChosen(t *testing.T) {
	a := NewApp()

	// Not one of these may panic on a nil service. A nil dereference here is a
	// crash on first launch, before the user has done anything at all.
	checks := []struct {
		name string
		call func() error
	}{
		{"TickItem", func() error { return a.TickItem("anchor", true) }},
		{"WriteArtifact", func() error { return a.WriteArtifact(1, "x") }},
		{"SavePosition", func() error { return a.SavePosition(1, 1) }},
		{"EndSession", func() error { return a.EndSession(1, "", "manual") }},
		{"StartSession", func() error { _, err := a.StartSession("topic", "x"); return err }},
		{"GetPlan", func() error { _, err := a.GetPlan(); return err }},
		{"GetTopics", func() error { _, err := a.GetTopics(); return err }},
		{"GetMaterial", func() error { _, err := a.GetMaterial("x"); return err }},
		{"GetReconciliation", func() error { _, err := a.GetReconciliation(); return err }},
		{"GetBudgetStatus", func() error { _, err := a.GetBudgetStatus(); return err }},
		{"GetPosition", func() error { _, err := a.GetPosition(1); return err }},
		{"ReadArtifact", func() error { _, err := a.ReadArtifact(1); return err }},
	}

	for _, c := range checks {
		t.Run(c.name, func(t *testing.T) {
			err := c.call()
			if err == nil {
				t.Fatal("succeeded without a career folder")
			}
			// The message names what the app is waiting for. "Career root not
			// set" tells the user nothing they can act on.
			if !strings.Contains(err.Error(), "career folder") {
				t.Errorf("error does not name the missing folder: %v", err)
			}
		})
	}
}

// GetWorkspace is the exception, and deliberately so. It is how the frontend
// asks whether a folder exists, so failing for the ordinary reason of not
// having one would force every caller to treat first run as a fault.
func TestGetWorkspaceSucceedsWithNoFolder(t *testing.T) {
	a := NewApp()

	ws, err := a.GetWorkspace()
	if err != nil {
		t.Fatalf("GetWorkspace failed on first run: %v", err)
	}
	if ws.CareerRoot != "" {
		t.Errorf("CareerRoot = %q, want empty", ws.CareerRoot)
	}
	if ws.HasPlan {
		t.Error("HasPlan is true with no folder chosen")
	}
}

// A folder that cannot be opened must not be remembered. Persisting one that
// failed would reproduce the failure on every launch.
func TestSetCareerRootRejectsAMissingFolder(t *testing.T) {
	a := NewApp()

	err := a.SetCareerRoot(t.TempDir() + "-does-not-exist")
	if err == nil {
		t.Fatal("a missing folder was accepted")
	}

	ws, _ := a.GetWorkspace()
	if ws.CareerRoot != "" {
		t.Errorf("a failed folder was adopted: %q", ws.CareerRoot)
	}
}

// Shutdown runs on a window that never got a folder, and on one that never
// finished starting. Neither may panic.
func TestShutdownIsSafeBeforeStartup(t *testing.T) {
	NewApp().Shutdown(nil) //nolint:staticcheck // a nil context is exactly the case under test
}
