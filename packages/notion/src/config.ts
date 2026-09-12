import { z } from "zod";

const schema = z.object({
  AMBER_USER_ID: z.uuid(),
  NOTION_API_TOKEN: z.string().trim().min(1),
  NOTION_SOURCE_IDS: z.string().trim().min(1),
  DATABASE_URL: z.string().trim().min(1).optional()
}).strip();

export function loadNotionConfig(environment: Readonly<Record<string, string | undefined>> = process.env) {
  const value = schema.parse(environment);
  const sourceIds = [...new Set(value.NOTION_SOURCE_IDS.split(",").map((id) => id.trim()).filter(Boolean))];
  if (!sourceIds.length) throw new Error("NOTION_SOURCE_IDS must contain at least one data source id");
  return { userId: value.AMBER_USER_ID, token: value.NOTION_API_TOKEN, sourceIds, databaseUrl: value.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" };
}
