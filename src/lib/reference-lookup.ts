export type ReferenceLookupKind = "book" | "movie";

export type ReferenceLookupCandidate = {
  source: "open_library" | "booklore" | "tmdb";
  sourceId: string;
  kind: ReferenceLookupKind;
  title: string;
  subtitle?: string | null;
  body: string;
  url?: string | null;
  tags: string[];
  metadata: Record<string, unknown>;
};

export type ReferenceLookupResult =
  | { ok: true; candidates: ReferenceLookupCandidate[]; sourceLabel: string }
  | { ok: false; reason: string; sourceLabel: string };

export async function searchReferenceCandidates(
  kind: ReferenceLookupKind,
  query: string,
): Promise<ReferenceLookupResult> {
  const trimmed = query.trim();
  if (!trimmed) {
    return { ok: true, candidates: [], sourceLabel: sourceLabel(kind) };
  }

  if (kind === "book") {
    return searchBooks(trimmed);
  }
  return searchMovies(trimmed);
}

async function searchBooks(query: string): Promise<ReferenceLookupResult> {
  const params = new URLSearchParams({
    q: query,
    limit: "8",
    fields:
      "key,title,author_name,first_publish_year,isbn,subject,number_of_pages_median,cover_i",
  });
  const [openLibraryResult, bookLoreCandidates] = await Promise.all([
    fetch(`https://openlibrary.org/search.json?${params.toString()}`, {
      headers: { "User-Agent": "Home Base personal library lookup" },
    }),
    searchBookLoreBooks(query),
  ]);
  if (!openLibraryResult.ok) {
    return {
      ok: false,
      reason: "Open Library lookup failed.",
      sourceLabel: "Open Library",
    };
  }

  const body = (await openLibraryResult.json()) as {
    docs?: Array<Record<string, unknown>>;
  };
  const candidates = (body.docs ?? [])
    .map(bookCandidate)
    .filter(isLookupCandidate);
  return {
    ok: true,
    candidates: [...bookLoreCandidates, ...candidates].slice(0, 12),
    sourceLabel: bookLoreCandidates.length
      ? "BookLore + Open Library"
      : "Open Library",
  };
}

function bookCandidate(
  value: Record<string, unknown>,
): ReferenceLookupCandidate | null {
  const title = stringValue(value.title);
  const key = stringValue(value.key);
  if (!title || !key) return null;

  const authors = stringArray(value.author_name);
  const firstPublishYear = numberOrString(value.first_publish_year);
  const isbn = stringArray(value.isbn)[0] ?? null;
  const subjects = stringArray(value.subject).slice(0, 6);
  const pages = numberOrString(value.number_of_pages_median);
  const coverId = numberOrString(value.cover_i);
  const coverUrl = coverId
    ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
    : null;

  return {
    source: "open_library",
    sourceId: key,
    kind: "book",
    title,
    subtitle: authors.join(", ") || null,
    body: [title, authors.join(", "), firstPublishYear]
      .filter(Boolean)
      .join(" · "),
    url: `https://openlibrary.org${key}`,
    tags: subjects,
    metadata: {
      author: authors.join(", ") || null,
      year: firstPublishYear,
      isbn,
      pages,
      coverId,
      coverUrl,
      status: "to read",
      source: "Open Library",
      sourceId: key,
    },
  };
}

