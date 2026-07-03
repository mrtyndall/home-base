"use client";

import { type FormEvent, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Plus } from "lucide-react";
import { createQuickTask } from "@/app/actions";

type SavedTask = {
  id: string;
  title: string;
  domainName: string;
  projectName: string | null;
};

export function TaskQuickAdd() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [savedTask, setSavedTask] = useState<SavedTask | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [, startTransition] = useTransition();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle || pending) return;

    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/tasks/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmedTitle, dueDate }),
      });

      if (!response.ok) {
        throw new Error("Task save failed.");
      }

      const result = (await response.json()) as { task: SavedTask };
      setSavedTask(result.task);
      setTitle("");
      setDueDate("");
      startTransition(() => router.refresh());
    } catch {
      setError("Task was not saved. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <form
        action={createQuickTask}
        onSubmit={handleSubmit}
        className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white p-2 shadow-sm"
      >
        <input
          name="title"
          required
          placeholder="Add a task"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="h-11 min-w-0 flex-1 bg-transparent px-2 text-base outline-none placeholder:text-stone-400"
        />
        <label
          title="Set due date"
          className={`relative grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-md border bg-white transition hover:border-teal-500 hover:text-teal-700 ${
            dueDate
              ? "border-teal-500 text-teal-700"
              : "border-stone-300 text-stone-600"
          }`}
        >
          <span className="sr-only">Set due date</span>
          <CalendarDays size={17} />
          <input
            name="dueDate"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Set due date"
          />
        </label>
        <button
          type="submit"
          disabled={pending || title.trim().length === 0}
          title={pending ? "Saving task" : "Add task"}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-teal-700 text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          <Plus size={18} />
        </button>
      </form>
      {savedTask ? (
        <Link
          href={`/tasks/${savedTask.id}`}
          className="block rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-950 transition hover:border-teal-400"
        >
          Saved: {savedTask.title} / {savedTask.domainName}
          {savedTask.projectName ? ` / ${savedTask.projectName}` : ""}
        </Link>
      ) : null}
      {error ? <p className="text-sm text-stone-700">{error}</p> : null}
    </div>
  );
}
