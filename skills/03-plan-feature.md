---
id: 03-plan-feature
trigger: "PL (or implicit before any code)"
requires: ["02-extract-context (optional)", "06-fetch-spec (optional)"]
---

# Plan Feature (PL)

Produce a written implementation plan before code.

## Preconditions
- If a Figma/spec extraction exists, its artifacts are in `_extract/<task-id>/`.
- The feature's target folder is known (ask the user if unclear).

## Steps
1. Determine the page archetype(s): **List**, **Detail**, or **Form** (see `.agent/patterns/`). Signals: data grid → List; tabbed sections → Detail; input fields → Form.
2. Decide shared data layer: if multiple screens touch the same entity, one data layer serves all.
3. Draft a file plan grouped as (a) data layer, (b) per-screen page, (c) page-scoped components. List exact paths.
4. For each file, write one-line responsibility + key exports.
5. Map requirements → files: every spec requirement must point to a file. Flag gaps.
6. Propose task ordering: always `data-layer → screen shell → sub-components → wiring`.
7. List open questions for the user. Block on any that prevent correct implementation.
8. Save the plan to `_extract/<task-id>/plan.md`.

## Output
- `_extract/<task-id>/plan.md` containing: archetype, file plan, requirement map, task order, open questions.

## Verification
- [ ] Every file listed has a one-line responsibility.
- [ ] Every requirement in the spec maps to at least one file.
- [ ] No open question is left unassigned.
- [ ] The user approved the plan (or said "skip plan" explicitly).
