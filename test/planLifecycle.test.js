import assert from "node:assert/strict";
import test from "node:test";
import {
  isPlanCompleteFromCompletions,
  markPlanCompleted,
} from "../src/utils/planLifecycle.js";

const workouts = [{ planWorkoutId: "a" }, { planWorkoutId: "b" }];

test("a plan completes only after every final-week workout is recorded", () => {
  const plan = { durationWeeks: 2, workouts };

  assert.equal(
    isPlanCompleteFromCompletions(plan, [
      { planWorkoutId: "a", weekNumber: 2 },
      { planWorkoutId: "b", weekNumber: 2 },
    ]),
    true
  );
  assert.equal(
    isPlanCompleteFromCompletions(plan, [
      { planWorkoutId: "a", weekNumber: 2 },
      { planWorkoutId: "b", weekNumber: 1 },
    ]),
    false
  );
});

test("duplicate or unrelated completions cannot complete a plan", () => {
  const plan = { durationWeeks: 2, workouts };

  assert.equal(
    isPlanCompleteFromCompletions(plan, [
      { planWorkoutId: "a", weekNumber: 2 },
      { planWorkoutId: "a", weekNumber: 2 },
    ]),
    false
  );
  assert.equal(
    isPlanCompleteFromCompletions(plan, [
      { planWorkoutId: "a", weekNumber: 2 },
      { planWorkoutId: "unrelated", weekNumber: 2 },
    ]),
    false
  );
});

test("a deload plan completes only after its final deload week", () => {
  const plan = { config: { deload: true }, durationWeeks: 2, workouts };

  assert.equal(
    isPlanCompleteFromCompletions(plan, [
      { planWorkoutId: "a", weekNumber: 2 },
      { planWorkoutId: "b", weekNumber: 2 },
    ]),
    false
  );
  assert.equal(
    isPlanCompleteFromCompletions(plan, [
      { planWorkoutId: "a", weekNumber: 3 },
      { planWorkoutId: "b", weekNumber: 3 },
    ]),
    true
  );
});

test("marking a plan complete leaves other plan states unchanged", () => {
  const plans = [
    { id: "finished", status: "active" },
    { id: "draft", status: "inactive" },
  ];

  assert.deepEqual(markPlanCompleted(plans, "finished"), [
    { id: "finished", status: "completed" },
    { id: "draft", status: "inactive" },
  ]);
});
