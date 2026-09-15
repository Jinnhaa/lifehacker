import { getDaysUntilDeadline } from "../rules/deadline.js";

export interface CourseStudyAssessmentSignal {
  readonly type: "assignment" | "quiz" | "exam";
  readonly title: string;
  readonly dueAt: Date;
  readonly completed: boolean;
}

export interface CourseStudySignal {
  readonly workContextId: string;
  readonly courseId: string;
  readonly title: string;
  readonly remainingLectureCount: number;
  readonly remainingLectureMinutes: number;
  readonly completedLectureCount: number;
  readonly assessments: readonly CourseStudyAssessmentSignal[];
}

export interface CourseStudyRecommendation {
  readonly workContextId: string;
  readonly courseId: string;
  readonly title: string;
  readonly weeklyMinutes: number;
  readonly todayMinutes: number;
  readonly priorityRank: 0 | 1 | 2 | 3 | 4;
  readonly reasons: readonly string[];
  readonly signals: {
    readonly remainingLectureCount: number;
    readonly remainingLectureMinutes: number;
    readonly nearestQuizAt: string | null;
    readonly nearestExamAt: string | null;
    readonly upcomingAssignmentCount: number;
    readonly overdueAssignmentCount: number;
  };
}

const roundUp = (minutes: number): number => Math.ceil(minutes / 15) * 15;

export function calculateCourseStudyRecommendations(input: {
  readonly courses: readonly CourseStudySignal[];
  readonly now: Date;
  readonly timeZone: string;
  readonly localWeekday: number;
}): readonly CourseStudyRecommendation[] {
  const daysLeft = Math.max(1, 8 - input.localWeekday);
  return input.courses.map((course) => {
    const open = course.assessments.filter((assessment) => !assessment.completed);
    const quizzes = open.filter((assessment) => assessment.type === "quiz")
      .map((assessment) => ({ assessment, days: getDaysUntilDeadline(assessment.dueAt, input.now, input.timeZone) ?? Number.MAX_SAFE_INTEGER }))
      .filter((value) => value.days >= 0).sort((left, right) => left.days - right.days);
    const exams = open.filter((assessment) => assessment.type === "exam")
      .map((assessment) => ({ assessment, days: getDaysUntilDeadline(assessment.dueAt, input.now, input.timeZone) ?? Number.MAX_SAFE_INTEGER }))
      .filter((value) => value.days >= 0).sort((left, right) => left.days - right.days);
    const assignments = open.filter((assessment) => assessment.type === "assignment")
      .map((assessment) => ({ assessment, days: getDaysUntilDeadline(assessment.dueAt, input.now, input.timeZone) ?? Number.MAX_SAFE_INTEGER }));
    const upcomingAssignments = assignments.filter((value) => value.days >= 0 && value.days <= 7);
    const overdueAssignments = assignments.filter((value) => value.days < 0);

    const lectureAndReview = course.remainingLectureMinutes > 0
      ? course.remainingLectureMinutes + roundUp(course.remainingLectureMinutes * 0.25)
      : 0;
    const nearestQuiz = quizzes[0];
    const nearestExam = exams[0];
    const quizPreparation = nearestQuiz && nearestQuiz.days <= 7 ? 90 : 0;
    const examPreparation = nearestExam
      ? nearestExam.days <= 21 ? 120 : nearestExam.days <= 42 ? 60 : 0
      : 0;
    const assignmentPreparation = Math.min(60, (upcomingAssignments.length + overdueAssignments.length) * 30);
    const weeklyMinutes = roundUp(Math.min(360, Math.max(45, lectureAndReview) + quizPreparation + examPreparation + assignmentPreparation));
    const todayMinutes = Math.min(90, roundUp(weeklyMinutes / daysLeft));

    const reasons: string[] = [];
    if (nearestQuiz && nearestQuiz.days <= 7) reasons.push(`${nearestQuiz.days}일 내 퀴즈`);
    if (nearestExam && nearestExam.days <= 42) reasons.push(`${nearestExam.days}일 내 시험`);
    if (upcomingAssignments.length > 0) reasons.push(`7일 내 과제 ${upcomingAssignments.length}개`);
    if (overdueAssignments.length > 0) reasons.push(`미완료 기한 경과 과제 ${overdueAssignments.length}개`);
    if (course.remainingLectureCount > 0) reasons.push(`미완료 강의 ${course.remainingLectureCount}개`);
    if (reasons.length === 0) reasons.push("최소 진도 유지");

    const priorityRank: CourseStudyRecommendation["priorityRank"] = nearestQuiz && nearestQuiz.days <= 7
      ? 0
      : nearestExam && nearestExam.days <= 42
        ? 1
        : upcomingAssignments.length + overdueAssignments.length > 0
          ? 2
          : course.remainingLectureCount > 0
            ? 3
            : 4;
    return {
      workContextId: course.workContextId,
      courseId: course.courseId,
      title: course.title,
      weeklyMinutes,
      todayMinutes,
      priorityRank,
      reasons,
      signals: {
        remainingLectureCount: course.remainingLectureCount,
        remainingLectureMinutes: course.remainingLectureMinutes,
        nearestQuizAt: nearestQuiz?.assessment.dueAt.toISOString() ?? null,
        nearestExamAt: nearestExam?.assessment.dueAt.toISOString() ?? null,
        upcomingAssignmentCount: upcomingAssignments.length,
        overdueAssignmentCount: overdueAssignments.length
      }
    };
  }).sort((left, right) => left.priorityRank - right.priorityRank || right.weeklyMinutes - left.weeklyMinutes || left.title.localeCompare(right.title, "ko-KR"));
}

export interface CourseProgressObservation {
  readonly courseId: string;
  readonly completedLectureCount: number;
  readonly remainingLectureCount: number;
  readonly remainingLectureMinutes: number;
}

export interface CourseStudyPlanningRepository {
  loadCourseSignals(input: {
    readonly userId: string;
    readonly currentTerm: string;
    readonly progress: readonly CourseProgressObservation[];
  }): Promise<readonly CourseStudySignal[]>;
  saveRecommendations(input: {
    readonly userId: string;
    readonly currentTerm: string;
    readonly planDate: string;
    readonly localWeekday: number;
    readonly observedAt: Date;
    readonly recommendations: readonly CourseStudyRecommendation[];
  }): Promise<void>;
}

export class CourseStudyPlanningService {
  constructor(private readonly repository: CourseStudyPlanningRepository) {}

  async plan(input: {
    readonly userId: string;
    readonly currentTerm: string;
    readonly planDate: string;
    readonly timeZone: string;
    readonly localWeekday: number;
    readonly now: Date;
    readonly progress: readonly CourseProgressObservation[];
  }): Promise<readonly CourseStudyRecommendation[]> {
    const courses = await this.repository.loadCourseSignals(input);
    const recommendations = calculateCourseStudyRecommendations({ courses, now: input.now, timeZone: input.timeZone, localWeekday: input.localWeekday });
    await this.repository.saveRecommendations({ ...input, observedAt: input.now, recommendations });
    return recommendations;
  }
}
