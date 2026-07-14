# Mobile Today, Upcoming, and Task Filing Design

## Goal

Make Home Base useful on quiet days and faster to organize on an iPhone. Home should expose the next commitments after Today, unassigned tasks should be fileable without opening the full editor, and the Today page should not repeat captures that have already become tasks.

## Scope

This release changes three related mobile workflows:

1. Home gains a compact Upcoming card containing the next three future dated tasks and calendar events in chronological order.
2. An open task with neither an Area nor a Project gains an `Assign to Area or Project` action on its detail page.
3. Today uses tighter mobile spacing, collapses empty task sections, and shows only captures that still require action.

The desktop layout remains responsive and uses the same data. This release does not redesign Today as a single agenda timeline, change task scheduling semantics, or add new database columns.

## Home Upcoming

The existing Today card remains first. A new Upcoming card follows it and excludes commitments already rendered in Today.

- Combine open, non-someday tasks dated after today with calendar events starting after the end of today.
- Sort the combined collection chronologically. Events use their start time; tasks use their due date and due time, with untimed tasks ordered before timed tasks on the same date.
- Render at most three commitments, regardless of how far away they are, so a quiet week does not produce another empty surface.
- Each row identifies whether it is a task or calendar event and includes its date/time.
- Task rows link to task detail. Calendar rows link to their calendar-event detail.
- If no future commitments exist, omit the Upcoming card.

The status line can continue naming the next commitment. The card provides the scannable context that the status sentence cannot.

## Quick Task Filing

When an open task has no `areaId` and no `projectId`, its detail page shows an `Assign to Area or Project` button directly below the title context and above the facts card.

Activating the button opens a compact inline mobile-friendly picker:

- Area is optional and starts unselected.
- Project is optional and is filtered by the selected Area when an Area is chosen.
- Choosing a Project automatically uses that Project's Area, following the existing destination contract.
- Saving calls the existing task-assignment endpoint and refreshes the task detail.
- The control displays an inline failure message if the request fails.
- After successful filing, the button disappears and the existing Area/Project context label shows the destination.

Assigned tasks keep the current full Edit form for later reassignment. This release optimizes the unfiled case only.

## Today Mobile Cleanup

The Today page keeps its current information hierarchy but becomes denser on narrow screens.

- Reduce top-level and section spacing on mobile while preserving the current desktop spacing at larger breakpoints.
- Empty Due Today and Tomorrow task drop zones render a compact empty line instead of reserving task-card height.
- Avoid stacked empty-state surfaces when a calendar section already contains useful content.
- Preserve comfortable tap targets and the sticky capture/navigation controls.

`Recent captures` becomes an action-only surface:

- Show only active captures that are ambiguous, failed, pending, or contain a `pending_capture` created item.
- Do not show a capture merely because it recently created a task or another durable item.
- Label the remaining section `Captures to review` so its purpose is explicit.
- Omit the section entirely when nothing needs review.

## Data Flow and Boundaries

- Extend `getTodayDashboard` with a bounded upcoming task query and upcoming calendar query, then merge them through a small pure helper that owns ordering and the three-item limit.
- Reuse the existing `/api/tasks/[taskId]/assignment` endpoint and verified destination resolver.
- Extract or reuse a pure capture predicate so the server query/result filtering and UI tests share one definition of actionable captures.
- Keep view components focused: an Upcoming list, an unassigned-task filing control, and compact empty-state rendering.

## Error Handling

- A failure to load future commitments follows the existing Today dashboard readiness behavior.
- Assignment failures leave the picker open, retain the user's choices, and show a short inline error.
- Empty upcoming data and empty actionable-capture data are normal omitted states, not errors.

## Testing and Verification

Use test-driven development for each behavior:

- Pure ordering tests cover tasks/events, same-day timing, exclusion of Today, and the three-item cap.
- UI contract tests prove Home renders Upcoming and task/event links.
- Task-detail tests prove only unassigned open tasks receive the quick filing control and that Project selection derives its Area through the existing endpoint.
- Capture tests prove processed task captures are excluded while pending, ambiguous, and failed captures remain.
- Mobile layout tests assert compact empty-state and responsive spacing contracts.
- Run the full unit suite, lint, TypeScript, Prisma validation, and production build.
- Verify Home, Today, and an unassigned task at an iPhone-sized viewport before deployment.

## Release Notes

Deploy through the existing Railway workflow from a clean reviewed commit. No destructive database operation or schema migration is required. Rebuild and restart the local Railway-backed LaunchAgent after production verification.
