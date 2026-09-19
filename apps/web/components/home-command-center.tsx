"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { completeHomeQuestAction, decideChiefReplan, decideProjectBacklogAction, editTodayPlan, requestChiefReplan, reviewArtifactAction, runFocusAction, runMorningAction, runProjectRuntimeAction } from "../app/actions";
import type { ChiefActionState, HomeViewModel } from "../lib/home-types";
import { activeHomeQuests, defaultFocusMinutes, focusRemainingSeconds, splitTodayPlan } from "../lib/home-presentation";
import { WeekCalendarOverlay } from "./calendar-views";

const initialActionState: ChiefActionState = { status: "idle", message: "" };
const changeLabel = { kept: "유지", moved: "이동", removed: "제외", added: "추가", duration_changed: "duration 변경" } as const;

const itemTypeLabel = { task: "TASK", study: "STUDY", routine: "ROUTINE", rest: "REST", buffer: "BUFFER", calendar: "FIXED" } as const;
const localTime = (iso: string, timeZone: string) => new Intl.DateTimeFormat("en-GB", {
  timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23"
}).format(new Date(iso));

function PlanReviewPanel({ data, morningAction, morningPending, completeAction, completePending }: {
  data: HomeViewModel; morningAction: (payload: FormData) => void; morningPending: boolean;
  completeAction: (payload: FormData) => void; completePending: boolean;
}) {
  const review = data.planReview;
  const [state, submit, pending] = useActionState(editTodayPlan, initialActionState);
  const [editingId, setEditingId] = useState<string | null>(null);
  const selected = review?.items.find((item) => item.id === editingId) ?? null;
  const [start, setStart] = useState("09:00");
  const [duration, setDuration] = useState(30);
  const [excluded, setExcluded] = useState(false);
  const beginEdit = (item: NonNullable<typeof selected>) => {
    setEditingId(item.id); setStart(localTime(item.startsAt, data.timeZone)); setDuration(item.minutes); setExcluded(false);
  };
  const startMinute = Number(start.slice(0, 2)) * 60 + Number(start.slice(3, 5));
  const affected = !review || !selected || excluded ? [] : review.items.filter((item) => {
    if (item.id === selected.id) return false;
    const itemStart = Number(localTime(item.startsAt, data.timeZone).slice(0, 2)) * 60 + Number(localTime(item.startsAt, data.timeZone).slice(3, 5));
    return itemStart < startMinute + duration && itemStart + item.minutes > startMinute;
  });
  if (!review) return <section className="plan-review"><header><div><small>TODAY PLAN REVIEW</small><h2>오늘 계획</h2></div></header><p className="runtime-empty">오늘 검토할 계획이 없습니다.</p></section>;
  const { quests, fixed } = splitTodayPlan(review.items);
  const delta = (excluded ? 0 : duration) - (selected?.minutes ?? 0);
  return <section className="plan-review" id="today-plan-review" aria-labelledby="plan-review-title">
    <header><div><small>TODAY PLAN REVIEW · v{review.revisionNo}</small><h2 id="plan-review-title">{review.status === "approved" ? "승인된 오늘 계획" : "승인 대기 계획"}</h2></div><strong>{review.totalMinutes}분</strong></header>
    <p className="plan-review-capacity">남은 가용 {data.availableMinutes === null ? "확인 전" : `${data.availableMinutes}분`} · 남은 Quest 약 {quests.reduce((sum, item) => sum + item.minutes, 0)}분</p>
    <div className="plan-review-list"><h3>오늘 할 Quest</h3>{quests.map((item, index) => <article className={item.current ? "is-now" : ""} key={item.id}>
      <div className="plan-review-time"><strong>#{index + 1}</strong><span>~{item.minutes}분</span></div>
      <div><small>{itemTypeLabel[item.itemType]}{item.current ? " · NOW" : ""}</small><h3>{item.title}</h3><p>{item.context ?? "오늘 Quest"}</p></div>
      <div className="plan-row-actions">{review.status === "approved" && (item.taskId || item.occurrenceId) && <form action={completeAction}><input type="hidden" name="taskId" value={item.taskId ?? ""} /><input type="hidden" name="stepId" value={item.stepId ?? ""} /><input type="hidden" name="occurrenceId" value={item.occurrenceId ?? ""} /><button className="quest-check" type="submit" disabled={completePending} aria-label={`${item.title} 완료`}>✓</button></form>}<button type="button" onClick={() => beginEdit(item)}>수정</button></div>
    </article>)}{!quests.length && <p className="runtime-empty">남은 Quest가 없습니다.</p>}
    <h3>고정 일정</h3>{fixed.map((item) => <article key={item.id} className="fixed-schedule-row"><div className="plan-review-time"><strong>{localTime(item.startsAt, data.timeZone)}</strong><span>– {localTime(item.endsAt, data.timeZone)}</span></div><div><small>FIXED</small><h3>{item.title}</h3></div></article>)}{!fixed.length && <p className="runtime-empty">오늘 연결된 고정 일정이 없습니다.</p>}</div>
    {review.status === "pending_approval" && review.approvalKind === "morning" && <form action={morningAction} className="plan-review-approve"><input type="hidden" name="command" value="승인" /><button disabled={morningPending}>이 계획 승인</button></form>}
    {selected && <form action={submit} className="interpretation-preview">
      <input type="hidden" name="planId" value={review.planId} /><input type="hidden" name="itemId" value={selected.id} />
      <input type="hidden" name="date" value={data.date} /><input type="hidden" name="editKind" value={excluded ? "exclude" : "reschedule"} />
      <header><div><small>INTERPRETATION PREVIEW</small><h3>Lifehacker는 이렇게 이해했습니다</h3></div><button type="button" onClick={() => setEditingId(null)}>×</button></header>
      <div className="edit-controls"><label>시작 시간<input name="localTime" type="time" value={start} onChange={(event) => setStart(event.target.value)} disabled={excluded} /></label><label>duration<input name="durationMinutes" type="number" min={5} max={720} step={5} value={duration} onChange={(event) => setDuration(Number(event.target.value))} disabled={excluded} /></label><label className="exclude-toggle"><input type="checkbox" checked={excluded} onChange={(event) => setExcluded(event.target.checked)} />오늘 계획에서 제외</label></div>
      <dl><div><dt>항목</dt><dd>{selected.title} · {itemTypeLabel[selected.itemType]} · {selected.context ?? "Context 없음"}</dd></div><div><dt>시간</dt><dd>{localTime(selected.startsAt, data.timeZone)} → {excluded ? "오늘 계획 밖" : start}</dd></div><div><dt>duration</dt><dd>{selected.minutes}분 → {excluded ? "0분" : `${duration}분`}</dd></div><div><dt>하루 총 계획시간</dt><dd>{review.totalMinutes}분 → {review.totalMinutes + delta}분 ({delta >= 0 ? "+" : ""}{delta}분)</dd></div><div><dt>영향 항목</dt><dd>{affected.length ? affected.map((item) => item.title).join(", ") : "없음"}</dd></div></dl>
      <button className="approve" type="submit" disabled={pending || affected.length > 0}>{affected.length ? "겹치는 항목을 먼저 조정하세요" : pending ? "변경안 생성 중…" : "새 revision으로 저장"}</button>
      {state.message && <p className={`command-feedback ${state.status}`}>{state.message}</p>}
    </form>}
  </section>;
}

