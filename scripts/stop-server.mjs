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
    if (Number(pid) === process.pid || Number(pid) === process.ppid) continue;
    const argv = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0");
    // Only the server itself: `next-server (vX)` or node running next's bin with "start".
    // A shell whose command line merely mentions "next start" must not match.
    const isServer = argv[0].startsWith("next-server") || (/node$/.test(argv[0]) && argv.some((a) => /next[\\/]dist[\\/]bin[\\/]next$|\.bin[\\/]next$/.test(a)) && argv.includes("start"));
    if (!isServer) continue;
    if (readlinkSync(`/proc/${pid}/cwd`) !== here) continue;
    process.kill(Number(pid), "SIGTERM");
    stopped++;
  } catch { /* gone or not ours */ }
}
console.log(`Stopped ${stopped} server process(es) for ${here}.`);
