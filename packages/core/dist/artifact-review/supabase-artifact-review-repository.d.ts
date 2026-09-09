import { type UserId } from "@amber/shared";
import type { Sql } from "postgres";
import type { ArtifactReviewCommand, ArtifactReviewRecord, ArtifactReviewRepository, ArtifactReviewTarget } from "./artifact-review.js";
export declare class SupabaseArtifactReviewRepository implements ArtifactReviewRepository {
    private readonly sql;
    constructor(sql: Sql);
    loadTarget(userId: UserId, artifactId: string): Promise<ArtifactReviewTarget | null>;
    recordReview(input: {
        readonly command: ArtifactReviewCommand;
        readonly target: ArtifactReviewTarget;
        readonly now: Date;
    }): Promise<ArtifactReviewRecord>;
}
//# sourceMappingURL=supabase-artifact-review-repository.d.ts.map