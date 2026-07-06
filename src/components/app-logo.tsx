import Image from "next/image";

export function AppLogo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Image
        src="/home-base-mono.svg"
        alt=""
        width={26}
        height={26}
        priority
        className="size-6"
      />
      {compact ? null : (
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700">
          Home Base
        </span>
      )}
    </span>
  );
}
