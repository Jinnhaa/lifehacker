import { describe, expect, it } from "vitest";
import { comparePriorityBands, projectPlannedDay } from "./planned-day.js";

describe("Work planned day", () => {
  it("keeps explicit drag placement ahead of plan and deadlines", () => {
    expect(projectPlannedDay({ plannedDate: "2026-09-24", approvedPlanDate: "2026-09-23", internalDeadlineDate: "2026-09-22", officialDeadlineDate: "2026-09-25", priorityBand: "P0" }, "2026-09-22"))
      .toEqual({ date: "2026-09-24", source: "user" });
  });

  it("places new P0 work today without changing deadline evidence", () => {
    const evidence = { plannedDate: null, approvedPlanDate: "2026-09-21", internalDeadlineDate: "2026-09-24", officialDeadlineDate: "2026-09-22", priorityBand: "P0" as const };
    expect(projectPlannedDay(evidence, "2026-09-22")).toEqual({ date: "2026-09-22", source: "chief" });
    expect(evidence).toMatchObject({ internalDeadlineDate: "2026-09-24", officialDeadlineDate: "2026-09-22" });
  });

  it("orders Current Status bands before ordinary work", () => {
    expect(comparePriorityBands("P0", "P2")).toBeLessThan(0);
    expect(comparePriorityBands("P1", null)).toBeLessThan(0);
  });
});
