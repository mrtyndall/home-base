import {
  exchangeGoogleOAuthCode,
  syncGoogleCalendar,
} from "@/lib/calendar/google";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (error) {
    return html("Google Calendar Authorization Failed", [
      "Google returned an authorization error.",
      error,
    ], 400);
  }

  if (!code || !state) {
    return html("Google Calendar Authorization Failed", [
      "The callback did not include the expected authorization code and state.",
    ], 400);
  }

  try {
    const { calendarId } = await exchangeGoogleOAuthCode(code, state);
    const sync = await syncGoogleCalendar({ forceFull: true });

    return html("Google Calendar Connected", [
      `Calendar ${calendarId} is connected.`,
      sync.status === "ok"
        ? `Initial sync completed: ${sync.pulled} pulled, ${sync.pushed} pushed.`
        : `OAuth completed, but initial sync needs attention: ${sync.error ?? sync.status}.`,
      "You can close this tab.",
    ]);
  } catch (callbackError) {
    return html("Google Calendar Authorization Failed", [
      callbackError instanceof Error
        ? callbackError.message
        : "Google OAuth callback failed.",
    ], 500);
  }
}

function html(title: string, lines: string[], status = 200) {
  const safeTitle = escapeHtml(title);
  const body = lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("");

  return new Response(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 3rem; max-width: 42rem; color: #1c1917; background: #fafaf9; }
    main { border: 1px solid #d6d3d1; border-radius: 8px; background: white; padding: 1.25rem; }
    h1 { font-size: 1.4rem; margin: 0 0 1rem; }
    p { line-height: 1.5; }
  </style>
</head>
<body>
  <main>
    <h1>${safeTitle}</h1>
    ${body}
  </main>
</body>
</html>`,
    {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    },
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
