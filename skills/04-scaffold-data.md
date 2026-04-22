---
id: 04-scaffold-data
trigger: "SD or chained from TC"
requires: ["03-plan-feature"]
---

# Scaffold Data Layer (SD)

Create types, API slice, and hooks before any UI code.

## Preconditions
- Plan exists (`_extract/<task-id>/plan.md`) and names the feature.
- API endpoints are specified in the spec or provided by the user.
- `.agent/patterns/05-data-layer.md` is loaded.

## Steps
1. Create `{feature}.type.ts` with entity, request, and response types. Include enums referenced from `.agent/ui/04-types.md` when relevant.
2. Create `{feature}-api.ts` with the state library slice: `tagTypes`, one endpoint per spec, `providesTags`/`invalidatesTags` set correctly. Re-export generated hooks.
3. Create `hooks/use{Feature}.ts` only if there is a non-trivial transform over the generated hooks. Otherwise skip.
4. If an enum belongs in `@shared/types` (reused beyond this feature), add it there and update `.agent/ui/04-types.md`.
5. Run typecheck for the data layer before moving on.

## Output
- Data layer files under the feature folder, compiling cleanly.

## Verification
- [ ] `tsc --noEmit` passes for the project (run from repo root — `tsc` checks the whole project per `tsconfig.json`).
- [ ] No endpoint missing a tag strategy.
- [ ] All request/response types reflect the spec exactly.
