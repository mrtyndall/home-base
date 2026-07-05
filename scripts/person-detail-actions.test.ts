import assert from "node:assert/strict";
import fs from "node:fs";

const personPage = fs.readFileSync(
  "src/app/people/[personId]/page.tsx",
  "utf8",
);
const factPage = fs.readFileSync(
  "src/app/people/[personId]/facts/[factId]/page.tsx",
  "utf8",
);
const interactionPage = fs.readFileSync(
  "src/app/people/[personId]/interactions/[interactionId]/page.tsx",
  "utf8",
);
const actions = fs.readFileSync("src/app/actions.ts", "utf8");

assert.ok(
  personPage.includes("href={`/people/${person.id}/facts/${fact.id}`}"),
  "Person facts should open a detail page instead of being dead rows.",
);
assert.ok(
  personPage.includes(
    "href={`/people/${person.id}/interactions/${interaction.id}`}",
  ),
  "Person interactions should open a detail page instead of being dead rows.",
);
assert.ok(
  actions.includes("export async function updatePersonProfile"),
  "People need an editable profile action.",
);
assert.ok(
  actions.includes("export async function updatePersonFact"),
  "Person facts need an editable detail action.",
);
assert.ok(
  actions.includes("export async function updatePersonInteraction"),
  "Person interactions need an editable detail action.",
);
assert.ok(
  factPage.includes("updatePersonFact") &&
    factPage.includes("Original capture"),
  "Fact detail should expose edit fields and lineage context.",
);
assert.ok(
  interactionPage.includes("updatePersonInteraction") &&
    interactionPage.includes("Linked meeting"),
  "Interaction detail should expose edit fields and calendar context.",
);
