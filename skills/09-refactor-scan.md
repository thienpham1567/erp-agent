---
id: 09-refactor-scan
trigger: "RF <path>"
requires: []
---

# Refactor Scan (RF)

Find duplication and propose refactor scope. Do NOT refactor.

## Preconditions
- `<path>` is a folder or file inside the project.

## Steps
1. For UI files in `<path>`: search for raw hex/rgb colors, arbitrary Tailwind values (`text-[...]`, `p-[...]`), inline strings, duplicated JSX shapes.
2. For components: detect near-duplicates (≥ 70% similar props + layout). Propose consolidation into an existing or new shared component; suggest the target category file in `.agent/ui/components/`.
3. For hooks: detect common patterns (`useEffect` + fetch, manual debounce). Suggest using existing shared hooks from `.agent/ui/02-hooks.md`.
4. Group findings by file. For each: severity (high/med/low), proposal, estimated scope (files touched, LOC delta).
5. If findings exceed ~20 items, group into 3-5 focused refactor proposals the user can tackle separately.

## Output
- A refactor report with grouped proposals and effort estimates. Nothing on disk is changed.

## Verification
- [ ] No code edited during scan.
- [ ] Every proposal cites file:line of the duplication.
- [ ] Proposals reference existing shared components/hooks when applicable.
