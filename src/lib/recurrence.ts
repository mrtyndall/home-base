import { RRule } from "rrule";

const simpleRepeatLabels = new Map<string, string>([
  ["every day", "Daily"],
  ["every week", "Weekly"],
  ["every month", "Monthly"],
  ["every year", "Yearly"],
]);

const simpleRuleLabels = new Map<string, string>([
  ["FREQ=DAILY", "Daily"],
  ["FREQ=WEEKLY", "Weekly"],
  ["FREQ=MONTHLY", "Monthly"],
  ["FREQ=YEARLY", "Yearly"],
]);

export function formatRecurrenceRule(rule: string | null | undefined) {
  if (!rule) return "";
  const normalizedRule = rule.trim().toUpperCase();
  const simpleRuleLabel = simpleRuleLabels.get(normalizedRule);
  if (simpleRuleLabel) return simpleRuleLabel;

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
