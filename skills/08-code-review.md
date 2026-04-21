---
id: 08-code-review
trigger: "RV"
requires: []
---

# Code Review (RV)

Review the current diff against the plan and project conventions.

## Preconditions
- A diff exists (`git diff` or PR branch).

## Steps
1. Enumerate changed files. For each, list the purpose stated in the plan.
2. Check each file against:
   - Tokens (`.agent/ui/01-tokens.md`) — no hardcoded values.
   - Component reuse (`.agent/ui/components/*.md`) — grep for custom rewrites of existing components.
   - Conventions (`.agent/context/03-conventions.md`) — naming, folder layout, i18n.
   - DoD (`.agent/checklists/dod-feature.md`, `dod-component.md`).
3. Produce findings graded by severity:
   - **Blocker**: breaks build, contract violation, missing hard gate.
   - **Major**: convention violation, missed reuse, accessibility miss.
   - **Minor**: duplication, dead code, naming drift.
   - **Nit**: style-only.
4. For each finding, include file:line and a suggested patch (short diff or replacement snippet).
5. Never fix issues unless the user asks.

## Output
- A review report with sections per severity.

## Verification
- [ ] Every file in the diff is mentioned or explicitly declared "no issues".
- [ ] Every finding cites a file:line.
