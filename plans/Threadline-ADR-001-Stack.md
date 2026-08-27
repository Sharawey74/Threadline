# ADR-001: Threadline desktop technology stack

**Status:** **Accepted** — Go + Wails v2
**Date:** 27 August 2026 (amended same day: Go already known, see correction under *Weighted comparison*)
**Decider:** Sharawey
**Supersedes:** the informal "Electron because Playwright" recommendation, which was void once Threadline stopped being certificate project A

---

## Context

Threadline is a local-first desktop app: one window for reading study material, ticking checkboxes in `TASKS.md`, and recording where hours actually went. Full design in `Threadline-Concept.md`; data model in `Threadline-Schema.md`.

### Constraints given

| Constraint | Source |
|---|---|
| **Rust and Tauri are disfavoured, not excluded** | Stated preference — overview-level interest only, no intent to learn Rust. Evaluated in full as Option F, and revisited without this constraint in §*Unconstrained recommendation* |
| **No certificate dependency** | Threadline is a personal project (`TASKS.md` §8), not ISTQB or SAA evidence |
| **Unbudgeted hours** | Funded outside the 292h plan; pauses if any month closes under target |
| **Portfolio variety is wanted** | Demonstrating range across stacks is itself an engineering signal |
| **Windows only** | One machine, one user |

### Quality attributes, weighted honestly

The brief asked for scalability, performance and efficiency. Two of those apply. One does not, and saying so is part of the analysis.

| Attribute | Requirement | Notes |
|---|---|---|
| **Scalability** | **None.** Not a constraint. | 1 user · 1 machine · <10,000 rows · ~5 MB database · no network. Designing for scale here would be architecture theatre — the correct engineering answer is to recognise the attribute doesn't apply and spend the effort elsewhere. |
| **Startup latency** | **High.** Target <2s cold. | It replaces double-clicking a PDF. Slower than Explorer means it doesn't get opened. |
| **Memory footprint** | **Medium-high.** | The origin story is four apps eating RAM for one task. The bar is *lighter than the four it replaces*, not lighter than every possible app. |
| **Responsiveness** | **High.** | PDF page turns and search must feel instant, or Chrome wins. |
| **Maintainability (solo, multi-year)** | **High.** | One maintainer, indefinitely, in spare hours. Dependency churn is a real cost. |
| **Portability** | **Low.** | Windows. macOS and Linux are not requirements. |
| **Security** | **Low.** | Local, single-user, offline, no untrusted input beyond his own files. |
| **Time to first daily use** | **Highest.** | The two named failure modes are *"became homework"* and *"never finished."* Product design handles the first. Stack choice mostly determines the second. |
| **Portfolio variety** | **Medium.** | A career attribute, not a software one — weighted explicitly and separately so it can't quietly dominate. |

### The decisive functional requirement

**PDF rendering with programmatic page control.** The curriculum is 396 pages of PDF read across five months; "reopens on the page you stopped at" is the feature that makes Threadline worth opening. Everything else in V1 is comparatively easy. This single requirement eliminates more candidates than all the quality attributes combined.

---

## Decision

**Go + Wails v2, with a TypeScript/web frontend and pdf.js — behind a deliberately narrow IPC contract that keeps Electron a documented fallback.**

The narrow contract is half the decision. It converts an irreversible framework bet into a reversible one (see *Consequences*).

---

## Options considered

### Option A — Electron + TypeScript + React

| Dimension | Assessment |
|---|---|
| Complexity | Low |
| PDF capability | Excellent — pdf.js, the renderer Firefox ships |
| Startup / memory | Worst here: ~100–200 MB, 1–2s cold |
| Familiarity | High — already shipped TypeScript/Next.js |
| Maturity | Highest — 10+ years, enormous ecosystem |

**Pros:** fastest possible route to a working tool; every V1 library already exists; when stuck, an answer exists somewhere.
**Cons:** heaviest runtime of all candidates, in an app whose origin story is memory pressure; adds essentially **zero portfolio variety** — TypeScript is already shipped; node_modules churn is a real multi-year maintenance tax.

