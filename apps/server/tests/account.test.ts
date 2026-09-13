import { test } from "node:test";
import assert from "node:assert/strict";
import { dailyPeriodStart, PLAN_CATALOG } from "../src/account.js";

test("uses a Vietnam noon-to-noon AI quota period", () => {
  assert.equal(dailyPeriodStart(new Date("2026-09-13T04:59:59.000Z")), "2026-09-12T05:00:00.000Z");
  assert.equal(dailyPeriodStart(new Date("2026-09-13T05:00:00.000Z")), "2026-09-13T05:00:00.000Z");
});

test("keeps the V4.0 plan quota matrix in one server-side catalog", () => {
  assert.deepEqual(
    [PLAN_CATALOG.free, PLAN_CATALOG.plus, PLAN_CATALOG.pro, PLAN_CATALOG.max].map(plan => ({
      id: plan.id,
      auto: plan.aiAutoDailyLimit,
      manual: plan.aiManualIncluded ? "included" : plan.aiManualDailyLimit,
      cards: plan.maxCards,
      storage: plan.storageLimitBytes,
    })),
    [
      { id: "free", auto: 1, manual: 3, cards: 50, storage: 20 * 1024 * 1024 },
      { id: "plus", auto: 20, manual: "included", cards: 100, storage: 500 * 1024 * 1024 },
      { id: "pro", auto: 60, manual: "included", cards: 200, storage: 2 * 1024 * 1024 * 1024 },
      { id: "max", auto: 150, manual: "included", cards: 500, storage: 10 * 1024 * 1024 * 1024 },
    ],
  );
});
