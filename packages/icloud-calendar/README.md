# @amber/icloud-calendar

Amber HQ의 iCloud Calendar read-only CalDAV adapter다. `tsdav`로 principal과
calendar-home-set을 discovery하고 모든 calendar collection에서 bounded window
(과거 7일/미래 90일)의 event를 읽는다. `ical.js`로 all-day, timezone, recurrence와
exception을 정규화한 뒤 기존 ExternalReference/Constraint 파이프라인에 반영한다.

필수 환경변수:

- `AMBER_USER_ID`
- `ICLOUD_APPLE_ID`
- `ICLOUD_APP_PASSWORD` — Apple Account의 앱 전용 암호만 허용
- `DATABASE_URL` (생략 시 local Supabase)
- `ICLOUD_CALDAV_BASE_URL` (선택, 기본 `https://caldav.icloud.com`)

```bash
pnpm calendar:icloud:sync
```

구현은 CalDAV `PROPFIND`/`REPORT`만 호출한다. iCloud 원본에 쓰는 API는 노출하지
않으며 credential과 raw ICS payload를 로그 또는 DB에 저장하지 않는다. collection의
CTag가 바뀌지 않으면 fetch를 생략하고, 그 외에는 bounded full fetch와 ETag/content
hash로 update/delete를 reconciliation한다.
