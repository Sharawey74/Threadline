# Threadline — Schema

*Full model, V1 subset marked. Every rule below is backed by a parser run against the real `Desktop\Career` folder — see §9 for the evidence.*

---

## 1. Why this schema is unusual

Threadline does not own your data. That single decision reshapes what "schema" means: there are **two models with a boundary between them**, and almost everything expensive lives on the derived side, where it is parse rules rather than tables.

```
┌─ DERIVED ─ read from your files on every scan, never persisted ────────────┐
│  career · plan · sections · plan items · topics · material · competency    │
│  hour budgets · schedule · syllabus order · reconciliation                 │
│  Source of truth:  TASKS.md · the folder tree · roadmap_competency_*.xlsx  │
└───────────────────────────────────────────────────────────────────────────┘
                                     │
                      ══ THE BOUNDARY ══
                                     │
┌─ STORED ─ SQLite, only what a file cannot hold ───────────────────────────┐
│  sessions · hours · PDF page positions · access counts · session notes    │
│  saved links · tags · search index · duplicate groups · anchors            │
└───────────────────────────────────────────────────────────────────────────┘
```

### The boundary rule

> **If losing it would lose your work, it belongs in a file. If it only describes how you interacted with your work, it belongs in SQLite.**

Applied: a checklist item is your work → file. The 47 minutes you spent on it is interaction → SQLite. A note recording an architecture decision is work → file. A note saying "stuck on cookie vs header" is interaction → SQLite.

**Consequence:** deleting `threadline.db` costs you your history and nothing else. That is the durability guarantee, and it is worth more than any feature.

---

## 2. The finding that drives the model: plan items have roles

The parser found **three views of the same 292 hours** in `TASKS.md`, and they are not duplicates to be deduplicated — they are different *roles*.

```
                    tasks   hours
  CURRICULUM  §4        9      81h    what to study, in order, linked to folders
  SCOPE       §6,§7    17       0h    what the deliverable must contain
  SCHEDULE    §8–§13   24     292h    when the hours actually get spent
  ──────────────────────────────────
  naive sum of every checkbox  373h   ← WRONG by 28%
  true budget                  292h   ← schedule only
```

Verified cross-references:

```
"Notes track" lines across §8–§13    =  81h  ==  §4 curriculum total
"Side project A" lines in months     =  38h  ==  §6 heading budget
"Side project B" lines in months     =  46h  ==  §7 heading budget
```

**Any model that treats all checkboxes alike will over-report your hours by 28%.** Since the entire point of the app is measuring against a 292-hour budget with no buffer, this is the difference between an instrument and a broken instrument.

### The four roles

| Role | Detected by | Carries hours? | Progress measured as |
|---|---|---|---|
| `schedule` | section is a date/month block with `*(Nh)*` | **yes — authoritative** | hours spent vs allocated |
| `curriculum` | leading `**N.**` + backtick link to a topic folder | yes, but **descriptive** | topics completed |
| `scope` | section is a deliverable definition; item has no hours | no | items ticked |
| `admin` | anything else | sometimes | ticked / not |

**Only `schedule` items count toward the 292-hour budget.** Everything else describes work that `schedule` items pay for.

---

## 3. Derived model

```
Career                              the folder root
 ├── Plan                           TASKS.md
 │    ├── window_start/end          "21 Aug 2026 -> 1 Feb 2027"
 │    ├── BudgetLine[]              §3 table: track -> hours (8 rows, 292h)
 │    ├── Section[]                 15
 │    │    ├── number, title
 │    │    ├── budget_hours         from "*(19h)*" or "*(Oct-Nov, 38h)*"
 │    │    └── role                 schedule | curriculum | scope | reference
 │    ├── PlanItem[]                50 checkboxes
 │    │    ├── anchor               stable id — see §5
 │    │    ├── line_no, column      write-back target
 │    │    ├── checked, text, role
 │    │    ├── order                leading "**N.**"
 │    │    ├── hours + confidence
 │    │    ├── pages + confidence
 │    │    └── link -> Topic | Material | None
 │    └── DecisionLogEntry[]        §14 table
 │
 ├── Stream[]                       learn | build | contribute | pursue
 │    └── Topic[]                   "NN - Name" folders; prefix = order
 │         └── Material[]           pdf, md, docx, xlsx, html, txt
 │
 ├── Scorecard                      roadmap_competency_matrix_v3.xlsx
 │    └── CompetencyRow[]           188 rows
 │         id · pillar · sub_area · skill · status · tier · evidence · sources
 │
 └── Reconciliation[]               see §7 — a first-class output, not a debug aid
```

