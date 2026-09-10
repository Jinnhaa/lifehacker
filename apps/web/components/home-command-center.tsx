"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { decideChiefReplan, requestChiefReplan } from "../app/actions";
import type { ChiefActionState, HomeTimelineItem, HomeViewModel } from "../lib/home-types";

const initialActionState: ChiefActionState = { status: "idle", message: "" };
const changeLabel = { kept: "유지", moved: "이동", deferred: "내일 후보", added: "추가" } as const;
const itemLabel: Record<HomeTimelineItem["kind"], string> = {
  task: "업무", routine: "루틴", rest: "휴식", buffer: "버퍼", calendar: "고정 일정"
};
const formatTime = (value: string, timeZone: string) => new Intl.DateTimeFormat("ko-KR", {
  timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23"
}).format(new Date(value));

function OwnerAvatar() {
  return <span className="owner-avatar" aria-label="Owner"><i className="owner-fin" /><i className="owner-face"><b /><em /></i><i className="owner-feet" /></span>;
}

function ChiefAvatar() {
  return <span className="chief-avatar" aria-label="Chief Amber"><i className="chief-hair" /><i className="chief-face"><b /><em /></i><i className="chief-body" /></span>;
}

function AgentAvatar({ active }: { active: boolean }) {
  return <span className={`agent-avatar ${active ? "active" : ""}`} aria-hidden="true"><i /><b /><em /></span>;
}

function Desk({ name, status, detail }: HomeViewModel["agents"][number]) {
  const active = status === "working";
  return <div className={`workstation ${active ? "is-working" : "is-idle"}`}>
    <div className="desk-object"><span className="desk-screen"><i /></span><span className="desk-cup" /><AgentAvatar active={active} /></div>
    <div className="desk-caption"><strong>{name}</strong><span><i />{active ? "작업 중" : "대기"}</span><small>{detail}</small></div>
  </div>;
}

function QuestHud({ data }: { data: HomeViewModel }) {
  return <aside className="quest-hud" aria-label="오늘의 핵심 목표">
    <div className="hud-eyebrow"><span>TODAY QUEST</span><b>{data.goals.length}</b></div>
    <div className="quest-list">{data.goals.length ? data.goals.slice(0, 3).map((goal, index) => <div className="quest-line" key={`${goal.name}:${index}`}>
      <span>0{index + 1}</span><div><strong>{goal.name}</strong><small>{goal.status}</small></div><i />
    </div>) : <p className="hud-empty">활성 Goal이 없습니다.</p>}</div>
  </aside>;
}

function TodayBoard({ items, timeZone }: { items: readonly HomeTimelineItem[]; timeZone: string }) {
  return <section className="today-board" data-testid="today-flow" aria-labelledby="today-board-title">
    <span className="board-clip left" /><span className="board-clip right" />
    <header><div><small>LIVE PLAN</small><h2 id="today-board-title">오늘 흐름</h2></div><span>{items.length} ITEMS</span></header>
    <div className="board-rule" />
    {items.length ? <ol>{items.slice(0, 7).map((item) => <li className={`${item.kind} ${item.current ? "current" : ""} ${item.status === "completed" ? "completed" : ""}`} key={item.id}>
      <time>{formatTime(item.startsAt, timeZone)}</time><i className="flow-node" /><div><strong>{item.title}</strong><small>{item.context ?? itemLabel[item.kind]} · {item.minutes}분</small></div>{item.current && <b>NOW</b>}
    </li>)}</ol> : <p className="board-empty">승인 계획에 표시할 항목이 없습니다.</p>}
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
    <div className="proposal-scroll">{(["kept", "moved", "deferred", "added"] as const).map((kind) => {
      const changes = proposal.changes.filter((item) => item.change === kind);
      return changes.length ? <div className={`proposal-section ${kind}`} key={kind}><h3>{changeLabel[kind]}</h3>{changes.map((item, index) => <div className="proposal-change" key={`${kind}:${item.key}:${index}`}><strong>{item.title}</strong><span>{item.before ?? "—"}{item.before !== item.after ? ` → ${item.after ?? "오늘 계획 밖"}` : ""}</span></div>)}</div> : null;
    })}</div>
    <form className="proposal-actions" action={action}><button name="decision" value="reject" type="submit" disabled={pending}>거절</button><button className="approve" name="decision" value="approve" type="submit" disabled={pending}>이대로 변경</button></form>
  </section>;
}

function CurrentMission({ data, focusCommand, focusNotice }: { data: HomeViewModel; focusCommand: () => void; focusNotice: () => void }) {
  const action = data.currentAction;
  return <section className="mission-hud" data-testid="current-action">
    <div className="owner-slot"><OwnerAvatar /><span>OWNER</span></div>
    <div className="mission-copy"><small>CURRENT MISSION</small>{!data.configured ? <><h1>연결 설정이 필요합니다</h1><p>{data.error}</p></> : !data.approvedPlan ? <><h1>승인된 오늘 계획이 없습니다</h1><p>Morning 흐름에서 오늘 계획을 승인해 주세요.</p></> : !action ? <><h1>지금 실행할 계획 항목이 없습니다</h1><p>오늘 계획의 실행 가능한 항목을 모두 확인했습니다.</p></> : <><h1>{action.title}</h1><p>{action.context ?? (action.source === "focus_session" ? "진행 중인 FocusSession" : "승인된 오늘 계획")}</p></>}</div>
    <div className="mission-meta"><div><small>예상 시간</small><strong>{action?.minutes ? `${action.minutes}분` : "—"}</strong></div><div><small>상태</small><strong>{action?.source === "focus_session" ? "집중 중" : action ? "실행 가능" : "대기"}</strong></div><div><small>PLAN</small><strong>{data.approvedPlan ? `v${data.approvedPlan.revisionNo}` : "—"}</strong></div></div>
    <div className="mission-actions"><button className="focus-button" onClick={focusNotice} disabled={!action} type="button"><span>▶</span> 집중 시작</button><button className="chief-button" onClick={focusCommand} disabled={!data.configured} type="button">Chief에게 조정 요청</button></div>
  </section>;
}

