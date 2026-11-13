// Stop only the Next.js server(s) started from THIS checkout (Linux /proc).
// `npx next start` returns the npx PID, not the next-server child, so `kill $!`
// leaves the server running; `pkill next-server` kills other agents' servers.
import { readdirSync, readFileSync, readlinkSync } from "node:fs";
const here = process.cwd();
let stopped = 0;
let procs = [];
try { procs = readdirSync("/proc").filter((d) => /^\d+$/.test(d)); } catch { console.log("No /proc here: stop the server from its terminal."); process.exit(0); }
for (const pid of procs) {
  try {
    const cmd = readFileSync(`/proc/${pid}/cmdline`, "utf8");
    if (!/next-server|next start/.test(cmd)) continue;
    if (readlinkSync(`/proc/${pid}/cwd`) !== here) continue;
    process.kill(Number(pid), "SIGTERM");
    stopped++;
  } catch { /* gone or not ours */ }
}
console.log(`Stopped ${stopped} server process(es) for ${here}.`);
