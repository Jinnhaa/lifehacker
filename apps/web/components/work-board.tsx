"use client";

import { startTransition, useActionState, useState } from "react";
import {
  completeWorkTaskAction,
  createWorkTaskAction,
  decideWorkCandidateAction,
  moveWorkTaskAction,
  updateWorkEstimateAction,
  updateWorkTaskAction
} from "../app/work/actions";
import type { WorkActionState, WorkBoardViewModel, WorkContextOption, WorkTaskItem, WorkView, WorkWin } from "../lib/work-types";

const initialState: WorkActionState = { status: "idle", message: "" };
const duration = (minutes: number | null): string => minutes === null ? "시간 미정"
  : minutes < 60 ? `예상 ${minutes}분` : `예상 ${Math.floor(minutes / 60)}시간${minutes % 60 ? ` ${minutes % 60}분` : ""}`;
const remaining = (minutes: number): string => minutes < 60 ? `남은 예상 ${minutes}분`
  : `남은 예상 ${Math.floor(minutes / 60)}시간${minutes % 60 ? ` ${minutes % 60}분` : ""}`;

function ContextSelect({ contexts, defaultValue }: { contexts: readonly WorkContextOption[]; defaultValue: string | null }) {
  return <select name="workContextId" defaultValue={defaultValue ?? ""} aria-label="프로젝트 또는 업무 맥락">
    <option value="">연결 없음</option>{contexts.map((context) => <option value={context.id} key={context.id}>{context.title}</option>)}
  </select>;
}

function Wins({ title, wins, selected, onSelect }: {
  title: string; wins: readonly WorkWin[]; selected: string | null; onSelect: (id: string | null) => void;
}) {
  return <section className="wins-shelf"><header><small>{title}</small><span>{wins.length}</span></header>
    {wins.length ? <div className="wins-grid">{wins.map((win) => <button type="button" className={selected === win.id ? "selected" : ""} onClick={() => onSelect(selected === win.id ? null : win.id)} key={win.id}>
      <strong>{win.title}</strong><div className="win-progress"><i style={{ width: `${win.progress}%` }} /></div><span>{win.progress}% · {remaining(win.remainingMinutes)}</span>
    </button>)}</div> : <p>이 기간에 연결된 Win이 아직 없습니다.</p>}
  </section>;
}

function TaskCard({ task, contexts, selectedGoalId, updateAction, estimateAction, completeAction, pending }: {
  task: WorkTaskItem; contexts: readonly WorkContextOption[]; selectedGoalId: string | null;
  updateAction: (payload: FormData) => void; estimateAction: (payload: FormData) => void; completeAction: (payload: FormData) => void; pending: boolean;
}) {
  const highlighted = selectedGoalId !== null && task.goalId === selectedGoalId;
  return <article className={`planning-task-card ${highlighted ? "goal-highlight" : ""}`} draggable
    onDragStart={(event) => event.dataTransfer.setData("text/work-task", task.id)}>
    <div className="planning-task-title"><form action={completeAction}><input type="hidden" name="taskId" value={task.id} /><button disabled={pending} aria-label={`${task.title} 완료`}>□</button></form><strong>{task.title}</strong>{task.priorityBand && <b>{task.priorityBand}</b>}</div>
    <p>{task.contextTitle ?? "일반 Task"}</p><details className="estimate-edit"><summary>{duration(task.estimatedMinutes)}</summary><form action={estimateAction}><input type="hidden" name="taskId" value={task.id} /><input aria-label="예상 시간(분)" name="estimatedMinutes" type="number" min="1" defaultValue={task.estimatedMinutes ?? ""} /><button disabled={pending}>반영</button></form></details>
    <div className="planning-task-deadlines">
      {task.internalDeadlineLabel && <span className="internal">⚑ 목표 {task.internalDeadlineLabel}</span>}
      {task.officialDeadlineLabel && <span className="official">🔥 마감 {task.officialDeadlineLabel}</span>}
    </div>
    {task.goalTitle && <small className="task-goal-link">{task.goalLevel === "WEEKLY" ? "Weekly Win" : task.goalLevel === "MONTHLY" ? "Monthly Win" : "Goal"} · {task.goalTitle}</small>}
    <details><summary>상세 / 수정</summary><form action={updateAction} className="planning-task-edit">
      <input type="hidden" name="taskId" value={task.id} />
      <label>Task<input name="title" defaultValue={task.title} required maxLength={300} /></label>
      <label>예상시간<input name="estimatedMinutes" type="number" min="1" defaultValue={task.estimatedMinutes ?? ""} /></label>
      <label>내부 목표<input name="targetDeadline" type="datetime-local" defaultValue={task.internalDeadlineInput} /></label>
      <label>맥락<ContextSelect contexts={contexts} defaultValue={task.workContextId} /></label>
      {task.officialDeadlineLabel && <p>공식 마감 · {task.officialDeadlineLabel} (읽기 전용)</p>}
      <button disabled={pending}>저장</button>
    </form></details>
  </article>;
}

