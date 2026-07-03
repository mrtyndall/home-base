export function getTodayActionLabel(todayCount: number) {
  if (todayCount === 0) return "Open Today";
  return `Handle ${todayCount} ${todayCount === 1 ? "item" : "items"}`;
}

export function getInboxActionLabel(pendingCaptureCount: number) {
  if (pendingCaptureCount === 0) return "Open Inbox";
  return `Sort ${pendingCaptureCount} ${
    pendingCaptureCount === 1 ? "capture" : "captures"
  }`;
}

export function getTasksActionLabel(todayTaskCount: number, tomorrowTaskCount: number) {
  if (todayTaskCount > 0) return "Plan today";
  if (tomorrowTaskCount > 0) return "Review tomorrow";
  return "Open Tasks";
}
