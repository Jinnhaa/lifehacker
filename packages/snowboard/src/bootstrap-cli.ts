import { SupabaseTaskRepository, TaskService } from "@amber/core";
import { InputService, SupabaseInputRepository } from "@amber/input";
import { SystemClock, type UserId } from "@amber/shared";
import postgres from "postgres";
import { loadSnowboardConfig } from "./config.js";
import { PythonSnowboardClient } from "./python-client.js";
import { syncSnowboardRuntime } from "./runtime-sync.js";
import { SupabaseAcademicScheduleRepository } from "./supabase-academic-schedule-repository.js";
import { SupabaseCourseContextBootstrapRepository } from "./supabase-course-context-bootstrap-repository.js";
import { SupabaseCourseProgressRepository } from "./supabase-course-progress-repository.js";
import { SupabaseUniversityLearningBootstrapService } from "./supabase-university-learning-bootstrap-service.js";

const config = loadSnowboardConfig();
const sql = postgres(config.databaseUrl, { max: 5 });
try {
  const client = new PythonSnowboardClient();
  const processor = new InputService(
    new SupabaseInputRepository(sql),
    { parseInput: async () => { throw new Error("Natural-language parsing is unavailable in Snowboard sync"); } },
    new TaskService(new SupabaseTaskRepository(sql), new SystemClock())
  );
  const result = await syncSnowboardRuntime({
    userId: config.userId as UserId,
    config: config.collector,
    client,
    processor,
    courseContextRepository: new SupabaseCourseContextBootstrapRepository(sql),
    academicScheduleRepository: new SupabaseAcademicScheduleRepository(sql),
    courseProgressRepository: new SupabaseCourseProgressRepository(sql),
    universityLearningBootstrap: new SupabaseUniversityLearningBootstrapService(sql)
  });
  console.info(
    `Snowboard bootstrap complete: courses=${result.courses.discovered} created=${result.courses.created} reused=${result.courses.reused} ` +
    `assignments=${result.assignments.assignments} quizzes=${result.assignments.quizzes} completion_signals=${result.assignments.completionSignals} ` +
    `materialized=${result.assignments.materialized} needs_confirmation=${result.assignments.needsConfirmation} ` +
    `schedules=${result.schedules.received} schedule_created=${result.schedules.created} schedule_updated=${result.schedules.updated} schedule_unchanged=${result.schedules.unchanged} ` +
    `course_progress=${result.courseProgress} learning_courses=${result.universityLearning.bootstrapped} ` +
    `learning_skipped=${result.universityLearning.skipped} learning_units=${result.universityLearning.learningUnitsEnsured} ` +
    `lecture_exposures_completed=${result.universityLearning.exposuresCompleted}`
  );
} finally {
  await sql.end();
}