function ProposalPanel({ proposal, action, pending }: {
  proposal: NonNullable<HomeViewModel["proposal"]>;
  action: (payload: FormData) => void;
  pending: boolean;
}) {
  return <section className="chief-proposal" aria-labelledby="proposal-title">
    <header><span><i /> CHIEF PROPOSAL</span><small>DAILY PLAN · v{proposal.revisionNo}</small></header>
    <h2 id="proposal-title">{proposal.summary}</h2><p>{proposal.reason}</p>
    <div className="proposal-total"><span>총 계획시간</span><strong>{proposal.totalMinutesBefore}분 → {proposal.totalMinutesAfter}분 ({proposal.totalMinutesAfter - proposal.totalMinutesBefore >= 0 ? "+" : ""}{proposal.totalMinutesAfter - proposal.totalMinutesBefore}분)</strong></div>
    <div className="proposal-scroll">{(["kept", "moved", "duration_changed", "removed", "added"] as const).map((kind) => {
      const changes = proposal.changes.filter((item) => item.change === kind);
      return changes.length ? <div className={`proposal-section ${kind}`} key={kind}><h3>{changeLabel[kind]}</h3>{changes.map((item, index) => <div className="proposal-change" key={`${kind}:${item.key}:${index}`}><strong>{item.title}</strong><span>{item.before ?? "—"}{item.before !== item.after ? ` → ${item.after ?? "오늘 계획 밖"}` : ""}{item.beforeMinutes !== item.afterMinutes ? ` · ${item.beforeMinutes ?? 0}분 → ${item.afterMinutes ?? 0}분` : ` · ${item.afterMinutes ?? item.beforeMinutes ?? 0}분`}</span></div>)}</div> : null;
    })}</div>
    <form className="proposal-actions" action={action}><button name="decision" value="reject" type="submit" disabled={pending}>Reject</button><button type="button" onClick={() => document.getElementById("today-plan-review")?.scrollIntoView({ behavior: "smooth" })}>Edit</button><button className="approve" name="decision" value="approve" type="submit" disabled={pending}>Approve</button></form>
  </section>;
}

