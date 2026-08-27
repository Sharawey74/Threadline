# Tasks — Threadline

**Project:** local-first Windows desktop app — read study material, tick checkboxes in a Markdown plan file, record where hours went.
**Stack:** Go · Wails v2 · TypeScript · React · Vite · pdf.js · SQLite
**Reference docs:** `plans/`

| | |
|---|---|
| **Current phase** | Spike |
| **Progress** | 0 of 9 tasks · 0h of 65h |
| **Next gate** | Page 41 of a real PDF rendering in a Wails window |
| **Stop trigger** | Spike over 4 sessions → switch to Electron (ADR-001) |

---

## How this file works

`TASKS.md` is everything **actionable**. `plans/` is everything **explanatory**.

- **Active** — what you're working on now. Keep it to 1–3 items.
- **Waiting On** — blocked on a decision, a result, or an external thing.
- **Phases** — the full backlog, in order. Pull the next unchecked task into Active when you finish one.
- **Done** — completed work, newest first.

Task format: `- [ ] **[Tag]** Title — context`
Tags: `[Spike]` `[I1]`…`[I5]` `[Hardening]` `[Deploy]` `[Retro]` `[Chore]`

---

## Active

- [ ] **[Spike]** Initialise the repository — `go mod init`, Wails v2 React+TS template, `.gitignore`, `.editorconfig`, and `.gitattributes` pinning `*.md text eol=lf` *(byte-exact write-back depends on line endings staying LF)*
- [ ] **[Spike]** Stand up CI before any real code — lint, test and build on push; must go green on an empty project
- [ ] **[Spike]** Render page 41 of a real study PDF with pdf.js inside the Wails webview *(the riskiest assumption in the design — do this first)*

## Waiting On

- [ ] **[Spike]** SQLite driver decision — blocked until the spike confirms whether FTS5 is available in pure-Go `modernc.org/sqlite`, or whether cgo is required. Outcome becomes `plans/adr/002-sqlite-driver.md`

---

## Phase 0 — Spike · *6h* · branch `spike/feasibility` (throwaway, never merged)

**Goal:** retire the assumptions that could invalidate the design, before writing production code.

- [ ] **[Spike]** Initialise the repository — Go module, Wails v2 React+TS template, `.gitignore`, `.editorconfig`, `.gitattributes`
- [ ] **[Spike]** Stand up CI — lint, test, build on push; green on an empty project
- [ ] **[Spike]** Wails window opens and a Go function is callable from TypeScript
- [ ] **[Spike]** Embed pdf.js in the webview and open a real multi-hundred-page study PDF
- [ ] **[Spike]** Jump to page 41 programmatically and confirm it renders
- [ ] **[Spike]** Confirm the React + imperative-pdf.js pattern works — document and canvas held in refs, render inside `useEffect`, outside React's render cycle
- [ ] **[Spike]** Choose the SQLite driver and confirm FTS5 availability
- [ ] **[Spike]** Write `plans/adr/002-sqlite-driver.md` recording the choice and why
- [ ] **[Spike]** Timebox check — if this phase has taken more than 4 sessions, stop and switch to Electron

**Exit:** a window displaying page 41 of a real PDF, opened by code, on a green pipeline.

---

## Phase 1 — I1 Plan core · *10h* · branch `feat/plan-core`

**Goal:** port the validated prototype to Go. No UI.

- [ ] **[I1]** `core/plan/parse.go` — implement the frozen parse rules (Schema §4)
- [ ] **[I1]** Hour extraction — four surface forms, emphasis-priority rule, confidence flag
- [ ] **[I1]** Page-count extraction — unparenthesised is the item's own size
- [ ] **[I1]** Backtick resolution — a span is a link only if it resolves on disk; direct path first, then recursive; symlink-aware with a visited set
- [ ] **[I1]** Role assignment — schedule / curriculum / scope / personal (Schema §2)
- [ ] **[I1]** Section parsing — headings, budgets in both `*(19h)*` and `*(Oct–Nov, 38h)*` forms
- [ ] **[I1]** Reconciliation — all 10 checks (Schema §7)
- [ ] **[I1]** Anchors — sha256 identity, fuzzy re-anchoring, orphan retention (Schema §5)
- [ ] **[I1]** Table-driven tests covering **every ambiguity case in Schema §4**
- [ ] **[I1]** CLI harness printing the reconciliation table
- [ ] **[I1]** Open PR, self-review the diff, squash merge, delete branch

**Exit:** `go test ./core/plan` green; CLI reproduces the prototype's output exactly — 10 of 10 checks passing.

---

## Phase 2 — I2 Persistence · *8h* · branch `feat/persistence`

