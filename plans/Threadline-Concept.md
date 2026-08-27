# Threadline

**One window for everything your career runs on — and it remembers where you left off.**

*Concept document, v3. Product only, no engineering. Now grounded in the real `Desktop\Career` folder.*

---

## 1. The problem

Two pains, not one.

### Pain A — the work has no memory outside your head

You work on different things every day: a new project, continuing an old one, an open-source PR, a chapter of CCNA, a research report you wrote, a roadmap file, a course. Each one gets dropped mid-thought. Three weeks later the files are still there, but *why you opened them* is gone.

> Files persist. Context evaporates.

### Pain B — one task, four applications

To do one evening's work you open a Markdown reader, a browser for the PDF, another browser for a course video, an editor for your checklist, and Explorer to find any of it. Five apps, twenty tabs, all the RAM, attention scattered across every one.

> The material for one task lives in five places that don't know about each other.

### These two pains solve each other

The central insight of the design:

```
Because you CONSUME inside it        →   it OBSERVES everything you do
Because it observes everything       →   memory costs you almost nothing
Because memory costs almost nothing  →   it never becomes homework
```

A memory app alone needs feeding, and feeding is what kills these apps. A reader app alone is convenient but forgettable. **Together, the reader earns its place by beating four apps, and pays you back by remembering for free.**

```
        WORKBENCH                    +                MEMORY
   where the work happens                      what the work was
```

---

## 2. The third pain, found in the data

Reading the actual `Desktop\Career` folder surfaced something neither of us had named. From `TASKS.md` §15:

> **"Hours are the constraint, not motivation. 292 hours, fully allocated, no buffer. Anything new displaces something — name what it displaces before saying yes."**

292 hours across 23 weeks, allocated to the hour, with **no buffer**. That is a hard budget, and by your own words it is *the* constraint on the entire plan.

**And you have no instrument for measuring it.**

Right now you cannot answer: *did I actually put 12.5 hours in last week?* Nothing on your machine knows. The plan is precise; the measurement doesn't exist.

> **Threadline is that instrument.**

This reframes the whole product. Session timing stops being a vanity metric — it becomes the missing half of a plan you have already committed to in writing. Everything else in this app is good. *This* is the part you cannot get any other way.

```
TASKS.md says            292h, 23 weeks, 12.5h/week, no buffer
Threadline answers       where you actually are against it
```

---

## 3. Your folder is already the schema

The question was whether the app imposes a structure or adapts to your mess. It's now moot — **your structure is better than any convention I'd have proposed.** It maps almost one-to-one onto the model.

```
Desktop\Career\                                  →  CAREER (the container)
│
├── TASKS.md                                     →  THE PLAN
│   § 4  study curriculum, 9 topics, checkboxes  →     Learn tasks + sequence
│   § 6,7 side project checklists                →     Build tasks
│   § 8–13 month blocks with hour budgets        →     the schedule
│   § 14 decision log                            →     project history
│   § 15 standing rules                          →     the constraints
│
├── FAANG_Readiness_Roadmap.md                   →  background roadmap
│
├── Study guided & notes\                        →  LEARN stream
│   ├── 01 - Web & Language Foundations\         →     topic (numeric prefix = order)
│   ├── 02 - Databases & Storage\   6 PDFs       →     topic + its material
│   └── ... 09 - AI\                             →     28 PDFs, 396 pages total
│
├── Roadmap tracking documents\                  →  CAREER LAYER
│   ├── roadmap_competency_matrix_v3.xlsx        →     188 skills, status-tracked
│   ├── Egypt_Global_Target_Employers_Tracker    →     PURSUE stream
│   └── roadmaps_pdf\  (4 source roadmaps)       →     the external denominator
│
├── Next Project - Planning docs\  (11 docs)     →  BUILD stream (GigLedger)
├── manual linkdin jobs\                         →  PURSUE
├── revlecent text files\                        →  loose notes
└── screenshots\                                 →  26 files, zero context
```

### Three things this settles

**The syllabus orders itself.** `01 -` through `09 -` is the set and its natural order. `TASKS.md` §4 overrides it with the *study* order (2, 3, 8, 1, 6, 7, 5, 4, 9) plus page counts and hour estimates. The app needs no ordering logic of its own — both facts are already written down.

**`TASKS.md` is the task database.** A line like:

```markdown
- [ ] **1. `02 - Databases & Storage`** — 49pp, ~7h — ACID, indexing, PostgreSQL...
```