function FocusTimer({ startedAt, durationMinutes, action, pending }: { startedAt: string | null; durationMinutes: number; action: (payload: FormData) => void; pending: boolean }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = focusRemainingSeconds(startedAt, durationMinutes, now ?? Date.parse(startedAt ?? ""));
  return <div className="focus-session-controls"><time className="focus-timer" dateTime={`PT${remaining}S`}>{String(Math.floor(remaining / 60)).padStart(2, "0")}:{String(remaining % 60).padStart(2, "0")}</time>
    {remaining === 0 && <strong>집중 시간 완료</strong>}
    <div className="focus-session-actions"><form action={action}><button name="command" value="완료" className="focus-button is-ready" disabled={pending}>완료</button></form><form action={action}><button name="command" value="15분 더" className="focus-button" disabled={pending}>+15분</button></form><form action={action}><button name="command" value="나중에 이어하기" className="focus-button" disabled={pending}>나중에 이어하기</button></form></div>
  </div>;
}

function CurrentMission({ data, onOpenWork, focusAction, focusPending, focusFeedback, completeAction, completePending, morningAction, morningPending, morningFeedback }: {
  data: HomeViewModel; onOpenWork: () => void;
  focusAction: (payload: FormData) => void; focusPending: boolean; focusFeedback: ChiefActionState;
  completeAction: (payload: FormData) => void; completePending: boolean;
  morningAction: (payload: FormData) => void; morningPending: boolean; morningFeedback: ChiefActionState;
}) {
  const action = data.currentAction;
  const recommendation = !action ? data.outcomePriority?.judgment.todayPriority[0] ?? null : null;
  const activeFocus = data.focus?.step === "active";
  const estimate = action?.minutes ?? recommendation?.minutes ?? null;
  const defaultDuration = defaultFocusMinutes(estimate);
  const [duration, setDuration] = useState(String(defaultDuration));
  const [customDuration, setCustomDuration] = useState(defaultDuration);
  const [durationOpen, setDurationOpen] = useState(false);
  useEffect(() => { setDuration(String(defaultDuration)); setCustomDuration(defaultDuration); setDurationOpen(false); }, [action?.planItemId, defaultDuration]);
  const chosenDuration = duration === "custom" ? customDuration : Number(duration);
  const title = action?.title ?? recommendation?.outcome ?? "지금 실행할 항목이 없습니다";
  const reason = action?.whyNow ?? "오늘 계획에서 우선 실행하도록 배치했어요.";
  const feedback = focusFeedback.message ? focusFeedback : morningFeedback;
  const feedbackMessage = morningFeedback.status === "success"
    ? "오늘 Quest를 준비했습니다. 계획 보기에서 검토할 수 있습니다."
    : focusFeedback.status === "success" ? "Focus를 반영했습니다. 남은 Quest와 계획을 갱신합니다." : feedback.message;
  return <section className={`mission-hud ${activeFocus ? "is-focusing" : ""}`} data-testid="current-action">
    <div className="mission-copy"><small>{activeFocus ? "FOCUS MODE" : "MAIN QUEST"}</small>
      {!data.configured ? <><h1>연결 설정이 필요합니다</h1><p>{data.error}</p></>
        : activeFocus ? <><h1>{title}</h1><FocusTimer startedAt={data.focus?.startedAt ?? null} durationMinutes={data.focus?.durationMinutes ?? 25} action={focusAction} pending={focusPending} /></>
          : <><button type="button" className="main-quest-link" onClick={onOpenWork}><h1>{title}</h1></button>{action && <p className="mission-reason"><strong>왜 지금?</strong> {reason}</p>}{!action && <p>{data.approvedPlan ? "오늘 계획의 실행 가능한 항목을 모두 확인했습니다." : "Morning에서 오늘 계획을 승인해 주세요."}</p>}</>}</div>
    {!activeFocus && <div className="mission-meta"><button type="button" className="mission-estimate" onClick={() => setDurationOpen((open) => !open)} disabled={!action || action.kind === "rest"} aria-expanded={durationOpen}><small>예상시간 · 집중 시간 변경</small><strong>{estimate ? `${estimate}분` : "—"}</strong><span>⌄</span></button></div>}
    {!activeFocus && durationOpen && data.planState.status === "approved" && action && action.kind !== "rest" && <FocusDurationSelector duration={duration} setDuration={setDuration} customDuration={customDuration} setCustomDuration={setCustomDuration} />}
    <div className="mission-actions">
      {data.planState.status === "no_plan" && <form action={morningAction}><input type="hidden" name="command" value="일어남" /><button className="focus-button" type="submit" disabled={morningPending}>{morningPending ? "계획 준비 중…" : "오늘 계획 만들기"}</button></form>}
      {data.planState.status === "approved" && !data.focus && action && action.kind !== "rest" && <><form action={focusAction}><input type="hidden" name="command" value={`시작:${chosenDuration}`} /><button className="focus-button is-ready" type="submit" disabled={focusPending || !Number.isInteger(chosenDuration) || chosenDuration < 1 || chosenDuration > 240}>▶ 집중 시작</button></form><form action={completeAction}><input type="hidden" name="taskId" value={action.taskId ?? ""} /><input type="hidden" name="stepId" value={action.stepId ?? ""} /><input type="hidden" name="occurrenceId" value={action.occurrenceId ?? ""} /><button className="focus-button" type="submit" disabled={completePending}>이미 완료했어요</button></form></>}
      {data.focus?.step === "awaiting_switch_confirmation" && <form action={focusAction}><button name="command" value="다른 거 할래" className="focus-button" type="submit" disabled={focusPending}>집중 종료 확인</button></form>}
      {data.focus?.step === "recovery_ready" && <form action={focusAction}><button name="command" value="다시 할게" className="focus-button is-ready" type="submit" disabled={focusPending}>다시 할게</button></form>}
    </div>
    {(data.focus?.step === "awaiting_block_reason" || data.focus?.step === "awaiting_missing_detail" || data.focus?.step === "awaiting_other_detail") && <div className="mission-inline-panel">
      {data.focus.step === "awaiting_block_reason" ? <form action={focusAction} className="block-choices">
        {[["불명확", "뭘 해야 할지 불명확"], ["어려움", "어려움"], ["하기 싫음", "하기 싫음"], ["완벽주의", "완벽주의"], ["자료 없음", "필요한 자료 없음"], ["기타", "기타"]].map(([label, value]) => <button key={value} name="command" value={value} disabled={focusPending}>{label}</button>)}
      </form> : <form action={focusAction} className="runtime-input"><input name="command" required maxLength={500} placeholder={data.focus.step === "awaiting_missing_detail" ? "필요한 자료나 도움을 적어 주세요" : "막힌 이유를 적어 주세요"} /><button disabled={focusPending}>기록</button></form>}
    </div>}
    {data.planState.status === "no_plan" && morningFeedback.status === "success" && <form action={morningAction} className="mission-inline-panel runtime-input"><input name="command" required maxLength={500} placeholder="예: 오늘 22시까지, 14시부터 15시는 제외" /><button disabled={morningPending}>계획 생성</button></form>}
    {data.planState.status === "pending_approval" && !data.proposal && <form action={morningAction} className="mission-inline-panel runtime-input"><input name="command" required maxLength={500} placeholder="예: 수정: 낮은 우선순위 작업 제외" /><button disabled={morningPending}>다시 짜기</button></form>}
    {feedbackMessage && <p className={`mission-feedback ${feedback.status}`} role="status">{feedbackMessage}</p>}
  </section>;
}

