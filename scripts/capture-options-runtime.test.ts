import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

assert.ok(
  existsSync("src/lib/capture-options.ts"),
  "Capture options need a shared runtime parser/model.",
);

async function main() {
  const captureOptionModule = await import("../src/lib/capture-options");
  const { normalizeCaptureOptions } = captureOptionModule;
  const retainedProjectIdForDestination = (
    captureOptionModule as Record<string, unknown>
  ).retainedProjectIdForDestination;
  assert.equal(
    typeof retainedProjectIdForDestination,
    "function",
    "Capture destination changes need an explicit Project-retention rule.",
  );
  const options = normalizeCaptureOptions({
    areas: [
      { id: "area-home", name: "Home", status: "active" },
      { id: "area-health", name: "Health", status: "active" },
    ],
    projects: [
      { id: "project-garden", name: "Garden", areaId: "area-home", areaName: "Home" },
    ],
  });

  assert.equal(options.areas[0]?.name, "Home");
  assert.equal(options.projects[0]?.areaName, "Home");
  assert.equal("domains" in options, false);
  assert.equal("domainName" in options.projects[0]!, false);
  assert.deepEqual(normalizeCaptureOptions({ domains: [], projects: [] }), {
    areas: [],
    projects: [],
  });

  const retainProject = retainedProjectIdForDestination as (
    destinationAreaId: string,
    currentProjectId: string,
    projects: typeof options.projects,
  ) => string;
  assert.equal(
    retainProject("", "project-garden", options.projects),
    "",
    "Selecting global Inbox must clear the selected Project before submission.",
  );
  assert.equal(
    retainProject("area-health", "project-garden", options.projects),
    "",
    "Selecting another Area must clear a Project from the previous Area.",
  );
  assert.equal(
    retainProject("area-home", "project-garden", options.projects),
    "project-garden",
    "A Project may remain selected only inside its own nonempty Area.",
  );

  const route = readFileSync("src/app/api/capture/options/route.ts", "utf8");
  const component = readFileSync("src/components/capture-bar.tsx", "utf8");
  assert.doesNotMatch(component, /\bdomains\b|\bdomainName\b/);
  assert.doesNotMatch(component, /!nextAreaId\s*\|\|/);
  assert.match(component, /retainedProjectIdForDestination/);
  assert.match(component, /normalizeCaptureOptions/);
  assert.match(route, /isSystem:\s*false/);
}

void main();
