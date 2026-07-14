import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const areasIndex = readFileSync("src/app/projects/page.tsx", "utf8");
const areaPage = readFileSync("src/app/areas/[areaId]/page.tsx", "utf8");
const actions = readFileSync("src/app/actions.ts", "utf8");
const nav = readFileSync("src/components/nav-tabs.tsx", "utf8");
const newAreaPath = "src/app/areas/new/page.tsx";

assert.ok(existsSync(newAreaPath), "Areas must have a dedicated creation route.");

const newAreaPage = existsSync(newAreaPath)
  ? readFileSync(newAreaPath, "utf8")
  : "";

assert.match(areasIndex, /href="\/areas\/new"/, "Areas index must expose New area.");
assert.match(areasIndex, />\s*New area\s*</, "The Area action must use the New area label.");
assert.match(areasIndex, /href="\/projects\/new"/, "Areas index must retain global New project.");
assert.match(areasIndex, /Create your first area/, "An empty Areas shelf must guide first-time setup.");
assert.match(newAreaPage, /action=\{createArea\}/, "The Area form must call createArea.");
assert.match(newAreaPage, /name="name"[\s\S]{0,120}required/, "Area name must be required.");
assert.doesNotMatch(newAreaPage, /name="(?:domain|description|status|sortOrder)"/, "Area creation must only ask for a name.");
assert.match(actions, /export async function createArea\(formData: FormData\)/, "Area creation must have a server action.");
assert.match(actions, /createCompatibleArea/, "Area creation must use the expand-schema compatibility helper.");
assert.match(actions, /redirect\(`\/areas\/\$\{area\.id\}`\)/, "Area creation must open the new Area.");
assert.match(areaPage, /href=\{`\/projects\/new\?areaId=\$\{area\.id\}`\}/, "Area pages must expose scoped Project creation.");
assert.equal(nav.includes('label: "Projects"'), false, "Primary navigation must name the Areas destination Areas.");
assert.equal(nav.includes('label: "Areas"'), true, "Primary navigation must expose Areas.");

const uiSource = [areasIndex, areaPage, newAreaPage, nav].join("\n");
assert.doesNotMatch(uiSource, /\/domains\//, "Area-first UI must not link to Domain pages.");
assert.doesNotMatch(uiSource, />\s*Domain(?:s)?\s*</, "Area-first UI must not show Domain labels.");
