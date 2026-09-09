"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { decideChiefReplan, requestChiefReplan } from "../app/actions";
import type { ChiefActionState, HomeTimelineItem, HomeViewModel } from "../lib/home-types";

type Agent = { readonly name: string; readonly status: string; readonly detail: string };
const initialActionState: ChiefActionState = { status: "idle", message: "" };
const statusLabel: Record<string, string> = { working: "작업 중", idle: "대기" };
const changeLabel = { kept: "유지", moved: "이동", deferred: "내일 후보", added: "추가" } as const;
const time = (value: string, timeZone: string) => new Intl.DateTimeFormat("ko-KR", {
  timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23"
}).format(new Date(value));

function PixelAvatar({ chief = false }: { chief?: boolean }) {
  return <span className={`pixel-avatar ${chief ? "chief-avatar" : ""}`} aria-hidden="true"><i className="pixel-hair" /><i className="pixel-face" /><i className="pixel-body" /></span>;
}

function PixelDesk({ agent, chief = false, onClick }: { agent: Agent; chief?: boolean; onClick?: () => void }) {
  return <button className={`pixel-station ${agent.status === "idle" ? "is-idle" : ""}`} onClick={onClick} type="button">
    <span className="desk-scene" aria-hidden="true"><span className="monitor"><i /></span><span className="desk-top" /><span className="desk-leg left" /><span className="desk-leg right" /><PixelAvatar chief={chief} /></span>
    <span className="station-name">{chief ? "Amber" : agent.name}</span><span className={`agent-status ${agent.status}`}><i />{statusLabel[agent.status] ?? agent.status}</span><span className="station-detail">{agent.detail}</span>
  </button>;
}

function GoalHud({ goals }: { goals: HomeViewModel["goals"] }) {
  const [open, setOpen] = useState(false);
  return <div className="hud-popover"><button className="hud-button" onClick={() => setOpen(!open)} type="button"><small>핵심 목표</small><strong>{goals.length}</strong><span>{open ? "▴" : "▾"}</span></button>{open && <div className="hud-dropdown goal-dropdown">{goals.length ? goals.map((goal) => <div className="mini-goal" key={goal.name}><i /><span><strong>{goal.name}</strong><small>현재 상태</small></span><em>{goal.status}</em></div>) : <p className="mini-empty">활성 Goal이 없습니다.</p>}</div>}</div>;
}

function ScheduleHud({ items, timeZone }: { items: readonly HomeTimelineItem[]; timeZone: string }) {
  const [open, setOpen] = useState(false);
  const calendar = items.filter((item) => item.kind === "calendar");
  return <div className="hud-popover"><button className="schedule-button" onClick={() => setOpen(!open)} type="button">고정 일정 {calendar.length}개 <span>{open ? "▴" : "▾"}</span></button>{open && <div className="hud-dropdown schedule-dropdown">{calendar.length ? calendar.map((event) => <div className="schedule-row" key={event.id}><time>{time(event.startsAt, timeZone)}</time><span>{event.title}</span></div>) : <p className="mini-empty">동기화된 고정 일정이 없습니다.</p>}</div>}</div>;
}

function CurrentActionCard({ data, focusCommand }: { data: HomeViewModel; focusCommand: () => void }) {
  const action = data.currentAction;
  if (!data.configured) return <div className="quest-board empty-board"><span className="board-label">HOME CONFIGURATION</span><h1>연결 설정이 필요합니다</h1><p>{data.error}</p></div>;
  if (!data.approvedPlan) return <div className="quest-board empty-board"><span className="board-label">TODAY · NO APPROVED PLAN</span><h1>승인된 오늘 계획이 없습니다</h1><p>Morning 흐름에서 오늘 계획을 만들고 승인하면 여기에 실제 Current Action이 표시됩니다.</p></div>;
  if (!action) return <div className="quest-board empty-board"><span className="board-label">TODAY · COMPLETE</span><h1>지금 실행할 계획 항목이 없습니다</h1><p>오늘 계획은 연결되어 있지만 실행 가능한 항목이 남아 있지 않습니다.</p></div>;
  return <div className="quest-board" data-testid="current-action"><i className="pin left" /><i className="pin right" /><span className="board-label">NOW · CURRENT ACTION</span><h1>{action.title}</h1><p className="quest-reason">{action.context ?? (action.source === "focus_session" ? "진행 중인 Focus" : "승인된 오늘 계획")}</p><div className="quest-facts"><div><small>예상 시간</small><strong>{action.minutes ? `${action.minutes}분` : "확인 필요"}</strong></div><div><small>계획 revision</small><strong>v{data.approvedPlan.revisionNo}</strong></div><div><small>출처</small><strong>{action.source === "focus_session" ? "FocusSession" : "DailyPlan"}</strong></div></div><button className="primary-action" onClick={focusCommand} type="button">Chief에게 일정 조정 요청<span>›</span></button></div>;
}

function TodayFlow({ items, timeZone }: { items: readonly HomeTimelineItem[]; timeZone: string }) {
  return <section className="today-flow-panel" data-testid="today-flow" aria-labelledby="today-flow-title"><div className="section-heading"><span>APPROVED PLAN</span><h2 id="today-flow-title">오늘 흐름</h2></div>{items.length ? <ol>{items.map((item) => <li className={`${item.kind} ${item.current ? "current" : ""}`} key={item.id}><time>{time(item.startsAt, timeZone)}</time><span><strong>{item.title}</strong><small>{item.kind === "calendar" ? "고정 일정" : item.context ?? item.kind}</small></span><em>{item.minutes}m</em>{item.current && <b>NOW</b>}</li>)}</ol> : <p className="empty-copy">승인 계획에 표시할 항목이 없습니다.</p>}</section>;
}

