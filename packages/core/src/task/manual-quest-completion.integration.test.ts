import { randomUUID } from "node:crypto";
import type { TaskId, UserId } from "@amber/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { completeManualQuest } from "./manual-quest-completion.js";

const connectionString = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const sql = postgres(connectionString, { max: 5 });
const userId = randomUUID() as UserId;
const courseId = randomUUID();
const taskId = randomUUID() as TaskId;
const stepId = randomUUID();
const planId = randomUUID();
const planItemId = randomUUID();
const assessmentId = randomUUID();
const referenceId = randomUUID();
const localDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());

beforeAll(async () => {
  await sql`insert into auth.users(id,email,created_at,updated_at)
    values(${userId},${`manual-completion-${userId}@example.test`},now(),now())`;
  await sql`insert into public.profiles(id,timezone) values(${userId},'Asia/Seoul')`;
  await sql`insert into public.work_contexts(id,user_id,kind,title,status,agent_mode)
    values(${courseId},${userId},'course','Database Systems','active','not_applicable')`;
  await sql`insert into public.tasks(id,user_id,work_context_id,title,execution_mode,official_deadline,estimated_minutes,importance,status)
    values(${taskId},${userId},${courseId},'DB Assignment','standard',now()+interval '8 hours',30,5,'PLANNED')`;
  await sql`insert into public.task_steps(id,user_id,task_id,position,title,owner,status)
    values(${stepId},${userId},${taskId},1,'Submit assignment','user','pending')`;
  await sql`insert into public.daily_plans(id,user_id,plan_date,timezone,revision_no,status,input_snapshot,created_by,approved_at)
    values(${planId},${userId},${localDate},'Asia/Seoul',1,'pending_approval','{}','test',null)`;
  await sql`insert into public.plan_items(id,user_id,daily_plan_id,position,item_type,task_id,planned_minutes,status)
    values(${planItemId},${userId},${planId},1,'task',${taskId},30,'planned')`;
  await sql`update public.daily_plans set status='approved',approved_at=now()
    where id=${planId} and user_id=${userId}`;
  await sql`insert into public.course_assessments(id,user_id,course_context_id,linked_task_id,assessment_type,title,submission_status,provenance,observed_at)
    values(${assessmentId},${userId},${courseId},${taskId},'assignment','DB Assignment','pending','snowboard',now())`;
  await sql`insert into public.external_references(id,user_id,source,external_type,external_id,ownership,internal_entity_type,internal_entity_id,sync_status,first_seen_at,last_seen_at)
    values(${referenceId},${userId},'snowboard','assignment',${`assignment-${taskId}`},'external','task',${taskId},'active',now(),now())`;
});

afterAll(async () => {
  await sql`delete from auth.users where id=${userId}`;
  await sql.end();
});

describe("manual completion Current Status evidence", () => {
  it("completes the final child and parent immediately without overwriting official submission facts", async () => {
    const first = await completeManualQuest(sql, userId, taskId, stepId);
    const duplicate = await completeManualQuest(sql, userId, taskId, stepId);
    const [task] = await sql<{ status: string; completion_source: string | null }[]>`
      select status,completion_source from public.tasks where id=${taskId} and user_id=${userId}`;
    const [step] = await sql<{ status: string }[]>`
      select status from public.task_steps where id=${stepId} and user_id=${userId}`;
    const [item] = await sql<{ status: string }[]>`
      select status from public.plan_items where id=${planItemId} and user_id=${userId}`;
    const [assessment] = await sql<{ submission_status: string | null }[]>`
      select submission_status from public.course_assessments where id=${assessmentId} and user_id=${userId}`;
    const [reference] = await sql<{ sync_status: string }[]>`
      select sync_status from public.external_references where id=${referenceId} and user_id=${userId}`;
    const evidence = await sql<{ payload: { authority: string; effect: string; official_submission: { state: string } } }[]>`
      select payload from public.domain_events
      where user_id=${userId} and aggregate_id=${taskId} and event_type='manual_completion_recorded'`;

    expect(first).toMatchObject({
      kind: "task", duplicate: false,
      officialSubmission: { state: "pending_confirmation", sources: ["snowboard"], statuses: ["pending"] }
    });
    expect(duplicate).toMatchObject({ kind: "task", duplicate: true });
    expect(task).toEqual({ status: "DONE", completion_source: "manual" });
    expect(step?.status).toBe("completed");
    expect(item?.status).toBe("completed");
    expect(assessment?.submission_status).toBe("pending");
    expect(reference?.sync_status).toBe("active");
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.payload).toMatchObject({
      authority: "user",
      effect: "current_status_completed",
      official_submission: { state: "pending_confirmation" }
    });
  });
});
