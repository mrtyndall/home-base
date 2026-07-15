import { prisma } from "@/lib/db";
import { dateOnlyFromString, localDateString } from "@/lib/dates";

export const GLOBAL_INBOX_PAGE_SIZE = 30;

export async function loadGlobalInboxPage(
  page: number,
  client: typeof prisma = prisma,
) {
  const safePage = Number.isSafeInteger(page) && page >= 0 ? page : 0;
  const skip = safePage * GLOBAL_INBOX_PAGE_SIZE;
  const take = GLOBAL_INBOX_PAGE_SIZE + 1;
  const today = dateOnlyFromString(localDateString());
  const [areas, destinationProjects, pendingCaptures, reviewProposals, reviews, tasks, projects, routines, ideas, references, notes, entityDocs, documents, totalCount] = await Promise.all([
    client.area.findMany({
      where: { isSystem: false },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    client.project.findMany({
      where: { status: { in: ["active", "parked", "someday"] } },
      select: { id: true, name: true, areaId: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    client.capture.findMany({
      where: {
        status: "active",
        OR: [{ parseStatus: "ambiguous" }, { parseStatus: "failed" }],
        reviewProposals: { none: { status: { in: ["pending", "snoozed"] } } },
      },
      include: { textEdits: { orderBy: { createdAt: "desc" }, take: 1, select: { text: true } } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    client.captureReviewProposal.findMany({
      where: { OR: [{ status: "pending" }, { status: "snoozed", snoozedUntil: { lte: new Date() } }] },
      include: {
        capture: { select: { id: true, rawText: true, textEdits: { orderBy: { createdAt: "desc" }, take: 1, select: { text: true } } } },
        suggestedArea: true,
        suggestedProject: true,
      },
      orderBy: { createdAt: "asc" },
      skip,
      take,
    }),
    client.scheduledReview.findMany({
      where: { OR: [{ status: "surfaced" }, { status: "pending", reviewAt: { lte: today } }, { status: "pending", reviewAt: null }] },
      include: { capture: { select: { id: true, rawText: true, textEdits: { orderBy: { createdAt: "desc" }, take: 1, select: { text: true } } } } },
      orderBy: [{ reviewAt: "asc" }, { createdAt: "asc" }],
      skip,
      take,
    }),
    client.task.findMany({ where: { status: "open", areaId: null, projectId: null }, orderBy: { updatedAt: "desc" }, skip, take }),
    client.project.findMany({
      where: { areaId: null, status: { in: ["active", "someday", "parked"] } },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    client.routine.findMany({
      where: { areaId: null, status: "active" },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    client.idea.findMany({ where: { status: { in: ["seed", "developing"] }, areaId: null, projectId: null }, orderBy: { updatedAt: "desc" }, skip, take }),
    client.reference.findMany({ where: { kind: "reference", areaId: null, projectId: null }, orderBy: { createdAt: "desc" }, skip, take }),
    client.entityNote.findMany({ where: { parentType: null, parentId: null }, orderBy: { createdAt: "desc" }, skip, take }),
    client.entityDoc.findMany({ where: { parentType: null, parentId: null, status: "active" }, orderBy: { updatedAt: "desc" }, skip, take }),
    client.document.findMany({ where: { parentType: null, parentId: null }, orderBy: { createdAt: "desc" }, skip, take }),
    countGlobalInbox(today, client),
  ]);

  const pagedCollections = [pendingCaptures, reviewProposals, reviews, tasks, projects, routines, ideas, references, notes, entityDocs, documents];
  const hasNextPage = pagedCollections.some((collection) => collection.length > GLOBAL_INBOX_PAGE_SIZE);
  const pageSlice = <Value,>(collection: Value[]) => collection.slice(0, GLOBAL_INBOX_PAGE_SIZE);

  return {
    areas,
    destinationProjects,
    pendingCaptures: pageSlice(pendingCaptures),
    reviewProposals: pageSlice(reviewProposals),
    reviews: pageSlice(reviews),
    tasks: pageSlice(tasks),
    projects: pageSlice(projects),
    routines: pageSlice(routines),
    ideas: pageSlice(ideas),
    references: pageSlice(references),
    notes: pageSlice(notes),
    entityDocs: pageSlice(entityDocs),
    documents: pageSlice(documents),
    totalCount,
    page: safePage,
    hasNextPage,
    hasPreviousPage: safePage > 0,
  };
}

export async function countGlobalInbox(
  today: Date,
  client: typeof prisma = prisma,
) {
  const counts = await Promise.all([
    client.capture.count({
      where: {
        status: "active",
        OR: [{ parseStatus: "ambiguous" }, { parseStatus: "failed" }],
        reviewProposals: { none: { status: { in: ["pending", "snoozed"] } } },
      },
    }),
    client.captureReviewProposal.count({
      where: { OR: [{ status: "pending" }, { status: "snoozed", snoozedUntil: { lte: new Date() } }] },
    }),
    client.scheduledReview.count({
      where: { OR: [{ status: "surfaced" }, { status: "pending", reviewAt: { lte: today } }, { status: "pending", reviewAt: null }] },
    }),
    client.task.count({ where: { status: "open", areaId: null, projectId: null } }),
    client.project.count({ where: { areaId: null, status: { in: ["active", "someday", "parked"] } } }),
    client.routine.count({ where: { areaId: null, status: "active" } }),
    client.idea.count({ where: { status: { in: ["seed", "developing"] }, areaId: null, projectId: null } }),
    client.reference.count({ where: { kind: "reference", areaId: null, projectId: null } }),
    client.entityNote.count({ where: { parentType: null, parentId: null } }),
    client.entityDoc.count({ where: { parentType: null, parentId: null, status: "active" } }),
    client.document.count({ where: { parentType: null, parentId: null } }),
  ]);
  return counts.reduce((total, count) => total + count, 0);
}
