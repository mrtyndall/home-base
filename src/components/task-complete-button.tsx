import { Check } from "lucide-react";
import { completeTask } from "@/app/actions";

export function TaskCompleteButton({ taskId }: { taskId: string }) {
  return (
    <form action={completeTask}>
      <input type="hidden" name="taskId" value={taskId} />
      <button
        type="submit"
        title="Complete task"
        className="grid h-8 w-8 place-items-center rounded-md border border-stone-300 bg-white text-stone-600 transition hover:border-teal-500 hover:text-teal-700"
      >
        <Check size={16} />
      </button>
    </form>
  );
}
