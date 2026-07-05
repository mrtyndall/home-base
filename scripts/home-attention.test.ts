import assert from "node:assert/strict";
import { getHomeAttentionItems } from "../src/lib/home-attention";

assert.deepEqual(
  getHomeAttentionItems({
    pendingCaptureCount: 0,
    reviewDueCount: 0,
    slippingProjectCount: 0,
  }),
  [],
);

assert.deepEqual(
  getHomeAttentionItems({
    pendingCaptureCount: 12,
    reviewDueCount: 4,
    slippingProjectCount: 1,
  }),
  [
    {
      href: "/areas/area_inbox",
      label: "12 captures to sort",
      detail: "Inbox",
    },
    {
      href: "/areas/area_inbox",
      label: "4 reviews waiting",
      detail: "Inbox",
    },
    {
      href: "/projects",
      label: "1 project needs a look",
      detail: "Projects",
    },
  ],
);
