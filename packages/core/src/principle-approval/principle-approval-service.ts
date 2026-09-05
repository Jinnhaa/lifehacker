import type {
  PrincipleApprovalDependencies,
  PrincipleApprovalMessage,
  PrincipleApprovalMessageHandler,
  PrincipleApprovalMessageResult,
  PrincipleProposal,
  PrincipleProposalFollowUp
} from "./principle-approval.js";

const approvals = new Set(["승인", "좋아"]);
const rejections = new Set(["거절", "아니"]);

export const formatPrincipleProposal = (proposal: PrincipleProposal): string => [
  `이런 선택이 ${proposal.evidenceCount}번 반복됐어.`,
  `앞으로 비슷한 상황에서는 “${proposal.statement}”를 기준으로 삼도록 할까?`,
  "",
  "“승인”, “거절”, 또는 “수정: ...”으로 알려줘."
].join("\n");

export class PrincipleApprovalService implements PrincipleApprovalMessageHandler, PrincipleProposalFollowUp {
  private readonly repository: PrincipleApprovalDependencies["repository"];
  private readonly clock: PrincipleApprovalDependencies["clock"];

  constructor(dependencies: PrincipleApprovalDependencies) {
    this.repository = dependencies.repository;
    this.clock = dependencies.clock;
  }

  async afterPatternEvaluation(userId: PrincipleApprovalMessage["userId"]): Promise<string | null> {
    const proposal = await this.repository.createEligibleProposal(userId, this.clock.now());
    return proposal ? formatPrincipleProposal(proposal) : null;
  }

  async handlePrincipleApprovalMessage(message: PrincipleApprovalMessage): Promise<PrincipleApprovalMessageResult> {
    const previousReply = await this.repository.findReplyByMessage(message.userId, message.messageId);
    if (previousReply) return { handled: true, reply: previousReply };
    const proposal = await this.repository.findPendingProposal(message.userId);
    if (!proposal) return { handled: false };
    const text = message.text.trim();
    if (approvals.has(text)) {
      const reply = "좋아. 네가 승인한 기준으로 저장했어.";
      await this.repository.approve(proposal, message.messageId, this.clock.now(), reply);
      return { handled: true, reply };
    }
    if (rejections.has(text)) {
      const reply = "알겠어. 이 제안은 적용하지 않을게.";
      await this.repository.reject(proposal, message.messageId, this.clock.now(), reply);
      return { handled: true, reply };
    }
    const revision = /^수정\s*:\s*(.+)$/s.exec(text)?.[1]?.trim();
    if (revision) {
      const reply = `수정한 내용으로 다시 확인할게.\n앞으로 “${revision}”를 기준으로 삼을까?\n\n“승인” 또는 “거절”로 알려줘.`;
      await this.repository.revise(proposal, revision, message.messageId, this.clock.now(), reply);
      return { handled: true, reply };
    }
    return { handled: false };
  }
}
