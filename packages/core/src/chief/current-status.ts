import { getDaysUntilDeadline } from "../rules/deadline.js";
import type { MorningObservation, MorningRecurringActivity, MorningStrategicDirective } from "../morning/morning.js";

export type AssessmentReadiness = "NOT_STARTED" | "IN_PROGRESS" | "READY" | "UNKNOWN";
export type CurrentStatusPriorityBand = "P0" | "P1" | "P2" | "P3" | "P4";

export interface CurrentStatusAssessment {
  readonly workContextId: string;
  readonly courseTitle: string;
  readonly title: string;
  readonly type: "quiz" | "exam";
  readonly dueAt: string;
  readonly daysUntil: number;
  readonly readiness: AssessmentReadiness;
  readonly studyEvidenceCount: number;
  readonly focusMinutes: number;
  readonly videoExcluded: boolean;
}

export interface CurrentStatusPriority {
  readonly id: string;
  readonly kind: "task" | "course_study";
  readonly band: CurrentStatusPriorityBand;
  readonly title: string;
  readonly whyNow: string;
  readonly minutes: number;
  readonly taskId: string | null;
  readonly recurringActivityId: string | null;
  readonly occurrenceId: string | null;
  readonly workContextId: string | null;
}

export interface ChiefCurrentStatus {
  readonly version: "chief-current-status-v1";
  readonly observedAt: string;
  readonly planDate: string;
  readonly activeFocus: { readonly taskId: string | null; readonly occurrenceId: string | null; readonly title: string } | null;
  readonly officialDueToday: readonly { readonly taskId: string; readonly title: string; readonly dueAt: string }[];
  readonly internalDeadlineTaskIds: readonly string[];
  readonly carryoverTaskIds: readonly string[];
  readonly assessments: readonly CurrentStatusAssessment[];
  readonly completedTodayCount: number;
  readonly incompleteTodayCount: number;
  readonly remainingCapacityMinutes: number | null;
  readonly approvedPlan: { readonly id: string; readonly revisionNo: number } | null;
  readonly approvedActionTitle: string | null;
  readonly overrides: readonly { readonly id: string; readonly scope: "TODAY" | "PERSISTENT"; readonly text: string }[];
  readonly priorities: readonly CurrentStatusPriority[];
}

type StatusOverride = {
  scope: "TODAY" | "PERSISTENT";
  priorityTaskIds: readonly string[];
  workContextId: string | null;
  excludeVideo: boolean;
  directMaterialStudy: boolean;
};

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : {};

export const readStatusOverride = (directive: MorningStrategicDirective): StatusOverride | null => {
  const value = record(directive.priorityOrder);
  if (value.kind !== "chief_status_override") return null;
  const taskIds = Array.isArray(value.priorityTaskIds)
    ? value.priorityTaskIds.filter((item): item is string => typeof item === "string")
    : [];
  return {
    scope: value.scope === "PERSISTENT" ? "PERSISTENT" : "TODAY",
    priorityTaskIds: taskIds,
    workContextId: typeof value.workContextId === "string" ? value.workContextId : null,
    excludeVideo: value.excludeVideo === true,
    directMaterialStudy: value.directMaterialStudy === true
  };
};

export const courseStudyStrategy = (
  directives: readonly MorningStrategicDirective[],
  workContextId: string
): { excludeVideo: boolean; directMaterialStudy: boolean } => directives.reduce<{ excludeVideo: boolean; directMaterialStudy: boolean }>((result, directive) => {
  const override = readStatusOverride(directive);
  if (!override || override.workContextId !== workContextId) return result;
  return {
    excludeVideo: result.excludeVideo || override.excludeVideo,
    directMaterialStudy: result.directMaterialStudy || override.directMaterialStudy
  };
}, { excludeVideo: false, directMaterialStudy: false });

const localTime = (value: Date, timeZone: string): string => new Intl.DateTimeFormat("ko-KR", {
  timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23"
}).format(value);

const readinessFor = (
  activity: MorningRecurringActivity,
  focusMinutes: number,
  videoExcluded: boolean
): AssessmentReadiness => {
  const explicit = activity.courseStudy?.signals.readiness;
  if (explicit === "NOT_STARTED" || explicit === "IN_PROGRESS" || explicit === "READY" || explicit === "UNKNOWN") return explicit;
  const evidenceCount = activity.completedCount + (focusMinutes > 0 ? 1 : 0);
  if (evidenceCount === 0) return "NOT_STARTED";
  const remainingLectureMinutes = videoExcluded ? 0 : Number(activity.courseStudy?.signals.remainingLectureMinutes ?? 0);
  if (remainingLectureMinutes <= 0 && focusMinutes >= (activity.courseStudy?.todayMinutes ?? activity.expectedMinutes)) return "READY";
  return "IN_PROGRESS";
};

