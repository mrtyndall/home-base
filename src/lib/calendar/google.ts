import { Prisma, type CalendarEvent } from "@prisma/client";
import { google, type calendar_v3 } from "googleapis";
import crypto from "node:crypto";
import { APP_TIMEZONE } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { logCalendarInteractions } from "@/lib/people";

const GOOGLE_SYNC_ID = "google-primary";
const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
];
const INITIAL_SYNC_PAST_DAYS = 365;

type SyncResult = {
  status: "ok" | "not_configured" | "failed";
  pushed: number;
  pulled: number;
  cancelled: number;
  skipped: number;
  fullSync: boolean;
  error?: string;
};

type GoogleCalendarConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  calendarId: string;
};

type EncryptedSecret = {
  ciphertext: string;
  iv: string;
  tag: string;
};

export function getGoogleOAuthStartUrl() {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: GOOGLE_CALENDAR_SCOPES,
    state: signOAuthState(),
  });
}

export async function exchangeGoogleOAuthCode(code: string, state: string) {
  verifyOAuthState(state);
  assertTokenEncryptionConfigured();

  const config = getGoogleCalendarConfig();
  const client = getOAuthClient(config);
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Re-authorize with consent after revoking the old grant.",
    );
  }

  const encrypted = encryptSecret(tokens.refresh_token);
  await prisma.calendarOAuthToken.upsert({
    where: { id: GOOGLE_SYNC_ID },
    update: {
      calendarId: config.calendarId,
      refreshTokenCiphertext: encrypted.ciphertext,
      refreshTokenIv: encrypted.iv,
      refreshTokenTag: encrypted.tag,
      scope: tokens.scope ?? GOOGLE_CALENDAR_SCOPES.join(" "),
      tokenType: tokens.token_type ?? "Bearer",
      expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    },
    create: {
      id: GOOGLE_SYNC_ID,
      provider: "google",
      calendarId: config.calendarId,
      refreshTokenCiphertext: encrypted.ciphertext,
      refreshTokenIv: encrypted.iv,
      refreshTokenTag: encrypted.tag,
      scope: tokens.scope ?? GOOGLE_CALENDAR_SCOPES.join(" "),
      tokenType: tokens.token_type ?? "Bearer",
      expiryDate: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    },
  });

  await prisma.calendarSyncState.upsert({
    where: { id: GOOGLE_SYNC_ID },
    update: {
      provider: "google",
      calendarId: config.calendarId,
      status: "stale",
      error: null,
    },
    create: {
      id: GOOGLE_SYNC_ID,
      provider: "google",
      calendarId: config.calendarId,
      status: "stale",
    },
  });

  await prisma.notification.create({
    data: {
      type: "google_calendar_connected",
      title: "Google Calendar connected",
      body: "OAuth completed. Calendar sync is ready to run.",
      sourceRef: {
        type: "calendar_sync",
        id: GOOGLE_SYNC_ID,
      },
    },
  });

  return { calendarId: config.calendarId };
}

