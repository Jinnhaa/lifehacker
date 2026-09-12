import { HomeCommandCenter } from "../components/home-command-center";
import { loadHomeViewModel } from "../lib/home-server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  return <HomeCommandCenter initialData={await loadHomeViewModel()} />;
}
