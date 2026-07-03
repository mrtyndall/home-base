import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const databaseUrl = process.env.DATABASE_URL ?? "";
const needsSsl =
  databaseUrl.includes("sslmode=require") ||
  databaseUrl.includes("railway.internal") ||
  databaseUrl.includes("supabase.co") ||
  databaseUrl.includes("supabase.com");
const pool = new pg.Pool({
  connectionString: databaseUrl || undefined,
  ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
const appUrl = process.env.HOME_BASE_URL ?? "https://home-base-production-e3b7.up.railway.app";
const manifestPath = path.join(process.cwd(), "docs", "test-corpus-manifest.json");
const now = new Date();

const dayMs = 24 * 60 * 60 * 1000;
const isoDate = (offsetDays) =>
  new Date(now.getTime() + offsetDays * dayMs).toISOString().slice(0, 10);
const dateOnly = (offsetDays) => new Date(`${isoDate(offsetDays)}T00:00:00.000Z`);
const atNoon = (offsetDays) => new Date(`${isoDate(offsetDays)}T12:00:00.000Z`);

const manifest = {
  generatedAt: new Date().toISOString(),
  target: appUrl,
  records: [],
  captureBatch: [],
  misroutes: [],
  notes: [
    "Created by scripts/seed-test-corpus.mjs.",
    "Teardown must use status changes, never deletes.",
  ],
};

function remember(type, id, label) {
  if (!id) return;
  if (!manifest.records.some((record) => record.type === type && record.id === id)) {
    manifest.records.push({ type, id, label });
  }
}

async function ensureDomain(input) {
  const domain = await prisma.domain.upsert({
    where: { name: input.name },
    update: {
      description: input.description,
      sortOrder: input.sortOrder,
      isSystem: input.isSystem ?? false,
      active: input.active ?? true,
    },
    create: {
      name: input.name,
      description: input.description,
      sortOrder: input.sortOrder,
      isSystem: input.isSystem ?? false,
      active: input.active ?? true,
    },
  });
  return domain;
}

async function ensureArea(input, domains) {
  const domain = domains[input.domainName];
  if (!domain) throw new Error(`Missing domain ${input.domainName}`);
  const existing = await prisma.area.findFirst({
    where: { name: input.name, domainId: domain.id },
  });
  const data = {
    name: input.name,
    domainId: domain.id,
    status: input.status ?? "active",
    sortOrder: input.sortOrder,
    isSystem: input.isSystem ?? false,
    currentState: input.currentState ?? null,
    nextStep: input.nextStep ?? null,
  };
  if (existing) {
    return prisma.area.update({ where: { id: existing.id }, data });
  }
  return prisma.area.create({
    data: {
      id: input.id,
      ...data,
      createdAt: input.createdAt ?? now,
    },
  });
}

async function mergeStrayHomelabDomain(hobbiesDomainId) {
  const stray = await prisma.domain.findUnique({ where: { name: "Hobbies/Homelab" } });
  if (!stray) return { merged: false };

  await prisma.area.updateMany({
    where: { domainId: stray.id },
    data: { domainId: hobbiesDomainId },
  });
  await prisma.domain.update({
    where: { id: stray.id },
    data: { active: false, description: "Merged into Hobbies." },
  });
  return { merged: true, domainId: stray.id };
}

async function markExistingResidueInactive() {
  const residueTerms = ["M3", "M4", "M5", "Step", "API Project", "drag test"];
  let tasks = 0;
  let projects = 0;
  let ideas = 0;
  for (const term of residueTerms) {
    const taskResult = await prisma.task.updateMany({
      where: {
        status: "open",
        title: { contains: term, mode: "insensitive" },
      },
      data: { status: "completed", completedAt: now },
    });
    tasks += taskResult.count;

    const projectResult = await prisma.project.updateMany({
      where: {
        status: { in: ["active", "someday", "parked"] },
        name: { contains: term, mode: "insensitive" },
      },
      data: { status: "killed", killedAt: now },
    });
    projects += projectResult.count;

    const ideaResult = await prisma.idea.updateMany({
      where: {
        status: { in: ["seed", "developing"] },
        title: { contains: term, mode: "insensitive" },
      },
      data: { status: "killed" },
    });
    ideas += ideaResult.count;
  }
  const testTaskResult = await prisma.task.updateMany({
    where: {
      status: "open",
      OR: [
        { title: { equals: "Test", mode: "insensitive" } },
        { title: { equals: "Test 2", mode: "insensitive" } },
        { title: { equals: "Test 3", mode: "insensitive" } },
        { title: { equals: "Test2", mode: "insensitive" } },
        { title: { equals: "This is a test", mode: "insensitive" } },
      ],
    },
    data: { status: "completed", completedAt: now },
  });
  tasks += testTaskResult.count;

  const testProjectResult = await prisma.project.updateMany({
    where: {
      status: { in: ["active", "someday", "parked"] },
      name: { equals: "Test", mode: "insensitive" },
    },
    data: { status: "killed", killedAt: now },
  });
  projects += testProjectResult.count;

  return { tasks, projects, ideas };
}

async function cleanLegacyAreas(areas) {
  const homelab = areas.Homelab;
  const magic = areas["Magic & Pokémon"];
  const retiredNames = ["Home", "Health", "Creative", "Hobbies/Homelab", "Magic/Pokemon"];

  const legacyHomelab = await prisma.area.findFirst({
    where: { name: "Hobbies/Homelab", status: "active" },
  });
  if (legacyHomelab && homelab) {
    await prisma.task.updateMany({
      where: { areaId: legacyHomelab.id },
      data: { areaId: homelab.id },
    });
    await prisma.project.updateMany({
      where: { areaId: legacyHomelab.id },
      data: { areaId: homelab.id },
    });
    await prisma.idea.updateMany({
      where: { areaId: legacyHomelab.id },
      data: { areaId: homelab.id },
    });
  }

  const legacyMagic = await prisma.area.findFirst({
    where: { name: "Magic/Pokemon", status: "active" },
  });
  if (legacyMagic && magic) {
    await prisma.task.updateMany({
      where: { areaId: legacyMagic.id },
      data: { areaId: magic.id },
    });
    await prisma.project.updateMany({
      where: { areaId: legacyMagic.id },
      data: { areaId: magic.id },
    });
    await prisma.idea.updateMany({
      where: { areaId: legacyMagic.id },
      data: { areaId: magic.id },
    });
  }

  await prisma.area.updateMany({
    where: {
      status: "active",
      name: { in: retiredNames },
    },
    data: { status: "retired" },
  });
}

async function ensureProject(input, areas) {
  const area = areas[input.areaName];
  if (!area) throw new Error(`Missing area ${input.areaName}`);
  const existing = await prisma.project.findFirst({ where: { name: input.name } });
  const data = {
    areaId: area.id,
    status: input.status,
    targetDate: input.targetDate ? dateOnly(input.targetDate) : null,
    currentState: input.currentState ?? null,
    nextStep: input.nextStep ?? null,
    slipThresholdDays: input.slipThresholdDays ?? 14,
    parkedAt: input.status === "parked" ? atNoon(input.parkedAt ?? -14) : null,
    completedAt: input.status === "completed" ? atNoon(input.completedAt ?? -1) : null,
    killedAt: input.status === "killed" ? atNoon(input.killedAt ?? -1) : null,
    createdAt: atNoon(input.createdAt ?? -90),
  };
  const project = existing
    ? await prisma.project.update({ where: { id: existing.id }, data })
    : await prisma.project.create({ data: { name: input.name, ...data } });
  remember("project", project.id, project.name);
  return project;
}

async function ensureCheckIn(input) {
  const existing = await prisma.checkIn.findFirst({
    where: {
      parentType: input.parentType,
      parentId: input.parentId,
      bodyMd: input.bodyMd,
    },
  });
  const checkIn =
    existing ??
    (await prisma.checkIn.create({
      data: {
        parentType: input.parentType,
        parentId: input.parentId,
        bodyMd: input.bodyMd,
        source: input.source ?? "manual",
        createdAt: atNoon(input.offsetDays),
      },
    }));
  remember("check_in", checkIn.id, input.bodyMd.slice(0, 80));
  return checkIn;
}

async function ensureActivity(projectId, entry, offsetDays, source = "manual") {
  const existing = await prisma.projectActivity.findFirst({
    where: { projectId, entry },
  });
  const activity =
    existing ??
    (await prisma.projectActivity.create({
      data: { projectId, entry, source, createdAt: atNoon(offsetDays) },
    }));
  remember("project_activity", activity.id, entry.slice(0, 80));
  return activity;
}

async function ensureMilestone(projectId, title, status, sortOrder, completedOffset) {
  const existing = await prisma.milestone.findFirst({ where: { projectId, title } });
  const data = {
    status,
    sortOrder,
    completedAt: status === "completed" ? atNoon(completedOffset ?? -1) : null,
  };
  const milestone = existing
    ? await prisma.milestone.update({ where: { id: existing.id }, data })
    : await prisma.milestone.create({ data: { projectId, title, ...data } });
  remember("milestone", milestone.id, title);
  if (status === "completed") {
    await ensureActivity(projectId, `Milestone completed: ${title}.`, completedOffset ?? -1);
  }
  return milestone;
}

async function ensureTask(input, areas, projects) {
  const area = input.areaName ? areas[input.areaName] : projects[input.projectName]?.area;
  const project = input.projectName ? projects[input.projectName] : null;
  const existing = await prisma.task.findFirst({
    where: {
      title: input.title,
      ...(project ? { projectId: project.id } : { areaId: area.id }),
      parentTaskId: input.parentTaskId ?? null,
    },
  });
  const data = {
    areaId: project?.areaId ?? area.id,
    projectId: project?.id ?? null,
    parentTaskId: input.parentTaskId ?? null,
    status: input.status ?? "open",
    dueDate:
      typeof input.dueOffset === "number" ? dateOnly(input.dueOffset) : null,
    dueTime: input.dueTime ?? null,
    priority: input.priority ?? null,
    notes: input.notes ?? null,
    someday: input.someday ?? false,
    starred: input.starred ?? false,
    recurrenceRule: input.recurrenceRule ?? null,
    reminderOffsets: input.reminderOffsets ?? undefined,
    source: input.source ?? "seed-test-corpus",
    createdAt: atNoon(input.createdOffset ?? -20),
    completedAt: input.status === "completed" ? atNoon(input.completedOffset ?? -1) : null,
  };
  const task = existing
    ? await prisma.task.update({ where: { id: existing.id }, data })
    : await prisma.task.create({ data: { title: input.title, ...data } });
  remember("task", task.id, task.title);
  return task;
}

async function ensureCapture(rawText, source = "api", status = "parsed") {
  const existing = await prisma.capture.findFirst({ where: { rawText } });
  const capture =
    existing ??
    (await prisma.capture.create({
      data: {
        rawText,
        source,
        parseStatus: status,
        parsedActions: [],
        createdItems:
          status === "ambiguous"
            ? [{ type: "pending_capture", id: "pending", label: "Saved to Inbox to sort later" }]
            : [],
        createdAt: now,
      },
    }));
  remember("capture", capture.id, rawText.slice(0, 90));
  return capture;
}

async function postCaptureIfNeeded(utterance) {
  const existing = await prisma.capture.findFirst({ where: { rawText: utterance.text } });
  if (existing) {
    manifest.captureBatch.push({
      text: utterance.text,
      status: "already_present",
      captureId: existing.id,
    });
    return existing;
  }

  const response = await fetch(`${appUrl}/api/capture`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ rawText: utterance.text, source: "api" }),
  });
  const body = await response.text();
  const capture = await prisma.capture.findFirst({
    where: { rawText: utterance.text },
    orderBy: { createdAt: "desc" },
  });
  manifest.captureBatch.push({
    text: utterance.text,
    expected: utterance.expected,
    httpStatus: response.status,
    response: body.slice(0, 500),
    captureId: capture?.id ?? null,
  });
  if (!capture) {
    manifest.misroutes.push({
      text: utterance.text,
      expected: utterance.expected,
      actual: "no capture row found",
    });
    return null;
  }
  remember("capture", capture.id, utterance.text.slice(0, 90));
  const created = Array.isArray(capture.createdItems) ? capture.createdItems : [];
  const actualTypes = created.map((item) => item?.type).filter(Boolean);
  if (utterance.expected && !actualTypes.includes(utterance.expected)) {
    manifest.misroutes.push({
      text: utterance.text,
      expected: utterance.expected,
      actual: actualTypes,
      captureId: capture.id,
    });
  }
  return capture;
}

