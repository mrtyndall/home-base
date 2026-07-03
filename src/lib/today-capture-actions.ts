type CaptureAction = {
  label: string;
  tone: "primary" | "secondary";
};

export function getRecentCaptureAction(
  createdItems: unknown,
  parseStatus: string | null,
): CaptureAction {
  const item = getLatestActionableItem(createdItems);

  if (!item || item.type === "pending_capture" || parseStatus !== "parsed") {
    return { label: "Sort", tone: "primary" };
  }

  if (item.type === "task") return { label: "Open task", tone: "secondary" };
  if (item.type === "project") return { label: "Open project", tone: "secondary" };
  if (item.type === "idea") return { label: "Open ideas", tone: "secondary" };

  return { label: "Find", tone: "secondary" };
}

function getLatestActionableItem(createdItems: unknown) {
  const items = Array.isArray(createdItems) ? createdItems : [];
  const typedItems = items.filter(isCreatedItem);
  const filedItems = typedItems.filter((item) => item.type !== "pending_capture");
  return filedItems[filedItems.length - 1] ?? typedItems[typedItems.length - 1] ?? null;
}

function isCreatedItem(
  item: unknown,
): item is { type: string; id: string; label: string } {
  return (
    typeof item === "object" &&
    item !== null &&
    "type" in item &&
    typeof item.type === "string" &&
    "id" in item &&
    typeof item.id === "string" &&
    "label" in item &&
    typeof item.label === "string"
  );
}
