function normalizeLookupValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatList(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(", ");
  }

  return value || "";
}

function getExerciseKey(exercise) {
  return `${normalizeLookupValue(exercise?.name)}||${normalizeLookupValue(
    formatList(exercise?.equipment)
  )}`;
}

export function exercisesMatch(leftExercise, rightExercise) {
  const leftId = leftExercise?.exerciseId;
  const rightId = rightExercise?.exerciseId;

  if (leftId != null && rightId != null) {
    return String(leftId) === String(rightId);
  }

  return getExerciseKey(leftExercise) === getExerciseKey(rightExercise);
}

function getTemplateForPlanWorkout(planWorkout, templates = [], planId) {
  return (
    templates.find(
      (template) =>
        planWorkout?.templateId != null &&
        String(template.id) === String(planWorkout.templateId)
    ) ||
    templates.find(
      (template) =>
        planWorkout?.planWorkoutId != null &&
        String(template.planWorkoutId) === String(planWorkout.planWorkoutId) &&
        (planId == null || String(template.planId) === String(planId))
    ) ||
    null
  );
}

export function exerciseAppearsOnMultiplePlanDays({
  exercise,
  plan,
  templates = [],
}) {
  if (!exercise || !plan?.id || !Array.isArray(plan.workouts)) {
    return false;
  }

  let matchingDays = 0;

  for (const planWorkout of plan.workouts) {
    const workoutTemplate = getTemplateForPlanWorkout(
      planWorkout,
      templates,
      plan.id
    );

    if (
      workoutTemplate?.exercises?.some((planExercise) =>
        exercisesMatch(exercise, planExercise)
      )
    ) {
      matchingDays += 1;
    }

    if (matchingDays > 1) {
      return true;
    }
  }

  return false;
}

export function findLatestExercisePerformance({
  currentSessionId,
  exercise,
  history = [],
  plan,
  planWorkoutId,
  templates = [],
}) {
  const isCurrentSessionHistoryWorkout = (historyWorkout) =>
    String(historyWorkout.id) === String(currentSessionId) ||
    String(historyWorkout.sourceSessionId || "") === String(currentSessionId);
  const findMatchingPerformance = (workoutFilter, isPlanWorkoutScoped = false) => {
    const workout = history.find((historyWorkout) => {
      if (isCurrentSessionHistoryWorkout(historyWorkout)) {
        return false;
      }

      if (!workoutFilter(historyWorkout)) {
        return false;
      }

      return historyWorkout.exercises?.some((historyExercise) =>
        exercisesMatch(exercise, historyExercise)
      );
    });
    const historyExercise = workout?.exercises?.find((item) =>
      exercisesMatch(exercise, item)
    );

    return workout && historyExercise
      ? {
          exercise: historyExercise,
          isPlanWorkoutScoped,
          workout,
        }
      : null;
  };
  const shouldScopeToPlanWorkout =
    plan?.id != null &&
    planWorkoutId != null &&
    exerciseAppearsOnMultiplePlanDays({ exercise, plan, templates });

  if (shouldScopeToPlanWorkout) {
    const scopedFilter = (historyWorkout) =>
      String(historyWorkout.planId || "") === String(plan.id) &&
      String(historyWorkout.planWorkoutId || "") === String(planWorkoutId);

    const scopedPerformance = findMatchingPerformance(scopedFilter, true);

    if (scopedPerformance) {
      return scopedPerformance;
    }
  }

  return findMatchingPerformance(() => true);
}
