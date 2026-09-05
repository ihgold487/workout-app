import { calculateE1RM, estimateWeightForE1RM } from "./e1rm.js";
import { roundWeightToIncrement } from "./weightIncrement.js";

function chooseWarmupWeight({
  baseE1RM,
  bodyWeight,
  exercise,
  maxPercent,
  minPercent,
  normalizeWeight,
  reps,
  rir,
  targetPercent,
  weightIncrement,
}) {
  const desiredPercent =
    targetPercent ?? (Number(minPercent) + Number(maxPercent)) / 2;
  const rawWeight = estimateWeightForE1RM(
    baseE1RM * desiredPercent,
    reps,
    rir,
    { bodyWeight, exercise }
  );
  const roundedWeight = roundWeightToIncrement(rawWeight, weightIncrement);
  const increment = Number(weightIncrement) > 0 ? Number(weightIncrement) : null;
  const candidateWeights = increment
    ? Array.from({ length: 11 }, (_, index) =>
        roundWeightToIncrement(
          Math.max(0, roundedWeight + (index - 5) * increment),
          increment
        )
      )
    : [roundedWeight];

  return candidateWeights
    .map((candidate) =>
      typeof normalizeWeight === "function" ? normalizeWeight(candidate) : candidate
    )
    .filter((candidate) => Number.isFinite(candidate) && candidate >= 0)
    .map((weight) => {
      const e1rm = calculateE1RM(weight, reps, rir, null, null, null, {
        bodyWeight,
        exercise,
      });
      const percent = e1rm / baseE1RM;
      const inRange =
        minPercent == null ||
        (percent >= Number(minPercent) && percent <= Number(maxPercent));
      const rangeDistance =
        minPercent == null
          ? Math.abs(percent - desiredPercent)
          : percent < Number(minPercent)
            ? Number(minPercent) - percent
            : percent > Number(maxPercent)
              ? percent - Number(maxPercent)
              : 0;

      return { e1rm, inRange, percent, rangeDistance, weight };
    })
    .sort(
      (left, right) =>
        Number(right.inRange) - Number(left.inRange) ||
        left.rangeDistance - right.rangeDistance ||
        Math.abs(left.percent - desiredPercent) -
          Math.abs(right.percent - desiredPercent) ||
        left.weight - right.weight
    )[0] || null;
}

export function buildWarmupRecommendations({
  bodyWeight,
  exercise,
  reps,
  rir,
  weight,
  weightIncrement,
  normalizeWeight,
}) {
  const baseWeight = Number.parseFloat(String(weight));
  const baseReps = Number.parseFloat(String(reps));
  const targetRir = Number.parseFloat(String(rir));
  const baseE1RM = calculateE1RM(
    baseWeight,
    baseReps,
    targetRir,
    null,
    null,
    null,
    { bodyWeight, exercise }
  );

  if (![baseWeight, baseReps, targetRir, baseE1RM].every(Number.isFinite)) {
    return null;
  }

  const buildTarget = (values) =>
    chooseWarmupWeight({
      baseE1RM,
      bodyWeight,
      exercise,
      normalizeWeight,
      rir: targetRir,
      weightIncrement,
      ...values,
    });

  return {
    baseE1RM,
    baseReps,
    baseWeight,
    options: [
      {
        label: "2 warmup sets",
        sets: [
          {
            note: "35-40% e1RM",
            reps: 9,
            target: buildTarget({ minPercent: 0.35, maxPercent: 0.4, reps: 9 }),
          },
          {
            note: "Closest to 65% e1RM",
            reps: 7,
            target: buildTarget({ targetPercent: 0.65, reps: 7 }),
          },
        ],
      },
      {
        label: "1 warmup set",
        sets: [
          {
            note: "50-55% e1RM",
            reps: 8,
            target: buildTarget({ minPercent: 0.5, maxPercent: 0.55, reps: 8 }),
          },
        ],
      },
    ],
    targetRir,
  };
}
