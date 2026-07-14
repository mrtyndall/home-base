import type { AuthenticatedApiKey } from "@/lib/api/auth";
import { prisma } from "@/lib/db";

type MilestoneClient = Pick<typeof prisma, "$transaction">;
type MilestoneUpdate = {
  title?: string;
  status?: "open" | "completed";
  sortOrder?: number;
};

export async function updateMilestoneForApi(
  milestoneId: string,
  input: MilestoneUpdate,
  actor: Pick<AuthenticatedApiKey, "label">,
  client: MilestoneClient = prisma,
) {
  return client.$transaction(async (tx) => {
    const milestone = await tx.milestone.update({
      where: { id: milestoneId },
      data: {
        title: input.title,
        status: input.status,
        sortOrder: input.sortOrder,
        completedAt:
          input.status === "completed"
            ? new Date()
            : input.status === "open"
              ? null
              : undefined,
      },
    });
    await tx.notification.create({
      data: {
        type: "milestone_updated",
        title: "Milestone updated",
        sourceRef: {
          type: "milestone",
          id: milestoneId,
          source: "api",
          actor: actor.label,
        },
      },
    });
    return milestone;
  });
}
