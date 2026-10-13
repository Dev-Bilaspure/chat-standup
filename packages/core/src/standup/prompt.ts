import { formatDay } from "../time";

/** Bump when prompts or input selection change, so evaluation can compare versions. */
export const PROMPT_VERSION = "standup-v1";

export const SECTIONS = [
  { key: "done", title: "Done" },
  { key: "in_progress", title: "In progress" },
  { key: "blocked", title: "Blocked / waiting on" },
  { key: "next", title: "Next" },
] as const;
export type SectionKey = (typeof SECTIONS)[number]["key"];

const bullet = {
  type: "object",
  additionalProperties: false,
  required: ["text", "refs"],
  properties: {
    text: { type: "string" },
    refs: { type: "array", items: { type: "string" }, description: 'Message refs supporting this bullet, e.g. ["r3","r7"]' },
  },
};
export const STANDUP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: SECTIONS.map((s) => s.key),
  properties: Object.fromEntries(SECTIONS.map((s) => [s.key, { type: "array", items: bullet }])),
};

const COMMON = (name: string) => `The user is ${name}, a software engineer. Their own messages are marked "ME". Messages from others are context; they matter when they're about the user's work (e.g. someone approved or merged the user's PR, confirmed the user's fix, asked the user for something).

Include:
- Work the user did, shipped, fixed, reviewed, investigated, discussed or decided.
- Work in progress, and anything blocking the user or that they're waiting on (say what or whom).
- "next": only things the user said they will do, or clearly agreed to do.

Leave out:
- Small talk, social plans, food, sports, birthdays, jokes, personal matters, test messages.
- Other people's work the user wasn't involved in.
- Anything you'd have to guess. If the messages don't support it, leave it out. Never invent details.
- Messages marked as context (before the period) — use them only to understand what later messages refer to.

Style:
- Start bullets with a verb, past tense for done ("Raised PR #9572 for …", "Fixed …", "Reviewed …"). No "I".
- Be specific: feature or service names, PR/ticket numbers, and the people involved. Prefer PR/ticket numbers over raw links.
- One bullet per piece of work; merge related messages, including across chats, into one bullet.
- Keep each bullet to one line, ideally under 25 words. Empty sections are fine.
- Every bullet lists the refs (like "r12") of the messages that support it.`;

export function dailyPrompt(name: string, day: string) {
  return {
    system: `You write stand-up updates from a person's work chat.\n\n${COMMON(name)}\n\nThis is a daily update: what the user will say at the next morning's stand-up about ${formatDay(day)}. Typically 2–8 bullets in "done".`,
    header: `Work day: ${formatDay(day)} (${day})`,
  };
}

export function rangePrompt(name: string, start: string, end: string) {
  return {
    system: `You write progress updates from a person's work chat.\n\n${COMMON(name)}\n\nThis update covers ${formatDay(start)} to ${formatDay(end)} and is for the user's lead. Group related work across days into outcomes rather than listing daily activity. Mention a day only when it helps (e.g. "shipped Wed"). Typically 4–12 bullets in "done".`,
    header: `Period: ${formatDay(start)} – ${formatDay(end)} (${start} to ${end})`,
  };
}
