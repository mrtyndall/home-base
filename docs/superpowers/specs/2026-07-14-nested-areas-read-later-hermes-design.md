# Nested Areas, Read Later, and Hermes Integration Design

**Date:** 2026-07-14  
**Status:** Approved for autonomous implementation  
**Scope:** Web app, Prisma/PostgreSQL, capture pipeline, REST API, MCP server, agent documentation, and mobile-responsive UI

## Purpose

Home Base should accept useful information immediately and let structure emerge later. Projects must not require an Area at creation time. Areas should support natural hierarchy without reintroducing a competing Domain concept. Saved web links should become durable, fileable knowledge. Hermes should be able to use the same trusted capabilities as the app through a complete, documented agent interface.

## Product principles

1. Capture and creation never require filing.
2. One organizational concept is enough: Areas may contain Areas.
3. Projects are finishable outcomes and may remain globally unfiled until their context is clear.
4. Hierarchy is visible when useful but never required during quick capture.
5. Read Later is a Reference workflow, not a second knowledge database.
6. Agent writes use the same validation, audit, and non-destructive rules as human writes.
7. Existing Books and Movies remain global library collections.

## Chosen structure

```text
Global
├── Inbox
│   ├── Unfiled tasks and content
│   └── Unfiled projects
├── Read Later
├── Books
├── Movies
└── People

Area
├── Child Area
│   └── Child Area (unlimited depth)
├── Task
├── Routine
├── Note / Document / Idea / Reference
└── Project
    ├── Task
    ├── Milestone
    └── Note / Document / Idea / Reference
```

Example:

```text
Hobbies
└── Ham Radio
    └── Build portable digital station
```

Domains remain retired. A second user-facing container type would recreate the ambiguity this model is meant to remove.

## Data model and invariants

### Nested Areas

- Add nullable `Area.parentAreaId` with a self-relation and an index suitable for child listing.
- A null parent means a root Area.
- The data model permits unlimited depth.
- Mutations reject self-parenting and any change that would create a cycle.
- Retiring or parking an Area does not cascade status changes or delete descendants.
- An Area with children cannot be deleted; Home Base continues to expose no destructive API.
- Area names need only be unique among siblings in the UI; IDs remain the durable identity. Existing globally duplicated names are preserved.

### Optional Project filing

- Make `Project.areaId` nullable and its Area relation optional.
- Project creation requires only a name. Area and target date remain optional.
- A Project with no Area appears in the global Inbox/unfiled Project section and remains fully usable.
- Tasks, Ideas, and References may belong to an unfiled Project with their own `areaId = null`.
- When a Project is assigned to an Area, directly linked Tasks, Ideas, and References mirror that Area for current query compatibility.
- Moving a Project to another Area updates those mirrored Area IDs in the same transaction.
- Removing a Project from an Area clears the mirrored Area IDs on directly linked children in the same transaction.
- A child explicitly detached from the Project follows ordinary Area-level or Inbox rules.

### Hierarchy validation boundary

A shared server-side hierarchy module owns:

- ancestor and breadcrumb resolution;
- flattened, depth-labelled Area options;
- cycle checks;
- Project filing and mirrored child updates;
- active/parked eligibility rules.

Web actions, REST routes, capture execution, and MCP tools must call this boundary instead of duplicating relationship logic.

## Area and Project experience

### Areas index

- Root Areas are the primary rows/cards.
- Child Areas appear indented under their parent with restrained disclosure controls.
- Each Area shows a breadcrumb on its detail page.
- `New area` accepts an optional parent. From an Area page, the parent is preselected but removable.
- Area pickers render paths such as `Hobbies / Ham Radio` so duplicate leaf names remain understandable.
- Reparenting is available from Area detail/edit UI and prevents invalid destinations.

### Projects

- Global `New project` defaults to no Area and does not show an error or warning for that choice.
- Creation from an Area page preselects that Area but the user may choose `No area yet`.
- Unfiled Projects have an unobtrusive `Assign to Area` action on detail and Inbox surfaces.
- Project cards and task filing controls show the full Area path when assigned.
- Assigning a task to an unfiled Project is valid and does not force an Area selection.

## Read Later

### Representation

Read Later items use the existing `Reference` model with `kind = "read_later"`. Add fields needed for a dependable reading queue:

- `readStatus`: `unread`, `read`, or `archived`;
- `savedAt` (defaults to creation time);
- `readAt` (nullable);
- normalized URL for deduplication while retaining the submitted URL;
- optional title, excerpt/body, source metadata, tags, Area, and Project.

Books and Movies keep their current behavior and are never mixed into the Read Later queue.

### Capture and creation

- A compact `Save link` action accepts a URL first. Title and filing are optional.
- The server validates HTTP(S), normalizes common tracking parameters, and prevents accidental duplicate active queue items.
- Metadata enrichment is best-effort. A fetch or parsing failure never loses the URL or blocks saving.
- Capture language such as `read later https://…` creates a Read Later Reference.
- Generic captured URLs remain normal References unless the user expresses reading intent.

### Reading queue

- Library gains a `Read Later` destination with unread items first and clear read/archived filters.
- Rows show title, host, saved date, short excerpt when available, and Area/Project path.
- Primary actions are `Open`, `Mark read`, and `File`.
- Opening a link does not silently mark it read.
- Marking read preserves the item and all relationships.
- Read Later items can be global, Area-level, or Project-level and can be reassigned later.

