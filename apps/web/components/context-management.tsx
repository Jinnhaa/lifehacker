"use client";

import { useActionState } from "react";
import { saveLearningContextAction } from "../app/learning/actions";
import { saveProjectContextAction } from "../app/projects/actions";
import type {
  ContextActionState,
  LearningContextsViewModel,
  ProjectContextsViewModel
} from "../lib/context-management-types";

const initialState: ContextActionState = { status: "idle", message: "" };
const show = (value: string | number | null | undefined): string => value === null || value === undefined || value === "" ? "—" : String(value);

interface CommonFieldsProps {
  readonly context?: LearningContextsViewModel["courses"][number] | LearningContextsViewModel["certifications"][number] | ProjectContextsViewModel["projects"][number];
  readonly project?: boolean;
}

function CommonFields({ context, project = false }: CommonFieldsProps) {
  return <>
    <label>제목<input name="title" required maxLength={300} defaultValue={context?.title ?? ""} /></label>
    {project ? <label className="context-span">설명<textarea name="description" defaultValue={context?.description ?? ""} /></label> : null}
    <label>전략 중요도<select name="strategicImportance" defaultValue={context?.strategicImportance ?? ""}>
      <option value="">선택 안 함</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
    </select></label>
    <label>Commitment<select name="commitmentLevel" defaultValue={context?.commitmentLevel ?? ""}>
      <option value="">선택 안 함</option><option value="REQUIRED">Required</option><option value="IMPORTANT">Important</option><option value="OPTIONAL">Optional</option>
    </select></label>
    <label>시작일<input type="date" name="startDate" defaultValue={context?.startDate ?? ""} /></label>
    <label>종료일<input type="date" name="endDate" defaultValue={context?.endDate ?? ""} /></label>
    <label>내부 시작일<input type="date" name="internalStartDate" defaultValue={context?.internalStartDate ?? ""} /></label>
  </>;
}

function Feedback({ state }: { readonly state: ContextActionState }) {
  return state.status === "idle" ? null : <p className={`context-feedback ${state.status}`} role="status">{state.message}</p>;
}

function ArchiveForm({ id, kind, action }: { readonly id: string; readonly kind: string; readonly action: (data: FormData) => void }) {
  return <form action={action} className="context-archive-form">
    <input type="hidden" name="intent" value="archive" /><input type="hidden" name="contextId" value={id} /><input type="hidden" name="kind" value={kind} />
    <button type="submit" className="context-muted-button">보관</button>
  </form>;
}

export function LearningContextManager({ model }: { readonly model: LearningContextsViewModel }) {
  const [state, action, pending] = useActionState(saveLearningContextAction, initialState);
  return <div className="context-manager">
    <Feedback state={state} />
    {!model.configured ? <p className="context-feedback error">데이터베이스 연결 설정이 필요합니다.</p> : null}
    {model.error ? <p className="context-feedback error">{model.error}</p> : null}
    <section className="context-create-grid">
      <details className="context-editor" open><summary>Course 추가</summary><form action={action} className="context-form">
        <input type="hidden" name="intent" value="create" /><input type="hidden" name="kind" value="course" />
        <CommonFields /><label>목표 성적<input name="targetGrade" /></label><label>학기<input name="term" /></label><label>담당자<input name="instructor" /></label>
        <button disabled={pending}>Course 저장</button>
      </form></details>
      <details className="context-editor"><summary>Certification 추가</summary><form action={action} className="context-form">
        <input type="hidden" name="intent" value="create" /><input type="hidden" name="kind" value="certification" />
        <CommonFields /><label>목표 결과<input name="targetOutcome" /></label><label>시험일<input type="date" name="examDate" /></label>
        <label>학습 방식<select name="studyMode" defaultValue=""><option value="">선택 안 함</option><option value="CUMULATIVE">Cumulative</option><option value="MIXED">Mixed</option><option value="CRAMMABLE">Crammable</option></select></label>
        <label>현재 수준<input name="currentLevel" /></label><button disabled={pending}>Certification 저장</button>
      </form></details>
    </section>
    <section className="context-section"><header><h2>Courses</h2><span>{model.courses.length}</span></header>
      <div className="context-card-grid">{model.courses.map((context) => <article className="context-card" key={context.id}>
        <h3>{context.title}</h3><dl><div><dt>전략 중요도</dt><dd>{show(context.strategicImportance)}</dd></div><div><dt>Commitment</dt><dd>{show(context.commitmentLevel)}</dd></div><div><dt>공식 시작</dt><dd>{show(context.startDate)}</dd></div><div><dt>내부 시작</dt><dd>{show(context.internalStartDate)}</dd></div><div><dt>목표 성적</dt><dd>{show(context.targetGrade)}</dd></div></dl>
        <details className="context-editor"><summary>수정</summary><form action={action} className="context-form">
          <input type="hidden" name="intent" value="update" /><input type="hidden" name="kind" value="course" /><input type="hidden" name="contextId" value={context.id} />
          <CommonFields context={context} /><label>목표 성적<input name="targetGrade" defaultValue={context.targetGrade ?? ""} /></label><label>학기<input name="term" defaultValue={context.term ?? ""} /></label><label>담당자<input name="instructor" defaultValue={context.instructor ?? ""} /></label><button disabled={pending}>변경 저장</button>
        </form></details><ArchiveForm id={context.id} kind="course" action={action} />
      </article>)}</div>
    </section>
    <section className="context-section"><header><h2>Certifications</h2><span>{model.certifications.length}</span></header>
      <div className="context-card-grid">{model.certifications.map((context) => <article className="context-card" key={context.id}>
        <h3>{context.title}</h3><dl><div><dt>전략 중요도</dt><dd>{show(context.strategicImportance)}</dd></div><div><dt>Commitment</dt><dd>{show(context.commitmentLevel)}</dd></div><div><dt>내부 시작</dt><dd>{show(context.internalStartDate)}</dd></div><div><dt>시험일</dt><dd>{show(context.examDate)}</dd></div><div><dt>목표</dt><dd>{show(context.targetOutcome)}</dd></div><div><dt>학습 방식</dt><dd>{show(context.studyMode)}</dd></div><div><dt>현재 수준</dt><dd>{show(context.currentLevel)}</dd></div></dl>
        <details className="context-editor"><summary>수정</summary><form action={action} className="context-form">
          <input type="hidden" name="intent" value="update" /><input type="hidden" name="kind" value="certification" /><input type="hidden" name="contextId" value={context.id} />
          <CommonFields context={context} /><label>목표 결과<input name="targetOutcome" defaultValue={context.targetOutcome ?? ""} /></label><label>시험일<input type="date" name="examDate" defaultValue={context.examDate ?? ""} /></label><label>학습 방식<select name="studyMode" defaultValue={context.studyMode ?? ""}><option value="">선택 안 함</option><option value="CUMULATIVE">Cumulative</option><option value="MIXED">Mixed</option><option value="CRAMMABLE">Crammable</option></select></label><label>현재 수준<input name="currentLevel" defaultValue={context.currentLevel ?? ""} /></label><button disabled={pending}>변경 저장</button>
        </form></details><ArchiveForm id={context.id} kind="certification" action={action} />
      </article>)}</div>
    </section>
  </div>;
}

