"use client";

import { useActionState } from "react";
import type { LearningUnit, LearningUnitSummary } from "@amber/core";
import { saveLearningUnitAction } from "../app/learning/unit-actions";
import type { ContextActionState } from "../lib/context-management-types";

const initial: ContextActionState = { status: "idle", message: "" };
const exposureLabels = { NOT_STARTED: "아직 시작 안 함", PARTIAL: "일부 학습", COMPLETE: "학습 완료" };
const understandingLabels = { UNKNOWN: "확인 안 함", WEAK: "약함", OK: "이해함", STRONG: "탄탄함" };
const validationLabels = { NOT_TESTED: "검증 안 함", FAILED: "검증 실패", PASSED: "검증 통과" };

function UnitForm({ contextId, unit, action, pending }: { contextId: string; unit?: LearningUnit; action: (form: FormData) => void; pending: boolean }) {
  return <form action={action} className="context-form">
    <input type="hidden" name="intent" value={unit ? "update" : "create"} /><input type="hidden" name="contextId" value={contextId} /><input type="hidden" name="id" value={unit?.id ?? ""} />
    <label>학습 단위 제목<input name="title" required maxLength={300} defaultValue={unit?.title ?? ""} /></label>
    <label>순서<input name="position" type="number" min={1} max={2147483647} step={1} required={Boolean(unit)} defaultValue={unit?.position ?? ""} placeholder="비우면 마지막 순서" /></label>
    <label>Exposure<select name="exposureState" defaultValue={unit?.exposureState ?? "NOT_STARTED"}>{Object.entries(exposureLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>Understanding<select name="understandingState" defaultValue={unit?.understandingState ?? "UNKNOWN"}>{Object.entries(understandingLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>Validation<select name="validationState" defaultValue={unit?.validationState ?? "NOT_TESTED"}>{Object.entries(validationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <button disabled={pending}>{unit ? "변경 저장" : "학습 단위 추가"}</button>
  </form>;
}

export function LearningUnitManagement({ contextId, data }: {
  contextId: string; data: { readonly units: readonly LearningUnit[]; readonly summary: LearningUnitSummary } | undefined;
}) {
  const [state, action, pending] = useActionState(saveLearningUnitAction, initial);
  const units = data?.units ?? [];
  const summary = data?.summary;
  return <details className="context-editor learning-unit-detail"><summary>Learning Units · {summary?.total ?? 0}</summary>
    {summary ? <p>{summary.total}개 · 학습 완료 {summary.exposed} · 이해 약함 {summary.weak} · 검증 미통과 {summary.notValidated}</p> : null}
    <p>실제 학습 상태를 직접 기록하세요. 세 상태는 독립적으로 저장됩니다.</p>
    {state.message ? <p className={`context-feedback ${state.status}`} role="status">{state.message}</p> : null}
    <details><summary>학습 단위 추가</summary><UnitForm contextId={contextId} action={action} pending={pending} /></details>
    {!units.length ? <p>등록된 학습 단위가 없습니다.</p> : units.map((unit) => <article className="learning-unit-row" key={unit.id}>
      <strong>{unit.position}. {unit.title}</strong><p>{exposureLabels[unit.exposureState]} · {understandingLabels[unit.understandingState]} · {validationLabels[unit.validationState]}</p>
      <details><summary>수정 / 학습 상태 기록</summary><UnitForm contextId={contextId} unit={unit} action={action} pending={pending} /></details>
      <details><summary>삭제</summary><form action={action} className="context-form">
        <input type="hidden" name="intent" value="delete" /><input type="hidden" name="contextId" value={contextId} /><input type="hidden" name="id" value={unit.id} />
        <label className="context-checkbox"><input type="checkbox" name="confirmDelete" required /> 이 학습 단위 삭제 확인</label><button disabled={pending}>삭제</button>
      </form></details>
    </article>)}
  </details>;
}
