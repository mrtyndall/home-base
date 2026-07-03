import { ArchiveRestore, Check, Pause, X } from "lucide-react";
import {
  completeProject,
  killProject,
  parkProject,
  unparkProject,
} from "@/app/actions";

export function ParkProjectForm({ projectId }: { projectId: string }) {
  return (
    <form action={parkProject} className="mt-4 flex flex-col gap-2">
      <input type="hidden" name="projectId" value={projectId} />
      <input
        name="whereLeftOff"
        placeholder="Where I left off"
        className="h-10 rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
      />
      <button
        type="submit"
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 transition hover:border-teal-500 hover:text-teal-700"
      >
        <Pause size={15} />
        Park
      </button>
    </form>
  );
}

export function UnparkProjectButton({ projectId }: { projectId: string }) {
  return (
    <form action={unparkProject} className="mt-4">
      <input type="hidden" name="projectId" value={projectId} />
      <button
        type="submit"
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-medium text-white transition hover:bg-teal-800"
      >
        <ArchiveRestore size={15} />
        Unpark
      </button>
    </form>
  );
}

export function CompleteProjectButton({ projectId }: { projectId: string }) {
  return (
    <form action={completeProject}>
      <input type="hidden" name="projectId" value={projectId} />
      <button
        type="submit"
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 transition hover:border-teal-500 hover:text-teal-700"
      >
        <Check size={15} />
        Complete
      </button>
    </form>
  );
}

export function KillProjectButton({ projectId }: { projectId: string }) {
  return (
    <form action={killProject}>
      <input type="hidden" name="projectId" value={projectId} />
      <button
        type="submit"
        className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-stone-300 bg-white px-3 text-sm font-medium text-stone-700 transition hover:border-stone-500 hover:text-stone-950"
      >
        <X size={15} />
        Kill
      </button>
    </form>
  );
}