Nothing above is stored. It is rebuilt whenever a source file's hash changes.

---

## 4. Parse rules

All rules below were derived from, and verified against, the real file.

### 4.1 Checkbox

```
^\s*-\s*\[([ xX])\]\s*(.*)$
```
50 matches, 0 false positives. The `[` column is recorded for write-back.

### 4.2 Hours — four surface forms, one meaning

| Form | Example | Emphasis | Meaning |
|---|---|---|---|
| `*Nh*` | `*0.5h*` | italic | allocation |
| `**... — Nh**` | `**Notes track — 15h**` | bold | allocation |
| `~Nh` | `~7h` | tilde | estimate |
| `*(Nh)*` in a heading | `*(19h)*`, `*(Oct–Nov, 38h)*` | — | section budget |

> **Rule:** collect every hour figure on the line. If any are emphasised, take the **last emphasised** one. Otherwise take the last plain one and mark confidence `low`.

Yields 33 of 50 items with hours, confidence `high` on all of them. The remaining 17 are `scope` items, which correctly have none.

**Heading trap:** `*(Oct–Nov, 38h)*` must match as well as `*(19h)*`. A regex requiring the parentheses to hold only the hours silently drops §6 and §7 — 84 hours of side-project budget vanishing without an error. Use `\*\([^)]*?(\d+(?:\.\d+)?)\s*h\)\*`.

### 4.3 Pages

> **Rule:** an unparenthesised `Npp` is the item's size. A parenthesised one describes some *other* file — record it, never use it.

`5. \`06 - System Design\` — 175pp, ~35h — Fundamentals v3 (102pp), Interview Q&A (25pp)` → the item is **175pp**; 102 and 25 belong to two of its PDFs.

### 4.4 Backtick spans are overloaded — this is the sharpest rule

Backticks mean *two different things* in the same document:

```
`02 - Databases & Storage`             a folder link          → resolve
`label:"good first issue" is:open`     a GitHub search query  → do NOT resolve
```

> **Rule:** a backtick span is a link **only if it resolves against the filesystem.** Try, in order: (1) path relative to career root, (2) exact basename match anywhere beneath it, (3) path-suffix match. If none resolve, it is a code snippet — keep it as text and never report it as a broken link.

Verified: 9 of 9 curriculum items resolve to the correct topic folder. The one non-path backtick is correctly rejected.

**Multiple spans per line:** line 105 carries four. When several resolve and exactly one is a folder, the folder is the item's project; the files are references. When that is ambiguous, mark `ambiguous` and let the UI ask.

**Symlinks and junctions — found the hard way.** Testing exposed that recursive globbing does **not** descend into symlinked directories: all 9 topic links silently became `unresolved` while a direct path probe resolved every one. On Windows this matters — OneDrive folders, junctions and hardlinked directories are all common in a folder like this.

> **Rule:** resolution tries the direct path *first* and only falls back to recursive search. Traversal must be explicitly symlink-aware, with a visited-inode set to prevent cycles. And a backtick span that fails to resolve is recorded as `unresolved` **with the reason**, never silently dropped — a link that stops working must be visible, not absent.

### 4.5 Section roles

```
heading has a month/date title + *(Nh)*        → schedule
heading is "Side project X ..." + *(Nh)*       → scope
section contains ordered items linking folders → curriculum
otherwise                                      → reference
```

### 4.6 Topics

`^(\d{2})\s*-\s*(.+)$` on directories under `Study guided & notes`. **The numeric prefix is the canonical order; `TASKS.md` §4 supplies the study order.** Both are kept — they answer different questions.

### 4.7 Normalisation

`TASKS.md` is UTF-8, no BOM, **LF line endings** (verified: 166 LF, 0 CRLF), and contains `— – → · × é`. Normalise dashes and arrows **for matching only**. Never normalise on write — see §6.

---

## 5. Anchors — the hardest problem

Line numbers are not identity. Edit line 20 and every item below it moves, orphaning its stored sessions and hours.

```
anchor = sha256( role || section_title || normalized_text_without_checkbox_and_hours )[:16]
```

