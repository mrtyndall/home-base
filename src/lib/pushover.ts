export function isPushoverConfigured() {
  return Boolean(
    process.env.PUSHOVER_APP_TOKEN && process.env.PUSHOVER_USER_KEY,
  );
}

export async function sendPushoverMessage(title: string, message: string) {
  const token = process.env.PUSHOVER_APP_TOKEN;
  const user = process.env.PUSHOVER_USER_KEY;
  if (!token || !user) {
    return { ok: false as const, reason: "Pushover is not configured." };
  }

  const response = await fetch("https://api.pushover.net/1/messages.json", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token, user, title, message }),
  });

  if (!response.ok) {
    return {
      ok: false as const,
      reason: `Pushover returned HTTP ${response.status}.`,
    };
  }

  return { ok: true as const };
}
