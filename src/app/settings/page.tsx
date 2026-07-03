import Link from "next/link";
import type React from "react";
import { Bell, CalendarDays, KeyRound, ServerCog, type LucideIcon } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatShortDate, formatTime } from "@/lib/dates";
import { SetupNotice } from "@/components/setup-notice";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!process.env.DATABASE_URL) {
    return <SetupNotice reason="DATABASE_URL is not configured." />;
  }

  const result = await loadSettings();
  if (!result.ok) {
    return <SetupNotice reason="Database is not migrated or reachable." />;
  }

  const { calendarSync, apiKeyCount } = result;
  const googleEnvReady = Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI &&
      process.env.ENCRYPTION_KEY,
  );
  const pushoverReady = Boolean(
    process.env.PUSHOVER_APP_TOKEN && process.env.PUSHOVER_USER_KEY,
  );

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
            status={googleEnvReady ? calendarSync?.status ?? "ready" : "Needs setup"}
            detail={
              calendarSync?.lastSyncedAt
                ? `Last synced ${formatShortDate(calendarSync.lastSyncedAt)} at ${formatTime(calendarSync.lastSyncedAt)}.`
                : googleEnvReady
                  ? "Credentials are present. Connect the Google account to start sync."
                  : "Add Google OAuth and encryption variables in Railway, then connect the account."
            }
            action={
              googleEnvReady ? (
                <Link
                  href="/api/google/oauth/start"
                  className="inline-flex h-9 items-center rounded-md bg-teal-700 px-3 text-sm font-medium text-white transition hover:bg-teal-800"
                >
                  Connect calendar
                </Link>
              ) : null
            }
          />
          <IntegrationCard
            icon={Bell}
            title="Pushover"
            status={pushoverReady ? "Ready" : "Needs setup"}
            detail={
              pushoverReady
                ? "Reminder delivery credentials are configured."
                : "Add Pushover app token and user key in Railway variables."
            }
          />
          <IntegrationCard
            icon={KeyRound}
            title="API access"
            status={`${apiKeyCount} active ${apiKeyCount === 1 ? "key" : "keys"}`}
            detail="Agent access uses scoped bearer tokens. Keys are managed from the command line for now."
          />
          <IntegrationCard
            icon={ServerCog}
            title="MCP server"
            status="Local / Tailscale"
            detail="The MCP server wraps the API and is exposed separately from the web app."
          />
        </div>
      </section>
    </div>
  );
}

function IntegrationCard({
  icon: Icon,
  title,
  status,
  detail,
  action,
}: {
  icon: LucideIcon;
  title: string;
  status: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <article className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-teal-50 text-teal-700">
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm font-medium text-stone-500">{status}</p>
          </div>
          <p className="mt-2 text-sm text-stone-600">{detail}</p>
          {action ? <div className="mt-3">{action}</div> : null}
        </div>
      </div>
    </article>
  );
}

async function loadSettings() {
  try {
    const [calendarSync, apiKeyCount] = await Promise.all([
      prisma.calendarSyncState.findUnique({ where: { id: "google-primary" } }),
      prisma.apiKey.count({ where: { revokedAt: null } }),
    ]);

    return { ok: true as const, calendarSync, apiKeyCount };
  } catch {
    return { ok: false as const };
  }
}