export async function syncGoogleCalendar(options: { forceFull?: boolean } = {}) {
  if (!isGoogleCalendarEnvConfigured()) {
    return markSyncNotConfigured("Google Calendar environment variables are missing.");
  }

  const token = await prisma.calendarOAuthToken.findUnique({
    where: { id: GOOGLE_SYNC_ID },
  });
  if (!token) {
    return markSyncNotConfigured("Google Calendar OAuth has not been completed.");
  }

  const startedAt = new Date();
  try {
    const config = getGoogleCalendarConfig();
    const client = getOAuthClient(config);
    client.setCredentials({
      refresh_token: decryptSecret({
        ciphertext: token.refreshTokenCiphertext,
        iv: token.refreshTokenIv,
        tag: token.refreshTokenTag,
      }),
    });

    const calendar = google.calendar({ version: "v3", auth: client });
    const calendarId = token.calendarId || config.calendarId;
    const pushed = await pushLocalEvents(calendar, calendarId);
    const pulled = await pullGoogleEvents(calendar, calendarId, {
      forceFull: options.forceFull,
    });

    // Derived, zero-entry: synced events with attendees matching known
    // people log interactions. Failure here must not fail the sync.
    await logCalendarInteractions().catch(() => 0);

    await prisma.calendarSyncState.upsert({
      where: { id: GOOGLE_SYNC_ID },
      update: {
        provider: "google",
        calendarId,
        syncToken: pulled.nextSyncToken,
        lastSyncedAt: startedAt,
        lastSuccessfulSyncAt: startedAt,
        status: "ok",
        error: null,
      },
      create: {
        id: GOOGLE_SYNC_ID,
        provider: "google",
        calendarId,
        syncToken: pulled.nextSyncToken,
        lastSyncedAt: startedAt,
        lastSuccessfulSyncAt: startedAt,
        status: "ok",
      },
    });

    return {
      status: "ok",
      pushed: pushed.pushed,
      pulled: pulled.pulled,
      cancelled: pulled.cancelled,
      skipped: pushed.skipped,
      fullSync: pulled.fullSync,
    } satisfies SyncResult;
  } catch (error) {
    const message = sanitizeError(error);
    await prisma.calendarSyncState.upsert({
      where: { id: GOOGLE_SYNC_ID },
      update: {
        lastSyncedAt: startedAt,
        status: "failed",
        error: message,
      },
      create: {
        id: GOOGLE_SYNC_ID,
        provider: "google",
        calendarId: token.calendarId,
        lastSyncedAt: startedAt,
        status: "failed",
        error: message,
      },
    });

    return {
      status: "failed",
      pushed: 0,
      pulled: 0,
      cancelled: 0,
      skipped: 0,
      fullSync: Boolean(options.forceFull),
      error: message,
    } satisfies SyncResult;
  }
}

function getOAuthClient(config = getGoogleCalendarConfig()) {
  return new google.auth.OAuth2(
    config.clientId,
    config.clientSecret,
    config.redirectUri,
  );
}

function getGoogleCalendarConfig(): GoogleCalendarConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  const calendarId = process.env.GOOGLE_CALENDAR_ID ?? "primary";

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Google Calendar is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI.",
    );
  }

  return { clientId, clientSecret, redirectUri, calendarId };
}

function isGoogleCalendarEnvConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI &&
      process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,
  );
}

async function markSyncNotConfigured(error: string): Promise<SyncResult> {
  await prisma.calendarSyncState.upsert({
    where: { id: GOOGLE_SYNC_ID },
    update: { status: "not_configured", error },
    create: {
      id: GOOGLE_SYNC_ID,
      provider: "google",
      calendarId: process.env.GOOGLE_CALENDAR_ID ?? "primary",
      status: "not_configured",
      error,
    },
  });

  return {
    status: "not_configured",
    pushed: 0,
    pulled: 0,
    cancelled: 0,
    skipped: 0,
    fullSync: false,
    error,
  };
}

