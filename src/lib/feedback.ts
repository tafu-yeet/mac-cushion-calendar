// The kinds of feedback people can send, shared by the form and the admin list.

export const FEEDBACK_TYPES = [
  { key: "wrong_info", label: "Wrong info", placeholder: "What's wrong? e.g. it moved to 7 PM, or the food isn't free." },
  { key: "missing_event", label: "Missing event", placeholder: "Which event? A link to the club's post helps us add it." },
  { key: "idea", label: "Idea", placeholder: "What would make this better for you?" },
  { key: "bug", label: "Bug", placeholder: "What happened, and what did you expect?" },
] as const;

export type FeedbackType = (typeof FEEDBACK_TYPES)[number]["key"];

export const MAX_MESSAGE = 1000;
export const MAX_CONTACT = 200;

export function isFeedbackType(value: unknown): value is FeedbackType {
  return FEEDBACK_TYPES.some((t) => t.key === value);
}

export function feedbackLabel(type: string): string {
  return FEEDBACK_TYPES.find((t) => t.key === type)?.label ?? type;
}