export function ProjectContextManager({ model }: { readonly model: ProjectContextsViewModel }) {
  const [state, action, pending] = useActionState(saveProjectContextAction, initialState);
  return <div className="context-manager"><Feedback state={state} />
    {!model.configured ? <p className="context-feedback error">데이터베이스 연결 설정이 필요합니다.</p> : null}{model.error ? <p className="context-feedback error">{model.error}</p> : null}
    <details className="context-editor" open><summary>Project 추가</summary><ProjectForm action={action} pending={pending} /></details>
    <section className="context-section"><header><h2>Active Projects</h2><span>{model.projects.length}</span></header><div className="context-card-grid">
      {model.projects.map((context) => <article className="context-card" key={context.id}><h3>{context.title}</h3>{context.description ? <p>{context.description}</p> : null}<dl><div><dt>전략 중요도</dt><dd>{show(context.strategicImportance)}</dd></div><div><dt>Commitment</dt><dd>{show(context.commitmentLevel)}</dd></div><div><dt>공식 시작</dt><dd>{show(context.startDate)}</dd></div><div><dt>공식 종료</dt><dd>{show(context.endDate)}</dd></div><div><dt>내부 시작</dt><dd>{show(context.internalStartDate)}</dd></div><div><dt>유형</dt><dd>{show(context.strategyConfig.projectType)}</dd></div><div><dt>검토 주기</dt><dd>{context.strategyConfig.reviewCadenceDays ? `${context.strategyConfig.reviewCadenceDays}일` : "—"}</dd></div><div><dt>교체 가능</dt><dd>{context.strategyConfig.displaceable ? "예" : "아니오"}</dd></div></dl>
        <details className="context-editor"><summary>수정</summary><ProjectForm action={action} pending={pending} context={context} /></details><ArchiveForm id={context.id} kind="project" action={action} />
      </article>)}</div></section>
  </div>;
}

function ProjectForm({ action, pending, context }: { readonly action: (data: FormData) => void; readonly pending: boolean; readonly context?: ProjectContextsViewModel["projects"][number] }) {
  return <form action={action} className="context-form"><input type="hidden" name="intent" value={context ? "update" : "create"} /><input type="hidden" name="contextId" value={context?.id ?? ""} />
    <CommonFields context={context} project /><label>프로젝트 유형<select name="projectType" defaultValue={context?.strategyConfig.projectType ?? ""}><option value="">선택 안 함</option><option value="SPRINT">Sprint</option><option value="ONGOING">Ongoing</option><option value="PERSONAL">Personal</option></select></label><label>검토 주기(일)<input type="number" min={1} step={1} name="reviewCadenceDays" defaultValue={context?.strategyConfig.reviewCadenceDays ?? ""} /></label><label className="context-checkbox"><input type="checkbox" name="displaceable" defaultChecked={context?.strategyConfig.displaceable ?? false} /> 다른 우선순위로 교체 가능</label><button disabled={pending}>{context ? "변경 저장" : "Project 저장"}</button>
  </form>;
}
