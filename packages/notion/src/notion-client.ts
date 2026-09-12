import type { DiscoveredWorkItem } from "@amber/input";
import { NOTION_API_VERSION, type NotionWorkSourceClient } from "./contracts.js";

type Property = { type?: string; title?: { plain_text?: string }[]; rich_text?: { plain_text?: string }[]; status?: { name?: string } | null; select?: { name?: string } | null; checkbox?: boolean; date?: { start?: string } | null };
type Page = { id?: string; url?: string; last_edited_time?: string; archived?: boolean; in_trash?: boolean; properties?: Record<string, Property> };
type QueryResponse = { results?: Page[]; has_more?: boolean; next_cursor?: string | null };

const DONE = new Set(["done", "complete", "completed", "완료", "종료"]);
const names = (value: string): string => value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/[\s_-]+/g, "");
const textOf = (property: Property | undefined): string | null => {
  if (!property) return null;
  if (property.type === "title") return property.title?.map((value) => value.plain_text ?? "").join("").trim() || null;
  if (property.type === "rich_text") return property.rich_text?.map((value) => value.plain_text ?? "").join("").trim() || null;
  if (property.type === "status") return property.status?.name?.trim() || null;
  if (property.type === "select") return property.select?.name?.trim() || null;
  return null;
};

export class NotionApiClient implements NotionWorkSourceClient {
  constructor(private readonly token: string, private readonly request: typeof fetch = fetch) {}

  async listWorkItems(sourceId: string, observedAt: Date): Promise<readonly DiscoveredWorkItem[]> {
    const pages: Page[] = [];
    let cursor: string | undefined;
    do {
      const response = await this.request(`https://api.notion.com/v1/data_sources/${encodeURIComponent(sourceId)}/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Notion-Version": NOTION_API_VERSION, "Content-Type": "application/json" },
        body: JSON.stringify(cursor ? { start_cursor: cursor, page_size: 100 } : { page_size: 100 })
      });
      if (!response.ok) throw new Error(`Notion read failed (${response.status})`);
      const body = await response.json() as QueryResponse;
      pages.push(...(body.results ?? []));
      cursor = body.has_more && body.next_cursor ? body.next_cursor : undefined;
    } while (cursor);
    return pages.map((page) => normalizePage(page, sourceId, observedAt)).filter((value): value is DiscoveredWorkItem => value !== null);
  }
}

export function normalizePage(page: Page, sourceId: string, observedAt: Date): DiscoveredWorkItem | null {
  if (!page.id) return null;
  const entries = Object.entries(page.properties ?? {});
  const title = entries.map(([, value]) => value).find((value) => value.type === "title");
  const statusEntry = entries.find(([key, value]) => ["status", "상태", "done", "완료"].includes(names(key)) || ["status", "checkbox"].includes(value.type ?? ""));
  const deadlineEntry = entries.find(([key, value]) => ["deadline", "due", "date", "마감", "마감일"].includes(names(key)) && value.type === "date");
  const contextEntry = entries.find(([key]) => ["project", "context", "workcontext", "프로젝트", "과목", "수업"].includes(names(key)));
  const objectiveEntry = entries.find(([key]) => ["objective", "goal", "목표"].includes(names(key)));
  const statusValue = statusEntry ? (statusEntry[1].type === "checkbox" ? (statusEntry[1].checkbox ? "completed" : "open") : textOf(statusEntry[1])) : null;
  const deleted = page.archived === true || page.in_trash === true;
  const status = deleted ? "deleted" : statusValue === null ? "unknown" : DONE.has(names(statusValue)) ? "completed" : "open";
  const deadlineText = deadlineEntry?.[1].date?.start;
  const deadline = deadlineText && !Number.isNaN(Date.parse(deadlineText)) ? new Date(deadlineText) : null;
  const titleText = textOf(title);
  return {
    source: "notion", sourceItemId: page.id, sourceVersion: page.last_edited_time ?? null, sourceUrl: page.url ?? null,
    observedAt, title: titleText ?? "제목 없는 Notion 항목", officialDeadline: deadline,
    workContextHint: textOf(contextEntry?.[1]), objectiveHint: textOf(objectiveEntry?.[1]), status,
    taskSemantics: titleText && (deadline || statusValue !== null) ? "clear" : "unclear",
    rawPayload: { sourceId, propertyNames: entries.map(([key]) => key), sourceUrl: page.url ?? null }
  };
}
