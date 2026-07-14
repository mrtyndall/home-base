import { z } from "zod";

const id = z.string().trim().min(1);
const optionalParentId = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? null : value,
  id.nullable().optional(),
);
const requiredParentId = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? null : value,
  id.nullable(),
);

export const hierarchyMcpSchemas = {
  createArea: z.object({
    name: z.string().trim().min(1),
    parentAreaId: optionalParentId,
    currentState: z.string().optional(),
    nextStep: z.string().optional(),
    tendingCadence: z.string().optional(),
  }),
  reparentArea: z.object({ areaId: id, parentAreaId: requiredParentId }),
  createProject: z.object({
    name: z.string().trim().min(1),
    areaId: id.nullable().optional(),
    areaName: z.string().trim().min(1).optional(),
    status: z.enum(["someday", "active", "parked", "completed", "killed"]).optional(),
    currentState: z.string().optional(),
    nextStep: z.string().optional(),
    targetDate: z.string().optional(),
  }),
  updateProject: z.object({
    projectId: id,
    areaId: id.nullable().optional(),
    areaName: z.string().trim().min(1).optional(),
    currentState: z.string().optional(),
    nextStep: z.string().optional(),
    status: z.enum(["someday", "active", "parked", "completed", "killed"]).optional(),
    logEntry: z.string().optional(),
  }),
  fileProject: z.object({ projectId: id, areaId: id.nullable() }),
};

type HierarchyProxyTool = "reparent_area" | "file_project";

export function hierarchyProxyRequest(
  tool: HierarchyProxyTool,
  rawInput: unknown,
) {
  if (tool === "reparent_area") {
    const { areaId, parentAreaId } = hierarchyMcpSchemas.reparentArea.parse(rawInput);
    return {
      path: `/areas/${areaId}`,
      method: "PATCH" as const,
      body: { parentAreaId },
    };
  }
  const { projectId, areaId } = hierarchyMcpSchemas.fileProject.parse(rawInput);
  return {
    path: `/projects/${projectId}`,
    method: "PATCH" as const,
    body: { areaId },
  };
}
