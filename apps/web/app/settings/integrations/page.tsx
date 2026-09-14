import { IntegrationSettings } from "../../../components/integration-settings";
import { loadIntegrationSettings } from "../../../lib/integration-settings-server";

export const dynamic = "force-dynamic";

export default async function IntegrationSettingsPage() {
  return <IntegrationSettings data={await loadIntegrationSettings()} />;
}

