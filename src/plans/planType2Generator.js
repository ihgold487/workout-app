import { calculateE1RM } from "../utils/e1rm";
import { isExerciseActive } from "../utils/exerciseStatus";

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

function getExerciseE1RM(exercise, exerciseMetadata, history) {
  const metadata = exerciseMetadata?.[exercise.id] || {};

  if (metadata.latestE1RM?.value) {
    return metadata.latestE1RM.value;
  }

  if (metadata.maxE1RM?.value) {
    return metadata.maxE1RM.value;
  }

  for (const workout of history || []) {
    const performedExercise = workout.exercises?.find(
      (item) => item.exerciseId === exercise.id
    );

    if (!performedExercise) {
      continue;
    }

    const bestSetE1RM = performedExercise.sets?.reduce((best, set) => {
      const estimated = calculateE1RM(
        set.actualWeight || set.targetWeight,
        set.actualReps || set.targetReps,
        set.actualRir ?? set.targetRir
      );

      return estimated && (!best || estimated > best) ? estimated : best;
    }, null);

    if (bestSetE1RM) {
      return bestSetE1RM;
    }
  }

  return null;
}

function estimateTargetWeight(exercise, exerciseMetadata, history, reps, rir) {
  const e1RM = getExerciseE1RM(exercise, exerciseMetadata, history);
  const targetReps = Number(reps);
  const targetRir = Number(rir || 0);

  if (!e1RM || !Number.isFinite(targetReps)) {
    return "";
  }

  const rawWeight = e1RM / (1 + (targetReps + targetRir) / 30);
  const rounded = Math.round(rawWeight / 5) * 5;

  return rounded > 0 ? String(rounded) : "";
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
  const targetWeight = estimateTargetWeight(
    exercise,
    options.exerciseMetadata,
    options.history,
    options.reps,
    options.rir
  );

  return Array.from({ length: count }, (_, index) => ({
    id: Date.now() + Math.random() + index,
    targetWeight,
    targetReps: String(options.reps),
    targetRir: String(options.rir),
  }));
}

export function createPlanExercise({
  exercise,
  exerciseMetadata,
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
      exerciseMetadata,
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
  exerciseMetadata,
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
            exerciseMetadata,
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
