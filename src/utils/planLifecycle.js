export function getPlanTotalWeeks(plan = {}) {
  return (
    (Number(plan.durationWeeks) || 1) + (plan.config?.deload ? 1 : 0)
  );
}

export function isPlanCompleteFromCompletions(plan = {}, completions = []) {
  const finalWeekWorkoutIds = new Set(
    completions
      .filter(
        (completion) =>
          Number(completion?.weekNumber) === getPlanTotalWeeks(plan) &&
          completion?.planWorkoutId != null
      )
      .map((completion) => String(completion.planWorkoutId))
  );
  const requiredWorkoutIds = (plan.workouts || [])
    .map((workout) => workout?.planWorkoutId)
    .filter((planWorkoutId) => planWorkoutId != null)
    .map(String);

  if (requiredWorkoutIds.length === 0) {
    return false;
  }

  return requiredWorkoutIds.every((planWorkoutId) =>
    finalWeekWorkoutIds.has(planWorkoutId)
  );
}

export function markPlanCompleted(plans = [], planId) {
  return plans.map((plan) =>
    String(plan.id) === String(planId)
      ? { ...plan, status: "completed" }
      : plan
  );
}
