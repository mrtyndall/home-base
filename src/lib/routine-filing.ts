import type { Routine } from "@prisma/client";
import { prisma } from "@/lib/db";

type RoutineFilingDataClient = {
  area: {
    findFirst(args: unknown): PromiseLike<{ id: string } | null>;
  };
  routine: {
    findUnique(args: unknown): PromiseLike<Pick<Routine, "id" | "areaId" | "status"> | null>;
    update(args: unknown): PromiseLike<Pick<Routine, "id" | "areaId">>;
  };
};

type RoutineFilingClient = RoutineFilingDataClient & {
  $transaction<Value>(operation: (client: RoutineFilingDataClient) => Promise<Value>): Promise<Value>;
};

export class RoutineFilingError extends Error {
  constructor(public readonly code: "routine_not_found" | "area_not_found") {
    super(code === "routine_not_found" ? "Routine not found or unavailable." : "Area not found or unavailable.");
    this.name = "RoutineFilingError";
  }
}

export async function fileRoutine(
  routineId: string,
  areaId: string | null,
  client: RoutineFilingClient = prisma as unknown as RoutineFilingClient,
) {
  return client.$transaction(async (transaction) => {
    const routine = await transaction.routine.findUnique({
      where: { id: routineId },
      select: { id: true, areaId: true, status: true },
    });
    if (!routine || routine.status !== "active") throw new RoutineFilingError("routine_not_found");

    if (areaId) {
      const area = await transaction.area.findFirst({
        where: { id: areaId, status: "active", isSystem: false },
        select: { id: true },
      });
      if (!area) throw new RoutineFilingError("area_not_found");
    }

    if (routine.areaId === areaId) return { id: routine.id, areaId: routine.areaId };
    return transaction.routine.update({
      where: { id: routine.id },
      data: { areaId },
      select: { id: true, areaId: true },
    });
  });
}
