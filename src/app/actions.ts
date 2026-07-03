"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export async function completeTask(formData: FormData) {
  const taskId = formData.get("taskId");
  if (typeof taskId !== "string" || taskId.length === 0) {
    return;
  }

  await prisma.task.update({
    where: { id: taskId },
    data: {
      status: "completed",
      completedAt: new Date(),
    },
  });

  revalidatePath("/");
  revalidatePath("/tasks");
}
