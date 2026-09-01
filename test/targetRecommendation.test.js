import test from "node:test";
import assert from "node:assert/strict";

import {
  recommendNextSetTargetAfterPerformance,
  resolvePlanGoalMode,
} from "../src/utils/targetRecommendation.js";

test("AI-style descriptive goals use progression unless explicitly maintenance", () => {
  assert.equal(resolvePlanGoalMode("Hybrid strength and hypertrophy"), "progress");
  assert.equal(resolvePlanGoalMode("progress"), "progress");
  assert.equal(resolvePlanGoalMode("maintenance"), "maintenance");
  assert.equal(resolvePlanGoalMode("Maintain strength"), "maintenance");
});

test("a small RIR miss prefers one fewer rep at the same weight", () => {
  const target = recommendNextSetTargetAfterPerformance({
    actualReps: 9,
    actualRir: 2.5,
    actualWeight: 127.5,
    exercise: {},
    minimumReps: 7,
    prescribedReps: 9,
    targetRir: 3,
    weightIncrement: 2.5,
  });

  assert.deepEqual(target, {
    reason: "same-weight-fatigue-adjustment",
    reps: 8,
    rir: 3,
    weight: 127.5,
  });
});

test("an achieved lower rep in range carries forward at the same weight", () => {
  const target = recommendNextSetTargetAfterPerformance({
    actualReps: 8,
    actualRir: 3,
    actualWeight: 127.5,
    exercise: {},
    minimumReps: 7,
    prescribedReps: 9,
    targetRir: 3,
    weightIncrement: 2.5,
  });

  assert.deepEqual(target, {
    reason: "repeat-achieved-range",
    reps: 8,
    rir: 3,
    weight: 127.5,
  });
});

test("bottom-of-range performance prioritizes a live rep drop when lowering weight", () => {
  const target = recommendNextSetTargetAfterPerformance({
    actualReps: 10,
    actualRir: 3,
    actualWeight: 145,
    exercise: {},
    historicalFatigueRatio: 192.5 / 210,
    liveProjectedReps: 9,
    minimumReps: 10,
    normalizeWeight: (weight) => weight,
    prescribedReps: 12,
    targetRir: 3,
    weightIncrement: 5,
  });

  assert.deepEqual(target, {
    reason: "projected-fatigue-weight-adjustment",
    reps: 12,
    rir: 3,
    weight: 135,
  });
});

test("a live rep-drop projection stays at the same weight when the range has room", () => {
  const target = recommendNextSetTargetAfterPerformance({
    actualReps: 10,
    actualRir: 3,
    actualWeight: 145,
    exercise: {},
    historicalFatigueRatio: 192.5 / 210,
    liveProjectedReps: 9,
    minimumReps: 8,
    prescribedReps: 12,
    targetRir: 3,
    weightIncrement: 5,
  });

  assert.deepEqual(target, {
    reason: "live-fatigue-rep-adjustment",
    reps: 9,
    rir: 3,
    weight: 145,
  });
});

test("bottom-of-range performance still carries forward without fatigue evidence", () => {
  const target = recommendNextSetTargetAfterPerformance({
    actualReps: 10,
    actualRir: 3,
    actualWeight: 145,
    exercise: {},
    minimumReps: 10,
    prescribedReps: 12,
    targetRir: 3,
    weightIncrement: 5,
  });

  assert.deepEqual(target, {
    reason: "repeat-achieved-range",
    reps: 10,
    rir: 3,
    weight: 145,
  });
});
