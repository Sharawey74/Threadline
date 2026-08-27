# Project: Threadline

**Status:** Active
**One-liner:** A local-first Windows desktop app that reads your study material in one window, ticks checkboxes in a Markdown plan file, and records where your hours actually went.
**Started:** 27 Aug 2026 · **Target:** V0 in ~13 weeks
**Stack:** Go · Wails v2 · TypeScript · React · Vite · pdf.js · SQLite
**Specs:** `Threadline-Concept.md` (why) · `Threadline-Schema.md` (data) · `Threadline-ADR-001-Stack.md` (stack) · `Threadline-Build-Plan.md` (full plan)

---

## SDLC Workflow (adapted for this project)

**Spike → Requirements *(done)* → Design *(done)* → Implementation (5 increments) → Hardening → Deployment → Retro**

Two deliberate adaptations:

- **Requirements and Design were completed up front and frozen as written specs.** This is unusual, and it's justified: the parse rules are the riskiest part of the system and they were validated against real files with a throwaway prototype before any production code. Tests are written against the spec, not the implementation.
- **Testing is not a late phase.** Every implementation increment ships with its own tests and must leave `main` green. The dedicated *Hardening* phase is a quality gate over the whole system — non-functional targets, profiling, error paths — not the first time tests get written.

---

## Engineering practices — apply to every phase

### Git workflow — GitHub Flow

```
main (always green, protected)
 └── feat/plan-parser        short-lived, one increment or less
      └── PR → CI green → self-review → squash merge → delete branch
```

- **Conventional Commits**: `feat:` `fix:` `test:` `docs:` `refactor:` `chore:` `ci:`
- **One PR per logical change.** Even solo — the PR is where you review your own diff as a stranger would.
- **`main` is never broken.** If CI is red, fixing it is the only task.
- **Releases from annotated tags** (`v0.1.0`), never from a branch.
- **`.gitattributes` pins `*.md text eol=lf`** — the byte-exact write-back depends on line endings, and Git must not "helpfully" convert them.

### Definition of Ready — before starting any task
- [ ] Acceptance condition is written and objectively checkable
- [ ] It touches one layer, or the cross-layer contract is already agreed
- [ ] It fits in a branch that merges within a few sessions

### Definition of Done — before any PR merges
- [ ] Tests written and passing; new logic covered
- [ ] `golangci-lint` and `tsc --strict` clean
- [ ] No new cyclomatic-complexity violations
- [ ] Public functions documented; non-obvious decisions commented with *why*, not *what*
- [ ] CHANGELOG updated if user-visible
- [ ] Self-reviewed as a diff, not just as code you remember writing

### Test strategy — pyramid, shifted left

| Level | What | Where |
|---|---|---|
| **Unit** | Parse rules, role assignment, anchors, reconciliation | `core/`, table-driven Go tests |
| **Integration** | SQLite + migrations + real fixture files | `store/`, `plan/write` |
| **Contract** | The 14 IPC commands, both sides | `bridge/` |
| **Safety** | Byte-exact round-trip on the plan file | CI gate — **blocking** |
| **E2E** | UI flows | after V0 |

### Quality gates in CI — from the first commit, not at the end
`go vet` · `golangci-lint` · `gocyclo` · `gosec` · `go test -race` · `tsc --noEmit` · `eslint` · **round-trip safety test** · build Windows binary

---

## Phase: Spike — **In Progress**

**Goal:** retire the two assumptions that could invalidate the whole design, before writing production code.
**Estimate:** 6h · **Branch:** `spike/feasibility` (throwaway — never merged)

- [ ] Initialise repo: `go mod init`, Wails v2 scaffold, `.gitignore`, `.gitattributes`, `.editorconfig`
- [ ] CI skeleton — lint + test + build on push, green on an empty project
- [ ] Wails window opens; a Go function is callable from TypeScript
- [ ] pdf.js embedded in the webview; open a real multi-hundred-page study PDF
- [ ] **Jump to page 41 programmatically and confirm it renders** ← the riskiest assumption
- [ ] Choose the SQLite driver; confirm **FTS5 is available** (prefer pure-Go `modernc.org/sqlite`; fall back to cgo only if FTS5 requires it)
- [ ] Record findings as `docs/adr/002-sqlite-driver.md`

