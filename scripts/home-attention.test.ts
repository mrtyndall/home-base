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
      href: "/#pending-captures",
      label: "12 captures to sort",
      detail: "Captures",
    },
    {
      href: "/#needs-review",
      label: "4 reviews waiting",
      detail: "Reviews",
    },
    {
      href: "/projects",
      label: "1 project needs a look",
      detail: "Projects",
    },
  ],
);