const assessmentFor = (
  activity: MorningRecurringActivity,
  observation: MorningObservation,
  now: Date
): CurrentStatusAssessment | null => {
  const study = activity.courseStudy;
  if (!study) return null;
  const candidates = [
    typeof study.signals.nearestQuizAt === "string" ? {
      type: "quiz" as const,
      title: typeof study.signals.nearestQuizTitle === "string" ? study.signals.nearestQuizTitle : `${activity.title.replace(/ 학습$/, "")} Quiz`,
      dueAt: new Date(study.signals.nearestQuizAt)
    } : null,
    typeof study.signals.nearestExamAt === "string" ? {
      type: "exam" as const,
      title: typeof study.signals.nearestExamTitle === "string" ? study.signals.nearestExamTitle : `${activity.title.replace(/ 학습$/, "")} Exam`,
      dueAt: new Date(study.signals.nearestExamAt)
    } : null
  ].filter((item): item is NonNullable<typeof item> => item !== null && Number.isFinite(item.dueAt.getTime()))
    .flatMap((item) => {
      const days = getDaysUntilDeadline(item.dueAt, now, observation.timeZone);
      return days !== null && days >= 0 ? [{ ...item, days }] : [];
    })
    .sort((left, right) => left.days - right.days);
  const nearest = candidates[0];
  if (!nearest) return null;
  const focus = observation.outcomeEvidence?.focusEvidence?.find((item) => item.workContextId === study.workContextId);
  const strategy = courseStudyStrategy(observation.strategicDirectives, study.workContextId);
  return {
    workContextId: study.workContextId,
    courseTitle: activity.title.replace(/ 학습$/, ""),
    title: nearest.title,
    type: nearest.type,
    dueAt: nearest.dueAt.toISOString(),
    daysUntil: nearest.days,
    readiness: readinessFor(activity, focus?.actualMinutes ?? 0, strategy.excludeVideo),
    studyEvidenceCount: activity.completedCount + (focus?.completedSessions ?? 0),
    focusMinutes: focus?.actualMinutes ?? 0,
    videoExcluded: strategy.excludeVideo
  };
};