function WeekView({ data, selectedGoalId, updateAction, estimateAction, completeAction, moveAction, pending }: {
  data: WorkBoardViewModel; selectedGoalId: string | null; updateAction: (payload: FormData) => void;
  estimateAction: (payload: FormData) => void; completeAction: (payload: FormData) => void; moveAction: (payload: FormData) => void; pending: boolean;
}) {
  return <div className="week-planning-board">{data.week.map((day) => <section className={`planning-day ${day.isToday ? "today" : ""}`} key={day.date}
    onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
      event.preventDefault(); const taskId = event.dataTransfer.getData("text/work-task"); if (!taskId) return;
      const payload = new FormData(); payload.set("taskId", taskId); payload.set("plannedDate", day.date); startTransition(() => moveAction(payload));
    }}>
    <header><span>{day.dayLabel}</span><b>{day.dateLabel}</b>{day.isToday && <em>TODAY</em>}</header>
    {day.events.map((event) => <article className="planning-event" key={event.id}><time>{event.timeLabel}</time><strong>{event.title}</strong></article>)}
    <div className="planning-day-tasks">{day.tasks.map((task) => <TaskCard task={task} contexts={data.contexts} selectedGoalId={selectedGoalId} updateAction={updateAction} estimateAction={estimateAction} completeAction={completeAction} pending={pending} key={task.id} />)}</div>
    {!day.tasks.length && <p className="day-drop-hint">여기로 Task 이동</p>}
  </section>)}</div>;
}

function TodayView({ data, selectedGoalId, updateAction, estimateAction, completeAction, pending }: {
  data: WorkBoardViewModel; selectedGoalId: string | null; updateAction: (payload: FormData) => void;
  estimateAction: (payload: FormData) => void; completeAction: (payload: FormData) => void; pending: boolean;
}) {
  return <div className="work-today-grid"><section className="today-time-rail"><header><small>FIXED CALENDAR</small><h2>오늘 시간 흐름</h2></header>
    {data.todayEvents.length ? <ol>{data.todayEvents.map((event) => <li key={event.id}><time>{event.timeLabel}</time><i /><strong>{event.title}</strong></li>)}</ol> : <p>오늘 고정 일정이 없습니다.</p>}
  </section><section className="today-quest-stack"><header><small>ORDERED QUESTS</small><h2>오늘 Quest</h2></header>
    <div className="today-capacity"><span>Capacity <b>{data.todayCapacityMinutes === null ? "확인 전" : duration(data.todayCapacityMinutes).replace("예상 ", "")}</b></span><span>Workload <b>{duration(data.todayWorkloadMinutes).replace("예상 ", "")}</b></span></div>
    {data.deadlineWarning && <p className="today-deadline-warning">🔥 {data.deadlineWarning}</p>}
    <div>{data.todayQuests.map((quest, index) => <div className="today-quest" key={`${quest.kind}:${quest.id}`}><em>{index + 1}</em>{quest.kind === "task"
      ? <TaskCard task={quest.task} contexts={data.contexts} selectedGoalId={selectedGoalId} updateAction={updateAction} estimateAction={estimateAction} completeAction={completeAction} pending={pending} />
      : <article className="planning-task-card course-study-card"><div className="planning-task-title"><span>◈</span><strong>{quest.title}</strong>{quest.priorityBand && <b>{quest.priorityBand}</b>}</div><p>{quest.contextTitle ?? "Course Study"} · {duration(quest.estimatedMinutes)}</p><small>학습 준비 상태와 이번 주 목표를 기준으로 배치</small></article>}</div>)}</div>
  </section></div>;
}