async function ensureIdea(input, areas, projects) {
  const area = input.areaName ? areas[input.areaName] : null;
  const project = input.projectName ? projects[input.projectName] : null;
  const existing = await prisma.idea.findFirst({ where: { title: input.title } });
  const data = {
    body: input.body ?? null,
    areaId: project?.areaId ?? area?.id ?? null,
    projectId: project?.id ?? null,
    tags: input.tags ?? [],
    status: input.status ?? "seed",
    convertedToType: input.convertedToType ?? null,
    convertedToId: input.convertedToId ?? null,
    source: "seed-test-corpus",
    resurfaceWeight: input.resurfaceWeight ?? 1,
    createdAt: atNoon(input.createdOffset ?? -70),
    updatedAt: atNoon(input.updatedOffset ?? input.createdOffset ?? -70),
  };
  const idea = existing
    ? await prisma.idea.update({ where: { id: existing.id }, data })
    : await prisma.idea.create({ data: { title: input.title, ...data } });
  remember("idea", idea.id, idea.title);
  return idea;
}

async function ensureIdeaNote(ideaId, body, offsetDays) {
  const existing = await prisma.ideaNote.findFirst({ where: { ideaId, body } });
  const note =
    existing ??
    (await prisma.ideaNote.create({
      data: { ideaId, body, source: "seed-test-corpus", createdAt: atNoon(offsetDays) },
    }));
  remember("idea_note", note.id, body.slice(0, 80));
  return note;
}

async function ensureJournal(bodyMd, offsetDays, source = "typed", tags = []) {
  const existing = await prisma.journalEntry.findFirst({ where: { bodyMd } });
  const entry =
    existing ??
    (await prisma.journalEntry.create({
      data: {
        entryDate: dateOnly(offsetDays),
        bodyMd,
        source,
        tags,
        createdAt: atNoon(offsetDays),
      },
    }));
  remember("journal_entry", entry.id, bodyMd.slice(0, 90));
  return entry;
}

