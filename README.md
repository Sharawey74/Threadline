# Threadline

A local-first Windows desktop app for working through study material: a reader, a manual progress tracker, and a file manager over a folder you already have.

> **Status:** work in progress. Phases 0–8 are merged; Home, Notes and Files are still to come.

## What it does

- Reads a career folder on disk and shows its topics and files.
- Shows the plan file (`Roadmap_Checklist.md`) as a checklist you can tick. A tick changes one byte of the file, and nothing else.
- Imports a PDF's table of contents as a sidecar outline (`<name>.outline.md`). Tick sections as you finish them to see sections and pages done.
- Opens PDFs in Microsoft Edge at a section's page. Threadline itself renders no PDF.

It observes nothing and infers nothing: progress moves only when you tick something.

## Principles

- **Your files are the source of truth.** The app is a lens over your folder, not a container. Outlines and notes are plain markdown files beside the source.
- **No network.** Nothing leaves the machine.
- **No invented numbers.** Every figure shown is read from a file or entered by you.

## Stack

Go · Wails v2 · TypeScript · React · Vite · SQLite. Windows only (WebView2).

## Run it

Requirements: Go 1.25+, Node 22, the [Wails v2 CLI](https://wails.io/docs/gettingstarted/installation), Windows 10/11.

```bash
wails dev        # the app, with hot reload
wails build      # build/bin/Threadline.exe
```

The frontend on its own, against mock data, with no Go needed:

```bash
cd frontend
npm ci
npm run dev
```

## Test

```bash
go test ./...                                  # Go core and bridge
go test ./core/plan -run TestRoundTrip         # the byte-exact write-back gate
cd frontend && npx tsc --noEmit && npx eslint . && npx vitest run
```

CI runs all of these on every pull request, plus lint, security and complexity checks and a Windows build.

## Layout

```
main.go      Wails entry point
bridge/      the IPC boundary: the commands the frontend may call
core/        plain Go, no Wails: plan parsing, write-back, scanning, storage
frontend/    React UI (shell, workbench, outlines, plan, viewers)
build/       Wails build assets
```

## Licence

Not yet chosen.
