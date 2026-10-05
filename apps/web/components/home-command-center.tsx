"use client";

import { useActionState, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { completeHomeQuestAction, decideChiefReplan, editTodayPlan, requestChiefReplan, reviewArtifactAction, runFocusAction, runMorningAction, saveChiefStatusOverride } from "../app/actions";
import type { ChiefActionState, HomeViewModel } from "../lib/home-types";
import { defaultFocusMinutes, focusRemainingSeconds, splitTodayPlan } from "../lib/home-presentation";
import { canStartHomeQuest, homeFocusMatchesRecommendation } from "../lib/home-chief-presentation";
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

function CurrentMission({ data, onOpenWork, focusAction, focusPending, focusFeedback, completeAction, completePending }: {
  data: HomeViewModel; onOpenWork: () => void;
  focusAction: (payload: FormData) => void; focusPending: boolean; focusFeedback: ChiefActionState;
  completeAction: (payload: FormData) => void; completePending: boolean;
}) {
  const action = data.currentAction;
  const activeFocus = data.focus?.step === "active";
  const focusMatches = homeFocusMatchesRecommendation(data);
  const canStart = canStartHomeQuest(data);
  const estimate = action?.minutes ?? null;
  const defaultDuration = defaultFocusMinutes(estimate);
  const [duration, setDuration] = useState(String(defaultDuration));
  const [customDuration, setCustomDuration] = useState(defaultDuration);
  const [durationOpen, setDurationOpen] = useState(false);
  useEffect(() => { setDuration(String(defaultDuration)); setCustomDuration(defaultDuration); setDurationOpen(false); }, [action?.taskId, action?.planItemId, defaultDuration]);
  const chosenDuration = duration === "custom" ? customDuration : Number(duration);
  const title = action?.title ?? "지금 실행할 항목이 없습니다";
  const reason = action?.whyNow ?? "현재 근거에서 실행 가능한 Quest가 없습니다.";
  const deadlineDays = action?.relevantDeadline
    ? Math.round((Date.parse(`${action.relevantDeadline}T00:00:00Z`) - Date.parse(`${data.date}T00:00:00Z`)) / 86_400_000)
    : null;
  const deadlineLabel = deadlineDays === null || !Number.isFinite(deadlineDays) ? null : deadlineDays === 0 ? "오늘 평가" : deadlineDays > 0 ? `평가 D-${deadlineDays}` : "평가일 지남";
  const feedbackMessage = focusFeedback.status === "success" ? "Focus를 반영했습니다. 현재 추천을 갱신합니다." : focusFeedback.message;
  return <section className={`mission-hud ${activeFocus ? "is-focusing" : ""}`} data-testid="current-action">
    <div className="mission-copy"><small>{activeFocus ? "FOCUS MODE" : "MAIN QUEST"}</small>
      {!data.configured ? <><h1>연결 설정이 필요합니다</h1><p>{data.error}</p></>
        : <><button type="button" className="main-quest-link" onClick={onOpenWork}><h1>{title}</h1></button>{action?.context && <p className="mission-context">{action.context}</p>}
          <div className="mission-evidence"><div><small>완료 기준</small><strong>{action?.completionCriteria ?? "완료 기준이 아직 없습니다"}</strong></div><div><small>왜 지금?</small><strong>{deadlineLabel ? `${deadlineLabel} · ${reason}` : reason}</strong></div></div>
          {action?.scopeExclusions && <p><strong>이번에는 하지 않음</strong> {action.scopeExclusions}</p>}
          {activeFocus && <><p>진행 중인 집중: {data.focus?.title ?? data.focus?.stepTitle ?? "현재 Focus"}{!focusMatches && action ? " · 새 추천으로 전환하려면 현재 집중을 먼저 마무리하세요." : ""}</p><FocusTimer startedAt={data.focus?.startedAt ?? null} durationMinutes={data.focus?.durationMinutes ?? 25} action={focusAction} pending={focusPending} /></>}
        </>}</div>
    {!activeFocus && <div className="mission-meta"><button type="button" className="mission-estimate" onClick={() => setDurationOpen((open) => !open)} disabled={!action || action.kind === "rest"} aria-expanded={durationOpen}><small>예상시간 · 집중 시간 변경</small><strong>{estimate ? `${estimate}분` : "—"}</strong><span>⌄</span></button></div>}
    {!activeFocus && durationOpen && action && action.kind !== "rest" && <FocusDurationSelector duration={duration} setDuration={setDuration} customDuration={customDuration} setCustomDuration={setCustomDuration} />}
    <div className="mission-actions">
      {canStart && action && <><form action={focusAction}><input type="hidden" name="command" value={`시작:${chosenDuration}:${action.kind}:${action.taskId ?? ""}`} /><button className="focus-button is-ready" type="submit" disabled={focusPending || !Number.isInteger(chosenDuration) || chosenDuration < 1 || chosenDuration > 240}>▶ 집중 시작</button></form><form action={completeAction}><input type="hidden" name="taskId" value={action.taskId ?? ""} /><input type="hidden" name="stepId" value={action.stepId ?? ""} /><input type="hidden" name="occurrenceId" value="" /><button className="focus-button" type="submit" disabled={completePending}>이미 완료했어요</button></form></>}
      {data.focus?.step === "awaiting_switch_confirmation" && <form action={focusAction}><button name="command" value="다른 거 할래" className="focus-button" type="submit" disabled={focusPending}>집중 종료 확인</button></form>}
      {data.focus?.step === "recovery_ready" && <form action={focusAction}><button name="command" value="다시 할게" className="focus-button is-ready" type="submit" disabled={focusPending}>다시 할게</button></form>}
    </div>
    {(data.focus?.step === "awaiting_block_reason" || data.focus?.step === "awaiting_missing_detail" || data.focus?.step === "awaiting_other_detail") && <div className="mission-inline-panel">
      {data.focus.step === "awaiting_block_reason" ? <form action={focusAction} className="block-choices">
        {[["불명확", "뭘 해야 할지 불명확"], ["어려움", "어려움"], ["하기 싫음", "하기 싫음"], ["완벽주의", "완벽주의"], ["자료 없음", "필요한 자료 없음"], ["기타", "기타"]].map(([label, value]) => <button key={value} name="command" value={value} disabled={focusPending}>{label}</button>)}
      </form> : <form action={focusAction} className="runtime-input"><input name="command" required maxLength={500} placeholder={data.focus.step === "awaiting_missing_detail" ? "필요한 자료나 도움을 적어 주세요" : "막힌 이유를 적어 주세요"} /><button disabled={focusPending}>기록</button></form>}
    </div>}
    {feedbackMessage && <p className={`mission-feedback ${focusFeedback.status}`} role="status">{feedbackMessage}</p>}
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

const stationAsset = {
  owner: { idle: "/assets/tycoon/characters/owner/idle.webp", working: "/assets/tycoon/characters/owner/working.webp" },
  chief: { idle: "/assets/tycoon/characters/chief/idle.webp", working: "/assets/tycoon/characters/chief/working.webp" },
  learning: "/assets/tycoon/characters/university/idle.webp"
} as const;

function OfficeStation({ kind, title, detail, asset, state, onClick }: {
  kind: "owner" | "chief" | "learning"; title: string; detail: string; asset: string; state: string; onClick: () => void;
}) {
  return <button className={`office-station ${kind} state-${state.toLowerCase().replaceAll("_", "-")}`} type="button" onClick={onClick} aria-label={`${title}: ${detail}`}>
    <span className="station-back" /><img className="station-character-asset" src={asset} alt="" />
    <span className="station-desk"><i /><b /></span><span className="station-badge"><i />{detail}</span><strong>{title}</strong>
  </button>;
}

function FocusDurationSelector({ duration, setDuration, customDuration, setCustomDuration }: { duration: string; setDuration: (value: string) => void; customDuration: number; setCustomDuration: (value: number) => void }) {
  return <div className="focus-duration" aria-label="집중 시간 선택"><span>집중 시간</span>{["25", "45", "60"].map((value) => <button type="button" key={value} className={duration === value ? "selected" : ""} onClick={() => setDuration(value)}>{value}</button>)}<label className={duration === "custom" ? "selected" : ""}>직접<input aria-label="직접 집중 시간" type="number" min="1" max="240" value={customDuration} onChange={(event) => setCustomDuration(Number(event.target.value))} onFocus={() => setDuration("custom")} /></label></div>;
}

function TodaySummary({ data }: { data: HomeViewModel }) {
  const available = data.availableMinutes;
  const fixed = data.nextFixedSchedule;
  return <section className="capacity-panel today-summary" aria-labelledby="today-summary-title"><header><small>TODAY</small><h2 id="today-summary-title">오늘</h2></header><div className="capacity-values">
    <span><small>다음 일정</small><b>{fixed ? `${localTime(fixed.startsAt, data.timeZone)} ${fixed.title}` : "예정 없음"}</b></span>
    <span><small>가용 시간</small><b>{capacityLabel(available)}</b></span>
    <span className={data.currentStatus?.officialDueToday.length ? "risk" : ""}><small>오늘 마감</small><b>{data.currentStatus?.officialDueToday.length ?? 0}개</b></span>
  </div></section>;
}

function ReassuranceBoard({ data }: { data: HomeViewModel }) {
  const label = { safe: "SAFE", protected: "PROTECTED", constrained: "CONSTRAINED", uncertain: "NEEDS REVIEW" } as const;
  return <aside className="missions-board reassurance-board" aria-labelledby="reassurance-title"><header><small>CHIEF REASSURANCE</small><h2 id="reassurance-title">나머지는 괜찮아?</h2></header><div>{data.reassurance.length
    ? data.reassurance.slice(0, 3).map((item) => <article key={item.taskId} className={`reassurance-${item.status}`}><span className="mission-icon" aria-hidden="true">{item.status === "uncertain" ? "?" : item.status === "constrained" ? "!" : "✓"}</span><div><small>{label[item.status]}</small><strong>{item.title}</strong><p>{item.explanation}</p><em>{item.whyNotNow}{item.riskTrigger ? ` · 기준 ${item.riskTrigger.replaceAll("-", ".")}` : ""}</em></div></article>)
    : <p className="reassurance-empty">현재 별도로 확인할 중요 항목이 없습니다.</p>}</div></aside>;
}

const capacityLabel = (minutes: number | null): string => minutes === null ? "확인 전"
  : minutes < 60 ? `${minutes}분` : `${Math.floor(minutes / 60)}h${minutes % 60 ? `${minutes % 60}m` : ""}`;

function CharacterBrief({ title, eyebrow, onClose, children }: {
  title: string; eyebrow: string; onClose: () => void; children: ReactNode;
}) {
  return <div className="status-popover-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="chief-status-popup character-brief" role="dialog" aria-modal="true" aria-label={title}>
      <header><div><small>{eyebrow}</small><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label={`${title} 닫기`}>×</button></header>{children}
    </section>
  </div>;
}

function OwnerBrief({ data, onClose }: { data: HomeViewModel; onClose: () => void }) {
  const working = data.focus?.step === "active";
  return <CharacterBrief title="Owner" eyebrow="HUMAN IN THE LOOP" onClose={onClose}><div className="brief-primary"><small>현재</small><strong>{working ? data.focus?.title ?? data.currentAction?.title ?? "Focus 실행 중" : "현재 실행 중인 작업 없음"}</strong>{working && <p>집중 중 · {data.focus?.durationMinutes ?? 25}분 세션</p>}</div></CharacterBrief>;
}

function LearningBrief({ data, onClose, onOpenLearning }: { data: HomeViewModel; onClose: () => void; onOpenLearning: () => void }) {
  const specialist = data.learningSpecialist;
  return <CharacterBrief title="Learning Brief" eyebrow="LEARNING SPECIALIST" onClose={onClose}>{!specialist ? <p className="runtime-empty">Learning 상태를 불러오지 못했습니다.</p> : <>
    <dl className="brief-facts"><div><dt>가장 가까운 일정</dt><dd>{specialist.nearestEvent ? `${specialist.nearestEvent.contextTitle} · ${specialist.nearestEvent.days === 0 ? "오늘" : `D-${specialist.nearestEvent.days}`}` : "예정 없음"}</dd></div><div><dt>주의 필요</dt><dd>{specialist.attentionNeededCount}개</dd></div><div><dt>확인 필요</dt><dd>{specialist.needsReviewCount}개</dd></div></dl>
    <div className="brief-primary"><small>현재 추천</small><strong>{specialist.currentRecommendation?.title ?? "현재 실행 가능한 Learning 추천 없음"}</strong>{specialist.currentRecommendation && <p>{specialist.currentRecommendation.contextTitle}</p>}</div>
    <div className="status-popup-actions"><button className="approve" type="button" onClick={onOpenLearning}>Learning 열기</button></div>
  </>}</CharacterBrief>;
}

function ChiefStatusPopup({ data, action, pending, feedback, onClose, onOpenWork }: {
  data: HomeViewModel;
  action: (payload: FormData) => void;
  pending: boolean;
  feedback: ChiefActionState;
  onClose: () => void;
  onOpenWork: () => void;
}) {
  const [editing, setEditing] = useState(false);
  return <div className="status-popover-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className="chief-status-popup" role="dialog" aria-modal="true" aria-labelledby="chief-status-title">
      <header><div><small>CHIEF BRIEF</small><h2 id="chief-status-title">현재 추천</h2></div><button type="button" onClick={onClose} aria-label="Chief Brief 닫기">×</button></header>
      {!data.currentStatus ? <p className="runtime-empty">현재 상태를 불러오지 못했습니다.</p> : <>
        <div className="brief-primary"><small>지금 먼저</small><strong>{data.currentAction?.title ?? "현재 실행 가능한 추천 없음"}</strong>{data.currentAction?.context && <p>{data.currentAction.context}</p>}</div>
        <div className="brief-reason"><small>왜 지금?</small><strong>{data.currentAction?.whyNow ?? "판단 가능한 실행 항목이 없습니다."}</strong></div>
        <div className="brief-reassurance"><small>나머지</small>{data.reassurance.slice(0, 3).map((item) => <p key={item.taskId}><strong>{item.title}</strong><span>{item.explanation}</span></p>)}{!data.reassurance.length && <p>별도로 확인할 중요 항목이 없습니다.</p>}</div>
        {data.currentStatus.overrides.length > 0 && <div className="status-overrides"><small>반영 중인 수정</small>{data.currentStatus.overrides.map((item) => <span key={item.id}>{item.scope === "TODAY" ? "오늘" : "계속"} · {item.text}</span>)}</div>}
        {editing ? <form action={action} className="status-correction-form">
          <textarea name="statusCorrection" required maxLength={500} placeholder="예: 오늘은 영상강의 대신 교안으로 직접 공부할 거야." />
          <fieldset><legend>반영 범위</legend><label><input type="radio" name="scope" value="TODAY" defaultChecked /> 오늘만</label><label><input type="radio" name="scope" value="PERSISTENT" /> 계속 반영</label></fieldset>
          <div><button type="button" onClick={() => setEditing(false)}>취소</button><button className="approve" disabled={pending}>{pending ? "반영 중…" : "상태 반영"}</button></div>
          {feedback.message && <p className={`command-feedback ${feedback.status}`} role="status">{feedback.message}</p>}
        </form> : <div className="status-popup-actions"><button type="button" onClick={onOpenWork}>Work 열기</button><button className="approve" type="button" onClick={() => setEditing(true)}>상태 수정</button></div>}
      </>}
    </section>
  </div>;
}

export function HomeCommandCenter({ initialData }: { initialData: HomeViewModel }) {
  const router = useRouter();
  const [actionState, submitAction, pending] = useActionState(requestChiefReplan, initialActionState);
  const [decisionState, submitDecision, decisionPending] = useActionState(decideChiefReplan, initialActionState);
  const [morningState, submitMorning, morningPending] = useActionState(runMorningAction, initialActionState);
  const [focusState, submitFocus, focusPending] = useActionState(runFocusAction, initialActionState);
  const [completeState, submitComplete, completePending] = useActionState(completeHomeQuestAction, initialActionState);
  const [reviewState, submitReview, reviewPending] = useActionState(reviewArtifactAction, initialActionState);
  const [statusOverrideState, submitStatusOverride, statusOverridePending] = useActionState(saveChiefStatusOverride, initialActionState);
  const [chiefOpen, setChiefOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [learningOpen, setLearningOpen] = useState(false);
  const [weekOpen, setWeekOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
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
    if (focusState.status === "success" || completeState.status === "success" || morningState.status === "success" || statusOverrideState.status === "success") router.refresh();
  }, [focusState, completeState, morningState, statusOverrideState, router]);

  const calendarCount = initialData.calendar.fixedCommitmentCount;
  const feedback = decisionState.message || actionState.message;
  const feedbackStatus = decisionState.message ? decisionState.status : actionState.status;
  const ownerWorking = initialData.focus?.step === "active";
  const priorityChoices = [...(initialData.chiefPriority?.mainQuest ? [initialData.chiefPriority.mainQuest] : []), ...(initialData.chiefPriority?.upNext ?? [])];
  const chiefRisk = priorityChoices.some((choice) => ["OVERDUE", "DUE_TODAY", "FUTURE_CAPACITY_DEFICIT"].includes(choice.evidence.deadlineState));
  const chiefNeedsReview = !chiefRisk && (initialData.reassurance.some((item) => item.status === "uncertain")
    || Boolean(initialData.currentAction?.reasonCodes?.some((code) => ["UNKNOWN_EFFORT","FUTURE_CAPACITY_UNKNOWN","CAPACITY_UNKNOWN"].includes(code)))
    || (!initialData.currentAction && (initialData.learningSpecialist?.needsReviewCount ?? 0) > 0));
  const chiefState = pending ? "RECALCULATING" : chiefRisk ? "RISK" : chiefNeedsReview ? "NEEDS_REVIEW" : initialData.currentAction ? "STABLE" : "IDLE";
  const learningCurrent = initialData.learningSpecialist?.currentRecommendation;
  const learningActive = Boolean(initialData.currentAction && (initialData.currentAction.candidateSource === "learning_proposal"
    || initialData.learningSpecialist?.activeTaskIds?.includes(initialData.currentAction.taskId ?? "")
    || (learningCurrent?.taskId && learningCurrent.taskId === initialData.currentAction.taskId)));
  const learningState = learningActive ? "ACTIVE" : (initialData.learningSpecialist?.needsReviewCount ?? 0) > 0 ? "NEEDS_REVIEW"
    : (initialData.learningSpecialist?.attentionNeededCount ?? 0) > 0 ? "ATTENTION" : "STABLE";

  return <main className={`tycoon-shell tycoon-home ${initialData.focus?.step === "active" ? "is-focus-mode" : ""}`}>
    <section className="tycoon-office" aria-label="Lifehacker Office World">
      <img className="office-wordmark" src="/assets/lifehacker/lifehacker-logo.png" alt="Lifehacker" />
      <button className="world-calendar-button" type="button" onClick={() => setWeekOpen(true)} aria-label="주간 일정 열기">▦ <span>{calendarCount}</span></button>
      <div className="office-floor" /><div className="office-zone zone-chief" /><div className="office-zone zone-owner" /><div className="office-zone zone-learning" />
      <OfficeStation kind="chief" title="Chief" detail={chiefState.replace("_", " ")} state={chiefState} asset={pending ? stationAsset.chief.working : stationAsset.chief.idle} onClick={() => setStatusOpen(true)} />
      <OfficeStation kind="owner" title="Owner" detail={ownerWorking ? "WORKING" : "IDLE"} state={ownerWorking ? "WORKING" : "IDLE"} asset={ownerWorking ? stationAsset.owner.working : stationAsset.owner.idle} onClick={() => setOwnerOpen(true)} />
      <OfficeStation kind="learning" title="University" detail={learningState.replace("_", " ")} state={learningState} asset={stationAsset.learning} onClick={() => setLearningOpen(true)} />
      <section className="quest-console"><header><small>CHIEF'S QUEST CONSOLE</small><button type="button" onClick={() => setPlanOpen(true)}>오늘 계획 보기</button></header><CurrentMission data={initialData} onOpenWork={() => router.push("/work")} focusAction={submitFocus} focusPending={focusPending} focusFeedback={focusState} completeAction={submitComplete} completePending={completePending} /><TodaySummary data={initialData} />{completeState.message && <p className={`command-feedback ${completeState.status}`} role="status">{completeState.message}</p>}</section>
      <ReassuranceBoard data={initialData} />
      <section className="chief-command-panel tycoon-chief-command" ref={chiefRef}><header><div><small>CHIEF RADIO</small><strong>오늘 흐름 조정</strong></div><button type="button" onClick={() => chiefOpen ? setChiefOpen(false) : openChief()} disabled={!initialData.configured} aria-expanded={chiefOpen}>조정</button></header>{chiefOpen && <form action={submitAction}><input id="chief-command" ref={commandRef} name="command" placeholder="예: 지금 작업 미루기, 2시간 휴식" aria-label="Chief에게 일정 조정 요청" disabled={!initialData.configured || pending} /><button type="submit" disabled={!initialData.configured || pending}>{pending ? "계산 중…" : "변경안 만들기"}</button></form>}{feedback && <p className={`command-feedback ${feedbackStatus}`} role="status">{feedbackStatus === "success" ? "계획을 갱신했습니다. 중요한 변경은 검토 알림에서 확인하세요." : feedback}</p>}</section>
      {initialData.focus?.step === "active" && <div className="focus-spotlight" aria-hidden="true" />}
    </section>
    {(initialData.decisionCount > 0 || initialData.proposal) && <aside className="review-toast"><span>!</span><div><small>REVIEW READY</small><strong>{initialData.proposal ? "계획 변경안 검토 대기" : initialData.planState.status === "pending_approval" ? "오늘 계획 승인 대기" : initialData.reviewArtifacts.length ? `${initialData.reviewArtifacts.length}개의 산출물 검토 대기` : "확인이 필요한 제안이 있습니다"}</strong></div><button type="button" onClick={() => initialData.proposal ? setProposalOpen(true) : initialData.planState.status === "pending_approval" ? setPlanOpen(true) : setReviewOpen(true)}>검토</button></aside>}
    {proposalOpen && initialData.proposal && <div className="runtime-overlay"><ProposalPanel proposal={initialData.proposal} action={submitDecision} pending={decisionPending} /></div>}
    {planOpen && <div className="runtime-overlay" role="dialog" aria-modal="true" aria-label="오늘 계획"><section className="plan-dialog"><button className="dialog-close" type="button" onClick={() => setPlanOpen(false)} aria-label="오늘 계획 닫기">×</button><PlanReviewPanel data={initialData} morningAction={submitMorning} morningPending={morningPending} completeAction={submitComplete} completePending={completePending} /></section></div>}
    {weekOpen && <WeekCalendarOverlay days={initialData.week} today={initialData.date} timeZone={initialData.timeZone} onClose={() => setWeekOpen(false)} />}
    {reviewOpen && <ReviewOverlay data={initialData} action={submitReview} pending={reviewPending} feedback={reviewState} onClose={() => setReviewOpen(false)} />}
    {ownerOpen && <OwnerBrief data={initialData} onClose={() => setOwnerOpen(false)} />}
    {learningOpen && <LearningBrief data={initialData} onClose={() => setLearningOpen(false)} onOpenLearning={() => router.push("/learning")} />}
    {statusOpen && <ChiefStatusPopup data={initialData} action={submitStatusOverride} pending={statusOverridePending} feedback={statusOverrideState} onClose={() => setStatusOpen(false)} onOpenWork={() => router.push("/work")} />}
  </main>;
}
