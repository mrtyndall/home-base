import { readFileSync } from "node:fs";

const source = readFileSync("src/app/projects/[projectId]/page.tsx", "utf8");

const projectTasksSection = source.match(
  /function ProjectTasksSection[\s\S]*?function TimeframeEditor/,
);

if (!projectTasksSection) {
  throw new Error("ProjectTasksSection was not found.");
}

const body = projectTasksSection[0];

if (!body.includes('className="space-y-2"')) {
  throw new Error("Project tasks should render as separated task cards.");
}

if (!/rounded-\[14px\][^"]*border border-\[#E2E6DF\][^"]*bg-white[^"]*p-4/.test(body)) {
  throw new Error("Project task cards should match the Today task card shell.");
}

if (body.includes('className="divide-y divide-[#EEF1EC]')) {
  throw new Error("Project tasks should not render as a flat divided list.");
}
