type CaptureAction = {
  label: string;
  tone: "primary" | "secondary";
};

type CaptureItem = {
  type: string;
  id: string;
  label: string;
};

type CaptureHrefSource = {
  rawText: string;
  createdItems: unknown;
};

export function getRecentCaptureAction(
  createdItems: unknown,
  parseStatus: string | null,
): CaptureAction {
  const item = getLatestActionableItem(createdItems);
  const type = item ? normalizeCaptureItemType(item) : null;

  if (!item || type === "pending_capture" || parseStatus !== "parsed") {
    return { label: "Sort", tone: "primary" };
  }

  if (type === "task") return { label: "Open task", tone: "secondary" };
  if (type === "project") return { label: "Open project", tone: "secondary" };
  if (type === "idea") return { label: "Open ideas", tone: "secondary" };
  if (type === "entity_note") return { label: "Open note", tone: "secondary" };
  if (type === "reference") return { label: "Open reference", tone: "secondary" };

  return { label: "Open", tone: "secondary" };
}

export function getRecentCaptureHref(capture: CaptureHrefSource) {
  const item = getLatestActionableItem(capture.createdItems);
  if (!item) return "/areas/area_inbox";

  const type = normalizeCaptureItemType(item);
  if (type === "task") return `/tasks/${item.id}`;
  if (type === "project") return `/projects/${item.id}`;
  if (type === "idea") return "/ideas";
  if (type === "pending_capture") return "/areas/area_inbox";
  return `/search?q=${encodeURIComponent(capture.rawText)}`;
}

function getLatestActionableItem(createdItems: unknown) {
  const items = Array.isArray(createdItems) ? createdItems : [];
  const typedItems = items.filter(isCreatedItem);
  const filedItems = typedItems.filter(
    (item) => normalizeCaptureItemType(item) !== "pending_capture",
  );
  return filedItems[filedItems.length - 1] ?? typedItems[typedItems.length - 1] ?? null;
}

function normalizeCaptureItemType(item: CaptureItem) {
  if (item.type === "task" || /^task\b/i.test(item.label)) return "task";
  if (item.type === "project" || /^project\b/i.test(item.label)) return "project";
  if (item.type === "idea" || /^idea\b/i.test(item.label)) return "idea";
  if (
    item.type === "entity_note" ||
    item.type === "idea_note" ||
    /^note\b/i.test(item.label)
  ) {
    return "entity_note";
  }
  if (item.type === "reference" || /^reference\b/i.test(item.label)) {
    return "reference";
  }
  if (item.type === "pending_capture") return "pending_capture";
  return item.type;
}

function isCreatedItem(
  item: unknown,
): item is CaptureItem {
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
