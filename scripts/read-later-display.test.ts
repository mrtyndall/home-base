import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AreaPicker } from "../src/components/area-picker";
import {
  buildReadLaterAreaContext,
  readLaterFilingPath,
} from "../src/lib/read-later-display";

const areas = [
  { id: "root", name: "Old root", parentAreaId: null, sortOrder: 0, status: "retired", isSystem: false },
  { id: "branch", name: "Parked branch", parentAreaId: "root", sortOrder: 0, status: "parked", isSystem: false },
  { id: "leaf", name: "Active leaf", parentAreaId: "branch", sortOrder: 0, status: "active", isSystem: false },
  { id: "system", name: "System", parentAreaId: null, sortOrder: 0, status: "active", isSystem: true },
] as const;

test("display paths retain inactive ancestors while choices expose only active Areas", () => {
  const context = buildReadLaterAreaContext(areas);

  assert.equal(context.pathById.get("leaf"), "Old root / Parked branch / Active leaf");
  assert.equal(context.pathById.get("branch"), "Old root / Parked branch");
  assert.deepEqual(context.activeOptions, [
    { id: "leaf", name: "Active leaf", path: "Old root / Parked branch / Active leaf", depth: 2 },
  ]);
  assert.equal(context.pathById.has("system"), false);
});

test("Project display uses the Project Area even when the mirrored Reference Area is absent", () => {
  const { pathById } = buildReadLaterAreaContext(areas);

  assert.equal(
    readLaterFilingPath(
      { areaId: null, project: { name: "Build station", areaId: "leaf" } },
      pathById,
    ),
    "Old root / Parked branch / Active leaf / Build station",
  );
  assert.equal(
    readLaterFilingPath(
      { areaId: null, project: { name: "Unsorted project", areaId: null } },
      pathById,
    ),
    "No area yet / Unsorted project",
  );
});

test("AreaPicker can show active choices with paths built through inactive ancestors", () => {
  const markup = renderToStaticMarkup(createElement(AreaPicker, {
    areas,
    selectableAreaIds: ["leaf"],
  }));

  assert.match(markup, /Old root \/ Parked branch \/ Active leaf/);
  assert.doesNotMatch(markup, /value="root"/);
  assert.doesNotMatch(markup, /value="branch"/);
});
