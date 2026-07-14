import { lookup as dnsLookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";

export type ReadLaterPageMetadata = {
  title?: string;
  description?: string;
  siteName?: string;
};

export type MetadataAddress = { address: string; family: 4 | 6 };

export type MetadataResponse = {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: AsyncIterable<Uint8Array>;
  cancel(): void;
};

export type MetadataDependencies = {
  resolve(hostname: string): Promise<MetadataAddress[]>;
  request(url: URL, address: MetadataAddress, timeoutMs?: number): Promise<MetadataResponse>;
};

const TIMEOUT_MS = 3_000;
const MAX_HTML_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const SPECIAL_SUFFIXES = [".localhost", ".local", ".internal", ".home", ".lan", ".onion"];

function ipv4Number(address: string) {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((octets[0] * 256 + octets[1]) * 256 + octets[2]) * 256 + octets[3]) >>> 0;
}

function ipv6Number(address: string) {
  const value = address.split("%")[0].toLowerCase();
  const lastColon = value.lastIndexOf(":");
  let normalized = value;
  if (value.includes(".")) {
    const ipv4 = ipv4Number(value.slice(lastColon + 1));
    if (ipv4 === null) return null;
    normalized = `${value.slice(0, lastColon)}:${(ipv4 >>> 16).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }
  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null;
  const pieces = [...left, ...Array(missing).fill("0"), ...right];
  if (pieces.length !== 8 || pieces.some((piece) => !/^[0-9a-f]{1,4}$/.test(piece))) return null;
  return pieces.reduce(
    (result, piece) => (result << BigInt(16)) | BigInt(`0x${piece}`),
    BigInt(0),
  );
}

function inCidr(value: bigint, base: bigint, bits: number, totalBits: number) {
  const shift = BigInt(totalBits - bits);
  return value >> shift === base >> shift;
}

function ipv4InCidr(address: number, base: string, bits: number) {
  const baseValue = ipv4Number(base);
  return baseValue !== null && inCidr(BigInt(address), BigInt(baseValue), bits, 32);
}

function ipv6InCidr(address: bigint, base: string, bits: number) {
  const baseValue = ipv6Number(base);
  return baseValue !== null && inCidr(address, baseValue, bits, 128);
}

export function isPublicMetadataAddress(address: string) {
  const family = isIP(address);
  if (family === 4) {
    const value = ipv4Number(address);
    if (value === null) return false;
    const denied: Array<[string, number]> = [
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
      ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
      ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
      ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
    ];
    return !denied.some(([base, bits]) => ipv4InCidr(value, base, bits));
  }
  if (family !== 6) return false;
  const value = ipv6Number(address);
  if (value === null) return false;
  if (ipv6InCidr(value, "::ffff:0:0", 96) || ipv6InCidr(value, "64:ff9b::", 96)) {
    const mapped = Number(value & BigInt("0xffffffff"));
    return isPublicMetadataAddress([mapped >>> 24, (mapped >>> 16) & 255, (mapped >>> 8) & 255, mapped & 255].join("."));
  }
  const denied: Array<[string, number]> = [
    ["::", 96], ["100::", 64], ["64:ff9b:1::", 48], ["2001::", 23],
    ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20], ["5f00::", 16],
    ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
  ];
  return !denied.some(([base, bits]) => ipv6InCidr(value, base, bits));
}

function hostnameOf(url: URL) {
  return url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
}

function assertAllowedHost(hostname: string) {
  if (!hostname || hostname === "localhost" || SPECIAL_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw new Error("Metadata host is not allowed.");
  }
  if (!isIP(hostname) && !hostname.includes(".")) throw new Error("Metadata host is not allowed.");
}

async function defaultResolve(hostname: string): Promise<MetadataAddress[]> {
  if (isIP(hostname)) return [{ address: hostname, family: isIP(hostname) as 4 | 6 }];
  const results = await dnsLookup(hostname, { all: true, verbatim: true });
  return results.map(({ address, family }) => ({ address, family: family as 4 | 6 }));
}

export function createPinnedLookup(hostname: string, address: MetadataAddress) {
  return ((requestedHostname: string, options: { all?: boolean }, callback: (
    error: NodeJS.ErrnoException | null,
    result?: string | Array<{ address: string; family: number }>,
    family?: number,
  ) => void) => {
    if (requestedHostname.toLowerCase() !== hostname.toLowerCase()) {
      callback(Object.assign(new Error("Pinned metadata hostname changed."), { code: "EPERM" }));
    } else if (options?.all) {
      callback(null, [address]);
    } else {
      callback(null, address.address, address.family);
    }
  }) as LookupFunction;
}

async function defaultRequest(url: URL, address: MetadataAddress, timeoutMs = TIMEOUT_MS): Promise<MetadataResponse> {
  const transport = url.protocol === "https:" ? https : http;
  const hostname = hostnameOf(url);
  return new Promise((resolve, reject) => {
    const request = transport.request(url, {
      method: "GET",
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "HomeBase-ReadLater/1.0" },
      lookup: createPinnedLookup(hostname, address),
      ...(url.protocol === "https:" && !isIP(hostname) ? { servername: hostname } : {}),
    }, (response) => resolve({
      statusCode: response.statusCode ?? 0,
      headers: response.headers,
      body: response,
      cancel: () => response.destroy(),
    }));
    request.setTimeout(Math.max(1, timeoutMs), () => request.destroy(new Error("Metadata request timed out.")));
    request.once("error", reject);
    request.end();
  });
}

const DEFAULT_DEPENDENCIES: MetadataDependencies = { resolve: defaultResolve, request: defaultRequest };

function header(headers: MetadataResponse["headers"], name: string) {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function decodeHtml(value: string) {
  return value.replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ").trim();
}

function findMeta(html: string, attribute: string, value: string) {
  const escaped = value.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
  const first = new RegExp(`<meta\\s+[^>]*${attribute}=["']${escaped}["'][^>]*content=["']([^"']*)["'][^>]*>`, "i").exec(html)?.[1];
  if (first) return decodeHtml(first);
  return decodeHtml(new RegExp(`<meta\\s+[^>]*content=["']([^"']*)["'][^>]*${attribute}=["']${escaped}["'][^>]*>`, "i").exec(html)?.[1] ?? "") || undefined;
}

function parseMetadata(html: string): ReadLaterPageMetadata {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return {
    title: findMeta(html, "property", "og:title") ?? (title ? decodeHtml(title) : undefined),
    description: findMeta(html, "property", "og:description") ?? findMeta(html, "name", "description"),
    siteName: findMeta(html, "property", "og:site_name"),
  };
}

async function readBoundedHtml(response: MetadataResponse) {
  if (Number(header(response.headers, "content-length") ?? 0) > MAX_HTML_BYTES) {
    response.cancel();
    throw new Error("Metadata response is too large.");
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.byteLength;
    if (total > MAX_HTML_BYTES) {
      response.cancel();
      throw new Error("Metadata response is too large.");
    }
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export async function fetchReadLaterMetadata(rawUrl: string, dependencies: MetadataDependencies = DEFAULT_DEPENDENCIES) {
  const deadline = Date.now() + TIMEOUT_MS;
  let url = new URL(rawUrl);
  for (let redirects = 0; ; redirects += 1) {
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      throw new Error("Metadata URL is not allowed.");
    }
    const hostname = hostnameOf(url);
    assertAllowedHost(hostname);
    const addresses = await dependencies.resolve(hostname);
    if (!addresses.length || addresses.some(({ address }) => !isPublicMetadataAddress(address))) {
      throw new Error("Metadata host is not allowed.");
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Metadata request timed out.");
    const response = await dependencies.request(url, addresses[0], remaining);
    if (response.statusCode >= 300 && response.statusCode < 400) {
      const location = header(response.headers, "location");
      response.cancel();
      if (!location) throw new Error("Metadata redirect has no location.");
      if (redirects >= MAX_REDIRECTS) throw new Error("Metadata redirected too many times.");
      url = new URL(location, url);
      continue;
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      response.cancel();
      throw new Error("Metadata request failed.");
    }
    if (!(header(response.headers, "content-type") ?? "").toLowerCase().includes("text/html")) {
      response.cancel();
      return {};
    }
    return parseMetadata(await readBoundedHtml(response));
  }
}
