import Link from "next/link";
import { ProjectContextManager } from "../../components/context-management";
import { loadProjectContexts } from "../../lib/context-management-server";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const model = await loadProjectContexts();
  return <main className="route-shell context-shell"><header><div><small>AMBER HQ · PROJECT PM</small><h1>Project Contexts</h1><p>프로젝트의 범위와 검토 기준을 관리합니다.</p></div><Link href="/">Home으로 돌아가기</Link></header><ProjectContextManager model={model} /></main>;
}
