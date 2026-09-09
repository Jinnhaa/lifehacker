import type { ProjectPmContext } from "../project-pm/project-pm.js";
import { type ProjectStateSnapshot } from "./project-leadership.js";
export declare const stableJson: (value: unknown) => string;
export declare const contentHash: (value: unknown) => string;
export declare const projectStateFingerprint: (snapshot: ProjectStateSnapshot) => string;
export declare const projectProjectState: (context: ProjectPmContext) => ProjectStateSnapshot;
//# sourceMappingURL=project-state-projector.d.ts.map