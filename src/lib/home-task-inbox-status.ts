export function homeStatusHeadline(
  dueCount: number,
  inboxCount: number,
  newCount: number,
) {
  const dueText = `${dueCount} due today.`;
  if (inboxCount === 0) return dueText;

  const taskText = `${inboxCount} task${inboxCount === 1 ? "" : "s"} in Inbox.`;
  if (newCount === 0) return `${dueText} ${taskText}`;
  if (newCount === inboxCount) {
    return `${dueText} ${newCount} new task${newCount === 1 ? "" : "s"} in Inbox.`;
  }
  return `${dueText} ${taskText.slice(0, -1)}, ${newCount} new.`;
}
