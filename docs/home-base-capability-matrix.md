# Home Base agent capability matrix

This matrix was reconciled against the dispatch branches in `src/app/api/v1/[...path]/route.ts` and `src/lib/api/read-later-router.ts`, and every `server.registerTool` call in `mcp/http-server.ts` and `mcp/read-later-registration.ts`. All paths are below `/api/v1`.

Evidence labels are deliberately separate:

- **Registry** means the exact tool name was discovered and matched against the complete expected manifest.
- **Proxy** means the actual registered handler was invoked with sample input and its bearer header, method, path/query, and body matched the manifest.
- **Behavior / live** names a focused application-boundary test when one exists. `Live not run` means no deployed service or database claim is being made.

| Capability | REST method and path | Scope | MCP tool(s) | Write audit | Registry | Proxy | Behavior / live |
|---|---|---:|---|---|---|---|---|
| Today / all-clear | `GET /today` | `read` | `all_clear_summary` | — | Discovered | Invoked | Live not run |
| Search | `GET /search?q=` | `read` | `search` | — | Discovered | Invoked | Live not run |
| Lossless capture | `GET /captures`; `POST /captures` | `read`; `capture` | `list_captures`; `capture_input` | Capture pipeline audit | Discovered | Invoked | Capture suite; live not run |
| Task list/read | `GET /tasks`; `GET /tasks/:id` | `read` | `list_tasks`; `read_task` | — | Discovered | Invoked | Live not run |
| Task create/update | `POST /tasks`; `PATCH /tasks/:id` | `write` | `create_task`; `update_task` | `task_created`; `task_updated` | Discovered | Invoked | Task/API suites; live not run |
| Task star/complete | `POST /tasks/:id/star`; `POST /tasks/:id/complete` | `write` | `star_task`; `complete_task` | `task_starred` / `task_unstarred`; completion audit | Discovered | Invoked | Task suites; live not run |
| Area list/read/aggregate | `GET /areas`; `GET /areas/:id`; `GET /areas/:id/aggregate` | `read` | `list_areas`; `read_area`; `read_area_aggregate` | — | Discovered | Invoked | Hierarchy suite; live not run |
| Area create/update/reparent | `POST /areas`; `PATCH /areas/:id` | `write` | `create_area`; `update_area_state`; `reparent_area` | Shared hierarchy audit | Discovered | Invoked | Hierarchy suite; live not run |
| Project list/read/activity | `GET /projects`; `GET /projects/:id`; `GET /projects/:id/activity` | `read` | `list_projects`; `read_project`; `list_project_activity` | — | Discovered | Invoked | Hierarchy suite; live not run |
| Project create/update/file | `POST /projects`; `PATCH /projects/:id` | `write` | `create_project`; `update_project_state`; `file_project`; `park_project`; `unpark_project` | Shared hierarchy audit | Discovered | Invoked | Hierarchy suite; live not run |
| Project activity append | `POST /projects/:id/activity` | `write` | `log_project_activity` | `project_activity_created` | Discovered | Invoked | Live not run |
| Idea list/read/notes | `GET /ideas`; `GET /ideas/:id`; `GET /ideas/:id/notes` | `read` | `list_ideas`; `read_idea` | — | Discovered | Invoked | Live not run |
| Idea create/update | `POST /ideas`; `PATCH /ideas/:id` | `write` | `capture_idea`; `update_idea` | `idea_created`; `idea_updated` | Discovered | Invoked | Live not run |
| Idea note/convert | `POST /ideas/:id/notes`; `POST /ideas/:id/convert` | `write` | `add_idea_note`; `convert_idea` | `idea_note_created`; atomic `idea_converted` | Discovered | Invoked | Conversion + rollback tested; live not run |
| Reference list/read | `GET /references`; `GET /references/:id` | `read` | `list_references`; `read_reference` | — | Discovered | Invoked | Live not run |
| Reference create/update/file | `POST /references`; `PATCH /references/:id`; `POST /references/:id/file` | `write` | `create_reference`; `update_reference`; `file_reference` | `reference_created`; `reference_updated`; filing audit | Discovered | Invoked | Read Later filing suite; live not run |
| Read Later list/read | `GET /read-later`; `GET /read-later/:id` | `read` | `list_read_later` (list); single read is REST-only | — | List discovered | List invoked | REST boundary tested; live not run |
| Read Later save/status | `POST /read-later`; `POST /read-later/:id/status` | `write` | `save_read_later`; `set_read_later_status` | Shared Read Later audits | Discovered | Invoked | REST boundary tested; live not run |
| Read Later-specific file | `POST /read-later/:id/file` | `write` | REST-only; general filing uses `file_reference` | Shared Read Later audit | — | — | REST boundary tested; live not run |
| Calendar list/read | `GET /calendar-events`; `GET /calendar-events/:id` | `read` | `calendar_read`; `read_calendar_event` | — | Discovered | Invoked | Live not run |
| Calendar create/update | `POST /calendar-events`; `PATCH /calendar-events/:id` | `write` | `create_calendar_event`; `update_calendar_event` | `calendar_event_created`; `calendar_event_updated` | Discovered | Invoked | Live not run |
| Notifications / audit feed | `GET /notifications` | `read` | `list_notifications` | — | Discovered | Invoked | Live not run |
| Entity note list/read | `GET /entity-notes`; `GET /entity-notes/:id` | `read` | `list_entity_notes`; `read_entity_note` | — | Discovered | Invoked | Live not run |
| Entity note create/update | `POST /entity-notes`; `PATCH /entity-notes/:id` | `write` | `add_entity_note`; `update_entity_note` | `entity_note_created`; atomic `entity_note_updated` | Discovered | Invoked | Update + rollback tested; live not run |
| Entity doc list/read | `GET /entity-docs`; `GET /entity-docs/:id` | `read` | `list_entity_docs`; `read_entity_doc` | — | Discovered | Invoked | Live not run |
| Entity doc create/update/archive | `POST /entity-docs`; `PATCH /entity-docs/:id` | `write` | `create_entity_doc`; `update_entity_doc` | `entity_doc_created`; `entity_doc_updated` | Discovered | Invoked | Live not run |
| Milestone list | `GET /milestones` | `read` | `list_milestones` | — | Discovered | Invoked | Live not run |
| Milestone create/update/complete/reopen | `POST /milestones`; `PATCH /milestones/:id` | `write` | `create_milestone`; `update_milestone`; `complete_milestone` | `milestone_created`; atomic `milestone_updated` | Discovered | Invoked | Reopen + audit tested; live not run |
| Check-in list | `GET /check-ins` | `read` | `list_check_ins` | — | Discovered | Invoked | Check-in suite; live not run |
| Check-in create/draft | `POST /check-ins`; `POST /check-ins/draft` | `write` | `create_check_in`; `draft_check_in_summary` | Shared check-in audit; draft does not persist | Discovered | Invoked | Check-in suite; live not run |
| Journal list/create | `GET /journal-entries`; `POST /journal-entries` | `read`; `write` | `list_journal_entries`; `create_journal_entry` | `journal_entry_created` | Discovered | Invoked | Journal suite; live not run |
| Resurfacing read/respond | `GET /resurfacing`; `POST /resurfacing/:seenId/boost|dismiss` | `read`; `write` | `read_resurfaced_item`; `respond_to_resurfaced_item` | `resurface_boosted`; `resurface_dismissed` | Discovered | Invoked | Live not run |
| Scheduled reviews list/settle | `GET /scheduled-reviews`; `POST /scheduled-reviews/:id/done|dismiss|snooze` | `read`; `write` | `list_scheduled_reviews`; `settle_scheduled_review` | `review_done`; `review_dismissed`; `review_snoozed` | Discovered | Invoked | Review suite; live not run |
| Routine list/history | `GET /routines`; `GET /routines/:id/completions` | `read` | `list_routines`; `list_routine_completions` | — | Discovered | Invoked | Routine suite; live not run |
| Routine create/complete | `POST /routines`; `POST /routines/:id/complete` | `write` | `create_routine`; `complete_routine` | `routine_created`; completion audit | Discovered | Invoked | Routine suite; live not run |
| People list/read | `GET /people`; `GET /people/:id` | `read` | `list_people`; `read_person` | — | Discovered | Invoked | People suite; live not run |
| People create/fact/interaction | `POST /people`; `POST /people/:id/facts`; `POST /people/:id/interactions` | `write` | `create_person`; `create_person_fact`; `log_interaction` | Person creation audit; `person_fact_created`; `interaction_logged` | Discovered | Invoked | People suite; live not run |

## Evidence conclusions

- The expected manifest and active registry contain the same 74 unique tool names; neither contains a Domain or delete tool.
- Every registered handler is proxy-invoked by the manifest test. A tool cannot replace an expected tool merely by keeping the total count unchanged.
- Every dynamic path ID is validated centrally, rejects empty and route-confusable `/ ? # \\ ..` input before fetch, and is encoded with `encodeURIComponent`. Seeded non-UUID Area IDs remain valid.
- MCP preserves the bearer credential. REST remains responsible for `read`, `write`, and `capture` scope checks, rate limiting, validation, and application audits.
- Fetch rejection, response-body read failure, malformed successful JSON, and non-2xx responses become redacted `home_base_api_error` tool results.
- No live status is inferred here. Task 2 must record live host and deployed smoke evidence separately.
