# Task Quick Edit UX Design

**Date:** 2026-07-14  
**Status:** Approved for autonomous implementation  
**Primary target:** iPhone 16 Pro Max, 440×956 CSS pixels

## Purpose

Moving a task and changing its date are among Home Base's highest-frequency actions. They should feel like direct manipulation, not form editing. The current experience splits assignment and scheduling across a small list popover, an unassigned-only disclosure, and a large task-detail edit form. It waits for network completion, eagerly sends every destination, and uses sub-44px controls in the densest flow.

## Chosen interaction

One reusable `TaskQuickEdit` client boundary powers task detail and list cards.

- The task detail header exposes two plain fact buttons: current location (`Inbox`, Area path, or Project) and current schedule (`No date`, date, or `Someday`). They remain visible even when unset.
- List cards keep one compact quick-edit trigger, but it opens the same controls and vocabulary as detail.
- At widths below 640px, quick edit is a bottom sheet above the persistent capture/navigation chrome and safe-area inset. On larger screens it is an anchored popover/dialog.
- The first screen presents scheduling presets and recent filing destinations. The complete Area/Project hierarchy is fetched only when the user opens `Move task` or searches.
- Every actionable row is at least 44px high, keyboard reachable, screen-reader labelled, and able to wrap long paths without horizontal overflow.

## Scheduling

Primary presets:

- Today
- Tomorrow
- This weekend (the next Saturday; if today is Saturday, today)
- Next week (the next Monday)
- Pick date
- Someday
- No date

The native date picker remains the reliable custom-date control. Existing due time, recurrence, reminders, priority, notes, and labels stay in the full Edit disclosure; quick edit does not grow into a second complete editor.

## Filing

- `Move task` shows recent destinations first when known on this device, then `Inbox`, then a searchable hierarchy.
- Areas use full paths such as `Hobbies / Ham Radio`.
- Projects show `Project — Area path`; unfiled Projects show `Project — No area yet`.
- Selecting a Project derives its Area server-side. Selecting Inbox clears Area and Project.
- Destination options load from a dedicated task endpoint on first opening the filing view, not in the initial page payload.
- Successful destinations are retained as a small device-local recent-ID list; the server remains authoritative and unavailable IDs are silently dropped.

## Optimistic behavior and recovery

- On selection, the visible date/location updates immediately and the sheet closes.
- Each mutation has an operation token. A stale response cannot overwrite a newer user choice.
- Success triggers a quiet route refresh and a six-second `Undo` toast.
- Undo sends the exact prior destination or schedule through the same validated endpoint and updates optimistically again.
- Failure restores the prior visible value and shows a persistent, accessible `Couldn’t update task` message with `Retry`; no data is silently lost.
- Controls prevent duplicate submission of the same value but do not globally block unrelated task controls.

## API changes

- `GET /api/tasks/:taskId/assignment-options` returns eligible path-labelled Areas and Projects only when requested.
- Existing assignment PATCH remains the sole destination mutation boundary and returns the authoritative display label.
- Schedule PATCH accepts `dueDate` or `someday` as today and additionally returns an authoritative display label.
- Shared pure helpers calculate preset dates and optimistic state transitions; behavior tests cover timezone boundaries and stale operations.

## Visual direction

Keep Home Base's quiet stone/teal system. The signature is immediacy: compact fact buttons turn into a tactile sheet with one clear list of choices. No decorative dashboard treatment, nested modal stacks, confirmation dialogs, or warning colors. Use a restrained sheet handle, hairline separators, strong selected-state checkmarks, and one teal primary accent.

## Acceptance criteria

1. Task location and schedule are directly editable from detail and consistently editable from list cards.
2. At 440×956, the bottom sheet clears Safari safe areas plus the capture/navigation bars, has no horizontal overflow, and keeps all controls at least 44px.
3. Assignment options are not loaded until the filing view opens.
4. Today, Tomorrow, This weekend, Next week, custom date, Someday, and No date produce correct values in America/New_York.
5. UI updates immediately, stale responses are ignored, failures roll back with Retry, and successful changes offer Undo.
6. Areas/Projects use full hierarchy paths and support Inbox and unfiled Projects.
7. Server validation, audit notifications, and Project-authoritative Area derivation remain unchanged in trust level.
8. Smaller-phone 390×844 and desktop 1440×1000 regression checks remain usable.

## Out of scope

- natural-language date parsing;
- bulk multi-task editing;
- changing recurrence/reminders/time in quick edit;
- cross-device recent destinations;
- swipe gestures that hide core actions.
