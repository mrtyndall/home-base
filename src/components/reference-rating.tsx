import { Star } from "lucide-react";
import { setReferenceRating } from "@/app/actions";

export function ReferenceRating({
  referenceId,
  rating,
}: {
  referenceId: string;
  rating: number | null;
}) {
  return (
    <div className="mt-2.5 flex items-center gap-2">
      <div className="inline-flex gap-0.5" aria-label="My rating">
        {[1, 2, 3, 4, 5].map((value) => (
          <form key={value} action={setReferenceRating}>
            <input type="hidden" name="referenceId" value={referenceId} />
            <input type="hidden" name="value" value={value} />
            <button
              type="submit"
              aria-label={value === rating ? "Clear rating" : `Rate ${value}`}
              title={value === rating ? "Clear rating" : `Rate ${value}`}
              className="grid size-6 place-items-center rounded-full text-[#B0ACA2] transition hover:text-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
            >
              <Star
                size={16}
                fill={rating && value <= rating ? "currentColor" : "none"}
                className={rating && value <= rating ? "text-teal-700" : ""}
              />
            </button>
          </form>
        ))}
      </div>
      {rating ? (
        <span className="text-xs text-[#9AA096]">{rating}/5 my rating</span>
      ) : null}
    </div>
  );
}
