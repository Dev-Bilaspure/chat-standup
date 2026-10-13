// Installs the collector and the web app as macOS LaunchAgents (start at login, restart on crash).
//   pnpm services:install     build the web app, write both agents, start them
//   pnpm services:restart     rebuild the web app and restart both (after code changes)
//   pnpm services:uninstall   stop and remove both agents
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DATA_DIR, REPO_ROOT } from "@chat-notes/core";

const AGENTS_DIR = path.join(os.homedir(), "Library/LaunchAgents");
const LOG_DIR = path.join(DATA_DIR, "logs");
const domain = `gui/${process.getuid!()}`;
const node = process.execPath;
const PATH = [path.dirname(node), path.join(os.homedir(), ".local/bin"), "/usr/local/bin", "/opt/homebrew/bin", "/usr/bin", "/bin"].join(":");

const services = [
  {
    label: "com.chatnotes.collector",
    cwd: REPO_ROOT,
    args: [node, path.join(REPO_ROOT, "node_modules/tsx/dist/cli.mjs"), path.join(REPO_ROOT, "apps/collector/src/main.ts")],
    log: path.join(LOG_DIR, "collector.log"),
  },
  {
    label: "com.chatnotes.web",
    cwd: path.join(REPO_ROOT, "apps/web"),
    args: [node, path.join(REPO_ROOT, "apps/web/node_modules/next/dist/bin/next"), "start", "-p", "3456", "-H", "127.0.0.1"],
    log: path.join(LOG_DIR, "web.log"),
  },
];

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const plist = (s: (typeof services)[number]) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${s.label}</string>
  <key>ProgramArguments</key>
  <array>${s.args.map((a) => `\n    <string>${xml(a)}</string>`).join("")}
  </array>
  <key>WorkingDirectory</key><string>${xml(s.cwd)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>${xml(PATH)}</string>
    <key>NODE_ENV</key><string>production</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>${xml(s.log)}</string>
  <key>StandardErrorPath</key><string>${xml(s.log)}</string>
</dict>
</plist>
`;

const plistPath = (label: string) => path.join(AGENTS_DIR, `${label}.plist`);
const launchctl = (...args: string[]) => {
  try {
    execFileSync("launchctl", args, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
};
const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const loaded = (label: string) => launchctl("print", `${domain}/${label}`);

/** bootout returns before launchd has finished tearing the service down; wait until it's really gone. */
function stop(label: string) {
  launchctl("bootout", `${domain}/${label}`);
  for (let i = 0; i < 50 && loaded(label); i++) sleep(200);
}

function start(label: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    if (launchctl("bootstrap", domain, plistPath(label))) return;
    sleep(500);
  }
  throw new Error(`launchctl bootstrap failed for ${label}. Check: launchctl print ${domain}/${label}`);
}
const buildWeb = () => {
  console.log("Building the web app…");
  execFileSync("pnpm", ["--filter", "web", "build"], { cwd: REPO_ROOT, stdio: "inherit" });
};

const mode = process.argv.includes("--uninstall") ? "uninstall" : process.argv.includes("--restart") ? "restart" : "install";

if (mode === "uninstall") {
  for (const s of services) {
    stop(s.label);
    fs.rmSync(plistPath(s.label), { force: true });
    console.log(`removed ${s.label}`);
  }
} else {
  buildWeb();
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.mkdirSync(AGENTS_DIR, { recursive: true });
  for (const s of services) {
    stop(s.label);
    fs.writeFileSync(plistPath(s.label), plist(s));
    start(s.label);
    console.log(`${mode === "restart" ? "restarted" : "installed"} ${s.label} (log: ${path.relative(REPO_ROOT, s.log)})`);
  }
  console.log("\nCollector: http://127.0.0.1:4777/health\nApp:       http://127.0.0.1:3456");
}