### Option B — Kotlin + Compose Desktop

| Dimension | Assessment |
|---|---|
| Complexity | Medium-high |
| PDF capability | **Weak** — PDFBox renders pages to images; the viewer is hand-built |
| Startup / memory | Poor — JVM warmup, ~150–250 MB |
| Familiarity | Medium — Kotlin is a short step from Java |
| Maturity | Medium |

**Pros:** stays on the JVM he genuinely knows; Compose is a modern, pleasant UI model.
**Cons:** the decisive requirement is the weakest here. Building a PDF viewer — scrolling, zoom, page tracking, text selection — from PDFBox primitives is realistically 15–25 hours *before* any Threadline feature exists. That is where this project dies.

### Option C — C# / .NET 9 + Avalonia

| Dimension | Assessment |
|---|---|
| Complexity | Medium-high |
| PDF capability | Good — PDFium bindings, or WebView2 hosting pdf.js |
| Startup / memory | Very good — ~50–80 MB, sub-second with AOT |
| Familiarity | **Low — entirely new ecosystem** |
| Maturity | High |

**Pros:** excellent runtime characteristics; strongest single option for portfolio variety; C#/.NET carries real weight in the Egypt/Gulf enterprise market.
**Cons:** *everything* is new at once — language, runtime, UI framework, tooling, packaging. This is the same failure pattern as Tauri, just with a friendlier language. Highest risk of stalling at 60%.

### Option D — Go + Wails v2 + TypeScript frontend ★

| Dimension | Assessment |
|---|---|
| Complexity | Medium |
| PDF capability | Excellent — WebView2 hosts pdf.js, identical to Electron |
| Startup / memory | **Best** — ~40–60 MB, sub-second; WebView2 is already part of Windows |
| Familiarity | Split: frontend familiar, backend new but shallow |
| Maturity | v2 stable; **v3 still beta as of 2026** |

**Pros:** the frontend — where most of Threadline's work actually lives — is the same HTML/CSS/TypeScript he'd write for Electron, with the same pdf.js. Only the backend half is new, and Go is deliberately small: ~2 weeks to productive from a Java background. Go's standard library is genuinely strong at exactly what the derived model needs — file walking, regex, byte-exact I/O. Binaries are ~10 MB rather than ~100 MB, and it adds a language that's directly relevant to his backend/cloud target roles and complements the AWS SAA work.
**Cons:** Wails' community is far smaller than Electron's — fewer answers when stuck. **v3 is beta**, so this means committing to v2 and accepting an eventual migration. cgo for SQLite adds build friction (mitigable with a pure-Go driver).

### Option E — Python + PySide6 (Qt)

| Dimension | Assessment |
|---|---|
| Complexity | Medium |
| PDF capability | Excellent — PyMuPDF is arguably the best PDF library anywhere |
| Startup / memory | Poor — 2–4s cold, ~80–120 MB |
| Familiarity | High — Python already shipped |
| Maturity | High |

**Pros:** the parser prototype is already Python; PyMuPDF is superb.
**Cons:** packaging a Python desktop app for Windows is genuinely painful; slowest startup in the group; adds no portfolio variety.

### Option F — Tauri v2 + Rust + TypeScript frontend

| Dimension | Assessment |
|---|---|
| Complexity | High |
| PDF capability | Excellent on Windows — WebView2 hosts pdf.js, same as D |
| Startup / memory | **Best of every option** — ~30–50 MB, sub-second, ~5–10 MB binaries |
| Familiarity | **Lowest** — Rust is a genuinely difficult first language to add |
| Maturity | **v2 is stable** (unlike Wails v3), with a substantially larger community than Wails |

**Pros:** the strongest engineering artifact of the six. Rust's compiler is not generic safety marketing here — it lands precisely on Threadline's two riskiest areas. **Byte-exact write-back to `TASKS.md`**, a file the whole plan depends on, is exactly the class of code where Rust's ownership model and explicit error handling prevent the silent corruption that a `catch` block quietly swallows. And the **filesystem watcher plus session recording** is concurrent code, where Rust prevents data races at compile time rather than at 2am. Cargo doesn't rot the way `node_modules` does — a Rust project builds unchanged in five years. Tauri v2 being *stable* is a real advantage over Wails v3's beta status. Highest portfolio signal of any option.

