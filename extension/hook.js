// Runs in the page's own JS world at document_start, before Chat's code loads.
// Tees response bodies of fetch / XHR / WebSocket traffic to the relay script.
// On chat.google.com everything is captured; inside Gmail only Chat-looking URLs are,
// so email traffic is never captured (other URLs are logged as path only).
(() => {
  if (window.__chatNotesHooked) return;
  window.__chatNotesHooked = true;

  const onChatHost = location.hostname === "chat.google.com";
  const frame = location.origin + location.pathname;
  let seq = 0;
  let ridCounter = 0;
  // Identifies one request, so the collector can reassemble responses delivered in slices.
  const newRid = () => `${frame}#${Date.now().toString(36)}.${ridCounter++}`;

  const parse = (u) => {
    try {
      return new URL(u, location.href);
    } catch {
      return null;
    }
  };
  const isChat = (url) => onChatHost || (url && (url.hostname === "chat.google.com" || /dynamite|\/chat\//i.test(url.pathname)));
  const send = (kind, rawUrl, body, extra) => {
    const url = parse(String(rawUrl));
    const endpoint = url ? url.origin + url.pathname : String(rawUrl).slice(0, 200);
    const capture = isChat(url);
    window.postMessage(
      { __chatNotes: true, seq: seq++, t: Date.now(), frame, kind, endpoint, body: capture ? body : null, captured: capture, ...extra },
      location.origin,
    );
  };

  // fetch: read a clone chunk by chunk so long-lived streaming responses are seen too.
  const origFetch = window.fetch;
  window.fetch = async function (input, init) {
    const res = await origFetch.apply(this, arguments);
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input?.url;
    const rid = newRid();
    try {
      const reader = res.clone().body?.getReader();
      if (reader) {
        const decoder = new TextDecoder();
        (async () => {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            send("fetch", url, decoder.decode(value, { stream: true }), { rid });
          }
        })().catch(() => {});
      }
    } catch {}
    return res;
  };

  // XHR: send each newly arrived slice of responseText (covers streaming/long-poll channels).
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__cnMethod = method;
    this.__cnUrl = url;
    this.__cnLen = 0;
    this.__cnHeaders = [];
    this.__cnRid = newRid();
    if (!this.__cnHooked) {
      this.__cnHooked = true;
      this.addEventListener("readystatechange", () => {
        if (this.readyState < 3) return;
        if (this.responseType !== "" && this.responseType !== "text") {
          if (this.readyState === 4) send("xhr-" + this.responseType, this.__cnUrl, null, { rid: this.__cnRid, final: true });
          return;
        }
        const text = this.responseText;
        if (text.length > this.__cnLen || this.readyState === 4) {
          send("xhr", this.__cnUrl, text.slice(this.__cnLen), { rid: this.__cnRid, final: this.readyState === 4 });
          this.__cnLen = text.length;
        }
      });
    }
    return origOpen.apply(this, arguments);
  };

  // Chat API requests: remember the latest request per endpoint (kept in page memory only) so it
  // can be replayed for another conversation. Only header *names* and the body leave the page.
  const templates = {};
  const origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    this.__cnHeaders?.push([name, value]);
    return origSetHeader.apply(this, arguments);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
    const url = parse(String(this.__cnUrl));
    if (url && url.hostname === "chat.google.com" && url.pathname.includes("/api/")) {
      const bodyText = typeof body === "string" ? body : null;
      templates[url.pathname.split("/").pop()] = { method: this.__cnMethod, url: url.href, headers: this.__cnHeaders, body: bodyText };
      send("request", url.href, JSON.stringify({ method: this.__cnMethod, headerNames: this.__cnHeaders.map((h) => h[0]), body: bodyText ?? `[${body?.constructor?.name ?? typeof body}]` }));
    }
    return origSend.apply(this, arguments);
  };

  // Test helper, run from the Chat tab's DevTools console:
  //   __chatNotes.endpoints()          → API calls seen so far
  //   __chatNotes.fetchChat("<id>")    → replays the last list_topics request for another conversation
  const convRef = (id) => (id.startsWith("AAQA") ? `[["${id}"]]` : `[null,null,["${id}"]]`);
  window.__chatNotes = {
    endpoints: () => Object.keys(templates),
    fetchChat(toId, endpoint = "list_topics") {
      const t = templates[endpoint];
      if (!t) return Promise.reject(new Error(`No ${endpoint} request seen yet. Open any chat first, then retry.`));
      if (!t.body) return Promise.reject(new Error(`${endpoint} body is not text; replay not supported.`));
      const m = t.body.match(/\[null,null,\["([A-Za-z0-9_-]+)"\]\]|\[\["(AAQA[A-Za-z0-9_-]+)"\]\]/);
      if (!m) return Promise.reject(new Error(`Could not find a conversation ID in the ${endpoint} request body.`));
      const fromId = m[1] ?? m[2];
      const body = t.body.split(convRef(fromId)).join(convRef(toId));
      return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open(t.method, t.url);
        for (const [k, v] of t.headers) xhr.setRequestHeader(k, v);
        xhr.onloadend = () => {
          const result = { status: xhr.status, bytes: xhr.responseText.length, mentionsTarget: xhr.responseText.includes(toId), replacedFrom: fromId };
          console.log("[chat-notes] fetchChat", toId, result);
          resolve(result);
        };
        xhr.send(body);
      });
    },
  };

  // WebSocket frames.
  const OrigWS = window.WebSocket;
  window.WebSocket = function (url, protocols) {
    const ws = new OrigWS(url, protocols);
    ws.addEventListener("message", (e) => send("ws", url, typeof e.data === "string" ? e.data : "[binary]"));
    return ws;
  };
  window.WebSocket.prototype = OrigWS.prototype;
  for (const k of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) window.WebSocket[k] = OrigWS[k];

  // Workers: traffic made from inside a worker bypasses these hooks; log that they exist.
  for (const name of ["Worker", "SharedWorker"]) {
    const Orig = window[name];
    if (!Orig) continue;
    window[name] = function (url, opts) {
      send("worker-created:" + name, url, null);
      return new Orig(url, opts);
    };
    window[name].prototype = Orig.prototype;
  }

  send("frame-loaded", location.href, null);
})();