Text-derived, position-independent. Re-anchoring on each scan:

1. **Exact anchor match** → same item, keep its history.
2. **Miss** → fuzzy-match unmatched anchors within the same section (token similarity ≥ 0.85). Above threshold, treat as an edit: **migrate the history and record the rename.**
3. **Still no match** → new item.
4. **Anchor with no line** → item deleted from the file. **Never delete its stored history.** Mark `orphaned` and keep it; the hours were really spent, and the user may have simply reworded something.

> **Rule: the store never destroys history because a file changed.** Orphans are surfaced in the UI and re-attachable by hand.

---

## 6. Write-back — the only place Threadline touches your files

Ticking a checkbox is the sole write in V1. It edits **three characters**.

```
before   - [ ] **1. `02 - Databases & Storage`** — 49pp, ~7h — ACID, ...
after    - [x] **1. `02 - Databases & Storage`** — 49pp, ~7h — ACID, ...
                ^
         line 50, column 4 — one byte changed
```

**Non-negotiable rules:**

1. **Verify before writing.** Re-read the line; confirm its anchor still matches. If not, abort and re-scan — the file changed underneath you.
2. **Byte-preserving.** Splice the single byte. Never re-serialise the document, never rewrite lines you did not change. This is what protects `— – → ·`, trailing spaces, and blank-line placement.
3. **Preserve line endings and encoding exactly** as read. LF stays LF; no BOM is added.
4. **Atomic.** Write to a temp file in the same directory, fsync, then rename over the original.
5. **Snapshot first.** Before the first write of each day, copy the file into the app's own storage. Cheap for a 10 KB file, and it means a bug can never cost you `TASKS.md`.
6. **Never reformat, reorder, or "tidy".** Not even whitespace.

**Round-trip test, run on every build:** parse → write every checkbox back to its current value → the file must be **byte-identical**. If that test fails, write-back ships disabled.

### Verified against the real `TASKS.md`

Six tests, run read-only on a copy. All pass.

```
TEST 1  identity round-trip over all 50 boxes        PASS
        sha256 6fd3034d5f7329d4 -> 6fd3034d5f7329d4  unchanged

TEST 2  tick L50
        bytes changed        1   at offset 1933      PASS
        file length          10564 -> 10564          PASS

TEST 3  tick then untick returns original bytes      PASS

TEST 4  content preservation after a tick
        em-dash   85 -> 85     en-dash  11 -> 11     PASS
        arrow      2 ->  2     middot    5 ->  5     PASS
        e-acute    2 ->  2     LF      166 -> 166    PASS
        CR bytes introduced: 0                       PASS

TEST 5  re-parse the modified file
        text · hours · pages · backticks · order
        link_target · link_kind · section · confidence
        ALL DERIVED FIELDS STABLE                    PASS
        exactly 1 item flipped                       PASS

TEST 6  anchor stability
        50 unique anchors for 50 items, no collisions PASS
        50/50 anchors survive the tick                PASS
```

One byte changes. Nothing else in the document moves — not the em-dashes, not the line endings, not a single derived field. That is the guarantee that makes writing to a file you depend on acceptable.

---

## 7. Reconciliation is a feature, not a debug tool

The plan was found to be internally consistent to the hour — **ten checks, ten passes**:

```
OK  §8  Now -> Sun 30 Aug    tasks 19h  vs heading 19h
OK  §9  September            tasks 54h  vs heading 54h
OK  §10 October              tasks 55h  vs heading 55h
OK  §11 November             tasks 54h  vs heading 54h
OK  §12 December             tasks 55h  vs heading 55h
OK  §13 January              tasks 55h  vs heading 55h
OK  month headings           292h       vs budget table 292h
OK  study topic hours         81h       vs budget table row 81h
OK  study tasks                 9       vs topic folders on disk 9
OK  study pages declared      396pp     vs sum of topics 396pp
```

Because consistency currently holds, **drift is meaningful.** If next month the tasks in §11 stop summing to 54h, exactly one of two things happened: you changed the plan, or the parser broke. Both are worth a line on the Today screen.

> This is the "never invent a number" rule made operational. The app doesn't just avoid lying — it continuously proves it isn't.

---

## 8. Stored model — SQLite

`V1` = build now. `V2` = table exists in the design, create it when the feature lands.

