// Isolated world: forwards captures from the page hook to the background worker.
window.addEventListener("message", (e) => {
  if (e.source !== window || !e.data || !e.data.__chatNotes) return;
  try {
    chrome.runtime.sendMessage(e.data);
  } catch {
    // Extension was reloaded; this tab needs a refresh.
  }
});
