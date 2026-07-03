import assert from "node:assert/strict";
import { getTaskDragPreviewPosition } from "../src/lib/task-drag-preview";

assert.deepEqual(getTaskDragPreviewPosition(100, 200), {
  left: 112,
  top: 212,
});

assert.deepEqual(getTaskDragPreviewPosition(4, 8), {
  left: 16,
  top: 20,
});