- [ ] **[I2]** SQLite schema — V1 tables only (Schema §8), WAL mode enabled
- [ ] **[I2]** Migration runner — forward-only, numbered, with automatic pre-migration database copy
- [ ] **[I2]** `core/store` query layer with integration tests against fixture files
- [ ] **[I2]** `core/plan/write.go` — byte-exact checkbox write-back (Schema §6)
- [ ] **[I2]** Verify-before-write — re-read the line and confirm its anchor before touching it
- [ ] **[I2]** Atomic write — temp file in the same directory, fsync, rename
- [ ] **[I2]** Daily snapshot before the first write of each session
- [ ] **[I2]** Round-trip safety test — parse, rewrite every box to its current value, assert byte-identical
- [ ] **[I2]** Wire the round-trip test into CI as a **blocking** gate
- [ ] **[I2]** Open PR, self-review, squash merge

**Exit:** all six write-safety tests green in CI. **If the round-trip test fails, write-back ships disabled.**

---

## Phase 3 — I3 Frontend shell · *14h* · branch `feat/workbench` · largest increment

Built against a **mock IPC** returning fixture JSON — no Go required, and every line survives a switch to Electron.

- [ ] **[I3]** `ipc.ts` — the single module that talks to Go; mock implementation first
- [ ] **[I3]** Layout — material list · viewer pane · checklist · note box
- [ ] **[I3]** Markdown viewer — preview / edit / split modes
- [ ] **[I3]** PDF viewer component — pdf.js in refs, page navigation, scroll position preserved
- [ ] **[I3]** Checklist rendering with tick interaction and optimistic update
- [ ] **[I3]** Session timer display
- [ ] **[I3]** Theme, keyboard shortcuts
- [ ] **[I3]** Empty states, loading states, error states — every one designed, none left default
- [ ] **[I3]** Component tests against the mock
- [ ] **[I3]** `tsc --strict` and `eslint` clean
- [ ] **[I3]** Open PR, self-review, squash merge

**Exit:** the full workbench is usable in a plain browser against fixture data.

---

## Phase 4 — I4 Integration · *5h* · branch `feat/ipc-integration`

- [ ] **[I4]** Implement the 7 query commands in `bridge/app.go`
- [ ] **[I4]** Implement the 5 state-changing commands
- [ ] **[I4]** Wire the 3 Go→frontend events
- [ ] **[I4]** Contract tests — both sides of every command
- [ ] **[I4]** Swap the mock for the real bridge
- [ ] **[I4]** `fsnotify` watcher → `plan:changed` → frontend re-fetch
- [ ] **[I4]** Verify the contract is still under 20 commands (constraint C2)
- [ ] **[I4]** Confirm `core/` still imports zero Wails packages (constraint C1) — add a CI check for it
- [ ] **[I4]** Open PR, self-review, squash merge

**Exit:** editing the plan file in an external editor updates the app within a second, no restart.

---

## Phase 5 — I5 Sessions and hours · *8h* · branch `feat/sessions`

- [ ] **[I5]** Session lifecycle — start, end on project switch / 15-min idle / app close
- [ ] **[I5]** Idle detection that excludes idle time from recorded hours
- [ ] **[I5]** Scope inference — which project a session belongs to
- [ ] **[I5]** Crash-safe session persistence — flush periodically, recover on start
- [ ] **[I5]** Exit-note dialog — pre-filled from observed activity, one line, skippable in one keystroke
- [ ] **[I5]** Hours-versus-budget display, explicitly labelled when a period was not measured
- [ ] **[I5]** Tests for idle boundaries and session-split behaviour
- [ ] **[I5]** Open PR, self-review, squash merge

**Exit:** work 30 minutes, close, reopen — the session and its hours are present and correct.

---

## Phase 6 — Hardening · *8h* · branch `chore/hardening`

A quality gate over the whole system, not the first appearance of tests.

- [ ] **[Hardening]** Error-path audit — every failure returns a message a human can act on
- [ ] **[Hardening]** Structured logging to a rotating local file
- [ ] **[Hardening]** `go test -race` clean across watcher and session paths
- [ ] **[Hardening]** `pprof` profiling run
- [ ] **[Hardening]** Measure and record N1 cold start <2s
- [ ] **[Hardening]** Measure and record N2 page turn <200ms
- [ ] **[Hardening]** Measure and record N3 memory <300MB, N4 binary <20MB
- [ ] **[Hardening]** Verify N5 — zero network calls, tested with networking disabled
- [ ] **[Hardening]** Crash-recovery test — kill the process mid-session (N7)
- [ ] **[Hardening]** `gosec` and `npm audit` clean; dependencies pinned
- [ ] **[Hardening]** `gocyclo` under threshold across the codebase
- [ ] **[Hardening]** Accessibility pass — keyboard navigation, focus order, contrast
- [ ] **[Hardening]** Open PR, self-review, squash merge

**Exit:** all eight non-functional targets **measured and recorded**, never estimated.

---

## Phase 7 — Deployment · *6h* · branch `ci/release`

- [ ] **[Deploy]** Release workflow — lint → test → round-trip gate → build Windows binary → publish
- [ ] **[Deploy]** Semantic versioning; annotated tags
- [ ] **[Deploy]** `CHANGELOG.md` in Keep a Changelog format
- [ ] **[Deploy]** `README.md` — what it is, architecture, schema decisions, how to build
- [ ] **[Deploy]** Move ADRs into `docs/adr/` in the repo
- [ ] **[Deploy]** Backup and restore instructions for the database
- [ ] **[Deploy]** Enable Dependabot
- [ ] **[Deploy]** Branch protection on `main` — CI must pass before merge
- [ ] **[Deploy]** Cut `v0.1.0` and verify the published binary runs on a clean machine

