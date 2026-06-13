import { calculateE1RM } from "./e1rm.js";

export const GOAL_MODE_PROGRESSIONS = {
  aggressive: 0.02,
  maintenance: 0,
  progress: 0.01,
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

function getExerciseKey(exercise) {
  return `${normalizeLookupValue(exercise?.name)}||${normalizeLookupValue(
    formatEquipment(exercise?.equipment)
  )}`;
}

function getSetPerformance(set) {
  const weight = toNumber(set?.actualWeight ?? set?.targetWeight);
  const reps = toNumber(set?.actualReps ?? set?.targetReps);
  const rir = toNumber(set?.actualRir ?? set?.targetRir ?? set?.rir ?? 0);
  const e1rm = calculateE1RM(weight, reps, rir);

  if (weight == null || reps == null || e1rm == null) {
    return null;
  }

  return {
    e1rm,
    reps,
    rir: rir ?? 0,
    weight,
  };
}

function matchesExercise(historyExercise, exercise) {
  const exerciseId = exercise?.exerciseId || exercise?.id;
  const historyExerciseId = historyExercise?.exerciseId || historyExercise?.id;

  if (exerciseId != null && historyExerciseId != null) {
    return String(exerciseId) === String(historyExerciseId);
  }

  return getExerciseKey(historyExercise) === getExerciseKey(exercise);
}

function collectHistoricalSets(history, exercise) {
  return (history || []).flatMap((workout) => {
    const matchingExercise = workout.exercises?.find((item) =>
      matchesExercise(item, exercise)
    );

    if (!matchingExercise) {
      return [];
    }

    return (matchingExercise.sets || [])
      .map((set, setIndex) => {
        const performance = getSetPerformance(set);

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

function findPreviousWorkoutBestSet(history, exercise) {
  const matchingWorkout = (history || []).find((workout) =>
    workout.exercises?.some((item) => matchesExercise(item, exercise))
  );

  if (!matchingWorkout) {
    return null;
  }

  const matchingExercise = matchingWorkout.exercises.find((item) =>
    matchesExercise(item, exercise)
  );
  const bestSet = (matchingExercise.sets || [])
    .map((set, setIndex) => {
      const performance = getSetPerformance(set);

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
    .filter(Boolean)
    .sort((a, b) => b.e1rm - a.e1rm)[0];

  return bestSet || null;
}

export function findBaselineSet({
  exercise,
  history,
  setIndex = 0,
}) {
  const previousWorkoutBestSet = findPreviousWorkoutBestSet(history, exercise);

  if (setIndex === 0 && previousWorkoutBestSet) {
    return {
      ...previousWorkoutBestSet,
      source: "previous-workout-best-set",
    };
  }

  const historicalSets = collectHistoricalSets(history, exercise);
  const matchingSet = historicalSets.find((item) => item.setIndex === setIndex);

  if (matchingSet) {
    return {
      ...matchingSet,
      source: "matching-set",
    };
  }

  if (previousWorkoutBestSet) {
    return {
      ...previousWorkoutBestSet,
      source: "previous-workout-best-set",
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

export function findBestBaselineSet({ exercise, history }) {
  const historicalSets = collectHistoricalSets(history, exercise);
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

function roundToIncrement(value, increment) {
  if (!increment || increment <= 0) {
    return value;
  }

  return Math.round(value / increment) * increment;
}

function uniqueNumbers(values) {
  return [...new Set(values.map((value) => Number(value.toFixed(4))))];
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

export function recommendTargetPrescription({
  allowedRepWindow = 4,
  goalMode = "maintenance",
  minWeight = 0,
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
  const minReps = Math.max(1, Math.round(reps - allowedRepWindow));
  const maxReps = Math.max(minReps, Math.round(reps + allowedRepWindow));
  const candidates = [];

  for (let candidateReps = minReps; candidateReps <= maxReps; candidateReps += 1) {
    const rawWeight = targetE1RM / (1 + (candidateReps + rir) / 30);
    const roundedWeight = roundToIncrement(rawWeight, weightIncrement);
    const weightOptions = uniqueNumbers([
      roundedWeight - weightIncrement,
      roundedWeight,
      roundedWeight + weightIncrement,
    ]).filter((weight) => weight >= minWeight);

    weightOptions.forEach((weight) => {
      const e1rm = calculateE1RM(weight, candidateReps, rir);

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

  const rankedCandidates = candidates.sort(compareCandidates);

  return {
    alternatives: rankedCandidates.slice(1, 8),
    baselineE1RM,
    goalMode,
    progressionPercent: getProgressionPercent(goalMode, progressionPercent),
    recommendation: rankedCandidates[0] || null,
    targetE1RM,
  };
}

export function recommendSetTarget({
  exercise,
  goalMode,
  history,
  progressionPercent,
  setIndex,
  targetReps,
  targetRir,
  weightIncrement,
}) {
  const baseline =
    findBaselineSet({
      exercise,
      history,
      setIndex,
    }) ||
    findBestBaselineSet({
      exercise,
      history,
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
      previousE1RM: baseline.e1rm,
      progressionPercent,
      targetReps,
      targetRir,
      weightIncrement,
    }),
  };
}