function ReviewOverlay({ data, action, pending, feedback, onClose }: {
  data: HomeViewModel; action: (payload: FormData) => void; pending: boolean; feedback: ChiefActionState; onClose: () => void;
}) {
  const [selected, setSelected] = useState(0);
  const artifact = data.reviewArtifacts[selected] ?? null;
  return <div className="runtime-overlay" role="dialog" aria-modal="true" aria-label="Artifact 검토함">
    <section className="review-panel"><header><div><small>REVIEW INBOX</small><h2>AI 산출물 검토</h2></div><button type="button" onClick={onClose} aria-label="검토함 닫기">×</button></header>
      {!artifact ? <p className="runtime-empty">검토할 verified Artifact가 없습니다.</p> : <div className="review-layout">
        <nav>{data.reviewArtifacts.map((item, index) => <button className={index === selected ? "selected" : ""} type="button" key={item.id} onClick={() => setSelected(index)}><strong>{item.title}</strong><small>{item.projectTitle}</small></button>)}</nav>
        <article><small>{artifact.projectTitle} · VERIFIED</small><h3>{artifact.title}</h3><p>{artifact.summary}</p><div className="artifact-body">{artifact.body}</div>
          <form action={action} className="review-actions">
            <input type="hidden" name="artifactId" value={artifact.id} /><input type="hidden" name="workContextId" value={artifact.workContextId} /><input type="hidden" name="contentHash" value={artifact.contentHash} />
            <textarea name="feedback" maxLength={2000} placeholder="수정 요청이나 거절 이유를 적어 주세요" />
            <div><button name="decision" value="reject" disabled={pending}>거절</button><button name="decision" value="revise" disabled={pending}>수정 요청</button><button className="approve" name="decision" value="accept" disabled={pending}>승인</button></div>
          </form>
          {feedback.message && <p className={`command-feedback ${feedback.status}`} role="status">{feedback.message}</p>}
        </article>
      </div>}
    </section>
  </div>;
}

