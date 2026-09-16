export function buildStandaloneTemplateFromHistory(workout, { id, name }) {
  const exercises = (workout?.exercises || []).map((exercise, exerciseIndex) => ({
    id: id + exerciseIndex + 1,
    exerciseId: exercise.exerciseId ?? exercise.exercise_id ?? exercise.id,
    name: exercise.name || exercise.exerciseName || "Exercise",
    equipment: exercise.equipment,
    muscles: exercise.muscles,
    imageAlt: exercise.imageAlt || "",
    imageUrl: exercise.imageUrl || "",
    supersetGroup: exercise.supersetGroup || null,
    sets: (exercise.sets || []).map((set, setIndex) => {
      const reps =
        set.prescribedReps ?? set.reps ?? set.targetReps ?? set.actualReps ?? "";
      const rir =
        set.prescribedRir ?? set.rir ?? set.targetRir ?? set.actualRir ?? "";
      const minimumReps =
        set.prescribedMinimumReps ??
        set.minimumReps ??
        set.targetMinimumReps ??
        "";
      const restSeconds =
        set.prescribedRestSeconds ?? set.restSeconds ?? exercise.restSeconds;

      return {
        id: id + exerciseIndex * 100 + setIndex + 1000,
        ...(minimumReps !== "" && String(minimumReps) !== String(reps)
          ? { minimumReps }
          : {}),
        ...(set.isDropSet ? { isDropSet: true } : {}),
        ...(restSeconds ? { restSeconds } : {}),
        reps,
        rir,
      };
    }),
  }));

  return {
    id,
    name,
    exercises,
    lastCompleted: null,
    parentWorkoutId: workout?.templateId || null,
    planId: null,
    planWeek: null,
    planWorkoutId: null,
  };
}
