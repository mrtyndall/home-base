import { Check } from "lucide-react";
import { completeTask } from "@/app/actions";

export function TaskCompleteButton({ taskId }: { taskId: string }) {
  return (
    <form action={completeTask}>
      <input type="hidden" name="taskId" value={taskId} />
      <button
        type="submit"
        title="Complete task"
        className="grid h-8 w-8 place-items-center rounded-full border border-[#E2E6DF] bg-white text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700"
      >
        <Check size={16} />
      </button>
    </form>
  );
}
