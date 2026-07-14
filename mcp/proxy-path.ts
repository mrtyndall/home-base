export function apiPath(base: string, ...segments: string[]) {
  if (!/^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/i.test(base)) {
    throw new Error("Invalid static API path.");
  }
  const encoded = segments.map((segment) => {
    if (
      typeof segment !== "string" ||
      segment.trim().length === 0 ||
      segment.includes("..") ||
      /[/?#\\]/.test(segment)
    ) {
      throw new Error("Invalid API path segment.");
    }
    return encodeURIComponent(segment);
  });
  return encoded.length > 0 ? `${base}/${encoded.join("/")}` : base;
}
