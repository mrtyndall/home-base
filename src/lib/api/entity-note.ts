import type { AuthenticatedApiKey } from "@/lib/api/auth";
import { prisma } from "@/lib/db";

type EntityNoteClient = Pick<typeof prisma, "$transaction">;

export async function updateEntityNoteForApi(
  noteId: string,
  input: { bodyMd: string },
  actor: Pick<AuthenticatedApiKey, "label">,
  client: EntityNoteClient = prisma,
) {
  return client.$transaction(async (tx) => {
    const note = await tx.entityNote.update({
      where: { id: noteId },
      data: {
        bodyMd: input.bodyMd,
        source: `api:${actor.label}`,
      },
    });
    await tx.notification.create({
      data: {
        type: "entity_note_updated",
        title: "Note updated",
        sourceRef: {
          type: "entity_note",
          id: noteId,
          source: "api",
          actor: actor.label,
        },
      },
    });
    return note;
  });
}