async function ensureRoutine(input, areas) {
  const area = input.areaName ? areas[input.areaName] : null;
  const existing = await prisma.routine.findFirst({ where: { name: input.name } });
  const data = {
    description: input.description,
    areaId: area?.id ?? null,
    schedule: input.schedule,
    goal: input.goal ?? null,
    graceWindow: input.graceWindow ?? null,
    temporary: input.temporary ?? false,
    startDate: input.startOffset ? dateOnly(input.startOffset) : null,
    endDate: input.endOffset ? dateOnly(input.endOffset) : null,
    status: input.status ?? "active",
    createdAt: atNoon(input.createdOffset ?? -40),
  };
  const routine = existing
    ? await prisma.routine.update({ where: { id: existing.id }, data })
    : await prisma.routine.create({ data: { name: input.name, ...data } });
  remember("routine", routine.id, routine.name);
  for (const offset of input.completionOffsets ?? []) {
    const start = dateOnly(offset);
    const end = new Date(start.getTime() + dayMs);
    const existingCompletion = await prisma.routineCompletion.findFirst({
      where: { routineId: routine.id, completedAt: { gte: start, lt: end } },
    });
    const completion =
      existingCompletion ??
      (await prisma.routineCompletion.create({
        data: { routineId: routine.id, completedAt: atNoon(offset) },
      }));
    remember("routine_completion", completion.id, `${routine.name} ${isoDate(offset)}`);
  }
  return routine;
}

async function retireExtraRoutines() {
  await prisma.routine.updateMany({
    where: {
      status: "active",
      name: { in: ["Backup Proxmox configs", "Water plants", "Card Inventory Hour"] },
    },
    data: { status: "retired" },
  });
}

async function retireExtraPeople() {
  await prisma.person.updateMany({
    where: {
      status: "active",
      name: { in: ["Dana Reyes"] },
    },
    data: { status: "retired" },
  });
}

async function ensurePerson(input, areas) {
  const area = input.areaName ? areas[input.areaName] : null;
  const existing = await prisma.person.findFirst({ where: { name: input.name } });
  const data = {
    relationshipType: input.relationshipType,
    email: input.email ?? null,
    phone: input.phone ?? null,
    company: input.company ?? null,
    notesMd: input.notesMd ?? null,
    areaId: area?.id ?? null,
    status: "active",
    createdAt: atNoon(input.createdOffset ?? -90),
  };
  const person = existing
    ? await prisma.person.update({ where: { id: existing.id }, data })
    : await prisma.person.create({ data: { name: input.name, ...data } });
  remember("person", person.id, person.name);
  return person;
}

async function ensurePersonFact(personId, input) {
  const existing = await prisma.personFact.findFirst({
    where: { personId, factValue: input.factValue },
  });
  const fact =
    existing ??
    (await prisma.personFact.create({
      data: {
        personId,
        factType: input.factType ?? "note",
        factValue: input.factValue,
        dateRelevant: typeof input.dateOffset === "number" ? dateOnly(input.dateOffset) : null,
        recurring: input.recurring ?? false,
        createdAt: atNoon(input.createdOffset ?? -40),
      },
    }));
  remember("person_fact", fact.id, input.factValue.slice(0, 90));
  return fact;
}

async function ensureInteraction(personId, input) {
  const occurredAt = atNoon(input.offsetDays);
  const existing = await prisma.personInteraction.findFirst({
    where: { personId, occurredAt, notesMd: input.notesMd },
  });
  const interaction =
    existing ??
    (await prisma.personInteraction.create({
      data: {
        personId,
        interactionType: input.interactionType ?? "touchpoint",
        notesMd: input.notesMd,
        occurredAt,
        source: input.source ?? "manual",
        calendarEventId: input.calendarEventId ?? null,
        createdAt: occurredAt,
      },
    }));
  remember("person_interaction", interaction.id, input.notesMd?.slice(0, 90) ?? "interaction");
  return interaction;
}

async function ensureReview(input) {
  const capture = await ensureCapture(input.rawText, "api", input.captureStatus ?? "ambiguous");
  const existing = await prisma.scheduledReview.findFirst({
    where: { captureId: capture.id, conditionText: input.conditionText ?? null },
  });
  const review =
    existing ??
    (await prisma.scheduledReview.create({
      data: {
        captureId: capture.id,
        reviewAt: typeof input.reviewOffset === "number" ? dateOnly(input.reviewOffset) : null,
        conditionText: input.conditionText ?? null,
        status: input.status,
        createdAt: atNoon(input.createdOffset ?? -20),
      },
    }));
  remember("scheduled_review", review.id, input.rawText.slice(0, 90));
  return review;
}

async function ensureEntityNote(input, areas, projects) {
  const parentType = input.parentType;
  const parentId =
    parentType === "project" ? projects[input.parentName].id : areas[input.parentName].id;
  const existing = await prisma.entityNote.findFirst({
    where: { parentType, parentId, bodyMd: input.bodyMd },
  });
  const note =
    existing ??
    (await prisma.entityNote.create({
      data: {
        parentType,
        parentId,
        bodyMd: input.bodyMd,
        source: "seed-test-corpus",
        createdAt: atNoon(input.offsetDays),
      },
    }));
  remember("entity_note", note.id, input.bodyMd.slice(0, 90));
  return note;
}

async function ensureEntityDoc(input, areas, projects) {
  const parentType = input.parentType;
  const parentId =
    parentType === "project" ? projects[input.parentName].id : areas[input.parentName].id;
  const existing = await prisma.entityDoc.findFirst({
    where: { parentType, parentId, title: input.title },
  });
  const doc =
    existing ??
    (await prisma.entityDoc.create({
      data: {
        parentType,
        parentId,
        title: input.title,
        bodyMd: input.bodyMd,
        source: "seed-test-corpus",
        createdAt: atNoon(input.offsetDays),
        updatedAt: atNoon(input.offsetDays),
      },
    }));
  remember("entity_doc", doc.id, input.title);
  return doc;
}

async function ensureResurfacingSeen(input) {
  const surfacedOn = dateOnly(input.offsetDays);
  const existing = await prisma.resurfacingSeen.findFirst({
    where: { itemType: input.itemType, itemId: input.itemId, surfacedOn },
  });
  const seen =
    existing ??
    (await prisma.resurfacingSeen.create({
      data: {
        itemType: input.itemType,
        itemId: input.itemId,
        surfacedOn,
        response: input.response,
        createdAt: atNoon(input.offsetDays),
      },
    }));
  remember("resurfacing_seen", seen.id, `${input.itemType}:${input.itemId}`);
  return seen;
}

