import type { UserId } from "@amber/shared";
import type { Sql } from "postgres";
import type { ApprovedPlanningPrinciple } from "./principle-application.js";

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {};

export class SupabasePrincipleReader {
  constructor(private readonly sql: Sql) {}

  async loadActiveApproved(userId: UserId): Promise<ApprovedPlanningPrinciple[]> {
    const rows = await this.sql<{ id: string; statement: string; origin: string; condition: unknown; source_reference: unknown }[]>`
      select r.id,r.statement,r.origin,p.condition,r.source_reference
      from public.principles r
      join public.patterns p on p.id=r.source_pattern_id and p.user_id=r.user_id
      where r.user_id=${userId} and r.confirmation_status='approved' and r.status='active'
        and r.valid_from<=now() and (r.valid_until is null or r.valid_until>now())
      order by r.created_at
    `;
    return rows.map((row) => {
      const condition = object(row.condition);
      const reference = object(row.source_reference);
      return {
        id: row.id,
        statement: row.statement,
        origin: row.origin,
        decisionType: typeof condition.decisionType === "string" ? condition.decisionType : "",
        situationType: typeof condition.situationType === "string" ? condition.situationType : "",
        choiceAction: typeof condition.choiceAction === "string" ? condition.choiceAction : "",
        consistencyKind: typeof condition.consistencyKind === "string" ? condition.consistencyKind : "",
        consistencyValue: typeof condition.consistencyValue === "string" ? condition.consistencyValue : "",
        applicationPolicy: typeof reference.applicationPolicy === "string" ? reference.applicationPolicy : ""
      };
    });
  }
}
