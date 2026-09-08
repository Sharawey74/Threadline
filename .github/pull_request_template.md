<!--
TITLE — set it yourself, GitHub cannot prefill it from this file.

    <type>(<scope>): <subject>

  type   feat · fix · perf · refactor · test · docs · build · ci · chore · revert
  scope  plan · store · write · scan · session · bridge · ui · pdf · md · ci · deps

  Imperative mood, lowercase, no trailing full stop, 72 characters maximum.
  It becomes the squashed commit on main, so write it as one.

    feat(plan): parse and reconcile the plan file
    feat(persistence): add sqlite store and byte-exact write-back
-->

## Summary

One paragraph. What this branch delivers, and why it matters to the project —
not a restatement of the title.

| | |
|---|---|
| **Increment** | |
| **Spec** | |
| **Commits** | |
| **Tests** | |

## What changed

The concrete surface, grouped by area. A reviewer should be able to read this
and know where to look.

| Area | Change |
|---|---|
| | |

## Design notes

The decisions a reader would question, and the reasoning behind them. Anything
that looks wrong until you know why. Corrections to the spec belong here, with
a pointer to where the spec was updated to match.

## Out of scope

What was deliberately left out, and which increment owns it. Silence here reads
as an omission.

## Verification

- [ ] Tests written and passing; new logic covered
- [ ] `golangci-lint` and `tsc --strict` clean
- [ ] No new complexity violations
- [ ] Round-trip safety test green (if this touches the write path)
- [ ] CHANGELOG updated (if user-visible)
- [ ] Acceptance condition met

Measured evidence, not assertions. Paste the output that proves the claim.

## Risks and follow-ups

What could break, and what to watch after merge. "None" is a valid answer — but
say it deliberately rather than deleting the section. Name anything left
unvalidated and which increment validates it.

---

## Closing the branch

- [ ] **Rebased on `main`**, conflicts resolved locally — no merge commits inside the branch
- [ ] **CI green** — every gate, not just the ones you were watching
- [ ] **Self-reviewed the full diff**, as a stranger would — not the code you remember writing
- [ ] **Squash merge**, so the increment lands on `main` as one clean commit
- [ ] **Keep the branch** - it holds the unsquashed, commit-by-commit history

`main` is protected and always green. If CI is red, fixing it is the only task.
