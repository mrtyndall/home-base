# Task Quick Edit UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make task filing and date changes direct, optimistic, lazy-loaded, recoverable, and excellent on iPhone 16 Pro Max.

**Architecture:** A reusable `TaskQuickEdit` owns optimistic display state and an adaptive sheet/popover. Pure preset/state helpers are tested separately; assignment choices come from an on-demand endpoint; existing PATCH endpoints remain authoritative and return display labels.

**Tech Stack:** React 19, Next.js 16 App Router, TypeScript, Tailwind CSS, native dialog/focus semantics, Node test runner.

## Global Constraints

- Primary mobile viewport is 440×956 CSS pixels; 390×844 and 1440×1000 are regression targets.
- Every action is at least 44px and long paths wrap without horizontal overflow.
- No confirmation step; optimistic save with rollback, Retry, and six-second Undo.
- Full destination hierarchy lazy-loads only when filing opens.
- Existing server validation and audit boundaries remain authoritative.

---

### Task 1: Pure presets and optimistic operation state

**Files:**
- Create: `src/lib/task-quick-edit.ts`
- Create: `scripts/task-quick-edit.test.ts`

**Interfaces:**
- Produces: `taskDatePresets(today)`, `displayTaskSchedule(value)`, `beginOptimisticOperation`, `settleOptimisticOperation`, and stale-operation protection.

- [ ] Write failing tests for Friday/Saturday weekend, Sunday/Monday next-week boundaries, date/null/Someday labels, rollback, retry payload preservation, and stale response rejection.
- [ ] Run `npx tsx --test scripts/task-quick-edit.test.ts` and confirm RED for missing module.
- [ ] Implement minimal pure helpers using date-only strings and America/New_York inputs supplied by the server; do not use client UTC conversion.
- [ ] Run focused tests and `npm test`; commit `feat: add task quick edit state helpers`.

### Task 2: Lazy assignment options and authoritative response labels

**Files:**
- Create: `src/app/api/tasks/[taskId]/assignment-options/route.ts`
- Modify: `src/app/api/tasks/[taskId]/assignment/route.ts`
- Modify: `src/app/api/tasks/[taskId]/schedule/route.ts`
- Create: `scripts/task-quick-edit-api.test.ts`

**Interfaces:**
- Produces: GET assignment options with Area/Project paths; PATCH responses with `displayLabel`; unchanged validation/audit trust.

- [ ] Write behavior tests for on-demand eligible hierarchy, Inbox, unfiled Project labels, authoritative Project Area, date labels, invalid/closed task responses, and one audit per write.
- [ ] Run focused tests and confirm RED.
- [ ] Implement using `flattenAreaOptions`, current destination resolution, and shared date formatting; no page-level eager option query.
- [ ] Run focused tests, `npm test`, TypeScript, and scoped lint; commit `feat: add lazy task quick edit api`.

### Task 3: Reusable adaptive quick-edit UI

**Files:**
- Create: `src/components/task-quick-edit.tsx`
- Modify: `src/app/tasks/[taskId]/page.tsx`
- Modify: `src/components/task-scheduling.tsx`
- Retire or reduce: `src/components/task-quick-assignment.tsx`
- Create: `scripts/task-quick-edit-ui.test.ts`

**Interfaces:**
- Consumes: preset helpers and lazy/PATCH endpoints.
- Produces: direct detail facts and one adaptive list/detail quick-edit surface.

- [ ] Write render/source behavior contracts for visible unset facts, lazy fetch timing, presets, recent destinations, optimistic close/update, stale guard, rollback/Retry, Undo, dialog labels, 44px controls, safe-area padding, and wrapping.
- [ ] Run focused tests and confirm RED.
- [ ] Build the component with local operation tokens and device-local recent IDs. The mobile sheet uses fixed positioning, `max-height`, internal scrolling, `padding-bottom: calc(var(--app-bottom-clearance) + env(safe-area-inset-bottom))`, and reduced-motion-safe transitions.
- [ ] Remove eager assignment option loading from task detail/list loaders and use the new component in both contexts.
- [ ] Run focused tests, full tests, TypeScript, lint, and build; commit `feat: modernize task filing and scheduling`.

### Task 4: iPhone verification and review fixes

**Files:**
- Modify: only files required by verified review findings.

- [ ] Inspect Home task cards, Tasks list/card, and assigned/unassigned task detail at 440×956; repeat at 390×844 and desktop.
- [ ] Verify safe areas, persistent capture/navigation clearance, focus trapping/restoration, Escape, scroll containment, long unbroken paths, dynamic type wrapping, and zero horizontal overflow.
- [ ] Exercise success, simulated failure/Retry, rapid two-choice stale response, and Undo without leaving inconsistent UI.
- [ ] Fix every Critical/Important finding with a regression test; record Minor findings for final whole-branch review.
- [ ] Run `npm test`, lint, TypeScript, Prisma validate, build, and diff check; commit verified fixes.