function ProposalCard({ proposal, action, pending }: { proposal: NonNullable<HomeViewModel["proposal"]>; action: (payload: FormData) => void; pending: boolean }) {
  return <section className="proposal-card" aria-labelledby="proposal-title"><div><span className="board-label">CHIEF REPLAN PROPOSAL · v{proposal.revisionNo}</span><h2 id="proposal-title">{proposal.summary}</h2><p>{proposal.reason}</p></div><div className="proposal-groups">{(["kept", "moved", "deferred", "added"] as const).map((kind) => {
    const items = proposal.changes.filter((item) => item.change === kind);
    return items.length ? <div className={`proposal-group ${kind}`} key={kind}><h3>{changeLabel[kind]}</h3>{items.map((item) => <div className="proposal-row" key={`${kind}:${item.key}`}><strong>{item.title}</strong><span>{item.before ?? "—"}{item.before !== item.after ? ` → ${item.after ?? "오늘 계획 밖"}` : ""}</span></div>)}</div> : null;
  })}</div><form className="proposal-actions" action={action}><button name="decision" value="reject" type="submit" disabled={pending}>거절</button><button className="approve" name="decision" value="approve" type="submit" disabled={pending}>이대로 변경</button></form></section>;
}

export function HomeCommandCenter({ initialData }: { initialData: HomeViewModel }) {
  const [actionState, submitAction, pending] = useActionState(requestChiefReplan, initialActionState);
  const [decisionState, submitDecision, decisionPending] = useActionState(decideChiefReplan, initialActionState);
  const [navNotice, setNavNotice] = useState("");
  const commandRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const handler = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); commandRef.current?.focus(); } }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, []);
  const date = new Intl.DateTimeFormat("ko-KR", { timeZone: initialData.timeZone, month: "long", day: "numeric", weekday: "long" }).format(new Date());
  const navItems = ["Home", "Today", "Projects", "Agents", "Settings"];
  const chief: Agent = { name: "Chief", status: initialData.proposal ? "working" : "idle", detail: initialData.proposal ? "변경안 검토 대기" : "오늘 계획 연결됨" };

  return <main className="app-shell"><nav className="side-nav"><div className="nav-brand"><span>A</span><strong>AHQ</strong></div><div className="nav-menu">{navItems.map((item) => <button className={item === "Home" ? "active" : ""} key={item} onClick={() => item !== "Home" && setNavNotice(`${item}는 준비 중이에요.`)} type="button"><i>{item === "Home" ? "⌂" : item === "Today" ? "▦" : item === "Projects" ? "□" : item === "Agents" ? "♟" : "⚙"}</i><span>{item}</span></button>)}</div><div className="nav-online"><i />{initialData.configured ? "DB ONLINE" : "SETUP"}</div></nav><div className="home-area"><header className="top-hud"><div className="title-block"><strong>Amber HQ</strong><span>{date}</span></div><div className="hud-items"><GoalHud goals={initialData.goals} /><button className="hud-button decision" type="button"><small>결정 필요</small><strong>{initialData.decisionCount}</strong><span>›</span></button><ScheduleHud items={initialData.timeline} timeZone={initialData.timeZone} /></div></header><section className="pixel-office"><div className="office-wall"><span className="window" /><span className="shelf"><i /><i /><i /></span><span className="wall-clock"><i /></span></div><div className="office-floor" /><div className="chief-zone"><span className="zone-label">CHIEF</span><PixelDesk agent={chief} chief onClick={() => commandRef.current?.focus()} /></div><div className="quest-zone"><CurrentActionCard data={initialData} focusCommand={() => commandRef.current?.focus()} /></div><div className="agents-zone"><span className="zone-label">AI OFFICE</span>{initialData.agents.length ? initialData.agents.slice(0, 3).map((agent) => <PixelDesk agent={agent} key={agent.name} />) : <p className="office-empty">활성 Agent 없음</p>}</div><span className="plant"><i /><b /></span></section><TodayFlow items={initialData.timeline} timeZone={initialData.timeZone} />{initialData.proposal && <ProposalCard proposal={initialData.proposal} action={submitDecision} pending={decisionPending} />}<section className="amber-dialogue"><span className="dialogue-portrait"><PixelAvatar chief /></span><div className="dialogue-copy"><strong>Amber</strong><p>{initialData.proposal ? "기존 계획은 유지 중이에요. 변경안을 검토해 주세요." : "일정이 바뀌면 요청해 주세요. 승인 전에는 오늘 계획을 바꾸지 않아요."}</p></div></section><form className="command-console" action={submitAction}><span className="console-prompt">›</span><input ref={commandRef} name="command" placeholder="예: 나 지금 2시간 쉬고 싶어" aria-label="Chief에게 일정 조정 요청" disabled={!initialData.configured || pending} /><kbd>⌘ K</kbd><button type="submit" disabled={!initialData.configured || pending}>{pending ? "계산 중" : "변경안 만들기 ↵"}</button></form>{(decisionState.message || actionState.message) && <p className={`command-feedback ${decisionState.message ? decisionState.status : actionState.status}`} role="status">{decisionState.message || actionState.message}</p>}</div>{navNotice && <div className="pixel-toast" role="status">{navNotice}<button onClick={() => setNavNotice("")} type="button">×</button></div>}</main>;
}
