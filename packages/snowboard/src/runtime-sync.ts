import type { UserId } from "@amber/shared";
import type {
  SnowboardAcademicScheduleClient,
  SnowboardAssignmentClient,
  SnowboardCollectorConfig,
  SnowboardCourseClient,
  SnowboardWorkItemProcessor
} from "./contracts.js";
import {
  CourseContextBootstrapService,
  type CourseContextBootstrapRepository,
  type CourseContextBootstrapResult
} from "./course-context-bootstrap.js";
import { PythonSnowboardClient } from "./python-client.js";
import { SnowboardSyncService, type SnowboardSyncResult } from "./snowboard-sync-service.js";
import type { AcademicScheduleSyncResult } from "./supabase-academic-schedule-repository.js";

type SnowboardRuntimeClient = SnowboardCourseClient & SnowboardAssignmentClient & SnowboardAcademicScheduleClient;

interface SnowboardAcademicScheduleRepository {
  applySchedules(userId: UserId, schedules: Awaited<ReturnType<SnowboardAcademicScheduleClient["listAcademicSchedules"]>>): Promise<AcademicScheduleSyncResult>;
}

export interface SnowboardRuntimeSyncResult {
  readonly courses: CourseContextBootstrapResult;
  readonly assignments: SnowboardSyncResult;
  readonly schedules: AcademicScheduleSyncResult;
}

/** Runs the canonical Snowboard runtime order so course mappings exist before item or schedule reconciliation. */
export async function syncSnowboardRuntime(input: {
  readonly userId: UserId;
  readonly config: SnowboardCollectorConfig;
  readonly client: SnowboardRuntimeClient;
  readonly processor: SnowboardWorkItemProcessor;
  readonly courseContextRepository: CourseContextBootstrapRepository;
  readonly academicScheduleRepository: SnowboardAcademicScheduleRepository;
  readonly observedAt?: Date;
}): Promise<SnowboardRuntimeSyncResult> {
  const courses = await new CourseContextBootstrapService(input.client, input.courseContextRepository)
    .bootstrap(input.userId, input.config, input.observedAt);
  const assignments = await new SnowboardSyncService(input.client, input.processor).sync(input.userId, input.config);
  const schedules = await input.client.listAcademicSchedules(input.config);
  const scheduleResult = await input.academicScheduleRepository.applySchedules(input.userId, schedules);
  return { courses, assignments, schedules: scheduleResult };
}

export async function syncSnowboardForUser(input: {
  readonly userId: UserId;
  readonly processor: SnowboardWorkItemProcessor;
  readonly config: SnowboardCollectorConfig;
}): Promise<SnowboardSyncResult> {
  return new SnowboardSyncService(new PythonSnowboardClient(), input.processor).sync(input.userId, input.config);
}
