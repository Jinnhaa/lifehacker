import type { UserId } from "@amber/shared";

export type WorkstyleAgentType = "chief" | "project_pm" | "research" | "development";
export type WorkstyleDirectiveValue = string | number | boolean;

export interface WorkstyleProfile {
  readonly id: string;
  readonly userId: UserId;
  readonly scopeType: "global" | "agent";
  readonly agentType: WorkstyleAgentType | null;
  readonly revision: number;
  readonly instructions: readonly string[];
  readonly directives: Readonly<Record<string, WorkstyleDirectiveValue>>;
}

export interface WorkstyleProfileReader {
  loadActive(userId: UserId, agentType: WorkstyleAgentType): Promise<readonly WorkstyleProfile[]>;
}

export interface ResolvedWorkstyle {
  readonly agentType: WorkstyleAgentType;
  readonly instructions: readonly string[];
  readonly directives: Readonly<Record<string, WorkstyleDirectiveValue>>;
  readonly profileRevisions: readonly { readonly id: string; readonly revision: number; readonly scopeType: "global" | "agent" }[];
  readonly currentInstruction: string | null;
}

export interface WorkstyleResolverInput {
  readonly userId: UserId;
  readonly agentType: WorkstyleAgentType;
  readonly currentInstruction?: string;
}

export interface WorkstyleResolver {
  resolve(input: WorkstyleResolverInput): Promise<ResolvedWorkstyle>;
}

const DEFAULT_DIRECTIVES: Readonly<Record<string, WorkstyleDirectiveValue>> = {
  conclusion_first: true,
  concise: true
};

export class DefaultWorkstyleResolver implements WorkstyleResolver {
  constructor(private readonly reader?: WorkstyleProfileReader) {}

  async resolve(input: WorkstyleResolverInput): Promise<ResolvedWorkstyle> {
    const profiles = await this.reader?.loadActive(input.userId, input.agentType) ?? [];
    for (const profile of profiles) {
      if (profile.userId !== input.userId) throw new Error("Workstyle profile owner mismatch");
    }
    const global = profiles.find((profile) => profile.scopeType === "global");
    const agent = profiles.find((profile) => profile.scopeType === "agent" && profile.agentType === input.agentType);
    const ordered = [global, agent].filter((profile): profile is WorkstyleProfile => Boolean(profile));
    return {
      agentType: input.agentType,
      instructions: [
        ...(input.currentInstruction ? [input.currentInstruction] : []),
        ...(agent?.instructions ?? []),
        ...(global?.instructions ?? [])
      ],
      directives: Object.assign({}, DEFAULT_DIRECTIVES, global?.directives, agent?.directives),
      profileRevisions: ordered.map((profile) => ({ id: profile.id, revision: profile.revision, scopeType: profile.scopeType })),
      currentInstruction: input.currentInstruction ?? null
    };
  }
}