**Exit:** `git tag v0.1.0` produces a downloadable, runnable `.exe` with zero manual steps.

---

## Phase 8 — Retro · after 3 weeks of unchanged daily use

**Product validation**

- [ ] **[Retro]** Does it restore context on a project gone cold?
- [ ] **[Retro]** Has it replaced the separate markdown reader, PDF viewer and file browser?
- [ ] **[Retro]** Does it answer "how many hours have actually gone in?"

**Engineering retro**

- [ ] **[Retro]** Estimates versus actuals per increment — where was the model wrong?
- [ ] **[Retro]** Did the IPC contract hold under 20 commands?
- [ ] **[Retro]** Did `core/` stay free of Wails imports?
- [ ] **[Retro]** What went well · what to do differently
- [ ] **[Retro]** Write the interview story angle — the filesystem-as-source-of-truth decision and the byte-exact write-back that made writing to a depended-upon file safe
- [ ] **[Retro]** Decide: plan V1, or stop

**Gate:** two of three product answers positive → plan V1.

---

## V1 backlog — gated on the Retro

- [ ] **[Someday]** Search — filenames, checklist items, notes, PDF and Markdown outline sections
- [ ] **[Someday]** Dashboard screen — today's state across all projects
- [ ] **[Someday]** Office file preview — docx, xlsx
- [ ] **[Someday]** Links and video as first-class artifacts
- [ ] **[Someday]** Screenshots with automatic project attribution
- [ ] **[Someday]** Tags and cross-entity linking

---

## Done

- [x] ~~**[Chore]** Project workspace restructured — `TASKS.md` and `CLAUDE.md` at root, reference docs in `plans/`~~ (done: 27 Aug 2026)
- [x] ~~**[Chore]** Frontend framework decided — React + Vite, no Next.js, no router, no state library~~ (done: 27 Aug 2026)
- [x] ~~**[Chore]** ADR-001 — stack chosen across six options, weighted against quality attributes, with a documented reversal and correction~~ (done: 27 Aug 2026)
- [x] ~~**[Chore]** Design phase — three-layer architecture, derived/stored data-model split, 14-command IPC contract frozen~~ (done: 27 Aug 2026)
- [x] ~~**[Chore]** Requirements phase — 12 functional requirements with acceptance conditions, 8 non-functional targets, explicit V0 scope boundary~~ (done: 27 Aug 2026)
- [x] ~~**[Chore]** Parse rules validated against real files — 55 checkboxes, 10/10 reconciliation checks, 6/6 write-safety tests~~ (done: 27 Aug 2026)

---

## Reference

### Git workflow — GitHub Flow

```
main (protected, always green)
 └── feat/plan-core          short-lived, one increment or less
      └── PR → CI green → self-review the diff → squash merge → delete
```

Conventional Commits: `feat:` `fix:` `test:` `docs:` `refactor:` `chore:` `ci:`
Releases from annotated tags only, never from a branch.

### Definition of Ready — before starting a task

- [ ] Acceptance condition written and objectively checkable
- [ ] Touches one layer, or the cross-layer contract is already agreed
- [ ] Fits in a branch that merges within a few sessions

### Definition of Done — before any PR merges

- [ ] Tests written and passing; new logic covered
- [ ] `golangci-lint` and `tsc --strict` clean
- [ ] No new cyclomatic-complexity violations
- [ ] Non-obvious decisions commented with *why*, not *what*
- [ ] CHANGELOG updated if user-visible
- [ ] Self-reviewed as a diff, not as code you remember writing

### CI gates — from the first commit

`go vet` · `golangci-lint` · `gocyclo` · `gosec` · `go test -race` · `tsc --noEmit` · `eslint` · **byte-exact round-trip test** · Windows build

### Constraints

| # | Constraint |
|---|---|
| **C1** | `core/` never imports Wails |
| **C2** | The IPC contract stays under 20 commands |
| **C3** | The plan file is only ever modified via the byte-exact write path |
| **C4** | Round-trip test passes, or write-back ships disabled |
| **C5** | No number is displayed that wasn't measured or read from a file |
| **C6** | No network calls, ever |
| **C7** | Spike over four sessions → switch to Electron |
| **C8** | `main` is always green |

### Estimates

| Phase | Est. | Actual |
|---|---|---|
| 0 Spike | 6h | — |
| 1 Plan core | 10h | — |
| 2 Persistence | 8h | — |
| 3 Frontend shell | 14h | — |
| 4 Integration | 5h | — |
| 5 Sessions | 8h | — |
| 6 Hardening | 8h | — |
| 7 Deployment | 6h | — |
| **Total** | **65h** | — |

Fill in actuals as you go — the gap is the Retro's most useful input.
