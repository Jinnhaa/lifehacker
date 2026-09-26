"use client";

import { useActionState, useState } from "react";
import type { PeriodObjectiveView } from "@amber/core";
import { savePeriodGoalAction } from "../app/work/goal-actions";
import type { WorkActionState, WorkWin } from "../lib/work-types";

type Action = (form: FormData) => void;
type ParentOption = { readonly id: string; readonly title: string };
const initial: WorkActionState = { status: "idle", message: "" };

function GoalForm({ level, start, end, parents, goal, action, pending }: {
  level: "MONTHLY" | "WEEKLY"; start: string; end: string; parents: readonly ParentOption[]; goal?: WorkWin; action: Action; pending: boolean;
}) {
  return <form action={action} className="period-goal-form">
    <input type="hidden" name="intent" value="saveGoal" /><input type="hidden" name="id" value={goal?.id ?? ""} /><input type="hidden" name="level" value={level} />
    <label>제목<input name="title" required maxLength={300} defaultValue={goal?.title ?? ""} /></label>
    <label>기간 시작<input name="periodStart" type="date" defaultValue={goal ? goal.periodStart ?? "" : start} /></label>
    <label>기간 종료<input name="periodEnd" type="date" defaultValue={goal ? goal.periodEnd ?? "" : end} /></label>
    {level === "WEEKLY" ? <label>상위 Monthly Goal<select name="parentGoalId" defaultValue={goal?.parentGoalId ?? ""}><option value="">연결 없음</option>{parents.map((parent) => <option key={parent.id} value={parent.id}>{parent.title}</option>)}</select></label>
      : <input type="hidden" name="parentGoalId" value={goal?.parentGoalId ?? ""} />}
    <button disabled={pending}>저장</button>
  </form>;
}

function ObjectiveForm({ goalId, objective, action, pending }: { goalId: string; objective?: PeriodObjectiveView; action: Action; pending: boolean }) {
  const [mode, setMode] = useState(objective?.progressMode ?? "STATUS");
  return <form action={action} className="period-goal-form">
    <input type="hidden" name="intent" value="saveObjective" /><input type="hidden" name="id" value={objective?.id ?? ""} /><input type="hidden" name="goalId" value={goalId} />
    <label>Objective 제목<input name="title" required maxLength={300} defaultValue={objective?.title ?? ""} /></label>
    <label>진행 기준<select name="progressMode" value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="STATUS">Status</option><option value="TASK_COUNT">Task count</option><option value="NUMERIC">Numeric</option></select></label>
    <label>완료 기준<input name="successCriteria" defaultValue={objective?.successCriteria ?? ""} /></label><label>목표일<input type="date" name="targetDate" defaultValue={objective?.targetDate ?? ""} /></label>
    {mode === "STATUS" ? <label>상태<select name="status" defaultValue={objective?.status === "achieved" ? "achieved" : "active"}><option value="active">미완료</option><option value="achieved">완료</option></select></label> : <input type="hidden" name="status" value="active" />}
    {mode === "NUMERIC" ? <><label>현재값<input name="currentValue" type="number" min="0" step="any" required defaultValue={objective?.currentValue ?? 0} /></label><label>목표값<input name="targetValue" type="number" min="0.000000001" step="any" required defaultValue={objective?.targetValue ?? ""} /></label><label>단위<input name="unit" defaultValue={objective?.unit ?? ""} /></label></> : null}
    {mode === "TASK_COUNT" ? <p>연결된 Task의 실제 DONE 개수로 계산합니다.</p> : null}<button disabled={pending}>저장</button>
  </form>;
}

function RemoveForm({ id, intent, action, pending }: { id: string; intent: "archiveGoal" | "cancelObjective"; action: Action; pending: boolean }) {
  return <form action={action}><input type="hidden" name="intent" value={intent} /><input type="hidden" name="id" value={id} /><button disabled={pending}>{intent === "archiveGoal" ? "Goal 보관" : "Objective 취소"}</button></form>;
}

export function PeriodGoalManagement({ level, goals, parents, start, end, selected, onSelect }: {
  level: "MONTHLY" | "WEEKLY"; goals: readonly WorkWin[]; parents: readonly ParentOption[]; start: string; end: string;
  selected: string | null; onSelect: (id: string | null) => void;
}) {
  const [state, action, pending] = useActionState(savePeriodGoalAction, initial);
  return <section className="wins-shelf period-goal-management"><header><small>{level === "MONTHLY" ? "MONTHLY GOALS" : "THIS WEEK FOCUS"}</small><span>{goals.length}</span></header>
    <details><summary>{level === "MONTHLY" ? "Monthly Goal 추가" : "Weekly Focus Goal 추가"}</summary><GoalForm level={level} start={start} end={end} parents={parents} action={action} pending={pending} /></details>
    {!goals.length ? <p>이 기간의 목표가 아직 없습니다.</p> : <div className="wins-grid">{goals.map((goal) => <article key={goal.id} className="period-goal-card">
      <button type="button" className={selected === goal.id ? "selected" : ""} onClick={() => onSelect(selected === goal.id ? null : goal.id)}><strong>{goal.title}</strong><span>{goal.evidenceKind === "none" ? "진행 기준 없음" : `${goal.progress}%`}</span></button>
      <small>{goal.periodStart ?? "시작 미정"} ~ {goal.periodEnd ?? "종료 미정"} · {goal.status}</small>
      {goal.parentGoalId ? <p>상위 목표 · {parents.find((parent) => parent.id === goal.parentGoalId)?.title ?? "연결된 Goal"}</p> : null}
      <details><summary>Goal 수정</summary><GoalForm level={level} start={start} end={end} parents={parents} goal={goal} action={action} pending={pending} /><RemoveForm id={goal.id} intent="archiveGoal" action={action} pending={pending} /></details>
      <ul>{goal.objectives.map((objective) => <li key={objective.id}><strong>{objective.title}</strong><b>{objective.progressLabel}</b>
        <details><summary>Objective 수정</summary><ObjectiveForm key={`${objective.id}:${objective.progressMode}`} goalId={goal.id} objective={objective} action={action} pending={pending} /><RemoveForm id={objective.id} intent="cancelObjective" action={action} pending={pending} /></details>
      </li>)}</ul>
      <details><summary>Objective 추가</summary><ObjectiveForm goalId={goal.id} action={action} pending={pending} /></details>
    </article>)}</div>}
    {state.message ? <p role="status" className={`work-feedback ${state.status}`}>{state.message}</p> : null}
  </section>;
}
