import Link from "next/link";
import type { ReadLaterProjectOption } from "@/components/read-later-form";
import { ReadLaterItemActions } from "@/components/read-later-item-actions";
import type { AreaOption } from "@/lib/hierarchy";
import type { ReadLaterStatus } from "@/lib/read-later";

export type ReadLaterListItem = {
  id: string;
  title: string | null;
  body: string;
  url: string | null;
  readStatus: string;
  savedAt: Date;
  areaId: string | null;
  projectId: string | null;
  filingPath: string;
};

export function ReadLaterList({
  items,
  status,
  areaOptions,
  projects,
}: {
  items: readonly ReadLaterListItem[];
  status: ReadLaterStatus;
  areaOptions: readonly AreaOption[];
  projects: readonly ReadLaterProjectOption[];
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-[18px] border border-dashed border-[#CDD5CC] bg-white/55 px-5 py-8 text-center">
        <p className="font-serif text-lg text-stone-800">
          {status === "unread" ? "Nothing waiting to be read." : `No ${status} links.`}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-[#6B7268]">
          {status === "unread"
            ? "Save a URL above and it will stay here until you mark it read."
            : "Choose another filter or save a new link."}
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-[#E7EBE5] overflow-hidden rounded-[18px] border border-[#DCE2DA] bg-white">
      {items.map((item) => {
        const url = item.url ?? item.body;
        const title = item.title?.trim() || readLaterHost(url);
        const excerpt = item.body !== url ? item.body : null;

        return (
          <article
            key={item.id}
            className={`px-4 py-4 sm:px-5 ${item.readStatus === "unread" ? "bg-white" : "bg-[#FAFBF9]"}`}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <Link
                  href={`/references/${item.id}`}
                  className="min-w-0 flex-1 font-serif text-[19px] font-medium leading-[1.25] text-stone-950 decoration-teal-700/40 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                  style={{ overflowWrap: "anywhere" }}
                >
                  {title}
                </Link>
                <span className="shrink-0 rounded-full border border-[#DCE2DA] px-2.5 py-1 text-[11px] font-medium capitalize text-stone-600">
                  {item.readStatus}
                </span>
              </div>
              <p className="mt-1 text-xs text-[#878F85]">
                {readLaterHost(url)} · saved {formatReadLaterDate(item.savedAt)}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[#6B7268]" style={{ overflowWrap: "anywhere" }}>
                {item.filingPath}
              </p>
              {excerpt ? (
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-stone-600">
                  {excerpt}
                </p>
              ) : null}
            </div>

            <ReadLaterItemActions
              itemId={item.id}
              url={url}
              readStatus={item.readStatus}
              currentAreaId={item.areaId}
              currentProjectId={item.projectId}
              areaOptions={areaOptions}
              projects={projects}
            />
          </article>
        );
      })}
    </div>
  );
}

export function readLaterHost(raw: string) {
  try {
    return new URL(raw).hostname.replace(/^www\./, "") || "Saved link";
  } catch {
    return "Saved link";
  }
}

function formatReadLaterDate(value: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(value);
}
