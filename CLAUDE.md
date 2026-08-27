# Memory — Threadline

## Project
Threadline — a local-first Windows desktop app. One window for reading study material, ticking checkboxes in a Markdown plan file, and recording where hours actually went.

Stack: **Go · Wails v2 · TypeScript · React · Vite · pdf.js · SQLite**

No Next.js — it's a server framework and there is no server. No router, no Redux, no component library: one screen, and `useState` covers the state.

## Layout

```
Threadline/
├── TASKS.md      everything actionable — all 9 phases, git workflow, constraints
├── CLAUDE.md     this file
└── plans/        everything explanatory
    ├── Threadline-Concept.md        why it exists, product design
    ├── Threadline-Schema.md         data model, parse rules, write-back safety
    ├── Threadline-ADR-001-Stack.md  stack decision
    ├── Threadline-Build-Plan.md     requirements, architecture, delivery
    ├── SDLC-Record.md               phase-by-phase project record
    └── prototype-parser.py          validated throwaway prototype — port reference
```

## Active Phase

| Phase | Status |
|---|---|
| **Spike** | In progress (0/9) — retiring the pdf.js page-control risk |

Requirements and Design are complete and frozen as written specs.
→ Full task list: `TASKS.md` · SDLC record: `plans/SDLC-Record.md`

## The three decisions that shape everything

| Decision | Consequence |
|---|---|
| **The filesystem is the source of truth** | The app is a lens over the user's files, not a container. SQLite stores only what files cannot: sessions, hours, page positions, notes. Deleting the database loses history and nothing else. |
| **`core/` never imports Wails** | The core is a plain Go library — headlessly testable, and portable to Electron if Wails proves wrong. |
| **The IPC contract is frozen at 14 commands** | Queries have no side effects; commands return only an error. Over 20 commands means the boundary is leaking. |

## Current risk

**pdf.js page control inside WebView2 is unproven.** Everything else in V0 is comparatively routine. The spike tests it first; four sessions is the stop trigger, after which the fallback is Electron and the frontend work carries over unchanged.

## Working practices

- GitHub Flow — short-lived branches, one PR per logical change, `main` always green
- Conventional Commits; releases from annotated tags only
- CI from the first commit: lint, race-enabled tests, complexity, security, **byte-exact round-trip gate**
- Tests written against the frozen spec, not the implementation
- `.gitattributes` pins `*.md text eol=lf` — write-back safety depends on it

## Hard constraints

C1 `core/` imports no Wails · C2 IPC under 20 commands · C3 plan file only via the byte-exact path · C4 round-trip green or write-back disabled · C5 no unmeasured numbers displayed · C6 no network calls · C7 spike over four sessions → Electron · C8 `main` always green

## Recent concepts

| Term | Meaning |
|---|---|
| **Derived model** | Data re-read from files on every scan and never persisted — an in-process cache keyed on content hash |
| **Stored model** | The small SQLite half: only what a file cannot hold |
| **Anchor** | A content-hash identity for a plan item, so stored history survives the file being edited and lines moving |
| **Reconciliation** | Continuously re-checking that the plan's own numbers still add up; drift is information, not noise |
| **Byte-exact write-back** | Splicing a single byte in place rather than re-serialising the document, so nothing else in the file can move |
