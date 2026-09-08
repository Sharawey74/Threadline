package main

import (
	"embed"

	"github.com/Sharawey74/Threadline/bridge"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
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
		 * layout: a 300px rail and a 400px plan pane leave 324px for the
		 * document, which is the thing the window exists to show.
		 *
		 * The minimum is what the shell needs before the plan pane collapses
		 * out of the way at 1100px, plus room for a page to still be readable.
		 * Without one the window can be dragged smaller than anything CSS can
		 * rescue.
		 */
		Width:     1440,
		Height:    900,
		MinWidth:  900,
		MinHeight: 600,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.Startup,
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