**Cons:** **the ramp is the whole story.** Rust from a Java/TypeScript background is realistically 2–3 months to genuine productivity, not the ~2 weeks Go takes — the borrow checker is a conceptual wall, not a syntax difference. For a project funded from *unbudgeted spare hours*, that ramp lands entirely before the first useful feature exists. Cross-platform Playwright testing is unavailable (irrelevant here — Windows-only, not a certificate project). Smaller crate ecosystem for desktop-app conveniences than npm's.

---

## Weighted comparison

Weights reflect the quality-attribute table above. Scores 1–5.

> **Correction, 27 Aug 2026 — Go is already known.** Row 9 of `roadmap_competency_matrix_v3.xlsx` records **Go: Done** — *"SysPlex — concurrent metric-collection daemons using goroutines/channels."* The ~2-week Go ramp assumed below **does not exist**, and the concurrency experience maps directly onto Threadline's filesystem watcher and session recorder. Option D's *time to first daily use* rises 4 → 5; its *portfolio variety* falls 5 → 4, since Go is already on the matrix. Scores below are corrected.

| Criterion | Weight | A Electron | B Compose | C .NET | **D Go+Wails** | E Python | F Tauri |
|---|---|---|---|---|---|---|---|
| Time to first daily use | 25% | 5 | 2 | 2 | **5** | 3 | **1** |
| PDF + markdown rendering | 20% | 5 | 2 | 4 | 5 | 5 | 5 |
| Startup + memory | 15% | 2 | 2 | 4 | 5 | 2 | 5 |
| Solo maintainability | 15% | 4 | 4 | 4 | 4 | 3 | 5 |
| Portfolio variety + market fit | 15% | 1 | 3 | 5 | **4** | 1 | 5 |
| Ecosystem depth when stuck | 10% | 5 | 3 | 4 | 3 | 4 | 4 |
| **Weighted total** | | **3.80** | **2.55** | **3.65** | **4.50** | **3.05** | **3.90** |

**Read Tauri's row carefully.** It scores best-or-tied-best on *five of six* criteria. It finishes third only because of a single `1` — and that `1` carries the heaviest weight in the table. Strip out the ramp-up cost and Tauri wins outright; that is exactly what the unconstrained analysis below does.

---

## Trade-off analysis

**The real contest is A vs D, and they differ on one axis: how much of the app is unfamiliar.**

The insight that decides it: **Electron and Wails share a frontend.** Same HTML, same TypeScript, same pdf.js, same CSS. The workbench, the viewers, the Today screen — the large majority of Threadline's actual work — is byte-for-byte the same code either way.

What differs is the other side of the IPC boundary: Node vs Go for filesystem access, `TASKS.md` parsing, SQLite, and session recording. That layer is **maybe 30% of the codebase**, and it is precisely the layer where Go is *better* than Node — stronger typing, a superior standard library for file walking and byte-exact I/O, and no dependency tree to rot.

So the learning cost isn't "learn a new stack." It's "learn a small language for the smaller half of the app." That is a far cheaper bet than C# or Compose, where the UI paradigm is unfamiliar too.

**Against D, honestly:** Wails v3 being beta means committing to v2 and eventually migrating. Electron has no such cliff. If Threadline hits a Wails-specific wall — a WebView2 quirk, a packaging failure — the pool of people who've hit it before is small.

**Why D still wins:** because the fallback is cheap, and that changes everything. Which is the next section.

**Where Tauri sits.** F is the strongest *artifact* and the weakest *plan*. Note that D and F are architecturally near-identical — both are a native binary hosting a WebView2 frontend with pdf.js, both talk over a narrow command bridge, both produce a small fast executable. The frontend code is the same in either. **The only real difference is which language sits behind the bridge, and how long it takes to become fluent in it.** Go: ~2 weeks. Rust: ~2–3 months. On unbudgeted spare hours, that difference is the entire decision — and the escape hatch below means it isn't even permanent.

