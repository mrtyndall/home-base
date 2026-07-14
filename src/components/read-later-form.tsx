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
}: {
  areas: readonly AreaHierarchyRecord[];
  projects: readonly ReadLaterProjectOption[];
}) {
  return (
    <ReadLaterFormClient
      projects={projects}
      areaPicker={<AreaPicker areas={areas} nullable label="File to Area" />}
    />
  );
}
