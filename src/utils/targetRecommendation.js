import { calculateE1RM, estimateWeightForE1RM } from "./e1rm.js";
import { roundWeightToIncrement } from "./weightIncrement.js";

// This is the app-wide progression increment for a plan whose goal is
// "progress". Keep every target-generation path on this value so AI-imported
// and manually created progressive plans behave the same way.
export const PLAN_PROGRESS_E1RM_INCREASE_PERCENT = 0.005;

export const GOAL_MODE_PROGRESSIONS = {
  maintenance: 0,
  progress: PLAN_PROGRESS_E1RM_INCREASE_PERCENT,
};

export function resolvePlanGoalMode(goal) {
  const normalizedGoal = String(goal || "").trim().toLowerCase();

  if (
    normalizedGoal === "maintain" ||
    normalizedGoal === "maintenance" ||
    normalizedGoal.includes("maintain")
  ) {
    return "maintenance";
  }

  return "progress";
}

function toNumber(value) {
  if (value === "" || value == null) {
    return null;
  }

  const parsed = Number.parseFloat(String(value).replace(/^\+/, ""));

  return Number.isFinite(parsed) ? parsed : null;
}

function formatEquipment(equipment) {
  return Array.isArray(equipment) ? equipment.filter(Boolean).join(", ") : equipment || "";
}

function normalizeLookupValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function singularizeLookupToken(token) {
  if (token.length <= 3 || token.endsWith("ss")) {
    return token;
  }

  if (token.endsWith("ves")) {
    return `${token.slice(0, -3)}f`;
  }

  if (token.endsWith("ies")) {
    return `${token.slice(0, -3)}y`;
  }

  if (
    token.endsWith("ches") ||
    token.endsWith("shes") ||
    token.endsWith("xes") ||
    token.endsWith("zes")
  ) {
    return token.slice(0, -2);
  }

  if (token.endsWith("s")) {
    return token.slice(0, -1);
  }

  return token;
}

function normalizeComparableLookupValue(value) {
  return normalizeLookupValue(value)
    .split(" ")
    .filter(Boolean)
    .map(singularizeLookupToken)
    .join(" ");
}

function getExerciseName(exercise) {
  return exercise?.name || exercise?.exerciseName || exercise?.exercise_name || "";
}

function getExerciseId(exercise) {
  return exercise?.exerciseId ?? exercise?.exercise_id ?? exercise?.id;
}

function getExerciseKey(exercise) {
  return `${normalizeLookupValue(getExerciseName(exercise))}||${normalizeLookupValue(
    formatEquipment(exercise?.equipment)
  )}`;
}

function getComparableExerciseKey(exercise) {
  return `${normalizeComparableLookupValue(
    getExerciseName(exercise)
  )}||${normalizeComparableLookupValue(formatEquipment(exercise?.equipment))}`;
}

function getSetPerformance(set, exercise, bodyWeight) {
  const weight = toNumber(set?.actualWeight);
  const reps = toNumber(set?.actualReps);
  const rir = toNumber(set?.actualRir ?? 0);
  const e1rm = calculateE1RM(weight, reps, rir, null, null, null, {
    bodyWeight,
    exercise,
  });

  if (reps == null || e1rm == null) {
    return null;
  }

  return {
    e1rm,
    reps,
    rir: rir ?? 0,
    weight: weight ?? 0,
  };
}

function matchesExercise(historyExercise, exercise) {
  const exerciseId = getExerciseId(exercise);
  const historyExerciseId = getExerciseId(historyExercise);

  if (exerciseId != null && historyExerciseId != null) {
    return String(exerciseId) === String(historyExerciseId);
  }

  return (
    getExerciseKey(historyExercise) === getExerciseKey(exercise) ||
    getComparableExerciseKey(historyExercise) === getComparableExerciseKey(exercise)
  );
}

