import { randomUUID } from "node:crypto";
import type { UserId } from "@amber/shared";
import type { Sql, TransactionSql } from "postgres";
import type { LearningUnit, LearningUnitCreate, LearningUnitUpdate, LearningUnitRepository } from "./learning-unit.js";

async function lockLearningContext(tx: TransactionSql, userId: UserId, contextId: string): Promise<void> {
  const rows = await tx<{ kind: string }[]>`select kind from public.work_contexts
    where id=${contextId} and user_id=${userId} and status='active' and archived_at is null for update`;
  if (!rows[0]) throw new Error("활성 Learning Context를 찾지 못했습니다.");
  if (rows[0].kind !== "course" && rows[0].kind !== "certification") throw new Error("Course 또는 Certification에만 Learning Unit을 추가할 수 있습니다.");
}
async function loadUnit(tx: TransactionSql, userId: UserId, contextId: string, id: string): Promise<LearningUnit> {
  const rows = await tx<LearningUnit[]>`select id,user_id "userId",work_context_id "workContextId",title,position,
    exposure_state "exposureState",understanding_state "understandingState",validation_state "validationState"
    from public.learning_units where id=${id} and user_id=${userId} and work_context_id=${contextId} for update`;
  if (!rows[0]) throw new Error("Learning Unit을 찾지 못했습니다.");
  return rows[0];
}
async function checkPosition(tx: TransactionSql, contextId: string, position: number, id: string | null): Promise<void> {
  const rows = await tx`select id from public.learning_units where work_context_id=${contextId} and position=${position}
    and (${id}::uuid is null or id<>${id}::uuid)`;
  if (rows.length) throw new Error("이미 사용 중인 순서입니다. 다른 순서를 입력해 주세요.");
}
async function recordEvent(tx: TransactionSql, userId: UserId, eventType: string, id: string, before: LearningUnit | null, after: LearningUnit | null): Promise<void> {
  await tx`insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,payload_version,payload)
    values(${userId},${eventType},'learning_unit',${id},'user',now(),${randomUUID()},1,
      ${tx.json({ source: "learning", before: before ? { ...before } : null, after: after ? { ...after } : null })})`;
}

export class SupabaseLearningUnitRepository implements LearningUnitRepository {
  constructor(private readonly sql: Sql) {}
  async list(userId: UserId): Promise<readonly LearningUnit[]> {
    return this.sql<LearningUnit[]>`select u.id,u.user_id "userId",u.work_context_id "workContextId",u.title,u.position,
      u.exposure_state "exposureState",u.understanding_state "understandingState",u.validation_state "validationState"
      from public.learning_units u join public.work_contexts w on w.id=u.work_context_id and w.user_id=u.user_id
      where u.user_id=${userId} and w.kind in ('course','certification') and w.status='active' and w.archived_at is null
      order by u.work_context_id,u.position`;
  }
  create(userId: UserId, contextId: string, input: LearningUnitCreate): Promise<LearningUnit> {
    return this.sql.begin(async (tx) => {
      await lockLearningContext(tx, userId, contextId);
      const positions = await tx<{ next_position: number }[]>`select coalesce(max(position),0)::bigint+1 next_position
        from public.learning_units where work_context_id=${contextId} and user_id=${userId}`;
      const position = input.position ?? Number(positions[0]!.next_position);
      if (position > 2147483647) throw new Error("사용 가능한 순서 범위를 초과했습니다.");
      await checkPosition(tx, contextId, position, null);
      const rows = await tx<{ id: string }[]>`insert into public.learning_units(user_id,work_context_id,title,position,exposure_state,understanding_state,validation_state)
        values(${userId},${contextId},${input.title},${position},${input.exposureState},${input.understandingState},${input.validationState}) returning id`;
      const unit = await loadUnit(tx, userId, contextId, rows[0]!.id);
      await recordEvent(tx, userId, "learning_unit_created", unit.id, null, unit);
      return unit;
    });
  }
  update(userId: UserId, contextId: string, id: string, input: LearningUnitUpdate): Promise<LearningUnit> {
    return this.sql.begin(async (tx) => {
      await lockLearningContext(tx, userId, contextId);
      const before = await loadUnit(tx, userId, contextId, id);
      if (input.position !== undefined) await checkPosition(tx, contextId, input.position, id);
      await tx`update public.learning_units set title=${input.title ?? before.title},position=${input.position ?? before.position},
        exposure_state=${input.exposureState ?? before.exposureState},understanding_state=${input.understandingState ?? before.understandingState},
        validation_state=${input.validationState ?? before.validationState},updated_at=now()
        where id=${id} and user_id=${userId} and work_context_id=${contextId}`;
      const after = await loadUnit(tx, userId, contextId, id);
      await recordEvent(tx, userId, "learning_unit_updated", id, before, after);
      return after;
    });
  }
  delete(userId: UserId, contextId: string, id: string): Promise<void> {
    return this.sql.begin(async (tx) => {
      await lockLearningContext(tx, userId, contextId);
      const before = await loadUnit(tx, userId, contextId, id);
      await tx`delete from public.learning_units where id=${id} and user_id=${userId} and work_context_id=${contextId}`;
      await recordEvent(tx, userId, "learning_unit_deleted", id, before, null);
    });
  }
}
