import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Codex } from "@openai/codex-sdk";
import { z } from "zod";
import {
  sorterJobInputSchema,
  sorterResultSchema,
  type SorterJobInput,
  type SorterResult,
} from "../../src/lib/agent/schemas.js";
import type { WorkerConfig } from "./config.js";
import { lockedThreadOptions } from "./codex.js";

export async function runSorter(input: {
  codex: Codex;
  config: WorkerConfig;
  job: SorterJobInput;
  signal: AbortSignal;
}): Promise<SorterResult> {
  const job = sorterJobInputSchema.parse(input.job);
  const instructions = await readFile(join(input.config.promptDir, "sorter.md"), "utf8");
  const thread = input.codex.startThread(lockedThreadOptions(input.config));
  const turn = await thread.run(
    `${instructions}\n\n<untrusted_home_base_context>\n${JSON.stringify(job)}\n</untrusted_home_base_context>`,
    {
      outputSchema: z.toJSONSchema(sorterResultSchema),
      signal: input.signal,
    },
  );
  return sorterResultSchema.parse(JSON.parse(turn.finalResponse));
}
