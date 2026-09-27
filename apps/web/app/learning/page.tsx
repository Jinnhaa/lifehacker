import { LearningWorkspace } from "../../components/learning-workspace";
import { loadLearningWorkspace } from "../../lib/learning-workspace-server";

export const dynamic = "force-dynamic";

export default async function LearningPage() {
  return <LearningWorkspace model={await loadLearningWorkspace()} />;
}