function ProjectRuntimeOverlay({ data, action, decisionAction, pending, decisionPending, feedback, onClose, onOpenReview }: {
  data: HomeViewModel;
  action: (payload: FormData) => void;
  decisionAction: (payload: FormData) => void;
  pending: boolean;
  decisionPending: boolean;
  feedback: ChiefActionState;
  onClose: () => void;
  onOpenReview: () => void;
}) {
  const [selectedId, setSelectedId] = useState(data.projectRuntime[0]?.project.id ?? "");
  const selected = data.projectRuntime.find((item) => item.project.id === selectedId) ?? data.projectRuntime[0] ?? null;
  return <div className="runtime-overlay" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="project-runtime-panel" role="dialog" aria-modal="true" aria-labelledby="project-runtime-title">
      <header><div><small>PROJECT PM · RUNTIME</small><h2 id="project-runtime-title">프로젝트 다음 단계</h2></div><button type="button" onClick={onClose} aria-label="Project PM 닫기">×</button></header>
      {!selected ? <div className="project-runtime-empty"><strong>프로젝트가 아직 연결되지 않음</strong><p>등록된 Project WorkContext가 생기면 여기에서 분석을 시작할 수 있습니다.</p></div> : <div className="project-runtime-content">
        <label className="project-picker">PROJECT<select value={selected.project.id} onChange={(event) => setSelectedId(event.target.value)}>{data.projectRuntime.map((item) => <option value={item.project.id} key={item.project.id}>{item.project.title}</option>)}</select></label>
        <div className="project-runtime-heading"><div><span className={`project-state state-${selected.iterationState}`}>{selected.stateLabel}</span><h3>{selected.project.title}</h3></div><p>{selected.currentGap?.description ?? (selected.snapshot ? "최신 프로젝트 상태를 기준으로 다음 행동을 확인했습니다." : "아직 Project AI iteration이 없습니다.")}</p></div>
        <div className="project-runtime-facts">
          <div><small>LATEST SNAPSHOT</small><strong>{selected.snapshot ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: data.timeZone }).format(new Date(selected.snapshot.generatedAt)) : "없음"}</strong></div>
          <div><small>CURRENT GAP</small><strong>{selected.currentGap?.title ?? "확인된 Gap 없음"}</strong></div>
          <div><small>STATUS</small><strong>{selected.pendingReviewCount ? `검토 ${selected.pendingReviewCount}건` : selected.runningWorkCount ? `AI 실행 ${selected.runningWorkCount}건` : selected.waitingForUserCount ? `사용자 확인 ${selected.waitingForUserCount}건` : selected.nextActionLabel}</strong></div>
        </div>
        {selected.nextAction === "review_proposal" && selected.proposal ? <form action={decisionAction} className="project-proposal-form">
          <input type="hidden" name="workContextId" value={selected.project.id} />
          <div className="project-proposal-list">{selected.proposal.items.map((item) => <label key={item.key}><input type="checkbox" name="acceptedItemKey" value={item.key} defaultChecked /><span><strong>{item.title}</strong><small>{item.owner.toUpperCase()} · {item.priority.toUpperCase()}{item.dependencies.length ? ` · 선행 ${item.dependencies.length}` : ""}</small><p>{item.description}</p></span></label>)}</div>
          <div className="project-runtime-actions"><button name="decision" value="reject" type="submit" disabled={decisionPending}>거절</button><button className="approve" name="decision" value="approve" type="submit" disabled={decisionPending}>{decisionPending ? "반영 중…" : "선택 승인"}</button></div>
        </form> : <div className="project-next-action"><small>NEXT ACTION</small><strong>{selected.nextActionLabel}</strong>
          {(["start_iteration", "request_approval", "run_ai"] as const).includes(selected.nextAction as "start_iteration" | "request_approval" | "run_ai") && <form action={action}><input type="hidden" name="workContextId" value={selected.project.id} /><button className="approve" type="submit" disabled={pending}>{pending ? "처리 중…" : selected.nextActionLabel}</button></form>}
          {selected.nextAction === "review_artifact" && <button className="approve" type="button" onClick={onOpenReview}>Review Inbox 열기</button>}
        </div>}
        {feedback.message && <p className={`command-feedback ${feedback.status}`} role="status">{feedback.message}</p>}
      </div>}
    </section>
  </div>;
}