const captureUtterances = [
  { expected: "task", text: "buy coax connectors before the next antenna test" },
  { expected: "idea", text: "idea: make a little field card for APRS paths I actually use" },
  { expected: "reference", text: "the W4 club net is Tuesdays at 8pm on the local repeater" },
  { expected: "pending_capture", text: "hmm something about antennas maybe" },
  { expected: "entity_note", text: "log on the AM5 Proxmox build: BIOS is updated and the next thing is testing the mirrored boot drives" },
  { expected: "task", text: "schedule smoke detector battery check for next month" },
  { expected: "journal_entry", text: "journal: long shoot day but the crew saved it when the location got loud" },
  { expected: "person", text: "add Dana Reyes to people, she runs the print shop, dana@example.com" },
  { expected: "person_fact", text: "note for Lauren: she wants to try the new ramen place in NoDa this fall" },
  { expected: "task", text: "call Duke Energy about the EV rate plan next Tuesday" },
  { expected: "idea", text: "what if the blog had a tiny AI guest book that answers from old posts" },
  { expected: "reference", text: "Frigate docs recommend checking Coral USB power before blaming detection settings" },
  { expected: "task", text: "prep The Misc pilot outline this Friday morning" },
  { expected: "entity_note", text: "log on Frigate camera migration: garage camera is stable but porch still drops overnight" },
  { expected: "routine", text: "start a weekly card inventory hour routine on Sundays, temporary until two weeks from now" },
  { expected: "routine_completion", text: "did my morning stretch" },
  { expected: "task", text: "backup Proxmox configs every Friday" },
  { expected: "idea", text: "idea: make a Charlotte documentary summit checklist for venues and parking" },
  { expected: "reference", text: "the sports client liked the lower-third timing from the second edit" },
  { expected: "task", text: "renew the truck registration next week" },
  { expected: "entity_note", text: "add to Ham Radio: the roll-up J-pole works better from the upstairs window" },
  { expected: "task", text: "water plants every Sunday" },
  { expected: "task", text: "check Home Assistant backups tomorrow" },
  { expected: "idea", text: "idea: build a small magic binder index by color and set" },
  { expected: "reference", text: "Lauren said Paulie is getting picky about the chicken food again" },
  { expected: "scheduled_review", text: "revisit the EV charging estimate once the next Duke bill lands" },
  { expected: "task", text: "clean camera bags before the museum shoot" },
  { expected: "journal_entry", text: "journal: got the igate receiving packets on the first try and it felt like a tiny miracle" },
  { expected: "person_fact", text: "note for Chris: ask about his portable lighting kit next time we talk" },
  { expected: "task", text: "order replacement CR2032 batteries for the sensors" },
  { expected: "entity_doc", text: "doc on AM5 Proxmox build titled Part list: motherboard, ECC RAM, mirrored NVMe boot, 10 gig card" },
  { expected: "idea", text: "idea: a photo essay about old Charlotte signage before it disappears" },
  { expected: "task", text: "book vet checkup for Louise next month" },
  { expected: "reference", text: "BaoFeng battery eliminator part number needs double checking before ordering" },
  { expected: "task", text: "finish the bank campaign archive handoff on Monday" },
  { expected: "entity_note", text: "log on The Misc pilot: cold open is stronger if it starts with the weird garage audio" },
  { expected: "task", text: "check tire pressure on the EV this weekend" },
  { expected: "idea", text: "idea: a tiny field guide to my home network for future me" },
  { expected: "reference", text: "neighbor mentioned the HOA bulk pickup is the second Saturday" },
  { expected: "pending_capture", text: "maybe that camera thing with the driveway but not sure yet" },
];

