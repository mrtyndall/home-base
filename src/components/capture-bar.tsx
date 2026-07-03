"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useRef, useState } from "react";
import { CheckCircle2, Mic, Send, Square, TriangleAlert } from "lucide-react";

type CaptureResponse = {
  status: "parsed" | "ambiguous" | "failed";
  message: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex?: number;
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type SpeechRecognitionErrorEventLike = {
  error?: string;
};

type BrowserWithSpeech = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

export function CaptureBar() {
  const router = useRouter();
  const [rawText, setRawText] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "ok" | "error">(
    "idle",
  );
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const voiceDraftRef = useRef("");
  const voiceErrorRef = useRef(false);

  const speechSupported = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }

    const speechWindow = window as BrowserWithSpeech;
    return Boolean(
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition,
    );
  }, []);

  async function submitCapture(
    source: "in_app_text" | "in_app_voice",
    textOverride?: string,
  ) {
    const text = (textOverride ?? rawText).trim();
    if (!text) {
      return;
    }

    setStatus("saving");
    setMessage(null);

    const response = await fetch("/api/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rawText: text,
        source,
        deviceContext: {
          userAgent: navigator.userAgent,
        },
      }),
    });

    const body = (await response.json()) as Partial<CaptureResponse> & {
      error?: string;
    };

    if (!response.ok) {
      setStatus("error");
      setMessage(body.error ?? "Capture failed.");
      return;
    }

    setStatus(body.status === "failed" ? "error" : "ok");
    setMessage(body.message ?? "Capture saved.");
    setRawText("");
    router.refresh();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitCapture("in_app_text");
  }

  function toggleMic() {
    if (!speechSupported || typeof window === "undefined") {
      setStatus("error");
      setMessage("Voice is not available here. Any text already captured is still in the field.");
      return;
    }

    const speechWindow = window as BrowserWithSpeech;
    const SpeechRecognition =
      speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    voiceDraftRef.current = rawText;
    voiceErrorRef.current = false;
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();

      if (transcript) {
        voiceDraftRef.current = transcript;
        setRawText(transcript);
      }
    };
    recognition.onerror = (event) => {
      voiceErrorRef.current = true;
      setListening(false);
      setStatus("error");
      setRawText(voiceDraftRef.current);
      setMessage(
        event.error
          ? `Voice stopped: ${event.error}. Transcript stayed in the field.`
          : "Voice stopped. Transcript stayed in the field.",
      );
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
      const transcript = voiceDraftRef.current.trim();
      if (!voiceErrorRef.current && transcript) {
        void submitCapture("in_app_voice", transcript);
      }
    };
    setListening(true);
    recognition.start();
  }

  return (
    <div className="border-t border-stone-200 bg-stone-50/95 px-4 py-3 shadow-[0_-12px_32px_rgba(30,41,59,0.08)] backdrop-blur">
      <form
        onSubmit={onSubmit}
        className="mx-auto flex w-full max-w-4xl items-center gap-2"
      >
        <button
          type="button"
          onClick={toggleMic}
          title={listening ? "Stop voice capture" : "Start voice capture"}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-md border border-stone-300 bg-white px-4 text-sm font-medium text-stone-700 transition hover:border-teal-500 hover:text-teal-700"
        >
          {listening ? <Square size={18} /> : <Mic size={19} />}
          {listening ? "Stop" : "Voice"}
        </button>
        <label className="sr-only" htmlFor="capture-text">
          Capture text
        </label>
        <input
          id="capture-text"
          value={rawText}
          onChange={(event) => setRawText(event.target.value)}
          className="h-11 min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 text-base text-stone-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
        />
        <button
          type="submit"
          title="Send capture"
          disabled={status === "saving" || rawText.trim().length === 0}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-md bg-teal-700 text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          <Send size={18} />
        </button>
      </form>
      {message ? (
        <div className="mx-auto mt-2 flex max-w-4xl items-start gap-2 text-sm text-stone-700">
          {status === "error" ? (
            <TriangleAlert className="mt-0.5 shrink-0 text-amber-700" size={16} />
          ) : (
            <CheckCircle2 className="mt-0.5 shrink-0 text-teal-700" size={16} />
          )}
          <span>{message}</span>
        </div>
      ) : null}
    </div>
  );
}
