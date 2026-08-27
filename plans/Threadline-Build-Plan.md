# Threadline — Build Plan

**Stack:** Go + Wails v2 + TypeScript + pdf.js + SQLite
**Scope of this document:** requirements → architecture → delivery → production → competency outcomes
**Companion documents:** `Threadline-Concept.md` (why) · `Threadline-Schema.md` (data) · `Threadline-ADR-001-Stack.md` (stack)

---

## 1. What is being built

A local-first Windows desktop app that does three things:

1. **Reads** your study material — markdown and PDF — in one window, remembering the page you stopped at
2. **Ticks** the checkboxes in `TASKS.md`, writing back to the real file byte-exactly
3. **Records** where your hours actually went, against the plan's 292-hour budget

**V0 is those three things and nothing else.** Everything in `Threadline-Concept.md` §12 stays deferred.

### The prime directive, restated

> **Threadline must be worth opening on a day you wrote nothing.**

Every requirement below is subordinate to this. A feature that only works when you feed it is a feature that turns the app into homework, and homework is the named failure mode.

---

## 2. The stack, in one page

### Go — the backend

A small, deliberately boring language. No inheritance, no generics-heavy abstraction, no exceptions. Errors are values you return and must handle. Concurrency is `goroutines` (cheap threads) and `channels` (typed pipes between them). It compiles to a **single static binary** — no runtime to install.

**Why it fits Threadline:** the standard library is unusually strong at exactly this app's work — `filepath.WalkDir` for scanning, `regexp` for the parse rules, `os` for byte-exact file I/O, `fsnotify` for watching folders. Your SysPlex daemons already used goroutines and channels; the filesystem watcher and session recorder are the same shape of problem.

### Wails v2 — the bridge

Wails is **not a UI framework.** It is glue. It does three jobs:

```
1. Opens a native Windows window
2. Renders your HTML/CSS/JS inside it using WebView2 (already part of Windows)
3. Lets JavaScript call your Go functions, and Go push events back
```

That's it. Your UI is an ordinary web page; your logic is ordinary Go. Wails carries messages between them and produces a ~10 MB `.exe`.

```
┌───────────────────────────────────────────────┐
│  WebView2  (Windows already has it)           │
│  your HTML · CSS · TypeScript · pdf.js        │
└───────────────────┬───────────────────────────┘
                    │  Wails bridge — JSON in, JSON out
┌───────────────────▼───────────────────────────┐
│  Go binary                                    │
│  parser · SQLite · file watcher · sessions    │
└───────────────────────────────────────────────┘
```

### What each layer owns

| Layer | Owns | Never does |
|---|---|---|
| **Frontend** (TS) | rendering, layout, interaction, pdf.js | touch the filesystem, know Go types |
| **Bridge** (Wails) | window, binding, events | contain business logic |
| **Backend** (Go) | parsing, SQLite, file I/O, sessions | know about the DOM or CSS |

---

## 3. Requirements

### 3.1 Functional — V0

Each is numbered, independently testable, and has an acceptance condition.

| # | Requirement | Accepted when |
|---|---|---|
| **F1** | Point the app at a career root folder | Folder persists across restarts; invalid path fails with a readable message, not a crash |
| **F2** | Parse `TASKS.md` into sections and plan items | All 55 checkboxes found; roles assigned; matches the Python prototype's output exactly |
| **F3** | Assign a role to each plan item | `schedule` / `curriculum` / `scope` / `personal` per Schema §2 |
| **F4** | Reconcile the plan | All 10 checks from Schema §7 run and report pass/fail |
| **F5** | Scan topic folders and list material | 9 topics, 30 files, each linked to its plan item |
| **F6** | Render markdown with preview/edit/split | Renders `TASKS.md` and any `.md` correctly, including tables |
| **F7** | Render PDF with page navigation | Any of the 28 study PDFs opens; jump to page; scroll |
| **F8** | Remember and restore PDF page position | Close at page 41, reopen at page 41 |
| **F9** | Tick a checkbox → write to `TASKS.md` | Exactly one byte changes; round-trip test passes (Schema §6) |
| **F10** | Record a session automatically | Start on open, end on switch / 15 min idle / app close |
| **F11** | Show hours against budget | Actual hours vs 292h, per month block, honestly labelled when unmeasured |
| **F12** | Exit note on app close | Pre-filled, one line, skippable with one keystroke, no guilt |

