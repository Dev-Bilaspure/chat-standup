# chat-standup: stand-up updates from Google Chat

Drafts your daily stand-up and date-range updates (e.g. weekly, for your lead) from your Google Chat
messages. Everything runs locally; only the messages selected for a stand-up are sent to the LLM.

```
Chrome extension ──► collector (127.0.0.1:4777) ──► SQLite (data/) ◄── web app (127.0.0.1:3456) ──► LLM
 captures Chat         keeps raw captures,                               generate, review,
 web traffic           parses messages                                   give feedback
```

## Setup (once)

1. **Stop the old spike receiver** (`capture.ts`) if it's still running in a terminal; the collector uses the same port.
2. **Install the services**: collector and web app as background services (start at login, restart on crash):
   ```sh
   pnpm install
   pnpm services:install
   ```
3. **Update the extension**: `chrome://extensions` → ↻ on *chat-notes capture* (v0.1.0) → then **reload the chat.google.com tab**.
   Pin the extension: its badge shows **ON** (capturing), **IDLE** (no Chat tab), **OFF** (collector down).
4. Open **http://127.0.0.1:3456**.

Keep `chat.google.com` open in Chrome (Settings → Performance → *Always keep these sites active*). When you come
back after time away, open the chats you were active in: their history is captured when you open them.

## The two-week trial

| When | Do |
|---|---|
| End of each work day (~7 pm) | **Stand-ups → Day** → *Generate stand-up* for today. |
| Next morning, after stand-up | Open it again and fill in **Your feedback**: rating, how you used it, tick wrong bullets, list what was missing (one per line), and paste/edit what you actually said. |
| Friday (or whenever you report to your lead) | **Stand-ups → Date range** → *This week* → *Generate update*, then feedback the same way. |
| Any time | **Stand-ups → Library** lists every stand-up you've generated (all days, ranges and versions): search, filter by type/status/period, sort, open, copy, generate a new version, or delete (Trash with Undo; delete permanently from Trash). |
| End of trial | **Results** shows the numbers; *Export JSON* saves everything for analysis. Trashed items are excluded. |

The feedback is the point of the trial; a stand-up without feedback tells us nothing. It takes about a minute.

**What the results mean** (Results page):
- **Usable**: share you sent as-is or with minor edits. The headline number.
- **Bullet precision**: share of bullets not ticked as wrong. Low = noise or hallucination.
- **Missing items per update**: what it failed to include. High = recall problem (often a data gap; check the Data page).
- **Similarity to what you sent**: word overlap between the draft and your final version.

If a stand-up is bad, check **Data** first: if your messages weren't captured that day, it's a capture problem, not an LLM problem. Every bullet expands to the exact messages it came from, and each generation stores the exact input sent to the model.

## Your writing style

Updates are written in your voice: a flat "Updates:" list of one-liners, each expanding to details (PRs, Jira, people,
status) with references taken from the cited messages. To steer the voice, put a few real updates you've written into
`data/style.md` (local only, not in git); it's read on every generation, no restart needed.

## Todos

**Todos** finds what your chats say you need to do: asks (reviews, approvals, checks), things you said you'd do,
and people you need to chase. Pick a day or a date range (past days only, up to yesterday) and **Find todos**.

- Each day is read once. A range is scanned day by day, skipping days already scanned, so asking again (for the
  same day, or a range that includes it) never creates duplicates. **Scan again** on a single day re-reads it, for
  when more of that day was captured later; only new todos are added.
- If the chat shows a todo was already done later, it's added already checked, with the message that shows it.
- Click a todo's text to edit it (Enter to finish, Escape to undo). Expand it for details, references, the source
  messages and a notes pad. Text and notes save as you type; there's no save button.
- **Add your own** with the bar at the top (press `N` anywhere to jump there): type, optionally pick who it's from
  (fuzzy search over people in your chats, or type any name) and the day, then Enter. Your own todos are marked
  with a pencil and work like the others, minus the chat details. A later scan of that day won't add them again.
- **All todos** shows everything; **Day** / **Date range** show todos from those days and whether they've been scanned.

## Configuration

LLM settings go in `apps/web/.env.local` (then `pnpm services:restart`):

```sh
LLM_PROVIDER=claude-code   # default: headless Claude Code on your subscription
LLM_MODEL=sonnet           # default for claude-code
# LLM_PROVIDER=openai
# LLM_MODEL=<model name>
# OPENAI_API_KEY=...
```

## Commands

| Command | |
|---|---|
| `pnpm services:install` / `services:restart` / `services:uninstall` | Background services (restart after code changes) |
| `pnpm reparse` | Rebuild messages from raw captures (after parser changes); keeps generations and feedback |
| `pnpm collector` / `pnpm web` | Run in the foreground for development (stop the services first; same ports) |
| `pnpm typecheck` | Typecheck all packages |

Logs: `data/logs/collector.log`, `data/logs/web.log`. Data: `data/chat-notes.db`, raw captures in `data/raw/`.

## Layout

- `extension/`: Chrome extension (MV3) that hooks Chat's network traffic in the page and forwards it.
- `apps/collector/`: ingest service, reparse, service installer.
- `apps/web/`: Next.js + shadcn UI.
- `packages/core/`: database, parser (JSON + protobuf), stand-up input selection, prompts, LLM providers, evaluation.
- `spike/`: feasibility scripts from the initial investigation (see `TESTS.md`).
