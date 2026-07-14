export type SearchableReference = {
  id: string;
  kind: string;
  title: string | null;
  body: string;
  url: string | null;
  readStatus: string;
};

export function toReferenceSearchResult(reference: SearchableReference) {
  const readLater = reference.kind === "read_later";
  const detail = [readLater ? reference.readStatus : null, reference.url]
    .filter(Boolean)
    .join(" · ") || undefined;
  return {
    type: readLater ? "Read Later" : "Reference",
    id: reference.id,
    title: reference.title ?? reference.body,
    detail,
    href: `/references/${reference.id}`,
  };
}
