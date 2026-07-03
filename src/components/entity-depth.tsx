import {
  addEntityNote,
  addMilestone,
  archiveEntityDoc,
  completeMilestone,
  createEntityDoc,
  importEntityDocMarkdown,
  moveMilestone,
  updateEntityDoc,
} from "@/app/actions";
import { AttachmentUpload } from "@/components/attachment-upload";
import { formatShortDate } from "@/lib/dates";

type EntityNoteItem = {
  id: string;
  bodyMd: string;
  createdAt: Date;
};

type EntityDocItem = {
  id: string;
  title: string;
  bodyMd: string;
  updatedAt: Date;
};

type AttachmentItem = {
  id: string;
  filename: string;
  mime: string;
  size: number;
};

type MilestoneItem = {
  id: string;
  title: string;
  status: "open" | "completed";
};

export function EntityDepth({
  parentType,
  parentId,
  notes,
  docs,
  attachments,
}: {
  parentType: "area" | "project";
  parentId: string;
  notes: EntityNoteItem[];
  docs: EntityDocItem[];
  attachments: AttachmentItem[];
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <NotesPanel parentType={parentType} parentId={parentId} notes={notes} />
      <DocsPanel parentType={parentType} parentId={parentId} docs={docs} />
      <AttachmentsPanel
        parentType={parentType}
        parentId={parentId}
        attachments={attachments}
      />
    </section>
  );
}

