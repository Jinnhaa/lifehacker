import { createHash } from "node:crypto";
import type { UserId } from "@amber/shared";
import type { Sql } from "postgres";
import type { CourseContextBootstrapRepository, CourseContextMapping } from "./course-context-bootstrap.js";

interface ReferenceRow {
  internal_entity_type: string;
  internal_entity_id: string;
}

interface ContextRow {
  id: string;
}

export class SupabaseCourseContextBootstrapRepository implements CourseContextBootstrapRepository {
  constructor(private readonly sql: Sql) {}

  async connectCourse(input: Parameters<CourseContextBootstrapRepository["connectCourse"]>[0]): Promise<CourseContextMapping> {
    return this.sql.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtext(${`${input.userId}:snowboard:course:${input.course.courseId}`}))`;
      const references = await transaction<ReferenceRow[]>`
        select internal_entity_type,internal_entity_id from public.external_references
        where user_id=${input.userId} and source='snowboard' and external_type='course' and external_id=${input.course.courseId}
      `;
      const existingReference = references[0];
      if (existingReference) {
        if (existingReference.internal_entity_type !== "work_context") {
          throw new Error(`Snowboard course ${input.course.courseId} is not linked to a WorkContext`);
        }
        const contexts = await transaction<ContextRow[]>`
          select id from public.work_contexts
          where id=${existingReference.internal_entity_id} and user_id=${input.userId} and kind='course'
        `;
        if (!contexts[0]) throw new Error(`Snowboard course ${input.course.courseId} points to a missing Course WorkContext`);
        await this.touchCourse(transaction, input, contexts[0].id);
        return { courseId: input.course.courseId, workContextId: contexts[0].id, created: false };
      }

      const exactMatches = await transaction<ContextRow[]>`
        select id from public.work_contexts
        where user_id=${input.userId} and kind='course' and status <> 'archived' and title=${input.course.title}
        order by created_at
      `;
      if (exactMatches.length > 1) {
        throw new Error(`Multiple exact Course WorkContexts match Snowboard course ${input.course.courseId}`);
      }
      const existing = exactMatches[0];
      const context = existing ?? (await transaction<ContextRow[]>`
        insert into public.work_contexts(user_id,kind,title,status,agent_mode)
        values (${input.userId},'course',${input.course.title},'active','not_applicable')
        returning id
      `)[0]!;
      await this.touchCourse(transaction, input, context.id);
      return { courseId: input.course.courseId, workContextId: context.id, created: existing === undefined };
    });
  }

  private async touchCourse(
    transaction: Sql,
    input: Parameters<CourseContextBootstrapRepository["connectCourse"]>[0],
    workContextId: string
  ): Promise<void> {
    const contentHash = createHash("sha256")
      .update(JSON.stringify({ title: input.course.title, term: input.currentTerm, period: input.course.period }))
      .digest("hex");
    await transaction`
      insert into public.course_profiles(work_context_id,user_id,term)
      values (${workContextId},${input.userId},${input.currentTerm})
      on conflict(work_context_id) do update set term=excluded.term,updated_at=now()
    `;
    await transaction`
      insert into public.external_references(
        user_id,source,external_type,external_id,external_version,ownership,content_hash,
        internal_entity_type,internal_entity_id,sync_status,first_seen_at,last_seen_at
      ) values (
        ${input.userId},'snowboard','course',${input.course.courseId},${input.currentTerm},'external',${contentHash},
        'work_context',${workContextId},'active',${input.observedAt},${input.observedAt}
      )
      on conflict(user_id,source,external_type,external_id) do update set
        external_version=excluded.external_version,content_hash=excluded.content_hash,
        sync_status='active',last_seen_at=excluded.last_seen_at,deleted_at=null
    `;
  }
}
