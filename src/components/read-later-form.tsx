import { AreaPicker } from "@/components/area-picker";
import { ReadLaterFormClient } from "@/components/read-later-form-client";
import type { AreaHierarchyRecord } from "@/lib/hierarchy";

export type ReadLaterProjectOption = {
  id: string;
  name: string;
  areaPath: string | null;
};

export function ReadLaterForm({
  areas,
  projects,
  selectableAreaIds,
}: {
  areas: readonly AreaHierarchyRecord[];
  projects: readonly ReadLaterProjectOption[];
  selectableAreaIds: readonly string[];
}) {
  return (
    <ReadLaterFormClient
      projects={projects}
      areaPicker={(
        <AreaPicker
          areas={areas}
          selectableAreaIds={selectableAreaIds}
          nullable={false}
          label="File to Area"
        />
      )}
    />
  );
}
