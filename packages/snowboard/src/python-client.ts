import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { DiscoveredWorkItem } from "@amber/input";
import { z } from "zod";
import type { SnowboardAcademicSchedule, SnowboardAcademicScheduleClient, SnowboardAssignmentClient, SnowboardCollectorConfig, SnowboardCourse, SnowboardCourseClient } from "./contracts.js";

const collectorItemSchema = z.object({
  source: z.literal("snowboard"),
  externalType: z.enum(["assignment", "quiz"]),
  sourceItemId: z.string().trim().min(1),
  sourceVersion: z.string().trim().min(1).nullable(),
  sourceUrl: z.url().nullable(),
  observedAt: z.iso.datetime({ offset: true }),
  title: z.string().trim().min(1),
  officialDeadline: z.iso.datetime({ offset: true }).nullable(),
  workContextHint: z.string().trim().min(1),
  objectiveHint: z.string().trim().min(1).nullable(),
  status: z.enum(["open", "completed"]),
  taskSemantics: z.literal("clear"),
  rawPayload: z.record(z.string(), z.unknown())
}).strict();

const courseSchema = z.object({
  courseId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  url: z.url(),
  courseType: z.literal("R"),
  period: z.string().trim().min(1).nullable()
}).strict();

const academicScheduleSchema = z.object({
  source: z.literal("snowboard"),
  externalType: z.literal("academic_schedule"),
  externalId: z.string().trim().min(1),
  externalVersion: z.string().trim().min(1),
  sourceUrl: z.url(),
  observedAt: z.iso.datetime({ offset: true }),
  title: z.string().trim().min(1),
  start: z.iso.datetime({ offset: true }),
  end: z.iso.datetime({ offset: true }),
  timeZone: z.literal("Asia/Seoul"),
  courseId: z.string().trim().min(1),
  courseTitle: z.string().trim().min(1),
  currentTerm: z.string().trim().min(1)
}).strict();

type PythonRunInput = {
  readonly binary: string;
  readonly scriptPath: string;
  readonly args: readonly string[];
  readonly environment: Readonly<Record<string, string | undefined>>;
};

export type PythonRunner = (input: PythonRunInput) => Promise<string>;

const runPython: PythonRunner = ({ binary, scriptPath, args, environment }) => new Promise((resolve, reject) => {
  execFile(binary, [scriptPath, ...args], {
    env: { ...process.env, ...environment },
    maxBuffer: 10 * 1024 * 1024,
    timeout: 120_000
  }, (error, stdout, stderr) => {
    if (error) {
      reject(new Error(stderr.trim() || `Snowboard collector exited with ${error.code ?? "an error"}`));
      return;
    }
    resolve(stdout);
  });
});

export class PythonSnowboardClient implements SnowboardAssignmentClient, SnowboardCourseClient, SnowboardAcademicScheduleClient {
  constructor(
    private readonly runner: PythonRunner = runPython,
    private readonly scriptPath = fileURLToPath(new URL("../python/snowboard_http.py", import.meta.url))
  ) {}

  async listAssignments(config: SnowboardCollectorConfig): Promise<readonly DiscoveredWorkItem[]> {
    const stdout = await this.collect(config, []);
    const parsed = z.array(collectorItemSchema).parse(JSON.parse(stdout));
    return parsed.map((item) => ({
      ...item,
      observedAt: new Date(item.observedAt),
      officialDeadline: item.officialDeadline ? new Date(item.officialDeadline) : null
    }));
  }

  async listCourses(config: SnowboardCollectorConfig): Promise<readonly SnowboardCourse[]> {
    const stdout = await this.collect(config, ["--discover-courses"]);
    return z.array(courseSchema).parse(JSON.parse(stdout));
  }

  async listAcademicSchedules(config: SnowboardCollectorConfig): Promise<readonly SnowboardAcademicSchedule[]> {
    const stdout = await this.collect(config, ["--discover-academic-schedules"]);
    return z.array(academicScheduleSchema).parse(JSON.parse(stdout)).map((schedule) => ({
      ...schedule,
      observedAt: new Date(schedule.observedAt),
      start: new Date(schedule.start),
      end: new Date(schedule.end)
    }));
  }

  private collect(config: SnowboardCollectorConfig, extraArgs: readonly string[]): Promise<string> {
    return this.runner({
      binary: config.pythonBin,
      scriptPath: this.scriptPath,
      args: [
        "--base-url", config.baseUrl,
        "--current-term", config.currentTerm,
        "--regular-course-ids", config.regularCourseIds.join(","),
        ...extraArgs
      ],
      environment: {
        SNOWBOARD_USERNAME: config.username,
        SNOWBOARD_PASSWORD: config.password
      }
    });
  }
}
