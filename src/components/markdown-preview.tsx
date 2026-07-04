export function MarkdownPreview({
  body,
  className = "",
}: {
  body: string;
  className?: string;
}) {
  return (
    <div className={`space-y-2 text-sm text-stone-800 ${className}`}>
      {body.split(/\n{2,}/).map((block, index) => {
        const trimmed = block.trim();
        if (trimmed.startsWith("# ")) {
          return (
            <h3 key={index} className="text-base font-semibold text-stone-900">
              {trimmed.slice(2)}
            </h3>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h4 key={index} className="font-semibold text-stone-900">
              {trimmed.slice(3)}
            </h4>
          );
        }
        return (
          <p key={index} className="whitespace-pre-wrap">
            {trimmed}
          </p>
        );
      })}
    </div>
  );
}
