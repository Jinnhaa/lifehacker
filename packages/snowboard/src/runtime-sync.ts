import type { UserId } from "@amber/shared";
import type {
  SnowboardAcademicScheduleClient,
  SnowboardAssignmentClient,
  SnowboardCollectorConfig,
  SnowboardCourseClient,
  SnowboardCourseProgress,
  SnowboardCourseProgressClient,
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
import type { UniversityLearningBootstrapResult } from "./supabase-university-learning-bootstrap-service.js";

type SnowboardRuntimeClient = SnowboardCourseClient & SnowboardAssignmentClient & SnowboardAcademicScheduleClient & SnowboardCourseProgressClient;

interface SnowboardAcademicScheduleRepository {
  applySchedules(userId: UserId, schedules: Awaited<ReturnType<SnowboardAcademicScheduleClient["listAcademicSchedules"]>>): Promise<AcademicScheduleSyncResult>;
}

interface SnowboardCourseProgressRepository {
  applyProgress(userId: UserId, progress: readonly SnowboardCourseProgress[]): Promise<number>;
}

interface UniversityLearningBootstrapService {
  bootstrap(userId: UserId, progress: readonly SnowboardCourseProgress[]): Promise<UniversityLearningBootstrapResult>;
}

export interface SnowboardRuntimeSyncResult {
  readonly courses: CourseContextBootstrapResult;
  readonly assignments: SnowboardSyncResult;
  readonly schedules: AcademicScheduleSyncResult;
  readonly courseProgress: number;
  readonly universityLearning: UniversityLearningBootstrapResult;
}

/** Runs the canonical Snowboard runtime order so course mappings exist before item or schedule reconciliation. */
export async function syncSnowboardRuntime(input: {
  readonly userId: UserId;
  readonly config: SnowboardCollectorConfig;
  readonly client: SnowboardRuntimeClient;
  readonly processor: SnowboardWorkItemProcessor;
  readonly courseContextRepository: CourseContextBootstrapRepository;
  readonly academicScheduleRepository: SnowboardAcademicScheduleRepository;
  readonly courseProgressRepository: SnowboardCourseProgressRepository;
  readonly universityLearningBootstrap: UniversityLearningBootstrapService;
  readonly observedAt?: Date;
}): Promise<SnowboardRuntimeSyncResult> {
  const courses = await new CourseContextBootstrapService(input.client, input.courseContextRepository)
    .bootstrap(input.userId, input.config, input.observedAt);
  const assignments = await new SnowboardSyncService(input.client, input.processor).sync(input.userId, input.config);
  const schedules = await input.client.listAcademicSchedules(input.config);
  const scheduleResult = await input.academicScheduleRepository.applySchedules(input.userId, schedules);
  const progress = await input.client.listCourseProgress(input.config);
  const courseProgress = await input.courseProgressRepository.applyProgress(input.userId, progress);
  const universityLearning = await input.universityLearningBootstrap.bootstrap(input.userId, progress);
  return { courses, assignments, schedules: scheduleResult, courseProgress, universityLearning };
}

export async function syncSnowboardForUser(input: {
  readonly userId: UserId;
  readonly processor: SnowboardWorkItemProcessor;
  readonly config: SnowboardCollectorConfig;
}): Promise<SnowboardSyncResult> {
  return new SnowboardSyncService(new PythonSnowboardClient(), input.processor).sync(input.userId, input.config);
}
