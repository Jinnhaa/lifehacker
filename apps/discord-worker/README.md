# Discord Worker

로컬 Supabase가 실행 중이고 환경변수가 설정된 상태에서 저장소 루트에서 실행한다.

```bash
pnpm discord:dev
```

필수 환경변수는 `DISCORD_BOT_TOKEN`, `DISCORD_ALLOWED_USER_ID`, `OPENAI_API_KEY`다. `DATABASE_URL`을 생략하면 로컬 Supabase PostgreSQL 주소를 사용한다.

Wake 예약은 worker 안의 scheduler가 선제적으로 발송한다. `WAKE_POLL_INTERVAL_MS`로 조회 간격을 설정할 수 있으며 기본값은 30초다.

`AMBER_USER_ID`가 설정되면 worker는 시작 시 Calendar sync를 한 번 실행하고 이후 15분마다 반복한다.
간격은 `CALENDAR_SYNC_INTERVAL_MS`로 조정할 수 있다. Google/iCloud 각각의 기존 active
`integration_accounts`가 없으면 안전하게 건너뛰며, 한 provider의 실패는 다른 provider나 worker를
중단하지 않는다. Provider 인증과 최초 account 생성은 각 Calendar package의 README와 기존 CLI를 따른다.

허용된 Discord 계정은 `integration_accounts`에 `provider='discord'`, `external_account_id=<Discord User ID>`, `status='active'`로 연결된 Amber 사용자 한 명과 매핑되어야 한다.
