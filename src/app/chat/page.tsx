import { ChatSurface } from "@/components/chat-surface";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-serif text-[30px] font-medium tracking-[-0.01em] text-stone-950">
          Chat
        </h1>
        <p className="mt-1 text-[13px] text-stone-500">
          Ask questions of your own data. Read-only — capture stays the door for
          changes.
        </p>
      </header>
      <ChatSurface />
    </div>
  );
}
