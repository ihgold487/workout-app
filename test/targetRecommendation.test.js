import test from "node:test";
import assert from "node:assert/strict";

import {
  getHistoricalFatigueRatioForSet,
  PLAN_PROGRESS_E1RM_INCREASE_PERCENT,
  recommendDeloadTargetPrescription,
  recommendNextSetTargetAfterPerformance,
  recommendTargetPrescription,
  resolvePlanGoalMode,
} from "../src/utils/targetRecommendation.js";

test("deload targets reduce the first-set e1RM and apply historical fatigue later", () => {
  const firstSet = recommendDeloadTargetPrescription({
    baselineE1RM: 210,
    deloadReductionPercent: 0.01,
    exercise: {},
    setIndex: 0,
    targetReps: 8,
    targetRir: 5,
    weightIncrement: 0.5,
  });
  const fatigueRatio = getHistoricalFatigueRatioForSet({
    blendTowardFlat: 0.5,
    e1rms: [210, 189],
    setIndex: 1,
  });
  const secondSet = recommendDeloadTargetPrescription({
    baselineE1RM: 210,
    deloadReductionPercent: 0.01,
    exercise: {},
    fatigueRatio,
    setIndex: 1,
    targetReps: 8,
    targetRir: 5,
    weightIncrement: 0.5,
  });

  assert.equal(firstSet.targetE1RM, 207.9);
  assert.equal(fatigueRatio, 0.95);
  assert.equal(secondSet.targetE1RM, 197.505);
  assert.ok(firstSet.recommendation.e1rm <= firstSet.targetE1RM);
  assert.ok(secondSet.recommendation.e1rm <= secondSet.targetE1RM);
  assert.ok(secondSet.recommendation.e1rm < firstSet.recommendation.e1rm);
});

test("deload fatigue prioritizes fewer reps at the completed weight", () => {
  const target = recommendDeloadTargetPrescription({
    baselineE1RM: 150,
    deloadReductionPercent: 0,
    exercise: {},
    fatigueRatio: 0.95,
    minimumReps: 8,
    preferredWeight: 100,
    setIndex: 1,
    targetReps: 10,
    targetRir: 5,
    weightIncrement: 5,
  });

  assert.equal(target.recommendation.reps, 8);
  assert.equal(target.recommendation.rir, 5);
  assert.equal(target.recommendation.weight, 100);
  assert.ok(Math.abs(target.recommendation.e1rm - 143.3333) < 0.001);
  assert.ok(
    target.alternatives.some(
      (candidate) => candidate.weight < target.recommendation.weight
    )
  );
});

test("AI-style descriptive goals use progression unless explicitly maintenance", () => {
  assert.equal(resolvePlanGoalMode("Hybrid strength and hypertrophy"), "progress");
  assert.equal(resolvePlanGoalMode("progress"), "progress");
  assert.equal(resolvePlanGoalMode("maintenance"), "maintenance");
  assert.equal(resolvePlanGoalMode("Maintain strength"), "maintenance");
});

test("every progressive plan target uses the AI-plan 0.5% e1RM increment", () => {
  const target = recommendTargetPrescription({
    exercise: {},
    goalMode: "progress",
    previousE1RM: 200,
    targetReps: 8,
    targetRir: 3,
    weightIncrement: 0.5,
  });

  assert.equal(PLAN_PROGRESS_E1RM_INCREASE_PERCENT, 0.005);
  assert.equal(target.progressionPercent, PLAN_PROGRESS_E1RM_INCREASE_PERCENT);
  assert.ok(Math.abs(target.targetE1RM - 201) < 0.0001);
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
