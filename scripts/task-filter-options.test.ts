import assert from "node:assert/strict";
import { buildProjectFilterGroups } from "../src/lib/task-filter-options";

const projects = [
  {
    id: "project_ham",
    name: "Antenna build",
    area: { id: "area_ham", name: "Ham Radio" },
  },
  {
    id: "project_home",
    name: "Garage shelves",
    area: { id: "area_home", name: "Home" },
  },
  {
    id: "project_radio",
    name: "Radio desk",
    area: { id: "area_ham", name: "Ham Radio" },
  },
];

assert.deepEqual(buildProjectFilterGroups(projects, "area_ham"), [
  {
    areaName: "Ham Radio",
    projects: [
      { id: "project_ham", name: "Antenna build" },
      { id: "project_radio", name: "Radio desk" },
    ],
  },
]);

assert.deepEqual(buildProjectFilterGroups(projects, ""), [
  {
    areaName: "Ham Radio",
    projects: [
      { id: "project_ham", name: "Antenna build" },
      { id: "project_radio", name: "Radio desk" },
    ],
  },
  {
    areaName: "Home",
    projects: [{ id: "project_home", name: "Garage shelves" }],
  },
]);