## Hermes and agent integration

### Connection model

- MCP is the preferred Hermes interface because it exposes typed, discoverable tools.
- REST remains the compatibility and diagnostic interface.
- The local MCP service remains bound to loopback and is exposed only through Tailscale Serve.
- Authentication uses a dedicated Home Base API key with `read`, `write`, and `capture` scopes, stored through the approved secret path and never in repository files or chat output.

### Capability parity

Hermes must be able to:

- search and read Today, calendar, tasks, Areas (including hierarchy), Projects, Ideas, References/Read Later, notes/docs, milestones, check-ins, journal, reviews, routines, and People;
- create and update Tasks, Areas, Projects, Ideas, References/Read Later, notes/docs, milestones, check-ins, journal entries, reviews, routines, and People interactions;
- file or refile eligible records and reparent Areas;
- complete or settle tasks, milestones, routines, reviews, and Read Later status;
- use the lossless capture endpoint for ambiguous natural-language input.

The integration remains non-destructive: no delete tools. Every write is audited and uses shared application validation.

### Integration package

The repository will include a Hermes-facing guide containing:

- local repository path: `/Users/matt/projects/home-base`;
- Git remote: `git@github.com:mrtyndall/home-base.git`;
- local app and MCP health endpoints;
- Tailnet MCP route discovered from `tailscale serve status`;
- Railway app URL for browser access;
- required scopes, safe key-registration procedure using environment references only;
- example MCP configuration with placeholders, not credentials;
- a capability verification checklist and smoke-test prompts.

Documentation must not assume the old Proxmox or Mac Studio execution context without verifying the current host.

## REST and MCP contracts

- Area responses include `parentAreaId`, `depth`, and breadcrumb/path information where useful.
- Area create/update accepts an optional parent and rejects cycles.
- Project create/update accepts nullable `areaId`.
- Destination inputs allow `projectId` without `areaId` when the Project itself is unfiled.
- Add list/create/read/update/file/status endpoints for Read Later References.
- Add or update MCP tools for hierarchy reads/reparenting, unfiled Project creation/filing, Reference/Read Later management, and any existing product capabilities missing from the agent surface.
- Retire Domain-era tool names and descriptions. Compatibility aliases may remain temporarily only when needed for an existing client, and must be documented as deprecated.

## Error handling and integrity

- Cycle attempts return a clear validation error and write nothing.
- Filing transactions are atomic across the Project and mirrored children.
- Invalid or unavailable Areas never cause an item to be lost; creation falls back to unfiled only when the caller did not explicitly require a destination.
- Explicit invalid IDs return an error rather than silently changing intent.
- URL metadata failures leave a usable Read Later item.
- Agent/API errors never expose credentials, connection strings, or raw internal exceptions.

## Migration and deployment

1. Add `areas.parent_area_id` and make `projects.area_id` nullable with non-destructive foreign keys and indexes.
2. Preserve every existing Area, Project, Book, Movie, and Reference.
3. Existing Areas become roots; existing Projects retain their current Areas.
4. Add Read Later fields with defaults that do not change existing Reference kinds.
5. Update application code before enabling hierarchy mutations in production.
6. Run pre/post migration integrity checks, including Area cycle count, orphan relationships, Project-child Area consistency, and retained media/reference counts.
7. Deploy through Railway, then rebuild/restart the local app and MCP LaunchAgents.

## Review deliverable

The full product review produces a separate, evidence-based report covering:

- feature completeness and dead/duplicate surfaces;
- information architecture and terminology;
- mobile and desktop navigation;
- capture, Inbox, Today, task, Area, Project, Library, search, chat, settings, and agent flows;
- accessibility, responsive layout, loading/empty/error states, performance, security, and operational reliability;
- a ranked roadmap using `P0 correctness/security`, `P1 workflow friction`, `P2 polish`, and `P3 expansion`.

Only fixes required for this release's new behavior or for serious correctness/security defects are implemented automatically. Broader redesign recommendations are documented for deliberate follow-up.

## Acceptance criteria

1. Areas can be nested and reparented without cycles; breadcrumbs and path-labelled pickers work on mobile and desktop.
2. Projects can be created, used, assigned, moved, and unassigned without requiring an Area.
3. Project-linked child destinations remain consistent after filing changes.
4. A URL can be saved to Read Later globally or under an Area/Project, survives metadata failure, and can be marked read or archived.
5. Read Later is visible in Library, search, REST, capture, and MCP.
6. Hermes documentation targets the verified current runtime and its smoke tests cover every supported capability group.
7. Domain-era UI/tool language is removed from active paths.
8. Existing Books, Movies, Areas, Projects, and References survive migration unchanged except for additive defaults.
9. Automated tests cover hierarchy cycles, optional Project Area, mirrored filing, URL normalization/deduplication, status transitions, auth/scopes, and MCP proxy contracts.
10. Production build, lint, typecheck, Prisma validation, migration pre/post checks, responsive browser QA, Railway deployment, and local LaunchAgent health all pass.

## Out of scope for this release

- collaborative accounts or permissions;
- automatic full-text article scraping or offline reader mode;
- browser extensions or native share extensions (the API contract will support them later);
- automatic AI filing without confirmation;
- destructive delete operations;
- wholesale visual redesign unrelated to the new workflows.
