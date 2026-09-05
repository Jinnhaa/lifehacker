import type { UserId } from "@amber/shared";
import type { Sql } from "postgres";
export type DerivedCurrentAction = {
    readonly kind: "task";
    readonly source: "focus_session" | "plan_item";
    readonly title: string;
    readonly taskId: string;
    readonly planItemId: string | null;
} | {
    readonly kind: "routine";
    readonly source: "plan_item";
    readonly title: string;
    readonly activityOccurrenceId: string;
    readonly planItemId: string;
};
export declare const deriveCurrentAction: (sql: Sql, userId: UserId, planDate: string) => Promise<DerivedCurrentAction | null>;
//# sourceMappingURL=current-action.d.ts.map