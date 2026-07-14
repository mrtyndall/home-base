import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const projectForm = readFileSync("src/app/projects/new/page.tsx", "utf8");
const areaPage = readFileSync("src/app/areas/[areaId]/page.tsx", "utf8");

assert.match(projectForm, /searchParams:\s*Promise<\{\s*areaId\?/, "Project creation must accept an optional Area query.");
assert.match(projectForm, /prisma\.area\.findFirst/, "A supplied Area must be validated server-side.");
assert.match(projectForm, /where:\s*\{\s*id:\s*requestedAreaId,\s*status:\s*"active"/, "Only active query-supplied Areas may be locked.");
assert.match(projectForm, /lockedAreaId=\{scopedArea\?\.id\}/, "A valid scoped Area must be submitted as fixed context.");
assert.match(projectForm, /Create in/, "A scoped Project form must name its fixed Area context.");
assert.match(projectForm, /<AreaPicker/, "Global Project creation must offer the hierarchy-aware Area picker.");
assert.match(projectForm, /href="\/areas\/new"/, "An empty Project form may direct people to create an Area without blocking creation.");
assert.match(areaPage, /href=\{`\/projects\/new\?areaId=\$\{area\.id\}`\}/, "Area pages must pass their Area ID into Project creation.");
assert.doesNotMatch(projectForm, /prisma\.domain|\bdomains\b/, "Project creation must query Areas directly.");

const actions = readFileSync("src/app/actions.ts", "utf8");
const projectDetail = readFileSync("src/app/projects/[projectId]/page.tsx", "utf8");
const createProjectBody = actions.slice(
  actions.indexOf("export async function createProject"),
  actions.indexOf("export async function createArea"),
);
assert.match(createProjectBody, /isSystem:\s*false/, "Forged Project posts must reject system Areas.");
assert.match(
  projectDetail,
  /href="\/projects"[\s\S]{0,300}<ArrowLeft[^>]*\/>\s*Areas/,
  "Project detail must breadcrumb back to the Areas index with Area-first wording.",
);
assert.doesNotMatch(
  projectDetail,
  /href="\/projects"[\s\S]{0,300}<ArrowLeft[^>]*\/>\s*Projects/,
  "Project detail must not label the Area-first index as Projects.",
);
