"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  completeWorkTaskAction,
  createWorkTaskAction,
  decideWorkCandidateAction,
  updateWorkTaskAction
} from "../app/work/actions";
import type { WorkActionState, WorkBoardViewModel, WorkContextOption, WorkTaskItem } from "../lib/work-types";

const initialState: WorkActionState = { status: "idle", message: "" };

function ContextSelect({ contexts, defaultValue }: { contexts: readonly WorkContextOption[]; defaultValue: string | null }) {
  return <select name="workContextId" defaultValue={defaultValue ?? ""} aria-label="프로젝트 또는 업무 맥락">
    <option value="">연결 없음</option>
    {contexts.map((context) => <option value={context.id} key={context.id}>{context.title}</option>)}
  </select>;
}

function TaskRow({ task, contexts, updateAction, completeAction, pending }: {
  task: WorkTaskItem;
  contexts: readonly WorkContextOption[];
  updateAction: (payload: FormData) => void;
  completeAction: (payload: FormData) => void;
  pending: boolean;
}) {
  return <li className="work-row">
    <div className="work-row-main">
      <div><strong>{task.title}</strong><p className="work-deadlines">
        {task.officialDeadlineLabel && <span>공식 마감 <b>{task.officialDeadlineLabel}</b>{task.officialDeadlineSourceLabel ? ` · ${task.officialDeadlineSourceLabel}` : ""} <em>읽기 전용</em></span>}
        <span>완료 목표 <b>{task.targetDeadlineLabel ?? "없음"}</b></span>
        {task.deadlineWarning && <span className="work-deadline-warning">완료 목표가 공식 마감보다 늦습니다.</span>}
        <span>{task.estimatedMinutes ? `${task.estimatedMinutes}분` : "시간 미정"}{task.contextTitle ? ` · ${task.contextTitle}` : ""}</span>
      </p></div>
      <div className="work-badges"><span>{task.sourceLabel}</span><span>{task.status}</span></div>
    </div>
    <details>
      <summary>수정</summary>
      <form action={updateAction} className="work-edit-form">
        <input type="hidden" name="taskId" value={task.id} />
        <label>할 일<input name="title" defaultValue={task.title} required maxLength={300} /></label>
        <label>완료 목표<input name="targetDeadline" type="datetime-local" defaultValue={task.targetDeadlineValue} /></label>
        <label>예상 시간<input name="estimatedMinutes" type="number" min="1" step="1" defaultValue={task.estimatedMinutes ?? ""} placeholder="분" /></label>
        <label>맥락<ContextSelect contexts={contexts} defaultValue={task.workContextId} /></label>
        <button type="submit" disabled={pending}>저장</button>
      </form>
    </details>
    <form action={completeAction} className="work-complete-form">
      <input type="hidden" name="taskId" value={task.id} />
      <button type="submit" disabled={pending}>완료</button>
    </form>
  </li>;
}

export function WorkBoard({ data }: { data: WorkBoardViewModel }) {
  const [candidateState, candidateAction, candidatePending] = useActionState(decideWorkCandidateAction, initialState);
  const [updateState, updateAction, updatePending] = useActionState(updateWorkTaskAction, initialState);
  const [completeState, completeAction, completePending] = useActionState(completeWorkTaskAction, initialState);
  const [createState, createAction, createPending] = useActionState(createWorkTaskAction, initialState);
  const feedback = [candidateState, updateState, completeState, createState].find((state) => state.message)?.message;

  return <main className="work-shell">
    <header className="work-header">
      <div><small>OWNER · WORK CONTROL</small><h1>할 일</h1><p>Amber HQ가 알고 있는 일을 확인하고, 틀린 부분만 고치세요.</p></div>
      <Link href="/">Home으로</Link>
    </header>

    {!data.configured ? <section className="work-empty"><strong>Work Board를 연결할 수 없습니다.</strong><p>{data.error}</p></section> : <>
      <section className="work-quick-add" aria-labelledby="quick-add-title">
        <div><small>QUICK ADD</small><h2 id="quick-add-title">빠른 추가</h2></div>
        <form action={createAction}>
          <input name="title" required maxLength={300} placeholder="무엇을 해야 하나요?" aria-label="새 할 일" />
          <input name="targetDeadline" type="datetime-local" aria-label="완료 목표" />
          <button disabled={createPending}>{createPending ? "추가 중…" : "추가"}</button>
        </form>
      </section>

      <section className="work-section attention" aria-labelledby="candidate-title">
        <header><div><small>REVIEW NEEDED</small><h2 id="candidate-title">확인 필요</h2></div><b>{data.candidates.length}</b></header>
        {data.candidates.length ? <ul className="candidate-list">{data.candidates.map((candidate) => <li key={candidate.id}>
          <form action={candidateAction} className="candidate-form">
            <input type="hidden" name="candidateId" value={candidate.id} />
            <div className="candidate-heading"><span>{candidate.sourceLabel}</span><small>{candidate.contextTitle ?? "맥락 미확인"}</small></div>
            <label>할 일<input name="title" defaultValue={candidate.title} required maxLength={300} /></label>
            <div className="candidate-fields">
              {candidate.deadlineLabel && <label>공식 마감<span className="work-readonly-value">{candidate.deadlineLabel} · 읽기 전용</span></label>}
              <label>예상 시간<input name="estimatedMinutes" type="number" min="1" step="1" defaultValue={candidate.estimatedMinutes ?? ""} placeholder="분" /></label>
              <label>맥락<ContextSelect contexts={data.contexts} defaultValue={candidate.workContextId} /></label>
            </div>
            <div className="candidate-actions"><button name="decision" value="dismiss" disabled={candidatePending}>할 일 아님</button><button className="primary" name="decision" value="confirm" disabled={candidatePending}>확인하고 추가</button></div>
          </form>
        </li>)}</ul> : <p className="work-empty-line">확인이 필요한 항목이 없습니다.</p>}
      </section>

      <section className="work-section" aria-labelledby="active-title">
        <header><div><small>ACTIVE WORK</small><h2 id="active-title">진행할 일</h2></div><b>{data.groups.reduce((count, group) => count + group.tasks.length, 0)}</b></header>
        <div className="work-groups">{data.groups.map((group) => <section key={group.key}>
          <h3>{group.label}<span>{group.tasks.length}</span></h3>
          {group.tasks.length ? <ul>{group.tasks.map((task) => <TaskRow key={task.id} task={task} contexts={data.contexts} updateAction={updateAction} completeAction={completeAction} pending={updatePending || completePending} />)}</ul> : <p className="work-empty-line">해당하는 일이 없습니다.</p>}
        </section>)}</div>
      </section>
    </>}
    {feedback && <p className="work-feedback" role="status">{feedback}</p>}
  </main>;
}
