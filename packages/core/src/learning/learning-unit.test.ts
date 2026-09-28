import type { UserId } from "@amber/shared";
import { describe, expect, it, vi } from "vitest";
import { LearningUnitService, summarizeLearningUnits, type LearningUnit, type LearningUnitRepository } from "./learning-unit.js";

const userId = "10000000-0000-4000-8000-000000000001" as UserId;
const contextId = "10000000-0000-4000-8000-000000000002";
const id = "10000000-0000-4000-8000-000000000003";
const unit: LearningUnit = { id, userId, workContextId: contextId, title: "Unit", position: 1,
  exposureState: "NOT_STARTED", understandingState: "UNKNOWN", validationState: "NOT_TESTED" };
const setup = () => {
  const repository: LearningUnitRepository = { list: vi.fn(async () => [unit]), create: vi.fn(async () => unit),
    update: vi.fn(async () => unit), delete: vi.fn(async () => undefined) };
  return { repository, service: new LearningUnitService(repository) };
};

describe("Learning Unit domain", () => {
  it("creates with canonical independent defaults and automatic position", async () => {
    const { service, repository } = setup();
    await service.create(userId, contextId, { title: " Unit " });
    expect(repository.create).toHaveBeenCalledWith(userId, contextId, { title: "Unit", position: null,
      exposureState: "NOT_STARTED", understandingState: "UNKNOWN", validationState: "NOT_TESTED" });
  });
  it.each(["exposureState", "understandingState", "validationState"])("rejects invalid %s server-side", (field) => {
    const { service, repository } = setup();
    expect(() => service.update(userId, contextId, id, { [field]: "AUTO" })).toThrow();
    expect(repository.update).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5])("rejects invalid position %s", (position) => {
    const { service, repository } = setup();
    expect(() => service.create(userId, contextId, { title: "Unit", position })).toThrow();
    expect(repository.create).not.toHaveBeenCalled();
  });
  it.each([
    { exposureState: "COMPLETE" }, { understandingState: "STRONG" }, { validationState: "PASSED" }
  ])("does not invent other state dimensions for a partial update %j", async (input) => {
    const { service, repository } = setup();
    await service.update(userId, contextId, id, input);
    expect(repository.update).toHaveBeenCalledWith(userId, contextId, id, input);
  });
  it("does not accept Focus/time evidence as a semantic state update", () => {
    const { service, repository } = setup();
    expect(() => service.update(userId, contextId, id, { focusCompleted: true, actualMinutes: 120, playbackCompleted: true })).toThrow();
    expect(repository.update).not.toHaveBeenCalled();
  });
  it("requires explicit deletion confirmation", () => {
    const { service, repository } = setup();
    expect(() => service.delete(userId, contextId, id, false)).toThrow("삭제 확인");
    expect(repository.delete).not.toHaveBeenCalled();
  });
  it("derives counts without percentages or stored scores", () => {
    expect(summarizeLearningUnits([unit, { ...unit, exposureState: "COMPLETE", understandingState: "WEAK", validationState: "FAILED" },
      { ...unit, exposureState: "PARTIAL", understandingState: "STRONG", validationState: "PASSED" }]))
      .toEqual({ total: 3, exposed: 1, weak: 1, notValidated: 2 });
    expect(summarizeLearningUnits([])).toEqual({ total: 0, exposed: 0, weak: 0, notValidated: 0 });
  });
});
