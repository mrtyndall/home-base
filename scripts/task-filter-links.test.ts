import assert from "node:assert/strict";
import {
  buildTasksFilterHref,
  normalizeFilterValues,
  toggleFilterValue,
} from "../src/lib/task-filter-links";

assert.deepEqual(normalizeFilterValues(["b", "a", "b"], ["a", "b", "c"]), [
  "b",
  "a",
]);
assert.deepEqual(normalizeFilterValues("missing", ["a"]), []);

assert.deepEqual(toggleFilterValue(["home"], "hobbies"), ["home", "hobbies"]);
assert.deepEqual(toggleFilterValue(["home", "hobbies"], "home"), ["hobbies"]);

assert.equal(
  buildTasksFilterHref({
    domains: ["home", "hobbies"],
    projects: ["radio"],
    section: "tomorrow",
  }),
  "/tasks?domain=home&domain=hobbies&project=radio&section=tomorrow",
);

assert.equal(
  buildTasksFilterHref({ domains: [], projects: [], section: "all" }),
  "/tasks",
);
