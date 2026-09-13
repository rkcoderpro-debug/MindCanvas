import { test } from "node:test";
import assert from "node:assert/strict";
import { parseStudyPlanRecommendation } from "../src/studyPlan.js";

test("bounds an AI study-plan target to the available cards and safe session cap", () => {
  const result = parseStudyPlanRecommendation(JSON.stringify({ dailyTarget: 500, focus: "due", rationale: "Prioritize overdue cards." }), 12);
  assert.equal(result.dailyTarget, 12);
  assert.equal(result.focus, "due");
});

test("rejects an invalid study-plan focus", () => {
  assert.throws(() => parseStudyPlanRecommendation(JSON.stringify({ dailyTarget: 10, focus: "everything", rationale: "Nope" }), 20));
});
