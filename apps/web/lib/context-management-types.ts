import type {
  CertificationContextRecord,
  ContextKind,
  CourseContextRecord,
  ProjectContextRecord
} from "@amber/core";

export type ContextActionState = { readonly status: "idle" | "success" | "error"; readonly message: string };

export interface LearningContextsViewModel {
  readonly configured: boolean;
  readonly error: string | null;
  readonly courses: readonly CourseContextRecord[];
  readonly certifications: readonly CertificationContextRecord[];
}

export interface ProjectContextsViewModel {
  readonly configured: boolean;
  readonly error: string | null;
  readonly projects: readonly ProjectContextRecord[];
}

export type ManagedContext = CourseContextRecord | CertificationContextRecord | ProjectContextRecord;
export type ManagedContextKind = ContextKind;
