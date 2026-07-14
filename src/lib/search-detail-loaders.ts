import type { JournalEntry, Prisma } from "@prisma/client";

type IdeaDetail = Prisma.IdeaGetPayload<{
  include: { area: true; project: true };
}>;

type IdeaDetailClient = {
  idea: {
    findUnique(args: {
      where: { id: string };
      include: { area: true; project: true };
    }): Promise<unknown>;
  };
};

type JournalDetailClient = {
  journalEntry: {
    findUnique(args: { where: { id: string } }): Promise<unknown>;
  };
};

export function loadIdeaSearchDetail(client: IdeaDetailClient, id: string) {
  return client.idea.findUnique({
    where: { id },
    include: { area: true, project: true },
  }) as Promise<IdeaDetail | null>;
}

export function loadJournalSearchDetail(client: JournalDetailClient, id: string) {
  return client.journalEntry.findUnique({ where: { id } }) as Promise<JournalEntry | null>;
}
