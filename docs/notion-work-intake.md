# Notion Work Intake

Notion integration은 사용자가 명시한 data source만 읽는다. Notion 페이지를 수정하거나 삭제하지 않으며,
Amber Task와 연결된 뒤에도 Supabase가 실행 상태의 Source of Truth다.

## 연결

1. Notion에서 internal integration을 만들고 대상 database/data source에 `Can read content` 권한으로 연결한다.
2. `.env`에 `AMBER_USER_ID`, `NOTION_API_TOKEN`, `NOTION_SOURCE_IDS`를 설정한다. 여러 data source id는 쉼표로 구분한다.
3. `pnpm notion:connect`를 실행해 `integration_accounts`에 source id와 `env:NOTION_API_TOKEN` secret reference를 저장한다. 토큰 값은 DB에 저장하지 않는다.
4. `pnpm notion:sync`로 최초 read-only sync를 확인한다.

Discord worker는 시작할 때 한 번, 이후 기본 15분마다 같은 sync를 실행한다.
active account나 token이 없거나 Notion API가 실패하면 해당 iteration만 실패하고 기존 Task와 Morning runtime은 유지된다.

## 지원 property

- title property
- `Status`/`상태` 또는 checkbox
- `Deadline`/`Due`/`Date`/`마감`/`마감일` date
- `Project`/`Context`/`프로젝트`/`과목`/`수업`
- `Objective`/`Goal`/`목표`

명확한 미완료 상태와 task semantics, 유일하게 매칭되는 WorkContext가 있는 항목만 자동으로 Task가 된다.
그 외 항목은 Discord 확인 대기 상태로 남는다.
