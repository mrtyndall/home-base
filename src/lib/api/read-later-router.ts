import { z } from "zod";
import type { AuthenticatedApiKey } from "@/lib/api/auth";
import {
  createReadLaterForApi,
  fileReadLaterForApi,
  fileReferenceForApi,
  listReadLaterForApi,
  readReadLaterForApi,
  setReadLaterStatusForApi,
  toReadLaterApiError,
} from "@/lib/api/read-later";
import type { ReadLaterFilingIntent } from "@/lib/read-later";

type Actor = Pick<AuthenticatedApiKey, "label">;
type Method = "GET" | "POST" | "PATCH" | "DELETE" | string;
type Services = {
  list(input: { status?: "unread" | "read" | "archived"; limit: number; cursor?: string }): Promise<unknown>;
  read(id: string): Promise<unknown>;
  create(input: Parameters<typeof createReadLaterForApi>[0], actor: Actor): Promise<unknown>;
  fileReadLater(id: string, filing: ExplicitFiling, actor: Actor): Promise<unknown>;
  fileReference(id: string, filing: ExplicitFiling, actor: Actor): Promise<unknown>;
  status(id: string, status: "unread" | "read" | "archived", actor: Actor): Promise<unknown>;
};
type ExplicitFiling = Exclude<ReadLaterFilingIntent, { mode: "unchanged" }>;

const uuid = z.string().uuid();
const nullableUuid = uuid.nullable().optional();
const destinationFields = { areaId: nullableUuid, projectId: nullableUuid };
const createSchema = z.object({
  url: z.string().trim().min(1),
  title: z.string().trim().min(1).optional(),
  body: z.string().trim().min(1).optional(),
  tags: z.array(z.string()).optional(),
  ...destinationFields,
}).refine((value) => !(value.areaId && value.projectId));
const fileSchema = z.object(destinationFields).refine((value) => !(value.areaId && value.projectId));
const statusSchema = z.object({ status: z.enum(["unread", "read", "archived"]) });
const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: uuid.optional(),
  status: z.enum(["unread", "read", "archived"]).optional(),
});

const defaultServices: Services = {
  list: listReadLaterForApi,
  read: readReadLaterForApi,
  create: createReadLaterForApi,
  fileReadLater: fileReadLaterForApi,
  fileReference: fileReferenceForApi,
  status: setReadLaterStatusForApi,
};

export function readLaterRouteScope(method: Method, path: string[]) {
  const relevant = path[0] === "read-later" ||
    (path[0] === "references" && path.length === 3 && path[2] === "file");
  if (!relevant) return null;
  return method === "GET" ? "read" as const : method === "POST" ? "write" as const : null;
}

function routeNotFound() {
  return Response.json(
    { error: { code: "read_later_route_not_found", message: "Read Later route not found." } },
    { status: 404 },
  );
}

function filingFromInput(
  input: { areaId?: string | null; projectId?: string | null },
  explicit: boolean,
): ReadLaterFilingIntent {
  if (input.projectId) return { mode: "project", projectId: input.projectId };
  if (input.areaId) return { mode: "area", areaId: input.areaId };
  if (explicit || input.areaId === null || input.projectId === null) return { mode: "unfiled" };
  return { mode: "unchanged" };
}

export async function dispatchReadLaterRoute(input: {
  method: Method;
  path: string[];
  url: URL;
  body: unknown;
  actor: Actor;
  services?: Services;
}): Promise<Response | null> {
  const { method, path, url, body, actor, services = defaultServices } = input;
  const [resource, id, action] = path;
  const relevant = resource === "read-later" ||
    (resource === "references" && action === "file");
  if (!relevant) return null;

  try {
    if (method === "GET" && resource === "read-later" && path.length === 1) {
      const query = listSchema.parse(Object.fromEntries(url.searchParams));
      return Response.json({ references: await services.list(query) });
    }
    if (method === "GET" && resource === "read-later" && path.length === 2) {
      return Response.json({ reference: await services.read(uuid.parse(id)) });
    }
    if (method === "POST" && resource === "read-later" && path.length === 1) {
      const parsed = createSchema.parse(body);
      return Response.json({
        reference: await services.create(
          { ...parsed, filing: filingFromInput(parsed, false) },
          actor,
        ),
      });
    }
    if (
      method === "POST" && resource === "read-later" && path.length === 3 &&
      (action === "file" || action === "status")
    ) {
      const referenceId = uuid.parse(id);
      if (action === "status") {
        const parsed = statusSchema.parse(body);
        return Response.json({ reference: await services.status(referenceId, parsed.status, actor) });
      }
      const parsed = fileSchema.parse(body);
      return Response.json({
        reference: await services.fileReadLater(
          referenceId,
          filingFromInput(parsed, true) as ExplicitFiling,
          actor,
        ),
      });
    }
    if (
      method === "POST" && resource === "references" && path.length === 3 && action === "file"
    ) {
      const parsed = fileSchema.parse(body);
      return Response.json({
        reference: await services.fileReference(
          uuid.parse(id),
          filingFromInput(parsed, true) as ExplicitFiling,
          actor,
        ),
      });
    }
    return routeNotFound();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: { code: "invalid_read_later_request", message: "Invalid Read Later request." } },
        { status: 400 },
      );
    }
    return toReadLaterApiError(error);
  }
}