**Rejected outright:** B, because the decisive requirement is its weakest dimension. C and E score respectably but neither survives the time-to-first-use weighting — C makes everything unfamiliar at once, E dies at packaging.

---

## Consequences

### What becomes easier
- Startup and memory land where they should for an app that exists to *reduce* app sprawl
- The derived-model parser maps cleanly onto Go's stdlib — regex, `filepath.WalkDir`, byte-exact file handling
- A single ~10 MB binary, no installer ceremony
- Portfolio gains a genuinely new language, directly relevant to backend and cloud roles
- Go's tiny dependency surface means the project still builds in three years

### What becomes harder
- Two languages instead of one — a context switch across the IPC boundary
- Smaller community; some problems will need solving from first principles
- cgo/SQLite build friction on Windows — **mitigate by using a pure-Go SQLite driver**, accepting a small performance cost that is irrelevant at this data size
- An eventual v2 → v3 migration

### The escape hatch — and why it's the important half of this decision

**Design the IPC boundary as a deliberate, narrow contract from commit one.** Something close to:

```
listProjects()        readFile(path)         watchFolder(path)
parsePlan()           tickCheckbox(anchor)   savePosition(artifact, page)
startSession(scope)   endSession(note)       search(query, filters)
```

A dozen or so commands, plain data in and out, no framework types crossing the line.

If Wails proves to be the wrong bet, **the entire frontend ports to Electron unchanged** and only the Go layer is rewritten — roughly 30% of the code, against a contract already written down. A high-stakes irreversible framework bet becomes a bounded, reversible one.

This is also just better architecture. It's testable in isolation, and it makes the derived/stored boundary from `Threadline-Schema.md` §1 visible in the code structure rather than implied by it.

### What to revisit
- **After V0 ships:** did Go cost more than the estimated ~2 weeks of ramp-up?
- **When Wails v3 reaches stable:** migrate, or stay on v2?
- **If the IPC contract exceeds ~20 commands:** the boundary is leaking and the escape hatch is closing

---

## Action items

1. [ ] Two-day Go spike: read `TASKS.md`, run the §4 parse rules, print the reconciliation — no UI. This validates both the language choice and the parser port before anything is committed to.
2. [ ] Wails v2 hello-world with pdf.js embedded, opening one study PDF at a specified page. **This is the riskiest technical assumption in the whole plan — test it first, on day one.**
3. [ ] Write the IPC contract down as a typed interface before implementing either side of it
4. [ ] Choose the SQLite driver — pure-Go (`modernc.org/sqlite`) unless FTS5 support forces cgo; verify FTS5 availability during the spike
5. [ ] Port the Python prototype's parse rules to Go, with the §4 ambiguity cases as table-driven tests
6. [ ] If items 1–2 take longer than four evenings, **stop and switch to Electron.** Write that trigger down now, while the decision is still cheap to reverse.

---

## Unconstrained recommendation

*Asked directly: setting aside the stated preferences — no Rust, portfolio variety, existing TypeScript and Java experience — which would I actually choose?*

### Re-weighted without personal factors

