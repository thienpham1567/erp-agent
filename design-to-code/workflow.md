---
main_config: '{project-root}/_bmad/bmm/config.yaml'
---

# Design + Confluence Spec → Code Workflow

> **Prerequisite**: `docs/project-context.md` is the source of truth for architecture, tokens, i18n, and naming conventions. This file covers Figma extraction and Confluence spec workflow steps.

## Step 1 — Parse Inputs

### 1a. Identify what the user provided

| Provided                           | Accuracy | Action                                                        |
| :--------------------------------- | :------- | :------------------------------------------------------------ |
| Multi-Figma URLs + Confluence Spec | ⭐ Best  | Design tokens from Figma, data layer + rules from Confluence  |
| Figma URL + Confluence Spec        | ⭐ Best  | URL = design tokens, Confluence = data layer + business rules |
| Figma URL + Requirements           | ✅ Great | URL = design, spec = data layer                               |
| Figma URL only                     | ✅ Good  | Extract all from MCP (design + screenshot auto-fetched)       |
| Requirements only (no design)      | ❌       | Ask for Figma URL                                             |

### 1b. Extract Feature Requirements (when provided)

From the user's feature spec, extract and organize:

| Category           | Extract                               | Example                                         |
| :----------------- | :------------------------------------ | :---------------------------------------------- |
| **API Endpoints**  | Method, URL, request/response shape   | `GET /v1/services/{id}/manage?action=getDetail` |
| **Data Model**     | Entity fields, types, relationships   | `{ id, name, status, cpuUsage, memoryMb }`      |
| **Business Rules** | Validations, conditions, permissions  | "Only show console button for AMD VPS"          |
| **User Actions**   | What users can do                     | "Start, Stop, Reboot server"                    |
| **States**         | Loading, empty, error, success states | "Show spinner while fetching"                   |

**Output**: Present a summary table to the user for confirmation before proceeding.

### 1c. Extract Figma Context (MANDATORY — Pixel-Accurate)

- **Source**: `figma_mcp_client.js` (Project Root).
- **Endpoint**: `http://127.0.0.1:3845/mcp`.
- **Execution**: Create scratch script inside the **extraction folder** (see Step 1e) to call `getFullDesign({ url })`. All output files MUST be saved to the extraction folder.
- **Data Extracted**:
  - `designContext`: React/Tailwind base code + design tokens.
  - `metadata`: Component hierarchy and layout structure.
  - `screenshot`: Base64 image for visual verification.

#### Pixel-Accurate Extraction (CRITICAL)

The MCP `getFullDesign` output alone is NOT always sufficient. You MUST verify and supplement with a **full-depth Figma REST API call** to extract every pixel detail:

```js
// Figma REST API — full node tree (no depth limit)
const url = `https://api.figma.com/v1/files/${fileKey}/nodes?ids=${nodeId}`
// Headers: { 'X-Figma-Token': token }
```

From the full node tree, walk every child and extract:

| Property                               | What to Extract                             |
| -------------------------------------- | ------------------------------------------- |
| `absoluteBoundingBox`                  | Exact width × height of every frame/element |
| `layoutMode`                           | HORIZONTAL / VERTICAL flex direction        |
| `itemSpacing`                          | Gap between children → `gap-{n}`            |
| `paddingTop/Right/Bottom/Left`         | Padding → `p-{n}` or `px-{n} py-{n}`        |
| `cornerRadius`                         | Border radius → `rounded-{n}`               |
| `fills[].color`                        | Fill colors → map to design tokens          |
| `strokes[].color`                      | Border colors → map to design tokens        |
| `style.fontFamily/fontWeight/fontSize` | Typography → `text-{size} font-{weight}`    |
| `characters`                           | All text content (labels, values, buttons)  |
| `type === 'LINE'`                      | Separators → `border-t` or `<Separator>`    |
| `componentProperties`                  | Component variant (e.g., Status="Active")   |

**Save output**: `_extract/{task_id}/figma_tree.txt` — structured tree with all properties.

#### Rate Limit Fallback

When the Figma MCP server or REST API returns rate limit errors (429), use this fallback strategy:

1. **Figma REST API with token** — Call `https://api.figma.com/v1/files/{key}/nodes?ids={id}` directly using `FIGMA_TOKEN` from environment. This is independent of the MCP server.
2. **Screenshot + manual analysis** — If REST API is also rate-limited, fall back to the screenshot image already captured. Analyze the screenshot pixel-by-pixel using vision capabilities.
3. **Cached node data** — If a previous extraction already saved `figma_tree.txt` or `/tmp/figma_node.json`, reuse that cached data instead of making a new API call.
4. **Incremental extraction** — If the full tree is too large, fetch specific child node IDs individually with smaller requests to stay under rate limits.

