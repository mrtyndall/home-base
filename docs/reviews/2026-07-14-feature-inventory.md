# Home Base feature inventory

**Review date:** 2026-07-14

**Branch:** `feature/nested-areas-read-later`

**Reviewed checkpoint:** current branch after hierarchy, Task Quick Edit, Read Later, and MCP parity work

**Primary product target:** iPhone 16 Pro Max at 440×956 CSS pixels

**Regression targets:** 390×844 mobile and 1440×1000 desktop

## Product definition

Home Base is a private, single-user personal operations system. Its durable model is:

```text
Global
├── Inbox
├── Read Later
├── Books
├── Movies
└── People

Area
├── Child Area (unlimited depth)
├── Task
├── Routine
├── Note / Document / Idea / Reference
└── Project (Area optional)
    ├── Task
    ├── Milestone
    └── Note / Document / Idea / Reference
```

The app's best product principle is capture first, organize later. Captures are retained, destructive delete APIs are intentionally absent, and most entities settle through status changes rather than removal. Areas are the only responsibility container; the retired Domain concept is no longer active. Books and Movies remain global. People are global records that may be related contextually.

## Current capability summary

| Capability | Human experience | Agent/API experience | Current status |
|---|---|---|---|
| Lossless capture | Persistent bottom capture bar with voice, explicit type, Area, Project, and optional task due date | REST capture plus `capture_input`; preservation-first capture contract | Shipped; picker accessibility and recovery need work |
| Home | Daily status, Today preview, upcoming commitments, attention, top tasks, routines, resurfacing | Today/all-clear, notifications, reviews, resurfacing tools | Shipped; good concise launch surface |
| Today | Calendar, due today, tomorrow, starred tasks, routines, task inbox, resurfacing | Today and calendar reads; task mutations | Shipped; resolved capture receipts are suppressed |
| Tasks | Quick add, filters, sections, starring, completion, scheduling, reorder, subtasks | Full task list/read/create/update/star/complete | Shipped; Quick Edit is release-quality, drag recovery is not |
| Nested Areas | Tree index, breadcrumb paths, optional parent on creation, reparenting with cycle prevention | Area list/read/aggregate/create/update/reparent | Shipped on branch |
| Projects | Active/someday/parked lifecycle, milestones, tasks, notes/docs/files, check-ins, activity, optional Area | Project list/read/activity/create/update/file/park/unpark | Shipped on branch; unfiled Project Inbox surfacing is incomplete |
| Unified Inbox | Pending captures, review proposals, scheduled reviews, unfiled tasks/content | Component APIs exist; no dedicated aggregate tool | Shipped but hidden and missing unfiled Projects |
| Read Later | URL-first save, unread/read/archived filters, open, status, file globally/Area/Project | Authenticated REST and MCP list/save/file/status | Shipped on branch; queue mutations are not yet optimistic |
| Library | People, Books, Movies, Ideas, References, journal, highlights and metadata workflows | Broad Reference, Idea, Journal, and People coverage | Shipped; IA is long and some entities lack precise destinations |
| Search | Cross-entity text search | Authenticated search tool | Broad retrieval, weak navigation and ranking |
| Chat | Read-only natural-language questions over Home Base data | Direct typed tools are preferred for agents | Shipped; intentionally read-only |
| Calendar | Google Calendar sync, Today display, event detail and links to People/notes | Calendar list/read/create/update | Shipped; setup-dependent |
| Reviews and resurfacing | Scheduled reviews, capture proposals, memory resurfacing | List/settle/respond tools | Shipped |
| Routines | Due routines and completion history | List/history/create/complete tools | Shipped |
| People CRM | People, structured facts, interactions, meeting links | List/read/create/fact/interaction tools | Shipped |
| Notes/docs/files/check-ins | Shared Area/Project depth components and detail surfaces | Read/write coverage for notes, docs, check-ins; files are web-only | Shipped; attachment uploads are bounded and streamed |
| Journal | Entries, editing, export, photo attachments | List/create | Shipped |
| Notifications/audit | Database-backed audit notifications and Pushover | Readable through REST/MCP | No human notification center |
| Hermes | Typed MCP proxy over authenticated REST; 74-tool manifest | Complete non-destructive registry and contract suite | Contract-complete; authenticated live setup not complete |
| iOS/PWA | Responsive web app, manifest and home-screen icons | REST supports future clients | Responsive web only; no native/share extension |

## Surface inventory

### Persistent shell

