# Area-First Taxonomy Design

**Date:** 2026-07-13  
**Status:** Draft for user review  
**Scope:** Web app, REST API, capture pipeline, Prisma/PostgreSQL, and native iOS contracts

## Purpose

Home Base should reduce mental load. Capture must stay lossless and low-friction; organization is a separate action that can happen later. The current `Domain -> Area -> Project` hierarchy makes Domain and Area compete for the same meaning and leaves no user-facing way to create either one.

This design removes Domains and makes flat Areas the only durable organizational level above Projects. It also makes Inbox a genuine global intake state instead of a disguised system Area.

## Product principles

1. Capture now; organize later.
2. Inbox is valid, visible, and non-punitive.
3. Areas represent ongoing responsibilities and have no finish line.
4. Projects represent finishable outcomes and always belong to one Area.
5. No sub-areas or sub-projects.
6. AI may suggest a destination, but a suggestion never blocks capture or creation.
7. Books and Movies remain global library collections.
8. People remain global records with an optional link to one Area.

## Approved taxonomy

```text
Global
├── Inbox
│   ├── Raw captures
│   └── Processed but unfiled items
├── Books
├── Movies
└── People
    └── Optional link to one Area

Area
├── Task
├── Routine
├── Note
├── Document
├── Idea
├── Reference
└── Project
    ├── Task
    ├── Milestone
    ├── Note
    ├── Document
    ├── Idea
    └── Reference
```

Areas are a flat list. Projects cannot exist globally or in Inbox; each Project must belong to exactly one Area. Tasks and other eligible content can remain unfiled without becoming invalid.

## Data model

### Remove Domain

- Delete the `Domain` Prisma model and the `domains` table.
- Remove `Area.domainId` and the Domain-to-Area relationship.
- Remove Domain identifiers and aggregates from REST, capture, search, chat, and iOS DTOs.
- Remove Domain routes, links, labels, seed data, and API endpoints.
- Order Areas directly by `sortOrder`, then `name`.

### Remove the system Inbox Area

Inbox will be represented by missing organizational relationships, not by a row in `areas`.

- Remove the `area_inbox` default and system Area seed.
- Make `Task.areaId` nullable and remove its database default.
- Keep `Routine.areaId`, `Idea.areaId`, `Reference.areaId`, and `Person.areaId` nullable.
- Allow `EntityNote`, `EntityDoc`, and uploaded `Document` to have a nullable parent pair so they can be processed but unfiled.
- A nullable parent must be all-or-nothing: both `parentType` and `parentId` are null, or both are populated.
- Check-ins remain attached to a concrete Area, Project, or Journal entry; they are not Inbox items.
- Milestones remain Project-only.

### Relationship invariants

- `Project.areaId` remains required.
- An Area has no parent Area.
- A Project has no parent Project.
- A Task may be:
  - unfiled: `areaId = null`, `projectId = null`;
  - Area-level: `areaId` set, `projectId = null`;
  - Project-level: `projectId` set and `areaId` mirrors the Project's Area for query compatibility.
- If both `areaId` and `projectId` are present on a Task, Idea, or Reference, the Area must match the Project's Area.
- Books and Movies are `Reference` records with their existing kinds and remain global; UI and write validation do not assign them to an Area or Project.
- A Person may have no Area or one Area. A Person is never contained by an Area and never appears in Inbox solely because `areaId` is null.

Database constraints and transactional write helpers should enforce these invariants wherever PostgreSQL can express them safely. Cross-table Area/Project consistency must be enforced through shared mutation helpers and covered by database-backed tests.

## Inbox behavior

The global Inbox combines:

- pending or ambiguous raw Captures;
- open Tasks with no Area or Project;
- active Routines with no Area;
- active Ideas and ordinary References with no Area or Project;
- unfiled Notes, Entity Docs, and uploaded Documents.

Books, Movies, and global People are not Inbox items merely because they lack an Area.

Creating or capturing eligible content without a destination succeeds immediately. The UI may display a non-blocking suggestion such as "Suggested: Home" with actions to accept, change, or ignore. Ignoring a suggestion preserves the item in Inbox without warning language or an error state.

## Creation experience

### Areas index

The current `/projects` surface becomes the Area-first workspace. It contains:

- a primary `New area` action;
- a secondary `New project` action;
- Area cards as the dominant content;
- recent Projects as a supporting rail;
- an empty state that explains Areas and offers `Create your first area`.

The final route name can remain `/projects` for compatibility during the first release, but user-facing navigation says `Areas`. A later route cleanup may introduce `/areas` as the canonical index with a redirect from `/projects`.

### New Area

The Area creation form requires only `Name`. Optional state, next step, cadence, notes, and other context are added from the Area page later. On success, redirect to the new Area.

### New Project

- From an Area page, `New project` preselects and locks the parent Area.
- From the global Areas index, `New project` requires an Area selection.
- If no Areas exist, the global Project action directs the user to create an Area first.
- Project creation never creates a hidden Area automatically.