function MonthView({ data, selectedGoalId, setSelectedGoalId }: { data: WorkBoardViewModel; selectedGoalId: string | null; setSelectedGoalId: (id: string | null) => void }) {
  return <><Wins title="MONTHLY WINS" wins={data.monthlyWins} selected={selectedGoalId} onSelect={setSelectedGoalId} />
    <section className="month-board"><header><h2>{data.monthLabel}</h2><div><span className="official">공식 마감</span><span className="internal">중요 내부 목표</span><span className="milestone">Milestone</span><span className="event">고정 일정</span></div></header>
      <div className="month-weekdays">{["월","화","수","목","금","토","일"].map((day) => <b key={day}>{day}</b>)}</div>
      <div className="month-grid">{data.month.map((day) => <article className={`${day.inMonth ? "" : "outside"} ${day.isToday ? "today" : ""}`} key={day.date}><time>{day.dayNumber}</time>{day.highlights.map((item) => <span className={item.kind} title={item.title} key={item.id}>{item.title}</span>)}</article>)}</div>
    </section></>;
}

export function WorkBoard({ data }: { data: WorkBoardViewModel }) {
  const [view, setView] = useState<WorkView>("week"); const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [candidateState, candidateAction, candidatePending] = useActionState(decideWorkCandidateAction, initialState);
  const [updateState, updateAction, updatePending] = useActionState(updateWorkTaskAction, initialState);
  const [completeState, completeAction, completePending] = useActionState(completeWorkTaskAction, initialState);
  const [createState, createAction, createPending] = useActionState(createWorkTaskAction, initialState);
  const [moveState, moveAction, movePending] = useActionState(moveWorkTaskAction, initialState);
  const [estimateState, estimateAction, estimatePending] = useActionState(updateWorkEstimateAction, initialState);
  const states = [candidateState, updateState, completeState, createState, moveState, estimateState]; const feedback = states.find((state) => state.message)?.message;
  const pending = updatePending || completePending || movePending || estimatePending;
  return <main className="work-shell planning-room">
    <div className="work-top-row"><img className="work-top-logo" src="/assets/lifehacker/lifehacker-logo.png" alt="Lifehacker" /><nav className="work-view-tabs" aria-label="Work 보기">{(["today","week","month"] as const).map((item) => <button className={view === item ? "active" : ""} type="button" onClick={() => setView(item)} key={item}>{item === "today" ? "Today" : item === "week" ? "Week" : "Month"}</button>)}</nav></div>
    {!data.configured ? <section className="work-empty"><strong>Work & Calendar를 연결할 수 없습니다.</strong><p>{data.error}</p></section> : <>
      {view !== "month" && <Wins title="THIS WEEK WINS" wins={data.weeklyWins} selected={selectedGoalId} onSelect={setSelectedGoalId} />}
      {view === "week" && <WeekView data={data} selectedGoalId={selectedGoalId} updateAction={updateAction} estimateAction={estimateAction} completeAction={completeAction} moveAction={moveAction} pending={pending} />}
      {view === "today" && <TodayView data={data} selectedGoalId={selectedGoalId} updateAction={updateAction} estimateAction={estimateAction} completeAction={completeAction} pending={pending} />}
      {view === "month" && <MonthView data={data} selectedGoalId={selectedGoalId} setSelectedGoalId={setSelectedGoalId} />}
      <section className="planning-utility"><details><summary>Task 빠른 추가</summary><form action={createAction}><input name="title" required maxLength={300} placeholder="새 Task" /><input name="targetDeadline" type="datetime-local" /><button disabled={createPending}>추가</button></form></details>
        {data.candidates.length > 0 && <details><summary>확인 필요한 Task 후보 · {data.candidates.length}</summary><div>{data.candidates.map((candidate) => <form action={candidateAction} className="planning-candidate" key={candidate.id}><input type="hidden" name="candidateId" value={candidate.id} /><input name="title" defaultValue={candidate.title} /><input name="estimatedMinutes" type="number" min="1" defaultValue={candidate.estimatedMinutes ?? ""} /><ContextSelect contexts={data.contexts} defaultValue={candidate.workContextId} /><button name="decision" value="dismiss" disabled={candidatePending}>제외</button><button name="decision" value="confirm" disabled={candidatePending}>추가</button></form>)}</div></details>}
      </section>
    </>}
    {feedback && <p className={`work-feedback ${states.find((state) => state.message)?.status ?? ""}`} role="status">{feedback}</p>}
  </main>;
}
