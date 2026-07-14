import assert from "node:assert/strict";
import fs from "node:fs";

const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
const migrationPath =
  "prisma/migrations/20260713235900_area_first_expand/migration.sql";
const migration = fs.existsSync(migrationPath)
  ? fs.readFileSync(migrationPath, "utf8")
  : "";
const verifierPath = "scripts/verify-area-first-migration.ts";
const verifier = fs.existsSync(verifierPath)
  ? fs.readFileSync(verifierPath, "utf8")
  : "";
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

const model = (name: string) => {
  const match = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, `Expected model ${name} to exist`);
  return match[1];
};

assert.equal(/\bmodel\s+Domain\s+\{/.test(schema), false, "Domain must leave the Prisma application model");
assert.equal(/\bdomainId\b/.test(model("Area")), false, "Area.domainId must leave the Prisma application model");
assert.match(model("Task"), /\bareaId\s+String\?\s+@map\("area_id"\)/, "Task.areaId must be nullable");
assert.doesNotMatch(model("Task"), /areaId[^\n]*@default\("area_inbox"\)/, "Task.areaId must not default to Inbox");
assert.match(model("Task"), /\barea\s+Area\?\s+@relation/, "Task.area must be nullable");
assert.match(model("Project"), /\bareaId\s+String\s+@map\("area_id"\)/, "Project.areaId must remain required");
assert.match(model("Project"), /\barea\s+Area\s+@relation/, "Project.area must remain required");

for (const name of ["EntityNote", "EntityDoc", "Document"]) {
  assert.match(model(name), /\bparentType\s+EntityParentType\?\s+@map\("parent_type"\)/, `${name}.parentType must be nullable`);
  assert.match(model(name), /\bparentId\s+String\?\s+@map\("parent_id"\)/, `${name}.parentId must be nullable`);
}

assert.ok(migration, "The area-first expand migration must exist");
assert.doesNotMatch(migration, /DROP\s+(TABLE\s+"?domains"?|COLUMN\s+"?domain_id"?)/i, "Expand migration must retain physical Domain structures");
assert.match(migration, /projects[\s\S]*area_id[\s\S]*area_inbox[\s\S]*RAISE EXCEPTION/i, "Migration must guard against Inbox projects");
assert.match(migration, /ALTER TABLE "tasks" ALTER COLUMN "area_id" DROP DEFAULT/i);
assert.match(migration, /ALTER TABLE "tasks" ALTER COLUMN "area_id" DROP NOT NULL/i);
assert.doesNotMatch(
  migration,
  /NEW\."area_id"\s+IS NULL[\s\S]{0,160}area_inbox/i,
  "Task-area synchronization must not restore the legacy Inbox default",
);

for (const [table, column] of [
  ["tasks", "area_id"],
  ["routines", "area_id"],
  ["ideas", "area_id"],
  ["references", "area_id"],
  ["people", "area_id"],
  ["capture_review_proposals", "suggested_area_id"],
] as const) {
  assert.match(
    migration,
    new RegExp(`UPDATE "${table}"[\\s\\S]*?"${column}" = NULL[\\s\\S]*?"${column}" = 'area_inbox'`, "i"),
    `${table}.${column} must detach the legacy Inbox area`,
  );
}

for (const table of ["entity_notes", "entity_docs", "documents"]) {
  assert.match(
    migration,
    new RegExp(`UPDATE "${table}"[\\s\\S]*?"parent_type" = NULL[\\s\\S]*?"parent_id" = NULL`, "i"),
    `${table} must detach the legacy Inbox parent`,
  );
  assert.match(migration, new RegExp(`${table}_parent_pair_check`, "i"), `${table} must enforce an all-null or all-present parent pair`);
}

assert.ok(verifier, "The area-first migration verifier must exist");
assert.equal(
  packageJson.scripts["verify:area-migration"],
  "tsx scripts/verify-area-first-migration.ts",
  "Package scripts must expose the migration verifier",
);
assert.match(verifier, /expected-books/i, "Verifier must require a supplied Book baseline");
assert.match(verifier, /expected-movies/i, "Verifier must require a supplied Movie baseline");
assert.match(verifier, /projectInboxCount/, "Verifier must count projects still attached to Inbox");
assert.match(verifier, /contentInboxCount/, "Verifier must count eligible content still attached to Inbox");
assert.match(verifier, /taskProjectAreaMismatchCount/, "Verifier must count absent or mismatched task Area mirrors");
assert.match(verifier, /projectWithoutAreaCount/, "Verifier must count projects without an Area");
assert.match(verifier, /bookCount/, "Verifier must count Books");
assert.match(verifier, /movieCount/, "Verifier must count Movies");
assert.match(verifier, /localhost|127\.0\.0\.1/, "Verifier must reject non-local database hosts");
