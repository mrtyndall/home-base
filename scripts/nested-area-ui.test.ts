import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AreaPicker } from "../src/components/area-picker";

const pickerPath = "src/components/area-picker.tsx";
const picker = existsSync(pickerPath) ? readFileSync(pickerPath, "utf8") : "";
const projects = readFileSync("src/app/projects/page.tsx", "utf8");
const newProject = readFileSync("src/app/projects/new/page.tsx", "utf8");
const newArea = readFileSync("src/app/areas/new/page.tsx", "utf8");
const areaDetail = readFileSync("src/app/areas/[areaId]/page.tsx", "utf8");
const projectDetail = readFileSync("src/app/projects/[projectId]/page.tsx", "utf8");
const actions = readFileSync("src/app/actions.ts", "utf8");

assert.ok(existsSync(pickerPath), "AreaPicker must be a reusable component.");
assert.match(picker, /flattenAreaOptions/, "AreaPicker must render flattened hierarchy options.");
assert.match(picker, /option\.path/, "AreaPicker must label nested choices with their full path.");
assert.match(picker, />\s*No area yet\s*</, "A nullable AreaPicker must lead with No area yet.");
assert.match(picker, /min-h-11|h-11/, "AreaPicker controls must preserve a 44px mobile target.");

assert.match(projects, /buildAreaTree/, "The Areas index must render the Area hierarchy.");
assert.match(projects, /depth/, "The Areas index must visually distinguish nested depth.");
assert.doesNotMatch(
  projects,
  /Math\.min\(depth, 3\)[\s\S]{0,240}paddingInlineStart/,
  "Nested rows must not cumulatively apply their absolute depth as padding.",
);
assert.match(
  projects,
  /depth > 0 && depth <= 3 \? 12 : 0/,
  "Recursive indentation must add at most three 12px steps globally.",
);
assert.doesNotMatch(
  projects,
  /className="space-y-3 border-l[^"]*pl-/,
  "Nested containers must not add uncapped padding beyond the three depth steps.",
);
assert.match(areaDetail, /areaPath/, "Area detail must expose its hierarchy breadcrumb.");
assert.match(areaDetail, /excludedAreaIds/, "Area reparenting must exclude the current Area and descendants.");
assert.match(areaDetail, /action=\{updateAreaParent\}/, "Area detail must offer reparenting.");

assert.match(newProject, /<AreaPicker/, "Global Project creation must use the hierarchy picker.");
assert.match(newProject, /defaultAreaId=\{scopedArea\?\.id\}/, "Area-scoped creation must preselect its Area.");
assert.doesNotMatch(newProject, /lockedAreaId=/, "Area-scoped creation must still allow No area yet or another Area.");
assert.doesNotMatch(newProject, /Projects need an Area/, "Global Project creation must work without any Areas.");
assert.doesNotMatch(newProject, /name="areaId"[\s\S]{0,200}required/, "A global Project may remain unfiled.");
assert.doesNotMatch(
  actions.slice(actions.indexOf("export async function createProject"), actions.indexOf("export async function createArea")),
  /if \(!name \|\| !areaId\) return/,
  "createProject must not reject a blank Area.",
);

assert.match(projectDetail, /No area yet/, "An unfiled Project must show its quiet path state.");
assert.match(projectDetail, /action=\{updateProjectArea\}/, "Project detail must allow filing or moving the Project.");
assert.match(actions, /export async function updateAreaParent/, "Area reparenting needs a server action.");
assert.match(actions, /export async function updateProjectArea/, "Project filing needs a server action.");
const updateAreaParentBody = actions.slice(
  actions.indexOf("export async function updateAreaParent"),
  actions.indexOf("export async function updateProjectArea"),
);
assert.match(
  updateAreaParentBody,
  /revalidatePath\("\/areas\/\[areaId\]", "page"\)/,
  "Reparenting must invalidate descendant Area detail consumers.",
);
assert.match(
  updateAreaParentBody,
  /revalidatePath\("\/projects\/\[projectId\]", "page"\)/,
  "Reparenting must invalidate affected Project breadcrumb consumers.",
);

for (const [source, label] of [
  [newProject, "Project creation"],
  [newArea, "Area creation"],
] as const) {
  assert.doesNotMatch(source, /className="[^"]*\bh-(?:9|10)\b[^"]*"/, `${label} primary controls must be at least 44px.`);
}
assert.match(projects, /href="\/projects\/new"[\s\S]{0,220}\bh-11\b/, "The global New project control must be 44px.");
assert.match(projects, /href="\/areas\/new"[\s\S]{0,220}\bh-11\b/, "The global New area control must be 44px.");

for (const [source, label] of [
  [areaDetail, "Area"],
  [projectDetail, "Project"],
] as const) {
  assert.match(source, /aria-label="(?:Area|Project) path"[^>]*\bmin-w-0\b/, `${label} breadcrumb must permit flex shrink.`);
  assert.match(source, /aria-label="(?:Area|Project) path"[\s\S]{0,1000}overflow-wrap:anywhere/, `${label} breadcrumb names must wrap unbroken text.`);
}

const pickerMarkup = renderToStaticMarkup(createElement(AreaPicker, {
  areas: [
    { id: "hobbies", name: "Hobbies", parentAreaId: null, sortOrder: 1 },
    { id: "radio", name: "Ham Radio", parentAreaId: "hobbies", sortOrder: 1 },
  ],
}));
assert.ok(
  pickerMarkup.indexOf("No area yet") < pickerMarkup.indexOf("Hobbies"),
  "The rendered nullable picker must place No area yet before Area choices.",
);
assert.match(
  pickerMarkup,
  /Hobbies \/ Ham Radio/,
  "The rendered picker must show full paths for nested Areas.",
);
