# Home Base agent capability matrix

This matrix was reconciled against the dispatch branches in `src/app/api/v1/[...path]/route.ts` and `src/lib/api/read-later-router.ts`, and every `server.registerTool` call in `mcp/http-server.ts` and `mcp/read-later-registration.ts`. It describes code contracts at this commit; it does not claim a live deployment passed. `Contract` means `mcp/http-server.contract.test.ts` discovers or invokes the registered tool. All paths are below `/api/v1`.

| Capability | REST method and path | Scope | MCP tool(s) | Write audit | Smoke status |
|---|---|---:|---|---|---|
| Today / all-clear | `GET /today` | `read` | `all_clear_summary` | — | Contract |
| Search | `GET /search?q=` | `read` | `search` | — | Contract |
| Lossless capture | `GET /captures`; `POST /captures` | `read`; `capture` | `list_captures`; `capture_input` | Capture pipeline audit | Contract proxy |
| Task list/read | `GET /tasks`; `GET /tasks/:id` | `read` | `list_tasks`; `read_task` | — | Contract proxy |
| Task create/update | `POST /tasks`; `PATCH /tasks/:id` | `write` | `create_task`; `update_task` | `task_created`; `task_updated` | Contract proxy |
| Task star/complete | `POST /tasks/:id/star`; `POST /tasks/:id/complete` | `write` | `star_task`; `complete_task` | `task_starred` / `task_unstarred`; completion audit | Contract |
| Area list/read/aggregate | `GET /areas`; `GET /areas/:id`; `GET /areas/:id/aggregate` | `read` | `list_areas`; `read_area` | — | Contract |
| Area create/update/reparent | `POST /areas`; `PATCH /areas/:id` | `write` | `create_area`; `update_area_state`; `reparent_area` | Shared hierarchy audit | Contract |
| Project list/read/activity | `GET /projects`; `GET /projects/:id`; `GET /projects/:id/activity` | `read` | `list_projects`; `read_project` | — | Contract |
| Project create/update/file | `POST /projects`; `PATCH /projects/:id` | `write` | `create_project`; `update_project_state`; `file_project`; `park_project`; `unpark_project` | Shared hierarchy audit | Contract |
| Project activity append | `POST /projects/:id/activity` | `write` | `log_project_activity` | `project_activity_created` | Contract |
| Idea list/read/notes | `GET /ideas`; `GET /ideas/:id`; `GET /ideas/:id/notes` | `read` | `list_ideas`; `read_idea` | — | Contract |
| Idea create/update | `POST /ideas`; `PATCH /ideas/:id` | `write` | `capture_idea`; `update_idea` | `idea_created`; `idea_updated` | Contract |
| Idea note/convert | `POST /ideas/:id/notes`; `POST /ideas/:id/convert` | `write` | `add_idea_note`; `convert_idea` | `idea_note_created`; `idea_converted` | Contract |
| Reference list/read | `GET /references`; `GET /references/:id` | `read` | `list_references`; `read_reference` | — | Contract |
| Reference create/update/file | `POST /references`; `PATCH /references/:id`; `POST /references/:id/file` | `write` | `create_reference`; `update_reference`; `file_reference` | `reference_created`; `reference_updated`; reference filing audit | Contract |
| Read Later list/read | `GET /read-later`; `GET /read-later/:id` | `read` | `list_read_later` (list); no dedicated single-item tool | — | Contract; REST-only read |
| Read Later save/status | `POST /read-later`; `POST /read-later/:id/status` | `write` | `save_read_later`; `set_read_later_status` | Shared Read Later audits | Contract |
| Read Later-specific file | `POST /read-later/:id/file` | `write` | No dedicated tool; `file_reference` uses the general safe filing route | Shared Read Later audit | REST-only |
| Calendar list/read | `GET /calendar-events`; `GET /calendar-events/:id` | `read` | `calendar_read`; `read_calendar_event` | — | Contract |
| Calendar create/update | `POST /calendar-events`; `PATCH /calendar-events/:id` | `write` | `create_calendar_event`; `update_calendar_event` | `calendar_event_created`; `calendar_event_updated` | Contract |
| Notifications / audit feed | `GET /notifications` | `read` | `list_notifications` | — | Contract |
| Entity note list/read | `GET /entity-notes`; `GET /entity-notes/:id` | `read` | `list_entity_notes`; `read_entity_note` | — | Contract |
| Entity note create/update | `POST /entity-notes`; `PATCH /entity-notes/:id` | `write` | `add_entity_note`; `update_entity_note` | `entity_note_created`; `entity_note_updated` | Contract |
| Entity doc list/read | `GET /entity-docs`; `GET /entity-docs/:id` | `read` | `list_entity_docs`; `read_entity_doc` | — | Contract |
| Entity doc create/update/archive | `POST /entity-docs`; `PATCH /entity-docs/:id` | `write` | `create_entity_doc`; `update_entity_doc` | `entity_doc_created`; `entity_doc_updated` | Contract |
| Milestone list | `GET /milestones` | `read` | `list_milestones` | — | Contract |
| Milestone create/update/complete/reopen | `POST /milestones`; `PATCH /milestones/:id` | `write` | `create_milestone`; `update_milestone`; `complete_milestone` | `milestone_created`; `milestone_updated` | Contract |
| Check-in list | `GET /check-ins` | `read` | `list_check_ins` | — | Contract |
| Check-in create/draft | `POST /check-ins`; `POST /check-ins/draft` | `write` | `create_check_in`; `draft_check_in_summary` | Shared check-in audit; draft is non-persisting | Contract |
| Journal list/create | `GET /journal-entries`; `POST /journal-entries` | `read`; `write` | `list_journal_entries`; `create_journal_entry` | `journal_entry_created` | Contract |
| Resurfacing read/respond | `GET /resurfacing`; `POST /resurfacing/:seenId/boost`; `POST /resurfacing/:seenId/dismiss` | `read`; `write` | `read_resurfaced_item`; `respond_to_resurfaced_item` | `resurface_boosted`; `resurface_dismissed` | Contract |
| Scheduled reviews list/settle | `GET /scheduled-reviews`; `POST /scheduled-reviews/:id/done|dismiss|snooze` | `read`; `write` | `list_scheduled_reviews`; `settle_scheduled_review` | `review_done`; `review_dismissed`; `review_snoozed` | Contract |
| Routine list/history | `GET /routines`; `GET /routines/:id/completions` | `read` | `list_routines`; `list_routine_completions` | — | Contract |
| Routine create/complete | `POST /routines`; `POST /routines/:id/complete` | `write` | `create_routine`; `complete_routine` | `routine_created`; completion audit | Contract |
| People list/read | `GET /people`; `GET /people/:id` | `read` | `list_people`; `read_person` | — | Contract |
| People create/fact/interaction | `POST /people`; `POST /people/:id/facts`; `POST /people/:id/interactions` | `write` | `create_person`; `create_person_fact`; `log_interaction` | Person creation audit; `person_fact_created`; `interaction_logged` | Contract |

## Contract conclusions

- The active registry has 72 unique tool names and no name containing `domain` or `delete`.
- MCP is a bearer-preserving proxy to REST; REST determines `read`, `write`, and `capture` scope, rate limiting, validation, and audit behavior.
- Upstream REST failures become a stable MCP `isError` payload containing only `home_base_api_error` and HTTP status. REST response bodies are not copied into MCP errors.
- There is no active Domain route or tool. The Area aggregate route is `/areas/:id/aggregate` and is intentionally not advertised as a separate tool because `read_area` is the canonical Area read.
- The REST-only Read Later single-item and specialized filing routes are documented rather than misrepresented as MCP parity. `file_reference` safely covers general Reference filing.
- No live status is inferred from this file. Task 2 runtime checks must promote relevant rows from code-contract status to live-smoke status.
