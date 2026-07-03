import assert from "node:assert/strict";
import { buildProjectFilterGroups } from "../src/lib/task-filter-options";

const projects = [
  {
    id: "project_ham",
    name: "Antenna build",
    area: { domainId: "domain_hobbies", domain: { name: "Hobbies" } },
  },
  {
    id: "project_home",
    name: "Garage shelves",
    area: { domainId: "domain_home", domain: { name: "Home" } },
  },
  {
    id: "project_radio",
    name: "Radio desk",
    area: { domainId: "domain_hobbies", domain: { name: "Hobbies" } },
  },
];

assert.deepEqual(buildProjectFilterGroups(projects, "domain_hobbies"), [
  {
    domainName: "Hobbies",
    projects: [
      { id: "project_ham", name: "Antenna build" },
      { id: "project_radio", name: "Radio desk" },
    ],
  },
]);

assert.deepEqual(buildProjectFilterGroups(projects, ""), [
  {
    domainName: "Hobbies",
    projects: [
      { id: "project_ham", name: "Antenna build" },
      { id: "project_radio", name: "Radio desk" },
    ],
  },
  {
    domainName: "Home",
    projects: [{ id: "project_home", name: "Garage shelves" }],
  },
]);
