"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { decideChiefReplan, requestChiefReplan, reviewArtifactAction, runFocusAction, runMorningAction } from "../app/actions";
import type { ChiefActionState, HomeViewModel } from "../lib/home-types";
import { TodayCalendar, WeekCalendarOverlay } from "./calendar-views";

const initialActionState: ChiefActionState = { status: "idle", message: "" };
const changeLabel = { kept: "유지", moved: "이동", deferred: "내일 후보", added: "추가" } as const;

type AssetState = "idle" | "planning" | "working";
type StationId = "owner" | "project-pm" | "university" | "career";
type WorldStyle = CSSProperties & { "--x": number; "--y": number; "--w": number; "--z": number };

const worldStyle = (x: number, y: number, width: number, z: number): WorldStyle => ({
  "--x": x, "--y": y, "--w": width, "--z": z
});

const stationAssets: Record<StationId, string> = {
  owner: "/assets/tycoon/stations/owner-desk.webp",
  "project-pm": "/assets/tycoon/stations/project-studio.webp",
  university: "/assets/tycoon/stations/learning-studio.webp",
  career: "/assets/tycoon/stations/career-desk.webp"
};

function CharacterSprite({ role, state, label }: { role: StationId | "chief"; state: AssetState; label: string }) {
  return <img className={`world-character is-${state}`} src={`/assets/tycoon/characters/${role}/${state}.webp`} alt={label} />;
}

function OfficeStation({ id, label, detail, x, y, width, characterY, characterWidth, state = "idle" }: {
  id: StationId;
  label: string;
  detail: string;
  x: number;
  y: number;
  width: number;
  characterY: number;
  characterWidth: number;
  state?: AssetState;
}) {
  const characterTop = 50 + ((characterY - y) / width) * 100;
  return <section className={`world-entity station-${id}`} data-station={id} style={worldStyle(x, y, width, 20)} aria-label={`${label}, ${detail}`}>
    <img className="station-shadow" src="/assets/tycoon/ui/station-contact-shadow.png" alt="" />
    <img className="station-sprite" src={stationAssets[id]} alt="" />
    <span className="station-character" style={{ width: `${(characterWidth / width) * 100}%`, top: `${characterTop}%` }}>
      <CharacterSprite role={id} state={state} label={label} />
    </span>
    <span className="station-caption"><strong>{label}</strong><small><i className={state} />{detail}</small></span>
  </section>;
}