### 3.2 Non-functional

| # | Attribute | Target | How measured |
|---|---|---|---|
| **N1** | Cold start | < 2s to interactive | stopwatch on a cold boot |
| **N2** | PDF page turn | < 200ms | frame timing in devtools |
| **N3** | Memory, one PDF open | < 300 MB | Task Manager |
| **N4** | Binary size | < 20 MB | build output |
| **N5** | Offline | 100% — no network calls at all | verified with network disabled |
| **N6** | Data safety | `TASKS.md` never corrupted | round-trip test in CI, every build |
| **N7** | Crash recovery | Session survives a hard kill | kill the process mid-session; hours are not lost |
| **N8** | Honesty | No number displayed that wasn't measured or read from a file | code review rule, enforced in PR checklist |

### 3.3 Explicitly out of scope for V0

Search · Today screen · competency screen · Office files · links and videos · screenshots · AI · tags · sync · macOS/Linux.

---

## 4. Architecture

```
┌──────────────────────────────────────────────────────────┐
│  FRONTEND  (TypeScript + React + Vite — no Next.js)      │
│                                                          │
│   workbench/     material list · viewer pane · notes     │
│   viewers/       markdown.ts · pdf.ts (pdf.js)           │
│   plan/          checklist rendering · tick handling     │
│   session/       timer display · exit-note dialog        │
│   ipc.ts         ← the ONLY file that talks to Go        │
└────────────────────────┬─────────────────────────────────┘
                         │  IPC contract — see 4.1
┌────────────────────────▼─────────────────────────────────┐
│  BRIDGE  (Wails-specific — the only Wails-aware code)    │
│   app.go        window, lifecycle, binding, events       │
└────────────────────────┬─────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────┐
│  CORE  (plain Go — zero Wails imports)                   │
│                                                          │
│   plan/        parser · roles · reconciliation · anchors │
│   plan/write   byte-exact checkbox write-back            │
│   scan/        topic + material discovery · fsnotify     │
│   store/       SQLite · migrations · queries             │
│   session/     start · idle detection · end · notes      │
└──────────────────────────────────────────────────────────┘
```

**The one architectural rule that matters:** `core/` must not import Wails. Ever. It is a plain Go library that could be driven by a CLI, a test, or a different GUI. That is what keeps the Electron escape hatch open, and it is what makes `core/` testable without a window.

### 4.1 The IPC contract

Frozen before either side is implemented. Plain data across the boundary — no Go structs with behaviour, no framework types.

```go
// Queries — no side effects
GetPlan()                          → Plan
GetTopics()                        → []Topic
GetMaterial(topicID)               → []Artifact
GetReconciliation()                → []Check
GetBudgetStatus()                  → Budget
GetPosition(artifactID)            → Position
ReadArtifact(artifactID)           → Content

// Commands — change state, return only success or error
TickItem(anchor, checked)          → error
SavePosition(artifactID, page)     → error
StartSession(scopeKind, scopeRef)  → SessionID
EndSession(id, note, reason)       → error
SetCareerRoot(path)                → error

// Events — Go pushes to the frontend
"plan:changed"        TASKS.md changed on disk
"session:tick"        timer update
"reconcile:drift"     a check started failing
```

**14 commands. If this list exceeds 20, the boundary is leaking** — that is the tripwire for the escape hatch closing.

Note the split: queries return data and change nothing; commands change state and return only an error. That is **command-query separation**, and it is deliberate — see §7, row 47.

---

## 5. Delivery plan

Eight phases. Each has an exit criterion that is objectively checkable — no phase is "done" because it feels done.

### Phase 0 — Spike *(6h)* · risk retirement

**Goal:** kill the two assumptions that could invalidate the whole plan, before writing any real code.

