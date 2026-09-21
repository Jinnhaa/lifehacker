import type { UserId } from "@amber/shared";
import type { SnowboardCollectorConfig, SnowboardCourse, SnowboardCourseClient } from "./contracts.js";

export interface CourseContextMapping {
  readonly courseId: string;
  readonly workContextId: string;
  readonly created: boolean;
}

export interface CourseContextBootstrapRepository {
  connectCourse(input: {
    readonly userId: UserId;
    readonly course: SnowboardCourse;
    readonly currentTerm: string;
    readonly observedAt: Date;
  }): Promise<CourseContextMapping>;
}

export interface CourseContextBootstrapResult {
  readonly discovered: number;
  readonly created: number;
  readonly reused: number;
  readonly mappings: readonly CourseContextMapping[];
}

export class CourseContextBootstrapService {
  constructor(
    private readonly client: SnowboardCourseClient,
    private readonly repository: CourseContextBootstrapRepository
  ) {}

  async bootstrap(userId: UserId, config: SnowboardCollectorConfig, observedAt = new Date()): Promise<CourseContextBootstrapResult> {
    const courses = await this.client.listCourses(config);
    const mappings: CourseContextMapping[] = [];
    for (const course of courses) {
      mappings.push(await this.repository.connectCourse({ userId, course, currentTerm: config.currentTerm, observedAt }));
    }
    return {
      discovered: courses.length,
      created: mappings.filter((mapping) => mapping.created).length,
      reused: mappings.filter((mapping) => !mapping.created).length,
      mappings
    };
  }
}
