import type { DiscoveredWorkItem } from "@amber/input";
import { NOTION_API_VERSION, type NotionWorkSourceClient } from "./contracts.js";

type Property = { type?: string; title?: { plain_text?: string }[]; rich_text?: { plain_text?: string }[]; status?: { name?: string } | null; select?: { name?: string } | null; checkbox?: boolean; date?: { start?: string } | null; multi_select?: { name?: string }[]; relation?: { data_source_id?: string } };
type Page = { id?: string; url?: string; last_edited_time?: string; archived?: boolean; in_trash?: boolean; properties?: Record<string, Property> };
type QueryResponse = { results?: Page[]; has_more?: boolean; next_cursor?: string | null };
type DataSource = { properties?: Record<string, Property> };

export interface NotionUniversityCourse {
  readonly sourceItemId: string;
  readonly title: string;
  readonly term: string;
  readonly meetingDays: readonly string[];
  readonly meetingTime: string | null;
  readonly room: string | null;
  readonly instructor: string | null;
  readonly observedAt: Date;
}

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
    const pages = await this.queryPages(sourceId);
    return pages.map((page) => normalizePage(page, sourceId, observedAt)).filter((value): value is DiscoveredWorkItem => value !== null);
  }

  async listUniversityCourses(taskSourceId: string, currentTerm: string, observedAt: Date): Promise<readonly NotionUniversityCourse[]> {
    const source = await this.getDataSource(taskSourceId);
    const relation = Object.entries(source.properties ?? {}).find(([key, value]) => names(key) === "수강과목" && value.type === "relation")?.[1]?.relation;
    if (!relation?.data_source_id) return [];
    return (await this.queryPages(relation.data_source_id)).map((page) => normalizeUniversityCourse(page, observedAt)).filter((course): course is NotionUniversityCourse => course !== null && sameTerm(course.term, currentTerm));
  }

  private async getDataSource(sourceId: string): Promise<DataSource> {
    const response = await this.request(`https://api.notion.com/v1/data_sources/${encodeURIComponent(sourceId)}`, { headers: { Authorization: `Bearer ${this.token}`, "Notion-Version": NOTION_API_VERSION } });
    if (!response.ok) throw new Error(`Notion read failed (${response.status})`);
    return response.json() as Promise<DataSource>;
  }

  private async queryPages(sourceId: string): Promise<Page[]> {
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
    return pages;
  }
}

export function normalizePage(page: Page, sourceId: string, observedAt: Date): DiscoveredWorkItem | null {
  if (!page.id) return null;
  const entries = Object.entries(page.properties ?? {});
  const title = entries.map(([, value]) => value).find((value) => value.type === "title");
  const statusEntry = entries.find(([key, value]) => ["status", "상태", "done", "완료"].includes(names(key)) || ["status", "checkbox"].includes(value.type ?? ""));
  const officialDeadlineEntry = entries.find(([key, value]) => ["officialdeadline", "officialdue", "공식마감", "공식마감일"].includes(names(key)) && value.type === "date");
  const internalDeadlineEntry = entries.find(([key, value]) => names(key) === "일정" && value.type === "date");
  const hasUnqualifiedDate = entries.some(([key, value]) => value.type === "date" && !["officialdeadline", "officialdue", "공식마감", "공식마감일", "일정"].includes(names(key)));
  const contextEntry = entries.find(([key]) => ["project", "context", "workcontext", "프로젝트", "과목", "수업"].includes(names(key)));
  const objectiveEntry = entries.find(([key]) => ["objective", "goal", "목표"].includes(names(key)));
  const statusValue = statusEntry ? (statusEntry[1].type === "checkbox" ? (statusEntry[1].checkbox ? "completed" : "open") : textOf(statusEntry[1])) : null;
  const deleted = page.archived === true || page.in_trash === true;
  const status = deleted ? "deleted" : statusValue === null ? "unknown" : DONE.has(names(statusValue)) ? "completed" : "open";
  const deadlineText = officialDeadlineEntry?.[1].date?.start;
  const deadline = deadlineText && !Number.isNaN(Date.parse(deadlineText)) ? new Date(deadlineText) : null;
  const internalDeadlineText = internalDeadlineEntry?.[1].date?.start;
  const internalDeadline = internalDeadlineText && !Number.isNaN(Date.parse(internalDeadlineText)) ? new Date(internalDeadlineText) : null;
  const titleText = textOf(title);
  const universityChecklist = entries.some(([key, value]) => names(key) === "할일" && value.type === "title") && entries.some(([key, value]) => names(key) === "체크박스" && value.type === "checkbox");
  return {
    source: "notion", sourceItemId: page.id, sourceVersion: page.last_edited_time ?? null, sourceUrl: page.url ?? null,
    observedAt, title: titleText ?? "제목 없는 Notion 항목", officialDeadline: deadline, internalDeadline,
    workContextHint: textOf(contextEntry?.[1]), objectiveHint: textOf(objectiveEntry?.[1]), status,
    taskSemantics: titleText && (deadline || statusValue !== null) && !hasUnqualifiedDate ? "clear" : "unclear",
    ...(universityChecklist && { allowUnscopedMaterialization: true }),
    rawPayload: { sourceId, propertyNames: entries.map(([key]) => key), sourceUrl: page.url ?? null }
  };
}

function normalizeUniversityCourse(page: Page, observedAt: Date): NotionUniversityCourse | null {
  if (!page.id) return null;
  const entries = Object.entries(page.properties ?? {});
  const property = (name: string) => entries.find(([key]) => names(key) === names(name))?.[1];
  const title = textOf(entries.map(([, value]) => value).find((value) => value.type === "title"));
  const term = textOf(property("학기"));
  if (!title || !term) return null;
  return { sourceItemId: page.id, title, term, meetingDays: property("강의 요일")?.multi_select?.map((value) => value.name?.trim()).filter((value): value is string => Boolean(value)) ?? [], meetingTime: textOf(property("강의시간")), room: textOf(property("강의실")), instructor: textOf(property("교수님")), observedAt };
}

function sameTerm(value: string, expected: string): boolean {
  return value.replace(/[^0-9]/g, "") === expected.replace(/[^0-9]/g, "");
}
