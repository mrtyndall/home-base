import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const projectForm = readFileSync("src/app/projects/new/page.tsx", "utf8");
const areaPage = readFileSync("src/app/areas/[areaId]/page.tsx", "utf8");

assert.match(projectForm, /searchParams:\s*Promise<\{\s*areaId\?/, "Project creation must accept an optional Area query.");
assert.match(projectForm, /prisma\.area\.findFirst/, "A supplied Area must be validated server-side.");
assert.match(projectForm, /where:\s*\{\s*id:\s*requestedAreaId,\s*status:\s*"active"/, "Only active query-supplied Areas may be locked.");
assert.match(projectForm, /type="hidden"\s+name="areaId"/, "A valid scoped Area must be submitted as fixed context.");
assert.match(projectForm, /Create in/, "A scoped Project form must name its fixed Area context.");
assert.match(projectForm, /<select[\s\S]{0,180}name="areaId"[\s\S]{0,180}required/, "Global Project creation must require Area selection.");
assert.match(projectForm, /href="\/areas\/new"/, "An empty Project form must direct people to create an Area.");
assert.match(areaPage, /href=\{`\/projects\/new\?areaId=\$\{area\.id\}`\}/, "Area pages must pass their Area ID into Project creation.");
assert.doesNotMatch(projectForm, /prisma\.domain|\bdomains\b/, "Project creation must query Areas directly.");