const stationAsset = {
  chief: "/assets/tycoon/characters/chief/idle.webp",
  project: "/assets/tycoon/characters/project-pm/idle.webp",
  learning: "/assets/tycoon/characters/university/idle.webp"
} as const;

function OfficeStation({ kind, title, detail, onClick }: {
  kind: keyof typeof stationAsset; title: string; detail: string; onClick: () => void;
}) {
  return <button className={`office-station ${kind}`} type="button" onClick={onClick} aria-label={`${title}: ${detail}`}>
    <span className="station-back" /><img className="station-character-asset" src={stationAsset[kind]} alt="" />
    <span className="station-desk"><i /><b /></span><span className="station-badge"><i />{detail}</span><strong>{title}</strong>
  </button>;
}

function FocusDurationSelector({ duration, setDuration, customDuration, setCustomDuration }: { duration: string; setDuration: (value: string) => void; customDuration: number; setCustomDuration: (value: number) => void }) {
  return <div className="focus-duration" aria-label="집중 시간 선택"><span>집중 시간</span>{["25", "45", "60"].map((value) => <button type="button" key={value} className={duration === value ? "selected" : ""} onClick={() => setDuration(value)}>{value}</button>)}<label className={duration === "custom" ? "selected" : ""}>직접<input aria-label="직접 집중 시간" type="number" min="1" max="240" value={customDuration} onChange={(event) => setCustomDuration(Number(event.target.value))} onFocus={() => setDuration("custom")} /></label></div>;
}

function NextQuests({ data, onOpenWork, onOpenPlan, completeAction, completePending }: { data: HomeViewModel; onOpenWork: () => void; onOpenPlan: () => void; completeAction: (payload: FormData) => void; completePending: boolean }) {
  const items = activeHomeQuests(data.timeline, data.currentAction?.taskId ?? null).slice(0, 2);
  return <section className="next-quests" aria-labelledby="next-quests-title"><header><small>QUEUE</small><h2 id="next-quests-title">Up Next</h2></header>
    {items.length ? <ol>{items.map((item) => <li key={item.id}><div className="next-quest-row">{(item.taskId || item.occurrenceId) && <form action={completeAction}><input type="hidden" name="taskId" value={item.taskId ?? ""} /><input type="hidden" name="stepId" value={item.stepId ?? ""} /><input type="hidden" name="occurrenceId" value={item.occurrenceId ?? ""} /><button className="quest-check" disabled={completePending} aria-label={`${item.title} 완료`} type="submit">✓</button></form>}<button type="button" onClick={onOpenWork}><span><strong>{item.title}</strong><small>{item.context ?? "오늘 Quest"}</small></span><em>~{item.minutes}분</em><i>›</i></button></div></li>)}</ol> : <p className="quest-empty">다음 Quest는 오늘 계획이 준비되면 표시됩니다.</p>}
    <button type="button" className="all-quests-link" onClick={onOpenPlan}>오늘 Quest 전체 보기 →</button>
  </section>;
}

function Capacity({ data }: { data: HomeViewModel }) {
  const required = data.timeline.filter((item) => (item.kind === "task" || item.kind === "routine") && item.source !== "pending").reduce((sum, item) => sum + item.minutes, 0);
  const available = data.availableMinutes;
  const difference = available === null ? null : available - required;
  return <section className="capacity-panel" aria-labelledby="capacity-title"><header><small>TODAY CAPACITY</small><h2 id="capacity-title">남은 여력</h2></header><div className="capacity-values"><span><small>가용</small><b>{available === null ? "확인 전" : `${available}분`}</b></span><span><small>Quest</small><b>{required ? `${required}분` : "0분"}</b></span><span className={difference !== null && difference < 0 ? "risk" : ""}><small>차이</small><b>{difference === null ? "—" : `${difference > 0 ? "+" : ""}${difference}분`}</b></span></div>{available === null && <p>가용시간이 확인되면 차이를 표시합니다.</p>}</section>;
}

