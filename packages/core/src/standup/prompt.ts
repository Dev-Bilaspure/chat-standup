import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "../paths";
import { formatDay } from "../time";

/** Bump when prompts or input selection change, so evaluation can compare versions. */
export const PROMPT_VERSION = "standup-v3";

/**
 * Real updates the user wrote, used as a style reference. Kept in data/ (local, not in git) because
 * they contain work details. Edit the file to change the style; it's read on every generation.
 */
export const STYLE_FILE = path.join(DATA_DIR, "style.md");

function styleExamples(): string | null {
  try {
    const text = fs.readFileSync(STYLE_FILE, "utf8").trim();
    return text || null;
  } catch {
    return null;
  }
}

export const STANDUP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["updates"],
  properties: {
    updates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "details", "refs"],
        properties: {
          text: { type: "string", description: "The one-line update, in the user's style." },
          details: { type: "array", items: { type: "string" }, description: "2–5 specific sub-points behind the update." },
          refs: { type: "array", items: { type: "string" }, description: 'Message refs supporting this update, e.g. ["r3","r7"]' },
        },
      },
    },
  },
};

const COMMON = (name: string) => `The user is ${name}, a software engineer. Their own messages are marked "ME". Messages from others matter when they're about the user's work (e.g. someone approved or merged the user's PR, confirmed the user's fix, asked the user for something, unblocked them).

What counts as an update:
- Work the user did, shipped, fixed, tested, reviewed, investigated, discussed or decided.
- Work started or in progress, and anything the user was blocked on or is waiting for. Fold these into the update sentence ("Started working on …", "… which I was blocked on for …"), not separate sections.
- Meaningful syncs with people ("Connected with Priya on …") when something was decided, unblocked or handed over.

Leave out:
- Small talk, social plans, food, sports, birthdays, jokes, personal matters, test messages.
- Other people's work the user wasn't involved in.
- Anything you'd have to guess. If the messages don't support it, leave it out. Never invent details, numbers or names.
- Messages marked as context (before the period); use them only to understand what later messages refer to.

Pasted code, JSON, logs and stack traces have been replaced by placeholders like "[stack trace, 23 lines: java.lang.NullPointerException…]" and long links shortened. Treat a placeholder as "the user shared that here"; don't describe its contents beyond what the placeholder says.

How to write each update ("text"):
- Write it the way the user writes to their lead: plain sentences starting with a past-tense verb — "Completed …", "Raised and merged a fix for …", "Tested …", "Connected with Sam and started working on …", "Worked on …", "Updated …".
- First person is implied; don't start with "I". Use "I" mid-sentence only where natural ("… which I was blocked on").
- Lead with the outcome; add a short status if useful ("Is now working as intended.").
- Name people by first name. Keep the user's domain terms and abbreviations as they use them.
- No PR numbers, ticket ids or links in the text — those go in details.
- One update per piece of work; merge related messages, including across chats. Usually one sentence, at most two.

Details ("details"), shown when the user expands an update:
- 2–5 short sub-points with the specifics: PR numbers and repos, Jira ids, what exactly changed or was tested, who was involved and what they did (approved, reported, asked), current status (raised / in review / merged / deployed to qa or prod), and anything still pending or blocking.
- Only facts from the messages. Copy PR numbers and ids exactly as they appear.

Every update lists the refs (like "r12") of all messages that support it — its text and its details.`;

function withStyle(system: string): string {
  const examples = styleExamples();
  if (!examples) return system;
  return `${system}

Real updates the user wrote before, for voice, length and level of detail only (don't reuse their content):
<examples>
${examples}
</examples>`;
}

export function dailyPrompt(name: string, day: string) {
  return {
    system: withStyle(
      `You write a person's daily work update for their lead, from their work chat.\n\n${COMMON(name)}\n\nThis update covers ${formatDay(day)}. Typically 3–6 updates, ordered by importance.`,
    ),
    header: `Work day: ${formatDay(day)} (${day})`,
  };
}

export function rangePrompt(name: string, start: string, end: string) {
  return {
    system: withStyle(
      `You write a person's progress update for their lead, from their work chat.\n\n${COMMON(name)}\n\nThis update covers ${formatDay(start)} to ${formatDay(end)}. Combine related work across days into outcomes rather than listing each day; in details, say when things happened if it helps (e.g. "merged Wed"). Typically 5–10 updates, ordered by importance.`,
    ),
    header: `Period: ${formatDay(start)} – ${formatDay(end)} (${start} to ${end})`,
  };
}
