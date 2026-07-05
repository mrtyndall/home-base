export type HomeAttentionInput = {
  pendingCaptureCount: number;
  reviewDueCount: number;
  slippingProjectCount: number;
};

export type HomeAttentionItem = {
  href: string;
  label: string;
  detail: string;
};

export function getHomeAttentionItems({
  pendingCaptureCount,
  reviewDueCount,
  slippingProjectCount,
}: HomeAttentionInput): HomeAttentionItem[] {
  const items: HomeAttentionItem[] = [];

  if (pendingCaptureCount > 0) {
    items.push({
      href: "/areas/area_inbox",
      label: `${pendingCaptureCount} capture${pendingCaptureCount === 1 ? "" : "s"} to sort`,
      detail: "Inbox",
    });
  }

  if (reviewDueCount > 0) {
    items.push({
      href: "/areas/area_inbox",
      label: `${reviewDueCount} review${reviewDueCount === 1 ? "" : "s"} waiting`,
      detail: "Inbox",
    });
  }

  if (slippingProjectCount > 0) {
    items.push({
      href: "/projects",
      label: `${slippingProjectCount} project${slippingProjectCount === 1 ? "" : "s"} needs a look`,
      detail: "Projects",
    });
  }

  return items;
}