function MissionsBoard({ data }: { data: HomeViewModel }) {
  const judgment = data.outcomePriority?.judgment;
  const clear = judgment?.todayPriority[0] ?? null;
  const levelUp = judgment?.todayPriority.slice(1).find((item) => item.reasonCodes.includes("GOAL")) ?? judgment?.todayPriority[1] ?? null;
  const bonus = judgment?.futureRelief ?? null;
  const rows = [["🔥", "CLEAR", "Clear Quest", clear], ["🌱", "LEVEL UP", "Level-up Quest", levelUp], ["✨", "BONUS", "Bonus Quest", bonus]] as const;
  return <aside className="missions-board" aria-labelledby="missions-title"><header><small>DAILY MISSION BOARD</small><h2 id="missions-title">Today's Missions</h2></header><div>{rows.map(([icon, status, label, item]) => {
    const progress = item ? data.missionProgress[item.taskId] : null;
    const count = item ? progress?.total ? `${progress.completed}/${progress.total}` : "0/1" : "—";
    return <article key={label} className={`${status.toLowerCase().replace(" ", "-")} ${!item ? "empty" : ""}`}><span className="mission-icon">{icon}</span><div><small>{status}</small><strong>{item?.outcome ?? "아직 배정된 Quest가 없습니다"}</strong></div><em>{count}</em><i className="mission-completion" aria-label={item ? `${label} 진행 ${count}` : `${label} 비어 있음`}>{item ? "○" : "·"}</i></article>;
  })}</div></aside>;
}

function GameDock({ router }: { router: ReturnType<typeof useRouter> }) {
  const items = [["⌂", "Home", "/"], ["✓", "Work", "/work"], ["▣", "Projects", "/projects"], ["✦", "Learning", "/learning"], ["⚙", "Settings", "/settings"]] as const;
  return <nav className="game-dock" aria-label="게임 도크">{items.map(([icon, label, href], index) => <button type="button" className={index === 0 ? "active" : ""} key={label} onClick={() => router.push(href)} aria-label={label}><i>{icon}</i><span>{label}</span></button>)}</nav>;
}

