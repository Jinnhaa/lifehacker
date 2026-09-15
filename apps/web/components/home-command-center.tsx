"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { decideChiefReplan, decideProjectBacklogAction, requestChiefReplan, reviewArtifactAction, runFocusAction, runMorningAction, runProjectRuntimeAction } from "../app/actions";
import type { ChiefActionState, HomeViewModel } from "../lib/home-types";
import { TodayCalendar, WeekCalendarOverlay } from "./calendar-views";

const initialActionState: ChiefActionState = { status: "idle", message: "" };
const changeLabel = { kept: "유지", moved: "이동", deferred: "내일 후보", added: "추가" } as const;

function QuestHud({ data }: { data: HomeViewModel }) {
  const judgment=data.outcomePriority?.judgment;
  const priority = judgment?.todayPriority.filter((item) => item.taskId !== data.currentAction?.taskId).slice(0, 3) ?? [];
  return <aside className="quest-hud" aria-label="오늘 끝낼 핵심 결과">
    <div className="hud-eyebrow"><span>TODAY PRIORITY</span><b>{priority.length}</b></div>
    <p className="priority-caption">오늘 끝낼 중요한 결과</p>
    <div className="quest-list">{priority.length ? priority.map((item,index)=><details key={item.taskId}><summary className="quest-line"><span>0{index+1}</span><strong>{item.outcome}</strong></summary><p>{item.rationale}</p></details>) : <p className="hud-empty">{judgment?.capacityKnown ? "NOW와 별도로 남은 핵심 결과가 없습니다" : "Morning에서 오늘 작업 가능 시간을 알려 주세요"}</p>}</div>
    <div className="hud-eyebrow"><span>FUTURE RELIEF</span></div>
    {judgment?.futureRelief ? <details><summary>{judgment.futureRelief.outcome}</summary><p>{judgment.futureRelief.rationale}</p></details> : <p className="hud-empty">근거가 확인된 항목 없음</p>}
    {!!judgment?.risks.length && <details><summary>마감·약속 위험 {judgment.risks.length}개</summary>{judgment.risks.map(item=><p key={item.taskId}>{item.outcome} — {item.rationale}</p>)}</details>}
    {!!judgment?.notToday.length && <details><summary>NOT TODAY</summary>{judgment.notToday.slice(0,3).map(item=><p key={item.taskId}>{item.outcome} — {item.rationale}</p>)}</details>}
  </aside>;
}

function ProposalPanel({ proposal, action, pending }: {
  proposal: NonNullable<HomeViewModel["proposal"]>;
  action: (payload: FormData) => void;
  pending: boolean;
}) {
  return <section className="chief-proposal" aria-labelledby="proposal-title">
    <header><span><i /> CHIEF PROPOSAL</span><small>DAILY PLAN · v{proposal.revisionNo}</small></header>
    <h2 id="proposal-title">{proposal.summary}</h2><p>{proposal.reason}</p>
    <div className="proposal-scroll">{(["kept", "moved", "deferred", "added"] as const).map((kind) => {
      const changes = proposal.changes.filter((item) => item.change === kind);
      return changes.length ? <div className={`proposal-section ${kind}`} key={kind}><h3>{changeLabel[kind]}</h3>{changes.map((item, index) => <div className="proposal-change" key={`${kind}:${item.key}:${index}`}><strong>{item.title}</strong><span>{item.before ?? "—"}{item.before !== item.after ? ` → ${item.after ?? "오늘 계획 밖"}` : ""}</span></div>)}</div> : null;
    })}</div>
    <form className="proposal-actions" action={action}><button name="decision" value="reject" type="submit" disabled={pending}>거절</button><button className="approve" name="decision" value="approve" type="submit" disabled={pending}>이대로 변경</button></form>
  </section>;
}

function FocusTimer({ startedAt }: { startedAt: string | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const elapsedSeconds = startedAt && now ? Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1_000)) : 0;
  const minutes = Math.floor(elapsedSeconds / 60);
  return <time className="focus-timer" dateTime={`PT${minutes}M${elapsedSeconds % 60}S`}>{String(Math.floor(minutes / 60)).padStart(2, "0")}:{String(minutes % 60).padStart(2, "0")}:{String(elapsedSeconds % 60).padStart(2, "0")}</time>;
}

