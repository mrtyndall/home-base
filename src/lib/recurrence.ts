import { RRule } from "rrule";

const simpleRepeatLabels = new Map<string, string>([
  ["every day", "Daily"],
  ["every week", "Weekly"],
  ["every month", "Monthly"],
  ["every year", "Yearly"],
]);

export function formatRecurrenceRule(rule: string | null | undefined) {
  if (!rule) return "";

  try {
    const text = RRule.fromString(rule).toText();
    return simpleRepeatLabels.get(text) ?? sentenceCase(text);
  } catch {
    return rule;
  }
}

function sentenceCase(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}
