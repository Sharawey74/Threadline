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

## What

One or two sentences. What this branch adds, in plain language.

## Why

The reason it exists. Link the task and the spec section it implements —
e.g. Schema §4.2, or requirement F7.

## How

The approach, and any decision a reader would question.
Call out anything deliberately left out of scope.

## Verification

- [ ] Tests written and passing; new logic covered
- [ ] `golangci-lint` and `tsc --strict` clean
- [ ] No new complexity violations
- [ ] Round-trip safety test green (if this touches the write path)
- [ ] CHANGELOG updated (if user-visible)
- [ ] Acceptance condition met

Measured results, if the change claims a performance or safety property.

## Risks

What could break, and what to watch after merge. "None" is a valid answer —
but say it deliberately rather than deleting the section.

---

## Closing the branch

The sequence that ends every branch. Work down it in order.

- [ ] **Rebased on `main`**, conflicts resolved locally — no merge commits inside the branch
- [ ] **CI green** — every gate, not just the ones you were watching
- [ ] **Self-reviewed the full diff**, as a stranger would — not the code you remember writing
- [ ] **Squash merge**, so the increment lands on `main` as one clean commit
- [ ] **Delete the branch**

`main` is protected and always green. If CI is red, fixing it is the only task.
