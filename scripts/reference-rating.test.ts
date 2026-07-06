import assert from "node:assert/strict";
import fs from "node:fs";

const actions = fs.readFileSync("src/app/actions.ts", "utf8");
const componentPath = "src/components/reference-rating.tsx";
const component = fs.existsSync(componentPath)
  ? fs.readFileSync(componentPath, "utf8")
  : "";
const referencePage = fs.readFileSync(
  "src/app/references/[referenceId]/page.tsx",
  "utf8",
);

assert.ok(
  actions.includes("export async function setReferenceRating") &&
    actions.includes("reference.update") &&
    actions.includes("myRating"),
  "Reference ratings should be stored as metadata.myRating without a schema migration.",
);

assert.ok(
  component.includes("setReferenceRating") &&
    component.includes('name="value"') &&
    component.includes("scale: 5 | 10") &&
    component.includes("Array.from({ length: scale }") &&
    component.includes('aria-label={value === rating ? "Clear rating"') &&
    component.includes("my rating"),
  "Reference detail should expose a scale-aware rating control that can assign, change, or clear the manual rating.",
);

assert.ok(
  referencePage.includes("<ReferenceRating") &&
    referencePage.includes("personalRating(reference)") &&
    referencePage.includes("manualRatingScale(reference)") &&
    referencePage.includes("import { ReferenceRating }"),
  "Reference detail should use the editable ReferenceRating component in the hero.",
);
