import { describe, expect, it, vi } from "vitest";
import { NotionApiClient, normalizePage } from "./notion-client.js";

describe("Notion read-only adapter", () => {
  it("normalizes configured task properties without issuing writes", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ results: [{ id: "page-1", url: "https://notion.so/page-1", last_edited_time: "2026-09-12T00:00:00Z", properties: {
      Name: { type: "title", title: [{ plain_text: "지원서 초안" }] },
      Status: { type: "status", status: { name: "In progress" } },
      Deadline: { type: "date", date: { start: "2026-09-15" } },
      Project: { type: "select", select: { name: "LogFolio" } }
    }}], has_more: false }), { status: 200 }));
    const items = await new NotionApiClient("test-token", request as typeof fetch).listWorkItems("source-1", new Date("2026-09-12T00:00:00Z"));
    expect(request).toHaveBeenCalledWith("https://api.notion.com/v1/data_sources/source-1/query", expect.objectContaining({ method: "POST" }));
    expect(items[0]).toMatchObject({ sourceItemId: "page-1", title: "지원서 초안", status: "open", taskSemantics: "unclear", workContextHint: "LogFolio", officialDeadline: null });
  });

  it("maps the University checklist schedule to an internal deadline only", () => {
    expect(normalizePage({ id: "page-2", properties: {
      할일: { type: "title", title: [{ plain_text: "개인 일정" }] },
      체크박스: { type: "checkbox", checkbox: false },
      일정: { type: "date", date: { start: "2026-09-20" } }
    } }, "source", new Date())).toMatchObject({ officialDeadline: null, internalDeadline: new Date("2026-09-20"), taskSemantics: "clear", allowUnscopedMaterialization: true });
  });

  it("reads only the requested current-term courses from the checklist relation", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ properties: { 수강과목: { type: "relation", relation: { data_source_id: "courses" } } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [
        { id: "course-current", properties: { 이름: { type: "title", title: [{ plain_text: "데이터베이스" }] }, 학기: { type: "select", select: { name: "2026 2학기" } }, "강의 요일": { type: "multi_select", multi_select: [{ name: "MON" }] }, 강의시간: { type: "rich_text", rich_text: [{ plain_text: "13:30" }] }, 강의실: { type: "rich_text", rich_text: [{ plain_text: "505" }] }, 교수님: { type: "rich_text", rich_text: [{ plain_text: "교수" }] } } },
        { id: "course-old", properties: { 이름: { type: "title", title: [{ plain_text: "과거 과목" }] }, 학기: { type: "select", select: { name: "2026 1학기" } } } }
      ], has_more: false }), { status: 200 }));
    const courses = await new NotionApiClient("test-token", request as typeof fetch).listUniversityCourses("todo", "2026-2", new Date("2026-09-15T00:00:00Z"));
    expect(courses).toEqual([expect.objectContaining({ sourceItemId: "course-current", title: "데이터베이스", term: "2026 2학기", meetingDays: ["MON"], meetingTime: "13:30", room: "505", instructor: "교수" })]);
  });

  it("keeps notes low-confidence and recognizes provider deletion", () => {
    expect(normalizePage({ id: "note", properties: { Name: { type: "title", title: [{ plain_text: "아이디어" }] } } }, "source", new Date())).toMatchObject({ status: "unknown", taskSemantics: "unclear" });
    expect(normalizePage({ id: "deleted", archived: true, properties: {} }, "source", new Date())).toMatchObject({ status: "deleted" });
  });
});