- [ ] Wails v2 project skeleton; window opens; a Go function is callable from JS
- [ ] pdf.js embedded; open one real study PDF; **jump to page 41 programmatically**
- [ ] SQLite driver chosen; confirm **FTS5 is available** (pure-Go `modernc.org/sqlite` preferred; fall back to cgo only if FTS5 forces it)

**Exit:** a window showing page 41 of `System Design Fundamentals v3.pdf`, opened by code.
**Stop trigger:** if this exceeds **four evenings**, abandon Wails and switch to Electron. Written down now, while reversing is cheap.

### Phase 1 — Plan core *(10h)* · no UI

**Goal:** port the verified Python prototype to Go.

- [ ] `plan/parse.go` — the Schema §4 rules
- [ ] Role assignment (Schema §2)
- [ ] Reconciliation — all 10 checks
- [ ] Anchors — sha256, fuzzy re-anchor, orphan retention (Schema §5)
- [ ] Table-driven tests covering **every ambiguity case in Schema §4**

**Exit:** `go test ./plan` green, and a CLI printing the same reconciliation table the Python prototype produced — 10 of 10 passing.

### Phase 2 — Persistence *(8h)*

- [ ] SQLite schema, V1 tables only (Schema §8)
- [ ] Forward-only numbered migrations + automatic pre-migration DB copy
- [ ] `plan/write.go` — byte-exact checkbox write-back (Schema §6)
- [ ] **Round-trip test wired into CI** — parse, rewrite every box to its current value, assert byte-identical

**Exit:** the six write-back tests from Schema §6 pass in CI. **If the round-trip test fails, write-back ships disabled.**

### Phase 3 — Frontend shell *(14h)* · largest phase

Built against a **mock** IPC returning hardcoded JSON — no Go needed, and every line survives a switch to Electron.

- [ ] Layout: material list · viewer pane · checklist · note box
- [ ] Markdown viewer — preview / edit / split
- [ ] PDF viewer — pdf.js, page navigation, scroll position
- [ ] Checklist rendering with tick interaction
- [ ] Theme, keyboard shortcuts, empty and error states

**Exit:** the full workbench is usable in a browser against mock data.

### Phase 4 — Integration *(5h)*

- [ ] Implement the 14 IPC commands in `bridge/app.go`
- [ ] Swap the mock for the real bridge
- [ ] `fsnotify` watcher → `plan:changed` → frontend re-fetch

**Exit:** editing `TASKS.md` in VS Code updates the app within a second, without a restart.

### Phase 5 — Sessions and hours *(8h)*

- [ ] Session start / idle detection / end (Schema §8)
- [ ] Scope inference — which project a session belongs to
- [ ] Exit-note dialog on app close: pre-filled, skippable, no streak
- [ ] Hours vs budget display — **explicitly labelled when a period was not measured**

**Exit:** work for 30 minutes, close the app, reopen — the session and its hours are there and correct.

### Phase 6 — Hardening *(8h)*

- [ ] Error handling pass: every failure path returns a message a human can act on
- [ ] Structured logging to a local file, with rotation
- [ ] `pprof` profiling run; verify N1–N4 targets
- [ ] Crash-recovery test — kill mid-session, confirm N7
- [ ] `gocyclo` / `golangci-lint` clean

**Exit:** all eight non-functional targets measured and recorded, not estimated.

### Phase 7 — Release *(6h)*

- [ ] GitHub Actions: lint → test → **round-trip test** → build Windows binary
- [ ] Tagged release publishing the `.exe`
- [ ] Semantic versioning; `CHANGELOG.md`
- [ ] `README.md` — what it is, why it exists, the architecture, the schema decisions
- [ ] Backup/restore instructions for `threadline.db`

**Exit:** `git tag v0.1.0` produces a downloadable, runnable `.exe` with no manual steps.

### Phase 8 — The trial *(0h build)*

**Use it for three weeks. Change nothing.**

Then answer three questions honestly:

1. Did it get you back into something you'd gone cold on?
2. Did you stop opening the other four apps?
3. Can you finally answer *"am I on track against 292 hours?"*

