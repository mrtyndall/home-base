"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Check,
  ChevronDown,
  Mic,
  Send,
  Square,
  TriangleAlert,
} from "lucide-react";
import {
  normalizeCaptureOptions,
  retainedProjectIdForDestination,
  type CaptureOptions,
} from "@/lib/capture-options";

type CaptureResponse = {
  status: "parsed" | "ambiguous" | "failed";
  message: string;
};

type CaptureIntent = "auto" | "task" | "note" | "idea" | "reference";
type CapturePickerId = "area" | "project";

const captureIntents: Array<{ value: CaptureIntent; label: string }> = [
  { value: "auto", label: "Auto" },
  { value: "task", label: "Task" },
  { value: "note", label: "Note" },
  { value: "idea", label: "Idea" },
  { value: "reference", label: "Reference" },
];

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
  const [captureIntent, setCaptureIntent] = useState<CaptureIntent>("auto");
  const [captureDueDate, setCaptureDueDate] = useState("");
  const [captureAreaId, setCaptureAreaId] = useState("");
  const [captureProjectId, setCaptureProjectId] = useState("");
  const [captureOptions, setCaptureOptions] = useState<CaptureOptions | null>(
    null,
  );
  const [openPicker, setOpenPicker] = useState<CapturePickerId | null>(null);
  const [focused, setFocused] = useState(false);
  const [listening, setListening] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
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

  const expanded =
    focused ||
    rawText.trim().length > 0 ||
    captureIntent !== "auto" ||
    captureDueDate.length > 0 ||
    captureAreaId.length > 0 ||
    captureProjectId.length > 0 ||
    openPicker !== null;

  const selectedProject = captureOptions?.projects.find(
    (project) => project.id === captureProjectId,
  );
  const selectedAreaName =
    captureAreaId.length > 0
      ? captureOptions?.areas.find((area) => area.id === captureAreaId)?.name
      : "Inbox";
  const visibleProjects =
    captureAreaId.length > 0
      ? (captureOptions?.projects.filter(
          (project) => project.areaId === captureAreaId,
        ) ?? [])
      : (captureOptions?.projects ?? []);
  const areaPickerGroups: PickerGroup[] = [
    {
      label: "Global",
      options: [{ value: "", label: "Inbox" }],
    },
    ...(captureOptions?.areas.length
      ? [{
        label: "Areas",
        options: captureOptions.areas.map((area) => ({
          value: area.id,
          label: area.name,
        })),
      }]
      : []),
  ].filter((group) => group.options.length > 0);
  const projectPickerGroups: PickerGroup[] = [
    {
      label: "Project",
      options: [{ value: "", label: "No project" }],
    },
    ...Array.from(
      visibleProjects.reduce((groups, project) => {
        const key = project.areaName;
        const options = groups.get(key) ?? [];
        options.push({
          value: project.id,
          label: project.name,
          detail: project.areaName,
        });
        groups.set(key, options);
        return groups;
      }, new Map<string, PickerOption[]>()),
    ).map(([label, options]) => ({ label, options })),
  ];

  const placeholder =
    captureIntent === "task"
      ? "Task title"
      : captureIntent === "note"
        ? "Note"
        : captureIntent === "idea"
          ? "Idea"
          : captureIntent === "reference"
            ? "Reference"
            : "";

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
        captureIntent,
        captureDueDate:
          captureIntent === "task" && captureDueDate
            ? captureDueDate
            : undefined,
        captureAreaId:
          selectedProject?.areaId ?? (captureAreaId ? captureAreaId : undefined),
        captureProjectId: captureProjectId || undefined,
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
    setCaptureIntent("auto");
    setCaptureDueDate("");
    setCaptureAreaId("");
    setCaptureProjectId("");
    router.refresh();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitCapture("in_app_text");
  }

  function toggleMic() {
    if (!speechSupported || typeof window === "undefined") {
      setStatus("error");
      setMessage(
        "Voice is not available here. Any text already captured is still in the field.",
      );
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

  async function loadCaptureOptions() {
    if (captureOptions) {
      return;
    }

    const response = await fetch("/api/capture/options");
    if (!response.ok) {
      return;
    }
    setCaptureOptions(normalizeCaptureOptions(await response.json()));
  }

  useEffect(() => {
    function closePickerOnOutsidePointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpenPicker(null);
      }
    }

    function closePickerOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenPicker(null);
      }
    }

    document.addEventListener("pointerdown", closePickerOnOutsidePointer);
    document.addEventListener("keydown", closePickerOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closePickerOnOutsidePointer);
      document.removeEventListener("keydown", closePickerOnEscape);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="rounded-[28px] border border-white/65 bg-[#FAFBF9]/60 p-2 shadow-[0_8px_28px_rgba(28,25,23,0.14)] backdrop-blur-xl backdrop-saturate-150"
    >
      <form onSubmit={onSubmit} className="flex w-full items-center gap-2">
        <button
          type="button"
          onClick={toggleMic}
          title={listening ? "Stop voice capture" : "Start voice capture"}
          aria-label={listening ? "Stop voice capture" : "Start voice capture"}
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border transition ${
            listening
              ? "border-teal-700 bg-white text-teal-700"
              : "border-[#E2E6DF] bg-white/80 text-stone-700 hover:border-teal-700/50 hover:text-teal-700"
          }`}
        >
          {listening ? <Square size={16} /> : <Mic size={18} />}
        </button>
        <label className="sr-only" htmlFor="capture-text">
          Capture text
        </label>
        <input
          id="capture-text"
          value={rawText}
          placeholder={placeholder}
          onChange={(event) => setRawText(event.target.value)}
          onFocus={() => {
            setFocused(true);
            void loadCaptureOptions();
          }}
          onBlur={() => setFocused(false)}
          className={`h-11 min-w-0 flex-1 rounded-full border px-4 text-base text-stone-950 outline-none transition focus:border-teal-700 focus:bg-white ${
            listening
              ? "border-teal-700 bg-white"
              : "border-[#E2E6DF] bg-white/80"
          }`}
        />
        <button
          type="submit"
          title="Send capture"
          disabled={status === "saving" || rawText.trim().length === 0}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-teal-700 text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-[#D6DBD3]"
        >
          <Send size={17} />
        </button>
      </form>
      {expanded ? (
        <div className="mt-2 space-y-2 px-1 pb-1">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {captureIntents.map((intent) => (
              <button
                key={intent.value}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setCaptureIntent(intent.value);
                  if (intent.value !== "task") {
                    setCaptureDueDate("");
                  }
                }}
                className={`h-9 shrink-0 rounded-full border px-3 text-sm transition ${
                  captureIntent === intent.value
                    ? "border-teal-700 bg-teal-50 text-teal-800"
                    : "border-[#E2E6DF] bg-white/75 text-stone-600 hover:border-teal-700/50"
                }`}
              >
                {intent.label}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <CapturePicker
              label="Destination"
              valueLabel={selectedAreaName ?? "Inbox"}
              selectedValue={captureAreaId}
              groups={areaPickerGroups}
              open={openPicker === "area"}
              onToggle={() => {
                void loadCaptureOptions();
                setOpenPicker(openPicker === "area" ? null : "area");
              }}
              onSelect={(nextAreaId) => {
                setCaptureAreaId(nextAreaId);
                setCaptureProjectId((currentProjectId) =>
                  retainedProjectIdForDestination(
                    nextAreaId,
                    currentProjectId,
                    captureOptions?.projects ?? [],
                  ),
                );
                setOpenPicker(null);
              }}
            />
            <CapturePicker
              label="Project"
              valueLabel={selectedProject?.name ?? "No project"}
              selectedValue={captureProjectId}
              groups={projectPickerGroups}
              open={openPicker === "project"}
              onToggle={() => {
                void loadCaptureOptions();
                setOpenPicker(openPicker === "project" ? null : "project");
              }}
              onSelect={(nextProjectId) => {
                  setCaptureProjectId(nextProjectId);
                  const project = captureOptions?.projects.find(
                    (candidate) => candidate.id === nextProjectId,
                  );
                  if (project) {
                    setCaptureAreaId(project.areaId);
                  }
                setOpenPicker(null);
              }}
            />
          </div>
          {captureIntent === "task" ? (
            <label className="flex h-10 items-center gap-2 rounded-full border border-[#E2E6DF] bg-white/75 px-3 text-sm text-stone-600">
              <CalendarDays size={16} className="text-teal-700" />
              <span className="shrink-0">Due date</span>
              <input
                type="date"
                value={captureDueDate}
                onChange={(event) => setCaptureDueDate(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-stone-900 outline-none"
              />
            </label>
          ) : null}
        </div>
      ) : null}
      {message ? (
        <div className="flex items-start gap-2 px-3 pb-1.5 pt-2 text-sm text-stone-700">
          {status === "error" ? (
            <TriangleAlert
              className="mt-0.5 shrink-0 text-amber-700"
              size={15}
            />
          ) : (
            <CheckCircle2 className="mt-0.5 shrink-0 text-teal-700" size={15} />
          )}
          <span>{message}</span>
        </div>
      ) : null}
    </div>
  );
}

type PickerOption = {
  value: string;
  label: string;
  detail?: string;
};

type PickerGroup = {
  label: string;
  options: PickerOption[];
};

function CapturePicker({
  label,
  valueLabel,
  selectedValue,
  groups,
  open,
  onToggle,
  onSelect,
}: {
  label: string;
  valueLabel: string;
  selectedValue: string;
  groups: PickerGroup[];
  open: boolean;
  onToggle: () => void;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex h-10 w-full items-center gap-2 rounded-full border bg-white/75 px-3 text-sm transition ${
          open
            ? "border-teal-700 text-teal-800"
            : "border-[#E2E6DF] text-stone-600 hover:border-teal-700/50"
        }`}
      >
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9AA096]">
          {label}
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-stone-900">
          {valueLabel}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 transition ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <div
          role="listbox"
          aria-label={label}
          className="absolute bottom-12 left-0 z-50 max-h-72 w-full min-w-[18rem] overflow-y-auto rounded-[22px] border border-white/70 bg-[#FAFBF9]/90 p-2 text-sm shadow-[0_18px_50px_rgba(28,25,23,0.22)] backdrop-blur-2xl backdrop-saturate-150"
          onMouseDown={(event) => event.preventDefault()}
        >
          {groups.map((group) => (
            <div key={group.label} className="py-1">
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9AA096]">
                {group.label}
              </p>
              <div className="space-y-1">
                {group.options.map((option) => {
                  const selected = option.value === selectedValue;
                  return (
                    <button
                      key={`${group.label}-${option.value || "empty"}`}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => onSelect(option.value)}
                      className={`flex min-h-10 w-full items-center gap-2 rounded-[14px] px-3 py-2 text-left transition ${
                        selected
                          ? "bg-teal-50 text-teal-900"
                          : "text-stone-800 hover:bg-white"
                      }`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {option.label}
                        </span>
                        {option.detail ? (
                          <span className="mt-0.5 block truncate text-xs text-[#7B8178]">
                            {option.detail}
                          </span>
                        ) : null}
                      </span>
                      {selected ? (
                        <Check
                          size={16}
                          aria-hidden="true"
                          className="shrink-0 text-teal-700"
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