async function searchBookLoreBooks(
  query: string,
): Promise<ReferenceLookupCandidate[]> {
  const baseUrl = process.env.BOOKLORE_BASE_URL?.replace(/\/$/, "");
  const token = process.env.BOOKLORE_TOKEN;
  if (!baseUrl || !token) return [];

  try {
    const response = await fetch(
      `${baseUrl}/api/v1/books?withDescription=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) return [];

    const books = (await response.json()) as Array<Record<string, unknown>>;
    return books
      .map((book) => bookLoreCandidate(book))
      .filter(isLookupCandidate)
      .filter((book) => bookLoreMatches(book, query))
      .slice(0, 8);
  } catch {
    return [];
  }
}

function bookLoreCandidate(
  value: Record<string, unknown>,
): ReferenceLookupCandidate | null {
  const id = numberOrString(value.id);
  const metadata = objectValue(value.metadata);
  const title = stringValue(metadata.title) ?? stringValue(value.title);
  if (!id || !title) return null;

  const authors = stringArray(metadata.authors);
  const categories = stringArray(metadata.categories);
  const rating =
    numberOrString(value.personalRating) ??
    numberOrString(metadata.rating) ??
    numberOrString(metadata.goodreadsRating) ??
    numberOrString(metadata.hardcoverRating);
  const status = stringValue(value.readStatus) ?? "in library";
  const pages = numberOrString(metadata.pageCount);
  const year = stringValue(metadata.publishedDate)?.slice(0, 4) ?? null;
  const coverUpdatedOn = stringValue(metadata.coverUpdatedOn);

  return {
    source: "booklore",
    sourceId: String(id),
    kind: "book",
    title,
    subtitle: authors.join(", ") || null,
    body:
      stringValue(metadata.description) ??
      [title, authors.join(", "), year].filter(Boolean).join(" · "),
    url: null,
    tags: categories,
    metadata: {
      author: authors.join(", ") || null,
      year,
      isbn: stringValue(metadata.isbn13) ?? stringValue(metadata.isbn10),
      pages,
      rating,
      status,
      genre: categories,
      source: "BookLore",
      sourceId: id,
      bookloreId: id,
      coverUpdatedOn,
      coverUrl: `/api/reference-covers/booklore/${id}`,
    },
  };
}

function bookLoreMatches(candidate: ReferenceLookupCandidate, query: string) {
  const normalized = query.toLocaleLowerCase();
  return [candidate.title, candidate.subtitle, candidate.body]
    .filter(Boolean)
    .some((value) => value?.toLocaleLowerCase().includes(normalized));
}

async function searchMovies(query: string): Promise<ReferenceLookupResult> {
  const token = process.env.TMDB_ACCESS_TOKEN;
  const apiKey = process.env.TMDB_API_KEY;
  if (!token && !apiKey) {
    return {
      ok: false,
      reason:
        "TMDB is not configured. Add TMDB_ACCESS_TOKEN or TMDB_API_KEY to enable movie lookup.",
      sourceLabel: "TMDB",
    };
  }

  const params = new URLSearchParams({
    query,
    include_adult: "false",
    language: "en-US",
    page: "1",
  });
  if (!token && apiKey) {
    params.set("api_key", apiKey);
  }

  const response = await fetch(
    `https://api.themoviedb.org/3/search/movie?${params.toString()}`,
    {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    },
  );
  if (!response.ok) {
    return {
      ok: false,
      reason: "TMDB movie lookup failed.",
      sourceLabel: "TMDB",
    };
  }

  const body = (await response.json()) as {
    results?: Array<Record<string, unknown>>;
  };
  return {
    ok: true,
    candidates: (body.results ?? [])
      .slice(0, 8)
      .map(movieCandidate)
      .filter(isLookupCandidate),
    sourceLabel: "TMDB",
  };
}

function movieCandidate(
  value: Record<string, unknown>,
): ReferenceLookupCandidate | null {
  const title = stringValue(value.title);
  const id = numberOrString(value.id);
  if (!title || !id) return null;

  const releaseDate = stringValue(value.release_date);
  const year = releaseDate ? releaseDate.slice(0, 4) : null;
  const overview = stringValue(value.overview);
  const rating = numberOrString(value.vote_average);

  return {
    source: "tmdb",
    sourceId: String(id),
    kind: "movie",
    title,
    subtitle: year,
    body: overview ?? [title, year].filter(Boolean).join(" · "),
    url: `https://www.themoviedb.org/movie/${id}`,
    tags: [],
    metadata: {
      year,
      status: "unwatched",
      tmdbRating: rating,
      source: "TMDB",
      sourceId: id,
    },
  };
}

function sourceLabel(kind: ReferenceLookupKind) {
  return kind === "book" ? "Open Library" : "TMDB";
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function objectValue(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberOrString(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function isLookupCandidate(
  value: ReferenceLookupCandidate | null,
): value is ReferenceLookupCandidate {
  return Boolean(value);
}
