import type { Clock, UserId } from "@amber/shared";

export interface PrincipleProposal {
  readonly id: string;
  readonly userId: UserId;
  readonly patternId: string;
  readonly statement: string;
  readonly evidenceCount: number;
  readonly revision: number;
  readonly origin: "pattern_observed" | "user_explicit";
}

export interface PrincipleApprovalMessage {
  readonly userId: UserId;
  readonly text: string;
  readonly messageId: string;
  readonly receivedAt: Date;
}

export interface PrincipleApprovalMessageResult {
  readonly handled: boolean;
  readonly reply?: string;
}

export interface PrincipleApprovalMessageHandler {
  handlePrincipleApprovalMessage(message: PrincipleApprovalMessage): Promise<PrincipleApprovalMessageResult>;
}

export interface PrincipleProposalFollowUp {
  afterPatternEvaluation(userId: UserId): Promise<string | null>;
}

export interface PrincipleApprovalRepository {
  createEligibleProposal(userId: UserId, now: Date): Promise<PrincipleProposal | null>;
  findPendingProposal(userId: UserId): Promise<PrincipleProposal | null>;
  findReplyByMessage(userId: UserId, messageId: string): Promise<string | null>;
  approve(proposal: PrincipleProposal, messageId: string, now: Date, reply: string): Promise<void>;
  reject(proposal: PrincipleProposal, messageId: string, now: Date, reply: string): Promise<void>;
  revise(proposal: PrincipleProposal, statement: string, messageId: string, now: Date, reply: string): Promise<PrincipleProposal>;
}

export interface PrincipleApprovalDependencies {
  readonly repository: PrincipleApprovalRepository;
  readonly clock: Clock;
}
