---
id: 10-bootstrap-registry
trigger: "BR"
requires: []
---

# Bootstrap Registry (BR)

Scan an existing project and fill the skeleton `.agent/ui/*.md` and
`.agent/context/02-architecture.md` with real content, so subsequent skills
don't work blind. Run once after `erp-agent init` on an existing codebase.

## Preconditions
- `.agent/profile.json` exists.
- The project is checked out (paths in `profile.paths` + `project.apps`
  resolve to real directories).

## Steps

1. **Resolve paths from the profile.**
   - `uiPackage` from `profile.project.stack.uiPackage` (e.g. `@shared/ui`).
     Resolve to a real path: look in `pnpm-workspace.yaml`, `package.json`
     workspaces, or `tsconfig.*paths` — typically `shared/ui`.
   - `sharedRoot` from `profile.paths.sharedRoot` (e.g. `shared`).
   - `apps` from `profile.project.apps` for per-app hook directories.

2. **Catalogue primitives (shadcn).**
   - List files in `<uiPackage>/shadcn-components/`. For each, write one row
     to `.agent/ui/components/primitives.md` (if not already there) with:
     ```
     ## <Name>
     - **Path:** `{{UI_PACKAGE}}/shadcn-components/<file>`
     - **Use when:** <infer from shadcn docs — basic <Name>>
     - **Pattern:** see other composites that wrap it.
     ```
   - Do not re-implement any of these in `components.md` categories.

3. **Catalogue composites by category.**
   - List files in `<uiPackage>/components/` (top level + subfolders like
     `table`, `form`, `select`, `dates`, `csv`, `auth`, `custom-dialog`).
   - Bucket each into the correct category file under
     `.agent/ui/components/<category>.md` using the filename / folder name.
     Example buckets:
     - `DataTable`, `Breadcrumb`, `Stepper`, `StringStatusBadge`,
       `NumericStatusBadge`, `StorageUsageBar`, `StorageUsageRing` → `data-display.md`
     - `DatePicker`, anything in `dates/` → `dates.md`
     - `CustomDialog`, `Drawer`, `FileUploadDialog`, `ImageViewer`,
       `AttachmentList` → `dialogs.md`
     - `form/*` → `forms.md`
     - `select/*`, `ColorPicker` → `selects.md`
     - `SectionHeader`, `SectionHeaderCard`, `EntityHeaderCard`,
       `PageTabs`, `Tabs` → `layout.md`
     - `AvatarUpload`, `Spinner` → `media.md`
   - Open the matching file, verify the entry is present; if missing, add
     the standard shape (Path / Use when / Key props / Notes / Pattern).
   - Never remove existing entries — extend only.

4. **Catalogue shared hooks.**
   - Read `<sharedRoot>/utils/src/hooks/` and write one row per hook file
     into the "Shared" table of `.agent/ui/02-hooks.md`, replacing any
     `<fill>` row.

5. **Catalogue per-app hooks.**
   - For each `app` in `profile.project.apps`, read `<app.path>/src/hooks/`
     and write a row per hook into the "Per-app" table of `02-hooks.md`,
     annotated with the app name.

6. **Sketch architecture.**
   - Read `apps/<app>/src/app/` for each app: list route groups (folders
     wrapped in `()`) and the top-level features underneath.
   - Write a route tree into `.agent/context/02-architecture.md`,
     replacing the skeleton.

7. **Verify CSS tokens pointer.**
   - Open `<uiPackage>/styles/globals.css` (if present). If the file exists,
     keep the index in `.agent/ui/01-tokens.md` pointing at it. If missing,
     warn the user that the tokens source is not where the template assumed.

8. **Report.**
   - Summarise to the user: how many primitives catalogued, composites per
     category, shared hooks, per-app hooks, route groups. List any
     `<fill>` cells still remaining and ask the user to review before
     running `TC` / `PL` for real work.

## Output

- `.agent/ui/02-hooks.md` with real hooks.
- `.agent/ui/components/*.md` with category entries aligned to the real
  repo.
- `.agent/context/02-architecture.md` with actual route groups + features.
- A summary report in chat.

## Rules

- **CRITICAL**: never rename or delete existing entries. This skill adds
  and reconciles; it does not rewrite human-authored content.
- **ENFORCED**: after editing, run `erp-agent doctor` to confirm the
  profile still validates (no schema changes were made).
- **ENFORCED**: do NOT touch `.agent/ui/01-tokens.md` beyond adjusting its
  source-of-truth pointer — token content stays in the CSS file.

## Verification
- [ ] Every file under `<uiPackage>/components/` is represented in some
      category file (or explicitly noted as skipped).
- [ ] Every hook file in `<sharedRoot>/utils/src/hooks/` appears in the
      shared table.
- [ ] Route tree in `02-architecture.md` lists every route group in each
      app.