carries, in one line: a task, its order, a **backtick-quoted folder name that links it to its material**, a size, and an hour estimate. That's the file→project mapping, already authored by you. Ticking the box in Threadline turns `- [ ]` into `- [x]` in the real file.

**Progress has an honest denominator everywhere.** 9 topics. 396 pages. 188 competency rows. 292 hours. Every number in this app can come from a file you wrote — nothing has to be invented.

---

## 4. The founding decision: your files ARE the data

Threadline does not own your work. It is a **lens over your filesystem**, not a container for it.

```
   TASKS.md · study PDFs · competency matrix · planning docs · screenshots
                        (your actual files, where they are)
                                     ▲
                                     │  reads · renders · writes back
                                     │
                              ┌──────────────┐
                              │  THREADLINE  │
                              └──────────────┘
                                     │
                                     ▼
                    stores ONLY what files can't hold:
                    sessions · hours · access counts · notes · links
```

- **No migration.** Point it at `Desktop\Career`. Done.
- **No double entry.** Ticking a box edits the real Markdown.
- **No lock-in.** VS Code still opens everything; git still versions it. If Threadline dies you lose the session log and nothing else.
- **Honest progress for free.** You wrote the denominators.

---

## 5. The structure

```
CAREER  ───────────────────────────────  the one thing everything serves
   │
   ├── The plan             TASKS.md
   ├── The scorecard        competency matrix — 188 skills
   │
   └── Streams
        ├─ LEARN           9 topics · 396pp · 81h · 2 certificates
        ├─ BUILD           side project A (Oct–Nov) · side project B (Dec–Jan)
        ├─ CONTRIBUTE      2 merged PRs · 14h
        └─ PURSUE          employer tracker · saved job posts
             │
             └── Sessions ──> Artifacts
                              md · pdf · docx · xlsx · link · note · screenshot
```

Your day cuts **across** streams. Your meaning accumulates **down** the career. Hence *Today* as the home screen and *Career* as the long view; the session sits between.

| Stream | Plan comes from | Observable data | Progress shown as |
|---|---|---|---|
| **Learn** | a syllabus that already exists | you opening PDFs | real % — 9 topics, 396 pages |
| **Build** | your own planning docs | files, edits, commits | checklist counts from your files |
| **Contribute** | someone else's repo | PR/issue state | merged vs open |
| **Pursue** | a pipeline, not a plan | CV files, saved posts | items per stage, days waiting |

**The honest-numbers rule:** show a percentage only when the denominator came from outside your head. Your files satisfy this everywhere — which is why the rule costs you nothing.

---

## 6. The four surfaces

### 6.1 Today — the home screen

What Threadline could show **on day one, before it has observed a single session** — every figure below is computed from files that already exist:

```
┌────────────────────────────────────────────────────────────────────┐
│  Thursday 27 August 2026                     Week 1 of 23     ⌘K  │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  THE BUDGET                                    TASKS.md §3         │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░  —  of 292h       not measured yet    │
│  This week    — of 12.5h                       no buffer           │
│                                                                    │
│  NEXT — Now → Sun 30 Aug                          19h  · §8        │
│  ○ Delete duplicate pages in Study guided & notes        0.5h      │
│    ↳ found: 11 byte-identical groups (1 study PDF, 10 screenshots) │
│  ○ Notes track — topics 1 & 2                             15h      │
│    ↳ 02 - Databases & Storage · 6 PDFs · 49pp                      │
│  ○ ISTQB CTFL v4.0 syllabus, Egypt provider, price, dates   2h     │
│  ○ Shortlist 3–5 open-source repos                        1.5h     │
│  ○ Wrap Alstom internship                                          │
│                                                                    │
│  STUDY CURRICULUM                    0 of 9 topics · 396pp · 81h   │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  0%                              │
│                                                                    │
│  COMPETENCY                     188 skills · 4 source roadmaps     │
│  Done         ████████░░░░░░░░░░░░░░░░░░   58    31%               │
│  Partial      ██████░░░░░░░░░░░░░░░░░░░░   47    25%               │
│  Not started  ░░░░░░░░░░░░░░░░░░░░░░░░░░   83    44%               │
│                                                                    │
│  Biggest gap: Architecture & System Design      25 of 96 done      │
│                                                                    │
│  GOING COLD                                                        │
│  Next Project - Planning docs            untouched 30 days         │
└────────────────────────────────────────────────────────────────────┘
```

*Going cold* surfaces neglect **as information, not accusation.** No streaks, no red badges.

### 6.2 Workbench — where the work actually happens

