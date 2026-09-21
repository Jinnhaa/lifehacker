import { describe, expect, it } from "vitest";
import { isTaskOverdue } from "./task-overdue.js";

const now = new Date("2026-09-19T04:00:00.000Z");
const timeZone = "Asia/Seoul";

describe("overdue task classification", () => {
  it("separates a past internal date while keeping today's target", () => {
    expect(isTaskOverdue({ status: "PLANNED", internalDeadline: new Date("2026-09-18T14:59:00Z"), officialDeadline: null }, now, timeZone)).toBe(true);
    expect(isTaskOverdue({ status: "PLANNED", internalDeadline: new Date("2026-09-19T14:59:00Z"), officialDeadline: null }, now, timeZone)).toBe(false);
  });
  it("separates a passed official instant and never marks DONE", () => {
    const task = { status: "PLANNED", internalDeadline: null, officialDeadline: new Date("2026-09-19T03:00:00Z") };
    expect(isTaskOverdue(task, now, timeZone)).toBe(true);
    expect(isTaskOverdue({ ...task, status: "DONE" }, now, timeZone)).toBe(false);
  });
});
