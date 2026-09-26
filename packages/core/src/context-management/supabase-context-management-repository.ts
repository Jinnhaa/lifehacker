import type { UserId } from "@amber/shared";
import type { Sql, TransactionSql } from "postgres";
import type {
  CertificationContextRecord,
  CertificationProfileInput,
  CommitmentLevel,
  ContextCommonInput,
  ContextKind,
  ContextManagementRepository,
  CourseContextRecord,
  CourseProfileInput,
  ProjectContextRecord,
  ProjectStrategyInput
} from "./context-management.js";

interface ContextRow {
  id: string; user_id: string; kind: ContextKind; title: string; description: string | null;
  strategic_importance: number | null; commitment_level: CommitmentLevel | null; start_date: string | null;
  end_date: string | null; internal_start_date: string | null; strategy_config: unknown;
}

const strategy = (value: unknown): ProjectStrategyInput => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return {
    ...(record.projectType === "SPRINT" || record.projectType === "ONGOING" || record.projectType === "PERSONAL"
      ? { projectType: record.projectType } : {}),
    ...(Number.isInteger(record.reviewCadenceDays) && Number(record.reviewCadenceDays) > 0
      ? { reviewCadenceDays: Number(record.reviewCadenceDays) } : {}),
    ...(typeof record.displaceable === "boolean" ? { displaceable: record.displaceable } : {})
  };
};

const strategyJson = (value: ProjectStrategyInput): Record<string, string | number | boolean | null> => ({
  projectType: value.projectType ?? null,
  reviewCadenceDays: value.reviewCadenceDays ?? null,
  displaceable: value.displaceable ?? false
});

const common = (row: ContextRow) => ({
  id: row.id, userId: row.user_id as UserId, kind: row.kind, title: row.title, description: row.description,
  strategicImportance: row.strategic_importance, commitmentLevel: row.commitment_level,
  startDate: row.start_date, endDate: row.end_date, internalStartDate: row.internal_start_date,
  strategyConfig: strategy(row.strategy_config)
});

const requireKind = async (tx: TransactionSql, userId: UserId, contextId: string, expectedKind: ContextKind): Promise<void> => {
  const rows = await tx<{ kind: ContextKind }[]>`
    select kind from public.work_contexts where id=${contextId} and user_id=${userId} and archived_at is null for update
  `;
  if (!rows[0]) throw new Error("Context를 찾지 못했습니다.");
  if (rows[0].kind !== expectedKind) throw new Error("Context 종류는 변경할 수 없습니다.");
};

const updateContext = async (tx: TransactionSql, userId: UserId, contextId: string, input: ContextCommonInput, strategyConfig?: ProjectStrategyInput): Promise<void> => {
  const result = strategyConfig === undefined
    ? await tx`
      update public.work_contexts set title=${input.title.trim()},strategic_importance=${input.strategicImportance ?? null},commitment_level=${input.commitmentLevel ?? null},
        start_date=${input.startDate ?? null},end_date=${input.endDate ?? null},internal_start_date=${input.internalStartDate ?? null}
      where id=${contextId} and user_id=${userId} and archived_at is null
    `
    : await tx`
      update public.work_contexts set title=${input.title.trim()},description=${input.description ?? null},
        strategic_importance=${input.strategicImportance ?? null},commitment_level=${input.commitmentLevel ?? null},
        start_date=${input.startDate ?? null},end_date=${input.endDate ?? null},internal_start_date=${input.internalStartDate ?? null},
        strategy_config=${tx.json(strategyJson(strategyConfig))}
      where id=${contextId} and user_id=${userId} and archived_at is null
    `;
  if (result.count !== 1) throw new Error("Context를 수정하지 못했습니다.");
};

export class SupabaseContextManagementRepository implements ContextManagementRepository {
  constructor(private readonly sql: Sql) {}

  async listCourses(userId: UserId): Promise<readonly CourseContextRecord[]> {
    const rows = await this.sql<(ContextRow & { target_grade: string | null; term: string | null; instructor: string | null })[]>`
      select w.id,w.user_id,w.kind,w.title,w.description,w.strategic_importance,w.commitment_level,
        w.start_date::text,w.end_date::text,w.internal_start_date::text,w.strategy_config,
        p.target_grade,p.term,p.instructor
      from public.work_contexts w left join public.course_profiles p on p.work_context_id=w.id and p.user_id=w.user_id
      where w.user_id=${userId} and w.kind='course' and w.status='active' and w.archived_at is null order by w.title
    `;
    return rows.map((row) => ({ ...common(row), kind: "course", targetGrade: row.target_grade, term: row.term, instructor: row.instructor }));
  }

  async listCertifications(userId: UserId): Promise<readonly CertificationContextRecord[]> {
    const rows = await this.sql<(ContextRow & { target_outcome: string | null; exam_date: string | null; study_mode: CertificationContextRecord["studyMode"]; current_level: string | null })[]>`
      select w.id,w.user_id,w.kind,w.title,w.description,w.strategic_importance,w.commitment_level,
        w.start_date::text,w.end_date::text,w.internal_start_date::text,w.strategy_config,
        p.target_outcome,p.exam_date::text,p.study_mode,p.current_level
      from public.work_contexts w left join public.certification_profiles p on p.work_context_id=w.id and p.user_id=w.user_id
      where w.user_id=${userId} and w.kind='certification' and w.status='active' and w.archived_at is null order by w.title
    `;
    return rows.map((row) => ({ ...common(row), kind: "certification", targetOutcome: row.target_outcome,
      examDate: row.exam_date, studyMode: row.study_mode, currentLevel: row.current_level }));
  }

