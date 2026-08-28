# ADR-002: SQLite driver

**Status:** Accepted — `modernc.org/sqlite` (pure Go)
**Date:** 28 August 2026
**Decider:** Sharawey
**Phase:** 0 (Spike)
**Related:** ADR-001 (stack), Threadline-Schema.md §8 (stored model)

---

## Context

Threadline stores the small half of its data in SQLite: sessions, hours, page
positions, notes, anchors. The schema also declares an FTS5 virtual table for
search across filenames, checklist items, notes and document outlines.

Go has two viable drivers, and they differ on one axis that matters more than
performance:

| | `modernc.org/sqlite` | `mattn/go-sqlite3` |
|---|---|---|
| Implementation | SQLite transpiled to Go | cgo bindings to the C library |
| Build requirement | none | a working C toolchain |
| Cross-compilation | trivial | painful |
| Speed | slower | faster |

ADR-001 already stated the preference — *"mitigate by using a pure-Go SQLite
driver, accepting a small performance cost that is irrelevant at this data
size"* — but left it conditional on one unknown: **whether FTS5 is available
without cgo.** If it were not, search would force the cgo driver, and with it a
C compiler on every machine that ever builds this project.

## Decision

**Use `modernc.org/sqlite`.** FTS5 is available; nothing forces cgo.

## Evidence

Measured during the Phase 0 spike, with `CGO_ENABLED=0` set explicitly so the
absence of a C toolchain is proven rather than assumed:

```
FTS5 works: MATCH 'kafka' -> "Messaging & Event Streaming"
journal_mode = wal
sqlite 3.53.3 via modernc.org/sqlite v1.57.0 (pure Go)
PASS
```

Three things were tested, not read about:

1. **FTS5 works, not merely compiles.** The test creates the exact virtual
   table from Schema §8 — including `tokenize = 'unicode61 remove_diacritics 2'`
   — inserts rows, and matches one back by content. A successful `CREATE` would
   only have proven the module was built in; a correct `MATCH` proves it runs.
2. **WAL mode engages.** `PRAGMA journal_mode=WAL` returns `wal`. The schema
   depends on this, and a driver that silently stayed in journal mode would
   have broken an assumption nothing else would have caught.
3. **No C toolchain is needed.** All of the above under `CGO_ENABLED=0`.

## Consequences

### Easier
- `go build` works anywhere, with no compiler to install and no cgo flags
- Cross-compilation stays trivial, which keeps the Windows release pipeline simple
- CI needs no C toolchain, on any runner
- One less reason for a build to fail on a machine that is not this one

### Harder
- Measurably slower than the cgo driver on large workloads. Irrelevant here:
  one user, one machine, under 10,000 rows, roughly a 5 MB database. Optimising
  for throughput at this size would be architecture theatre.
- A smaller community than `mattn/go-sqlite3`, so an obscure bug may need
  solving from first principles.
- The transpiled build tracks upstream SQLite with a lag. Nothing in the V0
  schema uses a recent feature, so this costs nothing today.

### Revisit if
- A query is measurably too slow **after profiling in Phase 6** — not before
- The schema comes to need a SQLite feature the transpiled build lacks
- The app ever becomes multi-user or multi-writer, which would change the
  concurrency assumptions behind `synchronous=NORMAL` and a single writer

## Notes

FTS5 gates **search**, which is V1 — out of scope for V0 (Build-Plan §3.3). The
question was answered during the spike anyway, because a *negative* answer would
have forced cgo on the whole project, and that is a decision far cheaper to
discover now than after the store is written.

The spike code proving this lives on `spike/feasibility`, which is throwaway and
never merged. The driver is added to `go.mod` properly in Phase 2 (I2), where
it ships with the migration runner and the store's own tests.
