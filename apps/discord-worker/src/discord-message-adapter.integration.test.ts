import { randomUUID } from "node:crypto";
import { SupabaseTaskRepository, TaskService } from "@amber/core";
import { DeterministicTestInterpreter, InputService, SupabaseInputRepository, type ParseResult } from "@amber/input";
import { FixedClock, type CorrelationId, type IdGenerator, type UserId } from "@amber/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DiscordMessageAdapter, type DiscordReplyPayload } from "./discord-message-adapter.js";
import { SupabaseDiscordUserResolver } from "./discord-user-resolver.js";

const connectionString = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = postgres(connectionString, { max: 10 });
const inputRepository = new SupabaseInputRepository(sql);
const taskRepository = new SupabaseTaskRepository(sql);
const userId = randomUUID() as UserId;
const discordUserId = "123456789012345678";
const discordMessageId = "987654321098765432";
const clock = new FixedClock(new Date("2026-09-03T01:00:00.000Z"));
const ids: IdGenerator = { generateCorrelationId: () => randomUUID() as CorrelationId };
const parseResult: ParseResult = {
  intent: "CREATE_TASK",
  entities: [{
    entityType: "task_candidate",
    data: { title: "운영체제 과제", inferredFields: [] },
    provenance: { title: "user_explicit" },
    confidence: 1
  }],
  requiresConfirmation: false,
  clarificationQuestions: []
};

beforeAll(async () => {
  await sql`insert into auth.users(id,email,created_at,updated_at) values (${userId},${`discord-${userId}@example.test`},now(),now())`;
  await sql`insert into public.profiles(id,timezone) values (${userId},'Asia/Seoul')`;
  await sql`
    insert into public.integration_accounts(user_id,provider,external_account_id,status,connected_at)
    values (${userId},'discord',${discordUserId},'active',now())
  `;
});

afterAll(async () => {
  await sql`delete from auth.users where id=${userId}`;
  await sql.end();
});

describe("Discord input local Supabase pipeline", () => {
  it("deduplicates a repeated Discord MESSAGE_CREATE into one Task and event", async () => {
    const service = new InputService(
      inputRepository,
      new DeterministicTestInterpreter(parseResult),
      new TaskService(taskRepository, clock, ids),
      ids
    );
    const adapter = new DiscordMessageAdapter(
      discordUserId,
      new SupabaseDiscordUserResolver(sql),
      service,
      taskRepository
    );
    const replies: DiscordReplyPayload[] = [];
    const inbound = {
      id: discordMessageId,
      content: "내일까지 운영체제 과제 30분 해야 해",
      createdAt: new Date("2026-09-03T01:00:00.000Z"),
      guildId: null,
      author: { id: discordUserId, bot: false },
      reply: async (payload: DiscordReplyPayload) => { replies.push(payload); }
    };

    const first = await adapter.handle(inbound);
    const second = await adapter.handle(inbound);

    expect(first).toEqual({ kind: "replied", outcome: "applied" });
    expect(second).toEqual({ kind: "replied", outcome: "applied" });
    expect(replies).toHaveLength(2);
    const rows = await sql<{
      inbox_count: number; command_count: number; task_count: number; event_count: number;
      source: string; dedupe_key: string; actor_type: string; correlation_linked: boolean; raw_content: string;
    }[]>`
      select
        (select count(*)::integer from public.inbox_items where user_id=${userId}) inbox_count,
        (select count(*)::integer from public.domain_commands where user_id=${userId}) command_count,
        (select count(*)::integer from public.tasks where user_id=${userId}) task_count,
        (select count(*)::integer from public.domain_events where user_id=${userId} and event_type='task_created') event_count,
        i.source,i.dedupe_key,e.actor_type,(i.correlation_id=e.correlation_id) correlation_linked,i.raw_content
      from public.inbox_items i
      join public.domain_events e on e.user_id=i.user_id and e.event_type='task_created'
      where i.user_id=${userId}
    `;
    expect(rows[0]).toEqual({
      inbox_count: 1,
      command_count: 1,
      task_count: 1,
      event_count: 1,
      source: "discord",
      dedupe_key: `discord:${discordMessageId}`,
      actor_type: "discord",
      correlation_linked: true,
      raw_content: "내일까지 운영체제 과제 30분 해야 해"
    });
  });
});
