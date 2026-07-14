import type { AuthenticatedApiKey } from "@/lib/api/auth";
import { prisma } from "@/lib/db";
import { resolveVerifiedDestination } from "@/lib/destinations";
import { createTaskWithAudit } from "@/lib/tasks";

type IdeaConversionClient = Pick<typeof prisma, "$transaction">;
type IdeaConversionInput = {
  to: "task" | "project";
  title?: string;
  areaId?: string;
};

export async function convertIdeaForApi(
  ideaId: string,
  input: IdeaConversionInput,
  actor: Pick<AuthenticatedApiKey, "label">,
  client: IdeaConversionClient = prisma,
) {
  return client.$transaction(async (tx) => {
    const idea = await tx.idea.findUnique({ where: { id: ideaId } });
    if (!idea) return null;

    let converted: { type: "task" | "project"; value: unknown };
    if (input.to === "task") {
      const task = await createTaskWithAudit(
        {
          title: input.title ?? idea.title,
          notes: idea.body,
          areaId: input.areaId ?? idea.areaId,
          source: `api:${actor.label}`,
        },
        { source: "api", label: actor.label },
        tx,
      );
      converted = { type: "task", value: task };
    } else {
      const areaId = input.areaId ?? idea.areaId;
      if (areaId) await resolveVerifiedDestination({ areaId }, tx);
      const project = await tx.project.create({
        data: {
          name: input.title ?? idea.title,
          areaId,
          currentState: idea.body ?? "Converted from idea.",
          activity: {
            create: {
              entry: "Converted from idea through API.",
              source: `api:${actor.label}`,
            },
          },
        },
      });
      converted = { type: "project", value: project };
    }

    await tx.idea.update({
      where: { id: ideaId },
      data: {
        status: "converted",
        convertedToType: converted.type,
        convertedToId: (converted.value as { id: string }).id,
      },
    });
    await tx.notification.create({
      data: {
        type: "idea_converted",
        title: "Idea converted",
        sourceRef: {
          type: "idea",
          id: ideaId,
          to: converted.type,
          source: "api",
          actor: actor.label,
        },
      },
    });
    return converted;
  });
}