```sql
-- ─── meta ────────────────────────────────────────────────────────────
CREATE TABLE app_meta (                                        -- V1
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);  -- schema_version, career_root, created_at

-- ─── source files: change detection for the derived model ────────────
CREATE TABLE source_file (                                     -- V1
  path         TEXT PRIMARY KEY,      -- relative to career root
  content_hash TEXT NOT NULL,
  mtime        INTEGER NOT NULL,
  size         INTEGER NOT NULL,
  last_parsed  INTEGER NOT NULL,
  parse_status TEXT NOT NULL          -- ok | error
);

-- ─── artifacts: any file or link Threadline has ever seen ────────────
CREATE TABLE artifact (                                        -- V1
  id           INTEGER PRIMARY KEY,
  kind         TEXT NOT NULL,         -- file | link
  path         TEXT UNIQUE,           -- relative; NULL for links
  url          TEXT UNIQUE,           -- NULL for files
  title        TEXT,
  ext          TEXT,
  content_hash TEXT,                  -- duplicate detection
  size         INTEGER,
  first_seen   INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'ok'   -- ok | missing | unreachable
);
CREATE INDEX idx_artifact_hash ON artifact(content_hash);

-- ─── where you stopped ───────────────────────────────────────────────
CREATE TABLE artifact_position (                               -- V1
  artifact_id INTEGER PRIMARY KEY REFERENCES artifact(id) ON DELETE CASCADE,
  page        INTEGER,                -- PDF page
  scroll_pct  REAL,                   -- markdown / html
  updated_at  INTEGER NOT NULL
);

CREATE TABLE artifact_access (                                 -- V1
  id          INTEGER PRIMARY KEY,
  artifact_id INTEGER NOT NULL REFERENCES artifact(id) ON DELETE CASCADE,
  session_id  INTEGER REFERENCES session(id) ON DELETE SET NULL,
  opened_at   INTEGER NOT NULL,
  seconds     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_access_artifact ON artifact_access(artifact_id, opened_at);

-- ─── sessions: the instrument ────────────────────────────────────────
CREATE TABLE session (                                         -- V1
  id           INTEGER PRIMARY KEY,
  scope_kind   TEXT NOT NULL,         -- topic | project | plan_item | career
  scope_ref    TEXT NOT NULL,         -- topic slug, folder path, or anchor
  started_at   INTEGER NOT NULL,
  ended_at     INTEGER,
  active_secs  INTEGER NOT NULL DEFAULT 0,   -- idle already excluded
  end_reason   TEXT,                  -- switch | idle | app_close | manual
  note         TEXT,                  -- the exit note; NULL is normal
  note_source  TEXT                   -- typed | edited_draft | skipped
);
CREATE INDEX idx_session_scope ON session(scope_kind, scope_ref, started_at);
CREATE INDEX idx_session_start ON session(started_at);

CREATE TABLE session_artifact (                                -- V1
  session_id  INTEGER NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  artifact_id INTEGER NOT NULL REFERENCES artifact(id) ON DELETE CASCADE,
  seconds     INTEGER NOT NULL DEFAULT 0,
  was_edited  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, artifact_id)
);

-- ─── anchors: bind stored history to derived plan items ──────────────
CREATE TABLE item_anchor (                                     -- V1
  anchor      TEXT PRIMARY KEY,       -- sha256 of normalised text
  role        TEXT NOT NULL,          -- schedule | curriculum | scope | admin
  section     TEXT NOT NULL,
  text        TEXT NOT NULL,          -- last seen text, for fuzzy re-anchor
  first_seen  INTEGER NOT NULL,
  last_seen   INTEGER NOT NULL,
  orphaned_at INTEGER                 -- set when it leaves the file; never deleted
);

CREATE TABLE item_anchor_history (                             -- V1
  id         INTEGER PRIMARY KEY,
  anchor     TEXT NOT NULL REFERENCES item_anchor(anchor),
  event      TEXT NOT NULL,           -- created | reworded | checked | unchecked | orphaned
  detail     TEXT,
  at         INTEGER NOT NULL
);

CREATE TABLE item_session (                                    -- V1
  anchor     TEXT NOT NULL REFERENCES item_anchor(anchor),
  session_id INTEGER NOT NULL REFERENCES session(id) ON DELETE CASCADE,
  seconds    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (anchor, session_id)
);

-- ─── search ──────────────────────────────────────────────────────────
CREATE VIRTUAL TABLE search USING fts5(                        -- V1
  title, body, kind UNINDEXED, ref UNINDEXED,
  tokenize = 'unicode61 remove_diacritics 2'
);
-- kind: filename | outline | checklist | note | competency

CREATE TABLE outline_entry (                                   -- V1
  id          INTEGER PRIMARY KEY,
  artifact_id INTEGER NOT NULL REFERENCES artifact(id) ON DELETE CASCADE,
  level       INTEGER NOT NULL,
  title       TEXT NOT NULL,
  page        INTEGER,                -- PDF bookmark target
  ordinal     INTEGER NOT NULL
);

-- ─── housekeeping ────────────────────────────────────────────────────
CREATE TABLE duplicate_group (                                 -- V1
  content_hash TEXT PRIMARY KEY,
  file_count   INTEGER NOT NULL,
  bytes_wasted INTEGER NOT NULL,
  detected_at  INTEGER NOT NULL,
  dismissed_at INTEGER
);

-- ─── V2 ──────────────────────────────────────────────────────────────
CREATE TABLE tag        (id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL);
CREATE TABLE tagging    (tag_id INTEGER NOT NULL REFERENCES tag(id),
                         entity_kind TEXT NOT NULL, entity_ref TEXT NOT NULL,
                         PRIMARY KEY (tag_id, entity_kind, entity_ref));
CREATE TABLE entity_link(from_kind TEXT NOT NULL, from_ref TEXT NOT NULL,
                         to_kind   TEXT NOT NULL, to_ref   TEXT NOT NULL,
                         relation  TEXT NOT NULL,
                         PRIMARY KEY (from_kind, from_ref, to_kind, to_ref, relation));
CREATE TABLE competency_note (row_id TEXT PRIMARY KEY, note TEXT,
                              linked_topic TEXT, updated_at INTEGER);
CREATE TABLE screenshot_meta (artifact_id INTEGER PRIMARY KEY REFERENCES artifact(id),
                              captured_at INTEGER, session_id INTEGER, caption TEXT);
```