### Content creation

- Quick capture never requires a destination.
- Explicit creation forms offer optional Area and Project selectors for eligible content.
- Choosing an Area filters the Project selector to Projects in that Area.
- Choosing a Project automatically uses that Project's Area.
- Existing content can move between Inbox, an Area, and a Project later.

## Area and Project pages

An Area page is the ongoing-responsibility workspace. It shows its direct Tasks, Routines, Notes, Documents, Ideas, and References plus its Projects. It offers direct creation actions and a prominent `New project` action.

A Project page remains a focused, finishable workroom. It shows Project Tasks, Milestones, Notes, Documents, Ideas, and References. Moving a Project to a different Area transactionally updates the mirrored Area relationship on its child Tasks, Ideas, and References.

## Capture and AI routing

- The capture parser must no longer depend on a default Inbox Area ID.
- Ambiguous input remains a pending Capture.
- A clearly recognized Task, Routine, Idea, Note, Document, or Reference may be created unfiled.
- A clearly recognized Project requires an Area. If the parser cannot confidently identify one, it keeps the capture pending or proposes Project creation with an Area choice; it does not invent an Area.
- Server-derived capture identity and audit information must not be taken from untrusted client fields.
- Capture retries and manual conversions require idempotency so filing suggestions cannot create duplicate records.

## API and native iOS contracts

- Remove Domain types, fields, filters, and endpoints.
- Make eligible `areaId` and `projectId` request fields optional and nullable.
- Keep `areaId` required for Project creation.
- Return an explicit destination shape that distinguishes Inbox, Area, and Project without clients inferring meaning from display strings.
- Update the iOS Areas/Projects views and pickers to match the same hierarchy.
- Offline iOS capture queues do not require a destination and retain stable idempotency identifiers.
- Version or coordinate breaking DTO changes so the web deployment and iOS branch cannot silently disagree.

## Migration strategy

The migration must be additive-first and verified before destructive cleanup:

1. Back up the Railway database and verify the dump can be read.
2. Record pre-migration counts for every affected table and for Books and Movies.
3. Add nullable columns/constraints required for global Inbox semantics.
4. Convert relationships pointing to `area_inbox` into null/unfiled relationships.
5. Assert there are no Projects assigned to `area_inbox`; abort rather than orphaning them.
6. Remove Domain foreign keys and `Area.domainId`.
7. Remove the system Inbox Area and Domain rows.
8. Drop the obsolete Domain structures only after application code no longer reads them.
9. Compare post-migration counts, explicitly verifying Books and Movies are unchanged.
10. Run application, API-contract, capture, and iOS compatibility checks against a disposable restored database before production deployment.

The migration must not hard-delete user content. Removing obsolete taxonomy rows is allowed only after all dependent content has been safely detached and verified.

## Seed and startup behavior

Runtime startup must not recreate Domains or `area_inbox`. Bootstrap behavior should insert only truly missing immutable system settings and must not overwrite user-managed Areas, Area state, or preferences on restart.

## Error handling

- Invalid or missing destination IDs return structured validation errors.
- Cross-Area Project/content mismatches are rejected, not silently corrected.
- A Project without an Area cannot be created.
- An eligible Inbox item with no destination is valid and does not produce an error.
- Migration preflight failures stop deployment before destructive steps.

## Testing and acceptance criteria

The feature is complete when automated tests prove:

1. An Area can be created with only a name.
2. Areas are flat and no Domain field appears in user-facing or API creation flows.
3. A Project created inside an Area is assigned to that Area.
4. A global Project cannot be created without selecting an Area.
5. Tasks and all other eligible content can be created without a destination and appear in global Inbox.
6. Content can move Inbox -> Area -> Project and back where allowed.
7. Project selection derives and validates its Area.
8. Books and Movies remain global and retain identical counts and records through migration.
9. People remain global and may optionally link to one Area without appearing in Inbox when unlinked.
10. Capture succeeds without a destination and AI suggestions remain optional.
11. No startup or seed path recreates Domains or the system Inbox Area.
12. Web, REST, capture, search/chat, and iOS contract tests agree on the new taxonomy.
13. A disposable database migration preserves all non-taxonomy user records.

## Out of scope

- Nested Areas or Projects.
- Multi-Area People relationships.
- Tags as a replacement hierarchy.
- Redesigning Books or Movies.
- Automatically creating Areas from captures.
- Requiring users to empty Inbox.

## Rollout notes

This is a breaking cross-layer change and should ship behind a coordinated migration, not as disconnected UI edits. The owner has explicitly accepted an open interim Railway deployment while Cloudflare Zero Trust Access is prepared. When Access is enabled on the final custom domain, the direct Railway public domain must be disabled or otherwise blocked so it cannot bypass Access. Bearer and capture endpoint hardening remains required defense in depth.
