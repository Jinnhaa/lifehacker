import { HomeCommandCenter } from "../components/home-command-center";
import { loadHomeViewModel } from "../lib/home-server";

export default async function HomePage() {
  return <HomeCommandCenter initialData={await loadHomeViewModel()} />;
}
