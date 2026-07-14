import Anthropic from "@anthropic-ai/sdk";
import { parserActionsSchema, type ParserAction } from "@/lib/capture/types";

type ParserContext = {
  now: string;
  timezone: "America/New_York";
  source: string;
  areas: Array<{ id: string; name: string; status: string }>;
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
Each action is an object whose "type" field names the action, plus that action's fields, e.g.
{ "type": "create_task", "title": "...", "area_match": "...", "due_date": "..." }
{ "type": "create_entity_note", "parent_type": "area", "area_match": "...", "body_md": "..." }
{ "type": "check_in", "project_match": "...", "body_md": "..." }
create_entity_note and create_entity_doc may omit parent_type to create unfiled content.
Use these action types:
- create_task
- complete_task
- star_task
- create_area
- update_area_state
- create_project
- update_project_state
- create_calendar_event
- check_in
- journal
- boost_resurface
- schedule_review
- create_routine
- complete_routine
- create_person
- create_person_fact
- log_interaction
- create_idea
- append_to_idea
- convert_idea
- create_reference
- create_entity_note
- create_entity_doc

Rules:
- Multiple actions per capture are common.
- Hierarchy is Areas -> Projects -> Tasks.
- Areas are ongoing responsibilities and information canvases with no finish line. They are the default home for facts, details, references, observations, durable context, and loose notes.
- Projects are finite pushes inside areas. Create or route to a project only when the capture clearly names a bounded outcome, deliverable, end state, deadline, time gate, milestone path, or temporary focused effort.
- Do not create a project merely because the capture contains a noun, topic, tool, hobby, device, or research thread. If it is ongoing context, create an area note/reference/check-in instead.
- If Matt would still need the information after a project is done, store it on the area unless the capture explicitly says it belongs to the project.
- If it can be completed or delivered, it may be a project. If Matt would still be responsible for it a year from now, route it as an area.
- Use area_match, project_match, task_match, and idea_match as fuzzy names from context.
- If the named container matches a known project from context, use project_match, never area_match. Only use area_match for known areas.
- If the user gives no area or project, omit area_match and project_match so eligible content remains unfiled.
- Capture classifies, never coerces. Do not manufacture a task from non-task input.
- Clear action intent ("do", "buy", "call", "fix", "schedule", "renew") creates a task.
- A thought, opinion, or possibility ("what if", "I wonder", "idea:") creates an idea.
- A fact, link, detail, or recommendation someone mentioned creates a reference, or an area entity note when a known area is named. Prefer area notes over project notes unless the text clearly ties the detail to a finite project.
- Status narration on a known project or area ("check in on X: ...", "quick update on X: ...", progress reports) uses check_in with body_md and area_match or project_match. Check-ins are the living timeline and heartbeat of the container.
- "journal: ..." and reflective first-person narration about the day or Matt's state of mind ("today was...", "feeling like...", "grateful that...") use journal with body_md. entry_date defaults to today; set it only when the text names a different day.
- Requests to see a memory or idea more often ("boost the podcast intro idea", "keep that one coming back") use boost_resurface with item_match.
- Future-facing intent that is not a datable task ("circle back after the shoot", "revisit this once the trailer sells", "revisit the insurance quote in two weeks") emits schedule_review with review_at (ISO date) when the time resolves, else review_condition_text with the condition. Emit it alongside whatever action stores the content itself; if nothing else fits, schedule_review alone is fine — the raw capture is kept.
- Recurring habits ("start a morning stretch routine on weekdays", "new routine: ...") use create_routine with name, frequency (daily/weekly/custom), days (mon..sun) for custom, time_window (morning/afternoon/evening/anytime), optional grace_days, temporary + start_date/end_date for time-boxed routines. Routines are separate from tasks: no due dates.
- Reporting a habit done ("did my morning stretch", "finished the stretch routine") uses complete_routine with routine_match.
- Facts people mention ("note for Chris: his daughter starts college in August") use create_person_fact with person_match, fact_value, date_relevant (ISO date, resolve month names to a concrete date) and recurring true for anniversaries/birthdays. The server creates the person if unknown.
- Meeting or talking with someone ("had lunch with Sarah", "called Dad about the trip") uses log_interaction with person_match, interaction_type, notes, occurred_at.
- Introducing a person ("add Chris Miller to people, he's my neighbor, chris@example.com") uses create_person with name (required), relationship_type, email, phone, company.
- Work narration on a known project or area that is not a status update creates a check_in or entity note. Prefer area check-ins/notes for ongoing context; use project updates only for finite project state.
- If genuinely ambiguous or unclassifiable, return { "needs_disambiguation": true, "candidates": [...] } and create no entity.
- If unparseable, return { "error": "..." } and create no entity.
- "Star X" / "make X a top task" uses star_task with task_match. "Unstar X" uses star_task with starred false.
- create_task accepts starred true when the capture marks the new task as a top or starred task.
- Interpret park/unpark project requests as update_project_state with status parked/active.
- Someday means wanted, not committed. "Someday project" uses create_project with status "someday"; "someday task" uses create_task with someday true.
- Parked means started and set down. Do not use parked for someday items.
- Area/project notes and docs use markdown body fields.
- Resolve dates and times to ISO strings in America/New_York using the provided current time.`;

const inboxRouterPrompt = `${parserSystemPrompt}

You are the final cheap Inbox router for captures the first parser could not confidently classify.
Your job is to make a narrow filing decision only when the text clearly fits the action vocabulary.
Prefer create_entity_note, create_reference, create_idea, schedule_review, and create_task over creating new projects.
Do not force a task. If the text is genuinely vague, incomplete, joking, or context-free, return exactly:
[{ "needs_disambiguation": true, "candidates": [], "reason": "Still needs Matt to sort." }]`;

export async function parseCaptureWithContext(
  rawText: string,
  context: ParserContext,
): Promise<ParserAction[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_PARSE_MODEL;
  const routerModel = process.env.ANTHROPIC_INBOX_ROUTER_MODEL;

  if (!apiKey || !model) {
    return fallbackParse(rawText);
  }

  const anthropic = new Anthropic({ apiKey });
  let actions: ParserAction[];
  try {
    actions = await parseWithAnthropic(
      anthropic,
      model,
      parserSystemPrompt,
      rawText,
      context,
    );
  } catch (error) {
    if (routerModel) {
      return parseWithAnthropic(
        anthropic,
        routerModel,
        inboxRouterPrompt,
        rawText,
        context,
      );
    }
    throw error;
  }

  if (routerModel && hasOnlyPendingActions(actions)) {
    try {
      return await parseWithAnthropic(
        anthropic,
        routerModel,
        inboxRouterPrompt,
        rawText,
        context,
      );
    } catch {
      return actions;
    }
  }

  return actions;
}

async function parseWithAnthropic(
  anthropic: Anthropic,
  model: string,
  system: string,
  rawText: string,
  context: ParserContext,
) {
  const response = await anthropic.messages.create({
    model,
    max_tokens: 1200,
    system,
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

function hasOnlyPendingActions(actions: ParserAction[]) {
  return (
    actions.length === 0 ||
    actions.every((action) => "needs_disambiguation" in action || "error" in action)
  );
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

  const areaTaskMatch = trimmed.match(
    /^add (?:a )?task to (.+?)\s*[:,-]\s*(.+)$/i,
  );
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

  const areaMatch = trimmed.match(
    /^area\s*[:,-]\s*(.+?)(?:\s+under\s+(.+))?$/i,
  );
  if (areaMatch?.[1]) {
    return [
      {
        type: "create_area",
        name: areaMatch[1].trim(),
      },
    ];
  }

  const projectMatch = trimmed.match(/^project\s*[:,-]\s*(.+)$/i);
  if (projectMatch?.[1]) {
    return [{ type: "create_project", name: projectMatch[1].trim() }];
  }

  const personFactMatch = trimmed.match(/^note for (.+?)\s*[:,-]\s*(.+)$/i);
  if (personFactMatch?.[1] && personFactMatch[2]) {
    return [
      {
        type: "create_person_fact",
        person_match: personFactMatch[1].trim(),
        fact_value: personFactMatch[2].trim(),
      },
    ];
  }

  const routineMatch = trimmed.match(/^routine\s*[:,-]\s*(.+)$/i);
  if (routineMatch?.[1]) {
    return [{ type: "create_routine", name: routineMatch[1].trim() }];
  }

  const didMyMatch = trimmed.match(/^did my\s+(.+?)(?:\s+routine)?$/i);
  if (didMyMatch?.[1]) {
    return [{ type: "complete_routine", routine_match: didMyMatch[1].trim() }];
  }

  const revisitMatch = trimmed.match(/^(?:revisit|circle back on)\s+.+$/i);
  if (revisitMatch) {
    return [{ type: "schedule_review", review_condition_text: trimmed }];
  }

  const boostMatch = trimmed.match(/^boost\s+(?:the\s+)?(.+)$/i);
  if (boostMatch?.[1]) {
    return [{ type: "boost_resurface", item_match: boostMatch[1].trim() }];
  }

  const journalMatch = trimmed.match(/^journal\s*[:,-]\s*([\s\S]+)$/i);
  if (journalMatch?.[1]) {
    return [{ type: "journal", body_md: journalMatch[1].trim() }];
  }

  const checkInMatch = trimmed.match(
    /^check in on (?:the )?(.+?)\s*[:,-]\s*(.+)$/i,
  );
  if (checkInMatch?.[1] && checkInMatch[2]) {
    return [
      {
        type: "check_in",
        project_match: checkInMatch[1].trim(),
        body_md: checkInMatch[2].trim(),
      },
    ];
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

  const unparkMatch = trimmed.match(
    /^unpark(?:\s+the)?\s+(.+?)(?:\s+project)?$/i,
  );
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

  const referenceMatch = trimmed.match(
    /^(reference|remember)\s*[:,-]\s*(.+)$/i,
  );
  if (referenceMatch?.[2]) {
    return [{ type: "create_reference", body: referenceMatch[2].trim() }];
  }

  // Require "the/my" or a "... task" suffix so prose like "star gazing
  // would be lovely" is not coerced into a star_task action.
  const starMatch =
    trimmed.match(/^(un)?star\s+(?:the|my)\s+(.+?)(?:\s+task)?$/i) ??
    trimmed.match(/^(un)?star\s+(.+?)\s+task$/i);
  if (starMatch?.[2]) {
    return [
      {
        type: "star_task",
        task_match: starMatch[2].trim(),
        starred: !starMatch[1],
      },
    ];
  }

  const completeMatch = normalized.match(/^complete\s+(.+)$/);
  if (completeMatch?.[1]) {
    return [{ type: "complete_task", task_match: completeMatch[1].trim() }];
  }

  if (
    /^(buy|call|fix|schedule|renew|do|send|email|order|pick up)\b/i.test(
      trimmed,
    )
  ) {
    return [{ type: "create_task", title: trimmed }];
  }

  if (/^(what if|i wonder|maybe|could|should)\b/i.test(trimmed)) {
    return [{ type: "create_idea", title: trimmed, body: trimmed }];
  }

  if (
    /^(the|a|an)\b.+\b(is|are|was|were)\b/i.test(trimmed) ||
    /^https?:\/\//i.test(trimmed)
  ) {
    return [{ type: "create_reference", body: trimmed }];
  }

  return [
    {
      needs_disambiguation: true,
      candidates: [],
      reason: "Fallback parser could not classify this capture.",
    },
  ];
}
