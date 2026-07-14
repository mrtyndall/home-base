import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

assert.ok(
  existsSync("src/lib/capture-options.ts"),
  "Capture options need a shared runtime parser/model.",
);

async function main() {
  const { normalizeCaptureOptions } = await import("../src/lib/capture-options");
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

  const route = readFileSync("src/app/api/capture/options/route.ts", "utf8");
  const component = readFileSync("src/components/capture-bar.tsx", "utf8");
  assert.doesNotMatch(component, /\bdomains\b|\bdomainName\b/);
  assert.match(component, /normalizeCaptureOptions/);
  assert.match(route, /isSystem:\s*false/);
}

void main();
