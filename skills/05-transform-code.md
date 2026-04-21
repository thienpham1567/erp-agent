---
id: 05-transform-code
trigger: "TC <figma-url> [spec=<cf-url>] [target]"
requires: ["02-extract-context", "03-plan-feature", "04-scaffold-data"]
---

# Transform to Code (TC)

Implement the UI per the plan, reusing shared components and tokens.

## Preconditions
- Plan approved in `_extract/<task-id>/plan.md`.
- Data layer is in place (`04-scaffold-data` done).
- `.agent/ui/01-tokens.md` loaded.

## Steps
1. For each page in the plan, scaffold the file under the target folder using the matching pattern from `.agent/patterns/0[2-4]-*.md`. Wrap in `patterns/01-page-shell.md` (loading → error → content).
2. For each UI section on the page, create a separate component file under `<feature>/components/`.
3. For each component need, grep `.agent/ui/components/<category>.md` for an existing match BEFORE building. If found, import from its documented path. If not found, build it; if it is reusable, append to the matching category file.
4. Map every Figma style to a token in `.agent/ui/01-tokens.md`. If a token is missing, add it first, then use it. No inline hex, no arbitrary spacing values.
5. Every visible string goes through `t('<FEATURE>.<KEY>')`. Add missing keys to the catalogs named in `.agent/context/04-env.md`.
6. Wire business rules (visibility, permissions, conditional UI) from the spec — not just the visual.
7. Run `07-verify.md` before claiming done.

## Output
- Page files, section components, added tokens, added i18n keys.

## Verification
- [ ] Loading + error states present on every page.
- [ ] Zero hardcoded colors/spacing (grep: no raw hex in `.tsx`).
- [ ] Zero inline visible strings (grep: no Vietnamese/English outside `t(...)`).
- [ ] Every new shared component appended to the matching `.agent/ui/components/<category>.md`.
- [ ] `07-verify.md` passed.