**Two yeses → plan V1. Fewer → stop, and the app was still worth building for what it taught.**

### Budget

```
Phase 0  spike           6h
Phase 1  plan core      10h
Phase 2  persistence     8h
Phase 3  frontend       14h
Phase 4  integration     5h
Phase 5  sessions        8h
Phase 6  hardening       8h
Phase 7  release         6h
                      ─────
                       65h    outside the 292h — TASKS.md §8
```

At ~5h/week of genuinely spare time, that is roughly **13 weeks**. Slower than it sounds. Plan accordingly.

---

## 6. Rules and constraints

### Hard constraints — violating these means stopping

| # | Constraint | Source |
|---|---|---|
| **C1** | Threadline never displaces certificate work. If a month closes under its hour target and Threadline hours were spent, **Threadline pauses.** | `TASKS.md` §16 |
| **C2** | `core/` never imports Wails | keeps the escape hatch open |
| **C3** | The IPC contract stays under 20 commands | boundary-leak tripwire |
| **C4** | `TASKS.md` is only ever modified by the byte-exact write path | Schema §6 |
| **C5** | The round-trip test passes, or write-back ships disabled | Schema §6 |
| **C6** | No number is displayed that wasn't measured or read from a file | Concept §6 |
| **C7** | No network calls, ever | it is a local-first app |
| **C8** | Phase 0 exceeds four evenings → switch to Electron | ADR-001 action items |

### Working rules

- **Spec before code.** Parse rules are frozen in `Threadline-Schema.md` §4; tests are written against the spec, not the implementation.
- **Every phase exits on an objective check**, never on a feeling.
- **Snapshot `TASKS.md` before the first write of each day.** It costs nothing for a 15 KB file.
- **Commit the DB migration with the code that needs it.** Never separately.
- **When a reconciliation check starts failing, treat it as information** — either the plan changed or the parser broke. Both deserve investigation.
- **Skip must always be free.** No streaks, no badges, no guilt mechanics. Ever.

---

## 7. Competency outcomes — the matrix as a build specification

This is the part that turns Threadline from "a personal project" into evidence. **These rows do not close by accident.** Each is a design directive: build it this way, and the row closes honestly.

Current state: **58 Done · 47 Partial · 83 Not started** of 188.

### Rows Threadline can close — if built deliberately

| Row | Skill | Now | How Threadline closes it |
|---|---|---|---|
| **23** | Performance vs. Scalability | Partial | ADR-001 articulates formally *why scalability is not a requirement here and performance is* — the row's stated gap is "not formally articulated" |
| **33** | Law of Demeter | Not started | Layer rule C2: frontend never reaches through the bridge into core internals |
| **35** | Encapsulate what varies / abstractions | Partial | The IPC contract is the abstraction; viewers are swappable behind one interface |
| **36** | Tell, Don't Ask | Not started | Commands instruct (`TickItem`), they don't expose state to be inspected and mutated |
| **45** | Naming, style, consistency | Partial | `golangci-lint` + a written style rule, enforced in CI |
| **46** | Small units, low cyclomatic complexity | Partial | `gocyclo` gate in CI with a recorded threshold |
| **47** | Pure functions, CQS | **Not started** | **The parser is naturally pure — bytes in, structs out, no I/O. The IPC contract is explicitly split into queries and commands.** Among the cleanest fits in the matrix |
| **48** | Keep framework code distant | Partial | C2 is exactly this rule, mechanically enforced: `core/` has zero Wails imports |
| **50** | Keep it simple, refactor often | Partial | V0 scope discipline; deferred-features list |
| **56** | Coupling, cohesion, boundaries | Partial | The derived/stored boundary (Schema §1) made visible in the package layout |
| **59** | Component-based architecture | Partial | Frontend components + Go packages with explicit interfaces |
| **92** | SQL vs. NoSQL decision-making | Partial | Documented reasoning for SQLite over Postgres/NoSQL, argued from quality attributes — a *second* documented instance beyond Eventora |
| **110** | What is software architecture | Partial | ADR + schema + this plan, produced before the code |
| **112** | Architect responsibilities | Partial | Requirements elicitation, tech decision, documentation, standards enforcement — all evidenced in writing |
| **113** | Decision-making, simplifying complexity | Partial | ADR-001 with a weighted matrix, a reversal, and a documented correction |
| **117** | Documentation, estimation, evaluation | Partial | Four documents plus phase estimates that can be checked against actuals afterward |
| **123** | Database normalization | Partial | The SQLite schema, normalised with stated reasoning |
| **126** | Database indexing strategy | Partial | Indexes in Schema §8 with explicit justification for each |
| **130** | In-process caching beyond Redis | **Not started** | **The derived model IS an in-process cache — rebuilt on content-hash change, never persisted.** A textbook instance |
| **137** | Performance profiling | **Not started** | **Go's `pprof` in Phase 6, against the N1–N4 targets.** Row's gap is "no profiling done"; this closes it directly |
| **169** | CD / full deploy automation | Partial | Phase 7: Actions-driven test → build → release. Row's gap is "not Actions-driven" |
| **185** | Git branching workflow | Partial | A stated branching strategy, followed and documented |

