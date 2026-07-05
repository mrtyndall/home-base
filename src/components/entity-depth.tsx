import {
  addEntityNote,
  addMilestone,
  archiveEntityDoc,
  completeMilestone,
  createEntityDoc,
  importEntityDocMarkdown,
  moveMilestone,
  updateEntityDoc,
  updateEntityNote,
} from "@/app/actions";
import { AttachmentUpload } from "@/components/attachment-upload";
import { MarkdownPreview } from "@/components/markdown-preview";
import { MentionTextarea } from "@/components/mention-textarea";
import { NoteStarButton } from "@/components/note-star-button";
import { formatShortDate } from "@/lib/dates";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

type EntityNoteItem = {
  id: string;
  bodyMd: string;
  starredAt: Date | null;
  createdAt: Date;
  mentions?: Array<{
    label: string;
    targetType: "person" | "reference" | "calendar_event";
    targetId: string;
    href: string;
  }>;
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
  variant = "default",
}: {
  parentType: "area" | "project";
  parentId: string;
  notes: EntityNoteItem[];
  docs: EntityDocItem[];
  attachments: AttachmentItem[];
  variant?: "default" | "project";
}) {
  if (variant === "project") {
    return (
      <section className="space-y-6">
        <NotesPanel
          parentType={parentType}
          parentId={parentId}
          notes={notes}
          variant="paper"
        />
        <DocsPanel parentType={parentType} parentId={parentId} docs={docs} />
        <AttachmentsPanel
          parentType={parentType}
          parentId={parentId}
          attachments={attachments}
        />
      </section>
    );
  }

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
  variant = "boxed",
}: {
  parentType: "area" | "project";
  parentId: string;
  notes: EntityNoteItem[];
  variant?: "boxed" | "paper";
}) {
  const starredNotes = notes
    .filter((note) => note.starredAt)
    .sort((left, right) => Number(right.starredAt) - Number(left.starredAt));
  const regularNotes = notes.filter((note) => !note.starredAt);

  const wrapperClass =
    variant === "paper"
      ? "space-y-2.5"
      : "space-y-2.5 rounded-[14px] border border-[#E2E6DF] bg-white p-4";

  return (
    <div className="space-y-5">
      <ImportantNotesPanel notes={starredNotes} variant={variant} />
      <div className={wrapperClass}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
            Notes
          </h2>
          <details className="relative">
            <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-full border border-[#E2E6DF] bg-white px-3.5 text-[13px] font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700 [&::-webkit-details-marker]:hidden">
              Add
            </summary>
            <form
              action={addEntityNote}
              className="absolute right-0 z-10 mt-2 w-80 max-w-[calc(100vw-2rem)] space-y-2 rounded-[20px] border border-white/65 bg-[#FAFBF9]/75 p-2 shadow-[0_12px_36px_rgba(28,25,23,0.18)] backdrop-blur-xl backdrop-saturate-150"
            >
              <input type="hidden" name="parentType" value={parentType} />
              <input type="hidden" name="parentId" value={parentId} />
              <label
                className="sr-only"
                htmlFor={`${parentType}-${parentId}-note`}
              >
                Note
              </label>
              <MentionTextarea
                id={`${parentType}-${parentId}-note`}
                name="bodyMd"
                required
                rows={3}
                className="w-full rounded-[12px] border border-[#E2E6DF] bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-teal-700"
              />
              <button className="inline-flex h-9 items-center justify-center rounded-full bg-teal-700 px-4 text-[13px] font-medium text-white transition hover:bg-teal-800">
                Save
              </button>
            </form>
          </details>
        </div>
        {regularNotes.length === 0 ? null : (
          <div
            className={
              variant === "paper" ? "space-y-3" : "divide-y divide-[#EEF1EC]"
            }
          >
            {regularNotes.map((note) => (
              <NoteRow key={note.id} note={note} variant={variant} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ImportantNotesPanel({
  notes,
  variant,
}: {
  notes: EntityNoteItem[];
  variant: "boxed" | "paper";
}) {
  if (notes.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2.5">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
        Important notes
      </h2>
      <div
        className={
          variant === "paper"
            ? "space-y-3"
            : "divide-y divide-[#EEF1EC] rounded-[14px] border border-[#E2E6DF] bg-white p-4"
        }
      >
        {notes.map((note) => (
          <NoteRow key={note.id} note={note} variant={variant} />
        ))}
      </div>
    </section>
  );
}

function NoteRow({
  note,
  variant,
}: {
  note: EntityNoteItem;
  variant: "boxed" | "paper";
}) {
  return (
    <div
      className={
        variant === "paper"
          ? "relative rounded-[8px] bg-[linear-gradient(315deg,transparent_13px,#FBF7EA_0)] p-4 shadow-[0_2px_5px_rgba(28,25,23,0.10)] odd:-rotate-[0.5deg] even:rotate-[0.6deg]"
          : "py-3"
      }
    >
      {variant === "paper" ? (
        <span
          aria-hidden="true"
          className="absolute bottom-0 right-0 h-[13px] w-[13px] bg-[linear-gradient(to_top_left,transparent_50%,#EAE2C9_50%)]"
        />
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div
          className={
            variant === "paper"
              ? "min-w-0 flex-1 italic text-stone-700"
              : "min-w-0 flex-1"
          }
        >
          <MarkdownPreview body={note.bodyMd} mentions={note.mentions} />
          {note.mentions && note.mentions.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5 not-italic">
              {note.mentions.map((mention) => (
                <a
                  key={`${mention.targetType}:${mention.targetId}`}
                  href={mention.href}
                  className="inline-flex h-7 items-center rounded-full border border-[#E2E6DF] bg-white px-2.5 text-xs font-medium text-teal-700 transition hover:border-teal-700/50"
                >
                  @{mention.label}
                </a>
              ))}
            </div>
          ) : null}
          <p className="mt-2 text-xs not-italic text-[#B0ACA2]">
            {formatShortDate(note.createdAt)}
          </p>
          <details className="mt-2">
            <summary className="inline-flex h-8 cursor-pointer list-none items-center rounded-full border border-[#E2E6DF] bg-white px-3 text-[13px] font-medium not-italic text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700 [&::-webkit-details-marker]:hidden">
              Edit
            </summary>
            <form action={updateEntityNote} className="mt-2 space-y-2">
              <input type="hidden" name="noteId" value={note.id} />
              <MentionTextarea
                name="bodyMd"
                required
                rows={4}
                defaultValue={note.bodyMd}
                className="w-full rounded-[12px] border border-[#E2E6DF] bg-white px-3.5 py-2.5 text-sm not-italic outline-none transition focus:border-teal-700"
              />
              <button className="inline-flex h-8 items-center justify-center rounded-full bg-teal-700 px-3.5 text-[13px] font-medium not-italic text-white transition hover:bg-teal-800">
                Save
              </button>
            </form>
          </details>
        </div>
        <NoteStarButton noteId={note.id} starred={Boolean(note.starredAt)} />
      </div>
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
  if (docs.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2.5 rounded-[14px] border border-[#E2E6DF] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
          Docs
        </h2>
      </div>
      <DocCreateImport parentType={parentType} parentId={parentId} />
      {docs.length === 0 ? null : (
        <div className="space-y-3">
          {docs.map((doc) => (
            <details
              key={doc.id}
              className="rounded-[12px] border border-[#EEF1EC] p-3"
            >
              <summary className="cursor-pointer">
                <span className="text-sm font-semibold text-stone-800">
                  {doc.title}
                </span>
                <span className="ml-2 text-xs text-[#9AA096]">
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
                    className="h-10 w-full rounded-full border border-[#E2E6DF] bg-white px-3.5 text-sm outline-none focus:border-teal-700"
                  />
                  <textarea
                    name="bodyMd"
                    required
                    rows={8}
                    defaultValue={doc.bodyMd}
                    className="w-full rounded-[12px] border border-[#E2E6DF] bg-white px-3.5 py-2.5 font-mono text-sm outline-none focus:border-teal-700"
                  />
                  <div className="flex gap-2">
                    <button className="inline-flex h-9 items-center justify-center rounded-full bg-teal-700 px-4 text-[13px] font-medium text-white transition hover:bg-teal-800">
                      Save
                    </button>
                    <button
                      formAction={archiveEntityDoc}
                      className="inline-flex h-9 items-center justify-center rounded-full border border-[#E2E6DF] bg-white px-3.5 text-[13px] font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700"
                    >
                      Archive
                    </button>
                  </div>
                </form>
                <div className="rounded-[12px] border border-[#EEF1EC] bg-[#F7F9F5] p-3">
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

export function EntityDocAction({
  parentType,
  parentId,
}: {
  parentType: "area" | "project";
  parentId: string;
}) {
  return (
    <details className="relative">
      <summary className="inline-flex h-8 cursor-pointer list-none items-center px-2 text-[13px] font-medium text-stone-500 transition hover:text-stone-950 [&::-webkit-details-marker]:hidden">
        Add doc
      </summary>
      <div className="absolute right-0 z-10 mt-2 w-[min(calc(100vw-2rem),42rem)] rounded-[20px] border border-white/65 bg-[#FAFBF9]/75 p-3 shadow-[0_12px_36px_rgba(28,25,23,0.18)] backdrop-blur-xl backdrop-saturate-150">
        <DocCreateImport parentType={parentType} parentId={parentId} />
      </div>
    </details>
  );
}

function DocCreateImport({
  parentType,
  parentId,
}: {
  parentType: "area" | "project";
  parentId: string;
}) {
  return (
    <details className="rounded-[12px] border border-[#EEF1EC] bg-[#F7F9F5] p-3">
      <summary className="cursor-pointer list-none text-[13px] font-medium text-stone-600 [&::-webkit-details-marker]:hidden">
        Create or import markdown
      </summary>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <form action={createEntityDoc} className="space-y-3">
          <input type="hidden" name="parentType" value={parentType} />
          <input type="hidden" name="parentId" value={parentId} />
          <label
            className="block text-[13px] font-medium text-stone-600"
            htmlFor={`${parentType}-${parentId}-doc-title`}
          >
            <span>Title</span>
            <input
              id={`${parentType}-${parentId}-doc-title`}
              name="title"
              required
              className="mt-1 h-10 w-full rounded-full border border-[#E2E6DF] bg-white px-3.5 text-sm outline-none transition focus:border-teal-700"
            />
          </label>
          <label
            className="block text-[13px] font-medium text-stone-600"
            htmlFor={`${parentType}-${parentId}-doc-body`}
          >
            <span>Body</span>
            <textarea
              id={`${parentType}-${parentId}-doc-body`}
              name="bodyMd"
              required
              rows={12}
              className="mt-1 w-full rounded-[12px] border border-[#E2E6DF] bg-white px-3.5 py-2.5 font-mono text-sm outline-none transition focus:border-teal-700"
            />
          </label>
          <button className="inline-flex h-10 items-center justify-center rounded-full bg-teal-700 px-4 text-sm font-medium text-white transition hover:bg-teal-800">
            Create doc
          </button>
        </form>
        <form
          action={importEntityDocMarkdown}
          className="space-y-3 rounded-[12px] border border-[#EEF1EC] bg-white p-3"
        >
          <input type="hidden" name="parentType" value={parentType} />
          <input type="hidden" name="parentId" value={parentId} />
          <label
            className="block text-[13px] font-medium text-stone-600"
            htmlFor={`${parentType}-${parentId}-doc-upload-title`}
          >
            <span>Title override</span>
            <input
              id={`${parentType}-${parentId}-doc-upload-title`}
              name="title"
              className="mt-1 h-10 w-full rounded-full border border-[#E2E6DF] bg-white px-3.5 text-sm outline-none transition focus:border-teal-700"
            />
          </label>
          <label
            className="block text-[13px] font-medium text-stone-600"
            htmlFor={`${parentType}-${parentId}-doc-upload`}
          >
            <span>Markdown file</span>
            <input
              id={`${parentType}-${parentId}-doc-upload`}
              type="file"
              name="markdownFile"
              accept=".md,.markdown,.txt,text/markdown,text/plain"
              required
              className="mt-1 block w-full rounded-full border border-[#E2E6DF] bg-white px-3 py-2 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-[#EFF2EE] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-stone-700"
            />
          </label>
          <button className="inline-flex h-10 items-center justify-center rounded-full border border-[#E2E6DF] bg-white px-4 text-sm font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700">
            Import markdown
          </button>
        </form>
      </div>
    </details>
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
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2.5 rounded-[14px] border border-[#E2E6DF] bg-white p-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
        Attachments
      </h2>
      <AttachmentUpload parentType={parentType} parentId={parentId} />
      {attachments.length === 0 ? null : (
        <div className="divide-y divide-[#EEF1EC]">
          {attachments.map((attachment) => (
            <a
              key={attachment.id}
              href={`/api/documents/${attachment.id}/download`}
              className="block py-2 text-sm font-medium text-stone-800 transition hover:text-teal-700"
            >
              {attachment.filename}
              <span className="ml-2 text-xs font-normal text-[#9AA096]">
                {attachment.mime} / {formatBytes(attachment.size)}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export function EntityAttachmentAction({
  parentType,
  parentId,
}: {
  parentType: "area" | "project";
  parentId: string;
}) {
  return (
    <AttachmentUpload
      parentType={parentType}
      parentId={parentId}
      variant="quiet"
    />
  );
}

export function MilestonesPanel({
  projectId,
  milestones,
}: {
  projectId: string;
  milestones: MilestoneItem[];
}) {
  const completed = milestones.filter(
    (milestone) => milestone.status === "completed",
  ).length;
  const total = milestones.length;
  const orderedMilestones = [
    ...milestones.filter((milestone) => milestone.status === "open"),
    ...milestones.filter((milestone) => milestone.status === "completed"),
  ];

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
          Milestones{" "}
          {total > 0 ? (
            <span className="font-medium text-[#B0ACA2]">
              {completed} of {total}
            </span>
          ) : null}
        </h2>
        <details className="relative">
          <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-full border border-[#E2E6DF] bg-white px-3.5 text-[13px] font-medium text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700 [&::-webkit-details-marker]:hidden">
            Add
          </summary>
          <form
            action={addMilestone}
            className="absolute right-0 z-10 mt-2 flex w-80 max-w-[calc(100vw-2rem)] gap-2 rounded-[20px] border border-white/65 bg-[#FAFBF9]/75 p-2 shadow-[0_12px_36px_rgba(28,25,23,0.18)] backdrop-blur-xl backdrop-saturate-150"
          >
            <input type="hidden" name="projectId" value={projectId} />
            <label className="sr-only" htmlFor="milestone-title">
              Milestone title
            </label>
            <input
              id="milestone-title"
              name="title"
              required
              className="h-10 min-w-0 flex-1 rounded-full border border-[#E2E6DF] bg-white px-3.5 text-sm outline-none transition focus:border-teal-700"
            />
            <button className="inline-flex h-10 items-center justify-center rounded-full bg-teal-700 px-4 text-sm font-medium text-white transition hover:bg-teal-800">
              Add
            </button>
          </form>
        </details>
      </div>
      {milestones.length === 0 ? null : (
        <div className="space-y-[7px]">
          {orderedMilestones.map((milestone) => (
            <div key={milestone.id} className="flex items-center gap-2.5">
              <form action={completeMilestone}>
                <input type="hidden" name="milestoneId" value={milestone.id} />
                <button
                  title={
                    milestone.status === "completed"
                      ? "Completed"
                      : "Complete milestone"
                  }
                  aria-label={
                    milestone.status === "completed"
                      ? "Completed"
                      : "Complete milestone"
                  }
                  className={
                    milestone.status === "completed"
                      ? "grid h-6 w-6 place-items-center rounded-full bg-teal-700 text-white"
                      : "grid h-6 w-6 place-items-center rounded-full border-[1.5px] border-[#C9CFC5] bg-white text-transparent transition hover:border-teal-700/50 hover:text-teal-700"
                  }
                  disabled={milestone.status === "completed"}
                >
                  <Check size={12} />
                </button>
              </form>
              <p
                className={`min-w-0 flex-1 text-sm ${
                  milestone.status === "completed"
                    ? "text-stone-500 line-through decoration-[#C9CFC5]"
                    : "font-medium text-stone-900"
                }`}
              >
                {milestone.title}
              </p>
              {milestone.status === "open" ? (
                <div className="flex gap-0.5">
                  <MoveButton
                    milestoneId={milestone.id}
                    direction="up"
                    label="Up"
                  />
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
      )}
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
      <button
        title={label}
        aria-label={`Move ${direction}`}
        className="grid h-7 w-7 place-items-center rounded-full text-[#B0ACA2] transition hover:bg-[#F7F9F5] hover:text-stone-700"
      >
        {direction === "up" ? (
          <ChevronUp size={14} />
        ) : (
          <ChevronDown size={14} />
        )}
      </button>
    </form>
  );
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
