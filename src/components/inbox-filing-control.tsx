"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AreaPicker } from "@/components/area-picker";
import { flattenAreaOptions, type AreaHierarchyRecord } from "@/lib/area-options";
import { InboxFilingCoordinator } from "@/lib/inbox-filing-coordinator";

type FilingValue = { areaId: string | null; label: string };

export function InboxFilingControl({
  entityType,
  entityId,
  areas,
  selectableAreaIds,
}: {
  entityType: "project" | "routine";
  entityId: string;
  areas: readonly AreaHierarchyRecord[];
  selectableAreaIds: readonly string[];
}) {
  const router = useRouter();
  const [coordinator] = useState(() => new InboxFilingCoordinator<FilingValue>(
    { areaId: null, label: "No area yet" },
    (left, right) => left.areaId === right.areaId,
    () => router.refresh(),
  ));
  const state = useSyncExternalStore(coordinator.subscribe, coordinator.snapshot, coordinator.snapshot);
  const mounted = useSyncExternalStore(
    useCallback(() => () => {}, []),
    useCallback(() => true, []),
    useCallback(() => false, []),
  );
  const paths = useMemo(() => new Map(flattenAreaOptions(areas).map((area) => [area.id, area.path])), [areas]);

  useEffect(() => () => coordinator.dispose(), [coordinator]);

  const endpoint = entityType === "project"
    ? `/api/projects/${entityId}/area`
    : `/api/routines/${entityId}/area`;

  async function write(next: FilingValue) {
    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ areaId: next.areaId }),
    });
    if (!response.ok) throw new Error("Filing failed");
    const result = await response.json() as { entity?: { areaId: string | null } };
    const areaId = result.entity?.areaId ?? next.areaId;
    return { areaId, label: areaId ? paths.get(areaId) ?? next.label : "No area yet" };
  }

  async function changeArea(areaId: string | null) {
    const next = { areaId, label: areaId ? paths.get(areaId) ?? "Area" : "No area yet" };
    await coordinator.mutate(next, write);
  }

  async function retry() {
    await coordinator.retry(write);
  }

  async function undo() {
    await coordinator.undo(write);
  }

  return (
    <>
      <details className="mt-1">
        <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-full text-[13px] font-medium text-teal-700 transition hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 [&::-webkit-details-marker]:hidden">
          {state.value.areaId ? state.value.label : "Assign area"}
        </summary>
        <div className="rounded-[12px] bg-[#F7F9F5] p-3">
          <AreaPicker
            areas={areas}
            selectableAreaIds={selectableAreaIds}
            value={state.value.areaId ?? ""}
            disabled={state.pending}
            label={state.pending ? "Assigning…" : "Move to"}
            onChange={(event) => void changeArea(event.target.value || null)}
          />
        </div>
      </details>
      {mounted && (state.error || state.undo) ? createPortal(
        <div className="fixed inset-x-3 bottom-[calc(var(--app-dock-clearance)+0.75rem)] z-[80] mx-auto max-w-md sm:bottom-6">
          {state.error ? (
            <div role="alert" className="flex min-h-11 items-center gap-3 rounded-[14px] border border-[#DDE5DD] bg-[#F7FAF5] px-4 text-sm text-stone-800 shadow-lg">
              <span className="min-w-0 flex-1">Couldn’t assign area</span>
              <button type="button" disabled={state.pending} onClick={() => void retry()} className="min-h-11 shrink-0 font-semibold text-teal-800 disabled:opacity-50">Retry</button>
            </div>
          ) : null}
          {state.undo ? (
            <div role="status" aria-live="polite" className="flex min-h-11 items-center gap-4 rounded-[14px] bg-stone-900 px-4 text-sm text-white shadow-lg">
              <span className="min-w-0 flex-1">Area assigned</span>
              <button type="button" disabled={state.pending} onClick={() => void undo()} className="min-h-11 font-semibold text-teal-200 disabled:opacity-50">Undo</button>
            </div>
          ) : null}
        </div>,
        document.body,
      ) : null}
    </>
  );
}
