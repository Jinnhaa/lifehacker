"use client";

import Link from "next/link";
import { useActionState } from "react";
import { changeIntegrationStateAction } from "../app/settings/integrations/actions";
import type { IntegrationActionState, IntegrationSettingsItem, IntegrationSettingsViewModel } from "../lib/integration-settings-types";

const initialState: IntegrationActionState = { status: "idle", message: "" };
const stateLabel = {
  connected: "연결됨", disconnected: "비활성", needs_config: "설정 필요", error: "오류", unavailable: "지원 예정"
} as const;

function ProviderRow({ item }: { readonly item: IntegrationSettingsItem }) {
  const [state, action, pending] = useActionState(changeIntegrationStateAction, initialState);
  return <li className="integration-row">
    <div className="integration-main">
      <div><strong>{item.name}</strong><span className={`integration-state is-${item.state}`}>{stateLabel[item.state]}</span></div>
      {item.lastSyncLabel && <small>마지막 동기화 {item.lastSyncLabel}</small>}
      {(item.state === "needs_config" || item.state === "unavailable") && item.setupHint && <small>{item.setupHint}</small>}
      {item.state === "error" && <small>저장된 계정 설정을 확인해 주세요.</small>}
    </div>
    {(item.canActivate || item.canDeactivate) && item.accountId && <form action={action}>
      <input type="hidden" name="accountId" value={item.accountId} />
      <input type="hidden" name="intent" value={item.canDeactivate ? "deactivate" : "activate"} />
      <button type="submit" disabled={pending}>{pending ? "반영 중…" : item.canDeactivate ? "비활성화" : "활성화"}</button>
    </form>}
    {state.message && <p className={`integration-feedback ${state.status}`} role="status">{state.message}</p>}
  </li>;
}

export function IntegrationSettings({ data }: { readonly data: IntegrationSettingsViewModel }) {
  const domains = [
    { key: "calendar", label: "Calendar" },
    { key: "work", label: "Work" }
  ] as const;
  return <main className="settings-shell">
    <header className="settings-header">
      <div><span>AMBER HQ SETTINGS</span><h1>Integrations</h1><p>일정과 할 일의 외부 소스를 관리합니다.</p></div>
      <Link href="/">Home으로</Link>
    </header>
    {data.error && <p className="settings-error" role="alert">{data.error}</p>}
    {domains.map((domain) => <section className="integration-section" key={domain.key}>
      <h2>{domain.label}</h2>
      <ul>{data.items.filter((item) => item.domain === domain.key).map((item) => <ProviderRow item={item} key={item.provider} />)}</ul>
    </section>)}
    <p className="settings-note">비활성화해도 이미 가져온 일정과 할 일은 삭제되지 않습니다.</p>
  </main>;
}

