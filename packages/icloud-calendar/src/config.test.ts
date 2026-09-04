import { describe, expect, it } from "vitest";
import { DEFAULT_ICLOUD_CALDAV_BASE_URL } from "./contracts.js";
import { loadICloudCalendarConfig } from "./config.js";

const base = {
  AMBER_USER_ID: "10000000-0000-4000-8000-000000000001",
  ICLOUD_APPLE_ID: "account@example.test",
  ICLOUD_APP_PASSWORD: "abcd-efgh-ijkl-mnop"
};

describe("iCloud Calendar config", () => {
  it("uses the centralized iCloud CalDAV endpoint by default", () => {
    expect(loadICloudCalendarConfig(base).baseUrl).toBe(DEFAULT_ICLOUD_CALDAV_BASE_URL);
  });

  it("accepts an explicit CalDAV endpoint override", () => {
    expect(loadICloudCalendarConfig({ ...base, ICLOUD_CALDAV_BASE_URL: "https://caldav.example.test" }).baseUrl)
      .toBe("https://caldav.example.test");
  });
});
