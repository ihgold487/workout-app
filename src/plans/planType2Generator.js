import { isExerciseActive } from "../utils/exerciseStatus";
import { recommendSetTarget } from "../utils/targetRecommendation";

const PLAN_TYPE_2_WORKOUTS = [
  {
    name: "Workout 1",
    groups: [
      { label: "A", muscles: ["Quads", "Upper Back"], sets: 3 },
      { label: "B", muscles: ["Glutes", "Chest"], sets: 3 },
      { label: "C", muscles: ["Lats", "Upper Chest"], sets: 2 },
      { label: "D", muscles: ["Biceps", "Triceps"], sets: 2 },
      { label: "Abs", muscles: ["Abs"], sets: 3, supersetGroup: null },
    ],
  },
  {
    name: "Workout 2",
    groups: [
      { label: "A", muscles: ["Hamstrings", "Chest"], sets: 3 },
      { label: "B", muscles: ["Glutes", "Lats"], sets: 3 },
      { label: "C", muscles: ["Upper Back", "Upper Chest"], sets: 2 },
      { label: "D", muscles: ["Biceps", "Triceps"], sets: 2 },
      { label: "Abs", muscles: ["Abs"], sets: 3, supersetGroup: null },
    ],
  },
];

const PLAN_TYPE_2_THIRD_DAY = {
  name: "Workout 3",
  groups: [
    { label: "A", muscles: ["Quads", "Lats"], sets: 3 },
    { label: "B", muscles: ["Hamstrings", "Upper Chest"], sets: 3 },
    { label: "C", muscles: ["Glutes", "Upper Back"], sets: 2 },
    { label: "D", muscles: ["Biceps", "Triceps"], sets: 2 },
    { label: "Abs", muscles: ["Abs"], sets: 3, supersetGroup: null },
  ],
};

const PLAN_TYPE_1_WORKOUTS = [
  {
    name: "Workout 1",
    groups: [
      { label: "A", muscles: ["Quads", "Upper Back"], sets: 2 },
      { label: "B", muscles: ["Glutes", "Chest"], sets: 2 },
      { label: "C", muscles: ["Biceps", "Triceps"], sets: 2 },
    ],
  },
  {
    name: "Workout 2",
    groups: [
      { label: "A", muscles: ["Hamstrings", "Chest"], sets: 2 },
      { label: "B", muscles: ["Glutes", "Lats"], sets: 2 },
      { label: "C", muscles: ["Biceps", "Triceps"], sets: 2 },
    ],
  },
  {
    name: "Workout 3",
    groups: [
      { label: "A", muscles: ["Quads", "Lats"], sets: 2 },
      { label: "B", muscles: ["Hamstrings", "Upper Chest"], sets: 2 },
      { label: "C", muscles: ["Biceps", "Triceps"], sets: 2 },
    ],
  },
];

const PLAN_CONFIGS = {
  "type-1": {
    label: "Plan Type 1",
    workouts: PLAN_TYPE_1_WORKOUTS,
  },
  "type-2": {
    label: "Plan Type 2",
    workouts: [...PLAN_TYPE_2_WORKOUTS, PLAN_TYPE_2_THIRD_DAY],
  },
};

function normalizeMuscle(value) {
  return String(value || "").trim().toLowerCase();
}

function exerciseHasMuscle(exercise, muscle) {
  const target = normalizeMuscle(muscle);

  return (exercise.muscles || []).some(
    (exerciseMuscle) => normalizeMuscle(exerciseMuscle) === target
  );
}

function exercisePrimaryMuscleMatches(exercise, muscle) {
  return normalizeMuscle(exercise.muscles?.[0]) === normalizeMuscle(muscle);
}

function getExerciseEquipmentKey(exercise) {
  return (exercise.equipment || [])
    .map((equipment) => String(equipment).toLowerCase())
    .sort()
    .join("|");
}

function getExerciseVariantKey(exercise) {
  const name = exercise.name.toLowerCase();

  if (name.includes("hammer")) return "hammer";
  if (name.includes("supinated")) return "supinated";
  if (name.includes("wide neutral")) return "wide-neutral";
  if (name.includes("wide")) return "wide";
  if (name.includes("narrow")) return "narrow";
  if (name.includes("neutral")) return "neutral";
  if (name.includes("pushdown")) return "pushdown";
  if (name.includes("extension")) return "extension";
  if (name.includes("skull")) return "skull-crusher";
  if (name.includes("row")) return "row";
  if (name.includes("pulldown")) return "pulldown";
  if (name.includes("curl")) return "curl";
  if (name.includes("incline")) return "incline";
  if (name.includes("decline")) return "decline";

  return name.replace(/[^a-z0-9]+/g, "-");
}

function getMuscleUsageKey(muscle) {
  return normalizeMuscle(muscle);
}

