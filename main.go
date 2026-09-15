package main

import (
	"embed"

	"github.com/Sharawey74/Threadline/bridge"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the app structure
	app := bridge.NewApp()

	// Create application with options
	err := wails.Run(&options.App{
		Title: "Threadline",

		/*
		 * 1024x768 was the scaffold default and it is too small for this
		 * layout: a 72px icon rail and a 280px material rail leave too little
		 * for the document, which is the thing the window exists to show.
		 *
		 * The minimum still leaves a readable page beside both rails. Without
		 * one the window can be dragged smaller than anything CSS can rescue.
		 */
		Width:     1440,
		Height:    900,
		MinWidth:  900,
		MinHeight: 600,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		/*
		 * Frameless: the app draws its own title bar with Windows caption
		 * buttons (frontend/src/shell/TitleBar.tsx), which drags the window
		 * through the --wails-draggable CSS property.
		 *
		 * The webview is transparent and the background has no alpha, so the
		 * shell's 22px rounded corners are what the desktop sees rather than a
		 * square of background colour behind them. Windows 11 still supplies
		 * the drop shadow and snap layouts, since the frameless decorations
		 * stay on. Checked by eye, not by a test: nothing headless can see
		 * the native frame.
		 */
		Frameless:        true,
		BackgroundColour: &options.RGBA{R: 14, G: 11, B: 30, A: 0},
		Windows: &windows.Options{
			WebviewIsTransparent: true,
		},
		OnStartup: app.Startup,
		// Without this the store is never closed, so SQLite's write-ahead log
		// is left for the next start to recover from.
		OnShutdown: app.Shutdown,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
