---
id: 01-brainstorm
trigger: opt-in on vague or complex requests
requires: []
---

# Brainstorm

Invoke ONLY after the user answered "yes" to "Brainstorm trước không?".

## Preconditions
- User opted in.
- You have not started writing code for this task.

## Steps
1. Read the user's request literally. Restate it back in 1-2 sentences and ask for confirmation.
2. Ask clarifying questions ONE AT A TIME. Multiple-choice when possible.
3. Cover in order: purpose → users → success criteria → constraints → unknowns.
4. When uncertainty remains about UI shape, ask for a Figma URL or an ASCII mock.
5. Propose 2-3 approaches with trade-offs. Recommend one.
6. On approval, summarise the confirmed design in ≤ 200 words.
7. Hand off to `03-plan-feature.md`.

## Output
- A short design summary saved under `_extract/<task-id>/design.md`.

## Verification
- [ ] User explicitly approved the summary.
- [ ] Summary fits in one screen (≤ 200 words).
- [ ] All open questions are resolved or explicitly marked "deferred".