### 1d. Extract Confluence Spec (when Confluence URL provided)

- **Source**: `confluence_mcp_client.js` (Project Root).
- **Auth**: Load from `.env.confluence` file (`CONFLUENCE_EMAIL` + `CONFLUENCE_API_TOKEN`).
- **Execution**: Create scratch script inside the **extraction folder** (see Step 1e) to call `getPageAsMarkdown(url)`. Output MUST be saved to the extraction folder.
- **Multi-URL**: For multiple specs, use `getMultiplePagesAsMarkdown([url1, url2])`.
- **Data Extracted**:
  - Feature requirements, API endpoints, business rules, data models.
  - Output: clean Markdown saved as `{extract_root}/{task_id}/spec.md`.
- **Script Example**:
  ```js
  import { readFileSync } from 'fs'
  import { resolve, dirname } from 'path'
  import { fileURLToPath } from 'url'
  const __dirname = dirname(fileURLToPath(import.meta.url))
  // Load credentials from .env.confluence
  const envFile = readFileSync(resolve(process.cwd(), '.env.confluence'), 'utf-8')
  for (const line of envFile.split('\n')) {
    if (line.startsWith('#') || !line.includes('=')) continue
    const [key, ...rest] = line.split('=')
    process.env[key.trim()] = rest.join('=').trim()
  }
  import { ConfluenceMCPClient } from './confluence_mcp_client.js'
  const client = new ConfluenceMCPClient()
  const spec = await client.getPageAsMarkdown(process.argv[2])
  const fs = await import('fs')
  // Save output to the extraction folder (this script lives there)
  fs.writeFileSync(resolve(__dirname, 'spec.md'), `# ${spec.title}\n\n${spec.markdown}`)
  console.log(`✅ Saved spec: ${spec.title} (${spec.pageId})`)
  ```

### 1e. Save Extraction Artifacts (MANDATORY for EC)

**All artifacts MUST be saved to a centralized extraction folder at the project root.** This keeps source directories clean and makes extracted artifacts easy to find and gitignore.

**Folder structure**: `{project_root}/_extract/{task_id}/` — where `{task_id}` is derived from the task/ticket number (e.g., `ERP-168`, `ERP-1318`). Ask the user for the task ID if not provided.

**Example**: `_extract/ERP-1318/`

1. Create directory: `_extract/{task_id}/` at the project root (create if it doesn't exist).
2. Save all raw outputs to `_extract/{task_id}/`:
   - `designContext.txt`: Full text from `get_design_context`.
   - `metadata.xml`: Raw XML from `get_metadata`.
   - `screenshot.png`: Binary image from `get_screenshot`.
   - `spec.md`: Confluence page content as Markdown (when CS/Confluence URL provided).
3. Scratch scripts (`extract_figma.mjs`, `extract_spec.mjs`) should also be created inside `_extract/{task_id}/` — clean them up after extraction if desired.
4. Add `_extract/` to `.gitignore` if not already present.

This ensures all extraction artifacts are centralized in one place at the project root, separate from source code.

## Step 2 — Detect Page Archetype

Analyze **both** design and requirements to classify:

| Signal                             | Archetype       | Key Components                                                        |
| :--------------------------------- | :-------------- | :-------------------------------------------------------------------- |
| Data table/grid as primary content | **List Page**   | `DataTable`, `usePageTableState`, `filterConfigs`, `useRowNavigation` |
| Tabbed detail sections             | **Detail Page** | `PageTabs`, `dynamic()` imports, `useTabUrl`                          |
| Input fields / form layout         | **Form Page**   | `react-hook-form`, `@shared/ui/components/form`                       |

## Step 3 — Module Structure & Data Layer

> **Reference**: Follow `docs/project-context.md` for architecture, naming, RTK Query patterns.

**Rule**: Always create data layer (`{feature}.type.ts` → `{feature}-api.ts` → `hooks/use{Feature}.ts`) **BEFORE** writing UI components.

## Step 4 — Component Decision Matrix

### UI Components (`@shared/ui/components`)

| Figma Pattern                | Component                      | Import Path                         |
| :--------------------------- | :----------------------------- | :---------------------------------- |
| Page title                   | `h1.page-body-title`           | N/A (CSS class)                     |
| Section header (blue accent) | `SectionHeaderCard`            | `@shared/ui/components`             |
| Section header (plain text)  | `SectionHeader`                | `@shared/ui/components`             |
| Summary card w/ icon         | `EntityHeaderCard`             | `@shared/ui/components`             |
| Status text badge            | `StringStatusBadge`            | `@shared/ui/components`             |
| Status numeric badge         | `NumericStatusBadge`           | `@shared/ui/components`             |
| Top-level tabs               | `PageTabs` + `PageTabsContent` | `@shared/ui/components`             |
| Content tabs                 | `Tabs` + `TabsContent`         | `@shared/ui/components`             |
| Data list/grid               | **`DataTable`** (MANDATORY)    | `@shared/ui/components/table`       |
| Side panel / drawer          | `Drawer`                       | `@shared/ui/components`             |
| Stepper / wizard             | `Stepper` + `StepperContent`   | `@shared/ui/components`             |
| Breadcrumb navigation        | `Breadcrumb`                   | `@shared/ui/components`             |
| Loading state                | `Spinner`                      | `@shared/ui/components`             |
| Resource usage bar           | `StorageUsageBar`              | `@shared/ui/components`             |
| Resource usage ring/donut    | `StorageUsageRing`             | `@shared/ui/components`             |
| Tooltip info icon            | `InfoTooltip`                  | `@shared/ui/components`             |
| Hover tooltip                | `SimpleTooltip`                | `@shared/ui/components`             |
| Avatar upload                | `AvatarUpload`                 | `@shared/ui/components`             |
| Attachment list              | `AttachmentList`               | `@shared/ui/components`             |
| File upload modal            | `FileUploadDialog`             | `@shared/ui/components`             |
| Image viewer / lightbox      | `ImageViewer`                  | `@shared/ui/components`             |
| Color picker                 | `ColorPicker`                  | `@shared/ui/components`             |
| Radio button group           | `RadioGroup`                   | `@shared/ui/components`             |
| Kebab / action menu          | `DropdownMenu`                 | `@shared/ui/components`             |
| Rich text editor             | `TextEditor`                   | `@shared/ui/components/text-editor` |
| Rich text display            | `TextEditorRender`             | `@shared/ui/components/text-editor` |

### Select Components (`@shared/ui/components/select`)

| Pattern                | Component         | Notes                                            |
| :--------------------- | :---------------- | :----------------------------------------------- |
| Single-select dropdown | `Dropdown`        | `value`, `onChange`, `options: SelectableItem[]` |
| Multi-select dropdown  | `MultiDropdown`   | `values`, `onChange`, multi-select               |
| Tree select (single)   | `TreeSelect`      | Hierarchical nested options                      |
| Tree select (multi)    | `MultiTreeSelect` | Hierarchical multi-select                        |

### Custom Dialog Components (`@shared/ui/components/custom-dialog`)

| Pattern            | Component     | Notes                             |
| :----------------- | :------------ | :-------------------------------- |
| Confirmation modal | `AlertDialog` | Confirm/Cancel actions            |
| Info/content modal | `Dialog`      | Generic content dialog            |
| Form in modal      | `FormDialog`  | Dialog w/ react-hook-form support |

### Date/Time Components (`@shared/ui/components/dates`)

| Pattern            | Component         | Notes                      |
| :----------------- | :---------------- | :------------------------- |
| Date + time picker | `DateTimePicker`  | Full datetime selection    |
| Date range picker  | `DateRangePicker` | Start/end date range       |
| Date range input   | `DateRangeInput`  | Inline range input variant |
| Time only picker   | `TimePicker`      | Hours/minutes selection    |
| Month/year picker  | `MonthYearPicker` | Month and year only        |

### Shadcn Primitives (`@shared/ui/shadcn-components`)

Use these for low-level primitives not covered by shared components above:

| Component     | File           | Common Use                             |
| :------------ | :------------- | :------------------------------------- |
| `Button`      | `button`       | All buttons                            |
| `Input`       | `input`        | Text inputs (outside forms)            |
| `Textarea`    | `textarea`     | Multi-line input                       |
| `Checkbox`    | `checkbox`     | Standalone checkboxes                  |
| `Switch`      | `switch`       | Toggle switches                        |
| `Badge`       | `badge`        | Small label badges                     |
| `Card`        | `card`         | Card container                         |
| `Skeleton`    | `skeleton`     | Loading placeholder                    |
| `Separator`   | `separator`    | Horizontal/vertical divider            |
| `Accordion`   | `accordion`    | Collapsible sections                   |
| `Avatar`      | `avatar`       | User avatars                           |
| `ScrollArea`  | `scroll-area`  | Custom scrollable container            |
| `Popover`     | `popover`      | Floating content                       |
| `Label`       | `label`        | Form labels                            |
| `InputOTP`    | `input-otp`    | OTP verification input                 |
| `AlertDialog` | `alert-dialog` | Low-level alert (prefer custom-dialog) |

### Form Components — React Hook Form (`@shared/ui/components/form`)

| Input             | Component             | Notes                          |
| :---------------- | :-------------------- | :----------------------------- |
| Text/Email/URL    | `TextField`           | Standard text input            |
| Textarea          | `TextareaField`       | Multi-line text                |
| Number            | `NumberField`         | Numeric input                  |
| Password          | `PasswordField`       | Password w/ show/hide toggle   |
| Phone             | `PhoneField`          | Simple phone input             |
| Phone (intl)      | `PhoneNumberField`    | International phone w/ country |
| Dropdown          | `DropdownForm`        | Single-select in form          |
| Multi Dropdown    | `MultiDropdownForm`   | Multi-select in form           |
| Tree Select       | `TreeSelectForm`      | Hierarchical select in form    |
| Multi Tree Select | `MultiTreeSelectForm` | Hierarchical multi in form     |
| Toggle/Switch     | `SwitchForm`          | Boolean toggle in form         |
| Checkbox          | `CheckboxForm`        | Checkbox in form               |
| Date/Time         | `DateTimePickerForm`  | DateTime picker in form        |
| Tab selector      | `TabForm`             | Tab-based selection in form    |

### Shared Hooks

#### `@shared/utils/hooks`

| Hook                | Purpose                                                      |
| :------------------ | :----------------------------------------------------------- |
| `useRowNavigation`  | Returns click handler for table row → detail page navigation |
| `useTabUrl`         | Syncs active tab with URL search params (`?tab=`)            |
| `useDebounce`       | Debounces a value (used internally by DataTable search)      |
| `useFileUpload`     | File upload logic with progress tracking                     |
| `useDeferredUpload` | Deferred file upload (upload after form submit)              |
| `useCountdownTimer` | Countdown timer (e.g. OTP resend)                            |
| `useUnsavedChanges` | Warns user before navigating away from unsaved form          |
| `useSidebar`        | Sidebar open/close state management                          |

#### `@/hooks` (Client app-specific)

| Hook                   | Purpose                                                       |
| :--------------------- | :------------------------------------------------------------ |
| `usePageTableState`    | Pagination + filters + search state for server-side DataTable |
| `useQueryError`        | Standardized error/not-found rendering for RTK Query          |
| `usePermission`        | Check user permissions for conditional UI                     |
| `useConsumeNavFilters` | Consume one-time navigation filters from URL params           |

### Shared Utilities

#### Formatting (`@shared/utils/format`)

| Function            | Purpose                     | Example Output   |
| :------------------ | :-------------------------- | :--------------- |
| `formatVND`         | Vietnamese currency         | `1.234.567 đ`    |
| `formatCurrency`    | Generic currency            | `1,234,567`      |
| `formatNumber`      | Number with separators      | `1,234`          |
| `formatPercentage`  | Percentage display          | `85%`            |
| `formatPhoneNumber` | Phone number formatting     | `0912 345 678`   |
| `formatFileSize`    | Bytes → human-readable      | `1.5 GB`         |
| `formatMBSize`      | MB → human-readable         | `512 MB`         |
| `formatDuration`    | Seconds → readable duration | `2h 30m`         |
| `truncateText`      | Truncate with ellipsis      | `Long text...`   |
| `getInitials`       | Name → avatar initials      | `NT`             |
| `maskEmail`         | Mask email address          | `n***@gmail.com` |

#### Date Utilities (`@shared/utils/dateUtils`)

| Function          | Purpose                            |
| :---------------- | :--------------------------------- |
| `formatDate`      | Format date (`dd/MM/yyyy` default) |
| `formatDateRange` | Format date range                  |
| `formatUtcDate`   | Parse UTC string + format          |
| `formatLastReply` | Relative time (e.g. "2 giờ trước") |
| `daysBetween`     | Days between two dates             |
| `addBusinessDays` | Add working days (skip weekends)   |
| `isWorkday`       | Check if date is a workday         |

### Shared Types & Constants (`@shared/types`)

| Export               | Purpose                                        |
| :------------------- | :--------------------------------------------- |
| `DEFAULT_PAGINATION` | Default pageSize (used by `usePageTableState`) |
| `StatusEnum`         | Generic Active/Inactive status                 |
| `OrderStatusEnum`    | Order statuses                                 |
| `PaymentStatusEnum`  | Payment statuses                               |
| `TicketStatusEnum`   | Ticket statuses                                |
| `InvoiceStatusEnum`  | Invoice statuses                               |
| `phoneRegex`         | Vietnamese phone validation                    |
| `passwordRegex`      | Password strength validation                   |
| `API_ERROR_CODE`     | Standard API error codes                       |

### Store / API Layer (`@shared/store/api`)

| Export               | Purpose                                            |
| :------------------- | :------------------------------------------------- |
| `ApiListResponse<T>` | Standard paginated list response shape             |
| `BaseQueryParams`    | Standard query params (page, limit, search, sorts) |
| `getStatusCode`      | Extract HTTP status from RTK Query error           |

### App-Level Components (`@/app/(protected)/components`)

| Component         | Purpose                                      |
| :---------------- | :------------------------------------------- |
| `Field`           | Read-only key-value display                  |
| `ServiceStatus`   | Service status badge (Active/Suspended/etc.) |
| `PageContent`     | Standard page content wrapper                |
| `ProgressStepper` | Multi-step progress indicator                |

## Step 5 — Page Implementation Patterns

### 6a. Standard Page Shell (ALL pages in Client app)

```tsx
import { Spinner } from '@shared/ui/components/Spinner'
import { useQueryError } from '@/hooks/useQueryError'