The screen that replaces four applications.

```
┌──────────────────────────────────────────────────────────────────┐
│ 02 - Databases & Storage ▾   Redis.pdf · ACID.pdf · TASKS.md §4  │
├────────────┬─────────────────────────────────────────────────────┤
│ MATERIAL   │                                                     │
│ 📕 ACID    │   [ PDF — Redis.pdf, p.12 of 31 ]                   │
│ 📕 Indexing│                                                     │
│ 📕 Postgres│   Persistence: RDB snapshots vs AOF ...             │
│ 📕 Redis ● │                                                     │
│ 📕 SQL 1   │                                                     │
│ 📕 SQL 2   │                                                     │
│            │                                                     │
│ TOPIC      │                                                     │
│ 49pp · ~7h │                                                     │
│ ███░░ 12pp │                                                     │
│            │                                                     │
│ SESSION    │                                                     │
│ 00:47      │                                                     │
│ ┌────────┐ │                                                     │
│ │        │ │  ← note box, always present, never a popup          │
│ └────────┘ │                                                     │
└────────────┴─────────────────────────────────────────────────────┘
```

Material, progress, timer and note in one frame. Markdown in edit / preview / split. **PDFs reopen on the page you stopped at** — which for a 396-page curriculum read over five months is not a nicety, it's the whole thing. Videos and courses are links with a title and a position; no embedded player.

### 6.3 Resume — per project

```
┌─────────────────────────────────────────────────────────────┐
│  06 - System Design                    last worked 24d ago  │
├─────────────────────────────────────────────────────────────┤
│   You left off saying:                                      │
│   ┌───────────────────────────────────────────────────┐    │
│   │  "consistent hashing — reread before ch.6"        │    │
│   └───────────────────────────────────────────────────┘    │
│                                                             │
│   You had open                                              │
│   • Fundamentals v3.pdf       p. 41 of 102                  │
│   • Interview Q&A.pdf         p. 8                          │
│   • System Design Lab.html    opened twice                  │
│                                                             │
│           [ Reopen everything ]     [ Start session ]       │
└─────────────────────────────────────────────────────────────┘
```

With no notes ever written, the quote block simply doesn't appear and everything else still works. That is a hard requirement — see §8.

### 6.4 Career — the scorecard

`roadmap_competency_matrix_v3.xlsx`, rendered live: 188 skills across 4 pillars and 4 sequencing tiers, traced to 4 source roadmaps.

Note: **the Summary sheet in that workbook is currently empty.** The roll-up you built it for has never been filled in. Threadline computes it on open — that alone is the feature justifying this screen.

```
Foundations & Language Ecosystem     ██████████████░░░░  10/16   63%
Software Craft & Production Ops      ████████░░░░░░░░░░  10/27   37%
Performance, Scale & Security        ██████░░░░░░░░░░░░  13/49   27%
Architecture & System Design         ██████░░░░░░░░░░░░  25/96   26%   ← 47 not started
```

This is the "what does the role require vs what do I have" view — and it's already 188 rows of your own honest self-assessment. The app doesn't need to invent it. It needs to *show* it, and to link each row to the study topic that closes it.

---

## 7. Notes exist at two levels

Confirmed: **both**.

```
SESSION NOTE       written when a session ends
                   "stuck on cookie vs header"
                   truthful, timestamped, disposable → powers Resume

PROJECT NOTE       written whenever you want
                   architecture decisions, research, deployment notes
                   durable, edited over time → just .md files in the folder
```

Session notes are a **log**. Project notes are a **document**. Don't merge them.

---

## 8. The prime directive

> **Threadline must be worth opening on a day you wrote nothing.**

The identified failure mode is *"it became homework."* So the exit note is an **enhancement, never a dependency**. §6.1 proves the floor: that entire screen renders with zero session history.

### Anti-homework rules

1. **Never a blank box.** At 1am you won't compose a sentence; you'll edit one. The prompt arrives pre-filled from observed activity.
2. **Skip is free.** One keystroke. No streak, no counter, no red dot, no guilt.
3. **Ask rarely, ask precisely.** Only projects with meaningful time. Fires on app close. Once per project per day.
4. **Never lie to compensate.** A skipped night is a session with data and no note, shown as exactly that.
5. **Make the payoff visible.** The night a note rescues you is what makes you write the next one. That loop *is* the retention strategy.

---

## 9. What "smart" means — three concrete jobs

