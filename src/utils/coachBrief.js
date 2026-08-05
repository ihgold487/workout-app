import { calculateE1RM, getLatestBodyWeightForDate } from "./e1rm";

const DEFAULT_LOOKBACK_DAYS = 120;
const MAX_TRACKED_EXERCISES = 8;
const MAX_RECENT_WORKOUTS = 8;

const PINNED_EXERCISE_PATTERNS = [
  /bench press/i,
  /deadlift/i,
  /\bsquat\b/i,
  /overhead press|shoulder press/i,
  /pull[- ]?up|chin[- ]?up/i,
  /\brow\b/i,
  /\bdip\b/i,
];

function parseNumber(value) {
  if (value === "" || value == null) {
    return null;
  }

  const parsed = Number.parseFloat(String(value).replace(/^\+/, ""));

  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value, digits = 1) {
  const parsed = parseNumber(value);

  if (parsed == null) {
    return "n/a";
  }

  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(digits);
}

function getWorkoutTime(workout) {
  const parsed = Date.parse(
    workout?.completedAtIso || workout?.completed_at || workout?.completedAt || ""
  );

  return Number.isFinite(parsed) ? parsed : 0;
}

function getWorkoutDate(workout) {
  if (workout?.completedAtIso) {
    return workout.completedAtIso.slice(0, 10);
  }

  const parsed = new Date(
    workout?.completed_at || workout?.completedAt || getWorkoutTime(workout)
  );

  return Number.isFinite(parsed.getTime())
    ? parsed.toISOString().slice(0, 10)
    : "unknown date";
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getEquipmentLabel(exercise) {
  const equipment = exercise?.equipment;

  if (Array.isArray(equipment)) {
    return equipment.filter(Boolean).join(", ");
  }

  return equipment || "";
}

function getExerciseName(exercise) {
  return exercise?.name || exercise?.exerciseName || "Unknown exercise";
}

function getExerciseKey(exercise) {
  const exerciseId = exercise?.exerciseId ?? exercise?.exercise_id;

  if (exerciseId !== undefined && exerciseId !== null) {
    return `id:${exerciseId}`;
  }

  return `${normalizeText(getExerciseName(exercise))}|${normalizeText(
    getEquipmentLabel(exercise)
  )}`;
}

function getExerciseContext(historyExercise, exerciseLibrary = []) {
  const exerciseId = historyExercise?.exerciseId ?? historyExercise?.exercise_id;
  const idMatch =
    exerciseId !== undefined && exerciseId !== null
      ? exerciseLibrary.find((exercise) => String(exercise.id) === String(exerciseId))
      : null;

  if (idMatch) {
    return {
      ...idMatch,
      ...historyExercise,
      id: idMatch.id,
      name: historyExercise.name || historyExercise.exerciseName || idMatch.name,
    };
  }

  const historyKey = `${normalizeText(getExerciseName(historyExercise))}|${normalizeText(
    getEquipmentLabel(historyExercise)
  )}`;
  const keyMatch = exerciseLibrary.find(
    (exercise) =>
      `${normalizeText(exercise.name)}|${normalizeText(getEquipmentLabel(exercise))}` ===
      historyKey
  );

  return {
    ...(keyMatch || {}),
    ...historyExercise,
    name: historyExercise.name || historyExercise.exerciseName || keyMatch?.name,
  };
}

function getSetValue(set, key) {
  const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

  return set?.[key] ?? set?.[snakeKey] ?? null;
}

function summarizeWorkoutExercise(workout, historyExercise, exerciseLibrary, bodyWeightEntries) {
  const exercise = getExerciseContext(historyExercise, exerciseLibrary);
  const bodyWeight = getLatestBodyWeightForDate(
    bodyWeightEntries,
    workout.completedAtIso || workout.completed_at || workout.completedAt
  );
  const sets = (historyExercise.sets || []).map((set, index) => {
    const weight = getSetValue(set, "actualWeight");
    const reps = getSetValue(set, "actualReps");
    const rir = getSetValue(set, "actualRir");
    const e1rm = calculateE1RM(weight, reps, rir, null, null, null, {
      bodyWeight,
      exercise,
    });

    return {
      e1rm: Number.isFinite(e1rm) ? e1rm : null,
      reps: parseNumber(reps),
      rir: parseNumber(rir),
      setNumber: index + 1,
      weight: parseNumber(weight),
    };
  });
  const validSets = sets.filter(
    (set) => set.weight != null && set.reps != null && set.rir != null
  );
  const bestSet = validSets.reduce((best, set) => {
    if (set.e1rm == null) {
      return best;
    }

    return !best || set.e1rm > best.e1rm ? set : best;
  }, null);

  return {
    bestSet,
    equipment: getEquipmentLabel(exercise),
    exercise,
    key: getExerciseKey(exercise),
    name: getExerciseName(exercise),
    setCount: validSets.length,
    sets: validSets,
  };
}

function formatSet(set) {
  if (!set) {
    return "n/a";
  }

  return `${formatNumber(set.weight)} x ${formatNumber(set.reps, 0)} @ ${formatNumber(
    set.rir
  )} (e1RM ${formatNumber(set.e1rm)})`;
}

function buildExerciseSummaries(history, exerciseLibrary, bodyWeightEntries, cutoffTime) {
  const summariesByKey = new Map();

  [...history]
    .filter((workout) => getWorkoutTime(workout) >= cutoffTime)
    .sort((a, b) => getWorkoutTime(a) - getWorkoutTime(b))
    .forEach((workout) => {
      (workout.exercises || []).forEach((historyExercise) => {
        const workoutExercise = summarizeWorkoutExercise(
          workout,
          historyExercise,
          exerciseLibrary,
          bodyWeightEntries
        );

        if (workoutExercise.setCount === 0) {
          return;
        }

        const current = summariesByKey.get(workoutExercise.key) || {
          bestAllTime: null,
          equipment: workoutExercise.equipment,
          firstBest: null,
          key: workoutExercise.key,
          lastBest: null,
          name: workoutExercise.name,
          sessions: [],
          totalSets: 0,
        };
        const sessionSummary = {
          bestSet: workoutExercise.bestSet,
          date: getWorkoutDate(workout),
          setCount: workoutExercise.setCount,
          workoutName: workout.templateName || workout.name || "Workout",
        };

        current.sessions.push(sessionSummary);
        current.totalSets += workoutExercise.setCount;

        if (sessionSummary.bestSet) {
          current.firstBest ||= sessionSummary;
          current.lastBest = sessionSummary;
          if (
            !current.bestAllTime ||
            sessionSummary.bestSet.e1rm > current.bestAllTime.bestSet.e1rm
          ) {
            current.bestAllTime = sessionSummary;
          }
        }

        summariesByKey.set(workoutExercise.key, current);
      });
    });

  return [...summariesByKey.values()].map((summary) => {
    const firstE1RM = summary.firstBest?.bestSet?.e1rm ?? null;
    const lastE1RM = summary.lastBest?.bestSet?.e1rm ?? null;
    const e1rmChange =
      firstE1RM != null && lastE1RM != null ? lastE1RM - firstE1RM : null;
    const pinned = PINNED_EXERCISE_PATTERNS.some((pattern) =>
      pattern.test(summary.name)
    );

    return {
      ...summary,
      e1rmChange,
      pinned,
      workoutCount: summary.sessions.length,
    };
  });
}

function chooseTrackedExercises(exerciseSummaries) {
  const pinned = exerciseSummaries
    .filter((summary) => summary.pinned)
    .sort((a, b) => b.workoutCount - a.workoutCount || b.totalSets - a.totalSets);
  const frequent = exerciseSummaries
    .filter((summary) => !summary.pinned)
    .sort((a, b) => b.workoutCount - a.workoutCount || b.totalSets - a.totalSets);

  return [...pinned, ...frequent].slice(0, MAX_TRACKED_EXERCISES);
}

function formatTrackedExercise(summary) {
  const trend =
    summary.e1rmChange == null
      ? "trend n/a"
      : `${summary.e1rmChange >= 0 ? "+" : ""}${formatNumber(
          summary.e1rmChange
        )} e1RM over window`;

  return [
    `- ${summary.name}${summary.equipment ? ` (${summary.equipment})` : ""}: ${
      summary.workoutCount
    } workouts, ${summary.totalSets} completed sets, ${trend}.`,
    `  First best: ${summary.firstBest?.date || "n/a"} ${formatSet(
      summary.firstBest?.bestSet
    )}.`,
    `  Latest best: ${summary.lastBest?.date || "n/a"} ${formatSet(
      summary.lastBest?.bestSet
    )}.`,
    `  Best in window: ${summary.bestAllTime?.date || "n/a"} ${formatSet(
      summary.bestAllTime?.bestSet
    )}.`,
  ].join("\n");
}

function formatRecentWorkout(workout, exerciseLibrary, bodyWeightEntries) {
  const exercises = (workout.exercises || [])
    .map((exercise) =>
      summarizeWorkoutExercise(workout, exercise, exerciseLibrary, bodyWeightEntries)
    )
    .filter((exercise) => exercise.setCount > 0);
  const setCount = exercises.reduce((sum, exercise) => sum + exercise.setCount, 0);
  const topExercises = exercises
    .slice(0, 5)
    .map((exercise) => `${exercise.name}: ${exercise.setCount} sets`)
    .join("; ");

  return `- ${getWorkoutDate(workout)} ${
    workout.templateName || workout.name || "Workout"
  }: ${setCount} completed sets${topExercises ? ` (${topExercises})` : ""}.`;
}

function formatActivePlan(plans = []) {
  const activePlan = plans.find((plan) => plan.status === "active");

  if (!activePlan) {
    return "No active plan found.";
  }

  return `${activePlan.name || "Active plan"}; week ${
    activePlan.currentWeek || "?"
  } of ${activePlan.durationWeeks || activePlan.weeks || "?"}; goal ${
    activePlan.goal || activePlan.config?.goal || "unspecified"
  }.`;
}

export function buildCoachBrief({
  bodyWeightEntries = [],
  exerciseLibrary = [],
  history = [],
  lookbackDays = DEFAULT_LOOKBACK_DAYS,
  plans = [],
} = {}) {
  const now = Date.now();
  const cutoffTime = now - lookbackDays * 24 * 60 * 60 * 1000;
  const completedHistory = [...(history || [])]
    .filter((workout) => getWorkoutTime(workout) > 0)
    .sort((a, b) => getWorkoutTime(a) - getWorkoutTime(b));
  const recentHistory = completedHistory.filter(
    (workout) => getWorkoutTime(workout) >= cutoffTime
  );
  const exerciseSummaries = buildExerciseSummaries(
    recentHistory,
    exerciseLibrary,
    bodyWeightEntries,
    cutoffTime
  );
  const trackedExercises = chooseTrackedExercises(exerciseSummaries);
  const recentWorkouts = [...recentHistory]
    .sort((a, b) => getWorkoutTime(b) - getWorkoutTime(a))
    .slice(0, MAX_RECENT_WORKOUTS);
  const firstDate = recentHistory[0] ? getWorkoutDate(recentHistory[0]) : "n/a";
  const lastDate = recentHistory.at(-1)
    ? getWorkoutDate(recentHistory.at(-1))
    : "n/a";
  const totalSets = exerciseSummaries.reduce(
    (sum, exercise) => sum + exercise.totalSets,
    0
  );
  const latestBodyWeight = getLatestBodyWeightForDate(bodyWeightEntries);
  const latestBodyWeightValue =
    latestBodyWeight?.weight ?? latestBodyWeight?.body_weight_value ?? null;
  const prompt = [
    "You are helping me review my strength training history and coach my next decisions.",
    "",
    "Definitions:",
    "- Prescribed reps/RIR are the plan or workout intent.",
    "- Target weight/reps/RIR are in-workout suggestions and are not persisted.",
    "- Actual weight/reps/RIR are what I completed and are used for history.",
    "",
    "Please analyze the data below. Give concise, practical recommendations. Focus on progression, fatigue, exercise selection, and whether any prescribed reps/RIR or plan structure should be adjusted. Call out uncertainty and ask follow-up questions only when needed.",
    "",
    "Training context:",
    `- Lookback window: ${lookbackDays} days (${firstDate} to ${lastDate}).`,
    `- Completed workouts in window: ${recentHistory.length}.`,
    `- Completed working sets in window: ${totalSets}.`,
    `- Active plan: ${formatActivePlan(plans)}.`,
    `- Latest body weight: ${formatNumber(latestBodyWeightValue)} lb.`,
    "",
    "Tracked exercise trends:",
    trackedExercises.length
      ? trackedExercises.map(formatTrackedExercise).join("\n")
      : "- Not enough completed exercise history in the lookback window.",
    "",
    "Most recent workouts:",
    recentWorkouts.length
      ? recentWorkouts
          .map((workout) =>
            formatRecentWorkout(workout, exerciseLibrary, bodyWeightEntries)
          )
          .join("\n")
      : "- No recent completed workouts found.",
    "",
    "Return:",
    "1. Main observations.",
    "2. Exercise-specific recommendations.",
    "3. Suggested plan/workout prescription changes, if any.",
    "4. Anything to watch next workout.",
  ].join("\n");

  return {
    prompt,
    trackedExercises,
    workoutCount: recentHistory.length,
  };
}