**Exit criterion:** a window displaying page 41 of a real PDF, opened by code, on a green CI pipeline.
**Stop trigger:** if this exceeds **four working sessions**, abandon Wails and switch to Electron per ADR-001. The frontend work carries over unchanged.

---

## Phase: Requirements — **Done** *(27 Aug 2026)*

Full detail in `Threadline-Build-Plan.md` §3.

- **What it must do:** 12 numbered functional requirements (F1–F12), each with an acceptance condition
- **Success criteria:** 8 non-functional targets (N1–N8) — cold start <2s, page turn <200ms, memory <300MB, binary <20MB, fully offline, plan file never corrupted, session survives a hard kill, no unmeasured numbers displayed
- **Out of scope for V0:** search · dashboard screen · Office files · links and video · screenshots · AI · tags · sync · macOS and Linux

---

## Phase: Design — **Done** *(27 Aug 2026)*

- **Architecture:** three layers — TypeScript frontend / Wails bridge / plain-Go core. **`core/` must never import Wails**, which keeps it testable headlessly and keeps the Electron fallback open.
- **Key decisions:** ADR-001 (stack, with a documented reversal and correction). SQLite over Postgres/NoSQL, argued from quality attributes.
- **Frontend framework — React + Vite, no Next.js.** Next.js is a server framework; Threadline has no server, no routing and no SEO, so none of its value applies. React is justified by genuine reactive state (plan data, viewer state, checklist, session timer) and by existing fluency. Wails ships an official React+TypeScript Vite template. **Deliberately excluded:** router (V0 is one screen), Redux/Zustand (`useState` + `useReducer` + one Context suffices), component library.
- **pdf.js integration pattern:** pdf.js is imperative, React is declarative. The viewer keeps the `PDFDocumentProxy` and canvas in refs, renders inside `useEffect` on page change, and stays outside React's render cycle — otherwise re-renders cause flicker and lost scroll position. Same approach for the markdown editor.
- **Data model:** `Threadline-Schema.md`. A deliberate split — a *derived* model re-read from files on every scan, and a small *stored* model in SQLite holding only what files cannot: sessions, hours, page positions, notes.
- **Contract:** 14 IPC commands, frozen before either side is implemented, split into side-effect-free queries and state-changing commands. **Exceeding 20 commands means the boundary is leaking.**
- **Validated:** parse rules proven against real files — 55 checkboxes, 10/10 reconciliation checks, 6/6 write-safety tests.

---

## Phase: Implementation — **Not started**

Five increments. Each is a branch, a PR, and a green `main`.

### I1 — Plan core *(10h)* · `feat/plan-core`
No UI. Port the validated prototype to Go.

- [ ] `core/plan/parse.go` — the frozen parse rules (Schema §4)
- [ ] Role assignment: schedule / curriculum / scope / personal (Schema §2)
- [ ] Reconciliation — all 10 checks (Schema §7)
- [ ] Anchors — sha256, fuzzy re-anchoring, orphan retention (Schema §5)
- [ ] Table-driven tests covering **every ambiguity case in Schema §4**
- [ ] CLI harness printing the reconciliation table

**Exit:** `go test ./core/plan` green; CLI reproduces the prototype's output exactly — 10 of 10 checks passing.

### I2 — Persistence *(8h)* · `feat/persistence`

- [ ] SQLite schema, V1 tables only (Schema §8); WAL mode
- [ ] Forward-only numbered migrations + automatic pre-migration database copy
- [ ] `core/plan/write.go` — byte-exact checkbox write-back (Schema §6)
- [ ] Verify-before-write, atomic temp-file rename, daily snapshot
- [ ] **Round-trip safety test wired into CI as a blocking gate**

**Exit:** all six write-safety tests green in CI. **If the round-trip test fails, write-back ships disabled.**

### I3 — Frontend shell *(14h)* · `feat/workbench` · largest increment
Built against a **mock IPC** returning fixture JSON — no Go required, and every line survives a switch to Electron.

- [ ] Layout: material list · viewer pane · checklist · note box
- [ ] Markdown viewer — preview / edit / split
- [ ] PDF viewer — pdf.js, page navigation, scroll position
- [ ] Checklist rendering and tick interaction
- [ ] Theme, keyboard shortcuts, empty states, error states
- [ ] Component tests against the mock

