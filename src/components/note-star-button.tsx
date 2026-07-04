import { Star } from "lucide-react";
import { setEntityNoteStarred } from "@/app/actions";

export function NoteStarButton({
  noteId,
  starred,
}: {
  noteId: string;
  starred: boolean;
}) {
  return (
    <form action={setEntityNoteStarred}>
      <input type="hidden" name="noteId" value={noteId} />
      <input type="hidden" name="starred" value={starred ? "false" : "true"} />
      <button
        type="submit"
        title={starred ? "Unstar note" : "Star note"}
        className="grid h-8 w-8 place-items-center rounded-full border border-[#E2E6DF] bg-white text-stone-600 transition hover:border-teal-700/50 hover:text-teal-700"
      >
        <Star
          size={16}
          className={starred ? "fill-teal-700 text-teal-700" : undefined}
        />
      </button>
    </form>
  );
}