export function HomeCommandCenter({ initialData }: { initialData: HomeViewModel }) {
  const [actionState, submitAction, pending] = useActionState(requestChiefReplan, initialActionState);
  const [decisionState, submitDecision, decisionPending] = useActionState(decideChiefReplan, initialActionState);
  const [notice, setNotice] = useState("");
  const commandRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); commandRef.current?.focus(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const date = new Intl.DateTimeFormat("ko-KR", { timeZone: initialData.timeZone, month: "long", day: "numeric", weekday: "long" }).format(new Date());
  const calendarCount = initialData.timeline.filter((item) => item.kind === "calendar").length;
  const feedback = decisionState.message || actionState.message;
  const feedbackStatus = decisionState.message ? decisionState.status : actionState.status;

  return <main className="tycoon-shell">
    <header className="world-header"><div className="brand"><span className="brand-mark">A</span><div><strong>Amber HQ</strong><small>{date}</small></div></div><div className="world-status"><span className={initialData.configured ? "online" : "offline"}><i />{initialData.configured ? "HQ ONLINE" : "SETUP NEEDED"}</span><span>CALENDAR <b>{calendarCount}</b></span><span>REVIEW <b>{initialData.decisionCount}</b></span></div></header>

    <div className="office-stage">
      <div className="office-world">
        <div className="floor-grid" /><div className="back-wall"><span className="window-object"><i /><b /></span><span className="wall-logo">AMBER<br />HQ</span><span className="wall-shelf"><i /><i /><i /></span></div>
        <div className="zone-rug logfolio-rug" /><div className="zone-rug university-rug" /><div className="zone-rug lounge-rug" />
        <div className="zone-tag logfolio-tag"><i /> PROJECT STUDIO</div><div className="zone-tag university-tag"><i /> LEARNING LAB</div><div className="zone-tag chief-tag"><i /> CHIEF DESK</div>
        <div className="project-table"><span className="table-screen" /><span className="table-paper one" /><span className="table-paper two" /><span className="table-plant" /></div>
        <div className="university-shelf"><i /><i /><i /><i /></div>
        <div className="lounge-object"><span className="sofa" /><span className="coffee-table"><i /></span><span className="floor-lamp" /></div>
        <div className="owner-position"><OwnerAvatar /><span>Owner</span></div>
        <div className="chief-position"><div className="chief-desk"><span className="chief-monitor"><i /></span><span className="chief-lamp" /><ChiefAvatar /></div><div className={`chief-state ${initialData.proposal ? "attention" : ""}`}><i />{initialData.proposal ? "검토 대기" : "대기 중"}</div></div>
        <div className="today-position"><TodayBoard items={initialData.timeline} timeZone={initialData.timeZone} /></div>
        <div className="agents-position"><div className="agent-zone-heading"><span>AI OFFICE</span><small>{initialData.agents.filter((agent) => agent.status === "working").length} WORKING</small></div>{initialData.agents.length ? initialData.agents.slice(0, 3).map((agent) => <Desk {...agent} key={agent.name} />) : <div className="empty-workstation"><span className="empty-chair" /><p>활성 Agent 없음</p></div>}</div>
        <QuestHud data={initialData} />
        {initialData.proposal && <ProposalPanel proposal={initialData.proposal} action={submitDecision} pending={decisionPending} />}
      </div>
    </div>

    <form className="chief-command" action={submitAction}><span className="command-avatar"><ChiefAvatar /></span><label htmlFor="chief-command"><small>ASK CHIEF</small><strong>{initialData.proposal ? "변경안을 검토하고 있어요" : "오늘 흐름을 조정할까요?"}</strong></label><input id="chief-command" ref={commandRef} name="command" placeholder="예: 나 지금 2시간 쉬고 싶어" aria-label="Chief에게 일정 조정 요청" disabled={!initialData.configured || pending} /><kbd>⌘ K</kbd><button type="submit" disabled={!initialData.configured || pending}>{pending ? "계산 중…" : "변경안 만들기"}</button></form>
    {feedback && <p className={`command-feedback ${feedbackStatus}`} role="status">{feedback}</p>}
    <CurrentMission data={initialData} focusCommand={() => commandRef.current?.focus()} focusNotice={() => setNotice("집중 실행은 기존 Focus 화면에서 시작할 수 있어요.")} />
    {notice && <div className="soft-toast" role="status">{notice}<button onClick={() => setNotice("")} type="button">×</button></div>}
  </main>;
}
