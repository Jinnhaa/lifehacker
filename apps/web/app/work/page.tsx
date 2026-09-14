import { WorkBoard } from "../../components/work-board";
import { loadWorkBoard } from "../../lib/work-server";

export const dynamic = "force-dynamic";

export default async function WorkPage() {
  return <WorkBoard data={await loadWorkBoard()} />;
}
