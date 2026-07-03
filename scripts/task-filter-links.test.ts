import assert from "node:assert/strict";
import {
  buildTasksFilterHref,
  normalizeFilterValues,
  normalizeStarredFilter,
  normalizeTaskView,
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

assert.equal(normalizeTaskView(undefined), "schedule");
assert.equal(normalizeTaskView("done"), "done");
assert.equal(normalizeTaskView(["open", "done"]), "open");
assert.equal(normalizeTaskView("bogus"), "schedule");

assert.equal(normalizeStarredFilter(undefined), false);
assert.equal(normalizeStarredFilter("1"), true);
assert.equal(normalizeStarredFilter("true"), true);
assert.equal(normalizeStarredFilter("0"), false);

assert.equal(
  buildTasksFilterHref({
    domains: ["home"],
    projects: [],
    section: "all",
    starred: true,
    view: "open",
  }),
  "/tasks?domain=home&starred=1&view=open",
);

assert.equal(
  buildTasksFilterHref({
    domains: [],
    projects: [],
    section: "all",
    starred: false,
    view: "schedule",
  }),
  "/tasks",
);
