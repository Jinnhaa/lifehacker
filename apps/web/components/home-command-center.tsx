"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { homeFallbackData } from "../lib/home-fallback-data";
import type { GoalPeriod } from "../lib/home-fallback-data";

type Stage = "quest" | "focus";
type Agent = { readonly name: string; readonly status: string; readonly detail: string };
const statusLabel: Record<string, string> = { working: "작업 중", idle: "대기", waiting_decision: "결정 대기", completed: "완료" };

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function PixelAvatar({ chief = false }: { chief?: boolean }) {
  return <span className={`pixel-avatar ${chief ? "chief-avatar" : ""}`} aria-hidden="true"><i className="pixel-hair" /><i className="pixel-face" /><i className="pixel-body" /></span>;
}

function PixelDesk({ agent, chief = false, onClick }: { agent: Agent; chief?: boolean; onClick?: () => void }) {
  return <button className={`pixel-station ${agent.status === "idle" ? "is-idle" : ""}`} onClick={onClick} type="button">
    <span className="desk-scene" aria-hidden="true"><span className="monitor"><i /></span><span className="desk-top" /><span className="desk-leg left" /><span className="desk-leg right" /><PixelAvatar chief={chief} /></span>
    <span className="station-name">{chief ? "Amber" : agent.name}</span><span className={`agent-status ${agent.status}`}><i />{statusLabel[agent.status]}</span><span className="station-detail">{chief ? "오늘 계획 확인 중" : agent.detail}</span>
  </button>;
}

function GoalHud() {
  const [period, setPeriod] = useState<GoalPeriod>("today");
  const [open, setOpen] = useState(false);
  const labels: Record<GoalPeriod, string> = { today: "오늘", week: "이번 주", month: "이번 달" };
  return <div className="hud-popover"><button className="hud-button" onClick={() => setOpen(!open)} type="button"><small>오늘 목표</small><strong>2 / 3</strong><span>{open ? "▴" : "▾"}</span></button>{open && <div className="hud-dropdown goal-dropdown"><div className="mini-tabs">{(Object.keys(labels) as GoalPeriod[]).map((key) => <button className={period === key ? "active" : ""} key={key} onClick={() => setPeriod(key)} type="button">{labels[key]}</button>)}</div>{homeFallbackData.goals[period].map((goal, index) => <div className="mini-goal" key={goal.name}><i className={index === 1 ? "done" : ""} /><span><strong>{goal.name}</strong><small>{goal.outcome}</small></span><em>{goal.status}</em></div>)}</div>}</div>;
}

function ScheduleHud() {
  const [open, setOpen] = useState(false);
  const now = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  return <div className="hud-popover"><button className="schedule-button" onClick={() => setOpen(!open)} type="button">오늘 일정 {homeFallbackData.schedule.length}개 <span>{open ? "▴" : "▾"}</span></button>{open && <div className="hud-dropdown schedule-dropdown">{homeFallbackData.schedule.slice(0, 2).map((event) => <div className="schedule-row" key={event.startsAt}><time>{event.startsAt}</time><span>{event.title}</span></div>)}<div className="now-rule"><i />지금 {now}<i /></div>{homeFallbackData.schedule.slice(2).map((event) => <div className="schedule-row" key={event.startsAt}><time>{event.startsAt}</time><span>{event.title}</span></div>)}</div>}</div>;
}

function TodayQuest({ onStart, paused }: { onStart: () => void; paused: number | null }) {
  const { quests } = homeFallbackData;
  return <div className="quest-board"><i className="pin left" /><i className="pin right" /><span className="board-label">NOW · AMBER&apos;S PICK</span>{paused !== null && <div className="paused-note">집중 일시정지 · {quests.main.title} · {formatTime(paused)}</div>}<h1>{quests.main.title}</h1><p className="quest-reason">18시 회의 전 집중 가능한 시간을 확보했어요.</p><div className="quest-facts"><div><small>추천 집중</small><strong>{quests.main.minutes}분</strong></div><div><small>다음 일정까지</small><strong>1시간 38분</strong></div><div><small>다음 고정 일정</small><strong>{quests.fixedEvent.startsAt} · {quests.fixedEvent.title}</strong></div></div><button className="primary-action" onClick={onStart} type="button">{paused ? "집중 이어하기" : "집중 시작"}<span>▶</span></button><div className="next-quest">NEXT <i /> {quests.next.title} <b>{quests.next.minutes}m</b></div></div>;
}

function FocusMode({ elapsed, targetMinutes, onDone, onPause, onExtend, onReplan }: { elapsed: number; targetMinutes: number; onDone: () => void; onPause: () => void; onExtend: () => void; onReplan: () => void }) {
  const task = homeFallbackData.quests.main;
  const target = targetMinutes * 60;
  const ended = elapsed >= target;
  return <div className="quest-board focus-board"><i className="pin left" /><i className="pin right" /><span className="board-label live"><i /> FOCUS QUEST</span><h1>{task.title}</h1><div className="focus-timer"><strong>{formatTime(elapsed)}</strong><span>/ {formatTime(target)}</span></div><div className="pixel-progress"><span style={{ width: `${Math.min(100, elapsed / target * 100)}%` }} /></div><p className="amber-recommend">AMBER 추천 <b>{task.minutes}분</b></p>{ended ? <div className="time-up"><strong>계획한 {task.minutes}분이 끝났어요.</strong><span>뒤 일정 때문에 여기서 마무리하는 걸 추천해요.</span><div><button onClick={onDone} type="button">여기까지</button><button onClick={onExtend} type="button">15분 연장</button><button onClick={onReplan} type="button">다시 계획</button></div></div> : <div className="focus-actions"><button className="complete" onClick={onDone} type="button">✓ 완료</button><button onClick={onReplan} type="button">막혔어</button><button onClick={onPause} type="button">잠깐 멈춤</button></div>}</div>;
}

