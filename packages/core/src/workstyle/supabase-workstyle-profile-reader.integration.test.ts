import { randomUUID } from "node:crypto";
import type { UserId } from "@amber/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SupabaseWorkstyleProfileReader } from "./supabase-workstyle-profile-reader.js";

const connectionString = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = postgres(connectionString, { max: 5 });
const userId = randomUUID() as UserId;
const otherUserId = randomUUID() as UserId;
const reader = new SupabaseWorkstyleProfileReader(sql);

beforeAll(async () => {
  await sql`insert into auth.users(id,email,created_at,updated_at) values
    (${userId},${`workstyle-${userId}@example.test`},now(),now()),
    (${otherUserId},${`workstyle-${otherUserId}@example.test`},now(),now())`;
  await sql`insert into public.profiles(id) values(${userId}),(${otherUserId})`;
  await sql`insert into public.workstyle_profiles(user_id,scope_type,agent_type,revision,instructions,directives) values
    (${userId},'global',null,1,array['global'],${sql.json({ concise: true })}),
    (${userId},'agent','project_pm',2,array['pm'],${sql.json({ problem_first: true })}),
    (${otherUserId},'global',null,1,array['foreign'],${sql.json({ foreign: true })})`;
});

afterAll(async () => {
  await sql`delete from auth.users where id in (${userId},${otherUserId})`;
  await sql.end();
});

describe("SupabaseWorkstyleProfileReader", () => {
  it("loads the user's global and requested agent profiles only", async () => {
    const profiles = await reader.loadActive(userId, "project_pm");
    expect(profiles.map((item) => item.instructions[0])).toEqual(["global", "pm"]);
    expect(profiles.every((item) => item.userId === userId)).toBe(true);
  });

  it("does not leak another user or unrelated agent profile", async () => {
    const profiles = await reader.loadActive(userId, "chief");
    expect(profiles).toHaveLength(1);
    expect(profiles[0]?.instructions).toEqual(["global"]);
  });
});

