type CaptureReviewState = {
  status: string;
  parseStatus: string | null;
  createdItems: unknown;
};

export function isActionableCapture(capture: CaptureReviewState) {
  if (capture.status !== "active") return false;

  if (
    capture.parseStatus === null ||
    capture.parseStatus === "ambiguous" ||
    capture.parseStatus === "failed"
  ) {
    return true;
  }

  return Array.isArray(capture.createdItems)
    ? capture.createdItems.some(isPendingCaptureItem)
    : false;
}

function isPendingCaptureItem(item: unknown) {
  return (
    typeof item === "object" &&
    item !== null &&
    "type" in item &&
    item.type === "pending_capture"
  );
}
