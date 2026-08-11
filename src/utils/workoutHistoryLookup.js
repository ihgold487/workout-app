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

function formatList(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(", ");
  }

  return value || "";
}

function getExerciseName(exercise) {
  return exercise?.name || exercise?.exerciseName || exercise?.exercise_name || "";
}

function getExerciseId(exercise) {
  return exercise?.exerciseId ?? exercise?.exercise_id;
}

function getExerciseKey(exercise) {
  return `${normalizeLookupValue(getExerciseName(exercise))}||${normalizeLookupValue(
    formatList(exercise?.equipment)
  )}`;
}

function getComparableExerciseKey(exercise) {
  return `${normalizeComparableLookupValue(
    getExerciseName(exercise)
  )}||${normalizeComparableLookupValue(formatList(exercise?.equipment))}`;
}

export function exercisesMatch(leftExercise, rightExercise) {
  const leftId = getExerciseId(leftExercise);
  const rightId = getExerciseId(rightExercise);
  const exactKeyMatches = getExerciseKey(leftExercise) === getExerciseKey(rightExercise);
  const comparableKeyMatches =
    getComparableExerciseKey(leftExercise) === getComparableExerciseKey(rightExercise);

  if (leftId != null && rightId != null) {
    if (String(leftId) === String(rightId)) {
      return true;
    }

    return exactKeyMatches || comparableKeyMatches;
  }

  return exactKeyMatches || comparableKeyMatches;
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

function getWorkoutCompletedTime(workout) {
  const parsed = new Date(
    workout?.completedAtIso || workout?.completed_at || workout?.completedAt || 0
  ).getTime();

  return Number.isFinite(parsed) ? parsed : 0;
}

function firstPresentValue(...values) {
  const value = values.find((item) => item != null && item !== "");

  return value == null ? "" : String(value);
}

function getSetPrescribedReps(set) {
  return firstPresentValue(set?.prescribedReps, set?.reps, set?.targetReps);
}

function getSetPrescribedRir(set) {
  return firstPresentValue(set?.prescribedRir, set?.rir, set?.targetRir);
}

function getExercisePrescriptionSignature(exercise) {
  return (exercise?.sets || [])
    .map((set) => `${getSetPrescribedReps(set)}:${getSetPrescribedRir(set)}`)
    .join("|");
}

function hasUsefulPrescriptionSignature(signature) {
  return signature
    .split("|")
    .some((setSignature) => setSignature.split(":").some(Boolean));
}

function getPlanCompletionTime(completion) {
  const parsed = new Date(completion?.completedAt || completion?.completedAtIso || 0).getTime();

  return Number.isFinite(parsed) ? parsed : 0;
}

function getWorkoutDisplayName(workout) {
  return (
    workout?.templateName ||
    workout?.workoutName ||
    workout?.workout_name ||
    workout?.name ||
    ""
  );
}

function getPlanWorkout(plan, planWorkoutId) {
  return (plan?.workouts || []).find(
    (workout) => String(workout.planWorkoutId || "") === String(planWorkoutId)
  );
}

function getNumberAfterLabel(value, label) {
  const match = String(value || "").match(
    new RegExp(`(?:^|[^a-z0-9])${label}\\s*(\\d+)(?:$|[^a-z0-9])`, "i")
  );

  return match ? Number(match[1]) : null;
}

function historyWorkoutMatchesPlanWorkoutName({
  historyWorkout,
  plan,
  planWorkout,
  weekNumber,
}) {
  const workoutName = getWorkoutDisplayName(historyWorkout);
  const historyDay = getNumberAfterLabel(workoutName, "day");
  const historyWeek = getNumberAfterLabel(workoutName, "week");
  const planDay = Number(planWorkout?.dayNumber);

  if (Number.isFinite(planDay) && historyDay !== planDay) {
    return false;
  }

  if (weekNumber != null && Number.isFinite(Number(weekNumber))) {
    return historyWeek === Number(weekNumber);
  }

  if (!Number.isFinite(planDay)) {
    const planWorkoutName = normalizeLookupValue(planWorkout?.name);

    return (
      planWorkoutName &&
      normalizeLookupValue(workoutName).includes(planWorkoutName)
    );
  }

  const planName = normalizeLookupValue(plan?.name);

  return !planName || normalizeLookupValue(workoutName).includes(planName);
}

export function findPlanWorkoutHistory({
  currentSessionId,
  history = [],
  plan,
  planWorkoutId,
  weekNumber,
}) {
  if (!plan?.id || planWorkoutId == null) {
    return null;
  }

  const isCurrentSessionHistoryWorkout = (historyWorkout) =>
    String(historyWorkout.id) === String(currentSessionId) ||
    String(historyWorkout.sourceSessionId || "") === String(currentSessionId);
  const completionSessionIds = (plan.completions || [])
    .filter((completion) => {
      if (String(completion.planWorkoutId || "") !== String(planWorkoutId)) {
        return false;
      }

      return weekNumber == null
        ? true
        : Number(completion.weekNumber) === Number(weekNumber);
    })
    .sort(
      (leftCompletion, rightCompletion) =>
        getPlanCompletionTime(rightCompletion) -
        getPlanCompletionTime(leftCompletion)
    )
    .map((completion) => String(completion.sessionId || ""))
    .filter(Boolean);

  for (const sessionId of completionSessionIds) {
    const completionMatch = history.find(
      (historyWorkout) =>
        !isCurrentSessionHistoryWorkout(historyWorkout) &&
        String(historyWorkout.id) === sessionId
    );

    if (completionMatch) {
      return completionMatch;
    }
  }

  const planWorkout = getPlanWorkout(plan, planWorkoutId);
  const byMetadata = history.find(
    (historyWorkout) =>
      !isCurrentSessionHistoryWorkout(historyWorkout) &&
      String(historyWorkout.planId || "") === String(plan.id) &&
      String(historyWorkout.planWorkoutId || "") === String(planWorkoutId) &&
      (weekNumber == null ||
        Number(historyWorkout.planWeek) === Number(weekNumber))
  );

  if (byMetadata) {
    return byMetadata;
  }

  return [...history]
    .filter((historyWorkout) => !isCurrentSessionHistoryWorkout(historyWorkout))
    .filter((historyWorkout) =>
      historyWorkoutMatchesPlanWorkoutName({
        historyWorkout,
        plan,
        planWorkout,
        weekNumber,
      })
    )
    .sort((leftWorkout, rightWorkout) =>
      getWorkoutCompletedTime(rightWorkout) - getWorkoutCompletedTime(leftWorkout)
    )[0] || null;
}

export function findLatestExercisePerformance({
  currentSessionId,
  exercise,
  history = [],
  plan,
  planWeek,
  planWorkoutId,
  templateId,
}) {
  const isCurrentSessionHistoryWorkout = (historyWorkout) =>
    String(historyWorkout.id) === String(currentSessionId) ||
    String(historyWorkout.sourceSessionId || "") === String(currentSessionId);
  const getMatchingHistoryExercise = (historyWorkout) =>
    historyWorkout?.exercises?.find((historyExercise) =>
      exercisesMatch(exercise, historyExercise)
    );
  const findMatchingPerformance = (workoutFilter, isPlanWorkoutScoped = false) => {
    const workout = [...history]
      .filter((historyWorkout) => !isCurrentSessionHistoryWorkout(historyWorkout))
      .filter(workoutFilter)
      .filter(getMatchingHistoryExercise)
      .sort((leftWorkout, rightWorkout) =>
        getWorkoutCompletedTime(rightWorkout) - getWorkoutCompletedTime(leftWorkout)
      )[0];
    const historyExercise = getMatchingHistoryExercise(workout);

    return workout && historyExercise
      ? {
          exercise: historyExercise,
          isPlanWorkoutScoped,
          workout,
        }
      : null;
  };
  const hasPlanWorkoutScope = plan?.id != null && planWorkoutId != null;
  const hasTemplateScope = templateId != null;
  const currentPrescriptionSignature = getExercisePrescriptionSignature(exercise);
  const canMatchPrescription =
    hasUsefulPrescriptionSignature(currentPrescriptionSignature);

  if (hasPlanWorkoutScope) {
    const previousWeekNumber =
      planWeek != null && Number(planWeek) > 1 ? Number(planWeek) - 1 : null;
    const previousPlanWorkout = findPlanWorkoutHistory({
      currentSessionId,
      history,
      plan,
      planWorkoutId,
      weekNumber: previousWeekNumber,
    });

    if (previousPlanWorkout) {
      const historyExercise = getMatchingHistoryExercise(previousPlanWorkout);

      if (historyExercise) {
        return {
          exercise: historyExercise,
          isPlanWorkoutScoped: true,
          workout: previousPlanWorkout,
        };
      }
    }

    const scopedFilter = (historyWorkout) =>
      String(historyWorkout.planId || "") === String(plan.id) &&
      String(historyWorkout.planWorkoutId || "") === String(planWorkoutId);

    const scopedPerformance = findMatchingPerformance(scopedFilter, true);

    if (scopedPerformance) {
      return scopedPerformance;
    }
  }

  if (hasTemplateScope) {
    const scopedFilter = (historyWorkout) =>
      String(historyWorkout.templateId || "") === String(templateId);

    const scopedPerformance = findMatchingPerformance(scopedFilter, true);

    if (scopedPerformance) {
      return scopedPerformance;
    }
  }

  if (plan?.id != null && canMatchPrescription) {
    const scopedFilter = (historyWorkout) =>
      (!historyWorkout.planId || String(historyWorkout.planId) === String(plan.id)) &&
      (historyWorkout.exercises || []).some(
        (historyExercise) =>
          exercisesMatch(exercise, historyExercise) &&
          getExercisePrescriptionSignature(historyExercise) ===
            currentPrescriptionSignature
      );

    const scopedPerformance = findMatchingPerformance(scopedFilter, true);

    if (scopedPerformance) {
      return scopedPerformance;
    }
  }

  if (canMatchPrescription) {
    const broadWithoutKnownMismatches = findMatchingPerformance((historyWorkout) => {
      const historyExercise = getMatchingHistoryExercise(historyWorkout);
      const historySignature = getExercisePrescriptionSignature(historyExercise);

      return (
        !hasUsefulPrescriptionSignature(historySignature) ||
        historySignature === currentPrescriptionSignature
      );
    });

    if (broadWithoutKnownMismatches) {
      return broadWithoutKnownMismatches;
    }
  }

  return findMatchingPerformance(() => true);
}
