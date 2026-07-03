import Anthropic from "@anthropic-ai/sdk";
import { parserActionsSchema, type ParserAction } from "@/lib/capture/types";

type ParserContext = {
  now: string;
  timezone: "America/New_York";
  source: string;
  domains: Array<{
    id: string;
    name: string;
    areas: Array<{ id: string; name: string; status: string }>;
  }>;
  projects: Array<{
    id: string;
    name: string;
    area: string;
    current_state: string | null;
  }>;
  recentIdeas: Array<{ id: string; title: string }>;
};

const parserSystemPrompt = `You parse raw personal operations captures into JSON actions.
Return only a valid JSON array. Do not wrap it in Markdown.
Use these action types:
- create_task
- complete_task
- create_area
- update_area_state
- create_project
- update_project_state
- create_calendar_event
- create_idea
- append_to_idea
- convert_idea
- create_reference
- create_entity_note
- create_entity_doc

Rules:
- Multiple actions per capture are common.
- Hierarchy is Domains -> Areas -> Projects -> Tasks.
- Domains are category headers only. Tasks attach to an area or project, never directly to a domain.
- Areas are ongoing responsibilities with no finish line. Projects are finishable outcomes.
- If it can be finished, route it as a project. If Matt would still be responsible for it a year from now, route it as an area.
- Use area_match, project_match, task_match, and idea_match as fuzzy names from context.
- If the user gives no area or project, omit area_match and project_match so the server can place it in the Inbox area.
- If genuinely ambiguous, return { "needs_disambiguation": true, "candidates": [...] }.
- If unparseable, return { "error": "..." }.
- Interpret park/unpark project requests as update_project_state with status parked/active.
- Someday means wanted, not committed. "Someday project" uses create_project with status "someday"; "someday task" uses create_task with someday true.
- Parked means started and set down. Do not use parked for someday items.
- Area/project notes and docs use markdown body fields.
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

  const ambiguousMatch = trimmed.match(/^ambiguous\s*[:,-]\s*(.+)$/i);
  if (ambiguousMatch?.[1]) {
    return [
      {
        needs_disambiguation: true,
        candidates: [ambiguousMatch[1].trim()],
        reason: "Fallback parser was asked to mark this capture ambiguous.",
      },
    ];
  }

  const areaTaskMatch = trimmed.match(/^add (?:a )?task to (.+?)\s*[:,-]\s*(.+)$/i);
  if (areaTaskMatch?.[1] && areaTaskMatch[2]) {
    return [
      {
        type: "create_task",
        area_match: areaTaskMatch[1].trim(),
        title: areaTaskMatch[2].trim(),
      },
    ];
  }

  const somedayTaskMatch = trimmed.match(/^someday task\s*[:,-]\s*(.+)$/i);
  if (somedayTaskMatch?.[1]) {
    return [
      {
        type: "create_task",
        title: somedayTaskMatch[1].trim(),
        someday: true,
      },
    ];
  }

  const somedayProjectMatch = trimmed.match(
    /^someday project\s*[:,-]\s*(.+?)(?:\s+in\s+(.+))?$/i,
  );
  if (somedayProjectMatch?.[1]) {
    return [
      {
        type: "create_project",
        name: somedayProjectMatch[1].trim(),
        area_match: somedayProjectMatch[2]?.trim(),
        status: "someday",
      },
    ];
  }

  const areaMatch = trimmed.match(/^area\s*[:,-]\s*(.+?)(?:\s+under\s+(.+))?$/i);
  if (areaMatch?.[1]) {
    return [
      {
        type: "create_area",
        name: areaMatch[1].trim(),
        domain_match: areaMatch[2]?.trim() ?? "Hobbies",
      },
    ];
  }

  const projectMatch = trimmed.match(/^project\s*[:,-]\s*(.+)$/i);
  if (projectMatch?.[1]) {
    return [{ type: "create_project", name: projectMatch[1].trim() }];
  }

  const projectLogMatch = trimmed.match(
    /^log on (?:the )?(.+?)(?: project)?\s*[:,-]\s*(.+)$/i,
  );
  if (projectLogMatch?.[1] && projectLogMatch[2]) {
    const body = projectLogMatch[2].trim();
    const nextStepMatch = body.match(/next step(?: is)?\s+(.+)$/i);
    return [
      {
        type: "update_project_state",
        project_match: projectLogMatch[1].trim(),
        current_state: body,
        next_step: nextStepMatch?.[1]?.trim(),
        log_entry: body,
      },
    ];
  }

  const noteMatch = trimmed.match(
    /^note (?:on|in) (?:the )?(.+?)\s*[:,-]\s*(.+)$/i,
  );
  if (noteMatch?.[1] && noteMatch[2]) {
    return [
      {
        type: "create_entity_note",
        parent_type: "area",
        area_match: noteMatch[1].trim(),
        body_md: noteMatch[2].trim(),
      },
    ];
  }

  const parkMatch = trimmed.match(/^park(?:\s+the)?\s+(.+?)(?:\s+project)?$/i);
  if (parkMatch?.[1]) {
    return [
      {
        type: "update_project_state",
        project_match: parkMatch[1].trim(),
        status: "parked",
        log_entry: trimmed,
      },
    ];
  }

  const unparkMatch = trimmed.match(/^unpark(?:\s+the)?\s+(.+?)(?:\s+project)?$/i);
  if (unparkMatch?.[1]) {
    return [
      {
        type: "update_project_state",
        project_match: unparkMatch[1].trim(),
        status: "active",
        log_entry: trimmed,
      },
    ];
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