- `src/components/app-shell.tsx` provides the logo, Search, Chat, Settings, content frame, and persistent dock.
- `src/components/app-dock.tsx` combines global capture and the four-tab bottom navigation.
- `src/app/globals.css` defines a shared 132px collapsed-dock clearance plus the device safe-area inset.
- `src/components/nav-tabs.tsx` exposes Home, Tasks, Areas, and Library.
- The shell is visually coherent and compact. It does not yet provide a skip link, complete active-route semantics, or 44px top utility targets.

### Home — `/`

Primary job: answer “what needs attention and what is next?”

- Date masthead and due/all-clear statement.
- Next commitment and slipping Project summary.
- Attention block for pending capture/review/slippage.
- Today preview with calendar events and tasks.
- Separate upcoming card, including future tasks and events.
- Top starred tasks, routines, and resurfaced memory.

The current branch resolves the earlier empty-Today problem: future commitments remain visible through the Upcoming card and status line.

### Today — `/today`

Primary job: execute the day without opening the full planning system.

- Top tasks, today's calendar, due today, tomorrow, routines, bounded task inbox, and resurfacing.
- Task rows expose the same Task Quick Edit used on the Tasks page.
- Empty Today and Tomorrow sections explain the state rather than leaving blank cards.
- Calendar freshness/configuration is visible.

Resolved capture receipts are suppressed through `selectActionableCaptures()`. Only ambiguous, failed, or otherwise unresolved captures remain visible for intervention.

### Tasks — `/tasks`, `/tasks/[taskId]`

- Quick add with optional destination.
- Today, Tomorrow, Upcoming, Unscheduled, Someday, Done, Routines, and starred/filter views.
- Completion, star, subtasks, recurrence, reminders, priority, notes, and labels.
- Pointer drag between date sections and relative reorder.
- Direct detail facts for Location and Schedule.

The new `TaskQuickEdit` is the reference interaction for future mutation UX:

- 44px controls and a mobile sheet above the app dock;
- desktop dialog treatment;
- Today, Tomorrow, weekend, next week, custom date, Someday, and No date;
- location paths such as `Hobbies / Ham Radio` and unfiled Projects;
- assignment options fetched only when Move opens;
- recent destinations retained locally;
- immediate optimistic labels and close;
- independent serialized mutation channels for schedule and location;
- stale-response protection, exact Undo, rollback, and Retry;
- focus wrapping, Escape, and opener focus restoration.

The older drag path does not meet that standard: it moves cards optimistically but supplies neither rollback nor an error announcement when persistence fails, and its visual handle is not keyboard operable.

### Areas and Projects — `/projects`, `/areas/*`, `/projects/*`

- The Areas index now renders the Area tree, with restrained indentation and disclosure rows.
- Area creation accepts an optional parent.
- Area detail shows a full breadcrumb/path and permits safe reparenting.
- Cycle and invalid-parent checks live in the shared hierarchy boundary.
- Project creation no longer requires an Area.
- Project detail exposes its Area as optional and allows later filing/unfiling.
- Filing a Project mirrors the Area to directly linked Tasks, Ideas, and References atomically.
- Area/Project pages share notes, docs, files, check-ins, and related content primitives.

Current gaps:

- The unified Inbox does not query or count unfiled Projects, despite the approved model.
- The Areas page shows only six recent Projects rather than a stable, explicit unfiled-Project queue.
- All child branches render open on initial load, and the page loads the entire Area tree; this will become noisy as the hierarchy grows.
- Area and Project filing use submit-and-refresh forms rather than the immediate Task Quick Edit interaction.

### Inbox — `/areas/inbox`

- Pending/failed captures, capture review proposals, scheduled reviews, and unfiled Tasks, Ideas, References, Notes, Docs, and Files.
- Clear empty state.
- Direct links exist for several entities and filing controls exist for captures.

The route remains a magic Area-shaped URL, has no persistent navigation entry, and omits unfiled Projects. Notes are not links even though note detail exists; Docs link back to Search instead of a precise destination.

### Library and Read Later — `/ideas`, `/ideas/[database]`, `/references/[id]`

- Global People, Books, Movies, Ideas, References, Journal, highlights, ratings, and provider metadata.
- Read Later is implemented as `Reference.kind = read_later`, keeping one knowledge model.
- Saving requires only a URL; filing is optional.
- URL normalization and active-item deduplication are enforced at the database boundary.
- Metadata enrichment is bounded, SSRF-resistant, best-effort, and cannot prevent saving.
- Queue filters are unread, read, and archived; opening never silently marks read.
- Items may be filed globally, to an Area, or to a Project.

