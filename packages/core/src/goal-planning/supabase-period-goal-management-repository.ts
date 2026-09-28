import { randomUUID } from "node:crypto";
import type { UserId } from "@amber/shared";
import type { Sql, TransactionSql } from "postgres";
import { validatePeriodGoalParent, type PeriodGoalInput, type PeriodGoalManagementRepository, type PeriodObjectiveInput } from "./period-goal-management.js";
import type { PlanningGoalLevel } from "./goal-progress.js";

async function goal(tx: TransactionSql, userId: UserId, id: string) {
  const rows = await tx<{ id: string; level: PlanningGoalLevel; status: string }[]>`
    select id,level,status from public.goals where id=${id} and user_id=${userId} for update`;
  return rows[0] ?? null;
}
async function periodGoal(tx: TransactionSql, userId: UserId, id: string) {
  const row = await goal(tx, userId, id);
  if (!row || row.status !== "active" || !["MONTHLY", "WEEKLY"].includes(row.level)) throw new Error("기간 Goal을 찾지 못했습니다.");
  return row;
}
async function event(tx: TransactionSql, userId: UserId, type: string, aggregate: string, id: string) {
  await tx`insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,payload_version,payload)
    values(${userId},${type},${aggregate},${id},'user',now(),${randomUUID()},1,${tx.json({ source: "work_board" })})`;
}

export class SupabasePeriodGoalManagementRepository implements PeriodGoalManagementRepository {
  constructor(private readonly sql: Sql) {}
  saveGoal(userId: UserId, id: string | null, input: PeriodGoalInput): Promise<string> {
    return this.sql.begin(async (tx) => {
      if (id && (await periodGoal(tx, userId, id)).level !== input.level) throw new Error("Goal level은 변경할 수 없습니다.");
      validatePeriodGoalParent(input, input.parentGoalId ? await goal(tx, userId, input.parentGoalId) : null, id ?? undefined);
      let resultId = id;
      if (id) await tx`update public.goals set title=${input.title},period_start=${input.periodStart},period_end=${input.periodEnd},
        parent_goal_id=${input.parentGoalId},updated_at=now() where id=${id} and user_id=${userId}`;
      else {
        const rows = await tx<{ id: string }[]>`insert into public.goals(user_id,title,importance,status,origin,level,period_start,period_end,parent_goal_id)
          values(${userId},${input.title},3,'active','user',${input.level},${input.periodStart},${input.periodEnd},${input.parentGoalId}) returning id`;
        resultId = rows[0]!.id;
      }
      await event(tx, userId, id ? "goal_updated" : "goal_created", "goal", resultId!);
      return resultId!;
    });
  }
  archiveGoal(userId: UserId, id: string): Promise<void> {
    return this.sql.begin(async (tx) => {
      await periodGoal(tx, userId, id);
      await tx`update public.goals set status='archived',archived_at=now(),updated_at=now() where id=${id} and user_id=${userId}`;
      await event(tx, userId, "goal_archived", "goal", id);
    });
  }
  saveObjective(userId: UserId, id: string | null, input: PeriodObjectiveInput): Promise<string> {
    return this.sql.begin(async (tx) => {
      await periodGoal(tx, userId, input.goalId);
      if (id) {
        const rows = await tx<{ goal_id: string }[]>`select goal_id from public.objectives where id=${id} and user_id=${userId}
          and status not in ('cancelled','archived') for update`;
        if (!rows[0] || rows[0].goal_id !== input.goalId) throw new Error("Objective 연결과 소유권을 확인해 주세요.");
        await tx`update public.objectives set title=${input.title},success_criteria=${input.successCriteria},target_date=${input.targetDate},
          progress_mode=${input.progressMode},target_value=${input.targetValue},current_value=${input.currentValue},unit=${input.unit},
          status=${input.status},completed_at=${input.status === "achieved" ? new Date() : null} where id=${id} and user_id=${userId}`;
      } else {
        const rows = await tx<{ id: string }[]>`insert into public.objectives(user_id,goal_id,title,success_criteria,target_date,importance,status,origin,
          progress_mode,target_value,current_value,unit,completed_at) values(${userId},${input.goalId},${input.title},${input.successCriteria},
          ${input.targetDate},3,${input.status},'user',${input.progressMode},${input.targetValue},${input.currentValue},${input.unit},
          ${input.status === "achieved" ? new Date() : null}) returning id`;
        id = rows[0]!.id;
      }
      await event(tx, userId, "objective_saved", "objective", id);
      return id;
    });
  }
  cancelObjective(userId: UserId, id: string): Promise<void> {
    return this.sql.begin(async (tx) => {
      const rows = await tx<{ goal_id: string }[]>`select goal_id from public.objectives where id=${id} and user_id=${userId}
        and status not in ('cancelled','archived') for update`;
      if (!rows[0]) throw new Error("Objective를 찾지 못했습니다.");
      await periodGoal(tx, userId, rows[0].goal_id);
      await tx`update public.objectives set status='cancelled' where id=${id} and user_id=${userId}`;
      await event(tx, userId, "objective_cancelled", "objective", id);
    });
  }
}
