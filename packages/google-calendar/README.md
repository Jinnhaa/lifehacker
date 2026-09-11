# Google Calendar read sync

Google Cloud에서 Calendar API를 활성화하고 OAuth redirect URI를 등록한다. OAuth consent에는 read-only scope만 요청한다.

```bash
pnpm calendar:auth
pnpm calendar:sync
```

필수 환경변수: `AMBER_USER_ID`, `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`. 첫 인증 시 출력된 URL에서 승인한 뒤 `GOOGLE_CALENDAR_AUTH_CODE`를 설정하고 `calendar:auth`를 다시 실행한다.

Refresh token은 기본적으로 `~/.amber-hq/google-calendar-tokens.json`에 저장되고 DB에는 `secret_ref`만 저장된다. 경로는 `GOOGLE_CALENDAR_TOKEN_STORE_PATH`로 바꿀 수 있다. 동기화는 primary calendar를 읽기만 하며 Google event를 생성·수정·삭제하지 않는다.

현재 인증은 callback server 없이 authorization code를 환경변수로 전달하는 CLI 방식이다. 최초
연결 후 persistent Discord worker가 시작 시 한 번, 이후 기본 15분마다 같은 sync service를 실행한다.