async function main() {
  const domains = {};
  for (const domain of [
    { name: "System", description: "Hidden system grouping for the Inbox area.", sortOrder: 0, isSystem: true, active: false },
    { name: "Home", description: "House, vehicles, network, and home logistics.", sortOrder: 10 },
    { name: "Family", description: "Family commitments, plans, and follow-ups.", sortOrder: 20 },
    { name: "Health", description: "Health, appointments, fitness, and care tasks.", sortOrder: 30 },
    { name: "Creative", description: "Personal writing, media, and creative threads.", sortOrder: 40 },
    { name: "Hobbies", description: "Radio, homelab, cards, reading, and side builds.", sortOrder: 50 },
  ]) {
    domains[domain.name] = await ensureDomain(domain);
  }
  const mergeResult = await mergeStrayHomelabDomain(domains.Hobbies.id);
  const residue = await markExistingResidueInactive();

  const areas = {};
  for (const area of [
    { id: "area_inbox", name: "Inbox", domainName: "System", sortOrder: 0, isSystem: true, currentState: "System catch-all for quick-add and genuinely ambiguous captures.", nextStep: "Route items when the right area becomes clear." },
    { name: "House & Yard", domainName: "Home", sortOrder: 10 },
    { name: "Vehicles & EV", domainName: "Home", sortOrder: 20 },
    { name: "Home Network", domainName: "Home", sortOrder: 30 },
    { name: "Fitness", domainName: "Health", sortOrder: 10 },
    { name: "The Misc", domainName: "Creative", sortOrder: 10 },
    { name: "Blog", domainName: "Creative", sortOrder: 20 },
    { name: "Documentary Projects", domainName: "Creative", sortOrder: 30 },
    { name: "Ham Radio", domainName: "Hobbies", sortOrder: 10 },
    { name: "Homelab", domainName: "Hobbies", sortOrder: 20 },
    { name: "Magic & Pokémon", domainName: "Hobbies", sortOrder: 30 },
    { name: "Reading", domainName: "Hobbies", sortOrder: 40 },
  ]) {
    areas[area.name] = await ensureArea(area, domains);
  }
  await cleanLegacyAreas(areas);

  for (const utterance of captureUtterances) {
    await postCaptureIfNeeded(utterance);
  }

  const projects = {};
  const projectInputs = [
    { name: "Frigate camera migration", areaName: "Home Network", status: "active", targetDate: 28, createdAt: -74, currentState: "Garage camera is reliable; porch needs one more overnight test.", nextStep: "Swap the porch injector and watch the Frigate logs overnight." },
    { name: "AM5 Proxmox build", areaName: "Homelab", status: "active", targetDate: 34, createdAt: -58, currentState: "Core parts are installed and BIOS is current.", nextStep: "Test mirrored boot drives before moving VMs.", slipThresholdDays: 12 },
    { name: "EV charging + Duke rate optimization", areaName: "Vehicles & EV", status: "active", targetDate: 18, createdAt: -92, currentState: "Need one more Duke bill before changing the charging schedule.", nextStep: "Compare the latest bill against overnight charging sessions.", slipThresholdDays: 14 },
    { name: "Home Base", areaName: "Homelab", status: "active", targetDate: 21, createdAt: -36, currentState: "M5 is deployed and the data surfaces need real mileage.", nextStep: "Add single-user auth to production." },
    { name: "The Misc pilot episode", areaName: "The Misc", status: "active", targetDate: 42, createdAt: -66, currentState: "Cold open is working; guest spine still needs tightening.", nextStep: "Cut the first ten minutes against the outline." },
    { name: "Ham radio desk build", areaName: "Ham Radio", status: "someday", createdAt: -104 },
    { name: "APRS igate", areaName: "Ham Radio", status: "someday", createdAt: -88 },
    { name: "Documentary summit in Charlotte", areaName: "Documentary Projects", status: "someday", createdAt: -75 },
    { name: "AI guest book for the blog", areaName: "Blog", status: "someday", createdAt: -70 },
    { name: "Zigbee sensor expansion", areaName: "Homelab", status: "parked", createdAt: -112, parkedAt: -16, currentState: "Useful, but paused until the Frigate camera work is stable." },
    { name: "Cesium globe visualization", areaName: "Blog", status: "parked", createdAt: -118, parkedAt: -23, currentState: "Prototype proved the idea; not worth the focus right now." },
    { name: "CHIRP fleet programming", areaName: "Ham Radio", status: "completed", createdAt: -96, completedAt: -68 },
    { name: "Garage network drop", areaName: "Home Network", status: "completed", createdAt: -72, completedAt: -42 },
    { name: "NAS-based camera NVR experiment", areaName: "Home Network", status: "killed", createdAt: -86, killedAt: -44, currentState: "Killed in favor of Frigate on the dedicated box." },
  ];
  for (const input of projectInputs) {
    projects[input.name] = await ensureProject(input, areas);
    projects[input.name].area = areas[input.areaName];
  }

  const checkInStories = {
    "Frigate camera migration": [
      [-70, "Pulled the existing camera list and found two streams still using old credentials."],
      [-54, "Garage camera is moved into Frigate and detection zones are close enough to test."],
      [-43, "Storage math looks fine if I keep the high-motion cameras on shorter retention."],
      [-29, "Porch camera is dropping overnight; likely power or injector, not Frigate config."],
      [-7, "Garage recordings are clean. Porch still needs a hardware swap before I trust it."],
    ],
    "AM5 Proxmox build": [
      [-55, "Parts ordered: board, ECC RAM, NVMe pair, and the 10 gig card."],
      [-41, "Case is built and BIOS sees the RAM correctly."],
      [-34, "NIC seating was the only weird part; everything else posted cleanly."],
      [-22, "Proxmox installer boots cleanly; mirror setup needs one more pass."],
      [-5, "BIOS is updated and the next thing is testing the mirrored boot drives."],
    ],
    "EV charging + Duke rate optimization": [
      [-82, "Collected the first month of charging sessions from the EV app."],
      [-48, "Duke rate sheet is less clear than expected; need the actual bill to compare."],
      [-24, "Last useful touch: waiting for the next bill before changing the schedule."],
    ],
    "Home Base": [
      [-34, "Moved the app onto Railway and got the capture path reliable enough to use."],
      [-17, "Calendar and reminders are in place; agent access is the next trust layer."],
      [-9, "Settings finally behaves like a control surface instead of a status page."],
      [-4, "The app needs real data now so the derived surfaces stop looking empty."],
    ],
    "The Misc pilot episode": [
      [-60, "Captured the rough premise and three possible cold opens."],
      [-36, "Garage audio makes the cold open feel stranger in the right way."],
      [-26, "The title card wants to be quieter than the footage, which surprised me."],
      [-18, "Guest list is narrowed to two realistic people and one stretch ask."],
      [-3, "First ten minutes need a tighter cut before this feels like a pilot."],
    ],
    "Zigbee sensor expansion": [
      [-100, "Mapped the battery sensors and found the repeaters are uneven upstairs."],
      [-51, "The door sensor worked, but the battery reporting is nonsense."],
      [-40, "Parking this until the camera migration stops moving under it."],
    ],
    "Cesium globe visualization": [
      [-110, "Got a globe prototype rendering route arcs without much trouble."],
      [-69, "Data import was easy; making the view useful was the hard part."],
      [-23, "Parked. It is neat, but it does not beat the blog work in front of it."],
    ],
    "CHIRP fleet programming": [
      [-94, "Exported the first radio image and cleaned up the channel names."],
      [-88, "NOAA, local repeaters, and simplex channels are in a stable order."],
      [-80, "Tested uploads on both BaoFengs without bricking anything."],
      [-76, "Cleaned up the channel names so future me can tell what each memory is for."],
      [-72, "Final pass done. Keeping the image around as the known-good baseline."],
      [-68, "Completed. Radios are consistent and labeled."],
    ],
    "Garage network drop": [
      [-70, "Measured the garage path and confirmed the crawlspace route is less awful."],
      [-62, "Pulled cable and left enough slack for the cabinet."],
      [-54, "Terminated both ends; first test failed because I crossed a pair."],
      [-50, "Moved the AP and the garage camera stopped fighting for signal."],
      [-46, "Reterminated and got gigabit link."],
      [-42, "Completed. Garage AP is online and stable."],
    ],
    "NAS-based camera NVR experiment": [
      [-82, "Tested the NAS as an NVR host and immediately hit storage churn."],
      [-66, "The NAS path kept turning every camera decision into a storage decision."],
      [-58, "Performance is not worth the complexity."],
      [-44, "Killed this path. Frigate gets the dedicated box instead."],
    ],
  };
  for (const [projectName, entries] of Object.entries(checkInStories)) {
    for (const [offsetDays, bodyMd] of entries) {
      await ensureCheckIn({
        parentType: "project",
        parentId: projects[projectName].id,
        bodyMd,
        offsetDays,
        source: Math.abs(offsetDays) % 5 === 0 ? "ai_draft_edited" : "manual",
      });
    }
  }

  for (const [projectName, milestones] of Object.entries({
    "AM5 Proxmox build": [
      ["Parts ordered", "completed", -55],
      ["BIOS updated", "completed", -22],
      ["Mirrored boot test", "completed", -5],
      ["Move VMs", "open"],
      ["Document rollback", "open"],
    ],
    "Frigate camera migration": [
      ["Camera inventory", "completed", -70],
      ["Garage recording stable", "open"],
      ["Porch power fixed", "open"],
      ["Detection zones tuned", "open"],
    ],
    "The Misc pilot episode": [
      ["Premise locked", "completed", -60],
      ["Cold open selected", "completed", -18],
      ["Guest list confirmed", "open"],
      ["Rough cut", "open"],
      ["Music pass", "open"],
      ["Export pilot", "open"],
    ],
    "CHIRP fleet programming": [
      ["Export base image", "completed", -94],
      ["Program radios", "completed", -80],
      ["Field test", "completed", -72],
    ],
    "Garage network drop": [
      ["Pull cable", "completed", -62],
      ["Terminate ends", "completed", -46],
      ["Mount AP", "completed", -42],
    ],
  })) {
    let sortOrder = 0;
    for (const [title, status, completedOffset] of milestones) {
      await ensureMilestone(projects[projectName].id, title, status, sortOrder++, completedOffset);
    }
  }

  const taskInputs = [
    { title: "Add single-user auth to production", projectName: "Home Base", dueOffset: 2, starred: true, createdOffset: -6 },
    { title: "Swap porch camera injector", projectName: "Frigate camera migration", dueOffset: 0, starred: true, createdOffset: -7 },
    { title: "Compare Duke bill against charging sessions", projectName: "EV charging + Duke rate optimization", dueOffset: -3, createdOffset: -38 },
    { title: "Cut first ten minutes of The Misc pilot", projectName: "The Misc pilot episode", dueOffset: 0, createdOffset: -10 },
    { title: "Test mirrored boot drives", projectName: "AM5 Proxmox build", dueOffset: 0, createdOffset: -25 },
    { title: "Email producer contact about pilot guest timing", projectName: "The Misc pilot episode", dueOffset: 1, createdOffset: -4 },
    { title: "Review Frigate overnight logs", projectName: "Frigate camera migration", dueOffset: 1, createdOffset: -2 },
    { title: "Order EVSE weather cover", areaName: "Vehicles & EV", dueOffset: 4, createdOffset: -11 },
    { title: "Clean camera bags before the museum shoot", areaName: "The Misc", dueOffset: 5, createdOffset: -6 },
    { title: "Book vet checkup for Louise", areaName: "House & Yard", dueOffset: 7, createdOffset: -5 },
    { title: "Check Home Assistant backups", areaName: "Homelab", dueOffset: 8, recurrenceRule: "FREQ=WEEKLY;BYDAY=FR", createdOffset: -45 },
    { title: "Water plants", areaName: "House & Yard", dueOffset: 3, recurrenceRule: "FREQ=WEEKLY;BYDAY=SU", createdOffset: -60 },
    { title: "Check smoke detector batteries", areaName: "House & Yard", dueOffset: 30, recurrenceRule: "FREQ=MONTHLY", createdOffset: -80 },
    { title: "Renew truck registration", areaName: "Vehicles & EV", dueOffset: -2, createdOffset: -12 },
    { title: "Sort Magic trade binder", areaName: "Magic & Pokémon", dueOffset: 9, createdOffset: -18 },
    { title: "Confirm antenna mount hardware", areaName: "Ham Radio", dueOffset: 10, starred: true, createdOffset: -20 },
    { title: "Backup Proxmox configs", areaName: "Homelab", dueOffset: 11, recurrenceRule: "FREQ=WEEKLY;BYDAY=FR", createdOffset: -45 },
    { title: "Clean up Home Base settings copy", projectName: "Home Base", dueOffset: 12, createdOffset: -9 },
    { title: "Compare porch camera placement", projectName: "Frigate camera migration", dueOffset: 13, createdOffset: -15 },
    { title: "Pull charger kWh numbers from the EV app", areaName: "Vehicles & EV", dueOffset: 14, createdOffset: -24 },
    { title: "Replace CR2032 batteries in Zigbee sensors", areaName: "Home Network", createdOffset: -8 },
    { title: "Inventory spare coax adapters", areaName: "Ham Radio", createdOffset: -31 },
    { title: "Sketch AI guest book answer boundaries", projectName: "AI guest book for the blog", someday: true, createdOffset: -50 },
    { title: "Draft Charlotte summit venue map", projectName: "Documentary summit in Charlotte", someday: true, createdOffset: -48 },
    { title: "Build fold-down radio shelf", projectName: "Ham radio desk build", someday: true, createdOffset: -72 },
    { title: "Try APRS igate on the upstairs window", projectName: "APRS igate", someday: true, createdOffset: -74 },
    { title: "Read the next chapter of the camera manual", areaName: "Reading", someday: true, createdOffset: -65 },
    { title: "Scan old Charlotte signage ideas", areaName: "Blog", someday: true, createdOffset: -69 },
    { title: "Unpack the drawer of unlabeled SD cards", areaName: "Inbox", createdOffset: -3 },
    { title: "Figure out the thing from the driveway camera note", areaName: "Inbox", createdOffset: -2 },
    { title: "Put the mystery USB-C cable somewhere sane", areaName: "Inbox", createdOffset: -1 },
    { title: "Call Duke about EV rate plan", areaName: "Vehicles & EV", createdOffset: -36 },
    { title: "Choose final guest for The Misc pilot", projectName: "The Misc pilot episode", createdOffset: -28 },
    { title: "Rebuild Frigate storage retention rules", projectName: "Frigate camera migration", createdOffset: -32 },
    { title: "Write AM5 rollback notes", projectName: "AM5 Proxmox build", createdOffset: -27 },
  ];

  for (let i = 0; i < 40; i += 1) {
    const projectNames = ["CHIRP fleet programming", "Garage network drop", "The Misc pilot episode", "Frigate camera migration", "AM5 Proxmox build"];
    taskInputs.push({
      title: [
        "Label programmed radios",
        "Terminate garage keystone",
        "Export pilot scratch audio",
        "Copy Frigate config snapshot",
        "Update Proxmox BIOS notes",
        "Archive museum shoot cards",
        "Check EV tire pressure",
        "Clean BaoFeng charging shelf",
      ][i % 8] + ` ${i + 1}`,
      projectName: projectNames[i % projectNames.length],
      status: "completed",
      dueOffset: -118 + i * 2,
      createdOffset: -120 + i * 2,
      completedOffset: -117 + i * 2,
    });
  }

  const parents = [
    { title: "Prep The Misc pilot", projectName: "The Misc pilot episode", dueOffset: 6, createdOffset: -8, subtasks: ["Outline the cold open", "Confirm guest list", "Check audio kit"] },
    { title: "Stage AM5 migration", projectName: "AM5 Proxmox build", dueOffset: 16, createdOffset: -12, subtasks: ["Export VM list", "Check UPS runtime", "Write rollback note"] },
    { title: "Tune Frigate zones", projectName: "Frigate camera migration", dueOffset: 17, createdOffset: -10, subtasks: ["Garage mask", "Porch mask"] },
    { title: "Plan ham desk measurements", projectName: "Ham radio desk build", someday: true, createdOffset: -44, subtasks: ["Measure wall", "Check cable path"] },
    { title: "Clean up card inventory", areaName: "Magic & Pokémon", dueOffset: 19, createdOffset: -14, subtasks: ["Sort rares", "Pull trades"] },
  ];

  for (const input of taskInputs) {
    await ensureTask(input, areas, projects);
  }
  for (const parent of parents) {
    const parentTask = await ensureTask(parent, areas, projects);
    for (const subtask of parent.subtasks) {
      await ensureTask(
        { title: subtask, parentTaskId: parentTask.id, areaName: parent.areaName, projectName: parent.projectName, createdOffset: parent.createdOffset + 1 },
        areas,
        projects,
      );
    }
  }

  const evTaskActivityDate = dateOnly(-36);
  await prisma.$executeRaw`
    UPDATE tasks
    SET
      created_at = LEAST(created_at, ${evTaskActivityDate}),
      updated_at = LEAST(updated_at, ${evTaskActivityDate})
    WHERE project_id IN (
      SELECT id
      FROM projects
      WHERE name = 'EV charging + Duke rate optimization'
    )
  `;

  const journalBodies = [
    "Long shoot day. The room was louder than it looked on the scout, but the crew kept finding quiet pockets and nobody made it weird.",
    "I got the igate receiving packets on the first try. It felt like a tiny miracle, mostly because I expected three hours of driver nonsense.",
    "Lauren and I talked through the EV charging thing over dinner. The right answer is probably boring: wait for the bill, then change one thing.",
    "The garage network drop made the house feel a little less held together with string.",
    "I keep wanting Home Base to feel calm, but calm only works if the data is real. Empty software lies by omission.",
    "Shot the museum b-roll and remembered again that quiet prep beats fancy gear almost every time.",
    "Paulie yelled at the same cabinet for ten minutes. I checked it and found nothing, which probably means he won.",
    "The AM5 build is starting to look like a computer instead of a pile of expensive rectangles.",
    "The Misc pilot has a shape now. The cold open wants to be stranger than I first let it be.",
    "I had a clean little radio window tonight. Heard the club net while sorting coax and it made the desk mess feel worth it.",
    "The EV is boring in the best way. I only think about it when the billing math gets weird.",
    "Home Assistant behaved for a whole week, which I am noting here so future me has proof.",
    "The sports client revision was smaller than feared. Sometimes the second email is kinder than the first.",
    "I tried to force the blog idea and got nothing. Walked away, fed the cats, and the opener showed up.",
    "The Frigate porch camera still feels flaky. I need to stop tuning software until I rule out power.",
    "Lauren found the better framing for the pilot title while I was overthinking it.",
    "The bank campaign archive is finally off my desk. I underestimate how loud unfinished handoffs are.",
    "Magic cards are a nicer inventory problem than hard drives because at least the pictures are pretty.",
    "The Homelab is fun until it becomes archaeology. I need more notes for the next version of me.",
    "I drove through Charlotte after a long edit and noticed three signs I should photograph before they vanish.",
    "The garage AP has been solid. It is the kind of fix I forget about because it actually worked.",
    "I want the ham desk to be small, not impressive. Just enough radio to invite me back.",
    "The documentary summit idea keeps coming back. Maybe that means it needs a parking place, not a plan.",
    "Louise slept on the camera bag, which is probably her strongest review of the week.",
    "I made a smaller list today and got more done. Annoying but useful.",
    "The igate thought is still alive: simple, reliable, boring hardware where possible.",
    "I spent an hour making Home Base less like a dashboard and more like a tray of things I can move.",
    "Some weeks the best system is just remembering where I stopped.",
  ];
  const journalEntries = [];
  for (let i = 0; i < journalBodies.length; i += 1) {
    journalEntries.push(
      await ensureJournal(
        journalBodies[i],
        -118 + i * 4,
        [1, 9, 15, 21, 25].includes(i) ? "voice" : "typed",
        i % 5 === 0 ? ["work"] : i % 5 === 1 ? ["radio"] : [],
      ),
    );
  }

  const ideaInputs = [
    ["AI guest book for older blog posts", "A small Q&A layer that answers from old posts without pretending to be me.", "seed", "Blog", -98],
    ["Charlotte signage photo essay", "Collect the signs that still make the city feel specific.", "developing", "Blog", -94],
    ["Magic binder index by color", "Fast lookup for trade nights without making collection tracking a job.", "seed", "Magic & Pokémon", -91],
    ["Home network field guide", "A short doc future me can read before touching VLANs.", "developing", "Homelab", -87],
    ["Pocket APRS path card", "Tiny laminated reference for the paths I actually use.", "seed", "Ham Radio", -84],
    ["The Misc pilot", "The garage-audio cold open became the pilot project.", "converted", "The Misc", -82, "The Misc pilot episode"],
    ["AM5 Proxmox build", "The parts list idea became the actual build project.", "converted", "Homelab", -80, "AM5 Proxmox build"],
    ["EV bill explainer post", "Could be useful once I actually understand the Duke math.", "seed", "Vehicles & EV", -76],
    ["Documentary summit badge wall", "Physical guest board with Polaroids and QR links.", "seed", "Documentary Projects", -72],
    ["Ham desk cable raceway", "Hide just enough cable that I use the desk without fussing.", "developing", "Ham Radio", -68],
    ["Cat camera highlight reel", "Louise and Paulie as the only stakeholders.", "seed", "Home Network", -64],
    ["Crew day packing checklist", "Personal checklist for non-work shoots and weird one-offs.", "seed", "The Misc", -58],
    ["Reading shelf by mood", "Sort the next-to-read pile by energy level.", "seed", "Reading", -52],
    ["Frigate zone sketch overlay", "A printable still with zones drawn on top.", "developing", "Home Network", -48],
    ["Tiny Home Base changelog", "Readable changes without turning the app into work.", "seed", "Homelab", -43],
    ["Neighborhood bulk pickup reminder", "Might not be worth building; maybe just a note.", "seed", "House & Yard", -36],
    ["NAS NVR retry", "Killed. Dedicated Frigate box is cleaner.", "killed", "Home Network", -32],
    ["Daily quote collector", "Killed. It felt like fake inspiration.", "killed", "Reading", -28],
  ];
  const ideas = {};
  for (const [title, body, status, areaName, createdOffset, projectName] of ideaInputs) {
    ideas[title] = await ensureIdea(
      {
        title,
        body,
        status,
        areaName,
        projectName,
        convertedToType: status === "converted" ? "project" : null,
        convertedToId: projectName ? projects[projectName].id : null,
        createdOffset,
        updatedOffset: createdOffset + 8,
      },
      areas,
      projects,
    );
  }
  await ensureIdeaNote(ideas["Ham desk cable raceway"].id, "Leave room for power, coax, and the laptop charger without making it a permanent installation.", -34);
  await ensureIdeaNote(ideas["Ham desk cable raceway"].id, "A shallow shelf under the desk may be better than a wall-mounted raceway.", -28);
  await ensureIdeaNote(ideas["Pocket APRS path card"].id, "Include the local repeater, a direct path, and one travel path only.", -30);
  await ensureIdeaNote(ideas["The Misc pilot"].id, "The garage sound is the hook, not a problem to hide.", -18);

  await ensureRoutine({
    name: "Morning stretch",
    description: "Five quiet minutes before the day gets loud.",
    areaName: "Fitness",
    schedule: { frequency: "custom", days: ["mon", "tue", "wed", "thu", "fri"], timeWindow: "morning" },
    graceWindow: { days: 1 },
    completionOffsets: [-34, -33, -32, -31, -28, -27, -24, -23, -22, -18, -17, -16, -15, -14, -10, -9, -8, -4, -3, -2],
  }, areas);
  await ensureRoutine({
    name: "Evening tidy",
    description: "Reset the obvious mess before it becomes archaeology.",
    areaName: "House & Yard",
    schedule: { frequency: "daily", days: [], timeWindow: "evening" },
    completionOffsets: [-35, -33, -31, -29, -26, -25, -21, -20, -18, -15, -13, -11, -7, -5, -2],
  }, areas);
  await ensureRoutine({
    name: "Radio net check-in",
    description: "Listen or check in when the week allows.",
    areaName: "Ham Radio",
    schedule: { frequency: "weekly", days: [], timeWindow: "anytime" },
    goal: { timesPerWeek: 1 },
    completionOffsets: [-32, -25, -18, -4],
  }, areas);
  await ensureRoutine({
    name: "Card inventory hour",
    description: "One hour with the binders before the temporary push ends.",
    areaName: "Magic & Pokémon",
    schedule: { frequency: "weekly", days: [], timeWindow: "anytime" },
    goal: { timesPerWeek: 1 },
    temporary: true,
    endOffset: 14,
    completionOffsets: [-12, -5],
  }, areas);
  await retireExtraRoutines();

  const peopleInputs = [
    { name: "Lauren", relationshipType: "wife", areaName: "House & Yard", facts: ["wants to try the ramen place in NoDa this fall", "annual trip planning usually starts around August"], recurring: "anniversary dinner is worth planning early" },
    { name: "Chris Miller", relationshipType: "colleague", company: "Production friend", email: "chris.test@example.com", areaName: "The Misc", facts: ["has a portable lighting kit worth asking about", "mentioned wanting to see the total eclipse"], recurring: "birthday is a good excuse to send a gear note" },
    { name: "Maya Torres", relationshipType: "producer contact", company: "Independent producer", email: "maya.test@example.com", areaName: "Documentary Projects", facts: ["likes clean call sheets more than long decks", "asked about Charlotte venue parking"], recurring: "checks in around festival season" },
    { name: "Ben from Homelab", relationshipType: "homelab friend", email: "ben.homelab.test@example.com", areaName: "Homelab", facts: ["runs a similar Proxmox setup", "recommended labeling the UPS cables"], recurring: "does a winter lab cleanup" },
    { name: "W4ABC Sam", relationshipType: "ham radio elmer", email: "sam.radio.test@example.com", areaName: "Ham Radio", facts: ["prefers simple antennas that survive storms", "offered to look at the APRS path"], recurring: "club picnic lands in late summer" },
    { name: "Neighbor Pat", relationshipType: "neighbor", areaName: "House & Yard", facts: ["knows the HOA bulk pickup rhythm", "asked about borrowing the ladder"], recurring: "holiday lights come up right after Thanksgiving" },
  ];
  for (let p = 0; p < peopleInputs.length; p += 1) {
    const input = peopleInputs[p];
    const person = await ensurePerson(input, areas);
    await ensurePersonFact(person.id, { factValue: input.facts[0], createdOffset: -70 + p * 3 });
    await ensurePersonFact(person.id, { factValue: input.facts[1], createdOffset: -55 + p * 4, dateOffset: 21 + p });
    await ensurePersonFact(person.id, { factValue: input.recurring, createdOffset: -50 + p, dateOffset: 80 + p, recurring: true });
    for (let i = 0; i < 5; i += 1) {
      await ensureInteraction(person.id, {
        notesMd: [
          "Quick text thread; nothing to do yet.",
          "Talked after a calendar event and captured the useful bit.",
          "Followed up with one concrete question.",
          "Shared a small update and left the next move open.",
          "Calendar-derived touchpoint from a test event.",
        ][i],
        offsetDays: -95 + p * 5 + i * 14,
        source: i === 1 || i === 4 ? "calendar" : "manual",
        calendarEventId: i === 1 || i === 4 ? `test-corpus-${person.id}-${i}` : null,
      });
    }
  }
  await retireExtraPeople();

  for (const review of [
    { rawText: "review the Duke bill when the new cycle lands", reviewOffset: 9, status: "pending", createdOffset: -18 },
    { rawText: "check the museum shoot archive next month", reviewOffset: 20, status: "pending", createdOffset: -10 },
    { rawText: "surface the porch camera note today", reviewOffset: -1, status: "surfaced", createdOffset: -21 },
    { rawText: "ask whether the antenna mount still matters", reviewOffset: 0, status: "surfaced", createdOffset: -16 },
    { rawText: "wait on the trailer sale before planning the garage shelf", conditionText: "once the trailer sells", status: "pending", createdOffset: -14 },
    { rawText: "done review for CHIRP image backup", reviewOffset: -30, status: "done", createdOffset: -40 },
    { rawText: "done review for garage cable labels", reviewOffset: -22, status: "done", createdOffset: -33 },
    { rawText: "dismissed review for NAS NVR retry", reviewOffset: -12, status: "dismissed", createdOffset: -28 },
  ]) {
    await ensureReview(review);
  }

  await ensureEntityNote({ parentType: "project", parentName: "Frigate camera migration", bodyMd: "Camera placement note:\n\n- Garage is stable.\n- Porch needs power checked before software tuning.\n- Driveway idea stays parked until the porch is reliable.", offsetDays: -6 }, areas, projects);
  await ensureEntityNote({ parentType: "project", parentName: "AM5 Proxmox build", bodyMd: "Boot test note: use mirrored NVMe first, then move one non-critical VM before touching Home Assistant.", offsetDays: -5 }, areas, projects);
  await ensureEntityNote({ parentType: "area", parentName: "Ham Radio", bodyMd: "Antenna comparison: the roll-up J-pole wins indoors; the mag mount is easier in the truck.", offsetDays: -31 }, areas, projects);
  await ensureEntityNote({ parentType: "area", parentName: "Vehicles & EV", bodyMd: "Charging note: compare cost by kWh, not just the app's session summary.", offsetDays: -24 }, areas, projects);
  await ensureEntityNote({ parentType: "project", parentName: "The Misc pilot episode", bodyMd: "The cold open should start with the weird garage audio before any explanation.", offsetDays: -3 }, areas, projects);
  await ensureEntityNote({ parentType: "project", parentName: "Ham radio desk build", bodyMd: "Where I left off: rough width is 42 inches, power on left, coax can drop behind the shelf.", offsetDays: -43 }, areas, projects);

  await ensureEntityDoc({ parentType: "project", parentName: "AM5 Proxmox build", title: "AM5 part list", bodyMd: "# AM5 part list\n\n| Part | Note |\n|---|---|\n| Motherboard | ECC support confirmed |\n| RAM | 64GB ECC |\n| Boot | Mirrored NVMe |\n| Network | 10 gig card |\n\nKeep the old box untouched until one VM migrates cleanly.", offsetDays: -20 }, areas, projects);
  await ensureEntityDoc({ parentType: "area", parentName: "Ham Radio", title: "Antenna comparison", bodyMd: "# Antenna comparison\n\n- Roll-up J-pole: best receive from upstairs window.\n- Mag mount: easiest truck test.\n- Rubber duck: fine for listening, not the answer indoors.", offsetDays: -35 }, areas, projects);
  await ensureEntityDoc({ parentType: "project", parentName: "Ham radio desk build", title: "Desk layout notes", bodyMd: "# Desk layout notes\n\n- Radio shelf should stay shallow.\n- Laptop space matters more than a permanent rack.\n- Leave one clean cable path for coax and power.", offsetDays: -60 }, areas, projects);
  await ensureEntityDoc({ parentType: "project", parentName: "Frigate camera migration", title: "Camera placement", bodyMd: "# Camera placement\n\n1. Garage: keep current angle.\n2. Porch: check injector before changing zones.\n3. Driveway: wait until porch is stable.", offsetDays: -8 }, areas, projects);

  await ensureResurfacingSeen({ itemType: "journal_entry", itemId: journalEntries[2].id, offsetDays: -6, response: "dismissed" });
  await ensureResurfacingSeen({ itemType: "idea", itemId: ideas["Pocket APRS path card"].id, offsetDays: -4, response: "kept" });
  await ensureResurfacingSeen({ itemType: "journal_entry", itemId: journalEntries[8].id, offsetDays: -2, response: "annotated" });

  const counts = {
    projects: await prisma.project.groupBy({ by: ["status"], _count: { _all: true } }),
    tasks: await prisma.task.groupBy({ by: ["status"], _count: { _all: true } }),
    journal: await prisma.journalEntry.count(),
    ideas: await prisma.idea.groupBy({ by: ["status"], _count: { _all: true } }),
    checkIns: await prisma.checkIn.count(),
    routines: await prisma.routine.count(),
    routineCompletions: await prisma.routineCompletion.count(),
    people: await prisma.person.count(),
    reviews: await prisma.scheduledReview.groupBy({ by: ["status"], _count: { _all: true } }),
    mergeResult,
    residue,
  };

  manifest.records.sort((a, b) => `${a.type}:${a.label}`.localeCompare(`${b.type}:${b.label}`));
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(JSON.stringify({ status: "seeded-test-corpus", counts, manifestPath, misroutes: manifest.misroutes }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