function getWorkoutTimestamp(workout) {
  const value =
    workout?.completedAtIso ||
    workout?.completed_at ||
    workout?.completedAt ||
    workout?.created_at;
  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function collectHistoricalSets(history, exercise, bodyWeight) {
  return (history || []).flatMap((workout) => {
    const matchingExercise = workout.exercises?.find((item) =>
      matchesExercise(item, exercise)
    );

    if (!matchingExercise) {
      return [];
    }

    return (matchingExercise.sets || [])
      .map((set, setIndex) => {
        const performance = getSetPerformance(set, exercise, bodyWeight);

        if (!performance) {
          return null;
        }

        return {
          ...performance,
          completedAt: workout.completedAt || null,
          set,
          setIndex,
          sourceWorkout: workout,
        };
      })
      .filter(Boolean);
  });
}

function findPreviousWorkoutBaselineSet(history, exercise, setIndex, bodyWeight) {
  const matchingWorkout = (history || [])
    .map((workout, originalIndex) => ({
      originalIndex,
      timestamp: getWorkoutTimestamp(workout),
      workout,
    }))
    .filter(({ workout }) =>
      workout.exercises?.some((item) => matchesExercise(item, exercise))
    )
    .sort(
      (a, b) =>
        b.timestamp - a.timestamp ||
        a.originalIndex - b.originalIndex
    )[0]?.workout;

  if (!matchingWorkout) {
    return null;
  }

  const matchingExercise = matchingWorkout.exercises.find((item) =>
    matchesExercise(item, exercise)
  );
  const performances = (matchingExercise.sets || [])
    .map((set, setIndex) => {
      const performance = getSetPerformance(set, exercise, bodyWeight);

      return performance
        ? {
            ...performance,
            completedAt: matchingWorkout.completedAt || null,
            set,
            setIndex,
            sourceWorkout: matchingWorkout,
          }
        : null;
    })
    .filter(Boolean);
  const matchingSet = performances.find((item) => item.setIndex === setIndex);

  if (matchingSet) {
    return {
      ...matchingSet,
      source: "previous-workout-matching-set",
    };
  }

  const bestSet = performances.slice().sort((a, b) => b.e1rm - a.e1rm)[0];

  return bestSet
    ? {
        ...bestSet,
        source: "previous-workout-best-set",
      }
    : null;
}

export function findBaselineSet({
  bodyWeight,
  exercise,
  history,
  setIndex = 0,
}) {
  const previousWorkoutSet = findPreviousWorkoutBaselineSet(
    history,
    exercise,
    setIndex,
    bodyWeight
  );

  if (previousWorkoutSet) {
    return previousWorkoutSet;
  }

  const historicalSets = collectHistoricalSets(history, exercise, bodyWeight);
  const matchingSet = historicalSets.find((item) => item.setIndex === setIndex);

  if (matchingSet) {
    return {
      ...matchingSet,
      source: "matching-set",
    };
  }

  if (historicalSets[0]) {
    return {
      ...historicalSets[0],
      source: "latest-set",
    };
  }

  return null;
}

export function findBestBaselineSet({ bodyWeight, exercise, history }) {
  const historicalSets = collectHistoricalSets(history, exercise, bodyWeight);
  const bestSet = historicalSets
    .slice()
    .sort((a, b) => b.e1rm - a.e1rm)[0];

  return bestSet
    ? {
        ...bestSet,
        source: "best-set",
      }
    : null;
}

function getProgressionPercent(goalMode, progressionPercent) {
  if (progressionPercent != null) {
    return Number(progressionPercent) || 0;
  }

  return GOAL_MODE_PROGRESSIONS[goalMode] ?? GOAL_MODE_PROGRESSIONS.maintenance;
}

function uniqueNumbers(values) {
  return [...new Set(values.map((value) => Number(value.toFixed(4))))];
}

function resolveWeightIncrement(weightIncrement, weight) {
  const value =
    typeof weightIncrement === "function"
      ? weightIncrement(weight)
      : weightIncrement;
  const parsed = Number.parseFloat(String(value));

  return Number.isFinite(parsed) ? parsed : null;
}

function scoreCandidate(candidate, target) {
  const repDeviation = Math.abs(candidate.reps - target.reps);
  const rirDeviation = Math.abs(candidate.rir - target.rir);
  const e1rmDeviation = Math.abs(candidate.e1rm - target.e1rm);
  const preferredRepPenalty = repDeviation <= target.preferredRepWindow ? 0 : 1;

  return {
    e1rmDeviation,
    preferredRepPenalty,
    repDeviation,
    rirDeviation,
  };
}

function compareCandidates(a, b) {
  return (
    a.score.rirDeviation - b.score.rirDeviation ||
    a.score.preferredRepPenalty - b.score.preferredRepPenalty ||
    a.score.repDeviation - b.score.repDeviation ||
    a.score.e1rmDeviation - b.score.e1rmDeviation ||
    a.weight - b.weight
  );
}

function compareProgressCandidates(a, b) {
  return (
    a.score.rirDeviation - b.score.rirDeviation ||
    a.score.preferredRepPenalty - b.score.preferredRepPenalty ||
    a.score.repDeviation - b.score.repDeviation ||
    a.score.e1rmDeviation - b.score.e1rmDeviation ||
    a.weight - b.weight
  );
}

function getCandidateKey(candidate) {
  return `${candidate.weight}|${candidate.reps}|${candidate.rir}`;
}

function addUniqueCandidates(target, candidates, limit, seenKeys) {
  for (const candidate of candidates) {
    if (target.length >= limit) {
      break;
    }

    const key = getCandidateKey(candidate);

    if (seenKeys.has(key)) {
      continue;
    }

    target.push(candidate);
    seenKeys.add(key);
  }
}

function buildAlternativeCandidates({
  baselineE1RM,
  rankedCandidates,
  recommendation,
  resolvedProgressionPercent,
  targetProgressCandidates,
}) {
  const alternatives = [];
  const seenKeys = new Set([getCandidateKey(recommendation)]);

  if (resolvedProgressionPercent <= 0) {
    addUniqueCandidates(alternatives, rankedCandidates, 7, seenKeys);
    return alternatives;
  }

  const maintenanceCandidates = rankedCandidates
    .filter((candidate) => candidate.e1rm <= baselineE1RM * 1.005)
    .sort(
      (a, b) =>
        Math.abs(a.e1rm - baselineE1RM) - Math.abs(b.e1rm - baselineE1RM) ||
        a.score.repDeviation - b.score.repDeviation ||
        a.weight - b.weight
    );

  addUniqueCandidates(alternatives, targetProgressCandidates, 5, seenKeys);
  addUniqueCandidates(alternatives, maintenanceCandidates, 7, seenKeys);
  addUniqueCandidates(alternatives, rankedCandidates, 7, seenKeys);

  return alternatives;
}

export function recommendTargetPrescription({
  allowedRepWindow = 4,
  bodyWeight,
  exercise,
  goalMode = "maintenance",
  maximumE1RM,
  minWeight = 0,
  normalizeWeight,
  preferredRepWindow = 2,
  previousE1RM,
  progressionPercent,
  targetReps,
  targetRir,
  weightIncrement = 2.5,
}) {
  const baselineE1RM = toNumber(previousE1RM);
  const maximum = toNumber(maximumE1RM);
  const reps = toNumber(targetReps);
  const rir = toNumber(targetRir) ?? 0;

  if (baselineE1RM == null || reps == null) {
    return null;
  }

  const targetE1RM =
    baselineE1RM * (1 + getProgressionPercent(goalMode, progressionPercent));
  const resolvedProgressionPercent = getProgressionPercent(
    goalMode,
    progressionPercent
  );
  const minReps = Math.max(1, Math.round(reps - allowedRepWindow));
  const maxReps = Math.max(minReps, Math.round(reps + allowedRepWindow));
  const candidates = [];

  for (let candidateReps = minReps; candidateReps <= maxReps; candidateReps += 1) {
    const rawWeight = estimateWeightForE1RM(targetE1RM, candidateReps, rir, {
      bodyWeight,
      exercise,
    });
    const candidateIncrement = resolveWeightIncrement(weightIncrement, rawWeight);
    const roundedWeight = roundWeightToIncrement(
      Math.max(minWeight, rawWeight ?? minWeight),
      candidateIncrement
    );
    const hasIncrement = Number(candidateIncrement) > 0;
    const weightOptions = uniqueNumbers(
      hasIncrement
        ? [
            roundWeightToIncrement(
              Math.max(minWeight, roundedWeight - candidateIncrement),
              candidateIncrement
            ),
            roundedWeight,
            roundWeightToIncrement(
              Math.max(minWeight, roundedWeight + candidateIncrement),
              candidateIncrement
            ),
          ]
        : [roundedWeight]
    )
      .map((weight) =>
        typeof normalizeWeight === "function"
          ? normalizeWeight(weight)
          : weight
      )
      .filter((weight) => Number.isFinite(weight) && weight >= minWeight);

    uniqueNumbers(weightOptions).forEach((weight) => {
      const e1rm = calculateE1RM(weight, candidateReps, rir, null, null, null, {
        bodyWeight,
        exercise,
      });

      if (
        e1rm == null ||
        (maximum != null && e1rm > maximum + 0.0001)
      ) {
        return;
      }

      const candidate = {
        e1rm,
        reps: candidateReps,
        rir,
        weight,
      };

      candidates.push({
        ...candidate,
        score: scoreCandidate(candidate, {
          e1rm: targetE1RM,
          preferredRepWindow,
          reps,
          rir,
        }),
      });
    });
  }

  const comparator =
    resolvedProgressionPercent > 0 ? compareProgressCandidates : compareCandidates;
  const rankedCandidates = candidates.sort(comparator);
  const targetProgressCandidates =
    resolvedProgressionPercent > 0
      ? rankedCandidates.filter((candidate) => candidate.e1rm >= targetE1RM)
      : rankedCandidates;
  const baselineProgressCandidates =
    resolvedProgressionPercent > 0
      ? rankedCandidates.filter((candidate) => candidate.e1rm > baselineE1RM)
      : rankedCandidates;
  const selectedCandidates = targetProgressCandidates.length
    ? targetProgressCandidates
    : baselineProgressCandidates.length
      ? baselineProgressCandidates
      : rankedCandidates;
  const recommendation = selectedCandidates[0] || null;

  return {
    alternatives: recommendation
      ? buildAlternativeCandidates({
          baselineE1RM,
          rankedCandidates,
          recommendation,
          resolvedProgressionPercent,
          targetProgressCandidates,
        })
      : [],
    baselineE1RM,
    goalMode,
    progressionPercent: resolvedProgressionPercent,
    recommendation,
    targetE1RM,
  };
}

export function getHistoricalFatigueRatioForSet({
  e1rms,
  setIndex,
  blendTowardFlat = 0.5,
}) {
  const latestE1RMs = Array.isArray(e1rms) ? e1rms : [];
  const resolvedSetIndex = Math.max(0, Math.floor(Number(setIndex) || 0));
  const latestMaxE1RM = Math.max(
    0,
    ...latestE1RMs.filter(Number.isFinite)
  );

  if (!latestMaxE1RM || resolvedSetIndex < 1) {
    return 1;
  }

  let previousCurveE1RM = latestMaxE1RM;

  for (let index = 1; index <= resolvedSetIndex; index += 1) {
    const rawSetE1RM = Number.isFinite(latestE1RMs[index])
      ? latestE1RMs[index]
      : previousCurveE1RM;

    previousCurveE1RM = Math.min(previousCurveE1RM, rawSetE1RM);
  }

  const rawRatio = Math.min(1, Math.max(0, previousCurveE1RM / latestMaxE1RM));
  const blend = Math.min(1, Math.max(0, Number(blendTowardFlat) || 0));

  return 1 - (1 - rawRatio) * blend;
}

export function recommendDeloadTargetPrescription({
  baselineE1RM,
  deloadReductionPercent = 0.01,
  fatigueRatio = 1,
  minimumReps,
  preferredWeight,
  setIndex = 0,
  ...options
}) {
  const baseline = toNumber(baselineE1RM);

  if (baseline == null) {
    return null;
  }

  const reduction = Math.max(0, toNumber(deloadReductionPercent) ?? 0);
  const historicalRatio = toNumber(fatigueRatio);
  const appliesFatigue = Number(setIndex) > 0;
  const resolvedFatigueRatio =
    appliesFatigue && historicalRatio != null && historicalRatio > 0
      ? Math.min(1, historicalRatio)
      : 1;
  const targetE1RM = baseline * (1 - reduction) * resolvedFatigueRatio;
  const result = recommendTargetPrescription({
    ...options,
    goalMode: "maintenance",
    maximumE1RM: targetE1RM,
    previousE1RM: targetE1RM,
    progressionPercent: 0,
  });
  const currentWeight = toNumber(preferredWeight);
  const targetReps = toNumber(options.targetReps);
  const targetRir = toNumber(options.targetRir) ?? 0;

  if (
    !result?.recommendation ||
    !appliesFatigue ||
    resolvedFatigueRatio >= 1 ||
    currentWeight == null ||
    targetReps == null
  ) {
    return result;
  }

  const minimum = Math.max(
    1,
    Math.round(toNumber(minimumReps) ?? targetReps - 2)
  );
  const maximum = Math.round(targetReps - 1);
  const sameWeightCandidates = [];

  for (
    let candidateReps = minimum;
    candidateReps <= maximum;
    candidateReps += 1
  ) {
    const e1rm = calculateE1RM(
      currentWeight,
      candidateReps,
      targetRir,
      null,
      null,
      null,
      { bodyWeight: options.bodyWeight, exercise: options.exercise }
    );

    if (e1rm != null && e1rm < baseline - 0.0001) {
      sameWeightCandidates.push({
        e1rm,
        reps: candidateReps,
        rir: targetRir,
        weight: currentWeight,
      });
    }
  }

  const sameWeightRecommendation = sameWeightCandidates.sort(
    (a, b) =>
      Math.abs(a.e1rm - targetE1RM) - Math.abs(b.e1rm - targetE1RM) ||
      b.reps - a.reps
  )[0];

  if (!sameWeightRecommendation) {
    return result;
  }

  const alternatives = [result.recommendation, ...(result.alternatives || [])]
    .filter(
      (candidate) => getCandidateKey(candidate) !== getCandidateKey(sameWeightRecommendation)
    );

  return {
    ...result,
    alternatives,
    recommendation: sameWeightRecommendation,
  };
}

export function recommendNextSetTargetAfterPerformance({
  bodyWeight,
  exercise,
  historicalFatigueRatio,
  liveProjectedReps,
  minimumReps,
  normalizeWeight,
  actualReps,
  actualRir,
  actualWeight,
  prescribedReps,
  targetRir,
  weightIncrement = 2.5,
}) {
  const weight = toNumber(actualWeight);
  const reps = toNumber(actualReps);
  const rir = toNumber(actualRir);
  const prescribed = toNumber(prescribedReps);
  const prescribedRir = toNumber(targetRir) ?? 0;

  if (weight == null || reps == null || prescribed == null) {
    return null;
  }

  const minimum = Math.max(
    1,
    Math.min(prescribed, toNumber(minimumReps) ?? prescribed - 2)
  );
  const actualE1RM = calculateE1RM(weight, reps, rir ?? 0, null, null, null, {
    bodyWeight,
    exercise,
  });
  const effortExceeded = rir != null && rir < prescribedRir;
  const rangeMissed = reps < minimum;
  const historicalRatio = toNumber(historicalFatigueRatio);
  const projectedReps = toNumber(liveProjectedReps);
  const hasLiveRepDrop = projectedReps != null && projectedReps < reps;

  if (
    !rangeMissed &&
    !effortExceeded &&
    hasLiveRepDrop &&
    projectedReps >= minimum
  ) {
    return {
      reason: "live-fatigue-rep-adjustment",
      reps: projectedReps,
      rir: prescribedRir,
      weight,
    };
  }

  if (
    !rangeMissed &&
    !effortExceeded &&
    hasLiveRepDrop &&
    projectedReps < minimum &&
    actualE1RM != null
  ) {
    const liveProjectedE1RM = calculateE1RM(
      weight,
      projectedReps,
      prescribedRir,
      null,
      null,
      null,
      { bodyWeight, exercise }
    );
    const liveFatigueRatio =
      liveProjectedE1RM == null ? null : liveProjectedE1RM / actualE1RM;
    const fatigueRatio =
      liveFatigueRatio != null && historicalRatio > 0
        ? liveFatigueRatio * 0.75 + Math.min(1, historicalRatio) * 0.25
        : liveFatigueRatio;

    if (fatigueRatio == null || fatigueRatio <= 0 || fatigueRatio >= 1) {
      return null;
    }

    const projectedE1RM = actualE1RM * fatigueRatio;
    const rawWeight = estimateWeightForE1RM(
      projectedE1RM,
      prescribed,
      prescribedRir,
      { bodyWeight, exercise }
    );
    const increment = resolveWeightIncrement(weightIncrement, rawWeight);
    const roundedWeight = roundWeightToIncrement(
      Math.max(0, rawWeight ?? 0),
      increment
    );
    const resolvedWeight =
      typeof normalizeWeight === "function"
        ? normalizeWeight(roundedWeight)
        : roundedWeight;

    if (Number.isFinite(resolvedWeight) && resolvedWeight < weight) {
      return {
        reason: "projected-fatigue-weight-adjustment",
        reps: prescribed,
        rir: prescribedRir,
        weight: resolvedWeight,
      };
    }
  }

  if (!rangeMissed && !effortExceeded && reps < prescribed) {
    return {
      reason: "repeat-achieved-range",
      reps,
      rir: prescribedRir,
      weight,
    };
  }

  if (!rangeMissed && !effortExceeded) {
    return null;
  }

  if (actualE1RM != null) {
    const sameWeightCandidates = [];

    for (
      let candidateReps = Math.round(minimum);
      candidateReps <= Math.round(prescribed);
      candidateReps += 1
    ) {
      const candidateE1RM = calculateE1RM(
        weight,
        candidateReps,
        prescribedRir,
        null,
        null,
        null,
        { bodyWeight, exercise }
      );

      if (candidateE1RM != null && candidateE1RM <= actualE1RM + 0.0001) {
        sameWeightCandidates.push({
          e1rm: candidateE1RM,
          reps: candidateReps,
        });
      }
    }

    const sameWeightTarget = sameWeightCandidates.sort(
      (a, b) =>
        Math.abs(a.e1rm - actualE1RM) - Math.abs(b.e1rm - actualE1RM) ||
        b.reps - a.reps
    )[0];

    if (sameWeightTarget) {
      return {
        reason: "same-weight-fatigue-adjustment",
        reps: sameWeightTarget.reps,
        rir: prescribedRir,
        weight,
      };
    }

    const rawWeight = estimateWeightForE1RM(
      actualE1RM,
      prescribed,
      prescribedRir,
      { bodyWeight, exercise }
    );
    const increment = resolveWeightIncrement(weightIncrement, rawWeight);
    const roundedWeight = roundWeightToIncrement(
      Math.max(0, rawWeight ?? 0),
      increment
    );
    const resolvedWeight =
      typeof normalizeWeight === "function"
        ? normalizeWeight(roundedWeight)
        : roundedWeight;

    if (Number.isFinite(resolvedWeight)) {
      return {
        reason: "reduced-weight-fatigue-adjustment",
        reps: prescribed,
        rir: prescribedRir,
        weight: resolvedWeight,
      };
    }
  }

  return null;
}

export function recommendSetTarget({
  allowedRepWindow,
  bodyWeight,
  exercise,
  goalMode,
  history,
  normalizeWeight,
  preferredRepWindow,
  progressionPercent,
  setIndex,
  targetReps,
  targetRir,
  weightIncrement,
}) {
  const baseline = findBaselineSet({
    bodyWeight,
    exercise,
    history,
    setIndex,
  });

  if (!baseline) {
    return {
      baseline: null,
      result: null,
    };
  }

  return {
    baseline,
    result: recommendTargetPrescription({
      goalMode,
      allowedRepWindow,
      bodyWeight,
      exercise,
      previousE1RM: baseline.e1rm,
      preferredRepWindow,
      progressionPercent,
      normalizeWeight,
      targetReps,
      targetRir,
      weightIncrement,
    }),
  };
}
