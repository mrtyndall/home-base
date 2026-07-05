import type { CheckInSource } from "@prisma/client";

export function checkInSourceLabel(
  source: CheckInSource,
  captureId?: string | null,
) {
  if (captureId) {
    return source === "voice" ? "Voice capture" : "Capture";
  }

  switch (source) {
    case "ai_draft":
      return "Generated draft";
    case "ai_draft_edited":
      return "Edited generated draft";
    case "voice":
      return "Voice";
    case "manual":
    default:
      return "Manual";
  }
}
