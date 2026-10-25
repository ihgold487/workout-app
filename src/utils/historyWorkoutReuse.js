function getPlanCopyContext(workout, plans = [], templates = []) {
  const sourceTemplate = templates.find(
    (template) => String(template.id) === String(workout?.templateId)
  );
  const plan = plans.find(
    (candidate) =>
      String(candidate.id) === String(workout?.planId ?? sourceTemplate?.planId)
  );
  const completion = (plan?.completions || []).find(
    (item) =>
      String(item.sessionId) === String(workout?.id) ||
      String(item.sessionId) === String(workout?.sourceSessionId)
  );
  const planWorkoutId =
    workout?.planWorkoutId ??
    completion?.planWorkoutId ??
    sourceTemplate?.planWorkoutId;
  const planWorkout = (plan?.workouts || []).find(
    (item) => String(item.planWorkoutId) === String(planWorkoutId)
  );
  const weekNumber = Number(workout?.planWeek ?? completion?.weekNumber);

  return {
    planWorkout,
    sourceTemplate,
    weekNumber: Number.isFinite(weekNumber) && weekNumber > 0 ? weekNumber : null,
  };
}

function getPlanRestFallback({
  exerciseIndex,
  planContext,
  setIndex,
}) {
  const { planWorkout, sourceTemplate, weekNumber } = planContext;
  const templateExercise = sourceTemplate?.exercises?.[exerciseIndex];
  const weeklyPrescriptions =
    templateExercise?.weeklyPrescriptions ||
    planWorkout?.weeklyPrescriptionsByPosition?.[exerciseIndex + 1] ||
    [];
  const weekPrescription = weeklyPrescriptions.find(
    (item) => Number(item.weekNumber) === weekNumber
  );
  const baseSet = templateExercise?.sets?.[setIndex];
  const plannedSetRest =
    planWorkout?.setRestSecondsByPosition?.[exerciseIndex + 1]?.[setIndex];

  return (
    weekPrescription?.restSeconds ??
    weekPrescription?.rest_seconds ??
    plannedSetRest ??
    baseSet?.prescribedRestSeconds ??
    baseSet?.restSeconds ??
    baseSet?.rest_seconds ??
    templateExercise?.restSeconds ??
    templateExercise?.rest_seconds
  );
}

export function buildStandaloneTemplateFromHistory(
  workout,
  { id, name, plans = [], templates = [] }
) {
  const planContext = getPlanCopyContext(workout, plans, templates);
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
        set.prescribedRestSeconds ??
        set.restSeconds ??
        set.rest_seconds ??
        (set.isDropSet
          ? undefined
          : getPlanRestFallback({
              exerciseIndex,
              planContext,
              setIndex,
            })) ??
        exercise.restSeconds ??
        exercise.rest_seconds;

      return {
        id: id + exerciseIndex * 100 + setIndex + 1000,
        ...(minimumReps !== "" && String(minimumReps) !== String(reps)
          ? { minimumReps }
          : {}),
        ...(set.isDropSet ? { isDropSet: true } : {}),
        // Keep both fields for compatibility, but make the copied value an
        // explicit standalone prescription rather than a default fallback.
        ...(restSeconds
          ? { prescribedRestSeconds: restSeconds, restSeconds }
          : {}),
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