export function HomeCommandCenter({ initialData }: { initialData: HomeViewModel }) {
  const router = useRouter();
  const [actionState, submitAction, pending] = useActionState(requestChiefReplan, initialActionState);
  const [decisionState, submitDecision, decisionPending] = useActionState(decideChiefReplan, initialActionState);
  const [morningState, submitMorning, morningPending] = useActionState(runMorningAction, initialActionState);
  const [focusState, submitFocus, focusPending] = useActionState(runFocusAction, initialActionState);
  const [completeState, submitComplete, completePending] = useActionState(completeHomeQuestAction, initialActionState);
  const [reviewState, submitReview, reviewPending] = useActionState(reviewArtifactAction, initialActionState);
  const [projectState, submitProject, projectPending] = useActionState(runProjectRuntimeAction, initialActionState);
  const [projectDecisionState, submitProjectDecision, projectDecisionPending] = useActionState(decideProjectBacklogAction, initialActionState);
  const [chiefOpen, setChiefOpen] = useState(false);
  const [weekOpen, setWeekOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [proposalOpen, setProposalOpen] = useState(false);
  const commandRef = useRef<HTMLInputElement>(null);
  const chiefRef = useRef<HTMLDivElement>(null);
  const openChief = useCallback(() => {
    setChiefOpen(true);
    window.requestAnimationFrame(() => commandRef.current?.focus());
  }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openChief(); }
      if (event.key === "Escape") setChiefOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openChief]);
  useEffect(() => {
    if (!chiefOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !chiefRef.current?.contains(event.target)) setChiefOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [chiefOpen]);
  useEffect(() => { if (initialData.proposal) setChiefOpen(false); }, [initialData.proposal]);
  useEffect(() => {
    if (focusState.status === "success" || completeState.status === "success" || morningState.status === "success") router.refresh();
  }, [focusState, completeState, morningState, router]);

  const calendarCount = initialData.calendar.fixedCommitmentCount;
  const feedback = decisionState.message || actionState.message;
  const feedbackStatus = decisionState.message ? decisionState.status : actionState.status;

  return <main className={`tycoon-shell tycoon-home ${initialData.focus?.step === "active" ? "is-focus-mode" : ""}`}>
    <section className="tycoon-office" aria-label="Lifehacker Office World">
      <div className="office-wordmark">Lifehacker</div><button className="world-calendar-button" type="button" onClick={() => setWeekOpen(true)} aria-label="주간 일정 열기">▦ <span>{calendarCount}</span></button>
      <div className="office-floor" /><div className="office-zone zone-chief" /><div className="office-zone zone-project" /><div className="office-zone zone-learning" />
      <OfficeStation kind="chief" title="Chief" detail="Work & Calendar" onClick={() => router.push("/work")} />
      <OfficeStation kind="project" title="Project PM" detail="Projects" onClick={() => router.push("/projects")} />
      <OfficeStation kind="learning" title="Learning" detail="Learning" onClick={() => router.push("/learning")} />
      <section className="quest-console"><header><small>CHIEF'S QUEST CONSOLE</small><button type="button" onClick={() => setPlanOpen(true)}>오늘 계획 보기</button></header><CurrentMission data={initialData} onOpenWork={() => router.push("/work")} focusAction={submitFocus} focusPending={focusPending} focusFeedback={focusState} completeAction={submitComplete} completePending={completePending} morningAction={submitMorning} morningPending={morningPending} morningFeedback={morningState} /><NextQuests data={initialData} onOpenWork={() => router.push("/work")} onOpenPlan={() => setPlanOpen(true)} completeAction={submitComplete} completePending={completePending} /><Capacity data={initialData} />{completeState.message && <p className={`command-feedback ${completeState.status}`} role="status">{completeState.message}</p>}</section>
      <MissionsBoard data={initialData} />
      <section className="chief-command-panel tycoon-chief-command" ref={chiefRef}><header><div><small>CHIEF RADIO</small><strong>오늘 흐름 조정</strong></div><button type="button" onClick={() => chiefOpen ? setChiefOpen(false) : openChief()} disabled={!initialData.configured} aria-expanded={chiefOpen}>조정</button></header>{chiefOpen && <form action={submitAction}><input id="chief-command" ref={commandRef} name="command" placeholder="예: 지금 작업 미루기, 2시간 휴식" aria-label="Chief에게 일정 조정 요청" disabled={!initialData.configured || pending} /><button type="submit" disabled={!initialData.configured || pending}>{pending ? "계산 중…" : "변경안 만들기"}</button></form>}{feedback && <p className={`command-feedback ${feedbackStatus}`} role="status">{feedbackStatus === "success" ? "계획을 갱신했습니다. 중요한 변경은 검토 알림에서 확인하세요." : feedback}</p>}</section>
      {initialData.focus?.step === "active" && <div className="focus-spotlight" aria-hidden="true" />}
    </section>
    {(initialData.decisionCount > 0 || initialData.proposal) && <aside className="review-toast"><span>!</span><div><small>REVIEW READY</small><strong>{initialData.proposal ? "계획 변경안 검토 대기" : initialData.planState.status === "pending_approval" ? "오늘 계획 승인 대기" : initialData.reviewArtifacts.length ? `${initialData.reviewArtifacts.length}개의 산출물 검토 대기` : "확인이 필요한 제안이 있습니다"}</strong></div><button type="button" onClick={() => initialData.proposal ? setProposalOpen(true) : initialData.planState.status === "pending_approval" ? setPlanOpen(true) : setReviewOpen(true)}>검토</button></aside>}
    <GameDock router={router} />
    {proposalOpen && initialData.proposal && <div className="runtime-overlay"><ProposalPanel proposal={initialData.proposal} action={submitDecision} pending={decisionPending} /></div>}
    {planOpen && <div className="runtime-overlay" role="dialog" aria-modal="true" aria-label="오늘 계획"><section className="plan-dialog"><button className="dialog-close" type="button" onClick={() => setPlanOpen(false)} aria-label="오늘 계획 닫기">×</button><PlanReviewPanel data={initialData} morningAction={submitMorning} morningPending={morningPending} completeAction={submitComplete} completePending={completePending} /></section></div>}
    {weekOpen && <WeekCalendarOverlay days={initialData.week} today={initialData.date} timeZone={initialData.timeZone} onClose={() => setWeekOpen(false)} />}
    {reviewOpen && <ReviewOverlay data={initialData} action={submitReview} pending={reviewPending} feedback={reviewState} onClose={() => setReviewOpen(false)} />}
    {projectOpen && <ProjectRuntimeOverlay data={initialData} action={submitProject} decisionAction={submitProjectDecision} pending={projectPending} decisionPending={projectDecisionPending} feedback={projectDecisionState.message ? projectDecisionState : projectState} onClose={() => setProjectOpen(false)} onOpenReview={() => { setProjectOpen(false); setReviewOpen(true); }} />}
  </main>;
}
