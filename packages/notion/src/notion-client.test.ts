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
    expect(items[0]).toMatchObject({ sourceItemId: "page-1", title: "지원서 초안", status: "open", taskSemantics: "clear", workContextHint: "LogFolio" });
  });

  it("keeps notes low-confidence and recognizes provider deletion", () => {
    expect(normalizePage({ id: "note", properties: { Name: { type: "title", title: [{ plain_text: "아이디어" }] } } }, "source", new Date())).toMatchObject({ status: "unknown", taskSemantics: "unclear" });
    expect(normalizePage({ id: "deleted", archived: true, properties: {} }, "source", new Date())).toMatchObject({ status: "deleted" });
  });
});
