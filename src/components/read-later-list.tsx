import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { fileReadLaterAction, setReadLaterStatusAction } from "@/app/actions";
import type { ReadLaterProjectOption } from "@/components/read-later-form";
import type { AreaHierarchyRecord } from "@/lib/hierarchy";
import { flattenAreaOptions } from "@/lib/hierarchy";
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
  areaPath: string | null;
  projectName: string | null;
};

export function ReadLaterList({
  items,
  status,
  areas,
  projects,
}: {
  items: readonly ReadLaterListItem[];
  status: ReadLaterStatus;
  areas: readonly AreaHierarchyRecord[];
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

  const areaOptions = flattenAreaOptions(areas);

  return (
    <div className="divide-y divide-[#E7EBE5] overflow-hidden rounded-[18px] border border-[#DCE2DA] bg-white">
      {items.map((item) => {
        const url = item.url ?? item.body;
        const title = item.title?.trim() || readLaterHost(url);
        const excerpt = item.body !== url ? item.body : null;
        const path = item.projectName
          ? `${item.areaPath ?? "No area yet"} / ${item.projectName}`
          : item.areaPath ?? "Unfiled";

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
                {path}
              </p>
              {excerpt ? (
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-stone-600">
                  {excerpt}
                </p>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-teal-700 px-4 text-[13px] font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
              >
                Open <ArrowUpRight size={13} strokeWidth={2.4} />
              </a>
              <form action={setReadLaterStatusAction}>
                <input type="hidden" name="referenceId" value={item.id} />
                <input
                  type="hidden"
                  name="status"
                  value={item.readStatus === "unread" ? "read" : "unread"}
                />
                <button className="min-h-11 rounded-full px-3.5 text-[13px] font-medium text-stone-700 transition hover:bg-[#F1F4EF] hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
                  {item.readStatus === "unread" ? "Mark read" : "Mark unread"}
                </button>
              </form>
              {item.readStatus !== "archived" ? (
                <form action={setReadLaterStatusAction}>
                  <input type="hidden" name="referenceId" value={item.id} />
                  <input type="hidden" name="status" value="archived" />
                  <button className="min-h-11 rounded-full px-3.5 text-[13px] font-medium text-stone-600 transition hover:bg-[#F1F4EF] hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
                    Archive
                  </button>
                </form>
              ) : null}
              <details className="group relative">
                <summary className="inline-flex min-h-11 cursor-pointer list-none items-center rounded-full px-3.5 text-[13px] font-medium text-stone-700 transition hover:bg-[#F1F4EF] hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 [&::-webkit-details-marker]:hidden">
                  File
                </summary>
                <form
                  action={fileReadLaterAction}
                  className="mt-2 w-full min-w-[min(310px,calc(100vw-3rem))] space-y-3 rounded-[16px] border border-[#DCE2DA] bg-[#FAFBF9] p-3.5 shadow-[0_12px_32px_rgba(28,25,23,0.14)] sm:absolute sm:left-0 sm:z-20 sm:w-[310px]"
                >
                  <input type="hidden" name="referenceId" value={item.id} />
                  <label className="block text-[13px] font-medium text-stone-600">
                    <span>Destination</span>
                    <select
                      name="destination"
                      defaultValue={item.projectId ? `project:${item.projectId}` : item.areaId ? `area:${item.areaId}` : ""}
                      className="mt-1 min-h-11 w-full rounded-[12px] border border-[#D7DDD4] bg-white px-3 text-base text-stone-950 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/20"
                    >
                      <option value="">No filing yet</option>
                      <optgroup label="Areas">
                        {areaOptions.map((area) => (
                          <option key={area.id} value={`area:${area.id}`}>{area.path}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Projects">
                        {projects.map((project) => (
                          <option key={project.id} value={`project:${project.id}`}>
                            {project.areaPath ? `${project.areaPath} / ${project.name}` : `No area yet / ${project.name}`}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                  </label>
                  <button className="min-h-11 w-full rounded-full bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700">
                    Save filing
                  </button>
                </form>
              </details>
            </div>
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
