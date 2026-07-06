import Link from "next/link";
import type React from "react";
import { prisma } from "@/lib/db";
import { formatShortDate, formatTime } from "@/lib/dates";
import { SetupNotice } from "@/components/setup-notice";
import { PushoverTestButton } from "@/components/settings/pushover-test-button";
import { ApiKeyRevokeButton } from "@/components/settings/api-key-revoke-button";
import { McpHealthCheck } from "@/components/settings/mcp-health-check";
import { CopyLine } from "@/components/settings/copy-line";
import { normalizeScopes } from "@/lib/api/auth";

export const dynamic = "force-dynamic";

const REQUIRED_REDIRECT_URI =
  "https://home-base-production-e3b7.up.railway.app/api/google/oauth/callback";
const GOOGLE_ENV_VARS = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
  "GOOGLE_TOKEN_ENCRYPTION_KEY",
] as const;
const PUSHOVER_ENV_VARS = ["PUSHOVER_APP_TOKEN", "PUSHOVER_USER_KEY"] as const;
const TMDB_ENV_VARS = ["TMDB_ACCESS_TOKEN", "TMDB_API_KEY"] as const;
const BOOKLORE_ENV_VARS = ["BOOKLORE_BASE_URL", "BOOKLORE_TOKEN"] as const;
// Sync runs on a 15-minute cron; four skipped windows means something is wrong.
const SYNC_STALE_AFTER_MS = 60 * 60_000;

type StatusTone = "good" | "neutral" | "attention";

