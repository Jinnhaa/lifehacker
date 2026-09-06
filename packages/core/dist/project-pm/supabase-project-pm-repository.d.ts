import type { UserId } from "@amber/shared";
import type { Sql } from "postgres";
import type { ProjectPmContext, ProjectPmRepository, ProjectPmRunRecorder, ProjectWorkContext } from "./project-pm.js";
export declare class SupabaseProjectPmRepository implements ProjectPmRepository {
    private readonly sql;
    constructor(sql: Sql);
    listProjects(userId: UserId): Promise<readonly ProjectWorkContext[]>;
    loadProjectContext(userId: UserId, project: ProjectWorkContext, planDate: string, timeZone: string, now: Date): Promise<ProjectPmContext>;
}
export declare class SupabaseProjectPmRunRecorder implements ProjectPmRunRecorder {
    private readonly recorder;
    constructor(sql: Sql);
    findCompleted(userId: UserId, triggerId: string): Promise<string | null>;
    recordCompleted(input: Parameters<ProjectPmRunRecorder["recordCompleted"]>[0]): Promise<void>;
}
//# sourceMappingURL=supabase-project-pm-repository.d.ts.map