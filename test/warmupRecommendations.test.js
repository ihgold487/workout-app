import test from "node:test";
import assert from "node:assert/strict";
import { buildWarmupRecommendations } from "../src/utils/warmupRecommendations.js";

test("warmup recommendations use the suggested working-set target", () => {
  const recommendations = buildWarmupRecommendations({
    exercise: { equipment: ["Barbell"] },
    reps: 10,
    rir: 3,
    weight: 100,
    weightIncrement: 5,
  });

  assert.equal(recommendations.baseWeight, 100);
  assert.equal(recommendations.baseReps, 10);
  assert.equal(recommendations.targetRir, 3);
  assert.equal(recommendations.options.length, 2);
  assert.equal(recommendations.options[0].sets.length, 2);
  assert.equal(recommendations.options[1].sets.length, 1);
  assert.ok(
    recommendations.options.flatMap((option) => option.sets).every(
      (set) => Number.isFinite(set.target?.weight) && set.target.weight >= 0
    )
  );
});
