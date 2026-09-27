import type { UserId } from "@amber/shared";
import type { JSONValue, Sql, TransactionSql } from "postgres";
import type { LearningBootstrap, LearningBootstrapResult } from "./learning-bootstrap.js";

interface IdRow { id: string }

const json = (tx: TransactionSql, value: unknown) => tx.json(value as JSONValue);

async function exactlyOneOrNone(rows: readonly IdRow[], label: string): Promise<IdRow | undefined> {
  if (rows.length > 1) throw new Error(`Multiple rows match bootstrap key: ${label}`);
  return rows[0];
}

export class SupabaseLearningBootstrapRepository {
  constructor(private readonly sql: Sql) {}

  apply(userId: UserId, bootstrap: LearningBootstrap): Promise<LearningBootstrapResult> {
    return this.sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext(${`${userId}:learning-bootstrap:${bootstrap.name}`}))`;
      const contextIds = new Map<string, string>();
      const stageIds = new Map<string, string>();
      const materialIds = new Map<string, string>();
      let units = 0;

      for (const context of bootstrap.contexts) {
        const row = await exactlyOneOrNone(await tx<IdRow[]>`
          select id from public.work_contexts
          where user_id=${userId} and kind=${context.kind} and title=${context.title}
            and status<>'archived' and archived_at is null
          order by created_at for update`, `context:${context.kind}:${context.title}`);
        const contextId = row?.id ?? (await tx<IdRow[]>`
          insert into public.work_contexts(user_id,kind,title,status,agent_mode,commitment_level,strategy_config)
          values(${userId},${context.kind},${context.title},'active','not_applicable',${context.commitmentLevel},${json(tx, context.strategyConfig)})
          returning id`)[0]!.id;
        contextIds.set(context.key, contextId);
        await tx`update public.work_contexts set
          commitment_level=coalesce(${context.commitmentLevel},commitment_level),
          strategy_config=strategy_config || ${json(tx, context.strategyConfig)}
          where id=${contextId} and user_id=${userId}`;

        if (context.courseProfile) {
          await tx`insert into public.course_profiles(work_context_id,user_id,target_grade,term)
            values(${contextId},${userId},${context.courseProfile.targetGrade},${context.courseProfile.term})
            on conflict(work_context_id) do update set target_grade=excluded.target_grade,term=excluded.term,updated_at=now()`;
        }
        if (context.certificationProfile) {
          const profile = context.certificationProfile;
          await tx`insert into public.certification_profiles(work_context_id,user_id,target_outcome,exam_date,study_mode,current_level)
            values(${contextId},${userId},${profile.targetOutcome},${profile.examDate},${profile.studyMode},${profile.currentLevel})
            on conflict(work_context_id) do update set target_outcome=excluded.target_outcome,exam_date=excluded.exam_date,
              study_mode=excluded.study_mode,current_level=excluded.current_level,updated_at=now()`;
        }

        for (const stage of context.stages) {
          const existing = await exactlyOneOrNone(await tx<IdRow[]>`
            select id from public.learning_stages where user_id=${userId} and work_context_id=${contextId} and position=${stage.position}
            for update`, `stage:${context.key}:${stage.position}`);
          const stageId = existing?.id ?? (await tx<IdRow[]>`
            insert into public.learning_stages(user_id,work_context_id,title,position,status,completion_mode,transition_mode,config)
            values(${userId},${contextId},${stage.title},${stage.position},${stage.status},${stage.completionMode},${stage.transitionMode},${json(tx, stage.config)})
            returning id`)[0]!.id;
          if (existing) await tx`update public.learning_stages set title=${stage.title},status=${stage.status},
            completion_mode=${stage.completionMode},transition_mode=${stage.transitionMode},config=${json(tx, stage.config)},updated_at=now()
            where id=${stageId} and user_id=${userId}`;
          stageIds.set(`${context.key}:${stage.key}`, stageId);
        }

        for (const material of context.materials) {
          const stageId = material.stageKey === null ? null : stageIds.get(`${context.key}:${material.stageKey}`);
          if (material.stageKey !== null && !stageId) throw new Error(`Unknown stage key: ${context.key}:${material.stageKey}`);
          const existing = await exactlyOneOrNone(await tx<IdRow[]>`
            select id from public.learning_materials where user_id=${userId} and work_context_id=${contextId} and title=${material.title}
            for update`, `material:${context.key}:${material.title}`);
          // Preserve the structured-data key so runtime condition DSL references never fall back to title matching.
          const materialConfig = { ...material.config, conditionKey: material.key };
          const materialId = existing?.id ?? (await tx<IdRow[]>`
            insert into public.learning_materials(user_id,work_context_id,stage_id,title,material_type,role,tracking_mode,
              unit_type,total_units,start_unit,status,source_reference,config)
            values(${userId},${contextId},${stageId ?? null},${material.title},${material.materialType},${material.role},${material.trackingMode},
              ${material.unitType},${material.totalUnits},${material.startUnit},${material.status},${material.sourceReference ? json(tx, material.sourceReference) : null},${json(tx, materialConfig)})
            returning id`)[0]!.id;
          if (existing) await tx`update public.learning_materials set stage_id=${stageId ?? null},material_type=${material.materialType},
            role=${material.role},tracking_mode=${material.trackingMode},unit_type=${material.unitType},total_units=${material.totalUnits},
            start_unit=${material.startUnit},status=${material.status},source_reference=${material.sourceReference ? json(tx, material.sourceReference) : null},
            config=${json(tx, materialConfig)},updated_at=now() where id=${materialId} and user_id=${userId}`;
          materialIds.set(`${context.key}:${material.key}`, materialId);
          if (material.generateUnits) units += await this.upsertUnits(tx, userId, contextId, stageId ?? null, materialId, material.generateUnits);
        }

        for (const policy of context.allocationPolicies) {
          const stageId = policy.stageKey === null ? null : stageIds.get(`${context.key}:${policy.stageKey}`);
          if (policy.stageKey !== null && !stageId) throw new Error(`Unknown stage key: ${context.key}:${policy.stageKey}`);
          const existing = await exactlyOneOrNone(await tx<IdRow[]>`
            select id from public.learning_allocation_policies
            where user_id=${userId} and work_context_id=${contextId} and name=${policy.name} for update`,
            `allocation-policy:${context.key}:${policy.name}`);
          const policyId = existing?.id ?? (await tx<IdRow[]>`
            insert into public.learning_allocation_policies(user_id,work_context_id,stage_id,name,profile_type,
              activation_condition,recovery_mode,priority,active,config)
            values(${userId},${contextId},${stageId ?? null},${policy.name},${policy.profileType},${json(tx, policy.activationCondition)},
              ${policy.recoveryMode},${policy.priority},true,${json(tx, policy.config)}) returning id`)[0]!.id;
          if (existing) await tx`update public.learning_allocation_policies set stage_id=${stageId ?? null},profile_type=${policy.profileType},
            activation_condition=${json(tx, policy.activationCondition)},recovery_mode=${policy.recoveryMode},priority=${policy.priority},
            active=true,config=${json(tx, policy.config)},updated_at=now() where id=${policyId} and user_id=${userId}`;
          for (const item of policy.items) {
            const materialId = materialIds.get(`${context.key}:${item.materialKey}`);
            if (!materialId) throw new Error(`Unknown material key: ${context.key}:${item.materialKey}`);
            await tx`insert into public.learning_allocation_items(user_id,allocation_policy_id,material_id,target_units,minimum_units,
              estimated_minutes_min,estimated_minutes_max,position,active)
              values(${userId},${policyId},${materialId},${item.targetUnits},${item.minimumUnits},${item.estimatedMinutesMin},${item.estimatedMinutesMax},${item.position},true)
              on conflict(allocation_policy_id,position) do update set material_id=excluded.material_id,target_units=excluded.target_units,
                minimum_units=excluded.minimum_units,estimated_minutes_min=excluded.estimated_minutes_min,
                estimated_minutes_max=excluded.estimated_minutes_max,active=true,updated_at=now()`;
          }
        }

        for (const assessment of context.assessments) {
          if (assessment.dueDate !== null && assessment.dueAt !== null) throw new Error(`Conflicting assessment timing: ${context.title}/${assessment.title}`);
          const existing = await exactlyOneOrNone(await tx<IdRow[]>`
            select id from public.course_assessments where user_id=${userId} and course_context_id=${contextId}
              and assessment_type=${assessment.type} and title=${assessment.title} for update`,
            `assessment:${context.key}:${assessment.type}:${assessment.title}`);
          if (!existing) {
            await tx`insert into public.course_assessments(user_id,course_context_id,assessment_type,title,weight_percent,due_date,due_at,
              provenance,observed_at) values(${userId},${contextId},${assessment.type},${assessment.title},${assessment.weightPercent},
              ${assessment.dueDate},${assessment.dueAt},${assessment.provenance},now())`;
          } else {
            await tx`update public.course_assessments set weight_percent=${assessment.weightPercent},due_date=${assessment.dueDate},
              due_at=${assessment.dueAt},updated_at=now() where id=${existing.id} and user_id=${userId} and provenance=${assessment.provenance}`;
          }
        }
      }

      for (const relation of bootstrap.relations) {
        const fromId = contextIds.get(relation.fromContextKey);
        const toId = contextIds.get(relation.toContextKey);
        if (!fromId || !toId) throw new Error(`Unknown relation context: ${relation.fromContextKey}->${relation.toContextKey}`);
        await tx`insert into public.context_relations(user_id,from_context_id,to_context_id,relation_type,config,active)
          values(${userId},${fromId},${toId},${relation.relationType},${json(tx, relation.config)},true)
          on conflict(user_id,from_context_id,to_context_id,relation_type) do update set config=excluded.config,active=true,updated_at=now()`;
      }

      return {
        contexts: bootstrap.contexts.length,
        stages: bootstrap.contexts.reduce((sum, item) => sum + item.stages.length, 0),
        materials: bootstrap.contexts.reduce((sum, item) => sum + item.materials.length, 0),
        units,
        allocationPolicies: bootstrap.contexts.reduce((sum, item) => sum + item.allocationPolicies.length, 0),
        assessments: bootstrap.contexts.reduce((sum, item) => sum + item.assessments.length, 0),
        relations: bootstrap.relations.length
      };
    });
  }

  private async upsertUnits(
    tx: TransactionSql,
    userId: UserId,
    contextId: string,
    stageId: string | null,
    materialId: string,
    generated: { from: number; to: number; titlePrefix: string }
  ): Promise<number> {
    if (generated.to < generated.from) throw new Error(`Invalid generated unit range: ${generated.from}-${generated.to}`);
    let nextPosition = Number((await tx<{ value: number }[]>`
      select coalesce(max(position),0)::integer+1 value from public.learning_units
      where user_id=${userId} and work_context_id=${contextId}`)[0]!.value);
    for (let sequence = generated.from; sequence <= generated.to; sequence += 1) {
      const existing = await exactlyOneOrNone(await tx<IdRow[]>`
        select id from public.learning_units where user_id=${userId} and material_id=${materialId} and sequence_no=${sequence}
        for update`, `learning-unit:${materialId}:${sequence}`);
      if (existing) {
        await tx`update public.learning_units set stage_id=${stageId},title=${`${generated.titlePrefix} ${sequence}`},
          unit_type='LESSON',updated_at=now() where id=${existing.id} and user_id=${userId}`;
      } else {
        await tx`insert into public.learning_units(user_id,work_context_id,title,position,stage_id,material_id,sequence_no,unit_type,
          exposure_state,understanding_state,validation_state)
          values(${userId},${contextId},${`${generated.titlePrefix} ${sequence}`},${nextPosition},${stageId},${materialId},${sequence},'LESSON',
            'NOT_STARTED','UNKNOWN','NOT_TESTED')`;
        nextPosition += 1;
      }
    }
    return generated.to - generated.from + 1;
  }
}
