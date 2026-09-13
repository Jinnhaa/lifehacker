import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stateDirectory = resolve(root, ".dev-local");
const statePath = resolve(stateDirectory, "runtime.json");
const webPort = 3000;
const children = [];

const log = (scope, message) => console.info(`[${scope}] ${message}`);

const parseEnv = (path) => {
  if (!existsSync(path)) return {};
  return Object.fromEntries(readFileSync(path, "utf8").split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return [];
    const normalized = trimmed.startsWith("export ") ? trimmed.slice(7) : trimmed;
    const separator = normalized.indexOf("=");
    if (separator < 1) return [];
    const key = normalized.slice(0, separator).trim();
    let value = normalized.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    return [[key, value]];
  }));
};

const environment = {
  ...parseEnv(resolve(root, ".env")),
  ...parseEnv(resolve(root, ".env.local")),
  ...process.env
};

const command = (program, args, options = {}) => spawnSync(program, args, {
  cwd: root,
  env: environment,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "pipe"],
  ...options
});

const processExists = (pid) => {
  try { process.kill(pid, 0); return true; } catch { return false; }
};

const cwdFor = (pid) => {
  const result = spawnSync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], { encoding: "utf8" });
  return result.stdout.split("\n").find((line) => line.startsWith("n"))?.slice(1) ?? null;
};

const managedProcess = (pid) => {
  const cwd = cwdFor(pid);
  return Boolean(cwd && (cwd === root || cwd.startsWith(`${root}/`)));
};

const currentState = () => {
  if (!existsSync(statePath)) return null;
  try { return JSON.parse(readFileSync(statePath, "utf8")); } catch { return null; }
};

const clearStaleState = () => {
  const state = currentState();
  if (!state) return;
  const pids = [state.parentPid, ...Object.values(state.children ?? {})].filter(Number.isInteger);
  if (pids.some((pid) => processExists(pid))) return state;
  rmSync(statePath, { force: true });
  return null;
};

const listenersOnWebPort = () => command("lsof", ["-nP", `-iTCP:${webPort}`, "-sTCP:LISTEN", "-t"])
  .stdout.split(/\s+/).flatMap((value) => Number.isInteger(Number(value)) && value ? [Number(value)] : []);

const ensureWebPort = () => {
  const listeners = listenersOnWebPort();
  if (listeners.length === 0) return false;
  const ownNext = listeners.some((pid) => {
    const processInfo = spawnSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" }).stdout;
    return managedProcess(pid) && /next(?:\.js)? dev|next dev/.test(processInfo);
  });
  if (ownNext) {
    log("web", `Reusing existing Lifehacker Web server on http://localhost:${webPort}`);
    return true;
  }
  throw new Error(`Port ${webPort} is already in use by a process outside this Lifehacker runtime.`);
};

const ensureDatabase = () => {
  const status = command("pnpm", ["exec", "supabase", "status", "--output", "json"]);
  if (status.status === 0) {
    log("db", "Local Supabase already running");
    return;
  }
  log("db", "Starting local Supabase...");
  const start = command("pnpm", ["exec", "supabase", "start"]);
  if (start.status !== 0) throw new Error("Local Supabase failed to start. Run pnpm db:start for its detailed output.");
  log("db", "Local Supabase ready");
};

const runPrerequisites = () => {
  log("dev", "Building Core and Input prerequisites...");
  const build = command("pnpm", ["--filter", "@amber/core", "--filter", "@amber/input", "build", "--force"]);
  if (build.status !== 0) throw new Error("Core/Input prerequisite build failed.");
};

const relay = (scope, stream) => {
  stream.on("data", (chunk) => {
    const text = String(chunk).trimEnd();
    if (text) process.stdout.write(`[${scope}] ${text}\n`);
  });
};

const startChild = (scope, program, args) => {
  const child = spawn(program, args, { cwd: root, env: environment, stdio: ["inherit", "pipe", "pipe"] });
  relay(scope, child.stdout);
  relay(scope, child.stderr);
  child.on("error", () => log(scope, "Process failed to start"));
  children.push({ scope, child });
  return child;
};

const writeState = () => {
  mkdirSync(stateDirectory, { recursive: true });
  writeFileSync(statePath, JSON.stringify({
    parentPid: process.pid,
    children: Object.fromEntries(children.map(({ scope, child }) => [scope, child.pid])),
    startedAt: new Date().toISOString()
  }));
};

const waitForWeb = async () => {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const ready = await new Promise((resolveReady) => {
      const request = http.get(`http://127.0.0.1:${webPort}`, (response) => {
        response.resume();
        resolveReady(Boolean(response.statusCode && response.statusCode < 500));
      });
      request.on("error", () => resolveReady(false));
      request.setTimeout(1_000, () => { request.destroy(); resolveReady(false); });
    });
    if (ready) return true;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }
  return false;
};

const envStatus = (key) => log("worker", `${key}: ${environment[key] ? "SET" : "MISSING"}`);

const stopChildren = () => {
  for (const { child } of children) if (!child.killed && child.exitCode === null) child.kill("SIGTERM");
  rmSync(statePath, { force: true });
};

let stopping = false;
const shutdown = (exitCode) => {
  if (stopping) return;
  stopping = true;
  log("dev", "Stopping managed app processes; Supabase remains running");
  stopChildren();
  process.exitCode = exitCode;
};

process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));

try {
  const state = clearStaleState();
  if (state) throw new Error("A managed Lifehacker dev runtime is already active. Use pnpm dev:stop first.");
  const reusedWeb = ensureWebPort();
  ensureDatabase();
  runPrerequisites();
  startChild("watch", "pnpm", ["exec", "tsc", "-b", "packages/core", "packages/input", "--watch", "--preserveWatchOutput"]);
  if (!reusedWeb) startChild("web", "pnpm", ["--dir", "apps/web", "exec", "next", "dev", "-p", String(webPort)]);
  envStatus("DISCORD_BOT_TOKEN");
  envStatus("DISCORD_ALLOWED_USER_ID");
  envStatus("AMBER_USER_ID");
  envStatus("ICLOUD_APPLE_ID");
  envStatus("ICLOUD_APP_PASSWORD");
  if (environment.DISCORD_BOT_TOKEN && environment.DISCORD_ALLOWED_USER_ID) {
    startChild("worker", "pnpm", ["--filter", "@amber/discord-worker", "dev"]);
  } else {
    log("worker", "Skipped: Discord credentials are not configured; Web remains available");
  }
  writeState();
  if (await waitForWeb()) {
    log("web", `http://localhost:${webPort}`);
    log("dev", "Opening browser...");
    const browser = spawn("open", [`http://localhost:${webPort}`], { detached: true, stdio: "ignore" });
    browser.on("error", () => log("dev", "Browser open skipped"));
    browser.unref();
  } else {
    log("web", `Web did not become ready on http://localhost:${webPort}`);
  }
} catch (error) {
  stopChildren();
  console.error(`[dev] ${error instanceof Error ? error.message : "Local development startup failed"}`);
  process.exitCode = 1;
}
