# Capture dismissal and Area navigation

## Goal

Give review captures a safe exit path and make the Areas index a calm list of top-level life Areas. Nested Areas remain directly accessible from their parent and throughout assignment/search paths.

## Capture dismissal

- Each actionable capture card exposes `File` and `Dismiss` as visible peer actions.
- Selecting `Dismiss` opens a compact confirmation sheet on mobile and a centered confirmation dialog on larger screens.
- The prompt explains that dismissal removes the capture from review but preserves its history.
- `Keep capture` closes the prompt without mutation. `Dismiss capture` invokes the existing `dismissCapture` server action.
- Dismissal remains a soft archive using `CaptureStatus.dismissed`; no capture row is hard-deleted.
- On success, existing path revalidation removes the card from Today and other review queues.
- The dialog uses a modal backdrop, explicit title, keyboard focus, 44px controls, and an explicit close control.

## Area navigation

- The `/projects` Areas index renders only root Areas (`parentAreaId` is null). It does not recursively render descendants.
- An Area detail page renders its immediate active children in a `Subareas` section. Each row links to the child and shows a concise activity summary.
- Descendants remain available through successive Area detail pages, preserving arbitrary hierarchy depth without crowding the root.
- Breadcrumbs and assignment pickers continue using full hierarchy paths such as `Hobbies / HAM Radio`.
- The live `HAM Radio` Area is reparented under `Hobbies` through the existing validated hierarchy boundary. The operation must reject ambiguity if either name matches multiple active Areas.

## Error handling and safety

- Capture dismissal uses the existing audited soft-dismiss boundary and remains idempotent.
- The card is not hidden optimistically before the audited server action completes; the existing server action must not hard-delete data.
- Area reparenting uses the existing cycle-safe, transaction-backed hierarchy update.
- No Projects, Tasks, Notes, or References are moved when an Area is reparented; their Area IDs remain unchanged and their displayed path updates automatically.

## Verification

- Add a failing UI contract for the dismiss confirmation before implementation.
- Update hierarchy UI tests to require a root-only index and a child list on Area detail.
- Run focused tests, the complete test suite, lint, TypeScript, and the production build.
- Verify the live hierarchy reads `Hobbies / HAM Radio` after deployment and both `/projects` and `/today` return successfully.