export default async function SettingsPage() {
  if (!process.env.DATABASE_URL) {
    return <SetupNotice reason="DATABASE_URL is not configured." />;
  }

  const result = await loadSettings();
  if (!result.ok) {
    return <SetupNotice reason="Database is not migrated or reachable." />;
  }

  const { calendarSync, calendarConnected, apiKeys, lastReminderSentAt } =
    result;
  const googleMissing = GOOGLE_ENV_VARS.filter((name) => !process.env[name]);
  const pushoverMissing = PUSHOVER_ENV_VARS.filter(
    (name) => !process.env[name],
  );
  const tmdbConfigured = TMDB_ENV_VARS.some((name) => Boolean(process.env[name]));
  const tmdbMissing = tmdbConfigured ? [] : TMDB_ENV_VARS;
  const bookLoreMissing = BOOKLORE_ENV_VARS.filter(
    (name) => !process.env[name],
  );
  const bookLoreConfigured = bookLoreMissing.length === 0;
  const redirectUriMismatch = Boolean(
    process.env.GOOGLE_REDIRECT_URI &&
    process.env.GOOGLE_REDIRECT_URI !== REQUIRED_REDIRECT_URI,
  );
  const google = describeGoogleStatus({
    missingCount: googleMissing.length,
    connected: calendarConnected,
    syncStatus: calendarSync?.status ?? null,
    lastSuccessfulSyncAt: calendarSync?.lastSuccessfulSyncAt ?? null,
  });
  const activeKeys = apiKeys.filter((key) => !key.revokedAt);

  return (
    <div className="min-w-0 max-w-2xl space-y-5 pb-12">
      <header>
        <h1 className="font-serif text-[30px] font-medium tracking-[-0.01em] text-stone-950">
          Settings
        </h1>
      </header>

      <section className="space-y-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
          Integrations
        </h2>
        <div className="grid gap-3">
          <IntegrationCard
            title="Google Calendar"
            status={google.status}
            tone={google.tone}
          >
            <p className="text-[13px] text-stone-600">{google.detail}</p>
            {calendarSync?.lastSyncedAt ? (
              <p className="text-[13px] text-stone-600">
                Last sync attempt {formatShortDate(calendarSync.lastSyncedAt)}{" "}
                at {formatTime(calendarSync.lastSyncedAt)}.
              </p>
            ) : null}
            {calendarSync?.status === "failed" && calendarSync.error ? (
              <p className="text-[13px] text-amber-800">{calendarSync.error}</p>
            ) : null}
            {googleMissing.length > 0 ? (
              <MissingVariables names={googleMissing} />
            ) : null}
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9AA096]">
                Redirect URI (Google Cloud Console)
              </p>
              <CopyLine value={REQUIRED_REDIRECT_URI} />
              {redirectUriMismatch ? (
                <p className="text-xs text-amber-800">
                  GOOGLE_REDIRECT_URI is set to a different value than the URI
                  above.
                </p>
              ) : null}
            </div>
            {googleMissing.length === 0 && !calendarConnected ? (
              <Link
                href="/api/google/oauth/start"
                className="inline-flex h-9 items-center rounded-full bg-teal-700 px-4 text-sm font-medium text-white transition hover:bg-teal-800"
              >
                Connect Google Calendar
              </Link>
            ) : null}
          </IntegrationCard>

          <IntegrationCard
            title="Pushover"
            status={
              pushoverMissing.length === 0 ? "Configured" : "Missing variables"
            }
            tone={pushoverMissing.length === 0 ? "good" : "attention"}
          >
            {pushoverMissing.length === 0 ? (
              <>
                <p className="text-[13px] text-stone-600">
                  Reminder delivery credentials are present.
                  {lastReminderSentAt
                    ? ` Last reminder sent ${formatShortDate(lastReminderSentAt)} at ${formatTime(lastReminderSentAt)}.`
                    : " No reminders have been delivered yet."}
                </p>
                <PushoverTestButton />
              </>
            ) : (
              <>
                <p className="text-[13px] text-stone-600">
                  Add the missing variables to Railway variables (or the local
                  env) to enable reminder delivery. Values live in 1Password,
                  never in the repo.
                </p>
                <MissingVariables names={pushoverMissing} />
              </>
            )}
          </IntegrationCard>

          <IntegrationCard
            title="Reference lookup"
            status={
              tmdbConfigured ? "Books and movies ready" : "Movie lookup missing"
            }
            tone={tmdbConfigured ? "good" : "attention"}
          >
            <div className="grid min-w-0 gap-2 sm:grid-cols-2">
              <ProviderStatus
                label="Books"
                status={
                  bookLoreConfigured ? "BookLore + Open Library" : "Open Library"
                }
                tone="good"
                detail={
                  bookLoreConfigured
                    ? "Book search can join your BookLore library and fill gaps from Open Library."
                    : "Book search uses Open Library. Add BookLore variables to join your homelab library."
                }
                href="/ideas/books"
                hrefLabel="Open books"
              />
              <ProviderStatus
                label="Movies"
                status={tmdbConfigured ? "TMDB configured" : "TMDB missing"}
                tone={tmdbConfigured ? "good" : "attention"}
                detail={
                  tmdbConfigured
                    ? "Movie search can use TMDB metadata from the Library."
                    : "Add one TMDB credential to Railway variables (or the local env) to enable movie search."
                }
                href="/ideas/movies"
                hrefLabel="Open movies"
              />
            </div>
            {!bookLoreConfigured ? (
              <div className="min-w-0 space-y-1.5 border-t border-[#EEF1EC] pt-3">
                <p className="text-xs text-[#9AA096]">
                  BookLore needs both variables. Values live in 1Password,
                  never in the repo.
                </p>
                <MissingVariables names={bookLoreMissing} />
              </div>
            ) : null}
            {!tmdbConfigured ? (
              <div className="min-w-0 space-y-1.5 border-t border-[#EEF1EC] pt-3">
                <p className="text-xs text-[#9AA096]">
                  Either variable enables TMDB lookup. Values live in
                  1Password, never in the repo.
                </p>
                <MissingVariables names={tmdbMissing} />
              </div>
            ) : null}
          </IntegrationCard>

          <IntegrationCard
            title="API access"
            status={`${activeKeys.length} active ${activeKeys.length === 1 ? "key" : "keys"}`}
            tone={activeKeys.length > 0 ? "good" : "neutral"}
          >
            {apiKeys.length > 0 ? (
              <ul className="divide-y divide-[#EEF1EC]">
                {apiKeys.map((key) => (
                  <li
                    key={key.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-stone-800">
                        {key.label}
                        {key.revokedAt ? (
                          <span className="ml-2 text-xs font-normal text-[#B0ACA2]">
                            revoked {formatShortDate(key.revokedAt)}
                          </span>
                        ) : null}
                      </p>
                      <p className="break-words text-xs text-[#9AA096]">
                        {normalizeScopes(key.scopes).join(", ") || "no scopes"}{" "}
                        · {key.rateLimit}/hr writes ·{" "}
                        {key.lastUsedAt
                          ? `last used ${formatShortDate(key.lastUsedAt)} at ${formatTime(key.lastUsedAt)}`
                          : "never used"}
                      </p>
                    </div>
                    {!key.revokedAt ? (
                      <ApiKeyRevokeButton keyId={key.id} />
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-stone-600">
                No API keys are registered.
              </p>
            )}
            <div className="min-w-0 space-y-1 border-t border-[#EEF1EC] pt-3">
              <p className="text-[13px] text-stone-600">
                New keys are created from the command line so the token itself
                never passes through this page. Set{" "}
                <code className="font-mono text-xs">HOME_BASE_API_TOKEN</code>{" "}
                from 1Password, then run:
              </p>
              <CopyLine value="npm run api:key:register -- <label> read,write,capture [rateLimit]" />
              <p className="text-xs text-[#9AA096]">
                Only the token hash is stored. Keys are revoked, never deleted.
              </p>
            </div>
          </IntegrationCard>

          <IntegrationCard
            title="MCP server"
            status="Local / Tailscale"
            tone="neutral"
          >
            <p className="text-[13px] text-stone-600">
              The MCP server wraps the REST API over streamable HTTP and runs
              beside the local runtime, separate from the web app.
            </p>
            <dl className="space-y-1.5">
              <McpRoute label="Local" value="http://127.0.0.1:8081/api/mcp" />
              <McpRoute
                label="Tailscale"
                value="https://mac-studio.tail3baa7a.ts.net:8443/api/mcp"
              />
            </dl>
            <McpHealthCheck />
          </IntegrationCard>
        </div>
      </section>
    </div>
  );
}

function ProviderStatus({
  label,
  status,
  tone,
  detail,
  href,
  hrefLabel,
}: {
  label: string;
  status: string;
  tone: StatusTone;
  detail: string;
  href: string;
  hrefLabel: string;
}) {
  const toneText = tone === "attention" ? "text-amber-800" : "text-stone-600";

  return (
    <div className="min-w-0 rounded-[12px] border border-[#EEF1EC] bg-[#FBFCFA] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium text-stone-900">{label}</p>
        <p className={`text-xs font-medium ${toneText}`}>{status}</p>
      </div>
      <p className="mt-1 text-[13px] text-stone-600">{detail}</p>
      <Link
        href={href}
        className="mt-2 inline-flex text-[13px] font-medium text-teal-800 hover:text-teal-950"
      >
        {hrefLabel}
      </Link>
    </div>
  );
}

function IntegrationCard({
  title,
  status,
  tone,
  children,
}: {
  title: string;
  status: string;
  tone: StatusTone;
  children: React.ReactNode;
}) {
  const toneDot =
    tone === "good"
      ? "h-1.5 w-1.5 rounded-full bg-teal-700"
      : tone === "attention"
        ? "h-1.5 w-1.5 rounded-full bg-amber-600"
        : "h-1.5 w-1.5 rounded-full border border-[#C9CFC5]";
  const toneText =
    tone === "good"
      ? "text-stone-600"
      : tone === "attention"
        ? "text-amber-800"
        : "text-stone-500";

  return (
    <article className="min-w-0 overflow-hidden rounded-[14px] border border-[#E2E6DF] bg-white p-3.5 sm:p-4">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-1.5 sm:gap-2">
        <h3 className="text-[15px] font-medium text-stone-950">{title}</h3>
        <p
          className={`inline-flex min-w-0 items-center gap-1.5 text-[12px] font-medium sm:text-[13px] ${toneText}`}
        >
          <span className={`inline-block ${toneDot}`} aria-hidden="true" />
          <span className="min-w-0 break-words">{status}</span>
        </p>
      </div>
      <div className="mt-2.5 min-w-0 space-y-3 [&_p]:break-words">
        {children}
      </div>
    </article>
  );
}

function MissingVariables({ names }: { names: readonly string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {names.map((name) => (
        <span
          key={name}
          className="rounded-[8px] bg-[#F7F9F5] px-2 py-1 font-mono text-[11px] text-stone-600"
        >
          {name}
        </span>
      ))}
    </div>
  );
}

function McpRoute({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9AA096]">
        {label}
      </dt>
      <dd>
        <CopyLine value={value} />
      </dd>
    </div>
  );
}

function describeGoogleStatus({
  missingCount,
  connected,
  syncStatus,
  lastSuccessfulSyncAt,
}: {
  missingCount: number;
  connected: boolean;
  syncStatus: "ok" | "stale" | "failed" | "not_configured" | null;
  lastSuccessfulSyncAt: Date | null;
}): { status: string; tone: StatusTone; detail: string } {
  if (missingCount > 0) {
    return {
      status: "Missing variables",
      tone: "attention",
      detail:
        "Add the variables below to Railway variables (values from 1Password), then connect the account.",
    };
  }

  if (!connected) {
    return {
      status: "Ready to connect",
      tone: "neutral",
      detail:
        "Credentials are present. Connect the Google account to start sync.",
    };
  }

  if (syncStatus === "failed") {
    return {
      status: "Sync failing",
      tone: "attention",
      detail: "The account is connected but the last sync attempt failed.",
    };
  }

  if (!lastSuccessfulSyncAt) {
    return {
      status: "First sync pending",
      tone: "neutral",
      detail:
        "The account is connected. The scheduled sync runs every 15 minutes; nothing syncs on page load.",
    };
  }

  if (Date.now() - lastSuccessfulSyncAt.getTime() > SYNC_STALE_AFTER_MS) {
    return {
      status: "Sync stale",
      tone: "attention",
      detail: `Connected, but the last successful sync was ${formatShortDate(lastSuccessfulSyncAt)} at ${formatTime(lastSuccessfulSyncAt)}. The 15-minute scheduler may not be running.`,
    };
  }

  return {
    status: "Connected",
    tone: "good",
    detail: `Syncing normally. Last successful sync ${formatShortDate(lastSuccessfulSyncAt)} at ${formatTime(lastSuccessfulSyncAt)}.`,
  };
}

async function loadSettings() {
  try {
    const [calendarSync, calendarToken, apiKeys, lastReminder] =
      await Promise.all([
        prisma.calendarSyncState.findUnique({
          where: { id: "google-primary" },
        }),
        prisma.calendarOAuthToken.findUnique({
          where: { id: "google-primary" },
        }),
        prisma.apiKey.findMany({
          orderBy: [
            { revokedAt: { sort: "asc", nulls: "first" } },
            { createdAt: "desc" },
          ],
        }),
        prisma.reminderDelivery.findFirst({
          where: { deliveryStatus: "sent" },
          orderBy: { sentAt: "desc" },
          select: { sentAt: true },
        }),
      ]);

    return {
      ok: true as const,
      calendarSync,
      calendarConnected: Boolean(calendarToken),
      apiKeys,
      lastReminderSentAt: lastReminder?.sentAt ?? null,
    };
  } catch {
    return { ok: false as const };
  }
}
