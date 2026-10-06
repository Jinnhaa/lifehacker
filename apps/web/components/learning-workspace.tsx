"use client";

import { useActionState, useEffect, useState } from "react";
import {
  createDefaultAllocationAction,
  executeLearningAction,
  materializeAdjustedLearningAction,
  recordCurrentStudyPositionAction,
  saveLearningContextAction,
  saveLearningMaterialAction,
  saveLearningStageAction,
  updateAllocationItemAction,
  updateAllocationPolicyAction
} from "../app/learning/actions";
import type { LearningWorkspaceAction, LearningWorkspaceContext, LearningWorkspaceModel } from "../lib/learning-workspace-types";
import { learningDetailExperience, universitySelfStudyLabel } from "../lib/university-course-reality";

const initial = { status: "idle" as const, message: "" };
const unitLabel = (value: string | null) => value === "LESSON" ? "강" : value === "CHAPTER" ? "챕터" : value ?? "단위";
const stageStatus = (value: string) => value === "COMPLETED" ? "완료" : value === "ACTIVE" ? "진행 중" : "시작 전";
const recoveryLabel = (value: string) => ({ REDISTRIBUTE: "다음 학습일에 나눠 반영", RESET: "다음 날 기본량으로 재시작", CARRY_FORWARD: "다음 학습에 이어서 반영", MANUAL: "직접 조정" }[value] ?? "직접 조정");
const formatDate = (value: string | null) => value ? value.slice(5, 10).replace("-", "/") : "일정 미정";
const dday = (today: string, value: string | null) => {
  if (!value) return "일정 미정";
  const days = Math.ceil((Date.parse(`${value.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return days === 0 ? "D-DAY" : days > 0 ? `D-${days}` : `D+${Math.abs(days)}`;
};
const assessmentLabel = (today: string, assessment: LearningWorkspaceContext["nextAssessment"]) => {
  if (!assessment) return "일정 미정";
  const date = assessment.dueAt ?? assessment.dueDate;
  const time = assessment.dueAt ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(assessment.dueAt)) : formatDate(date);
  return `${dday(today, date)} · ${time}`;
};

function Feedback({ state }: { state: { readonly status: string; readonly message: string } }) {
  return state.message ? <p className={`learning-feedback ${state.status}`} role="status">{state.message}</p> : null;
}

function Brief({ model }: { model: LearningWorkspaceModel }) {
  return <section className="learning-brief" aria-label="Learning Brief">
    <article><small>가장 가까운 일정</small>{model.nearest ? <><strong>{model.nearest.contextTitle}</strong><p>{model.nearest.eventTitle}</p><b>{model.nearest.dateLabel} · {model.nearest.days === 0 ? "D-DAY" : `D-${model.nearest.days}`}</b></> : <p>예정된 일정이 없습니다.</p>}</article>
    <article><small>현재 학기 과목</small><strong>{model.universityCourses.length}개</strong><p>{model.universityTerm ? `${model.universityTerm} Snowboard 기준` : "Snowboard 연결 기준"}</p></article>
    <article className="risk"><small>확인된 학습 위험</small><strong>{model.universityRiskTitles.length}개</strong><p>{model.universityRiskTitles.length ? model.universityRiskTitles.slice(0, 3).join(" · ") : "현재 확인된 위험이 없습니다."}</p></article>
  </section>;
}

function CertificationCard({ context, today, onOpen }: { context: LearningWorkspaceContext; today: string; onOpen: () => void }) {
  return <button type="button" className={`learning-context-card ${context.state}`} onClick={onOpen}>
    <span className="learning-card-kind">CERTIFICATION</span>
    <h3>{context.title}</h3>
    <div className="learning-card-event"><strong>{context.nextAssessment?.title ?? "다음 일정"}</strong><span>{assessmentLabel(today, context.nextAssessment)}</span></div>
    {context.activeStage ? <span className="learning-card-stage">{context.activeStage.title}</span> : null}
    <p>{context.statusLine}</p><b className="learning-state"><i />{context.stateLabel}</b>
  </button>;
}

function UniversityCard({ context, today, onOpen }: { context: LearningWorkspaceContext; today: string; onOpen: () => void }) {
  const reality = context.universityReality!;
  const school = reality.schoolProgress;
  return <button type="button" className="learning-context-card learning-university-card" onClick={onOpen}>
    <span className="learning-card-kind">UNIVERSITY</span><h3>{context.title}</h3>
    <div className="learning-card-event"><strong>{context.nextAssessment?.title ?? "다음 일정 없음"}</strong><span>{assessmentLabel(today, context.nextAssessment)}</span></div>
    <div className="university-card-facts">
      <div><small>수업 현황</small>{school ? <><strong>{school.completedLectureCount} / {school.completedLectureCount + school.remainingLectureCount}</strong><span>남은 영상 {school.remainingLectureMinutes}분 · Snowboard 자동 확인</span></> : <span>Snowboard 진도 확인 전</span>}</div>
      <div><small>내 공부</small><strong>{universitySelfStudyLabel(reality)}</strong>{reality.selfStudy.initialized && reality.selfStudy.totalUnits !== null ? <span>{reality.selfStudy.completedUnits} / {reality.selfStudy.totalUnits}</span> : null}</div>
      <div className="next"><small>NEXT</small>{reality.nextLearningTask ? <><strong>{reality.nextLearningTask.title}</strong><span>{reality.nextLearningTask.estimatedMinutes ? `약 ${reality.nextLearningTask.estimatedMinutes}분` : "Lifehacker Task"}</span></> : <span>{reality.selfStudy.scopeStatus === "NOT_READY" ? "다음 학습 범위를 만들 정보가 아직 없습니다." : !reality.selfStudy.initialized ? "현재 공부 위치를 먼저 알려주세요." : "다음 Learning Task가 아직 없습니다."}</span>}</div>
    </div>
  </button>;
}

function ActionItem({ context, item }: { context: LearningWorkspaceContext; item: LearningWorkspaceAction }) {
  const [state, action, pending] = useActionState(executeLearningAction, initial);
  const [adjustState, adjustAction, adjustPending] = useActionState(materializeAdjustedLearningAction, initial);
  const material = context.materials.find((candidate) => candidate.id === item.materialId);
  const units = Array.from({ length: item.assignedUnits + 1 }, (_, index) => index);
  const bounded = item.startSequence !== null && item.endSequence !== null;
  return <article className="learning-action-item">
    <div><small>{item.kind === "task" ? "진행 중인 Task" : "오늘 제안"}</small><h4>{item.title}</h4></div>
    <div className="learning-action-buttons">
      <form action={action}><ActionHidden context={context} item={item} /><button name="outcome" value="COMPLETED" disabled={pending}>완료</button></form>
      <details><summary>일부만 함</summary><div className="learning-partial"><strong>어디까지 했나요?</strong>{bounded
        ? units.slice(1, -1).map((count) => <form action={action} key={count}><ActionHidden context={context} item={item} /><input type="hidden" name="assignedUnits" value={item.assignedUnits} /><input type="hidden" name="completedUnits" value={count} /><button name="outcome" value="PARTIAL" disabled={pending}>{item.startSequence! + count - 1}{unitLabel(material?.unitType ?? null)}</button></form>)
        : units.map((count) => <form action={action} key={count}><ActionHidden context={context} item={item} /><input type="hidden" name="assignedUnits" value={item.assignedUnits} /><input type="hidden" name="completedUnits" value={count} /><button name="outcome" value="PARTIAL" disabled={pending}>{count}{unitLabel(material?.unitType ?? null)}</button></form>)}</div></details>
      {item.kind === "proposal" ? <details><summary>오늘만 조정</summary><form action={adjustAction} className="learning-adjust-form">
        <input type="hidden" name="contextId" value={context.id} /><input type="hidden" name="materialId" value={item.materialId} />
        <label>{material?.title ?? "학습량"}<input name="units" type="number" min="1" step="1" defaultValue={item.assignedUnits} /></label>
        <button disabled={adjustPending}>오늘만 적용</button><button type="button" className="text-button" onClick={() => document.getElementById(`learning-settings-${context.id}`)?.scrollIntoView()}>기본 학습량 변경</button>
      </form></details> : null}
      <form action={action}><ActionHidden context={context} item={item} /><button className="quiet" name="outcome" value="SKIPPED" disabled={pending}>건너뛰기</button></form>
      <details className="learning-why"><summary>왜?</summary><div><strong>왜 이 학습인가요?</strong><dl><div><dt>현재 단계</dt><dd>{context.activeStage?.title ?? "확인 필요"}</dd></div><div><dt>적용 정책</dt><dd>{item.policyName ?? (item.source === "TODAY_ONLY_OVERRIDE" ? "오늘만 조정" : "결정 규칙")}</dd></div><div><dt>오늘 범위</dt><dd>{item.title.replace(material?.title ?? "", "").trim()}</dd></div></dl></div></details>
    </div><Feedback state={state} /><Feedback state={adjustState} />
  </article>;
}

function ActionHidden({ context, item }: { context: LearningWorkspaceContext; item: LearningWorkspaceAction }) {
  return <><input type="hidden" name="contextId" value={context.id} /><input type="hidden" name="materialId" value={item.materialId} /><input type="hidden" name="taskId" value={item.taskId ?? ""} /><input type="hidden" name="targetId" value={item.targetId ?? ""} /></>;
}

function StateColumn({ context, today }: { context: LearningWorkspaceContext; today: string }) {
  return <aside className="learning-state-column">
    <section><small>PROGRESS</small><h3>진도</h3>{context.materials.length ? context.materials.map((material) => <article className="learning-progress-row" key={material.id}>
      <div><strong>{material.title}</strong><span>{stageStatus(material.state)}</span></div>
      {material.progressPercent === null ? <p>총 분량 미정</p> : <><div className="learning-progress-track"><i style={{ width: `${material.progressPercent}%` }} /></div><p>{material.completedUnits} / {material.totalScopedUnits}{unitLabel(material.unitType)}</p></>}
    </article>) : <p className="learning-empty">학습 자료가 아직 없습니다.</p>}</section>
    <section><small>FORECAST</small><h3>예상</h3><strong>{context.forecastLabel}</strong><p>{context.forecastDetail}</p></section>
    <section><small>LEARNING STATE</small><h3>학습 상태</h3>{context.materials.length ? context.materials.map((material) => <div className="learning-dimensions" key={material.id}><strong>{material.title}</strong><dl><div><dt>Exposure</dt><dd>{material.exposure}</dd></div><div><dt>Understanding</dt><dd>{material.understanding}</dd></div><div><dt>Validation</dt><dd>{material.validation}</dd></div></dl></div>) : <p className="learning-empty">기록할 학습 자료가 필요합니다.</p>}</section>
    <section><small>SCHEDULE</small><h3>다음 일정</h3>{context.nextAssessment ? <><strong>{context.nextAssessment.title}</strong><p>{assessmentLabel(today, context.nextAssessment)}</p></> : <p>일정 미정</p>}</section>
  </aside>;
}

function Activity({ context }: { context: LearningWorkspaceContext }) {
  const activeDates = new Set(context.activity.map((item) => item.occurredAt.slice(0, 10)));
  return <section className="learning-secondary-view"><header><small>ACTIVITY</small><h3>활동 기록</h3><p>활동 일관성을 보여주며 이해도나 숙련도를 뜻하지 않습니다.</p></header>
    <div className="learning-heatmap" aria-label="최근 활동일">{Array.from({ length: 28 }, (_, index) => { const date = new Date(Date.now() - (27 - index) * 86_400_000).toISOString().slice(0, 10); return <i className={activeDates.has(date) ? "active" : ""} title={date} key={date} />; })}</div>
    <div className="learning-activity-list">{context.activity.length ? context.activity.map((item) => <article key={`${item.id}:${item.label}`}><time>{item.occurredAt.slice(0, 10)}</time><strong>{item.label}</strong><span>{item.detail}</span></article>) : <p>아직 기록된 활동이 없습니다.</p>}</div>
  </section>;
}

function PositionCorrection({ context }: { context: LearningWorkspaceContext }) {
  const reality = context.universityReality!;
  const [state, action, pending] = useActionState(recordCurrentStudyPositionAction, initial);
  if (reality.selfStudy.scopeStatus === "NOT_READY" || !reality.selfStudy.materialId) {
    return <div className="university-position-empty"><strong>현재 위치 미설정</strong><p>현재 위치를 연결할 학습 범위가 아직 없습니다.</p></div>;
  }
  return <form action={action} className="university-position-form">
    <input type="hidden" name="contextId" value={context.id} />
    <input type="hidden" name="materialId" value={reality.selfStudy.materialId} />
    <label>현재 실제 공부 위치<select name="throughSequence" defaultValue={reality.selfStudy.currentPositionSequence ?? 0}>
      <option value="0">시작 전</option>{reality.selfStudy.positionOptions.map((option) => <option value={option.sequenceNo} key={option.sequenceNo}>{option.label}</option>)}
    </select></label>
    <button disabled={pending}>{reality.selfStudy.initialized ? "현재 위치 수정" : "이 위치까지 공부함"}</button>
    <Feedback state={state} />
  </form>;
}

function UniversityTaskAction({ context, item }: { context: LearningWorkspaceContext; item: LearningWorkspaceAction }) {
  const [state, action, pending] = useActionState(executeLearningAction, initial);
  const units = Array.from({ length: item.assignedUnits + 1 }, (_, index) => index);
  return <div className="university-task-action"><strong>{item.title}</strong>
    {item.estimatedMinutes ? <span>예상 {item.estimatedMinutes}분</span> : null}
    <div><form action={action}><ActionHidden context={context} item={item} /><button name="outcome" value="COMPLETED" disabled={pending}>완료</button></form>
      {item.startSequence !== null && item.assignedUnits > 1 ? <details><summary>일부만 함</summary><div className="learning-partial">{units.slice(1, -1).map((count) => <form action={action} key={count}><ActionHidden context={context} item={item} /><input type="hidden" name="assignedUnits" value={item.assignedUnits} /><input type="hidden" name="completedUnits" value={count} /><button name="outcome" value="PARTIAL" disabled={pending}>{item.startSequence! + count - 1}까지</button></form>)}</div></details> : null}
    </div><Feedback state={state} />
  </div>;
}

function UniversityCurrent({ context, today }: { context: LearningWorkspaceContext; today: string }) {
  const reality = context.universityReality!;
  const school = reality.schoolProgress;
  const nextAction = context.actions.find((item) => item.kind === "task" && item.taskId === reality.nextLearningTask?.taskId) ?? null;
  return <section className="university-current-view">
    <article><header><small>SCHOOL</small><h3>수업 현황</h3><span>Snowboard에서 자동 확인</span></header>{school ? <><strong>{school.completedLectureCount} / {school.completedLectureCount + school.remainingLectureCount} 완료</strong><p>남은 영상 약 {school.remainingLectureMinutes}분</p></> : <p>아직 Snowboard 수업 진도를 확인하지 못했습니다.</p>}</article>
    <article><header><small>MY STUDY</small><h3>내 공부</h3></header>{reality.selfStudy.initialized ? <><strong>{reality.selfStudy.currentPositionSequence === 0 ? "아직 시작 전" : `${universitySelfStudyLabel(reality)}까지 공부함`}</strong><PositionCorrection context={context} /></> : <><p>현재 공부 위치를 아직 알려주지 않았어요.</p><PositionCorrection context={context} /></>}</article>
    <article><header><small>GAP</small><h3>격차</h3></header>{reality.gap.status === "behind" && reality.gap.unitsBehind !== null ? <strong>수업보다 {reality.gap.unitsBehind}개 범위 뒤처져 있어요.</strong> : reality.gap.status === "caught_up" ? <strong>현재 수업 범위를 따라가고 있어요.</strong> : <p>아직 수업 진도와 내 공부 범위를 직접 비교할 수 없어요.</p>}</article>
    <article><header><small>NEXT</small><h3>다음 할 일</h3></header>{nextAction ? <UniversityTaskAction context={context} item={nextAction} /> : <p>{reality.selfStudy.scopeStatus === "NOT_READY" ? "다음 학습 범위를 만들 수 있는 정보가 아직 없습니다." : !reality.selfStudy.initialized ? "현재 공부 위치를 먼저 알려주세요." : "다음 Learning Task가 아직 없습니다."}</p>}</article>
    <article><header><small>SCHEDULE</small><h3>다음 일정</h3></header>{context.nextAssessment ? <><strong>{context.nextAssessment.title}</strong><p>{assessmentLabel(today, context.nextAssessment)}</p></> : <p>예정된 평가 일정이 없습니다.</p>}</article>
  </section>;
}

function CourseInfo({ context }: { context: LearningWorkspaceContext }) {
  return <section className="learning-secondary-view university-course-info"><header><small>COURSE</small><h3>과목 정보</h3><p>학교 정보와 내 현재 공부 위치만 관리합니다.</p></header>
    <dl><div><dt>과목</dt><dd>{context.title}</dd></div><div><dt>학기</dt><dd>{context.term ?? "미정"}</dd></div><div><dt>목표 성적</dt><dd>{context.target ?? "설정 안 함"}</dd></div><div><dt>학교 연결</dt><dd>{context.universityReality?.snowboardCourseId ? "Snowboard 자동 연결" : "연결 확인 필요"}</dd></div></dl>
    <h4>현재 공부 위치</h4><PositionCorrection context={context} />
  </section>;
}

function Settings({ context }: { context: LearningWorkspaceContext }) {
  const [contextState, contextAction, contextPending] = useActionState(saveLearningContextAction, initial);
  const [stageState, stageAction, stagePending] = useActionState(saveLearningStageAction, initial);
  const [materialState, materialAction, materialPending] = useActionState(saveLearningMaterialAction, initial);
  const [policyState, policyAction, policyPending] = useActionState(updateAllocationItemAction, initial);
  const [policyModeState, policyModeAction, policyModePending] = useActionState(updateAllocationPolicyAction, initial);
  const [newPolicyState, newPolicyAction, newPolicyPending] = useActionState(createDefaultAllocationAction, initial);
  return <section className="learning-secondary-view learning-settings" id={`learning-settings-${context.id}`}><header><small>SETTINGS</small><h3>학습 설정</h3><p>현재 위치와 일일 운영 기준을 사람의 언어로 관리합니다.</p></header>
    <details open><summary>기본 정보</summary><form action={contextAction} className="learning-form"><input type="hidden" name="intent" value="update" /><input type="hidden" name="kind" value={context.kind} /><input type="hidden" name="contextId" value={context.id} />
      <input type="hidden" name="strategicImportance" value={context.strategicImportance ?? ""} /><input type="hidden" name="commitmentLevel" value={context.commitmentLevel ?? ""} /><input type="hidden" name="startDate" value={context.startDate ?? ""} /><input type="hidden" name="endDate" value={context.endDate ?? ""} />
      <label>이름<input name="title" defaultValue={context.title} required /></label>{context.kind === "course" ? <><input type="hidden" name="instructor" value={context.instructor ?? ""} /><label>학기<input name="term" defaultValue={context.term ?? ""} /></label><label>목표 성적<input name="targetGrade" defaultValue={context.target ?? ""} /></label></> : <><input type="hidden" name="studyMode" value={context.studyMode ?? ""} /><input type="hidden" name="currentLevel" value={context.currentLevel ?? ""} /><label>시험일<input type="date" name="examDate" defaultValue={context.nextAssessment?.dueDate ?? ""} /></label><label>성공 목표<input name="targetOutcome" defaultValue={context.target ?? ""} /></label></>}<button disabled={contextPending}>저장</button></form><Feedback state={contextState} /></details>
    <details><summary>단계와 현재 위치</summary><div className="learning-settings-list">{context.stages.map((stage) => <span key={stage.id}><b>{stage.position}. {stage.title}</b>{stageStatus(stage.status)}</span>)}</div><form action={stageAction} className="learning-form"><input type="hidden" name="contextId" value={context.id} /><label>단계 이름<input name="title" required /></label><label>순서<input type="number" name="position" min="1" defaultValue={context.stages.length + 1} required /></label><label>완료 기준<select name="completionMode" defaultValue="MANUAL"><option value="MANUAL">직접 완료 확인</option><option value="ALL_REQUIRED_MATERIALS">필수 자료 모두 완료</option><option value="ASSESSMENT_THRESHOLD">평가 기준 통과</option></select></label><button disabled={stagePending}>+ 학습 단계</button></form><Feedback state={stageState} /></details>
    <details><summary>학습 자료</summary><div className="learning-settings-list">{context.materials.map((material) => <span key={material.id}><b>{material.title}</b>{material.totalScopedUnits === null ? "총 분량 미정" : `${material.totalScopedUnits}${unitLabel(material.unitType)}`}</span>)}</div><form action={materialAction} className="learning-form"><input type="hidden" name="contextId" value={context.id} /><label>자료 이름<input name="title" required /></label><label>자료 유형<input name="materialType" placeholder="교재, 앱, 강의" required /></label><label>단위<input name="unitType" placeholder="LESSON, CHAPTER" /></label><label>전체 범위 끝<input type="number" name="totalUnits" min="1" /></label><label>시작 위치<input type="number" name="startUnit" min="1" /></label><label>학습 단계<select name="stageId" defaultValue=""><option value="">연결 안 함</option>{context.stages.map((stage) => <option value={stage.id} key={stage.id}>{stage.title}</option>)}</select></label><button disabled={materialPending}>+ 학습 자료</button></form><Feedback state={materialState} /></details>
    <details><summary>학습량과 밀린 학습 처리</summary>{context.policies.length ? context.policies.map((policy) => <article className="learning-policy" key={policy.id}><header><strong>{policy.profileType === "normal" ? "기본 학습량" : policy.name}</strong><span>{recoveryLabel(policy.recoveryMode)}</span></header><form action={policyModeAction}><input type="hidden" name="policyId" value={policy.id} /><label>밀린 학습 처리<select name="recoveryMode" defaultValue={policy.recoveryMode}><option value="REDISTRIBUTE">다음 학습일에 나눠 반영</option><option value="RESET">다음 날 기본량으로 재시작</option><option value="CARRY_FORWARD">다음 학습에 이어서 반영</option><option value="MANUAL">직접 조정</option></select></label><button disabled={policyModePending}>변경</button></form>{policy.items.map((item) => <form action={policyAction} key={item.id}><input type="hidden" name="itemId" value={item.id} /><label>{item.materialTitle}<input type="number" min="1" name="targetUnits" defaultValue={item.targetUnits} /></label><button disabled={policyPending}>수정</button></form>)}</article>) : <p>설정된 일일 학습량이 없습니다.</p>}{context.materials.filter((material) => !context.policies.some((policy) => policy.items.some((item) => item.materialId === material.id))).map((material) => <form action={newPolicyAction} className="learning-form" key={material.id}><input type="hidden" name="contextId" value={context.id} /><input type="hidden" name="materialId" value={material.id} /><label>{material.title} 기본 학습량<input type="number" name="targetUnits" min="1" defaultValue="1" /></label><button disabled={newPolicyPending}>추가</button></form>)}<Feedback state={policyModeState} /><Feedback state={policyState} /><Feedback state={newPolicyState} /></details>
  </section>;
}

function CertificationModal({ context, today, onClose }: { context: LearningWorkspaceContext; today: string; onClose: () => void }) {
  const [view, setView] = useState<"default" | "activity" | "settings">("default");
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [onClose]);
  return <div className="learning-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="learning-modal" role="dialog" aria-modal="true" aria-labelledby="learning-modal-title">
    <header><div><small>CERTIFICATION</small><h2 id="learning-modal-title">{context.title}</h2></div><span>{context.activeStage?.title ?? "단계 확인 필요"}</span><b>{assessmentLabel(today, context.nextAssessment)}</b><button type="button" onClick={onClose} aria-label="닫기">×</button></header>
    <nav><button className={view === "default" ? "active" : ""} onClick={() => setView("default")}>오늘 학습</button><button className={view === "activity" ? "active" : ""} onClick={() => setView("activity")}>활동 기록</button><button className={view === "settings" ? "active" : ""} onClick={() => setView("settings")}>학습 설정</button></nav>
    <div className="learning-modal-scroll">{view === "default" ? <div className="learning-modal-grid"><main><small>ACTION</small><h3>오늘 학습</h3>{context.actions.length ? context.actions.map((item) => <ActionItem context={context} item={item} key={`${item.kind}:${item.materialId}`} />) : <div className="learning-no-action"><strong>오늘 실행할 학습을 확정할 수 없습니다.</strong><p>학습 단계, 자료 분량 또는 기본 학습량을 확인해 주세요.</p><button type="button" onClick={() => setView("settings")}>학습 설정 열기</button></div>}</main><StateColumn context={context} today={today} /></div> : view === "activity" ? <Activity context={context} /> : <Settings context={context} />}</div>
  </section></div>;
}

function UniversityModal({ context, today, onClose }: { context: LearningWorkspaceContext; today: string; onClose: () => void }) {
  const [view, setView] = useState<"current" | "activity" | "info">("current");
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [onClose]);
  return <div className="learning-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="learning-modal university-modal" role="dialog" aria-modal="true" aria-labelledby="university-modal-title">
    <header><div><small>UNIVERSITY</small><h2 id="university-modal-title">{context.title}</h2></div><span>{context.term ?? "현재 학기"}</span><b>{assessmentLabel(today, context.nextAssessment)}</b><button type="button" onClick={onClose} aria-label="닫기">×</button></header>
    <nav><button className={view === "current" ? "active" : ""} onClick={() => setView("current")}>현재 상태</button><button className={view === "activity" ? "active" : ""} onClick={() => setView("activity")}>활동 기록</button><button className={view === "info" ? "active" : ""} onClick={() => setView("info")}>과목 정보</button></nav>
    <div className="learning-modal-scroll">{view === "current" ? <UniversityCurrent context={context} today={today} /> : view === "activity" ? <Activity context={context} /> : <CourseInfo context={context} />}</div>
  </section></div>;
}

function CreateContextModal({ onClose }: { onClose: () => void }) {
  const [state, action, pending] = useActionState(saveLearningContextAction, initial);
  return <div className="learning-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}><section className="learning-create-modal" role="dialog" aria-modal="true"><header><div><small>NEW CERTIFICATION</small><h2>자격증 추가</h2></div><button onClick={onClose}>×</button></header><form action={action} className="learning-form"><input type="hidden" name="intent" value="create" /><input type="hidden" name="kind" value="certification" /><label>이름<input name="title" required autoFocus /></label><label>시험일 (선택)<input type="date" name="examDate" /></label><label>성공 목표 (선택)<input name="targetOutcome" /></label><button disabled={pending}>추가</button></form><Feedback state={state} /></section></div>;
}

export function LearningWorkspace({ model }: { model: LearningWorkspaceModel }) {
  const [selectedId, setSelectedId] = useState<string | null>(null); const [creating, setCreating] = useState(false);
  const selected = [...model.courses, ...model.certifications].find((context) => context.id === selectedId) ?? null;
  return <main className="learning-shell"><header className="learning-top"><div><img src="/assets/lifehacker/lifehacker-logo.png" alt="Lifehacker" /><div><small>LEARNING ROOM</small><h1>Learning</h1></div></div><button onClick={() => setCreating(true)}>+ 자격증</button></header>
    {!model.configured ? <section className="learning-error"><strong>Learning workspace를 연결할 수 없습니다.</strong><p>{model.error}</p></section> : <><Brief model={model} /><ContextSection title={`University${model.universityTerm ? ` · ${model.universityTerm}` : ""}`} eyebrow="COURSES" contexts={model.universityCourses} today={model.today} onOpen={(context) => setSelectedId(context.id)} /><CourseDiagnostics model={model} /><ContextSection title="Certifications" eyebrow="CERTIFICATES" contexts={model.certifications} today={model.today} onOpen={(context) => setSelectedId(context.id)} /></>}
    {selected ? learningDetailExperience(selected.kind) === "university_reality" ? <UniversityModal context={selected} today={model.today} onClose={() => setSelectedId(null)} /> : <CertificationModal context={selected} today={model.today} onClose={() => setSelectedId(null)} /> : null}{creating ? <CreateContextModal onClose={() => setCreating(false)} /> : null}
  </main>;
}

function ContextSection({ title, eyebrow, contexts, today, onOpen }: { title: string; eyebrow: string; contexts: readonly LearningWorkspaceContext[]; today: string; onOpen: (context: LearningWorkspaceContext) => void }) {
  return <section className="learning-context-section"><header><div><small>{eyebrow}</small><h2>{title}</h2></div><span>{contexts.length}</span></header><div className="learning-context-grid">{contexts.map((context) => context.kind === "course" ? <UniversityCard context={context} today={today} onOpen={() => onOpen(context)} key={context.id} /> : <CertificationCard context={context} today={today} onOpen={() => onOpen(context)} key={context.id} />)}</div></section>;
}

function CourseDiagnostics({ model }: { model: LearningWorkspaceModel }) {
  if (!model.courseDiagnostics.length) return null;
  return <details className="university-diagnostics"><summary>연결 확인 필요 {model.courseDiagnostics.length}</summary><ul>{model.courseDiagnostics.map((item) => <li key={item.workContextId}><strong>{item.title}</strong><span>{item.reason === "legacy_duplicate" ? "Snowboard 과목과 중복된 기존 기록" : item.reason === "duplicate_snowboard_course" ? "같은 현재 학기 과목의 다른 Snowboard 섹션" : item.reason === "not_current_snowboard_course" ? "이전 학기 Snowboard 과목" : "현재 학기 Snowboard 과목으로 연결되지 않음"}</span></li>)}</ul></details>;
}
