"use client";

import Link from "next/link";
import { useRef } from "react";

type ReferenceFiltersProps = {
  database: string;
  filters: { status?: string; genre?: string; rating?: string; sort?: string };
  statuses: string[];
  genres: string[];
  statusCounts: Record<string, number>;
  totalCount: number;
};

export function ReferenceFilters({
  database,
  filters,
  statuses,
  genres,
  statusCounts,
  totalCount,
}: ReferenceFiltersProps) {
  const formRef = useRef<HTMLFormElement>(null);

  function submitFilters() {
    formRef.current?.requestSubmit();
  }

  return (
    <div className="space-y-2">
      <nav aria-label="Status filter" className="flex flex-wrap gap-1.5">
        <StatusChip
          href={buildHref(database, { ...filters, status: undefined })}
          label="All"
          count={totalCount}
          active={!filters.status}
        />
        {statuses.map((status) => (
          <StatusChip
            key={status}
            href={buildHref(database, { ...filters, status })}
            label={statusLabel(status)}
            count={statusCounts[status] ?? 0}
            active={filters.status === status}
          />
        ))}
      </nav>
      <form
        ref={formRef}
        action={`/ideas/${database}`}
        className="flex flex-wrap items-center gap-1.5"
      >
        {filters.status ? (
          <input type="hidden" name="status" value={filters.status} />
        ) : null}
        <ReferenceFilterSelect
          label="Genre"
          name="genre"
          value={filters.genre ?? ""}
          options={genres}
          emptyLabel="Genre"
          onChange={submitFilters}
        />
        <ReferenceFilterSelect
          label="Minimum rating"
          name="rating"
          value={filters.rating ?? ""}
          options={[
            { value: "8", label: "8+" },
            { value: "7", label: "7+" },
            { value: "5", label: "5+" },
          ]}
          emptyLabel="Rating"
          onChange={submitFilters}
        />
        <ReferenceFilterSelect
          label="Sort"
          name="sort"
          value={filters.sort ?? "title"}
          options={[
            { value: "title", label: "Sort: Title" },
            { value: "rating", label: "Sort: Rating" },
            { value: "newest", label: "Sort: Newest" },
          ]}
          onChange={submitFilters}
        />
      </form>
    </div>
  );
}

function StatusChip({
  href,
  label,
  count,
  active,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex h-[30px] items-center gap-1.5 rounded-full border bg-white px-3 text-[13px] transition ${
        active
          ? "border-teal-700/40 font-medium text-teal-800"
          : "border-[#E2E6DF] text-stone-600 hover:border-teal-700/50 hover:text-teal-700"
      }`}
    >
      {label}
      <span
        className={`text-[11px] tabular-nums ${
          active ? "text-teal-700" : "text-[#9AA096]"
        }`}
      >
        {count}
      </span>
    </Link>
  );
}

export function statusLabel(status: string) {
  const cleaned = status.replace(/-/g, " ");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function buildHref(
  database: string,
  filters: { status?: string; genre?: string; rating?: string; sort?: string },
) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.genre) params.set("genre", filters.genre);
  if (filters.rating) params.set("rating", filters.rating);
  if (filters.sort && filters.sort !== "title") {
    params.set("sort", filters.sort);
  }
  const qs = params.toString();
  return `/ideas/${database}${qs ? `?${qs}` : ""}`;
}

function ReferenceFilterSelect({
  label,
  name,
  value,
  options,
  emptyLabel,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  options: Array<string | { value: string; label: string }>;
  emptyLabel?: string;
  onChange: () => void;
}) {
  return (
    <>
      <label className="sr-only" htmlFor={`${name}-filter`}>
        {label}
      </label>
      <select
        id={`${name}-filter`}
        name={name}
        defaultValue={value}
        onChange={onChange}
        className="h-[30px] rounded-full border border-[#E2E6DF] bg-white px-3 text-[13px] font-medium text-stone-600 outline-none transition hover:border-teal-700/50 focus:border-teal-700"
        aria-label={label}
      >
        {emptyLabel ? <option value="">{emptyLabel}</option> : null}
        {options.map((option) => {
          const item =
            typeof option === "string"
              ? { value: option, label: option }
              : option;
          return (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          );
        })}
      </select>
    </>
  );
}