**Exit:** the full workbench is usable in a plain browser against fixture data.

### I4 — Integration *(5h)* · `feat/ipc-integration`

- [ ] Implement the 14 IPC commands in `bridge/app.go`
- [ ] Contract tests — both sides of every command
- [ ] Swap the mock for the real bridge
- [ ] `fsnotify` watcher → `plan:changed` event → frontend re-fetch

**Exit:** editing the plan file in an external editor updates the app within a second, no restart.

### I5 — Sessions and hours *(8h)* · `feat/sessions`

- [ ] Session lifecycle: start, idle detection, end (switch / 15-min idle / app close)
- [ ] Scope inference — which project a session belongs to
- [ ] Exit-note dialog: pre-filled from observed activity, one line, skippable
- [ ] Hours-versus-budget display, **explicitly labelled when a period was not measured**
- [ ] Crash-safe session persistence

**Exit:** work 30 minutes, close, reopen — the session and its hours are present and correct.

---

## Phase: Hardening — **Not started** *(8h)* · `chore/hardening`

A quality gate over the whole system, not the first appearance of tests.

- [ ] Error-path audit — every failure returns a message a human can act on
- [ ] Structured logging to a rotating local file
- [ ] `pprof` profiling; verify N1–N4 against measured numbers
- [ ] Crash-recovery test — kill the process mid-session (N7)
- [ ] `go test -race` clean across the watcher and session paths
- [ ] `gosec` and `npm audit` clean; dependencies pinned
- [ ] Accessibility pass — keyboard navigation, focus order, contrast

**Exit:** all eight non-functional targets **measured and recorded**, never estimated.

---

## Phase: Deployment — **Not started** *(6h)* · `ci/release`

- [ ] Release workflow: lint → test → round-trip gate → build Windows binary → publish
- [ ] Semantic versioning; annotated signed tags
- [ ] `CHANGELOG.md` in Keep a Changelog format
- [ ] `README.md` — what it is, architecture, the schema decisions, how to build
- [ ] `docs/adr/` — ADR-001 plus any taken during the build
- [ ] Backup and restore instructions for the database
- [ ] Dependabot enabled

**Exit:** `git tag v0.1.0` produces a downloadable, runnable `.exe` with zero manual steps.

---

## Phase: Retro — **Not started**

Run after three weeks of real daily use, unchanged.

**Product validation:**
- [ ] Does it restore context on a project gone cold?
- [ ] Has it replaced the separate markdown reader, PDF viewer, and file browser?
- [ ] Does it answer "how many hours have actually gone in?"

**Engineering retro:**
- [ ] What went well
- [ ] What to do differently
- [ ] Estimates versus actuals per increment — where was the model wrong?
- [ ] Did the IPC contract hold under 20 commands?
- [ ] Interview story angle: *the decision to make the filesystem the source of truth and keep the database to only what files cannot hold — and the byte-exact write-back that made writing to a file you depend on safe*

**Gate:** two of three product answers positive → plan V1. Otherwise stop; the specs and the engineering record stand on their own.

---

## Estimates

| Phase | Est. |
|---|---|
| Spike | 6h |
| I1 Plan core | 10h |
| I2 Persistence | 8h |
| I3 Frontend shell | 14h |
| I4 Integration | 5h |
| I5 Sessions | 8h |
| Hardening | 8h |
| Deployment | 6h |
| **Total** | **65h** |

Track actuals per increment; the gap is the Retro's most useful input.

---

## Constraints

| # | Constraint | Rationale |
|---|---|---|
| **C1** | `core/` never imports Wails | keeps the core headlessly testable and the Electron fallback open |
| **C2** | The IPC contract stays under 20 commands | boundary-leak tripwire |
| **C3** | The plan file is only ever modified via the byte-exact write path | it is a file the user depends on |
| **C4** | Round-trip test passes, or write-back ships disabled | data-safety gate |
| **C5** | No number is displayed that wasn't measured or read from a file | trust in the tool is the product |
| **C6** | No network calls, ever | local-first by definition |
| **C7** | Spike over four sessions → switch to Electron | ADR-001 |
| **C8** | `main` is always green | releases must be possible at any moment |
