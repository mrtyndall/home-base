"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type MentionCandidate = {
  id: string;
  targetType: "person" | "reference" | "calendar_event";
  type: string;
  label: string;
  preview?: string;
};

type MentionSearchResponse = {
  items: MentionCandidate[];
};

export function MentionTextarea({
  id,
  name,
  required,
  rows,
  defaultValue = "",
  className,
}: {
  id?: string;
  name: string;
  required?: boolean;
  rows: number;
  defaultValue?: string;
  className: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState(defaultValue);
  const [cursor, setCursor] = useState(defaultValue.length);
  const [items, setItems] = useState<MentionCandidate[]>([]);

  const mention = useMemo(() => activeMention(value, cursor), [value, cursor]);
  const open = Boolean(mention && mention.query.length > 0 && items.length > 0);

  useEffect(() => {
    let cancelled = false;
    if (!mention || mention.query.length < 1) {
      return;
    }

    const timeout = window.setTimeout(async () => {
      const response = await fetch(
        `/api/reference-mentions/search?q=${encodeURIComponent(mention.query)}`,
      );
      if (!response.ok || cancelled) return;
      const body = (await response.json()) as MentionSearchResponse;
      if (cancelled) return;
      setItems(body.items);
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [mention]);

  function insertMention(item: MentionCandidate) {
    if (!mention) return;
    const token = `@[[${item.targetType}:${item.id}|${item.label}]]`;
    const nextValue = `${value.slice(0, mention.start)}${token} ${value.slice(cursor)}`;
    const nextCursor = mention.start + token.length + 1;
    setValue(nextValue);
    setCursor(nextCursor);
    setItems([]);
    window.setTimeout(() => {
      const textarea = textareaRef.current;
      textarea?.focus();
      textarea?.setSelectionRange(nextCursor, nextCursor);
    }, 0);
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        id={id}
        name={name}
        required={required}
        rows={rows}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setCursor(event.target.selectionStart);
        }}
        onSelect={(event) => setCursor(event.currentTarget.selectionStart)}
        className={className}
      />
      {open ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-[16px] border border-white/65 bg-[#FAFBF9]/90 shadow-[0_12px_36px_rgba(28,25,23,0.18)] backdrop-blur-xl">
          {items.map((item) => (
            <button
              key={`${item.type}:${item.id}`}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => insertMention(item)}
              className="block w-full border-b border-[#EEF1EC] px-3.5 py-2.5 text-left last:border-b-0 hover:bg-white/80"
            >
              <span className="block text-sm font-medium text-stone-950">
                @{item.label}
              </span>
              <span className="mt-0.5 block line-clamp-1 text-xs text-[#9AA096]">
                {item.type}
                {item.preview ? ` · ${item.preview}` : ""}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function activeMention(value: string, cursor: number) {
  const beforeCursor = value.slice(0, cursor);
  const atIndex = beforeCursor.lastIndexOf("@");
  if (atIndex < 0) return null;
  const between = beforeCursor.slice(atIndex + 1);
  if (/[\n@]/.test(between)) return null;
  if (between.length > 64) return null;
  return { start: atIndex, query: between.trimStart() };
}
