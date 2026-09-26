import Link from "next/link";
import { LearningContextManager } from "../../components/context-management";
import { loadLearningContexts } from "../../lib/context-management-server";

export const dynamic = "force-dynamic";

export default async function LearningPage() {
  const model = await loadLearningContexts();
  return <main className="route-shell context-shell"><header><div><small>AMBER HQ · LEARNING</small><h1>Learning Contexts</h1><p>Course와 Certification의 운영 기준을 관리합니다.</p></div><Link href="/">Home으로 돌아가기</Link></header><LearningContextManager model={model} /></main>;
}
