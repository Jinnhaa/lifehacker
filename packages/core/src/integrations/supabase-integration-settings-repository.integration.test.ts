import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IntegrationSettingsService } from "./integration-settings-service.js";
import { SupabaseIntegrationSettingsRepository } from "./supabase-integration-settings-repository.js";

const sql = postgres(process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres", { max: 5 });
const userId = randomUUID();
const accountId = randomUUID();
const taskId = randomUUID();
const constraintId = randomUUID();
const referenceId = randomUUID();

describe("SupabaseIntegrationSettingsRepository", () => {
  beforeAll(async () => {
    await sql`insert into auth.users(id,email,created_at,updated_at) values (${userId},${`integration-${userId}@example.test`},now(),now())`;
    await sql`insert into public.profiles(id,timezone) values (${userId},'Asia/Seoul')`;
    await sql`insert into public.integration_accounts(id,user_id,provider,external_account_id,status,secret_ref,metadata,connected_at) values (${accountId},${userId},'icloud_calendar','test@example.test','active','env:TEST_SECRET',${sql.json({ caldavBaseUrl: "https://calendar.example.test" })},now())`;
    await sql`insert into public.tasks(id,user_id,title,execution_mode,importance,status) values (${taskId},${userId},'보존할 업무','standard',3,'INBOX')`;
    await sql`insert into public.constraints(id,user_id,constraint_type,value,hardness,valid_from,valid_until,reason,origin) values (${constraintId},${userId},'availability',${sql.json({ title: "보존할 일정" })},'hard',now(),now()+interval '1 hour','test','icloud_calendar')`;
    await sql`insert into public.external_references(id,user_id,source,external_type,external_id,ownership,internal_entity_type,internal_entity_id,sync_status,first_seen_at,last_seen_at) values (${referenceId},${userId},'icloud_calendar','calendar_event','test-event','external','constraint',${constraintId},'active',now(),now())`;
  });

  afterAll(async () => {
    await sql`delete from auth.users where id=${userId}`;
    await sql.end();
  });

  it("활성화/비활성화는 account 상태만 바꾸고 canonical data를 보존한다", async () => {
    const service = new IntegrationSettingsService(new SupabaseIntegrationSettingsRepository(sql));
    expect((await service.list(userId)).find((item) => item.provider === "icloud_calendar")?.state).toBe("connected");

    const disabled = await service.setEnabled({ userId, accountId, enabled: false });
    expect(disabled.find((item) => item.provider === "icloud_calendar")?.state).toBe("disconnected");
    const preserved = await sql<{ tasks: number; constraints: number; references: number }[]>`
      select
        (select count(*)::int from public.tasks where id=${taskId} and user_id=${userId}) tasks,
        (select count(*)::int from public.constraints where id=${constraintId} and user_id=${userId}) constraints,
        (select count(*)::int from public.external_references where id=${referenceId} and user_id=${userId}) references
    `;
    expect(preserved[0]).toEqual({ tasks: 1, constraints: 1, references: 1 });

    const enabled = await service.setEnabled({ userId, accountId, enabled: true });
    expect(enabled.find((item) => item.provider === "icloud_calendar")?.state).toBe("connected");
    const events = await sql<{ event_type: string }[]>`
      select event_type from public.domain_events where user_id=${userId} and aggregate_id=${accountId} order by occurred_at
    `;
    expect(events.map((event) => event.event_type)).toEqual(["integration_deactivated", "integration_activated"]);
  });
});