function NotesPanel({
  parentType,
  parentId,
  notes,
}: {
  parentType: "area" | "project";
  parentId: string;
  notes: EntityNoteItem[];
}) {
  return (
    <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-stone-800">Notes</h2>
        <details className="relative">
          <summary className="inline-flex h-8 cursor-pointer list-none items-center justify-center rounded-md border border-stone-300 bg-white px-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 [&::-webkit-details-marker]:hidden">
            Add
          </summary>
          <form
            action={addEntityNote}
            className="absolute right-0 z-10 mt-2 w-80 max-w-[calc(100vw-2rem)] space-y-2 rounded-md border border-stone-200 bg-white p-2 shadow-lg"
          >
            <input type="hidden" name="parentType" value={parentType} />
            <input type="hidden" name="parentId" value={parentId} />
            <label className="sr-only" htmlFor={`${parentType}-${parentId}-note`}>
              Note
            </label>
            <textarea
              id={`${parentType}-${parentId}-note`}
              name="bodyMd"
              required
              rows={3}
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
            <button className="inline-flex h-9 items-center justify-center rounded-md bg-teal-700 px-3 text-sm font-medium text-white transition hover:bg-teal-800">
              Save
            </button>
          </form>
        </details>
      </div>
      {notes.length === 0 ? (
        <p className="text-sm text-stone-500">No notes yet.</p>
      ) : (
        <div className="divide-y divide-stone-100">
          {notes.map((note) => (
            <div key={note.id} className="py-3">
              <MarkdownPreview body={note.bodyMd} />
              <p className="mt-2 text-xs text-stone-500">
                {formatShortDate(note.createdAt)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DocsPanel({
  parentType,
  parentId,
  docs,
}: {
  parentType: "area" | "project";
  parentId: string;
  docs: EntityDocItem[];
}) {
  return (
    <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-stone-800">Docs</h2>
      </div>
      <details className="rounded-md border border-stone-200 bg-stone-50 p-3">
        <summary className="cursor-pointer list-none text-sm font-medium text-stone-700 [&::-webkit-details-marker]:hidden">
          Create or import markdown
        </summary>
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <form action={createEntityDoc} className="space-y-3">
            <input type="hidden" name="parentType" value={parentType} />
            <input type="hidden" name="parentId" value={parentId} />
            <label
              className="block text-sm font-medium text-stone-700"
              htmlFor={`${parentType}-${parentId}-doc-title`}
            >
              <span>Title</span>
              <input
                id={`${parentType}-${parentId}-doc-title`}
                name="title"
                required
                className="mt-1 h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
            </label>
            <label
              className="block text-sm font-medium text-stone-700"
              htmlFor={`${parentType}-${parentId}-doc-body`}
            >
              <span>Body</span>
              <textarea
                id={`${parentType}-${parentId}-doc-body`}
                name="bodyMd"
                required
                rows={12}
                className="mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
            </label>
            <button className="inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-medium text-white transition hover:bg-teal-800">
              Create doc
            </button>
          </form>
          <form
            action={importEntityDocMarkdown}
            className="space-y-3 rounded-md border border-stone-200 bg-white p-3"
          >
            <input type="hidden" name="parentType" value={parentType} />
            <input type="hidden" name="parentId" value={parentId} />
            <label
              className="block text-sm font-medium text-stone-700"
              htmlFor={`${parentType}-${parentId}-doc-upload-title`}
            >
              <span>Title override</span>
              <input
                id={`${parentType}-${parentId}-doc-upload-title`}
                name="title"
                className="mt-1 h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              />
            </label>
            <label
              className="block text-sm font-medium text-stone-700"
              htmlFor={`${parentType}-${parentId}-doc-upload`}
            >
              <span>Markdown file</span>
              <input
                id={`${parentType}-${parentId}-doc-upload`}
                type="file"
                name="markdownFile"
                accept=".md,.markdown,.txt,text/markdown,text/plain"
                required
                className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-stone-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-stone-700"
              />
            </label>
            <button className="inline-flex h-10 items-center justify-center rounded-md border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition hover:border-teal-500 hover:text-teal-700">
              Import markdown
            </button>
          </form>
        </div>
      </details>
      {docs.length === 0 ? (
        <p className="text-sm text-stone-500">No docs yet.</p>
      ) : (
        <div className="space-y-3">
          {docs.map((doc) => (
            <details key={doc.id} className="rounded-md border border-stone-200 p-3">
              <summary className="cursor-pointer">
                <span className="text-sm font-semibold text-stone-800">
                  {doc.title}
                </span>
                <span className="ml-2 text-xs text-stone-500">
                  {formatShortDate(doc.updatedAt)}
                </span>
              </summary>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <form action={updateEntityDoc} className="space-y-2">
                  <input type="hidden" name="docId" value={doc.id} />
                  <input
                    name="title"
                    required
                    defaultValue={doc.title}
                    className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                  />
                  <textarea
                    name="bodyMd"
                    required
                    rows={8}
                    defaultValue={doc.bodyMd}
                    className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                  />
                  <div className="flex gap-2">
                    <button className="inline-flex h-9 items-center justify-center rounded-md bg-teal-700 px-3 text-sm font-medium text-white transition hover:bg-teal-800">
                      Save
                    </button>
                    <button
                      formAction={archiveEntityDoc}
                      className="inline-flex h-9 items-center justify-center rounded-md border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 transition hover:border-stone-400"
                    >
                      Archive
                    </button>
                  </div>
                </form>
                <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
                  <MarkdownPreview body={doc.bodyMd} />
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

function AttachmentsPanel({
  parentType,
  parentId,
  attachments,
}: {
  parentType: "area" | "project";
  parentId: string;
  attachments: AttachmentItem[];
}) {
  return (
    <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
      <h2 className="text-base font-semibold text-stone-800">Attachments</h2>
      <AttachmentUpload parentType={parentType} parentId={parentId} />
      {attachments.length === 0 ? (
        <p className="text-sm text-stone-500">No attachments.</p>
      ) : (
        <div className="divide-y divide-stone-100">
          {attachments.map((attachment) => (
            <a
              key={attachment.id}
              href={`/api/documents/${attachment.id}/download`}
              className="block py-2 text-sm font-medium text-stone-800 transition hover:text-teal-700"
            >
              {attachment.filename}
              <span className="ml-2 text-xs font-normal text-stone-500">
                {attachment.mime} / {formatBytes(attachment.size)}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function MilestonesPanel({
  projectId,
  milestones,
}: {
  projectId: string;
  milestones: MilestoneItem[];
}) {
  return (
    <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-stone-800">Milestones</h2>
        <details className="relative">
          <summary className="inline-flex h-8 cursor-pointer list-none items-center justify-center rounded-md border border-stone-300 bg-white px-2 text-sm font-medium text-stone-700 transition hover:border-stone-400 [&::-webkit-details-marker]:hidden">
            Add
          </summary>
          <form
            action={addMilestone}
            className="absolute right-0 z-10 mt-2 flex w-80 max-w-[calc(100vw-2rem)] gap-2 rounded-md border border-stone-200 bg-white p-2 shadow-lg"
          >
            <input type="hidden" name="projectId" value={projectId} />
            <label className="sr-only" htmlFor="milestone-title">
              Milestone title
            </label>
            <input
              id="milestone-title"
              name="title"
              required
              className="h-9 min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            />
            <button className="inline-flex h-9 items-center justify-center rounded-md bg-teal-700 px-3 text-sm font-medium text-white transition hover:bg-teal-800">
              Add
            </button>
          </form>
        </details>
      </div>
      <div className="divide-y divide-stone-100">
        {milestones.map((milestone) => (
          <div key={milestone.id} className="flex items-center gap-2 py-2">
            <form action={completeMilestone}>
              <input type="hidden" name="milestoneId" value={milestone.id} />
              <button
                className="h-7 rounded-md border border-stone-300 px-2 text-xs text-stone-700 transition hover:border-teal-500"
                disabled={milestone.status === "completed"}
              >
                {milestone.status === "completed" ? "Done" : "Complete"}
              </button>
            </form>
            <p className="min-w-0 flex-1 text-sm font-medium text-stone-800">
              {milestone.title}
            </p>
            {milestone.status === "open" ? (
              <div className="flex gap-1">
                <MoveButton milestoneId={milestone.id} direction="up" label="Up" />
                <MoveButton
                  milestoneId={milestone.id}
                  direction="down"
                  label="Down"
                />
              </div>
            ) : null}
          </div>
        ))}
        </div>
    </div>
  );
}

function MoveButton({
  milestoneId,
  direction,
  label,
}: {
  milestoneId: string;
  direction: "up" | "down";
  label: string;
}) {
  return (
    <form action={moveMilestone}>
      <input type="hidden" name="milestoneId" value={milestoneId} />
      <input type="hidden" name="direction" value={direction} />
      <button className="h-7 rounded-md border border-stone-300 px-2 text-xs text-stone-700 transition hover:border-stone-400">
        {label}
      </button>
    </form>
  );
}

function MarkdownPreview({ body }: { body: string }) {
  return (
    <div className="space-y-2 text-sm text-stone-800">
      {body.split(/\n{2,}/).map((block, index) => {
        const trimmed = block.trim();
        if (trimmed.startsWith("# ")) {
          return (
            <h3 key={index} className="text-base font-semibold text-stone-900">
              {trimmed.slice(2)}
            </h3>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h4 key={index} className="font-semibold text-stone-900">
              {trimmed.slice(3)}
            </h4>
          );
        }
        return (
          <p key={index} className="whitespace-pre-wrap">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
