import type React from "react";

export function MarkdownPreview({
  body,
  className = "",
  mentions = [],
}: {
  body: string;
  className?: string;
  mentions?: Array<{
    label: string;
    targetType: "person" | "reference" | "calendar_event";
    targetId: string;
    href: string;
  }>;
}) {
  const mentionsByKey = new Map(
    mentions.map((mention) => [
      `${mention.targetType}:${mention.targetId}`,
      mention,
    ]),
  );

  return (
    <div className={`space-y-2 text-sm text-stone-800 ${className}`}>
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
            {renderInlineMentions(trimmed, mentionsByKey)}
          </p>
        );
      })}
    </div>
  );
}

function renderInlineMentions(
  text: string,
  mentionsByKey: Map<
    string,
    {
      label: string;
      targetType: "person" | "reference" | "calendar_event";
      targetId: string;
      href: string;
    }
  >,
) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(
    /@\[\[(person|reference|calendar_event):([^|\]]+)\|([^\]]+)]]/g,
  )) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push(text.slice(lastIndex, index));
    }

    const key = `${match[1]}:${match[2]}`;
    const mention = mentionsByKey.get(key);
    parts.push(
      <a
        key={`${key}:${index}`}
        href={mention?.href ?? "#"}
        className="font-medium text-teal-700 transition hover:text-teal-900"
      >
        @{mention?.label ?? match[3]}
      </a>,
    );
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}