function chooseExercise(exerciseLibrary, muscle, usage, offset) {
  const matchingCandidates = exerciseLibrary.filter((exercise) =>
    exerciseHasMuscle(exercise, muscle)
  );
  const primaryCandidates = matchingCandidates.filter((exercise) =>
    exercisePrimaryMuscleMatches(exercise, muscle)
  );
  const candidates = (primaryCandidates.length
    ? primaryCandidates
    : matchingCandidates
  )
    .sort((a, b) => a.name.localeCompare(b.name));

  if (!candidates.length) {
    return null;
  }

  const unusedCandidates = candidates.filter(
    (exercise) => !usage.exerciseIds.has(exercise.id)
  );
  const pool = unusedCandidates.length ? unusedCandidates : candidates;
  const muscleKey = getMuscleUsageKey(muscle);
  const usedEquipment = usage.equipmentByMuscle.get(muscleKey) || new Set();
  const usedVariants = usage.variantByMuscle.get(muscleKey) || new Set();
  const scoredPool = pool
    .map((exercise) => {
      let score = 0;

      if (!usedEquipment.has(getExerciseEquipmentKey(exercise))) {
        score += 2;
      }

      if (!usedVariants.has(getExerciseVariantKey(exercise))) {
        score += 2;
      }

      if (exercisePrimaryMuscleMatches(exercise, muscle)) {
        score += 3;
      }

      return {
        exercise,
        score,
      };
    })
    .sort(
      (a, b) =>
        b.score - a.score || a.exercise.name.localeCompare(b.exercise.name)
    );
  const bestScore = scoredPool[0]?.score ?? 0;
  const bestPool = scoredPool
    .filter((item) => item.score === bestScore)
    .map((item) => item.exercise);

  return bestPool[offset % bestPool.length];
}

function rememberExerciseUsage(usage, muscle, exercise) {
  const muscleKey = getMuscleUsageKey(muscle);
  const equipment = usage.equipmentByMuscle.get(muscleKey) || new Set();
  const variants = usage.variantByMuscle.get(muscleKey) || new Set();

  equipment.add(getExerciseEquipmentKey(exercise));
  variants.add(getExerciseVariantKey(exercise));
  usage.equipmentByMuscle.set(muscleKey, equipment);
  usage.variantByMuscle.set(muscleKey, variants);
  usage.exerciseIds.add(exercise.id);
}

function createSets(count, exercise, options) {
  return Array.from({ length: count }, (_, index) => {
    const recommendedTarget = getRecommendedTargetPrescription(exercise, {
      goal: options.goal,
      history: options.history,
      reps: options.reps,
      rir: options.rir,
      setIndex: index,
    });

    return {
      id: Date.now() + Math.random() + index,
      targetWeight: formatTargetValue(recommendedTarget?.weight),
      targetReps: formatTargetValue(recommendedTarget?.reps, options.reps),
      targetRir: formatTargetValue(recommendedTarget?.rir, options.rir),
    };
  });
}

function getGoalMode(goal) {
  return goal === "progress" ? "progress" : "maintenance";
}

function formatTargetValue(value, fallback = "") {
  return value == null || value === "" ? String(fallback) : String(value);
}

function getRecommendedTargetPrescription(exercise, options) {
  const recommendation = recommendSetTarget({
    exercise,
    goalMode: getGoalMode(options.goal),
    history: options.history,
    setIndex: options.setIndex,
    targetReps: options.reps,
    targetRir: options.rir,
  });

  return recommendation.result?.recommendation || null;
}

export function createPlanExercise({
  exercise,
  goal,
  history,
  planMuscle,
  reps,
  rir,
  setCount,
  supersetGroup,
}) {
  return {
    id: Date.now() + Math.random(),
    exerciseId: exercise.id,
    equipment: exercise.equipment,
    muscles: exercise.muscles,
    name: exercise.name,
    planMuscle,
    sets: createSets(setCount, exercise, {
      goal,
      history,
      reps,
      rir,
    }),
    supersetGroup,
  };
}

export function generatePlanWorkouts({
  daysPerWeek,
  durationWeeks,
  exerciseLibrary,
  goal = "maintain",
  history,
  planType,
  reps,
  rir,
  seed = 0,
}) {
  const config = PLAN_CONFIGS[planType] || PLAN_CONFIGS["type-2"];
  const requestedWorkoutCount = Math.max(1, Number(daysPerWeek) || 2);
  const workoutCount = Math.min(requestedWorkoutCount, config.workouts.length);
  const workoutDefinitions = config.workouts.slice(0, workoutCount);
  const activeExerciseLibrary = exerciseLibrary.filter(isExerciseActive);
  const usage = {
    equipmentByMuscle: new Map(),
    exerciseIds: new Set(),
    variantByMuscle: new Map(),
  };
  const gaps = [];

  const workouts = workoutDefinitions.map((workout, workoutIndex) => {
    const exercises = workout.groups.flatMap((group, groupIndex) =>
      group.muscles.flatMap((muscle, muscleIndex) => {
        const exercise = chooseExercise(
          activeExerciseLibrary,
          muscle,
          usage,
          seed + workoutIndex + groupIndex + muscleIndex
        );

        if (!exercise) {
          gaps.push(`${workout.name} ${group.label}: ${muscle}`);
          return [];
        }

        rememberExerciseUsage(usage, muscle, exercise);

        return [
          createPlanExercise({
            exercise,
            goal,
            history,
            planMuscle: muscle,
            reps,
            rir,
            setCount: group.sets,
            supersetGroup: group.supersetGroup === null ? null : group.label,
          }),
        ];
      })
    );

    return {
      id: Date.now() + Math.random(),
      durationWeeks: Number(durationWeeks) || null,
      daysPerWeek: workoutCount,
      exercises,
      lastCompleted: null,
      name: `${config.label} - ${workout.name}`,
      planType,
    };
  });

  return {
    gaps,
    workouts,
  };
}

export function generatePlanType2Workouts(options) {
  return generatePlanWorkouts({
    ...options,
    daysPerWeek: options.daysPerWeek || 2,
    planType: "type-2",
  });
}
