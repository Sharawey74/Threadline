// Package bridge is the only Wails-aware code in the project.
//
// It owns the window, the lifecycle and the binding of Go methods to the
// frontend. Business logic lives in core/, which must never import Wails
// (constraint C1) - that is what keeps the core headlessly testable and the
// Electron fallback open.
//
// Every exported method on App is one IPC command. The contract is frozen at
// 12 (7 queries, 5 commands); over 20 means the boundary is leaking (C2).
package bridge

import (
	"context"
	"fmt"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// Startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}
