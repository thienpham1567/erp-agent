---
id: 07-verify
trigger: "VF (or tail of any TC/SD chain)"
requires: []
---

# Verify (VF)

Evidence-based verification. Produce output; do not claim success from memory.

## Preconditions
- Changes are on disk (and ideally committed).

## Steps
1. Detect package manager from `.agent/context/01-stack.md` (pnpm / yarn / npm).
2. Run typecheck. Capture full output.
3. Run lint. Capture full output.
4. If the user asked for tests OR the task was a bug fix with a regression test: run tests. Capture output.
5. If any step fails, report the first failure with file path, line, and expected fix. Stop. Do not continue to other steps.
6. On success, paste the last 10 lines of each command's output as evidence.

## Output
- A report in the chat containing: commands run, exit codes, tail of output.

## Verification
- [ ] Typecheck exit 0.
- [ ] Lint exit 0 (or user explicitly approved a warning).
- [ ] If tests were run: exit 0.
