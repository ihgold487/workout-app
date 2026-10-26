import test from "node:test";
import assert from "node:assert/strict";

import {
  getCompletedPerformanceFallbackTarget,
  getHistoricalFatigueRatioForSet,
  MAX_PROGRESS_E1RM_INCREASE_PERCENT,
  PLAN_PROGRESS_E1RM_INCREASE_PERCENT,
  recommendDeloadTargetPrescription,
  recommendNextSetTargetAfterPerformance,
  recommendTargetPrescription,
  resolvePlanGoalMode,
} from "../src/utils/targetRecommendation.js";

test("completed performance fallback keeps a target available without an e1RM", () => {
  assert.deepEqual(
    getCompletedPerformanceFallbackTarget({
      exercise: { bodyweightLoadPercent: 100 },
      set: { actualReps: 10, actualRir: 2 },
    }),
    { reps: 10, rir: 2, weight: 0 }
  );
  assert.deepEqual(
    getCompletedPerformanceFallbackTarget({
      exercise: {},
      set: { targetWeight: 80, targetReps: 12, targetRir: 3 },
    }),
    { reps: 12, rir: 3, weight: 80 }
  );
});

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

test("progression caps rounded e1RM jumps before prioritizing exact reps", () => {
  const target = recommendTargetPrescription({
    exercise: {},
    goalMode: "progress",
    previousE1RM: 91.66666666666667,
    targetReps: 11,
    targetRir: 5,
    weightIncrement: 2.5,
  });

  assert.equal(MAX_PROGRESS_E1RM_INCREASE_PERCENT, 0.01);
  assert.deepEqual(
    {
      reps: target.recommendation.reps,
      rir: target.recommendation.rir,
      weight: target.recommendation.weight,
    },
    { reps: 11, rir: 5, weight: 60 }
  );
  assert.ok(
    target.recommendation.e1rm <=
      target.baselineE1RM * (1 + MAX_PROGRESS_E1RM_INCREASE_PERCENT)
  );
});

test("a prescribed rep range never recommends below its lower bound", () => {
  const target = recommendTargetPrescription({
    allowedRepWindow: 2,
    bodyWeight: { weight: 160 },
    exercise: { bodyweightLoadPercent: 100 },
    goalMode: "progress",
    minimumReps: 5,
    previousE1RM: 73.4,
    targetReps: 7,
    targetRir: 2.5,
    weightIncrement: 2.5,
  });

  assert.ok(target.recommendation);
  assert.ok(target.recommendation.reps >= 5);
  assert.ok(target.recommendation.reps <= 8);
});

test("target attributes override rep deviations and the progression cap", () => {
  const target = recommendTargetPrescription({
    allowedRepWindow: 2,
    exercise: {},
    goalMode: "progress",
    maxProgressionPercent: 0.03,
    maxRepDeviation: 0,
    minRepDeviation: 0,
    minimumReps: 5,
    previousE1RM: 100,
    progressionPercent: 0.02,
    targetReps: 7,
    targetRir: 3,
    weightIncrement: 0.5,
  });

  assert.ok(target.recommendation);
  assert.ok(target.recommendation.reps >= 5);
  assert.ok(target.recommendation.reps <= 7);
  assert.ok(target.recommendation.e1rm <= 103.0001);
});

test("rep-range targets use both configured boundaries while pursuing progression", () => {
  const target = recommendTargetPrescription({
    exercise: {},
    goalMode: "progress",
    maxProgressionPercent: 0.02,
    maxRepDeviation: 1,
    minRepDeviation: 0,
    minimumReps: 10,
    previousE1RM: 75,
    progressionPercent: 0.005,
    targetReps: 15,
    targetRir: 5,
    weightIncrement: 1.25,
  });

  assert.deepEqual(
    {
      reps: target.recommendation.reps,
      rir: target.recommendation.rir,
      weight: target.recommendation.weight,
    },
    { reps: 14, rir: 5, weight: 46.25 }
  );
  assert.ok(
    target.alternatives
      .filter((candidate) => !candidate.exceedsProgressionCap)
      .every((candidate) => candidate.e1rm <= 75 * 1.02 + 0.0001)
  );
});

test("progression recommendations retain their safe rep and RIR candidates", () => {
  const bench = recommendTargetPrescription({
    exercise: {},
    goalMode: "progress",
    previousE1RM: 185.625,
    targetReps: 9,
    targetRir: 3,
    weightIncrement: 2.5,
  });
  const cableFly = recommendTargetPrescription({
    exercise: {},
    goalMode: "progress",
    previousE1RM: 40.6875,
    targetReps: 15,
    targetRir: 3,
    weightIncrement: 2.5,
  });

  assert.deepEqual(
    {
      reps: bench.recommendation.reps,
      rir: bench.recommendation.rir,
      weight: bench.recommendation.weight,
    },
    { reps: 7, rir: 3, weight: 140 }
  );
  assert.ok(bench.recommendation.e1rm < 185.625 * 1.01);

  assert.deepEqual(
    {
      reps: cableFly.recommendation.reps,
      rir: cableFly.recommendation.rir,
      weight: cableFly.recommendation.weight,
    },
    { reps: 16, rir: 3, weight: 25 }
  );
  assert.ok(cableFly.recommendation.e1rm > 40.6875);
});

test("progression provides a maintenance target when load increments cannot clear the cap", () => {
  const target = recommendTargetPrescription({
    exercise: {},
    goalMode: "progress",
    previousE1RM: 100,
    targetReps: 10,
    targetRir: 3,
    weightIncrement: 20,
  });

  assert.ok(target.recommendation);
  assert.ok(target.recommendation.e1rm <= 100 + 0.0001);
  assert.ok(target.recommendation.e1rm <= 100 * 1.01 + 0.0001);
  const overCapOptions = target.alternatives.filter(
    (candidate) => candidate.exceedsProgressionCap
  );
  assert.equal(overCapOptions.length, 1);
  assert.ok(overCapOptions[0].e1rm > 100 * 1.01);
  assert.equal(
    overCapOptions[0].e1rm,
    Math.min(
      ...target.alternatives
        .filter((candidate) => candidate.e1rm > 100)
        .map((candidate) => candidate.e1rm)
    )
  );
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

test("top-of-range performance leaves one rep of fatigue reserve at the same weight", () => {
  const target = recommendNextSetTargetAfterPerformance({
    actualReps: 15,
    actualRir: 3,
    actualWeight: 80,
    exercise: {},
    minimumReps: 12,
    prescribedReps: 15,
    targetRir: 3,
    weightIncrement: 5,
  });

  assert.deepEqual(target, {
    reason: "top-of-range-fatigue-reserve",
    reps: 14,
    rir: 3,
    weight: 80,
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
