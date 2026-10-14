import { formatDay } from "../time";

export const TODO_PROMPT_VERSION = "todos-v1";

export const TODO_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["hasTodos", "todos"],
  properties: {
    hasTodos: { type: "boolean", description: "False when nothing in the period needs the user to act." },
    todos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "details", "askedBy", "refs", "doneRef"],
        properties: {
          text: { type: "string", description: "Short imperative action, starting with a verb." },
          details: { type: "array", items: { type: "string" }, description: "1–4 short facts behind the to-do." },
          askedBy: { type: "string", description: "First name of who asked; empty if the user took it on themselves." },
          refs: { type: "array", items: { type: "string" }, description: 'Refs like "r12" of the messages behind it.' },
          doneRef: { type: "string", description: "Ref of a message showing it was already done; empty if not." },
        },
      },
    },
  },
};

const SYSTEM = (name: string) => `You find the to-dos a person has to act on, from their work chat.

The user is ${name}, a software engineer. Their own messages are marked "ME".

A to-do is something the user has to do:
- Someone asked the user for something: review or approve a PR, check or test something, look into an issue, send information, reply, join a call, update a doc.
- The user said they would do something: "will check", "I'll raise a PR", "will update the release note", "let me look into it", "will test once QA is back".
- The user is blocked on someone and has to chase them ("Follow up with Priya on …"). Only when the messages show the user is waiting on it.

Not to-dos:
- Things other people said they'd do, unless the user has to chase them.
- Announcements and FYIs to everyone, unless they ask something of the user specifically.
- Small talk, social plans, birthdays, leave and sick-day messages, test messages, acknowledgements that need no action ("sure", "thanks").
- Anything you'd have to guess. If the messages don't clearly show the user has to do it, leave it out.
- Asks that only appear in messages marked as context (before the period). Those belong to an earlier period.

Already done: messages marked "after the period", and later messages in the period, show what happened next. If they show the user already did it ("done", "merged", "approved", "sent", or the user posted what was asked), still include the to-do and set doneRef to the ref of the message that shows it. Otherwise doneRef is "".

How to write each to-do:
- text: a short action starting with a verb, under 15 words. "Review Sam's audit button PR", "Send Priya the request body JSON for the 3 loans", "Follow up with Sam on pushing the fixes to QA". Name people by first name. No PR numbers, ids or links in the text.
- details: 1–4 short facts: who asked and when, what exactly is needed, PR numbers and Jira ids copied exactly, status, and any deadline mentioned. Refer to the user as "you" ("you said you'd check"), never by name.
- askedBy: first name of who asked; "" if the user took it on themselves.
- refs: refs of every message behind it: the ask, the commitment, and later progress.
- One to-do per piece of work. Merge repeated asks about the same thing.

If nothing in the period needs the user to act, set hasTodos to false and return an empty list.`;

export function todoPrompt(name: string, start: string, end: string, existing: string[]) {
  const period = start === end ? formatDay(start) : `${formatDay(start)} to ${formatDay(end)}`;
  const known = existing.length
    ? `\n\nAlready on the user's list. Don't return these again, even reworded:\n${existing.map((t) => `- ${t}`).join("\n")}`
    : "";
  return { system: SYSTEM(name) + known, header: `Period: ${period} (${start}${start === end ? "" : ` to ${end}`})` };
}