  async listProjects(userId: UserId): Promise<readonly ProjectContextRecord[]> {
    const rows = await this.sql<ContextRow[]>`
      select id,user_id,kind,title,description,strategic_importance,commitment_level,start_date::text,end_date::text,
        internal_start_date::text,strategy_config from public.work_contexts
      where user_id=${userId} and kind='project' and status='active' and archived_at is null order by title
    `;
    return rows.map((row) => ({ ...common(row), kind: "project" }));
  }

  createCourse(userId: UserId, context: ContextCommonInput, profile: CourseProfileInput): Promise<string> {
    return this.sql.begin(async (tx) => {
      const rows = await tx<{ id: string }[]>`
        insert into public.work_contexts(user_id,kind,title,description,status,start_date,end_date,agent_mode,
          strategic_importance,commitment_level,internal_start_date,strategy_config)
        values(${userId},'course',${context.title.trim()},${context.description ?? null},'active',${context.startDate ?? null},
          ${context.endDate ?? null},'not_applicable',${context.strategicImportance ?? null},${context.commitmentLevel ?? null},
          ${context.internalStartDate ?? null},${tx.json({})}) returning id
      `;
      const id = rows[0]!.id;
      await tx`insert into public.course_profiles(work_context_id,user_id,target_grade,term,instructor)
        values(${id},${userId},${profile.targetGrade ?? null},${profile.term ?? null},${profile.instructor ?? null})`;
      return id;
    });
  }

  createCertification(userId: UserId, context: ContextCommonInput, profile: CertificationProfileInput): Promise<string> {
    return this.sql.begin(async (tx) => {
      const rows = await tx<{ id: string }[]>`
        insert into public.work_contexts(user_id,kind,title,description,status,start_date,end_date,agent_mode,
          strategic_importance,commitment_level,internal_start_date,strategy_config)
        values(${userId},'certification',${context.title.trim()},${context.description ?? null},'active',${context.startDate ?? null},
          ${context.endDate ?? null},'not_applicable',${context.strategicImportance ?? null},${context.commitmentLevel ?? null},
          ${context.internalStartDate ?? null},${tx.json({})}) returning id
      `;
      const id = rows[0]!.id;
      await tx`insert into public.certification_profiles(work_context_id,user_id,target_outcome,exam_date,study_mode,current_level)
        values(${id},${userId},${profile.targetOutcome ?? null},${profile.examDate ?? null},${profile.studyMode ?? null},${profile.currentLevel ?? null})`;
      return id;
    });
  }

  createProject(userId: UserId, context: ContextCommonInput, projectStrategy: ProjectStrategyInput): Promise<string> {
    return this.sql.begin(async (tx) => {
      const rows = await tx<{ id: string }[]>`
        insert into public.work_contexts(user_id,kind,title,description,status,start_date,end_date,agent_mode,
          strategic_importance,commitment_level,internal_start_date,strategy_config)
        values(${userId},'project',${context.title.trim()},${context.description ?? null},'active',${context.startDate ?? null},
          ${context.endDate ?? null},'auto',${context.strategicImportance ?? null},${context.commitmentLevel ?? null},
          ${context.internalStartDate ?? null},${tx.json(strategyJson(projectStrategy))}) returning id
      `;
      return rows[0]!.id;
    });
  }

  updateCourse(userId: UserId, contextId: string, context: ContextCommonInput, profile: CourseProfileInput): Promise<void> {
    return this.sql.begin(async (tx) => {
      await requireKind(tx, userId, contextId, "course");
      await updateContext(tx, userId, contextId, context);
      const profileResult = await tx`insert into public.course_profiles(work_context_id,user_id,target_grade,term,instructor)
        values(${contextId},${userId},${profile.targetGrade ?? null},${profile.term ?? null},${profile.instructor ?? null})
        on conflict(work_context_id) do update set target_grade=excluded.target_grade,term=excluded.term,
          instructor=excluded.instructor,updated_at=now() where course_profiles.user_id=${userId}`;
      if (profileResult.count !== 1) throw new Error("Course profile을 수정하지 못했습니다.");
    });
  }

  updateCertification(userId: UserId, contextId: string, context: ContextCommonInput, profile: CertificationProfileInput): Promise<void> {
    return this.sql.begin(async (tx) => {
      await requireKind(tx, userId, contextId, "certification");
      await updateContext(tx, userId, contextId, context);
      const profileResult = await tx`insert into public.certification_profiles(work_context_id,user_id,target_outcome,exam_date,study_mode,current_level)
        values(${contextId},${userId},${profile.targetOutcome ?? null},${profile.examDate ?? null},${profile.studyMode ?? null},${profile.currentLevel ?? null})
        on conflict(work_context_id) do update set target_outcome=excluded.target_outcome,exam_date=excluded.exam_date,
          study_mode=excluded.study_mode,current_level=excluded.current_level,updated_at=now()
        where certification_profiles.user_id=${userId}`;
      if (profileResult.count !== 1) throw new Error("Certification profile을 수정하지 못했습니다.");
    });
  }

  updateProject(userId: UserId, contextId: string, context: ContextCommonInput, projectStrategy: ProjectStrategyInput): Promise<void> {
    return this.sql.begin(async (tx) => {
      await requireKind(tx, userId, contextId, "project");
      await updateContext(tx, userId, contextId, context, projectStrategy);
    });
  }

  archive(userId: UserId, contextId: string, expectedKind: ContextKind): Promise<void> {
    return this.sql.begin(async (tx) => {
      await requireKind(tx, userId, contextId, expectedKind);
      const result = await tx`update public.work_contexts set status='archived',archived_at=now()
        where id=${contextId} and user_id=${userId} and kind=${expectedKind} and archived_at is null`;
      if (result.count !== 1) throw new Error("Context를 보관하지 못했습니다.");
    });
  }
}
