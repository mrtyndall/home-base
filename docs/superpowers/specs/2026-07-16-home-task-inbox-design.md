# Home Task Inbox Design

**Date:** 2026-07-16
**Status:** Ready for written-spec review

## Problem

Home currently leads with dated work. A newly captured task without a due date is saved correctly, but Home renders neither the task nor an Inbox count. The capture receipt confirms the write, yet the page still says `0 due today`, which reads as if no task exists.

An undated task is not inherently less important. A task entered while moving may be the freshest expression of intent and may be something the user wants to do immediately, schedule, or file. Home must expose that work without turning into a complete task-management screen.

## Product Principles

- Fresh, unresolved intent receives more visual weight, not less.
- `Due today` and `Task Inbox` are separate truths; Home communicates both.
- Prominence is state-based, not time-based. A task does not become less important merely because time passed.
- Assignment and scheduling should take one deliberate interaction and should not require opening the task detail page.
- Capture receipts remain transient confirmation. They do not become a redundant `Recent captures` section.
- Home stays focused: it shows a bounded working set and links to the complete task view.

## Terminology and State

The **Task Inbox** contains open, top-level tasks that are not Someday tasks and have no due date. A Task Inbox item can already belong to an Area or Project; the Inbox describes its scheduling state, not necessarily its filing state.

A Task Inbox item is **new/untriaged** when `triagedAt` is null. New treatment persists until the user assigns, schedules, or completes the task. It never expires automatically.

Add nullable `Task.triagedAt` mapped to `triaged_at`.

- Existing tasks are backfilled with `triaged_at = updated_at` during migration so the release does not relabel the entire historical Inbox as new.
- A newly created task starts untriaged only when it is open, unscheduled, not Someday, and created without an Area or Project.
- A task created with a due date, Someday state, Area, or Project is already triaged and receives `triagedAt` at creation.
- Assigning or changing an Area/Project sets `triagedAt` if it is null.
- Scheduling, moving to Someday, or completing sets `triagedAt` if it is null.
- Opening, starring, or reading a task does not mark it triaged.
- Clearing a date later does not make an older task new again.

Assignment removes the stronger `New` treatment but an undated task remains in Task Inbox. Scheduling, moving to Someday, or completing removes it from Task Inbox.

## Home Information Hierarchy

The Home status line always acknowledges Task Inbox work when it exists.

Examples:

- `0 due today. 1 new task in Inbox.`
- `2 due today. 3 tasks in Inbox.`
- `Nothing due through tomorrow.` only appears when there is also no Task Inbox work requiring acknowledgment.

Placement is adaptive:

1. When no tasks are due today and Task Inbox is non-empty, Task Inbox appears immediately after the status/attention surfaces and before the Today calendar card.
2. When tasks are due today, the Today card remains first and Task Inbox follows it.
3. Upcoming commitments follow the actionable task surfaces.
4. When Task Inbox is empty, its card is omitted.

This adaptation is based on due-task count, not calendar-event count. A calendar-heavy day with zero due tasks still exposes Task Inbox above the calendar.

## Task Inbox Card

The card uses the existing Home visual language and is optimized for the iPhone 16 Pro Max viewport.

- Header: `Task Inbox`, exact count, and `Open all` deep-linking to the unscheduled task section.
- Bounded list: up to five top-level tasks.
- Ordering: untriaged tasks first by creation time descending; then triaged unscheduled tasks by `sortOrder` ascending, `updatedAt` descending, and `createdAt` descending.
- New tasks receive a restrained teal accent and `New` label. The treatment remains until an allowed triage action occurs.
- Each row shows title and current Area/Project path, or `Inbox` when globally unfiled.
- Tapping the title opens task detail.
- Each row exposes accessible, 44-pixel minimum controls for Assign, Schedule, and Complete.

The card must fit above the capture bar and dock without horizontal clipping. Controls may use a compact overflow/picker treatment, but the three actions remain directly discoverable without swiping.

## Interaction Design

### Assign

- Opens the existing lazy-loaded assignment picker only when requested.
- Offers global Inbox, Areas, and Projects with hierarchy paths.
- Project selection derives the authoritative Area.
- Commits optimistically.
- On success, the row remains if still undated but loses `New` treatment and displays its new path.
- On failure, restore the prior state and show Retry.
- Offer Undo for the committed assignment.

### Schedule

- Opens the existing modern schedule picker with fast presets and custom date support.
- Commits optimistically.
- A dated or Someday task leaves Task Inbox immediately.
- On failure, restore the row and show Retry.
- Offer Undo; undoing restores the row without restoring `New` treatment once the task has been triaged.

### Complete

- Optimistically removes the row.
- Uses the dedicated completion boundary and its audit behavior.
- On failure, restore the row and show Retry.
- Offer Undo using the existing completion undo behavior where available.

All mutation channels remain independent. An assignment request must not cancel a schedule request, while repeated requests in the same channel must reject stale responses.

## Capture-to-Home Feedback

After a capture creates an untriaged task:

1. Keep the existing success receipt.
2. Refresh/reconcile Home immediately so the task appears at the top of Task Inbox without a manual reload.
3. Preserve the server-returned task identity and canonical title; do not invent a second receipt record.
4. Do not add `Recent captures` back to Home.

If task creation succeeds but Home refresh fails, the success receipt remains truthful and the next navigation/revalidation restores the canonical Inbox state.

## Data and Component Boundaries

- A focused Home Task Inbox loader returns exact total count, new count, and the bounded row set.
- The loader owns filtering and deterministic ordering; the page does not reproduce task-state rules.
- A dedicated client Task Inbox component owns optimistic row state and reuses the existing assignment, scheduling, and completion boundaries.
- Existing full Task and global Inbox pages remain the complete review surfaces.
- No background model or worker decides task importance for this feature.

## Error Handling and Accessibility

- Failed reads do not claim the Inbox is empty; Home falls back to its existing setup/error boundary.
- Mutations announce pending, success, failure, Retry, and Undo states accessibly.
- Buttons have explicit labels and at least 44-by-44-pixel touch targets.
- Keyboard and screen-reader operation must not depend on visual ordering or swipe gestures.
- Optimistic removal never becomes the only record of the task; the database remains authoritative.

## Testing and Acceptance

1. A newly created, globally unfiled, undated task appears first on Home with `New` treatment.
2. It remains new across time and reloads until an allowed triage action occurs.
3. Assigning it updates the path, clears `New`, and keeps it in Task Inbox while undated.
4. Scheduling, Someday, and completion remove it optimistically and reconcile with the server.
5. Clearing a date later does not restore `New`.
6. Existing tasks are not marked new after migration.
7. With zero due tasks, Task Inbox appears above calendar events.
8. With due tasks, Today appears before Task Inbox.
9. The status line never says the day is entirely clear while Task Inbox contains work.
10. The card shows no more than five rows and links to all unscheduled tasks.
11. Capture success makes the canonical task visible without a manual reload.
12. Assignment options lazy-load and optimistic actions support rollback, Retry, and Undo.
13. The iPhone 16 Pro Max layout has no clipping, dock overlap, or inaccessible controls.
14. No `Recent captures` section returns to Home.

## Product Evaluation Note

Persistent prominence is intentional for the first real-use period. Record and review whether it feels intrusive after sustained use. If it does, consider a user-controlled collapse or a presentation change before considering time-based decay. Any later adjustment must not imply that an undated task became less important simply because it aged.

## Non-Goals

- Automatic priority scoring or AI ranking.
- Time-based decay of new-task prominence.
- Manual drag ordering on Home.
- Replacing the full Tasks or global Inbox pages.
- Reintroducing capture-history receipts as a Home section.
