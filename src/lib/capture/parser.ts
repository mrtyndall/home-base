import Anthropic from "@anthropic-ai/sdk";
import { parserActionsSchema, type ParserAction } from "@/lib/capture/types";

type ParserContext = {
  now: string;
  timezone: "America/New_York";
  source: string;
  domains: Array<{ id: string; name: string }>;
  projects: Array<{
    id: string;
    name: string;
    domain: string;
    current_state: string;
  }>;
  recentIdeas: Array<{ id: string; title: string }>;
};

const parserSystemPrompt = `You parse raw personal operations captures into JSON actions.
Return only a valid JSON array. Do not wrap it in Markdown.
Use these action types:
- create_task
- complete_task
- create_project
- update_project_state
- create_calendar_event
- create_idea
- append_to_idea
- convert_idea
- create_reference

Rules:
- Multiple actions per capture are common.
- Use domain_match, project_match, task_match, and idea_match as fuzzy names from context.
- If the user gives no domain, omit domain_match so the server can place it in Inbox.
- If genuinely ambiguous, return { "needs_disambiguation": true, "candidates": [...] }.
- If unparseable, return { "error": "..." }.
- Resolve dates and times to ISO strings in America/New_York using the provided current time.`;

export async function parseCaptureWithContext(
  rawText: string,
  context: ParserContext,
): Promise<ParserAction[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_PARSE_MODEL;

  if (!apiKey || !model) {
    return fallbackParse(rawText);
  }

  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model,
    max_tokens: 1200,
    system: parserSystemPrompt,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          raw_input: rawText,
          context,
        }),
      },
    ],
  });

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  const parsed = JSON.parse(text);
  return parserActionsSchema.parse(parsed);
}

function fallbackParse(rawText: string): ParserAction[] {
  const trimmed = rawText.trim();
  const normalized = trimmed.toLowerCase();

  const ideaMatch = trimmed.match(/^idea\s*[:,-]\s*(.+)$/i);
  if (ideaMatch?.[1]) {
    return [{ type: "create_idea", title: ideaMatch[1].trim(), body: trimmed }];
  }

  const projectMatch = trimmed.match(/^project\s*[:,-]\s*(.+)$/i);
  if (projectMatch?.[1]) {
    return [{ type: "create_project", name: projectMatch[1].trim() }];
  }

  const referenceMatch = trimmed.match(/^(reference|remember)\s*[:,-]\s*(.+)$/i);
  if (referenceMatch?.[2]) {
    return [{ type: "create_reference", body: referenceMatch[2].trim() }];
  }

  const completeMatch = normalized.match(/^complete\s+(.+)$/);
  if (completeMatch?.[1]) {
    return [{ type: "complete_task", task_match: completeMatch[1].trim() }];
  }

  return [{ type: "create_task", title: trimmed }];
}
