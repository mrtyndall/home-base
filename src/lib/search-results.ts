export type SearchCandidate = {
  type: string;
  id: string;
  title: string;
  detail?: string;
  href: string;
  primary: string;
  secondary?: string | null;
  updatedAt: Date | string;
};

export const MIN_SEARCH_QUERY_LENGTH = 2;

type SearchResultLocation =
  | { kind: "capture" | "task" | "project" | "idea" | "reference" | "note" | "check-in" | "journal" | "person"; id: string }
  | { kind: "highlight"; id: string; referenceId: string }
  | { kind: "doc"; id: string; parentType: "area" | "project" | "journal_entry" | null; parentId: string | null }
  | { kind: "person-fact"; id: string; personId: string };

export function searchResultHref(location: SearchResultLocation) {
  const id = encodeURIComponent(location.id);
  switch (location.kind) {
    case "capture":
      return `/captures/${id}`;
    case "task":
      return `/tasks/${id}`;
    case "project":
      return `/projects/${id}`;
    case "idea":
      return `/ideas/items/${id}`;
    case "reference":
      return `/references/${id}`;
    case "highlight":
      return `/references/${encodeURIComponent(location.referenceId)}#snippet-${id}`;
    case "note":
      return `/notes/${id}`;
    case "doc": {
      return `/docs/${id}`;
    }
    case "check-in":
      return `/check-ins/${id}`;
    case "journal":
      return `/journal/${id}`;
    case "person":
      return `/people/${id}`;
    case "person-fact":
      return `/people/${encodeURIComponent(location.personId)}/facts/${id}`;
  }
}

export function mergeSearchCandidates(
  strong: SearchCandidate[],
  broad: SearchCandidate[],
) {
  const seen = new Set<string>();
  return [...strong, ...broad].filter((candidate) => {
    const key = `${candidate.type}\u0000${candidate.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function strongTextWhere<T = Record<string, unknown>>(field: string, query: string): T {
  return {
    OR: [
      { [field]: { equals: query, mode: "insensitive" as const } },
      { [field]: { startsWith: query, mode: "insensitive" as const } },
    ],
  } as T;
}

export function exactTextWhere<T = Record<string, unknown>>(fields: string[], query: string): T {
  return {
    OR: fields.map((field) => ({
      [field]: { equals: query, mode: "insensitive" as const },
    })),
  } as T;
}

export function prefixTextWhere<T = Record<string, unknown>>(fields: string[], query: string): T {
  return {
    OR: fields.map((field) => ({
      [field]: { startsWith: query, mode: "insensitive" as const },
    })),
  } as T;
}

type ReferenceStrongClient<T> = {
  reference: {
    findMany(args: {
      where: Record<string, unknown>;
      orderBy: { createdAt: "desc" };
      take: number;
    }): Promise<T[]>;
  };
};

export async function loadReferenceStrongRows<T>(client: ReferenceStrongClient<T>, query: string) {
  const orderBy = { createdAt: "desc" as const };
  const [exact, prefix] = await Promise.all([
    client.reference.findMany({ where: exactTextWhere(["title", "body"], query), orderBy, take: 8 }),
    client.reference.findMany({ where: prefixTextWhere(["title", "body"], query), orderBy, take: 8 }),
  ]);
  return { exact, prefix };
}

export function rankSearchResults(
  candidates: SearchCandidate[],
  query: string,
  limit = 40,
) {
  const needle = normalize(query);
  if (!needle || limit <= 0) return [];

  const bands = new Map<number, SearchCandidate[]>();
  for (const candidate of candidates) {
    const score = relevance(candidate, needle);
    if (score === 0) continue;
    const band = bands.get(score) ?? [];
    band.push(candidate);
    bands.set(score, band);
  }

  const ranked: SearchCandidate[] = [];
  for (const score of [...bands.keys()].sort((left, right) => right - left)) {
    ranked.push(...interleaveKinds(bands.get(score) ?? []));
  }
  return ranked.slice(0, limit);
}

function relevance(candidate: SearchCandidate, needle: string) {
  const primary = normalize(candidate.primary);
  const secondary = normalize(candidate.secondary ?? "");
  if (primary === needle) return 4;
  if (primary.startsWith(needle)) return 3;
  if (primary.includes(needle)) return 2;
  if (secondary.includes(needle)) return 1;
  return 0;
}

function interleaveKinds(candidates: SearchCandidate[]) {
  const queues = new Map<string, SearchCandidate[]>();
  for (const candidate of candidates) {
    const queue = queues.get(candidate.type) ?? [];
    queue.push(candidate);
    queues.set(candidate.type, queue);
  }
  for (const queue of queues.values()) queue.sort(compareCandidate);

  const output: SearchCandidate[] = [];
  while (queues.size > 0) {
    const kinds = [...queues.entries()].sort((left, right) => {
      const byHead = compareCandidate(left[1][0], right[1][0]);
      return byHead || compareText(left[0], right[0]);
    });
    for (const [kind, queue] of kinds) {
      const next = queue.shift();
      if (next) output.push(next);
      if (queue.length === 0) queues.delete(kind);
    }
  }
  return output;
}

function compareCandidate(left: SearchCandidate, right: SearchCandidate) {
  const byDate = timestamp(right.updatedAt) - timestamp(left.updatedAt);
  return byDate || compareText(left.type, right.type) || compareText(left.id, right.id);
}

function timestamp(value: Date | string) {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}
