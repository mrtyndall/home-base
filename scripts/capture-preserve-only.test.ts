import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { captureInputSchema } from "../src/lib/capture/types";

test("capture input accepts an explicit persistence-only intent", () => {
  const parsed = captureInputSchema.parse({
    rawText: "Preserve this without parsing",
    source: "api",
    captureIntent: "preserve_only",
    idempotencyKey: "5b9f23d4-3e09-4f2f-8946-bdd621b4b5b2",
  });

  assert.equal(parsed.captureIntent, "preserve_only");
});

test("API and capture service route preserve_only without model parsing", () => {
  const route = readFileSync("src/app/api/v1/[...path]/route.ts", "utf8");
  const service = readFileSync("src/lib/capture/service.ts", "utf8");

  assert.match(route, /captureIntent:\s*z\.literal\("preserve_only"\)/);
  assert.match(route, /captureIntent:\s*parsed\.captureIntent\s*\?\?\s*"auto"/);
  assert.match(
    service,
    /if \(parsedInput\.captureIntent === "preserve_only"\)[\s\S]+actions:\s*\[\][\s\S]+status:\s*"parsed"[\s\S]+buildParserContext/,
  );
});