Portfolio variety is removed entirely (it's a career attribute, not a software one). Familiarity is neutralised — assume a competent engineer with no prior advantage in any of these. "Time to build" now means *intrinsic difficulty*, not personal head start.

| Criterion | Weight | Electron | Compose | .NET | Go+Wails | Python | **Tauri** |
|---|---|---|---|---|---|---|---|
| Time to build (intrinsic) | 25% | 5 | 2 | 4 | 4 | 4 | 3 |
| PDF + markdown rendering | 22% | 5 | 2 | 4 | 5 | 5 | 5 |
| Startup + memory | 18% | 2 | 2 | 4 | 5 | 2 | 5 |
| Maintainability over 3+ years | 20% | 3 | 4 | 4 | 4 | 3 | 5 |
| Ecosystem depth | 15% | 5 | 3 | 4 | 3 | 4 | 4 |
| **Weighted total** | | **4.06** | **2.55** | **4.00** | **4.25** | **3.66** | **4.35** |

### The answer: Tauri v2 + Rust

Three reasons, in order of weight:

**1. Rust's guarantees land exactly where this app is dangerous.** Threadline writes to `TASKS.md` — the single file the entire career plan lives in. Schema §6 demands byte-exact splicing, verify-before-write, atomic rename, and snapshot-first. In Rust, `Result` makes every failure path something the compiler forces you to handle; in TypeScript or Go it's a return value you can ignore, and in a `try/catch` it's an error you can silently swallow. The filesystem watcher and session recorder are concurrent, and Rust rejects data races at compile time. This isn't generic "Rust is safe" advocacy — it's that *this particular app's two riskiest subsystems are precisely the ones Rust is best at.*

**2. It ages best.** A three-year-old Cargo project builds. A three-year-old `node_modules` is an archaeology exercise. For software one person maintains alone in spare hours across years, resistance to dependency rot is worth more than initial velocity — and this app is meant to outlive the plan that motivated it.

**3. Tauri v2 is stable; Wails v3 is not.** That's the one clear objective advantage Tauri holds over the option I actually recommended, and it's not small. Choosing Wails means v2 plus a migration you know is coming.

### But the margin is thin — 4.35 vs 4.25

That's a 2% gap, which is well inside the noise of my own scoring. Anyone weighting "time to build" at 30% instead of 25% flips the result to Wails. **Don't read this as Tauri being clearly right and the recommendation being a compromise.** Read it as: these two are architecturally the same design — a native binary hosting a WebView2 frontend with pdf.js, talking over a narrow command bridge — and they differ mainly in which language sits behind that bridge.

### Where the framing is slightly wrong

Calling time-to-completion "personalization" isn't quite right, and I want to be straight about that.

**Who is building the software is an engineering input, not a personal footnote.** A stack that produces a better artifact nobody finishes is worse engineering than one that produces a good artifact that ships. Every real ADR weighs team capability; that's why "team familiarity" appears in the standard template. So the honest reading of this section isn't *"Tauri is the right choice and personal factors override it."* It's:

> **Tauri is the better piece of technology. Go + Wails is the better decision for this project.**

Those are different claims and both are true.

### What would change the recommendation to Tauri

- If Threadline were funded from **budgeted** hours rather than spare ones, so a 2–3 month ramp could be planned rather than absorbed
- If it were going to be **distributed to other people**, where binary size, memory and correctness compound across users
- If Rust were a **career goal in itself** — but on the roadmap as written, targeting backend and cloud roles with AWS SAA in progress, **Go is the better-aligned language.** Rust is rarer and more impressive; Go is more likely to appear in the job descriptions actually being targeted. The instinct to skip Rust holds up on career grounds, not just preference.
- If the **escape hatch proves it works**: build V0 on Wails, and if the narrow IPC contract holds cleanly, porting the Go layer to Rust later is a bounded exercise against an interface already written down — with a working app in hand the whole time. **That is genuinely the best of both, and it's available precisely because of the contract in the Consequences section.**

---

## Appendix: what changed from the previous recommendation

The earlier answer was Electron, on the reasoning: *Threadline = certificate project A = ISTQB evidence = must be drivable by Playwright = Tauri can't, Electron can.*

Restructuring Threadline into its own tier (`TASKS.md` §8) removed the Playwright constraint entirely, which removed the only reason Electron was ahead. Tauri was initially set aside by the no-Rust preference rather than by test tooling; it has since been evaluated in full as Option F, and it wins the unconstrained analysis.

Worth noting explicitly: **the previous recommendation was correct given its premise.** The premise changed.

---

**Sources consulted:** [Wails v3 status](https://v3.wails.io/), [Wails introduction](https://wails.io/docs/introduction/), [Playwright Electron API](https://playwright.dev/docs/api/class-electron), [Tauri WebDriver testing](https://v2.tauri.app/develop/tests/webdriver/)
