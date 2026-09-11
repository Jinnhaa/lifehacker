import type { UserId } from "@amber/shared";
import type { Sql } from "postgres";
import { type BacklogProposalArtifact, type GapAnalysisArtifact, type ProjectLeadershipRepository, type ProjectLeadershipWorkflowState, type ProjectStateSnapshot } from "./project-leadership.js";
export declare class SupabaseProjectLeadershipRepository implements ProjectLeadershipRepository {
    private readonly sql;
    constructor(sql: Sql);
    getOrCreateWorkflow(input: Parameters<ProjectLeadershipRepository["getOrCreateWorkflow"]>[0]): Promise<ProjectLeadershipWorkflowState>;
    saveSnapshot(userId: UserId, run: ProjectLeadershipWorkflowState, content: ProjectStateSnapshot, now: Date): Promise<ProjectLeadershipWorkflowState>;
    saveGapAnalysis(userId: UserId, run: ProjectLeadershipWorkflowState, content: GapAnalysisArtifact, now: Date): Promise<ProjectLeadershipWorkflowState>;
    saveBacklogProposal(userId: UserId, run: ProjectLeadershipWorkflowState, content: BacklogProposalArtifact, now: Date): Promise<ProjectLeadershipWorkflowState>;
    private saveArtifact;
    private loadState;
}
//# sourceMappingURL=supabase-project-leadership-repository.d.ts.map