// 1. Loading state
if (isLoading)
  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-108px)]">
      <Spinner />
    </div>
  )

// 2. Error state
const { renderError } = useQueryError({ error, hasData: !!data, notFoundKey: '{FEATURE}.NOT_FOUND' })
const errorElement = renderError()
if (errorElement) return errorElement

// 3. Content
return <div className="space-y-4 p-6">...</div>
```

### 6b. DataTable Patterns

DataTable has two modes. **Detect from context**: if spec mentions pagination with API, or the table has large datasets → server-side. If data is small/local → client-side.

#### Server-Side DataTable (paginated API)

**Required**:

- Response type: `ApiListResponse<T>` from `@shared/store/api` (provides `items`, `total`, `totalPages`, `page`, `limit`)
- State hook: `usePageTableState()` from `@/hooks/usePageTableState` (provides `pagination`, `setPagination`, `baseQueryParams`)
- Pass `baseQueryParams` (page/limit) to query hook → API returns pre-sliced data

```tsx
'use client'

import { DataTable, type TableColumn } from '@shared/ui/components/table'
import { usePageTableState } from '@/hooks/usePageTableState'
import { useRowNavigation } from '@shared/utils/hooks'
import type { ApiListResponse } from '@shared/store/api'

export default function {Feature}ListPage() {
  const { t } = useTranslation()
  const { pagination, setPagination, columnFilters, handleColumnFiltersChange,
          handleGlobalFilterChange, baseQueryParams } = usePageTableState()
  const handleRowClick = useRowNavigation('/{features}')

  // baseQueryParams → { page, limit, sorts, search? }
  const { data, isLoading, isFetching } = useGet{Feature}sQuery(baseQueryParams)
  const items = data?.items ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages

  const columns: TableColumn<{Feature}>[] = useMemo(() => [
    { accessorKey: 'field', header: t('KEY'), cell: ({row}) => <span>{row.original.field}</span> },
  ], [t])

  return (
    <DataTable
      data={items}
      columns={columns}
      loading={isLoading || isFetching}
      pagination={{ ...pagination, totalPages, totalRows: total }}
      onPaginationChange={setPagination}
      onRowClick={handleRowClick}
      className="border-0"
      paginationClassName="border-0 shadow-none"
    />
  )
}
```

**Key rules**:

- `pagination={{ ...pagination, totalPages, totalRows: total }}` — spread pattern, NOT manual `Math.ceil`
- API endpoint returns `ApiListResponse<T[]>` shape
- Do NOT slice data client-side — API returns only the current page

#### Client-Side DataTable (small dataset, local filtering)

```tsx
<DataTable
  data={allItems}
  columns={columns}
  loading={isLoading}
  showPagination={false} // or omit for no pagination
  manualFiltering={false} // client-side filtering
  manualPagination={false} // client-side pagination
  globalFilterPlaceholder={t('SEARCH_PLACEHOLDER')}