function AmberDialogue() {
  const [handled, setHandled] = useState<string | null>(null);
  const { intervention } = homeFallbackData;
  return <section className="amber-dialogue"><span className="dialogue-portrait"><PixelAvatar chief /></span><div className="dialogue-copy"><strong>Amber</strong>{handled ? <p className="handled">{handled}</p> : <p>{intervention.message}<br />{intervention.recommendation}</p>}</div>{!handled && <div className="dialogue-actions"><button onClick={() => setHandled("알겠어. 우선순위가 낮은 2개는 내일로 넘겨둘게.")} type="button">그렇게 해</button><button onClick={() => setHandled("직접 조정할 수 있도록 오늘 계획은 그대로 둘게.")} type="button">내가 조정할게</button></div>}</section>;
}

export function HomeCommandCenter() {
  const [stage, setStage] = useState<Stage>("quest");
  const [elapsed, setElapsed] = useState(0);
  const [targetMinutes, setTargetMinutes] = useState<number>(homeFallbackData.quests.main.minutes);
  const [paused, setPaused] = useState<number | null>(null);
  const [command, setCommand] = useState("");
  const [commandResult, setCommandResult] = useState("");
  const [navNotice, setNavNotice] = useState("");
  const commandRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (stage !== "focus") return; const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000); return () => window.clearInterval(timer); }, [stage]);
  useEffect(() => { const handler = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); commandRef.current?.focus(); } }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, []);
  const start = () => { setElapsed(paused ?? 0); setPaused(null); setStage("focus"); };
  const pause = () => { setPaused(elapsed); setStage("quest"); };
  const finish = () => { setPaused(null); setElapsed(0); setTargetMinutes(homeFallbackData.quests.main.minutes); setStage("quest"); };
  const submitCommand = (event: FormEvent) => { event.preventDefault(); if (!command.trim()) return; setCommandResult(`“${command.trim()}” 요청을 받았어요. 연결 가능한 입력 API가 준비되면 Amber가 실행합니다.`); setCommand(""); };
  const date = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long" }).format(new Date());
  const navItems = ["Home", "Today", "Projects", "Agents", "Settings"];

  return <main className="app-shell"><nav className="side-nav"><div className="nav-brand"><span>A</span><strong>AHQ</strong></div><div className="nav-menu">{navItems.map((item) => <button className={item === "Home" ? "active" : ""} key={item} onClick={() => item !== "Home" && setNavNotice(`${item}는 준비 중이에요.`)} type="button"><i>{item === "Home" ? "⌂" : item === "Today" ? "▦" : item === "Projects" ? "□" : item === "Agents" ? "♟" : "⚙"}</i><span>{item}</span></button>)}</div><div className="nav-online"><i />ONLINE</div></nav><div className="home-area"><header className="top-hud"><div className="title-block"><strong>Amber HQ</strong><span>{date}</span></div><div className="hud-items"><GoalHud /><button className="hud-button decision" type="button"><small>결정 필요</small><strong>{homeFallbackData.decisionCount}</strong><span>›</span></button><ScheduleHud /></div></header><section className={`pixel-office ${stage === "focus" ? "focus-active" : ""}`}><div className="office-wall"><span className="window" /><span className="shelf"><i /><i /><i /></span><span className="wall-clock"><i /></span></div><div className="office-floor" /><div className="chief-zone"><span className="zone-label">CHIEF</span><PixelDesk agent={homeFallbackData.agents.chief} chief onClick={() => commandRef.current?.focus()} /></div><div className="quest-zone">{stage === "quest" ? <TodayQuest onStart={start} paused={paused} /> : <FocusMode elapsed={elapsed} targetMinutes={targetMinutes} onDone={finish} onPause={pause} onExtend={() => setTargetMinutes(targetMinutes + 15)} onReplan={pause} />}</div><div className="agents-zone"><span className="zone-label">PROJECT OFFICE</span>{homeFallbackData.agents.project.map((agent) => <PixelDesk agent={agent} key={agent.name} />)}</div><span className="plant"><i /><b /></span></section><AmberDialogue /><form className="command-console" onSubmit={submitCommand}><span className="console-prompt">›</span><input ref={commandRef} value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Amber에게 무엇이든 요청..." aria-label="Amber에게 요청" /><kbd>⌘ K</kbd><button type="submit">전송 ↵</button></form></div>{(commandResult || navNotice) && <div className="pixel-toast" role="status">{commandResult || navNotice}<button onClick={() => { setCommandResult(""); setNavNotice(""); }} type="button">×</button></div>}</main>;
}