export function deriveCurrentStatus(input: {
  readonly observation: MorningObservation;
  readonly now: Date;
  readonly planDate: string;
  readonly remainingCapacityMinutes: number | null;
}): ChiefCurrentStatus {
  const { observation, now, planDate } = input;
  const activeFocusTaskId = observation.outcomeEvidence?.activeFocusTaskId ?? null;
  const legacyActiveFocusTask = observation.tasks.find((task) => task.id === activeFocusTaskId);
  const activeFocus = observation.outcomeEvidence?.activeFocus ?? (legacyActiveFocusTask ? {
    taskId: String(legacyActiveFocusTask.id), occurrenceId: null, title: legacyActiveFocusTask.title
  } : null);
  const officialDueToday = observation.tasks.filter((task) => task.officialDeadline
    && getDaysUntilDeadline(task.officialDeadline, now, observation.timeZone) === 0)
    .sort((left, right) => left.officialDeadline!.getTime() - right.officialDeadline!.getTime())
    .map((task) => ({ taskId: String(task.id), title: task.title, dueAt: task.officialDeadline!.toISOString() }));
  const carryover = new Set(observation.carryoverContext?.taskIds ?? []);
  const overrides = observation.strategicDirectives.flatMap((directive) => {
    const value = readStatusOverride(directive);
    return value ? [{ id: directive.id, scope: value.scope, text: directive.directive }] : [];
  });
  const overrideTaskIds = new Set(observation.strategicDirectives.flatMap((directive) => readStatusOverride(directive)?.priorityTaskIds ?? []));
  const priorities: CurrentStatusPriority[] = [];

  for (const task of observation.tasks) {
    if (task.status === "BLOCKED" || task.status === "WAITING_FOR_USER") continue;
    const officialDays = getDaysUntilDeadline(task.officialDeadline, now, observation.timeZone);
    const internalDays = getDaysUntilDeadline(task.internalDeadline, now, observation.timeZone);
    const minutes = Math.max((task.estimatedUserMinutes ?? task.estimatedMinutes ?? 0) - task.actualMinutes, 0);
    const base = { id: String(task.id), kind: "task" as const, title: task.title, minutes, taskId: String(task.id), recurringActivityId: null, occurrenceId: null, workContextId: task.workContextId };
    if (officialDays === 0) priorities.push({ ...base, band: "P0", whyNow: `오늘 ${localTime(task.officialDeadline!, observation.timeZone)} 마감이라 먼저 끝내는 게 안전해요.` });
    else if (overrideTaskIds.has(task.id)) priorities.push({ ...base, band: "P2", whyNow: "오늘 우선하겠다는 사용자 결정을 반영했어요." });
    else if ((internalDays !== null && internalDays <= 3) || (carryover.has(task.id) && task.importance >= 4)) priorities.push({
      ...base, band: "P2",
      whyNow: carryover.has(task.id) ? "중요한 이월 작업이라 오늘 다시 배치했어요." : "내부 목표일이 가까워 미리 진행해요."
    });
  }

  const assessments = observation.recurringActivities.flatMap((activity) => {
    const assessment = assessmentFor(activity, observation, now);
    if (!assessment) return [];
    if (((assessment.type === "quiz" && assessment.daysUntil <= 7) || (assessment.type === "exam" && assessment.daysUntil <= 21))
      && assessment.readiness !== "READY") {
      priorities.push({
        id: `assessment:${assessment.workContextId}:${assessment.type}`,
        kind: "course_study",
        band: "P1",
        title: `${assessment.title} 준비`,
        whyNow: `${assessment.daysUntil === 0 ? "오늘" : `${assessment.daysUntil}일 뒤`} ${assessment.type === "quiz" ? "퀴즈" : "시험"}인데 준비가 ${assessment.readiness === "NOT_STARTED" ? "아직 시작되지 않아" : "아직 충분하지 않아"} 먼저 배치했어요.`,
        minutes: activity.courseStudy?.todayMinutes ?? activity.expectedMinutes,
        taskId: null,
        recurringActivityId: activity.id,
        occurrenceId: activity.occurrenceId,
        workContextId: assessment.workContextId
      });
    }
    return [assessment];
  });

  for (const activity of observation.recurringActivities) {
    if (!activity.courseStudy || priorities.some((item) => item.recurringActivityId === activity.id)) continue;
    if (activity.completedCount >= activity.targetCount) continue;
    const strategy = courseStudyStrategy(observation.strategicDirectives, activity.courseStudy.workContextId);
    priorities.push({
      id: `study:${activity.id}`,
      kind: "course_study",
      band: "P3",
      title: strategy.directMaterialStudy ? `${activity.title.replace(/ 학습$/, "")} 교안 직접 학습` : activity.title,
      whyNow: `이번 주 목표까지 ${activity.targetCount - activity.completedCount}회 남아 오늘 ${activity.courseStudy.todayMinutes}분 확보했어요.`,
      minutes: activity.courseStudy.todayMinutes,
      taskId: null,
      recurringActivityId: activity.id,
      occurrenceId: activity.occurrenceId,
      workContextId: activity.courseStudy.workContextId
    });
  }

  const prioritizedTaskIds = new Set(priorities.flatMap((item) => item.taskId ? [item.taskId] : []));
  const incompleteDependencies = observation.outcomeEvidence?.dependencies.filter((edge) => !edge.completed) ?? [];
  for (const task of observation.tasks) {
    if (prioritizedTaskIds.has(String(task.id))) continue;
    const downstream = incompleteDependencies.filter((edge) => edge.prerequisiteTaskId === task.id);
    if (downstream.length === 0) continue;
    const minutes = Math.max((task.estimatedUserMinutes ?? task.estimatedMinutes ?? 0) - task.actualMinutes, 0);
    priorities.push({
      id: String(task.id), kind: "task", band: "P4", title: task.title, minutes,
      taskId: String(task.id), recurringActivityId: null, occurrenceId: null, workContextId: task.workContextId,
      whyNow: `미리 끝내면 뒤의 작업 ${downstream.length}개가 쉬워져요.`
    });
  }

  const bandOrder: Record<CurrentStatusPriorityBand, number> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 };
  priorities.sort((left, right) => bandOrder[left.band] - bandOrder[right.band]
    || Number(overrideTaskIds.has(right.taskId ?? "")) - Number(overrideTaskIds.has(left.taskId ?? ""))
    || left.title.localeCompare(right.title, "ko-KR"));

  return {
    version: "chief-current-status-v1",
    observedAt: now.toISOString(),
    planDate,
    activeFocus,
    officialDueToday,
    internalDeadlineTaskIds: observation.tasks.filter((task) => {
      const days = getDaysUntilDeadline(task.internalDeadline, now, observation.timeZone);
      return days !== null && days <= 3;
    }).map((task) => String(task.id)),
    carryoverTaskIds: [...carryover],
    assessments,
    completedTodayCount: observation.outcomeEvidence?.completedTodayCount ?? 0,
    incompleteTodayCount: new Set([
      ...(observation.outcomeEvidence?.plannedTodayTaskIds ?? []),
      ...officialDueToday.map((task) => task.taskId),
      ...carryover
    ]).size,
    remainingCapacityMinutes: input.remainingCapacityMinutes,
    approvedPlan: observation.outcomeEvidence?.approvedPlan ?? null,
    approvedActionTitle: observation.outcomeEvidence?.approvedAction?.title ?? null,
    overrides,
    priorities
  };
}
