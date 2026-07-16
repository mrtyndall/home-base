import assert from "node:assert/strict";
import fs from "node:fs";
import { homeStatusHeadline } from "../src/lib/home-task-inbox-status";

const home = fs.readFileSync("src/app/page.tsx", "utf8");
const card = fs.existsSync("src/components/home-task-inbox.tsx")
  ? fs.readFileSync("src/components/home-task-inbox.tsx", "utf8")
  : "";
const quickEdit = fs.readFileSync("src/components/task-quick-edit.tsx", "utf8");
const integratedControls = `${card}\n${quickEdit}`;

assert.equal(homeStatusHeadline(0, 1, 1), "0 due today. 1 new task in Inbox.");
assert.equal(homeStatusHeadline(2, 3, 0), "2 due today. 3 tasks in Inbox.");
assert.equal(homeStatusHeadline(1, 1, 0), "1 due today. 1 task in Inbox.");

assert.match(home, /dueToday\.length === 0[\s\S]*<HomeTaskInbox/);
assert.match(home, /dueToday\.length > 0[\s\S]*<HomeTaskInbox/);
assert.match(home, /taskInboxTotalCount={taskInboxData\.totalCount}/);
assert.match(home, /taskInboxNewCount={taskInboxData\.newCount}/);
assert.match(home, /taskInboxData\.totalCount === 0/);
assert.match(card, /if \(data\.totalCount === 0\)[\s\S]*return null/);
assert.match(card, /rows\.slice\(0, HOME_TASK_INBOX_LIMIT\)/);
assert.match(card, /data\.totalCount/);
assert.match(card, /triagedAt === null/);
assert.match(card, /New/);
assert.match(card, /href="\/tasks\?section=unscheduled#unscheduled"/);
assert.match(card, /Open all/);
assert.match(card, /variant="inbox"/);
assert.match(integratedControls, /Assign task/);
assert.match(integratedControls, /Schedule task/);
assert.match(integratedControls, /Complete task/);
assert.match(card, /min-h-11/);
assert.match(card, /min-w-0/);
assert.match(card, /break-words/);
assert.match(card, /aria-live="polite"/);
assert.match(card, /\/api\/tasks\/\$\{taskId\}\/complete/);
assert.match(card, /TaskQuickEditMutationStatusHost/);
assert.doesNotMatch(home, /RecentCaptures/);