async function pushLocalEvents(
  calendar: calendar_v3.Calendar,
  calendarId: string,
) {
  const events = await prisma.calendarEvent.findMany({
    where: {
      source: { in: ["capture", "manual", "api"] },
      status: { not: "cancelled" },
      lastPushedAt: null,
    },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  let pushed = 0;
  let skipped = 0;
  for (const event of events) {
    if (
      event.googleEventId &&
      event.googleUpdatedAt &&
      event.googleUpdatedAt > event.updatedAt
    ) {
      skipped += 1;
      continue;
    }

    const requestBody = toGoogleEventBody(event);
    const response = event.googleEventId
      ? await calendar.events.update({
          calendarId,
          eventId: event.googleEventId,
          requestBody,
        })
      : await calendar.events.insert({
          calendarId,
          requestBody,
        });

    await prisma.calendarEvent.update({
      where: { id: event.id },
      data: googleMetadataFromEvent(response.data, calendarId, {
        lastPushedAt: new Date(),
        syncedAt: new Date(),
      }),
    });
    pushed += 1;
  }

  return { pushed, skipped };
}

async function pullGoogleEvents(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  options: { forceFull?: boolean },
) {
  const state = await prisma.calendarSyncState.findUnique({
    where: { id: GOOGLE_SYNC_ID },
  });
  let syncToken = options.forceFull ? null : state?.syncToken;
  let fullSync = !syncToken;
  let pulled = 0;
  let cancelled = 0;

  if (options.forceFull) {
    await cancelExistingGoogleEvents(calendarId);
  }

  for (;;) {
    try {
      const result = await pullGoogleEventPages(calendar, calendarId, syncToken);
      pulled += result.pulled;
      cancelled += result.cancelled;
      return {
        nextSyncToken: result.nextSyncToken,
        pulled,
        cancelled,
        fullSync,
      };
    } catch (error) {
      if (!isGoneError(error) || !syncToken) {
        throw error;
      }

      await cancelExistingGoogleEvents(calendarId);
      syncToken = null;
      fullSync = true;
    }
  }
}

async function pullGoogleEventPages(
  calendar: calendar_v3.Calendar,
  calendarId: string,
  syncToken: string | null | undefined,
) {
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  let pulled = 0;
  let cancelled = 0;

  do {
    const response = await calendar.events.list({
      calendarId,
      maxResults: 2500,
      pageToken,
      showDeleted: true,
      singleEvents: true,
      ...(syncToken
        ? { syncToken }
        : { timeMin: initialSyncTimeMin().toISOString() }),
    });

    for (const event of response.data.items ?? []) {
      const result = await upsertGoogleEvent(event, calendarId);
      if (result === "cancelled") {
        cancelled += 1;
      } else if (result === "pulled") {
        pulled += 1;
      }
    }

    pageToken = response.data.nextPageToken ?? undefined;
    nextSyncToken = response.data.nextSyncToken ?? nextSyncToken;
  } while (pageToken);

  if (!nextSyncToken) {
    throw new Error("Google Calendar did not return a next sync token.");
  }

  return { nextSyncToken, pulled, cancelled };
}

async function upsertGoogleEvent(
  event: calendar_v3.Schema$Event,
  calendarId: string,
) {
  if (!event.id) return "skipped";

  const now = new Date();
  const googleUpdatedAt = event.updated ? new Date(event.updated) : now;

  if (event.status === "cancelled") {
    const existing = await prisma.calendarEvent.findUnique({
      where: { googleEventId: event.id },
    });
    if (!existing) return "cancelled";

    await prisma.calendarEvent.update({
      where: { id: existing.id },
      data: {
        status: "cancelled",
        googleCalendarId: calendarId,
        googleEtag: event.etag ?? existing.googleEtag,
        googleUpdatedAt,
        syncedAt: now,
        lastPulledAt: now,
      },
    });
    return "cancelled";
  }

  const start = parseGoogleDate(event.start);
  const end = parseGoogleDate(event.end);
  if (!start || !end) return "skipped";

  const existing = await prisma.calendarEvent.findUnique({
    where: { googleEventId: event.id },
  });
  const data = {
    title: event.summary?.trim() || "(Untitled)",
    start,
    end,
    location: event.location ?? null,
    status: event.status ?? "confirmed",
    attendees: event.attendees
      ? (event.attendees.map((attendee) => ({
          email: attendee.email ?? null,
          displayName: attendee.displayName ?? null,
          responseStatus: attendee.responseStatus ?? null,
        })) as Prisma.InputJsonValue)
      : Prisma.JsonNull,
    googleCalendarId: calendarId,
    googleEtag: event.etag ?? null,
    googleUpdatedAt,
    syncedAt: now,
    lastPulledAt: now,
  } satisfies Prisma.CalendarEventUpdateInput;

  if (existing) {
    await prisma.calendarEvent.update({
      where: { id: existing.id },
      data,
    });
    return "pulled";
  }

  await prisma.calendarEvent.create({
    data: {
      ...data,
      googleEventId: event.id,
      source: "google",
    },
  });
  return "pulled";
}

async function cancelExistingGoogleEvents(calendarId: string) {
  await prisma.calendarEvent.updateMany({
    where: {
      source: "google",
      googleCalendarId: calendarId,
      status: { not: "cancelled" },
    },
    data: {
      status: "cancelled",
      syncedAt: new Date(),
      lastPulledAt: new Date(),
    },
  });
}

function toGoogleEventBody(event: CalendarEvent): calendar_v3.Schema$Event {
  return {
    summary: event.title,
    location: event.location ?? undefined,
    status: normalizeGoogleStatus(event.status),
    start: {
      dateTime: event.start.toISOString(),
      timeZone: APP_TIMEZONE,
    },
    end: {
      dateTime: event.end.toISOString(),
      timeZone: APP_TIMEZONE,
    },
    extendedProperties: {
      private: {
        homeBaseId: event.id,
        homeBaseSource: event.source,
      },
    },
  };
}

function googleMetadataFromEvent(
  event: calendar_v3.Schema$Event,
  calendarId: string,
  extra: Pick<Prisma.CalendarEventUpdateInput, "lastPushedAt" | "syncedAt">,
) {
  return {
    googleEventId: event.id,
    googleCalendarId: calendarId,
    googleEtag: event.etag ?? null,
    googleUpdatedAt: event.updated ? new Date(event.updated) : new Date(),
    ...extra,
  } satisfies Prisma.CalendarEventUpdateInput;
}

function parseGoogleDate(value?: calendar_v3.Schema$EventDateTime) {
  if (!value) return null;
  if (value.dateTime) return new Date(value.dateTime);
  if (value.date) return new Date(`${value.date}T00:00:00.000Z`);
  return null;
}

function normalizeGoogleStatus(status: string) {
  return ["confirmed", "tentative", "cancelled"].includes(status)
    ? status
    : "confirmed";
}

function initialSyncTimeMin() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - INITIAL_SYNC_PAST_DAYS);
  return date;
}