**22 rows: 5 Not started → Done, 17 Partial → Done.**

Projected: **80 Done (43%) · 30 Partial · 78 Not started** — up from 31%.

### Conditional rows — only if built a particular way

| Row | Skill | Condition |
|---|---|---|
| 61 | Publish-Subscribe | Only if the fsnotify watcher feeds a real internal event bus with multiple subscribers |
| 70 | Microkernel / plugin architecture | Only if viewers are genuine plugins registered by file type |
| 125 | Query plan analysis | Only if you actually run `EXPLAIN QUERY PLAN` on the FTS and session queries and record findings |
| 127 | Cache-Aside | Only if the derived-model cache is written in that pattern explicitly |
| 167 | End-to-end testing | Only if a UI-driving suite exists — **this overlaps certificate project A; do not double-count** |

### What Threadline cannot evidence — be honest about this

Microservices · serverless · GraphQL · gRPC · replication · sharding · load balancing · CDN · circuit breakers · distributed tracing · NoSQL stores.

**A single-user desktop app touches none of them, and claiming otherwise would poison the matrix's credibility.** Those belong to certificate project B (AWS) and the System Design study topic — 175pp, 35h, the largest block in the plan. The three tracks are complementary by design; none is a substitute for another.

### The rule this creates

> **Update the competency matrix at each phase exit, with the commit or document that proves the row — not at the end from memory.**

A row marked Done without a link to evidence is exactly the kind of number rule C6 forbids.

---

## 8. Definition of done — V0 ships when

- [ ] All 12 functional requirements pass their acceptance conditions
- [ ] All 8 non-functional targets **measured** and recorded
- [ ] Round-trip write-back test green in CI
- [ ] `go test ./...` green; lint and complexity gates clean
- [ ] `git tag` produces a runnable `.exe` with no manual steps
- [ ] README explains the architecture and the schema decisions
- [ ] Competency matrix updated with evidence links for every row claimed
- [ ] **You have used it for three weeks and answered the Phase 8 questions**

The last box is the only one that actually matters.

---

## 9. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| pdf.js page control harder than expected in WebView2 | Medium | **Fatal to V0** | Phase 0 tests it *first*; four-evening stop trigger |
| Wails v2 → v3 migration | Certain, eventually | Low | ~a weekend, Go code untouched; v2 keeps working |
| Spare hours don't materialise | **High** | Project stalls | C1 pauses it honestly rather than letting the plan drift |
| Scope creep from the deferred list | High | Never finishes | V0 list is frozen; Phase 8 gate before any V1 work |
| Byte-exact write-back has a bug | Low | **Loses `TASKS.md`** | Round-trip test in CI + daily snapshot + atomic write |
| Building the tool replaces doing the work | **High** | Certificates slip | C1, and the Phase 8 honesty questions |

The two `High` likelihood rows are behavioural, not technical. That is the correct read: **the technical risks here are manageable, and the discipline risks are the real ones.**
