import Link from "next/link";
import type React from "react";
import { Bell, CalendarDays, KeyRound, ServerCog, type LucideIcon } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatShortDate, formatTime } from "@/lib/dates";
import { SetupNotice } from "@/components/setup-notice";
import { PushoverTestButton } from "@/components/settings/pushover-test-button";
import { ApiKeyRevokeButton } from "@/components/settings/api-key-revoke-button";
import { McpHealthCheck } from "@/components/settings/mcp-health-check";
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
// Sync runs on a 15-minute cron; four missed windows means something is wrong.
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

  const { calendarSync, calendarConnected, apiKeys, lastReminderSentAt } = result;
  const googleMissing = GOOGLE_ENV_VARS.filter((name) => !process.env[name]);
  const pushoverMissing = PUSHOVER_ENV_VARS.filter((name) => !process.env[name]);
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
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-normal">Settings</h1>
      </header>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-stone-800">Integrations</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <IntegrationCard
            icon={CalendarDays}
            title="Google Calendar"
            status={google.status}
            tone={google.tone}
          >
            <p className="text-sm text-stone-600">{google.detail}</p>
            {calendarSync?.lastSyncedAt ? (
              <p className="text-sm text-stone-600">
                Last sync attempt {formatShortDate(calendarSync.lastSyncedAt)} at{" "}
                {formatTime(calendarSync.lastSyncedAt)}.
              </p>
            ) : null}
            {calendarSync?.status === "failed" && calendarSync.error ? (
              <p className="text-sm text-red-700">{calendarSync.error}</p>
            ) : null}
            {googleMissing.length > 0 ? (
              <MissingVariables names={googleMissing} />
            ) : null}
            <div className="space-y-1">
              <p className="text-xs font-medium text-stone-500">
                Authorized redirect URI (Google Cloud Console)
              </p>
              <p className="break-all rounded-md bg-stone-50 px-2 py-1.5 font-mono text-xs text-stone-700">
                {REQUIRED_REDIRECT_URI}
              </p>
              {redirectUriMismatch ? (
                <p className="text-xs text-amber-700">
                  GOOGLE_REDIRECT_URI is set to a different value than the URI above.
                </p>
              ) : null}
            </div>
            {googleMissing.length === 0 && !calendarConnected ? (
              <Link
                href="/api/google/oauth/start"
                className="inline-flex h-9 items-center rounded-md bg-teal-700 px-3 text-sm font-medium text-white transition hover:bg-teal-800"
              >
                Connect Google Calendar
              </Link>
            ) : null}
          </IntegrationCard>

          <IntegrationCard
            icon={Bell}
            title="Pushover"
            status={pushoverMissing.length === 0 ? "Configured" : "Missing variables"}
            tone={pushoverMissing.length === 0 ? "good" : "attention"}
          >
            {pushoverMissing.length === 0 ? (
              <>
                <p className="text-sm text-stone-600">
                  Reminder delivery credentials are present.
                  {lastReminderSentAt
                    ? ` Last reminder sent ${formatShortDate(lastReminderSentAt)} at ${formatTime(lastReminderSentAt)}.`
                    : " No reminders have been delivered yet."}
                </p>
                <PushoverTestButton />
              </>
            ) : (
              <>
                <p className="text-sm text-stone-600">
                  Add the missing variables to Railway variables (or the local env) to
                  enable reminder delivery. Values live in 1Password, never in the repo.
                </p>
                <MissingVariables names={pushoverMissing} />
              </>
            )}
          </IntegrationCard>

          <IntegrationCard
            icon={KeyRound}
            title="API access"
            status={`${activeKeys.length} active ${activeKeys.length === 1 ? "key" : "keys"}`}
            tone={activeKeys.length > 0 ? "good" : "neutral"}
            className="md:col-span-2"
          >
            {apiKeys.length > 0 ? (
              <ul className="divide-y divide-stone-100">
                {apiKeys.map((key) => (
                  <li
                    key={key.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-stone-800">
                        {key.label}
                        {key.revokedAt ? (
                          <span className="ml-2 text-xs font-normal text-stone-500">
                            revoked {formatShortDate(key.revokedAt)}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-xs text-stone-500">
                        {normalizeScopes(key.scopes).join(", ") || "no scopes"} ·{" "}
                        {key.rateLimit}/hr writes ·{" "}
                        {key.lastUsedAt
                          ? `last used ${formatShortDate(key.lastUsedAt)} at ${formatTime(key.lastUsedAt)}`
                          : "never used"}
                      </p>
                    </div>
                    {!key.revokedAt ? <ApiKeyRevokeButton keyId={key.id} /> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-stone-600">No API keys are registered.</p>
            )}
            <div className="space-y-1 border-t border-stone-100 pt-3">
              <p className="text-sm text-stone-600">
                New keys are created from the command line so the token itself never
                passes through this page. Set <code className="font-mono text-xs">HOME_BASE_API_TOKEN</code>{" "}
                from 1Password, then run:
              </p>
              <p className="break-all rounded-md bg-stone-50 px-2 py-1.5 font-mono text-xs text-stone-700">
                npm run api:key:register -- &lt;label&gt; read,write,capture [rateLimit]
              </p>
              <p className="text-xs text-stone-500">
                Only the token hash is stored. Keys are revoked, never deleted.
              </p>
            </div>
          </IntegrationCard>

          <IntegrationCard
            icon={ServerCog}
            title="MCP server"
            status="Local / Tailscale"
            tone="neutral"
            className="md:col-span-2"
          >
            <p className="text-sm text-stone-600">
              The MCP server wraps the REST API over streamable HTTP and runs beside
              the local runtime, separate from the web app.
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

function IntegrationCard({
  icon: Icon,
  title,
  status,
  tone,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  status: string;
  tone: StatusTone;
  className?: string;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "good"
      ? "text-teal-700"
      : tone === "attention"
        ? "text-amber-700"
        : "text-stone-500";

  return (
    <article className={`rounded-lg border border-stone-200 bg-white p-4 ${className ?? ""}`}>
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-teal-50 text-teal-700">
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold">{title}</h3>
            <p className={`text-sm font-medium ${toneClass}`}>{status}</p>
          </div>
          <div className="mt-2 space-y-3">{children}</div>
        </div>
      </div>
    </article>
  );
}

function MissingVariables({ names }: { names: readonly string[] }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-stone-500">Missing variables</p>
      <ul className="space-y-0.5">
        {names.map((name) => (
          <li key={name} className="font-mono text-xs text-amber-700">
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function McpRoute({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
      <dt className="w-20 shrink-0 text-xs font-medium text-stone-500">{label}</dt>
      <dd className="break-all font-mono text-xs text-stone-700">{value}</dd>
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
      detail: "Credentials are present. Connect the Google account to start sync.",
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
    const [calendarSync, calendarToken, apiKeys, lastReminder] = await Promise.all([
      prisma.calendarSyncState.findUnique({ where: { id: "google-primary" } }),
      prisma.calendarOAuthToken.findUnique({ where: { id: "google-primary" } }),
      prisma.apiKey.findMany({
        orderBy: [{ revokedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
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
