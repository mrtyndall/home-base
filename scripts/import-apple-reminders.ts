import { Prisma } from "@prisma/client";
import { parse } from "csv-parse/sync";
import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import path from "node:path";

config({ path: ".env.local" });
config();

let prisma: Awaited<typeof import("../src/lib/db")>["prisma"] | undefined;

type ReminderRow = Record<string, string | undefined>;

type NormalizedReminder = {
  title: string;
  notes?: string;
  dueDate?: Date;
  dueTime?: string;
  priority?: string;
  completed: boolean;
  areaName?: string;
  projectName?: string;
  raw: ReminderRow;
};

async function main() {
  ({ prisma } = await import("../src/lib/db"));

  const inputPath = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");
  if (!inputPath) {
    throw new Error("Usage: npm run import:reminders -- /path/to/reminders.csv [--dry-run]");
  }

  const csv = await readFile(inputPath, "utf8");
  const rows = parse(csv, {
    columns: (headers: string[]) => headers.map(normalizeHeader),
    skip_empty_lines: true,
    trim: true,
  }) as ReminderRow[];

  const reminders = rows.map(normalizeReminder).filter(Boolean) as NormalizedReminder[];

  if (dryRun) {
    console.log(
      JSON.stringify({
        status: "dry-run",
        file: inputPath,
        rows: rows.length,
        importable: reminders.length,
        firstTitles: reminders.slice(0, 5).map((row) => row.title),
      }),
    );
    return;
  }

  const imported = [];
  for (const reminder of reminders) {
    imported.push(await importReminder(reminder, inputPath));
  }

  await getPrisma().notification.create({
    data: {
      type: "apple_reminders_imported",
      title: "Apple Reminders imported",
      body: `${imported.length} reminders imported from ${path.basename(inputPath)}.`,
      sourceRef: {
        type: "import",
        importer: "apple_reminders_csv",
        count: imported.length,
      },
    },
  });

  console.log(
    JSON.stringify({
      status: "ok",
      imported: imported.length,
      skipped: rows.length - imported.length,
    }),
  );
}

async function importReminder(reminder: NormalizedReminder, inputPath: string) {
  const projectId = reminder.projectName
    ? await resolveProjectId(reminder.projectName)
    : undefined;
  const areaId = projectId
    ? await resolveProjectAreaId(projectId)
    : await resolveAreaId(reminder.areaName);

  return getPrisma().$transaction(async (tx) => {
    const capture = await tx.capture.create({
      data: {
        rawText: buildRawText(reminder),
        source: "api",
        deviceContext: {
          importer: "apple_reminders_csv",
          sourceFile: path.basename(inputPath),
          original: reminder.raw,
        } as Prisma.InputJsonValue,
        parseStatus: "parsed",
      },
    });

    const task = await tx.task.create({
      data: {
        title: reminder.title,
        notes: reminder.notes,
        status: reminder.completed ? "completed" : "open",
        completedAt: reminder.completed ? new Date() : undefined,
        dueDate: reminder.dueDate,
        dueTime: reminder.dueTime,
        priority: reminder.priority,
        areaId,
        projectId,
        source: "apple_reminders_import",
        captureId: capture.id,
      },
    });

    await tx.capture.update({
      where: { id: capture.id },
      data: {
        parsedActions: [
          {
            type: "create_task",
            title: reminder.title,
            due_date: reminder.dueDate?.toISOString().slice(0, 10),
            due_time: reminder.dueTime,
          },
        ] as Prisma.InputJsonValue,
        createdItems: [
          {
            type: "task",
            id: task.id,
            label: `Imported reminder: ${task.title}`,
          },
        ] as Prisma.InputJsonValue,
      },
    });

    return task.id;
  });
}

function normalizeHeader(header: string) {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeReminder(row: ReminderRow): NormalizedReminder | null {
  const title = readField(row, "title", "name", "reminder", "task")?.trim();
  if (!title) return null;

  const due = parseDueDate(readField(row, "due_date", "due", "due_on", "remind_me"));
  const dueTime = normalizeTime(
    readField(row, "due_time", "time") ?? due.inferredTime,
  );

  return {
    title,
    notes: readField(row, "notes", "note", "body")?.trim() || undefined,
    dueDate: due.date,
    dueTime,
    priority: readField(row, "priority")?.trim() || undefined,
    completed: parseBoolean(readField(row, "completed", "is_completed", "done")),
    areaName: readField(row, "area", "domain", "list", "list_name")?.trim() || undefined,
    projectName: readField(row, "project", "project_name")?.trim() || undefined,
    raw: row,
  };
}

function readField(row: ReminderRow, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value && value.trim().length > 0) return value;
  }

  return undefined;
}

function parseDueDate(value?: string) {
  if (!value) return { date: undefined, inferredTime: undefined };

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { date: undefined, inferredTime: undefined };
  }

  const date = new Date(`${parsed.toISOString().slice(0, 10)}T00:00:00.000Z`);
  const hasTime = !/^\d{4}-\d{2}-\d{2}$/.test(value.trim());
  const inferredTime = hasTime
    ? `${String(parsed.getHours()).padStart(2, "0")}:${String(
        parsed.getMinutes(),
      ).padStart(2, "0")}`
    : undefined;

  return { date, inferredTime };
}

function normalizeTime(value?: string) {
  if (!value) return undefined;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return undefined;
  const hours = Math.min(Math.max(Number(match[1]), 0), 23);
  const minutes = Math.min(Math.max(Number(match[2]), 0), 59);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function parseBoolean(value?: string) {
  if (!value) return false;
  return ["1", "true", "yes", "y", "done", "completed"].includes(
    value.trim().toLowerCase(),
  );
}

function getPrisma() {
  if (!prisma) {
    throw new Error("Database client was not initialized.");
  }

  return prisma;
}

async function resolveAreaId(name?: string) {
  if (name) {
    const area = await getPrisma().area.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (area) return area.id;
  }

  return null;
}

async function resolveProjectAreaId(projectId: string) {
  const project = await getPrisma().project.findUnique({
    where: { id: projectId },
    select: { areaId: true },
  });

  return project?.areaId ?? null;
}

async function resolveProjectId(name: string) {
  const project = await getPrisma().project.findFirst({
    where: {
      name: { contains: name, mode: "insensitive" },
      status: { in: ["active", "parked", "someday"] },
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });

  return project?.id;
}

function buildRawText(reminder: NormalizedReminder) {
  return [
    `Imported Apple Reminder: ${reminder.title}`,
    reminder.notes ? `Notes: ${reminder.notes}` : null,
    reminder.dueDate
      ? `Due: ${reminder.dueDate.toISOString().slice(0, 10)}${
          reminder.dueTime ? ` ${reminder.dueTime}` : ""
        }`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  })
  .finally(async () => {
    await prisma?.$disconnect();
  });
