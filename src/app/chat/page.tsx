import { ChatSurface } from "@/components/chat-surface";

export const dynamic = "force-dynamic";

export default function ChatPage() {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-normal">Chat</h1>
        <p className="mt-1 text-sm text-stone-500">
          Ask questions of your own data. Read-only — capture stays the door
          for changes.
        </p>
      </header>
      <ChatSurface />
    </div>
  );
}
