import { existsSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const statePath = resolve(root, ".dev-local", "runtime.json");
const log = (scope, message) => console.info(`[${scope}] ${message}`);

const processExists = (pid) => {
  try { process.kill(pid, 0); return true; } catch { return false; }
};

const managedProcess = (pid) => {
  const result = spawnSync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], { encoding: "utf8" });
  const cwd = result.stdout.split("\n").find((line) => line.startsWith("n"))?.slice(1);
  return Boolean(cwd && (cwd === root || cwd.startsWith(`${root}/`)));
};

if (existsSync(statePath)) {
  try {
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    for (const [name, pid] of Object.entries(state.children ?? {})) {
      if (!Number.isInteger(pid) || !processExists(pid)) continue;
      if (!managedProcess(pid)) {
        log("dev", `Skipping unverified ${name} process`);
        continue;
      }
      process.kill(pid, "SIGTERM");
      log("dev", `Stopped ${name}`);
    }
  } catch {
    log("dev", "No readable managed-process state found");
  }
  rmSync(statePath, { force: true });
} else {
  log("dev", "No managed app processes found");
}

const stop = spawnSync("pnpm", ["exec", "supabase", "stop"], {
  cwd: root,
  stdio: ["ignore", "pipe", "pipe"]
});
if (stop.status === 0) log("db", "Local Supabase stopped");
else {
  console.error("[db] Local Supabase stop failed. Run pnpm db:stop for detailed output.");
  process.exitCode = 1;
}