/>
```

#### DataTable Toolbar: Filter without Search

The toolbar shows search when `enableGlobalFilter={true}` (default) and filters when `enableFilterData={true}`. They are **independent**.

- **Filter only (no search)**: `enableFilterData` + `filterConfigs` + `enableGlobalFilter={false}`
- **Search only (no filter)**: `enableGlobalFilter` (default)
- **Both**: `enableGlobalFilter` + `enableFilterData` + `filterConfigs`

### 6c. Detail Page Pattern (Tabs)

```tsx
'use client'

import { PageTabs, PageTabsContent } from '@shared/ui/components/PageTabs'
import { useTabUrl } from '@shared/utils/hooks'
import dynamic from 'next/dynamic'

const GeneralInfo = dynamic(() => import('../components/GeneralInfo'))
const ConfigTab = dynamic(() => import('../components/ConfigTab'))

export default function {Feature}DetailPage() {
  const { t } = useTranslation()
  const { activeTab, setActiveTab } = useTabUrl({ defaultTab: 'general', paramName: 'tab' })

  const tabs = useMemo(() => [
    { value: 'general', label: t('{FEATURE}.TAB_GENERAL') },
    { value: 'config', label: t('{FEATURE}.TAB_CONFIG') },
  ], [t])

  return (
    <div className="space-y-6 p-6">
      <PageTabs tabs={tabs} value={activeTab} onValueChange={setActiveTab}>
        <PageTabsContent value="general"><GeneralInfo data={data} loading={isFetching} /></PageTabsContent>
        <PageTabsContent value="config"><ConfigTab id={id} /></PageTabsContent>
      </PageTabs>
    </div>
  )
}
```

## Step 6 — Quality Checklist (DoD)

> Token, i18n, lazy-loading, and error-handling rules are in `docs/project-context.md`. This checklist covers **design-to-code specific** items only.

- [ ] Feature requirements (from Confluence/spec) fully mapped → types, API, hooks
- [ ] Data layer created **before** UI components
- [ ] Each UI section = separate component file
- [ ] Loading + Error guards present (5a pattern)
- [ ] Business rules from spec implemented (not just visual)
- [ ] Responsive layout applied where appropriate
