// Ships captures to the local collector and shows status on the toolbar icon:
//   ON (green)   — capturing and the collector is accepting data
//   IDLE (amber) — collector is fine but no Chat traffic for 3+ minutes (Chat tab closed or asleep)
//   OFF (red)    — the collector isn't reachable, so captures are being lost
const COLLECTOR = "http://127.0.0.1:4777/ingest";
let state = "";

async function setState(next, title) {
  if (next === state) return;
  state = next;
  const look = { on: ["ON", "#16a34a"], idle: ["IDLE", "#d97706"], off: ["OFF", "#dc2626"] }[next];
  await chrome.action.setBadgeText({ text: look[0] });
  await chrome.action.setBadgeBackgroundColor({ color: look[1] });
  await chrome.action.setTitle({ title: `chat-notes capture: ${title}` });
}

chrome.runtime.onMessage.addListener((msg) => {
  fetch(COLLECTOR, { method: "POST", body: JSON.stringify(msg) })
    .then(async () => {
      await chrome.storage.session.set({ lastOk: Date.now() });
      await setState("on", "capturing");
    })
    .catch(() => setState("off", "collector not running — captures are being lost"));
});

chrome.alarms.create("status", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(async () => {
  const { lastOk = 0 } = await chrome.storage.session.get("lastOk");
  if (Date.now() - lastOk > 3 * 60_000) {
    const up = await fetch("http://127.0.0.1:4777/health").then((r) => r.ok).catch(() => false);
    await setState(up ? "idle" : "off", up ? "no Chat traffic — open chat.google.com" : "collector not running");
  }
});
