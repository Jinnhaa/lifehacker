import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { UserId } from "@amber/shared";
import postgres from "postgres";
import { learningBootstrapSchema } from "./learning-bootstrap.js";
import { SupabaseLearningBootstrapRepository } from "./supabase-learning-bootstrap-repository.js";

const databaseUrl = process.env.DATABASE_URL;
const userId = process.env.AMBER_USER_ID;
const inputPath = process.argv[2];
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!userId) throw new Error("AMBER_USER_ID is required");
if (!inputPath) throw new Error("A bootstrap JSON path is required");

const bootstrap = learningBootstrapSchema.parse(JSON.parse(await readFile(resolve(inputPath), "utf8")));
const sql = postgres(databaseUrl, { max: 1 });
try {
  const result = await new SupabaseLearningBootstrapRepository(sql).apply(userId as UserId, bootstrap);
  console.info(`Learning bootstrap complete: ${JSON.stringify(result)}`);
} finally {
  await sql.end();
}
