export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="h-9 w-44 animate-pulse rounded-[10px] bg-[#E2E6DF]" />
      <div className="h-5 w-64 animate-pulse rounded-[8px] bg-[#E2E6DF]" />
      <div className="space-y-2.5">
        <div className="h-[84px] animate-pulse rounded-[14px] bg-[#E7EBE4]" />
        <div className="h-[84px] animate-pulse rounded-[14px] bg-[#E7EBE4]" />
        <div className="h-[84px] animate-pulse rounded-[14px] bg-[#E7EBE4]" />
      </div>
    </div>
  );
}
