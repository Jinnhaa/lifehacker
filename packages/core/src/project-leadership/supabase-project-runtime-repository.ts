import type { UserId } from "@amber/shared";
import type { Sql } from "postgres";
import type { ProjectWorkContext } from "../project-pm/project-pm.js";
import { backlogProposalArtifactSchema, gapAnalysisArtifactSchema, projectStateSnapshotSchema } from "./project-leadership.js";
import type { ProjectRuntimeFacts, ProjectRuntimeRepository } from "./project-runtime.js";

type WorkflowRow = {
  id: string;
  status: "running" | "completed" | "failed";
  current_step: string | null;
  checkpoint_state: Record<string, unknown>;
};
type ArtifactRow = { id: string; artifact_type: string; title: string | null; content_text: string; content_hash: string };

export class SupabaseProjectRuntimeRepository implements ProjectRuntimeRepository {
  constructor(private readonly sql: Sql) {}

  async loadFacts(userId: UserId, project: ProjectWorkContext): Promise<ProjectRuntimeFacts> {
    const [workflows, steps, running, reviews, waiting] = await Promise.all([
      this.sql<WorkflowRow[]>`
        select id,status,current_step,checkpoint_state from public.workflow_runs
        where user_id=${userId} and workflow_type='project_leadership_iteration'
          and checkpoint_state->>'workContextId'=${project.id}
        order by started_at desc limit 1
      `,
      this.sql<{ id: string; title: string; owner: "user" | "ai"; status: string; dependencies_resolved: boolean }[]>`
        select s.id,s.title,s.owner,s.status,
          not exists(
            select 1 from public.task_steps previous
            where previous.user_id=s.user_id and previous.task_id=s.task_id and previous.position<s.position
              and previous.status not in ('completed','skipped')
          ) and not exists(
            select 1 from public.task_dependencies d
            join public.tasks prerequisite on prerequisite.id=d.prerequisite_task_id and prerequisite.user_id=d.user_id
            where d.user_id=s.user_id and d.task_id=s.task_id and prerequisite.status<>'DONE'
          ) dependencies_resolved
        from public.task_steps s join public.tasks t on t.id=s.task_id and t.user_id=s.user_id
        left join public.objectives o on o.id=t.objective_id and o.user_id=t.user_id
        where s.user_id=${userId} and t.status<>'DONE'
          and s.status not in ('completed','skipped','cancelled')
          and (t.work_context_id=${project.id} or (t.work_context_id is null and o.work_context_id=${project.id}))
        order by t.created_at,s.position
      `,
      this.sql<{ count: number }[]>`
        select count(*)::int count from public.agent_runs r
        join public.task_steps s on s.id=r.task_step_id and s.user_id=r.user_id
        join public.tasks t on t.id=s.task_id and t.user_id=s.user_id
        left join public.objectives o on o.id=t.objective_id and o.user_id=t.user_id
        where r.user_id=${userId} and r.status='running'
          and (t.work_context_id=${project.id} or (t.work_context_id is null and o.work_context_id=${project.id}))
      `,
      this.sql<{ id: string; title: string | null }[]>`
        select a.id,a.title from public.artifacts a
        left join public.tasks t on t.id=a.task_id and t.user_id=a.user_id
        left join public.objectives o on o.id=t.objective_id and o.user_id=t.user_id
        where a.user_id=${userId} and a.verification_status='verified' and a.review_status='pending_review'
          and (a.work_context_id=${project.id} or t.work_context_id=${project.id} or (t.work_context_id is null and o.work_context_id=${project.id}))
        order by a.created_at desc
      `,
      this.sql<{ count: number }[]>`
        select count(*)::int count from public.tasks t
        left join public.objectives o on o.id=t.objective_id and o.user_id=t.user_id
        where t.user_id=${userId} and t.status='WAITING_FOR_USER'
          and (t.work_context_id=${project.id} or (t.work_context_id is null and o.work_context_id=${project.id}))
      `
    ]);

    const workflow = workflows[0] ?? null;
    const artifact = async (key: string): Promise<ArtifactRow | null> => {
      const id = workflow?.checkpoint_state[key];
      if (typeof id !== "string") return null;
      const rows = await this.sql<ArtifactRow[]>`
        select id,artifact_type,title,content_text,content_hash from public.artifacts
        where id=${id} and user_id=${userId} and work_context_id=${project.id}
      `;
      return rows[0] ?? null;
    };
    const [snapshotRow, gapRow, proposalRow] = await Promise.all([
      artifact("snapshotArtifactId"), artifact("gapAnalysisArtifactId"), artifact("backlogProposalArtifactId")
    ]);
    const approvalRows = proposalRow ? await this.sql<{ id: string; status: "pending" | "approved" | "rejected" | "expired" | "cancelled" }[]>`
      select id,status from public.approval_requests
      where user_id=${userId} and action_type='materialize_backlog_proposal' and action_ref=${proposalRow.id}
      order by created_at desc limit 1
    ` : [];

    return {
      project,
      iteration: workflow ? {
        id: workflow.id,
        status: workflow.status,
        currentStep: workflow.current_step,
        snapshot: snapshotRow ? { id: snapshotRow.id, content: projectStateSnapshotSchema.parse(JSON.parse(snapshotRow.content_text)) } : null,
        gapAnalysis: gapRow ? { id: gapRow.id, content: gapAnalysisArtifactSchema.parse(JSON.parse(gapRow.content_text)) } : null,
        backlogProposal: proposalRow ? {
          id: proposalRow.id,
          contentHash: proposalRow.content_hash,
          content: backlogProposalArtifactSchema.parse(JSON.parse(proposalRow.content_text))
        } : null
      } : null,
      approval: approvalRows[0] ?? null,
      openSteps: steps.map((step) => ({
        id: step.id, title: step.title, owner: step.owner, status: step.status, dependenciesResolved: step.dependencies_resolved
      })),
      runningAgentRunCount: running[0]?.count ?? 0,
      pendingReviewArtifacts: reviews,
      waitingForUserCount: waiting[0]?.count ?? 0
    };
  }
}
