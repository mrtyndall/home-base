import { Star } from "lucide-react";
import { toggleTaskStar } from "@/app/actions";

export function TaskStarButton({
  taskId,
  starred,
}: {
  taskId: string;
  starred: boolean;
}) {
  return (
    <form action={toggleTaskStar}>
      <input type="hidden" name="taskId" value={taskId} />
      <button
        type="submit"
        title={starred ? "Unstar task" : "Star task"}
        className="grid h-8 w-8 place-items-center rounded-full border border-[#E2E6DF] bg-white text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700"
      >
        <Star
          size={16}
          className={starred ? "fill-teal-600 text-teal-600" : undefined}
        />
      </button>
    </form>
  );
}
