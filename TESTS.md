# Feasibility tests (Chrome extension route)

## One-time setup for this round

1. `chrome://extensions` → **↻ reload** "chat-notes capture (spike)" (picks up v2 of `hook.js`).
2. Chrome → Settings → Performance → **Always keep these sites active** → add `chat.google.com`.
3. Start the receiver (leave it running the whole time):
   ```sh
   cd ~/dev/chat-notes && npx tsx spike/capture.ts \
     --canary zebra42 --canary otter42 --canary lynx42 --canary heron42 --canary phone42 \
     --canary idle42 --canary gap42 --canary gap43 --canary sleep42
   ```
4. **Reload the chat.google.com tab.** The receiver must print `[frame] … https://chat.google.com/`.

A `✔ CANARY "x" seen via <endpoint>` line means it was captured. The endpoint tells you how:
`multi-watch/channel` = live push, `list_topics` = loaded when a chat was opened.

## Tests

Keep an **unrelated** chat open on screen unless a step says otherwise.

| # | Hypothesis | Do this | Pass if |
|---|---|---|---|
| 1 | Live: DMs you aren't viewing | Someone DMs you `zebra42` | CANARY via `multi-watch/channel` |
| 2 | Live: group chats / spaces you aren't viewing | Someone posts `otter42` in a group DM or space | same |
| 3 | Live: thread replies | Someone replies `lynx42` in a thread in a space | same |
| 4 | Edits | Edit one of your messages to include `heron42` | same |
| 5 | Your messages from another device | Send `phone42` from your **phone** | same |
| 6 | Background tab stays alive | Use other tabs/apps for ≥30 min (Chat tab in background), then someone DMs `idle42` | CANARY appears, and no `⚠ nothing received` warnings in that window |
| 7 | Recovery after Chrome was closed | **Cmd+Q Chrome**. Someone sends `gap42` (DM) and `gap43` (group). Wait 2 min. Reopen Chrome → Chat → click the unread chats | CANARY via `list_topics` (or any non-channel endpoint) |
| 8 | Recovery after laptop sleep | Close the lid ≥10 min; someone DMs `sleep42`; open lid, don't touch Chat for 1 min | CANARY appears by itself (live reconnect). If not: click the chat → appears via `list_topics` |
| 9 | Automated fetch (no clicking) | See below | messages from a chat you never opened this session show up |

### Test 9: fetch a chat without opening it

1. In the Chat tab, open **any** chat once (so the extension has seen a `list_topics` request).
2. Find the ID of a chat you have **not** opened this session:
   ```sh
   npx tsx spike/chats.ts            # or: npx tsx spike/chats.ts <part of a name>
   ```
   Pick one of the same kind if possible (a DM ID like `tTxJoSAAAAE`, or a space/group ID starting `AAQA`).
3. In the Chat tab: **View → Developer → JavaScript Console** (Chrome may ask you to type `allow pasting` first), then run:
   ```js
   await __chatNotes.fetchChat("<that ID>")
   ```
   Pass if it logs `status: 200` and `mentionsTarget: true`.
4. Confirm the messages were captured and parse:
   ```sh
   npx tsx spike/conversation.ts <that ID>
   ```
   Pass if it shows that chat's recent messages as `history`.

## Results to paste back

```sh
npx tsx spike/find.ts zebra42 otter42 lynx42 heron42 phone42 idle42 gap42 gap43 sleep42
```
plus the receiver's Ctrl+C summary, the `fetchChat` console output, and the `conversation.ts` output from test 9
(or just the first few lines if you'd rather not share message contents).
