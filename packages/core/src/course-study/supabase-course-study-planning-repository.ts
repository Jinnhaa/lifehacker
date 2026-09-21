import { createHash } from "node:crypto";
import type { JSONValue, Sql } from "postgres";
import type {
  CourseProgressObservation,
  CourseStudyPlanningRepository,
  CourseStudyRecommendation,
  CourseStudySignal
} from "./course-study-planning.js";

interface CourseRow { id: string; title: string; course_id: string }
interface TaskRow { work_context_id: string; title: string; status: string; official_deadline: Date | null; external_type: string }
interface ExamRow { work_context_id: string; title: string; due_at: Date }

const addDays = (date: string, days: number): string => {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export class SupabaseCourseStudyPlanningRepository implements CourseStudyPlanningRepository {
  constructor(private readonly sql: Sql) {}

  async loadCourseSignals(input: Parameters<CourseStudyPlanningRepository["loadCourseSignals"]>[0]): Promise<readonly CourseStudySignal[]> {
    const [courses, tasks, exams] = await Promise.all([
      this.sql<CourseRow[]>`
        select w.id,w.title,r.external_id course_id
        from public.work_contexts w join public.course_profiles cp on cp.work_context_id=w.id and cp.user_id=w.user_id
        join public.external_references r on r.user_id=w.user_id and r.internal_entity_type='work_context' and r.internal_entity_id=w.id
          and r.source='snowboard' and r.external_type='course' and r.sync_status='active'
        where w.user_id=${input.userId} and w.kind='course' and w.status <> 'archived' and cp.term=${input.currentTerm}
        order by w.title
      `,
      this.sql<TaskRow[]>`
        select t.work_context_id,t.title,t.status,t.official_deadline,r.external_type
        from public.tasks t join public.external_references r on r.user_id=t.user_id and r.internal_entity_type='task' and r.internal_entity_id=t.id
          and r.source='snowboard' and r.external_type in ('assignment','quiz')
        where t.user_id=${input.userId} and t.work_context_id is not null and t.official_deadline is not null
      `,
      this.sql<ExamRow[]>`
        select c.value->>'courseContextId' work_context_id,coalesce(c.value->>'title','시험') title,c.valid_from due_at
        from public.constraints c join public.external_references r on r.user_id=c.user_id and r.internal_entity_type='constraint' and r.internal_entity_id=c.id
          and r.source='snowboard' and r.external_type='academic_schedule'
        where c.user_id=${input.userId} and c.value->>'courseContextId' is not null
      `
    ]);
    const progress = new Map(input.progress.map((value) => [value.courseId, value]));
    return courses.map((course) => {
      const observed = progress.get(course.course_id);
      const assessments = [
        ...tasks.filter((task) => task.work_context_id === course.id).map((task) => ({
          type: task.external_type === "quiz" ? "quiz" as const : "assignment" as const,
          title: task.title,
          dueAt: task.official_deadline!,
          completed: task.status === "DONE"
        })),
        ...exams.filter((exam) => exam.work_context_id === course.id).map((exam) => ({
          type: "exam" as const,
          title: exam.title,
          dueAt: exam.due_at,
          completed: false
        }))
      ];
      return {
        workContextId: course.id,
        courseId: course.course_id,
        title: course.title,
        completedLectureCount: observed?.completedLectureCount ?? 0,
        remainingLectureCount: observed?.remainingLectureCount ?? 0,
        remainingLectureMinutes: observed?.remainingLectureMinutes ?? 0,
        assessments
      };
    });
  }

  async saveRecommendations(input: Parameters<CourseStudyPlanningRepository["saveRecommendations"]>[0]): Promise<void> {
    for (const recommendation of input.recommendations) {
      await this.saveRecommendation(input, recommendation);
    }
  }

  private saveRecommendation(
    input: Parameters<CourseStudyPlanningRepository["saveRecommendations"]>[0],
    recommendation: CourseStudyRecommendation
  ): Promise<void> {
    return this.sql.begin(async (transaction) => {
      const externalId = recommendation.workContextId;
      await transaction`select pg_advisory_xact_lock(hashtext(${`${input.userId}:course-study:${externalId}`}))`;
      const references = await transaction<{ internal_entity_type: string; internal_entity_id: string }[]>`
        select internal_entity_type,internal_entity_id from public.external_references
        where user_id=${input.userId} and source='amber' and external_type='course_study_workload' and external_id=${externalId}
      `;
      const reference = references[0];
      if (reference && reference.internal_entity_type !== "recurring_activity") {
        throw new Error(`Course study workload ${externalId} is linked to an invalid entity`);
      }
      const targetCount = Math.max(1, Math.min(7, Math.ceil(recommendation.weeklyMinutes / recommendation.todayMinutes)));
      const preferredDays = Array.from({ length: Math.min(targetCount, 8 - input.localWeekday) }, (_, index) => input.localWeekday + index);
      const importance = 5 - recommendation.priorityRank;
      let activityId = reference?.internal_entity_id;
      if (activityId) {
        const updated = await transaction<{ id: string }[]>`
          update public.recurring_activities set title=${`${recommendation.title} 학습`},category='study',period='week',
            target_count=${targetCount},expected_minutes=${recommendation.todayMinutes},minimum_minutes=${Math.min(15, recommendation.todayMinutes)},
            scheduling_mode='flexible',preferred_days=${preferredDays},importance=${importance},effective_from=${addDays(input.planDate, -(input.localWeekday - 1))},
            effective_until=null,active=true,updated_at=${input.observedAt}
          where id=${activityId} and user_id=${input.userId} returning id
        `;
        if (!updated[0]) throw new Error(`Course study activity ${activityId} is missing`);
      } else {
        activityId = (await transaction<{ id: string }[]>`
          insert into public.recurring_activities(user_id,title,category,period,target_count,expected_minutes,minimum_minutes,scheduling_mode,preferred_days,importance,effective_from,active)
          values (${input.userId},${`${recommendation.title} 학습`},'study','week',${targetCount},${recommendation.todayMinutes},${Math.min(15, recommendation.todayMinutes)},'flexible',${preferredDays},${importance},${addDays(input.planDate, -(input.localWeekday - 1))},true)
          returning id
        `)[0]!.id;
      }
      const payload = {
        currentTerm: input.currentTerm,
        planDate: input.planDate,
        courseId: recommendation.courseId,
        workContextId: recommendation.workContextId,
        weeklyMinutes: recommendation.weeklyMinutes,
        todayMinutes: recommendation.todayMinutes,
        priorityRank: recommendation.priorityRank,
        reasons: recommendation.reasons,
        signals: recommendation.signals
      };
      const contentHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
      await transaction`
        insert into public.external_references(user_id,source,external_type,external_id,external_version,ownership,content_hash,internal_entity_type,internal_entity_id,sync_status,first_seen_at,last_seen_at)
        values (${input.userId},'amber','course_study_workload',${externalId},${input.currentTerm},'amber_managed',${contentHash},'recurring_activity',${activityId},'active',${input.observedAt},${input.observedAt})
        on conflict(user_id,source,external_type,external_id) do update set external_version=excluded.external_version,
          content_hash=excluded.content_hash,internal_entity_type=excluded.internal_entity_type,internal_entity_id=excluded.internal_entity_id,
          sync_status='active',last_seen_at=excluded.last_seen_at,deleted_at=null
      `;
      await transaction`
        insert into public.domain_events(user_id,event_type,aggregate_type,aggregate_id,actor_type,occurred_at,correlation_id,idempotency_key,payload_version,payload)
        values (${input.userId},'course_study_workload_reconciled','recurring_activity',${activityId},'system',${input.observedAt},gen_random_uuid(),
          ${`course-study:${input.planDate}:${recommendation.workContextId}:${contentHash}`},1,${transaction.json(payload as unknown as JSONValue)})
        on conflict(user_id,idempotency_key) do nothing
      `;
    });
  }
}
