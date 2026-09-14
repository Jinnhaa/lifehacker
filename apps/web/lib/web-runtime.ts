import "server-only";

import type { UserId } from "@amber/shared";
import postgres, { type Sql } from "postgres";

const LOCAL_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

declare global { var amberWebSql: Sql | undefined; }

export const getWebSql = (): Sql => {
  if (!globalThis.amberWebSql) globalThis.amberWebSql = postgres(process.env.DATABASE_URL ?? LOCAL_DATABASE_URL, { max: 5 });
  return globalThis.amberWebSql;
};

export const getWebUserId = (): UserId => {
  const value = process.env.AMBER_USER_ID?.trim();
  if (!value || !UUID.test(value)) throw new Error("AMBER_USER_ID에 사용할 profile UUID를 설정해 주세요.");
  return value as UserId;
};
