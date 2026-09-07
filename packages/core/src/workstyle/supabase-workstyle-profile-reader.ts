import type { UserId } from "@amber/shared";
import type { JSONValue, Sql } from "postgres";
import type { WorkstyleAgentType, WorkstyleDirectiveValue, WorkstyleProfile, WorkstyleProfileReader } from "./workstyle.js";

interface WorkstyleRow {
  id: string;
  user_id: string;
  scope_type: "global" | "agent";
  agent_type: WorkstyleAgentType | null;
  revision: number;
  instructions: string[];
  directives: JSONValue;
}

const directives = (value: JSONValue): Readonly<Record<string, WorkstyleDirectiveValue>> => {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, WorkstyleDirectiveValue] =>
    ["string", "number", "boolean"].includes(typeof entry[1])));
};

export class SupabaseWorkstyleProfileReader implements WorkstyleProfileReader {
  constructor(private readonly sql: Sql) {}

  async loadActive(userId: UserId, agentType: WorkstyleAgentType): Promise<readonly WorkstyleProfile[]> {
    const rows = await this.sql<WorkstyleRow[]>`
      select id,user_id,scope_type,agent_type,revision,instructions,directives
      from public.workstyle_profiles
      where user_id=${userId} and active=true
        and (scope_type='global' or (scope_type='agent' and agent_type=${agentType}))
      order by case scope_type when 'global' then 0 else 1 end
    `;
    return rows.map((row) => ({
      id: row.id,
      userId: row.user_id as UserId,
      scopeType: row.scope_type,
      agentType: row.agent_type,
      revision: row.revision,
      instructions: row.instructions,
      directives: directives(row.directives)
    }));
  }
}

