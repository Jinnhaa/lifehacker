import { z } from "zod";

const schema = z.object({
  AMBER_USER_ID: z.uuid(),
  DATABASE_URL: z.string().trim().min(1).optional(),
  SNOWBOARD_USERNAME: z.string().trim().min(1),
  SNOWBOARD_PASSWORD: z.string().min(1),
  SNOWBOARD_BASE_URL: z.url().default("https://snowboard.sookmyung.ac.kr/"),
  SNOWBOARD_CURRENT_TERM: z.string().trim().min(1),
  SNOWBOARD_REGULAR_COURSE_IDS: z.string().trim().min(1),
  SNOWBOARD_PYTHON_BIN: z.string().trim().min(1).default("python3")
}).strip();

export function loadSnowboardConfig(environment: Readonly<Record<string, string | undefined>> = process.env) {
  const value = schema.parse(environment);
  const regularCourseIds = [...new Set(value.SNOWBOARD_REGULAR_COURSE_IDS.split(",").map((id) => id.trim()).filter(Boolean))];
  if (!regularCourseIds.length) throw new Error("SNOWBOARD_REGULAR_COURSE_IDS must contain at least one course id");
  return {
    userId: value.AMBER_USER_ID,
    databaseUrl: value.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    collector: {
      baseUrl: value.SNOWBOARD_BASE_URL,
      currentTerm: value.SNOWBOARD_CURRENT_TERM,
      regularCourseIds,
      username: value.SNOWBOARD_USERNAME,
      password: value.SNOWBOARD_PASSWORD,
      pythonBin: value.SNOWBOARD_PYTHON_BIN
    }
  };
}
