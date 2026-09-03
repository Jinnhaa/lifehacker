# Discord Worker

로컬 Supabase가 실행 중이고 환경변수가 설정된 상태에서 저장소 루트에서 실행한다.

```bash
pnpm discord:dev
```

필수 환경변수는 `DISCORD_BOT_TOKEN`, `DISCORD_ALLOWED_USER_ID`, `OPENAI_API_KEY`다. `DATABASE_URL`을 생략하면 로컬 Supabase PostgreSQL 주소를 사용한다.

허용된 Discord 계정은 `integration_accounts`에 `provider='discord'`, `external_account_id=<Discord User ID>`, `status='active'`로 연결된 Amber 사용자 한 명과 매핑되어야 한다.
