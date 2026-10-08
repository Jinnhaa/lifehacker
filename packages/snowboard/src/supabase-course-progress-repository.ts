import type { UserId } from "@amber/shared";
import type { Sql } from "postgres";
import type { SnowboardCourseProgress } from "./contracts.js";

/** Persists the latest external observation only after resolving its canonical Course reference. */
export class SupabaseCourseProgressRepository {
  constructor(private readonly sql: Sql) {}

  async applyProgress(userId: UserId, progress: readonly SnowboardCourseProgress[]): Promise<number> {
    for (const item of progress) {
      const contexts = await this.sql<{ id: string }[]>`
        select w.id from public.external_references r
        join public.work_contexts w on w.id=r.internal_entity_id and w.user_id=r.user_id and w.kind='course'
        where r.user_id=${userId} and r.source='snowboard' and r.external_type='course'
          and r.external_id=${item.courseId} and r.internal_entity_type='work_context' and r.sync_status='active'`;
      if (!contexts[0]) throw new Error(`Snowboard course ${item.courseId} has no active Course WorkContext mapping`);
      await this.sql`
        insert into public.snowboard_course_progress(
          user_id,course_id,work_context_id,completed_lecture_count,remaining_lecture_count,
          remaining_lecture_minutes,observed_at
        ) values (${userId},${item.courseId},${contexts[0].id},${item.completedLectureCount},${item.remainingLectureCount},
          ${item.remainingLectureMinutes},${item.observedAt})
        on conflict(user_id,course_id) do update set
          work_context_id=excluded.work_context_id,
          completed_lecture_count=excluded.completed_lecture_count,
          remaining_lecture_count=excluded.remaining_lecture_count,
          remaining_lecture_minutes=excluded.remaining_lecture_minutes,
          observed_at=excluded.observed_at,updated_at=now()
        where excluded.observed_at >= public.snowboard_course_progress.observed_at`;
      for (const lecture of item.lectures) {
        await this.sql`
          insert into public.snowboard_lecture_progress(
            user_id,course_id,work_context_id,module_id,position,title,completed,estimated_minutes,observed_at
          ) values (${userId},${item.courseId},${contexts[0].id},${lecture.moduleId},${lecture.position},
            ${lecture.title},${lecture.completed},${lecture.estimatedMinutes},${item.observedAt})
          on conflict(user_id,course_id,module_id) do update set
            work_context_id=excluded.work_context_id,
            position=excluded.position,
            title=excluded.title,
            completed=excluded.completed,
            estimated_minutes=excluded.estimated_minutes,
            observed_at=excluded.observed_at,updated_at=now()
          where excluded.observed_at >= public.snowboard_lecture_progress.observed_at`;
      }
    }
    return progress.length;
  }
}
