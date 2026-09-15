import type { DiscoveredWorkItem } from "@amber/input";
import type { UserId } from "@amber/shared";

export const SNOWBOARD_SOURCE = "snowboard";

export interface SnowboardCollectorConfig {
  readonly baseUrl: string;
  readonly currentTerm: string;
  readonly regularCourseIds: readonly string[];
  readonly username: string;
  readonly password: string;
  readonly pythonBin: string;
}

export interface SnowboardAssignmentClient {
  listAssignments(config: SnowboardCollectorConfig): Promise<readonly DiscoveredWorkItem[]>;
}

export interface SnowboardCourse {
  readonly courseId: string;
  readonly title: string;
  readonly url: string;
  readonly courseType: "R";
  readonly period: string | null;
}

export interface SnowboardCourseClient {
  listCourses(config: SnowboardCollectorConfig): Promise<readonly SnowboardCourse[]>;
}

export interface SnowboardAcademicSchedule {
  readonly source: "snowboard";
  readonly externalType: "academic_schedule";
  readonly externalId: string;
  readonly externalVersion: string;
  readonly sourceUrl: string;
  readonly observedAt: Date;
  readonly title: string;
  readonly start: Date;
  readonly end: Date;
  readonly timeZone: "Asia/Seoul";
  readonly courseId: string;
  readonly courseTitle: string;
  readonly currentTerm: string;
}

export interface SnowboardAcademicScheduleClient {
  listAcademicSchedules(config: SnowboardCollectorConfig): Promise<readonly SnowboardAcademicSchedule[]>;
}

export interface SnowboardWorkItemProcessor {
  processDiscoveredWorkItem(userId: UserId, item: DiscoveredWorkItem): Promise<{ readonly status: string }>;
}