function QuestHud({ data }: { data: HomeViewModel }) {
  const judgment=data.outcomePriority?.judgment;
  return <aside className="quest-hud" aria-label="오늘 끝낼 핵심 결과">
    <div className="hud-eyebrow"><span>TODAY PRIORITY</span><b>{judgment?.todayPriority.length ?? 0}</b></div>
    <div className="quest-list">{judgment?.todayPriority.length ? judgment.todayPriority.map((item,index)=><details key={item.taskId}><summary className="quest-line"><span>0{index+1}</span><strong>{item.outcome}</strong></summary><p>{item.rationale}</p></details>) : <p className="hud-empty">{judgment?.capacityKnown ? "확인된 시간에 완료할 핵심 결과가 없습니다" : "Morning에서 오늘 작업 가능 시간을 알려 주세요"}</p>}</div>
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

function CurrentMission({ data, openChief, focusAction, focusPending, focusFeedback, morningAction, morningPending, morningFeedback }: {
  data: HomeViewModel; openChief: () => void;
  focusAction: (payload: FormData) => void; focusPending: boolean; focusFeedback: ChiefActionState;
  morningAction: (payload: FormData) => void; morningPending: boolean; morningFeedback: ChiefActionState;
}) {
  const action = data.currentAction;
  const ownerState: AssetState = action?.source === "focus_session" ? "working" : "idle";
  return <section className="mission-hud" data-testid="current-action">
    <div className="mission-owner"><CharacterSprite role="owner" state={ownerState} label="Owner 한교동" /><span>OWNER</span></div>
    <div className="mission-copy"><small>CURRENT MISSION</small>{!data.configured ? <><h1>연결 설정이 필요합니다</h1><p>{data.error}</p></> : !data.approvedPlan ? <><h1>승인된 오늘 계획이 없습니다</h1><p>Morning에서 오늘 계획을 승인해 주세요.</p></> : !action ? <><h1>지금 실행할 계획 항목이 없습니다</h1><p>오늘 계획의 실행 가능한 항목을 모두 확인했습니다.</p></> : <><h1>{action.title}</h1><p>{action.context ?? (action.source === "focus_session" ? "진행 중인 FocusSession" : "승인된 오늘 계획")}</p></>}</div>
    <div className="mission-meta"><div><small>예상 시간</small><strong>{action?.minutes ? `${action.minutes}분` : "—"}</strong></div><div><small>상태</small><strong>{action?.source === "focus_session" ? "집중 중" : action ? "실행 가능" : "대기"}</strong></div><div><small>PLAN</small><strong>{data.approvedPlan ? `v${data.approvedPlan.revisionNo}` : "—"}</strong></div></div>
    <div className="mission-actions">
      {data.planState.status === "no_plan" && <form action={morningAction}><input type="hidden" name="command" value="일어남" /><button className="focus-button" type="submit" disabled={morningPending}>{morningPending ? "계획 준비 중…" : "오늘 계획 만들기"}</button></form>}
      {data.planState.status === "pending_approval" && <form action={morningAction}><input type="hidden" name="command" value="승인" /><button className="focus-button" type="submit" disabled={morningPending}>오늘 계획 승인</button></form>}
      {data.planState.status === "approved" && !data.focus && action?.kind === "task" && <form action={focusAction}><input type="hidden" name="command" value="시작" /><button className="focus-button is-ready" type="submit" disabled={focusPending}>집중 시작</button></form>}
      {data.focus?.step === "active" && <><form action={focusAction}><button name="command" value="완료" className="focus-button is-ready" type="submit" disabled={focusPending}>완료</button></form><form action={focusAction}><button name="command" value="막혔어" className="focus-button" type="submit" disabled={focusPending}>막혔어</button></form></>}
      {data.focus?.step === "recovery_ready" && <form action={focusAction}><button name="command" value="다시 할게" className="focus-button is-ready" type="submit" disabled={focusPending}>다시 할게</button></form>}
      <button className="chief-button" onClick={openChief} disabled={!data.configured} type="button">Chief에게 조정 요청</button>
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

export function HomeCommandCenter({ initialData }: { initialData: HomeViewModel }) {
  const [actionState, submitAction, pending] = useActionState(requestChiefReplan, initialActionState);
  const [decisionState, submitDecision, decisionPending] = useActionState(decideChiefReplan, initialActionState);
  const [morningState, submitMorning, morningPending] = useActionState(runMorningAction, initialActionState);
  const [focusState, submitFocus, focusPending] = useActionState(runFocusAction, initialActionState);
  const [reviewState, submitReview, reviewPending] = useActionState(reviewArtifactAction, initialActionState);
  const [chiefOpen, setChiefOpen] = useState(false);
  const [weekOpen, setWeekOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
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
  const projectAgent = initialData.agents.find((agent) => /project|pm|프로젝트/i.test(agent.name));
  const projectState: AssetState = projectAgent?.status === "working" ? "working" : "idle";
  const chiefState: AssetState = pending ? "working" : chiefOpen ? "planning" : "idle";

  return <main className="tycoon-shell">
    <header className="world-header">
      <div className="brand"><span className="brand-mark">A</span><div><strong>Amber HQ</strong><small>{date}</small></div></div>
      <div className="world-status"><span className={initialData.configured ? "online" : "offline"}><i />{initialData.configured ? "HQ ONLINE" : "SETUP NEEDED"}</span><button type="button" onClick={() => setWeekOpen(true)} title={initialData.calendar.activeProviders.length ? `${initialData.calendar.activeProviders.join(", ")} 동기화 상태` : "연결된 Calendar 없음"}>CALENDAR <b>{calendarCount}</b></button><button type="button" onClick={() => setReviewOpen(true)}>REVIEW <b>{initialData.decisionCount}</b></button></div>
    </header>

    <div className="office-stage">
      <div className="office-world">
        <QuestHud data={initialData} />
        <OfficeStation id="project-pm" label="Project PM · 토토" detail={projectState === "working" ? "작업 중" : "대기 중"} x={245} y={330} width={360} characterY={285} characterWidth={118} state={projectState} />
        <OfficeStation id="university" label="University · 포포" detail="대기 중" x={1330} y={330} width={350} characterY={285} characterWidth={118} />
        <OfficeStation id="owner" label="Owner · 한교동" detail={initialData.currentAction?.source === "focus_session" ? "집중 중" : "대기 중"} x={250} y={675} width={360} characterY={605} characterWidth={122} state={initialData.currentAction?.source === "focus_session" ? "working" : "idle"} />
        <OfficeStation id="career" label="Career · 코코" detail="대기 중" x={1340} y={675} width={350} characterY={620} characterWidth={120} />

        <section className="today-world-board" data-station="today" style={worldStyle(800, 128, 500, 30)} onClick={(event) => { if (!(event.target instanceof Element) || !event.target.closest("button")) setWeekOpen(true); }}>
          <img className="today-frame" src="/assets/tycoon/ui/today-board-frame.webp" alt="" />
          <div className="today-content"><TodayCalendar items={initialData.timeline} timeZone={initialData.timeZone} onOpenWeek={() => setWeekOpen(true)} /></div>
        </section>

        <div className={`chief-interaction ${chiefOpen ? "is-open" : ""}`} ref={chiefRef} style={worldStyle(800, 610, 390, 25)} data-station="chief">
          <button className="chief-hotspot" type="button" onClick={() => chiefOpen ? setChiefOpen(false) : openChief()} disabled={!initialData.configured} aria-expanded={chiefOpen} aria-controls="chief-speech-panel">
            <img className="station-shadow" src="/assets/tycoon/ui/station-contact-shadow.png" alt="" />
            <img className="station-sprite" src="/assets/tycoon/stations/chief-desk.webp" alt="" />
            <span className="station-character chief-character"><CharacterSprite role="chief" state={chiefState} label="Chief 느림이" /></span>
            <span className="station-caption"><strong>Chief · 느림이</strong><small><i className={chiefState} />{pending ? "계획 계산 중" : initialData.proposal ? "검토 대기" : chiefOpen ? "요청 듣는 중" : "대기 중"}</small></span>
          </button>
          {chiefOpen && <div className="chief-speech" id="chief-speech-panel">
            <header><span>ASK CHIEF</span><button type="button" onClick={() => setChiefOpen(false)} aria-label="Chief 입력 닫기">×</button></header>
            <strong>오늘 흐름을 어떻게 조정할까요?</strong>
            <form action={submitAction}><input id="chief-command" ref={commandRef} name="command" placeholder="예: 나 지금 2시간 쉬고 싶어" aria-label="Chief에게 일정 조정 요청" disabled={!initialData.configured || pending} /><button type="submit" disabled={!initialData.configured || pending}>{pending ? "계산 중…" : "변경안 만들기"}</button></form>
            {feedback && <p className={`command-feedback ${feedbackStatus}`} role="status">{feedback}</p>}
          </div>}
        </div>

        <button className="review-station" type="button" onClick={() => setReviewOpen(true)} data-station="review" style={worldStyle(805, 785, 265, 28)} aria-label={`Review와 Inbox, 대기 ${initialData.decisionCount}건`}>
          <img className="station-shadow" src="/assets/tycoon/ui/station-contact-shadow.png" alt="" /><img className="station-sprite" src="/assets/tycoon/stations/review-inbox-station.webp" alt="" />
          <span className="review-caption">REVIEW / INBOX {initialData.decisionCount > 0 && <b>{initialData.decisionCount}</b>}</span>
        </button>

        {initialData.proposal && <ProposalPanel proposal={initialData.proposal} action={submitDecision} pending={decisionPending} />}
      </div>
    </div>

    <CurrentMission data={initialData} openChief={openChief} focusAction={submitFocus} focusPending={focusPending} focusFeedback={focusState} morningAction={submitMorning} morningPending={morningPending} morningFeedback={morningState} />
    {!initialData.currentAction && initialData.outcomePriority?.judgment.currentMission && <p className="mission-feedback">Chief 추천: {initialData.outcomePriority.judgment.currentMission.title} · Morning 계획 승인 후 실행하세요.</p>}
    {weekOpen && <WeekCalendarOverlay days={initialData.week} today={initialData.date} timeZone={initialData.timeZone} onClose={() => setWeekOpen(false)} />}
    {reviewOpen && <ReviewOverlay data={initialData} action={submitReview} pending={reviewPending} feedback={reviewState} onClose={() => setReviewOpen(false)} />}
  </main>;
}