function CurrentMission({ data, openChief, replanAction, replanPending, focusAction, focusPending, focusFeedback, morningAction, morningPending, morningFeedback }: {
  data: HomeViewModel; openChief: () => void;
  replanAction: (payload: FormData) => void; replanPending: boolean;
  focusAction: (payload: FormData) => void; focusPending: boolean; focusFeedback: ChiefActionState;
  morningAction: (payload: FormData) => void; morningPending: boolean; morningFeedback: ChiefActionState;
}) {
  const action = data.currentAction;
  const recommendation = !action ? data.outcomePriority?.judgment.todayPriority[0] ?? null : null;
  const activeFocus = data.focus?.step === "active";
  const title = action?.title ?? recommendation?.outcome ?? "지금 실행할 항목이 없습니다";
  const reason = action?.reason ?? recommendation?.rationale ?? null;
  return <section className={`mission-hud ${activeFocus ? "is-focusing" : ""}`} data-testid="current-action">
    <div className="mission-copy"><small>{activeFocus ? "FOCUS MODE" : action ? "NOW" : recommendation ? "NEXT RECOMMENDATION" : "NOW"}</small>
      {!data.configured ? <><h1>연결 설정이 필요합니다</h1><p>{data.error}</p></>
        : activeFocus ? <><h1>{title}</h1><FocusTimer startedAt={data.focus?.startedAt ?? null} /></>
          : <><h1>{title}</h1><p>{action?.context ?? (recommendation ? "Current Action이 없을 때의 다음 추천" : data.approvedPlan ? "오늘 계획의 실행 가능한 항목을 모두 확인했습니다." : "Morning에서 오늘 계획을 승인해 주세요.")}</p>{reason && <p className="mission-reason">{reason}</p>}</>}</div>
    {!activeFocus && <div className="mission-meta"><div><small>예상 시간</small><strong>{action?.minutes ? `${action.minutes}분` : recommendation?.minutes ? `${recommendation.minutes}분` : "—"}</strong></div><div><small>상태</small><strong>{action ? "실행 가능" : recommendation ? "다음 추천" : "대기"}</strong></div><div><small>PLAN</small><strong>{data.approvedPlan ? `v${data.approvedPlan.revisionNo}` : "—"}</strong></div></div>}
    <div className="mission-actions">
      {data.planState.status === "no_plan" && <form action={morningAction}><input type="hidden" name="command" value="일어남" /><button className="focus-button" type="submit" disabled={morningPending}>{morningPending ? "계획 준비 중…" : "오늘 계획 만들기"}</button></form>}
      {data.planState.status === "pending_approval" && <form action={morningAction}><input type="hidden" name="command" value="승인" /><button className="focus-button" type="submit" disabled={morningPending}>오늘 계획 승인</button></form>}
      {data.planState.status === "approved" && !data.focus && action?.kind === "task" && <form action={focusAction}><input type="hidden" name="command" value="시작" /><button className="focus-button is-ready" type="submit" disabled={focusPending}>집중 시작</button></form>}
      {data.planState.status === "approved" && !data.focus && action?.kind === "task" && <form action={replanAction}><input type="hidden" name="command" value="지금 작업 미루기" /><button className="focus-button" type="submit" disabled={replanPending}>미루기</button></form>}
      {activeFocus && <><form action={focusAction}><button name="command" value="완료" className="focus-button is-ready" type="submit" disabled={focusPending}>완료</button></form><form action={focusAction}><button name="command" value="다른 거 할래" className="focus-button" type="submit" disabled={focusPending}>집중 종료</button></form></>}
      {data.focus?.step === "awaiting_switch_confirmation" && <form action={focusAction}><button name="command" value="다른 거 할래" className="focus-button" type="submit" disabled={focusPending}>집중 종료 확인</button></form>}
      {data.focus?.step === "recovery_ready" && <form action={focusAction}><button name="command" value="다시 할게" className="focus-button is-ready" type="submit" disabled={focusPending}>다시 할게</button></form>}
      {!activeFocus && <button className="chief-button" onClick={openChief} disabled={!data.configured} type="button">Chief에게 조정 요청</button>}
    </div>
    {(data.focus?.step === "awaiting_block_reason" || data.focus?.step === "awaiting_missing_detail" || data.focus?.step === "awaiting_other_detail") && <div className="mission-inline-panel">
      {data.focus.step === "awaiting_block_reason" ? <form action={focusAction} className="block-choices">
        {[["불명확", "뭘 해야 할지 불명확"], ["어려움", "어려움"], ["하기 싫음", "하기 싫음"], ["완벽주의", "완벽주의"], ["자료 없음", "필요한 자료 없음"], ["기타", "기타"]].map(([label, value]) => <button key={value} name="command" value={value} disabled={focusPending}>{label}</button>)}
      </form> : <form action={focusAction} className="runtime-input"><input name="command" required maxLength={500} placeholder={data.focus.step === "awaiting_missing_detail" ? "필요한 자료나 도움을 적어 주세요" : "막힌 이유를 적어 주세요"} /><button disabled={focusPending}>기록</button></form>}
    </div>}
    {data.planState.status === "no_plan" && morningFeedback.status === "success" && <form action={morningAction} className="mission-inline-panel runtime-input"><input name="command" required maxLength={500} placeholder="예: 오늘 22시까지, 14시부터 15시는 제외" /><button disabled={morningPending}>계획 생성</button></form>}
    {data.planState.status === "pending_approval" && <form action={morningAction} className="mission-inline-panel runtime-input"><input name="command" required maxLength={500} placeholder="예: 수정: 낮은 우선순위 작업 제외" /><button disabled={morningPending}>다시 짜기</button></form>}
    {(focusFeedback.message || morningFeedback.message) && <p className={`mission-feedback ${(focusFeedback.message ? focusFeedback : morningFeedback).status}`} role="status">{focusFeedback.message || morningFeedback.message}</p>}
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

export function HomeCommandCenter({ initialData }: { initialData: HomeViewModel }) {
  const router = useRouter();
  const [actionState, submitAction, pending] = useActionState(requestChiefReplan, initialActionState);
  const [decisionState, submitDecision, decisionPending] = useActionState(decideChiefReplan, initialActionState);
  const [morningState, submitMorning, morningPending] = useActionState(runMorningAction, initialActionState);
  const [focusState, submitFocus, focusPending] = useActionState(runFocusAction, initialActionState);
  const [reviewState, submitReview, reviewPending] = useActionState(reviewArtifactAction, initialActionState);
  const [projectState, submitProject, projectPending] = useActionState(runProjectRuntimeAction, initialActionState);
  const [projectDecisionState, submitProjectDecision, projectDecisionPending] = useActionState(decideProjectBacklogAction, initialActionState);
  const [chiefOpen, setChiefOpen] = useState(false);
  const [weekOpen, setWeekOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
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

  const date = new Intl.DateTimeFormat("ko-KR", { timeZone: initialData.timeZone, month: "long", day: "numeric", weekday: "long" }).format(new Date());
  const calendarCount = initialData.calendar.fixedCommitmentCount;
  const feedback = decisionState.message || actionState.message;
  const feedbackStatus = decisionState.message ? decisionState.status : actionState.status;

  return <main className="tycoon-shell mission-control-shell">
    <header className="world-header">
      <div className="brand"><span className="brand-mark">A</span><div><strong>Amber HQ</strong><small>{date}</small></div></div>
      <div className="world-status"><span className={initialData.configured ? "online" : "offline"}><i />{initialData.configured ? "HQ ONLINE" : "SETUP NEEDED"}</span><button type="button" onClick={() => setWeekOpen(true)} title={initialData.calendar.activeProviders.length ? `${initialData.calendar.activeProviders.join(", ")} 동기화 상태` : "연결된 Calendar 없음"}>CALENDAR <b>{calendarCount}</b></button><button type="button" onClick={() => setReviewOpen(true)}>REVIEW <b>{initialData.decisionCount}</b></button><button type="button" onClick={() => setProjectOpen(true)}>PROJECT</button><button type="button" onClick={() => router.push("/settings/integrations")}>SETTINGS</button></div>
    </header>

    <section className="mission-control-layout">
      <CurrentMission data={initialData} openChief={openChief} replanAction={submitAction} replanPending={pending} focusAction={submitFocus} focusPending={focusPending} focusFeedback={focusState} morningAction={submitMorning} morningPending={morningPending} morningFeedback={morningState} />
      <section className="today-flow-panel"><TodayCalendar items={initialData.timeline} timeZone={initialData.timeZone} onOpenWeek={() => setWeekOpen(true)} /></section>
      <QuestHud data={initialData} />
      <section className="chief-command-panel" ref={chiefRef}>
        <header><div><small>CHIEF</small><strong>오늘 흐름 조정</strong></div><button type="button" onClick={() => chiefOpen ? setChiefOpen(false) : openChief()} disabled={!initialData.configured} aria-expanded={chiefOpen}>조정 요청</button></header>
        {chiefOpen && <form action={submitAction}><input id="chief-command" ref={commandRef} name="command" placeholder="예: 지금 작업 미루기, 2시간 휴식" aria-label="Chief에게 일정 조정 요청" disabled={!initialData.configured || pending} /><button type="submit" disabled={!initialData.configured || pending}>{pending ? "계산 중…" : "변경안 만들기"}</button></form>}
        {feedback && <p className={`command-feedback ${feedbackStatus}`} role="status">{feedback}</p>}
      </section>
    </section>
    {initialData.proposal && <ProposalPanel proposal={initialData.proposal} action={submitDecision} pending={decisionPending} />}
    {weekOpen && <WeekCalendarOverlay days={initialData.week} today={initialData.date} timeZone={initialData.timeZone} onClose={() => setWeekOpen(false)} />}
    {reviewOpen && <ReviewOverlay data={initialData} action={submitReview} pending={reviewPending} feedback={reviewState} onClose={() => setReviewOpen(false)} />}
    {projectOpen && <ProjectRuntimeOverlay data={initialData} action={submitProject} decisionAction={submitProjectDecision} pending={projectPending} decisionPending={projectDecisionPending} feedback={projectDecisionState.message ? projectDecisionState : projectState} onClose={() => setProjectOpen(false)} onOpenReview={() => { setProjectOpen(false); setReviewOpen(true); }} />}
  </main>;
}
