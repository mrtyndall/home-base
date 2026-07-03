"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export type SettingsActionResult = {
  status: "idle" | "sent" | "failed";
  message: string;
};

export async function sendPushoverTest(): Promise<SettingsActionResult> {
  const token = process.env.PUSHOVER_APP_TOKEN;
  const user = process.env.PUSHOVER_USER_KEY;
  if (!token || !user) {
    return {
      status: "failed",
      message: "Pushover credentials are not configured on this server.",
    };
  }

  let ok = false;
  let detail: string | undefined;
  try {
    const response = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token,
        user,
        title: "Home Base test",
        message: "Test notification sent from Settings.",
      }),
    });
    ok = response.ok;
    if (!ok) {
      detail = `Pushover returned HTTP ${response.status}.`;
    }
  } catch (error) {
    detail = error instanceof Error ? error.message : "Pushover request failed.";
  }

  await prisma.notification.create({
    data: {
      type: ok ? "pushover_test_sent" : "pushover_test_failed",
      title: ok ? "Test notification sent" : "Test notification failed",
      body: ok
        ? "Pushover accepted the test message from Settings."
        : detail ?? "Pushover request failed.",
      sourceRef: { type: "settings_pushover_test" },
    },
  });

  return ok
    ? { status: "sent", message: "Test notification sent. Check your device." }
    : { status: "failed", message: detail ?? "Pushover request failed." };
}

export async function revokeApiKey(formData: FormData) {
  const keyId = formData.get("keyId");
  if (typeof keyId !== "string" || keyId.length === 0) {
    return;
  }

  const key = await prisma.apiKey.findUnique({ where: { id: keyId } });
  if (!key || key.revokedAt) {
    return;
  }

  await prisma.apiKey.update({
    where: { id: key.id },
    data: { revokedAt: new Date() },
  });

  await prisma.notification.create({
    data: {
      type: "api_key_revoked",
      title: "API key revoked",
      body: `The "${key.label}" key can no longer authenticate.`,
      sourceRef: { type: "api_key", id: key.id },
    },
  });

  revalidatePath("/settings");
}
