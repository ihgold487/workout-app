import { getExerciseHistoryMatchKeys } from "./workoutHistoryLookup.js";

export function buildRecentPerformanceByExerciseId({
  exerciseLibrary = [],
  history = [],
}) {
  const latestPerformanceByMatchKey = new Map();

  history.forEach((workout) => {
    const completedAt =
      workout.completedAtIso ||
      workout.completed_at ||
      workout.completedAt ||
      workout.created_at;
    const time = Date.parse(completedAt);

    if (!Number.isFinite(time)) {
      return;
    }

    workout.exercises?.forEach((exercise) => {
      const performance = {
        completedAt,
        setCount: exercise.sets?.length || 0,
        time,
      };

      getExerciseHistoryMatchKeys(exercise).forEach((key) => {
        const existing = latestPerformanceByMatchKey.get(key);

        if (!existing || performance.time > existing.time) {
          latestPerformanceByMatchKey.set(key, performance);
        }
      });
    });
  });

  return exerciseLibrary.reduce((recentPerformanceByExerciseId, exercise) => {
    const latestPerformance = getExerciseHistoryMatchKeys(exercise).reduce(
      (latest, key) => {
        const candidate = latestPerformanceByMatchKey.get(key);

        return candidate && (!latest || candidate.time > latest.time)
          ? candidate
          : latest;
      },
      null
    );

    if (latestPerformance) {
      recentPerformanceByExerciseId.set(String(exercise.id), latestPerformance);
    }

    return recentPerformanceByExerciseId;
  }, new Map());
}