The list has strong empty states, long-string wrapping, 44px controls, and accessible native selects. It eagerly receives all Area/Project options, waits for status/filing mutations, and offers error text but no optimistic state, Retry action, or Undo.

### Search — `/search`

- Searches Captures, Tasks, Projects, Ideas, References, highlights, entity Notes, Docs, check-ins, journal, People, and Person facts.
- Twelve database queries run in parallel, each taking up to 20 rows; the merged result is sliced to 40.
- References and highlights have links.

Most other result kinds are static articles, so Search finds them but cannot open them. Results are concatenated by entity type rather than relevance, which can let early categories crowd out better later matches. Search is useful as evidence retrieval but not yet a world-class command/navigation layer.

### Chat — `/chat`

- Single read-only conversational input.
- Answers data questions through the Home Base read boundary and Anthropic when configured.
- Keeps writes out of an opaque model-driven interaction.

The typed MCP/REST interface is the preferred Hermes integration because its writes are discoverable and auditable.

### Settings — `/settings`

- Google Calendar, Pushover, provider status, API-key revocation, MCP health, and route diagnostics.
- Integration-specific configured/missing/failure states.

Settings are operationally useful but sensitive. They currently depend on the planned external access boundary rather than application-level browser authentication.

## Data and integrity capabilities

- PostgreSQL/Prisma with additive migrations.
- Railway Postgres is canonical for hosted and local real-data use.
- Release verifier checks Area cycles/orphans, Project-child Area mirrors, retained Book/Movie/Area/Project/Reference counts, Read Later status constraints, and the active normalized-URL unique index.
- Capture is append-only in spirit and ambiguous input is preserved.
- Status transitions replace destructive deletes across core entities.
- REST bearer keys use scopes and rate limits; MCP is a typed proxy, not a second application boundary.
- Project filing and key agent mutations are transactional and audited.

## Background and integration capabilities

- Google Calendar OAuth and periodic sync.
- Reminder delivery and Pushover.
- Scheduled review generation and settlement.
- Resurfacing.
- Reference artwork/provider enrichment.
- Apple Reminders and Obsidian import scripts.
- Database backup script.
- Local LaunchAgents for app, reminders, calendar sync, and MCP.
- Tailscale Serve for app/MCP access.
- Railway deployment and canonical database.

## Test and verification posture

The branch has broad behavior-contract coverage under `scripts/*.test.ts`, plus MCP manifest tests and a disposable-Postgres Read Later integration harness. The reviewed implementation includes focused suites for:

- hierarchy paths, cycles, nullable Project Areas, and mirrored filing;
- Task Quick Edit helpers, APIs, UI contracts, coordination, rollback, Retry, and Undo;
- Read Later normalization, mutations, UI, REST, capture, MCP, SSRF/deadline hardening, concurrency, and release constraints;
- complete MCP tool registry/proxy behavior and path/error hardening;
- Home/Today density, upcoming commitments, task inbox, capture behavior, and mobile settings contracts.

The remaining release evidence must include real rendering and interaction at 440×956, 390×844, and 1440×1000. Source-contract tests cannot prove Safari keyboard behavior, actual safe-area insets, clipping, focus traversal, contrast, or horizontal overflow.

## Branch work already completed

These findings from the early audit are fixed on the current branch and should not be reopened as missing features:

- nested Areas are visible, creatable, path-labelled, and reparentable;
- Projects can be created and used without an Area;
- tasks can be assigned to unfiled Projects;
- Read Later has a working Library queue and agent/API surface;
- Home shows upcoming commitments when Today is empty;
- task Location/Schedule are directly editable with lazy options and optimistic recovery;
- Domain-era tools are removed;
- MCP now has a complete 74-tool, non-destructive manifest and broad REST parity.

## Known release state

- The direct Railway origin is intentionally open during rollout, but the app is now intended for real personal data. Cloudflare Zero Trust is therefore a production-use gate, and the direct Railway origin must be blocked when Access is enabled.
- Attachment presign/upload/download routes have no application auth and no enforced size ceiling; local upload buffers the full request before writing.
- Hermes contracts and host routes are documented, but no Hermes executable/configuration or approved dedicated credential was discovered during the host review. Authenticated live discovery/read/write smoke is not yet evidence-backed.
- Browser QA and deployed migration verification remain separate release gates.
