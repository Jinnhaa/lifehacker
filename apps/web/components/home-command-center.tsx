"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { decideChiefReplan, requestChiefReplan } from "../app/actions";
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
  return <aside className="quest-hud" aria-label="오늘의 핵심 목표">
    <div className="hud-eyebrow"><span>TODAY QUEST</span><b>{data.goals.length}</b></div>
    <div className="quest-list">{data.goals.length ? data.goals.slice(0, 3).map((goal, index) => <div className="quest-line" key={`${goal.name}:${index}`}>
      <span>0{index + 1}</span><strong>{goal.name}</strong><i />
    </div>) : <p className="hud-empty">활성 Goal 없음</p>}</div>
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

function CurrentMission({ data, openChief }: { data: HomeViewModel; openChief: () => void }) {
  const action = data.currentAction;
  const ownerState: AssetState = action?.source === "focus_session" ? "working" : "idle";
  return <section className="mission-hud" data-testid="current-action">
    <div className="mission-owner"><CharacterSprite role="owner" state={ownerState} label="Owner 한교동" /><span>OWNER</span></div>
    <div className="mission-copy"><small>CURRENT MISSION</small>{!data.configured ? <><h1>연결 설정이 필요합니다</h1><p>{data.error}</p></> : !data.approvedPlan ? <><h1>승인된 오늘 계획이 없습니다</h1><p>Morning에서 오늘 계획을 승인해 주세요.</p></> : !action ? <><h1>지금 실행할 계획 항목이 없습니다</h1><p>오늘 계획의 실행 가능한 항목을 모두 확인했습니다.</p></> : <><h1>{action.title}</h1><p>{action.context ?? (action.source === "focus_session" ? "진행 중인 FocusSession" : "승인된 오늘 계획")}</p></>}</div>
    <div className="mission-meta"><div><small>예상 시간</small><strong>{action?.minutes ? `${action.minutes}분` : "—"}</strong></div><div><small>상태</small><strong>{action?.source === "focus_session" ? "집중 중" : action ? "실행 가능" : "대기"}</strong></div><div><small>PLAN</small><strong>{data.approvedPlan ? `v${data.approvedPlan.revisionNo}` : "—"}</strong></div></div>
    <div className="mission-actions"><button className="focus-button" disabled type="button" title="Focus 화면 연결 전입니다">집중 시작 · 준비 중</button><button className="chief-button" onClick={openChief} disabled={!data.configured} type="button">Chief에게 조정 요청</button></div>
  </section>;
}

export function HomeCommandCenter({ initialData }: { initialData: HomeViewModel }) {
  const [actionState, submitAction, pending] = useActionState(requestChiefReplan, initialActionState);
  const [decisionState, submitDecision, decisionPending] = useActionState(decideChiefReplan, initialActionState);
  const [chiefOpen, setChiefOpen] = useState(false);
  const [weekOpen, setWeekOpen] = useState(false);
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
  const calendarCount = initialData.timeline.filter((item) => item.kind === "calendar").length;
  const feedback = decisionState.message || actionState.message;
  const feedbackStatus = decisionState.message ? decisionState.status : actionState.status;
  const projectAgent = initialData.agents.find((agent) => /project|pm|프로젝트/i.test(agent.name));
  const projectState: AssetState = projectAgent?.status === "working" ? "working" : "idle";
  const chiefState: AssetState = pending ? "working" : chiefOpen ? "planning" : "idle";

  return <main className="tycoon-shell">
    <header className="world-header">
      <div className="brand"><span className="brand-mark">A</span><div><strong>Amber HQ</strong><small>{date}</small></div></div>
      <div className="world-status"><span className={initialData.configured ? "online" : "offline"}><i />{initialData.configured ? "HQ ONLINE" : "SETUP NEEDED"}</span><button type="button" onClick={() => setWeekOpen(true)}>CALENDAR <b>{calendarCount}</b></button><span>REVIEW <b>{initialData.decisionCount}</b></span></div>
    </header>

    <div className="office-stage">
      <div className="office-world">
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

        <section className="review-station" data-station="review" style={worldStyle(805, 785, 265, 28)} aria-label={`Review와 Inbox, 대기 ${initialData.decisionCount}건`}>
          <img className="station-shadow" src="/assets/tycoon/ui/station-contact-shadow.png" alt="" /><img className="station-sprite" src="/assets/tycoon/stations/review-inbox-station.webp" alt="" />
          <span className="review-caption">REVIEW / INBOX {initialData.decisionCount > 0 && <b>{initialData.decisionCount}</b>}</span>
        </section>

        <QuestHud data={initialData} />
        {initialData.proposal && <ProposalPanel proposal={initialData.proposal} action={submitDecision} pending={decisionPending} />}
      </div>
    </div>

    <CurrentMission data={initialData} openChief={openChief} />
    {weekOpen && <WeekCalendarOverlay days={initialData.week} today={initialData.date} timeZone={initialData.timeZone} onClose={() => setWeekOpen(false)} />}
  </main>;
}
