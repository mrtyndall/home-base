"use client";

import { useRef } from "react";

type ReferenceFiltersProps = {
  database: string;
  filters: { status?: string; genre?: string; rating?: string; sort?: string };
  statuses: string[];
  genres: string[];
};

export function ReferenceFilters({
  database,
  filters,
  statuses,
  genres,
}: ReferenceFiltersProps) {
  const formRef = useRef<HTMLFormElement>(null);

  function submitFilters() {
    formRef.current?.requestSubmit();
  }

  return (
    <form
      ref={formRef}
      action={`/ideas/${database}`}
      className="grid gap-2 rounded-[18px] border border-[#E2E6DF] bg-white p-3 sm:grid-cols-4"
    >
      <ReferenceFilterSelect
        label="Status"
        name="status"
        value={filters.status ?? ""}
        options={statuses}
        emptyLabel="All"
        onChange={submitFilters}
      />
      <ReferenceFilterSelect
        label="Genre"
        name="genre"
        value={filters.genre ?? ""}
        options={genres}
        emptyLabel="All"
        onChange={submitFilters}
      />
      <ReferenceFilterSelect
        label="Rating"
        name="rating"
        value={filters.rating ?? ""}
        options={[
          { value: "8", label: "8+" },
          { value: "7", label: "7+" },
          { value: "5", label: "5+" },
        ]}
        emptyLabel="Any"
        onChange={submitFilters}
      />
      <ReferenceFilterSelect
        label="Sort"
        name="sort"
        value={filters.sort ?? "title"}
        options={[
          { value: "title", label: "Title" },
          { value: "rating", label: "Rating" },
          { value: "newest", label: "Newest" },
        ]}
        onChange={submitFilters}
      />
    </form>
  );
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
    <label className="grid gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
      {label}
      <select
        name={name}
        defaultValue={value}
        onChange={onChange}
        className="h-9 rounded-full border border-[#E2E6DF] bg-white px-3 text-sm font-normal normal-case tracking-normal text-stone-950"
      >
        {emptyLabel ? <option value="">{emptyLabel}</option> : null}
        {options.map((option) => {
          const item =
            typeof option === "string" ? { value: option, label: option } : option;
          return (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          );
        })}
      </select>
    </label>
  );
}
