import { spawnSync } from "node:child_process";
import console from "node:console";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const scenarios = JSON.parse(readFileSync(join(root, "evals/scenarios.json"), "utf8"));
const runDb = process.env.EVAL_WITH_DB === "1";
const tests = [...new Set(scenarios.flatMap((scenario) => scenario.tests
  .filter((test) => test.requires !== "local_db" || runDb).map((test) => test.file)))];
const reportPath = join(tmpdir(), `lifehacker-eval-${process.pid}.json`);
const run = (command, args) => spawnSync(command, args, { cwd: root, encoding: "utf8" });
const git = (...args) => run("git", args).stdout.trim();
const execution = run("pnpm", ["exec", "vitest", "run", ...tests, "--maxWorkers=1", "--testTimeout=30000", "--hookTimeout=30000", "--reporter=json", `--outputFile=${reportPath}`]);
let testResults = [];
try {
  testResults = JSON.parse(readFileSync(reportPath, "utf8")).testResults;
} catch {
  console.error(execution.stderr || execution.stdout || "Vitest JSON report was not produced");
}
const assertions = new Map(testResults.flatMap((suite) => suite.assertionResults.map((assertion) => [
  `${suite.name.replace(`${root}/`, "")}:${assertion.fullName}`, assertion
])));
const result = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  branch: git("branch", "--show-current"),
  commitSha: git("rev-parse", "HEAD"),
  vitestExitCode: execution.status,
  scenarios: scenarios.map((scenario) => {
    const evidence = scenario.tests.map((test) => {
      const assertion = test.requires === "local_db" && !runDb ? null : assertions.get(`${test.file}:${test.fullName}`);
      return { ...test, status: assertion?.status ?? (test.requires === "local_db" && !runDb ? "environment_blocked" : "missing"),
        failureMessages: assertion?.failureMessages ?? [] };
    });
    const failed = evidence.some((test) => test.status === "failed");
    const complete = evidence.length > 0 && evidence.every((test) => test.status === "passed");
    const status = failed ? "FAIL" : complete && scenario.coverage === "complete" ? "PASS" : "BLOCKED";
    const actual = failed ? "Mapped runtime assertion failed" : complete
      ? scenario.coverage === "complete" ? "All mapped runtime assertions passed" : "Mapped assertions passed; scenario behavior remains partially unverified"
      : evidence.some((test) => test.status === "environment_blocked") ? "Local DB evaluation was not requested"
        : "Runtime evidence is missing or environment-dependent";
    return { ...scenario, actual, status, evidence };
  })
};
const output = join(root, "docs/ai-development/eval-results/latest.json");
mkdirSync(resolve(output, ".."), { recursive: true });
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
const counts = { PASS: 0, FAIL: 0, BLOCKED: 0 };
for (const scenario of result.scenarios) counts[scenario.status] += 1;
console.log(`Eval: PASS=${counts.PASS} FAIL=${counts.FAIL} BLOCKED=${counts.BLOCKED} (${output})`);
for (const scenario of result.scenarios.filter((item) => item.status !== "PASS"))
  console.log(`${scenario.status} ${scenario.id}: ${scenario.actual}`);
if (execution.status !== 0 || result.scenarios.some((scenario) => scenario.required && scenario.status !== "PASS")) process.exitCode = 1;
