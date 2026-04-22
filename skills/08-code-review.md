---
id: 08-code-review
trigger: "RV"
requires: []
---

# Code Review (RV)

Review the current diff against the plan and project conventions, combining an
automated React Doctor pass with project-specific checks.

## Preconditions
- A diff exists (`git diff` or PR branch).
- Node / `npx` available (for React Doctor).

## Steps

### 1. Automated pass — React Doctor

Run the scanner in diff mode against the base branch. Prefer offline unless the
user opts in to the hosted score.

```bash
npx -y react-doctor@latest . --diff <base-branch> --verbose
# or, for a full project pass (slower):
npx -y react-doctor@latest . --verbose
```

- Use `--diff main` (or `master`) when reviewing a PR so only changed files run.
- If the project already has `react-doctor.config.json` or a `reactDoctor` key in
  `package.json`, respect it — do not pass CLI flags that override team config.
- Capture the output. Note the **score** (0–100), and split diagnostics into
  `error` vs `warning`.

React Doctor covers: state/effects correctness, performance, bundle size,
security, accessibility, Next.js specifics, and dead code. Treat its findings
as the baseline — do not re-discover them manually.

### 2. Manual pass — project rules React Doctor does NOT check

For every changed file, verify against the items React Doctor cannot know about:

- **Tokens** (`.agent/ui/01-tokens.md`) — no hardcoded hex / rgb / arbitrary
  Tailwind values (`text-[...]`, `p-[...]`). Every color, spacing, radius, and
  typography value must map to a named token.
- **Component reuse** (`.agent/ui/components/*.md`) — grep for custom rewrites
  of a component that already exists in the shared registry.
- **Conventions** (`.agent/context/03-conventions.md`) — naming, folder layout,
  i18n (no raw user-visible strings; every label goes through the project's
  `t()` helper).
- **DoD** (`.agent/checklists/dod-feature.md`, `dod-component.md`).
- **Data-layer discipline** (`.agent/patterns/05-data-layer.md`) — `tagTypes`,
  `providesTags`/`invalidatesTags`, no manual page-slicing on the client.

### 3. Produce findings graded by severity

Default vocabulary: **Blocker / Major / Minor / Nit.**

- **Blocker**: breaks build, contract violation, missing hard gate, OR React
  Doctor `error`-severity diagnostic.
- **Major**: convention violation, missed reuse, accessibility miss, OR React
  Doctor `warning` in a security / correctness category.
- **Minor**: duplication, dead code, naming drift, remaining React Doctor
  `warning`s.
- **Nit**: style-only.

**If the project documents its own severity vocabulary** (e.g. the
`CRITICAL / MANDATORY / ENFORCED / PREFERRED / REFERENCE` scale used in
`.agent/context/03-conventions.md` or the project's `project-context.md`),
adopt it and map as follows:

| erp-agent default | Project vocab example |
|---|---|
| Blocker | `CRITICAL` / `MANDATORY` |
| Major   | `ENFORCED` |
| Minor   | `PREFERRED` |
| Nit     | `REFERENCE` |

Use **one** vocabulary per report — never mix.

Merge the two passes into one report. If React Doctor and the manual review
both flag the same issue, report it once and cite both sources.

### 4. For each finding

Include `file:line` and a suggested patch (short diff or replacement snippet).
For React Doctor findings, include the rule id (e.g. `react/no-danger`) so the
team can add it to `react-doctor.config.json → ignore.rules` if they decide it
does not apply.

### 5. Never fix issues unless the user asks.

## Output

- A review report with:
  1. React Doctor summary line: `score=NN/100, E=<err-count>, W=<warn-count>`.
  2. Sections per severity (Blocker / Major / Minor / Nit), each finding citing
     `file:line` + rule id (when applicable) + suggested patch.

## Verification

- [ ] `npx react-doctor` ran and its output is included in the report.
- [ ] Every file in the diff is mentioned or explicitly declared "no issues".
- [ ] Every finding cites `file:line`.
- [ ] No manual finding duplicates a React Doctor finding without citing both.
