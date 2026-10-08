import type { UserId } from "@amber/shared";
import postgres from "postgres";
import { loadSnowboardConfig } from "./config.js";
import { PythonSnowboardClient } from "./python-client.js";
import { SupabaseCourseProgressRepository } from "./supabase-course-progress-repository.js";
import { SupabaseUniversityLearningBootstrapService } from "./supabase-university-learning-bootstrap-service.js";

const config = loadSnowboardConfig();
const sql = postgres(config.databaseUrl, { max: 5 });
try {
  const progress = await new PythonSnowboardClient().listCourseProgress(config.collector);
  const userId = config.userId as UserId;
  await new SupabaseCourseProgressRepository(sql).applyProgress(userId, progress);
  const result = await new SupabaseUniversityLearningBootstrapService(sql).bootstrap(userId, progress);
  console.info(
    `University learning bootstrap complete: courses=${result.bootstrapped} skipped=${result.skipped} ` +
    `materials=${result.materialsEnsured} units=${result.learningUnitsEnsured} ` +
    `lecture_exposures_completed=${result.exposuresCompleted}`
  );
  for (const course of result.courses.filter((item) => item.status !== "BOOTSTRAPPED")) {
    console.info(`University learning bootstrap skipped: course=${course.courseId} status=${course.status}`);
  }
} finally {
  await sql.end();
}
