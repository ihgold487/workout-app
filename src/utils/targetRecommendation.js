import { calculateE1RM, estimateWeightForE1RM } from "./e1rm.js";
import { roundWeightToIncrement } from "./weightIncrement.js";

export const GOAL_MODE_PROGRESSIONS = {
  aggressive: 0.02,
  maintenance: 0,
  progress: 0.02,
};

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

      if (e1rm == null) {
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