### Job 1 — Tell me what's next
Parse `TASKS.md` checkboxes, the current month block, hour budgets and folder links; combine with staleness. Produce one ranked list. **This is parsing, not AI**, and it is the highest-value item in the app.

### Job 2 — Organise without being told
New file lands in a topic folder → attached automatically. Screenshots go to the project you were working on when you took them. **And it flags cruft** — the run over your folder today found 11 byte-identical duplicate groups and two versions of the employer tracker in two directories. You already have "delete the duplicates" as a manual task in §8 of `TASKS.md`; the app should just find them.

### Job 3 — Understand my content
- Summarise a PDF or one of your research reports
- *"Show me everything about Kafka"* — across files, notes, sessions and competency rows at once
- Link competency-matrix rows to the study topic that closes them
- **Draft the exit note from what it observed**, so you edit rather than compose

**Order matters.** AI on top of a good index is excellent; AI as a substitute for structure is a mess. Jobs 1 and 2 first. Job 3 is a layer, not a foundation.

*Fast* is not a feature — it's a precondition. Search that stalls or a PDF that takes four seconds to open sends you back to Chrome.

---

## 10. Resolved design questions

| # | Question | Decision |
|---|---|---|
| 1 | Impose a folder convention, or adapt? | **Adapt.** Your structure is already better than a convention. The app also *flags* disorder — duplicates, stale versions, uncontexted screenshots — but never reorganises without asking. |
| 2 | What ends a session? | Switching project, ~15 min idle, or app close. Tea breaks get cut off; a CCNA detour splits the evening into two Eventora sessions. Time shown is time actually spent. |
| 3 | Which project does a file belong to? | You attach it. Auto-suggested from the folder it sits in; `TASKS.md` backtick links resolve most of it already. |
| 4 | How does a Learn syllabus order itself? | Folder numeric prefixes give the set; `TASKS.md` §4 gives the study order. Both already exist. |
| 5 | How deep does search go? | Filenames, notes, checklist items, and **outline sections of PDFs and Markdown** (headings, bookmarks). Not full text. Cheap, fast, and enough. |
| 6 | Is Pursue the same app? | Reframed. Not a job-application pipeline — a **competency gap view**: role requirements vs what you've achieved, driven by the 188-row matrix you already keep. |

---

## 11. Standing design rules

| Rule | Why |
|---|---|
| Your files are the source of truth | No migration, no lock-in, no double entry |
| Worth opening with zero notes | Prevents the homework death spiral |
| Never invent a number | One visibly wrong percentage destroys trust in everything |
| Say what you don't know | "No notes since Aug 3" beats a confident lie |
| Skip costs nothing | No streaks, no nagging, no guilt |
| Pre-fill everything | Editing is cheap, composing is expensive |
| Must beat the four apps it replaces | On speed, not on principle |
| Neglect is information, not accusation | "Going cold," not "you failed" |
| Never reorganise without asking | It's your filesystem, not the app's database |

---

## 12. Deliberately not in this

- Synthetic percentages where you invented the denominator
- An embedded video player — a link with a title and position is enough
- Gantt charts, calendar, habit tracking, Pomodoro
- Comments (you are one person)
- pptx rendering — no good solution exists; open externally
- Any feature requiring you to maintain a plan you don't already maintain

---

## 13. V1

Failure modes to avoid, in order: *became homework*, then *never finished*. Both say the same thing — **get to daily use fast.**

```
V1 — the loop, and only the loop
├── Point it at Desktop\Career
├── Parse TASKS.md — checkboxes, hour budgets, month blocks, folder links
├── One window: Markdown viewer/editor + PDF viewer, side by side
│      PDFs remember the page. This is non-negotiable for a 396-page curriculum.
├── Tick a checkbox → writes [x] back to TASKS.md
├── Record sessions automatically while you read and edit
├── Time against the 292h budget — the number nothing else on your machine knows
├── Exit note on app close — pre-filled, one line, free to skip
├── Today screen: budget · what's next · study progress
└── Search: filenames, checklist items, notes, PDF/MD outline sections
```

Then use it for three weeks and change nothing.

Deferred to V2: the competency matrix screen, Office file preview, links and videos, screenshots, AI, employer tracking, career analytics.

**The test for V1 is not whether it has the features.** It is:

1. Did it get you back into something you'd gone cold on?
2. Did you stop opening the other four apps?
3. **Can you finally answer "am I on track against 292 hours?"**

If all three happen once, it works.

---

## 14. One line

> **Threadline is where you read, work and tick things off — and because everything happens there, it knows where you left off and whether you're on budget.**