### Notes on the stored half

- **Polymorphism is confined to association tables** (`tagging`, `entity_link`, `item_session`). No universal `workspace_item` table — that pattern destroys type safety and gains nothing here.
- **`item_anchor` is the bridge.** It is the only table that references derived content, and it references it by *text hash*, never by line number.
- **WAL mode on, `synchronous=NORMAL`.** Single writer; a desktop app with one user has no contention.
- **Migrations from commit one.** `app_meta.schema_version`, forward-only numbered migrations, automatic DB copy before each one. This app holds five months of your hours; a lost migration is a lost record.

---

## 9. Evidence

Everything above is verified by `threadline_parse.py`, run read-only against the real folder.

```
plan             15 sections · 50 checkboxes · window 21 Aug 2026 -> 1 Feb 2027
budget table     8 rows · 292h total
hours extracted  33 of 50 items · confidence high on all
                 17 without hours are all `scope` items — correct
topic links      9 of 9 curriculum items resolve to the right folder
topics on disk   9 folders · 30 material files
competency       188 rows · Done 58 (30.9%) · Partial 47 · Not started 83
reconciliation   10 checks · 10 pass
ambiguity        3 of 50 lines · all three covered by rules in §4
duplicates       11 byte-identical groups (1 study PDF, 10 screenshots)
encoding         UTF-8, no BOM, 166 LF, 0 CRLF
```

**94% of the real file parses without ambiguity, and the three exceptions each produced a rule** rather than a guess. That is the argument for the derived model: your files are regular enough to be a schema.

---

## 10. What V1 builds

```
DERIVED     TASKS.md parser (§4) · topic scanner · reconciliation (§7)
STORED      app_meta · source_file · artifact · artifact_position
            artifact_access · session · session_artifact
            item_anchor · item_anchor_history · item_session
            search (fts5) · outline_entry · duplicate_group
WRITE       checkbox tick only, under every rule in §6
DEFERRED    tag · tagging · entity_link · competency_note · screenshot_meta
```

### Build order

1. Parser + reconciliation — no UI. Prove the numbers first.
2. SQLite + migrations + the round-trip write-back test.
3. Session recording. **This is the instrument; it is the point.**
4. Workbench: Markdown + PDF, with page memory.
5. Today screen.
6. Search.

Steps 1 and 2 are the schema. Everything after is application.
