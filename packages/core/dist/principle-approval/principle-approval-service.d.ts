import type { PrincipleApprovalDependencies, PrincipleApprovalMessage, PrincipleApprovalMessageHandler, PrincipleApprovalMessageResult, PrincipleProposal, PrincipleProposalFollowUp } from "./principle-approval.js";
export declare const formatPrincipleProposal: (proposal: PrincipleProposal) => string;
export declare class PrincipleApprovalService implements PrincipleApprovalMessageHandler, PrincipleProposalFollowUp {
    private readonly repository;
    private readonly clock;
    constructor(dependencies: PrincipleApprovalDependencies);
    afterPatternEvaluation(userId: PrincipleApprovalMessage["userId"]): Promise<string | null>;
    handlePrincipleApprovalMessage(message: PrincipleApprovalMessage): Promise<PrincipleApprovalMessageResult>;
}
//# sourceMappingURL=principle-approval-service.d.ts.map