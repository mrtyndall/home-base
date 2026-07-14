export type TaskScheduleValue = {
  dueDate: string | null;
  someday: boolean;
};

export type TaskDatePreset = {
  key: "today" | "tomorrow" | "weekend" | "next-week" | "someday" | "no-date";
  label: string;
  value: TaskScheduleValue;
};

type DateParts = {
  year: number;
  month: number;
  day: number;
};

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseDateOnly(value: string): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid date-only value: ${value}`);

  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  if (
    parts.month < 1 ||
    parts.month > 12 ||
    parts.day < 1 ||
    parts.day > daysInMonth(parts.year, parts.month)
  ) {
    throw new Error(`Invalid date-only value: ${value}`);
  }
  return parts;
}

function formatDateOnly({ year, month, day }: DateParts) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDateOnlyDays(value: string, count: number) {
  const parts = parseDateOnly(value);
  for (let index = 0; index < count; index += 1) {
    parts.day += 1;
    if (parts.day > daysInMonth(parts.year, parts.month)) {
      parts.day = 1;
      parts.month += 1;
      if (parts.month > 12) {
        parts.month = 1;
        parts.year += 1;
      }
    }
  }
  return formatDateOnly(parts);
}

function weekday(value: string) {
  const { year: inputYear, month, day } = parseDateOnly(value);
  const monthOffsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const year = month < 3 ? inputYear - 1 : inputYear;
  return (
    year +
    Math.floor(year / 4) -
    Math.floor(year / 100) +
    Math.floor(year / 400) +
    monthOffsets[month - 1] +
    day
  ) % 7;
}

export function taskDatePresets(today: string): TaskDatePreset[] {
  const day = weekday(today);
  const weekendOffset = (6 - day + 7) % 7;
  const mondayOffset = (1 - day + 7) % 7 || 7;

  return [
    { key: "today", label: "Today", value: { dueDate: today, someday: false } },
    {
      key: "tomorrow",
      label: "Tomorrow",
      value: { dueDate: addDateOnlyDays(today, 1), someday: false },
    },
    {
      key: "weekend",
      label: "This weekend",
      value: { dueDate: addDateOnlyDays(today, weekendOffset), someday: false },
    },
    {
      key: "next-week",
      label: "Next week",
      value: { dueDate: addDateOnlyDays(today, mondayOffset), someday: false },
    },
    { key: "someday", label: "Someday", value: { dueDate: null, someday: true } },
    { key: "no-date", label: "No date", value: { dueDate: null, someday: false } },
  ];
}

export function displayTaskSchedule(value: TaskScheduleValue | null | undefined) {
  if (value?.someday) return "Someday";
  if (!value?.dueDate) return "No date";

  const { month, day } = parseDateOnly(value.dueDate);
  const monthName = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ][month - 1];
  return `${monthName} ${day}`;
}

export type OptimisticOperationState<Value, Payload> = {
  value: Value;
  previousValue: Value;
  payload: Payload;
  operationToken: string;
  pending: boolean;
  error: string | null;
  retryPayload: Payload | null;
};

export function beginOptimisticOperation<Value, Payload>(
  currentValue: Value,
  nextValue: Value,
  payload: Payload,
  operationToken: string,
): OptimisticOperationState<Value, Payload> {
  return {
    value: nextValue,
    previousValue: currentValue,
    payload,
    operationToken,
    pending: true,
    error: null,
    retryPayload: null,
  };
}

type OptimisticSettlement<Value> =
  | { operationToken: string; ok: true; value?: Value }
  | { operationToken: string; ok: false; error?: string };

export function settleOptimisticOperation<Value, Payload>(
  state: OptimisticOperationState<Value, Payload>,
  settlement: OptimisticSettlement<Value>,
): OptimisticOperationState<Value, Payload> {
  if (settlement.operationToken !== state.operationToken) return state;

  if (settlement.ok) {
    return {
      ...state,
      value: "value" in settlement ? settlement.value as Value : state.value,
      pending: false,
      error: null,
      retryPayload: null,
    };
  }

  return {
    ...state,
    value: state.previousValue,
    pending: false,
    error: settlement.error ?? "Couldn’t update task",
    retryPayload: state.payload,
  };
}