function signOAuthState() {
  const payload = Buffer.from(
    JSON.stringify({
      nonce: crypto.randomUUID(),
      createdAt: Date.now(),
    }),
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", getOAuthStateSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function verifyOAuthState(state: string) {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) {
    throw new Error("Google OAuth state is invalid.");
  }

  const expected = crypto
    .createHmac("sha256", getOAuthStateSecret())
    .update(payload)
    .digest("base64url");
  if (
    !crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    )
  ) {
    throw new Error("Google OAuth state does not match.");
  }

  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    createdAt?: number;
  };
  if (!decoded.createdAt || Date.now() - decoded.createdAt > 15 * 60_000) {
    throw new Error("Google OAuth state has expired.");
  }
}

function getOAuthStateSecret() {
  const secret =
    process.env.GOOGLE_OAUTH_STATE_SECRET ??
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "Google OAuth state secret is missing. Set GOOGLE_OAUTH_STATE_SECRET or GOOGLE_TOKEN_ENCRYPTION_KEY.",
    );
  }

  return secret;
}

function assertTokenEncryptionConfigured() {
  if (!process.env.GOOGLE_TOKEN_ENCRYPTION_KEY) {
    throw new Error(
      "GOOGLE_TOKEN_ENCRYPTION_KEY is required before completing Google OAuth.",
    );
  }
}

function encryptSecret(value: string): EncryptedSecret {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: ciphertext.toString("base64url"),
    iv: iv.toString("base64url"),
    tag: tag.toString("base64url"),
  };
}

function decryptSecret(value: EncryptedSecret) {
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(value.iv, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(value.tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function getEncryptionKey() {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY is required.");
  }

  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) {
    return decoded;
  }

  return crypto.createHash("sha256").update(raw).digest();
}

function isGoneError(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const maybe = error as { code?: number; response?: { status?: number } };
  return maybe.code === 410 || maybe.response?.status === 410;
}

function sanitizeError(error: unknown) {
  if (error instanceof Error) {
    return error.message.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer <redacted>");
  }

  return "Google Calendar sync failed.";
}
