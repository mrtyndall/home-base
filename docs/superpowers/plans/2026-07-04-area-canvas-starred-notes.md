# Area Canvas and Starred Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reweight Home Base so Areas are the primary information canvases, check-ins sit at the top as the living timeline, and manually starred notes become stable context anchors.

**Architecture:** Add a nullable `starredAt` timestamp to shared `entity_notes`, expose star/unstar through a small server action, and reuse the existing shared notes container on both area and project pages. Recompose area and project detail pages so check-ins render immediately below the header, important notes render next, and projects remain finite containers inside areas.

**Tech Stack:** Next.js 16 App Router, React server components/actions, Prisma 7, PostgreSQL, Tailwind 4.

## Global Constraints

- No hard deletes; note starring is a timestamp update only.
- Starred notes are manually chosen only; no auto-promotion or suggestions in active UI.
- Check-ins render directly below the header on both Area and Project pages.
- Areas are information canvases; Projects are finite or time-gated efforts inside Areas.
- No badges, red states, guilt copy, or resting prompts.
- Capture bar remains unchanged.

---

### Task 1: Add Manual Star State To Entity Notes

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_entity_note_starred_at/migration.sql`
- Modify: `src/app/actions.ts`
- Create: `src/components/note-star-button.tsx`

**Interfaces:**
- Produces: `entity_notes.starred_at` column, Prisma field `EntityNote.starredAt`.
- Produces: `setEntityNoteStarred(formData: FormData): Promise<void>` server action.
- Produces: `<NoteStarButton noteId starred />` client component.

**Steps:**
- [ ] Add a failing schema/action test by running Prisma generate before the schema field exists and confirming code cannot reference `starredAt`.
- [ ] Add `starredAt DateTime? @map("starred_at")` to `EntityNote`.
- [ ] Add additive SQL migration: `ALTER TABLE "entity_notes" ADD COLUMN "starred_at" TIMESTAMP(3);` plus an index on `(parent_type, parent_id, starred_at)`.
- [ ] Add `setEntityNoteStarred` action that sets `starredAt` to `new Date()` when `starred=true` and `null` when false.
- [ ] Add `NoteStarButton` using the same quiet icon button language as task star.
- [ ] Run `npx prisma generate`, `npx tsc --noEmit`, commit.

### Task 2: Split Important Notes From Regular Notes

**Files:**
- Modify: `src/components/entity-depth.tsx`
- Modify: `src/app/areas/[areaId]/page.tsx`
- Modify: `src/app/projects/[projectId]/page.tsx`

**Interfaces:**
- Consumes: `EntityNote.starredAt`.
- Produces: reusable important notes section with star/unstar controls.

**Steps:**
- [ ] Extend note types to include `starredAt`.
- [ ] Render starred notes in an `Important notes` section before normal notes.
- [ ] Exclude starred notes from the normal notes list only visually; they remain same records and searchable.
- [ ] Show star/unstar controls on both important and regular note rows.
- [ ] Preserve empty-state rule: if no starred notes, render nothing.
- [ ] Run typecheck/lint/build, commit.

### Task 3: Reweight Area Canvas

**Files:**
- Modify: `src/app/areas/[areaId]/page.tsx`
- Modify: `src/app/projects/page.tsx`

**Interfaces:**
- Area page order: header, check-ins, important notes, notes/docs/attachments, standing tasks, projects, linked ideas, pending/review panels where relevant.
- Projects shelf continues to list projects but area links and domain context become more prominent.

**Steps:**
- [ ] Move check-ins immediately below the Area header for Inbox and normal areas.
- [ ] Ensure shared notes/docs/attachments render above tasks/projects on Area pages.
- [ ] Keep pending captures and reviews high on Inbox, but after check-ins unless review content exists.
- [ ] Ensure project cards visibly route back to area/domain context.
- [ ] Run typecheck/lint/build, commit.

### Task 4: Reweight Project Timeline

**Files:**
- Modify: `src/app/projects/[projectId]/page.tsx`

**Interfaces:**
- Project page order: header, check-ins, milestones if present, important notes, tasks, docs/references/attachments, timeframe/actions, activity log.

**Steps:**
- [ ] Keep check-ins directly below the Project header.
- [ ] Place important notes below check-ins and before tasks/docs.
- [ ] Keep milestones high because they define finite project progress.
- [ ] Keep activity log below human-authored context.
- [ ] Run typecheck/lint/build, commit.

### Task 5: Parser And Copy Bias Toward Areas

**Files:**
- Modify: parser prompt/source under `src/lib` or `src/app/api/capture` after locating current implementation.
- Modify: `SCOPE.md` and `ARCHITECTURE.md`.

**Interfaces:**
- Capture parser should classify facts/details/context into area notes/references/check-ins unless a finite goal/time gate is clear.
- Docs record future idea: system-suggested important notes, manual confirmation only, not in active UI.

**Steps:**
- [ ] Locate parser prompt.
- [ ] Add explicit project test: project requires clear end goal, deliverable, or time gate.
- [ ] Add explicit area test: ongoing context/details belong to area note/check-in/reference.
- [ ] Update docs with Area Canvas hierarchy and future idea bucket.
- [ ] Run typecheck/lint/build, commit.

### Task 6: Production Verification

**Files:**
- No code files unless defects appear.

**Steps:**
- [ ] Run `npx tsc --noEmit && npm run lint -- --max-warnings=0 && npm run build`.
- [ ] Push to GitHub.
- [ ] Deploy to the known Railway production service.
- [ ] Verify external production URL with cache-busted curls for Area, Project, and Home routes.
