import { describe, expect, it } from "vitest";
import { FixedClock } from "./clock.js";
describe("FixedClock", () => {
    it("returns defensive Date copies and can be advanced explicitly", () => {
        const initial = new Date("2026-09-03T00:00:00.000Z");
        const clock = new FixedClock(initial);
        const first = clock.now();
        first.setUTCFullYear(2030);
        expect(clock.now().toISOString()).toBe("2026-09-03T00:00:00.000Z");
        clock.set(new Date("2026-09-04T00:00:00.000Z"));
        expect(clock.now().toISOString()).toBe("2026-09-04T00:00:00.000Z");
    });
});
//# sourceMappingURL=clock.test.js.map