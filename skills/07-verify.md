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

1. **Prefer the project's own verify script.**
   - Read `.agent/profile.json → scripts.verify`. If non-empty, run that
     exact command (e.g. `pnpm run verify`, `bash scripts/verify.sh`) and
     skip steps 2–4.
   - The project's script usually runs typecheck + lint + build + tests in
     the right order for that codebase. Don't second-guess it.
2. Otherwise, detect the package manager from `.agent/context/01-stack.md`
   (pnpm / yarn / npm).
3. Run typecheck. Capture full output.
4. Run lint. Capture full output.
5. If the user asked for tests OR the task was a bug fix with a regression
   test: run tests. Capture output.
6. If any step fails, report the first failure with file path, line, and
   expected fix. Stop. Do not continue to other steps.
7. On success, paste the last 10 lines of each command's output as evidence.

## Output
- A report in the chat containing: command(s) run, exit codes, tail of output.

## Verification
- [ ] Exit code 0.
- [ ] If the project's verify script was used: its own criteria apply.
- [ ] If raw tools were used: typecheck 0, lint 0 (or warning explicitly approved), tests 0 when run.
