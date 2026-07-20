import { isExerciseActive } from "../utils/exerciseStatus";
import { recommendSetTarget } from "../utils/targetRecommendation";
import { getExerciseWeightIncrement } from "../utils/weightIncrement";

const CHEST_MUSCLES = ["Chest", "Upper Chest"];
const LEG_MUSCLES = ["Glutes", "Quads", "Hamstrings"];
const PULL_MUSCLES = ["Lats", "Upper Back"];
const UPPER_BODY_CATEGORIES = ["Lats", "Upper Back", "Chest"];

const PLAN_CONFIGS = {
  "type-1": {
    label: "Plan Type 1 'Laura'",
  },
  "type-2": {
    label: "Plan Type 2 'Sam'",
  },
  "type-3": {
    label: "Plan Type 3 'Ira'",
  },
  "type-4": {
    label: "Plan Type 4 'General'",
  },
};

const TYPE_3_WORKOUT_SEQUENCE = ["push", "pull", "lower", "upper", "lower"];

const WORKOUT_TYPE_CONFIGS = {
  "type-1": {
    label: "Workout Type 1",
  },
  "type-2": {
    label: "Workout Type 2",
  },
  push: {
    label: "Push",
  },
  pull: {
    label: "Pull",
  },
  upper: {
    label: "Upper",
  },
  lower: {
    label: "Lower",
  },
  "full-body": {
    label: "Full Body",
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

function getExerciseSearchText(exercise) {
  return [exercise.name, ...(exercise.equipment || [])]
    .join(" ")
    .toLowerCase();
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

function getChestVariantKey(exercise) {
  const name = exercise.name.toLowerCase();

  if (name.includes("decline")) return "decline";
  if (name.includes("incline")) return "incline";
  if (normalizeMuscle(exercise.muscles?.[0]) === "upper chest") {
    return "incline";
  }
  if (name.includes("fly") || name.includes("flye")) return "fly";

  return "flat";
}

function getPullVariantKey(exercise) {
  const text = getExerciseSearchText(exercise);
  const movement = text.includes("pulldown")
    ? "pulldown"
    : text.includes("pull up") || text.includes("pull-up")
      ? "pull-up"
      : text.includes("row")
        ? "row"
        : "pull";
  let grip = "standard";

  if (text.includes("wide neutral")) {
    grip = "wide-neutral";
  } else if (text.includes("wide")) {
    grip = "wide";
  } else if (
    text.includes("narrow") ||
    text.includes("close grip") ||
    text.includes("close-grip")
  ) {
    grip = "narrow";
  } else if (text.includes("neutral")) {
    grip = "neutral";
  } else if (
    text.includes("supinated") ||
    text.includes("underhand") ||
    text.includes("reverse")
  ) {
    grip = "supinated";
  } else if (
    text.includes("pronated") ||
    text.includes("overhand") ||
    text.includes("straight bar")
  ) {
    grip = "overhand";
  }

  return `${movement}:${grip}`;
}

function getMuscleUsageKey(muscle) {
  return normalizeMuscle(muscle);
}

function getUpperCategoryKey(muscle) {
  return muscle === "Chest" || CHEST_MUSCLES.includes(muscle)
    ? "category:chest"
    : muscle;
}

function getUsageTotal(usage, key) {
  return usage.setTotalsByMuscle.get(key) || 0;
}

function stableHash(...parts) {
  const input = parts.join("|");
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function chooseLeastUsed(candidates, usage, options = {}) {
  const excluded = new Set(options.exclude || []);
  const excludedKeys = new Set(options.excludeKeys || []);
  const getKey = (candidate) => options.keyFn?.(candidate) || candidate;
  const pool = candidates.filter(
    (candidate) => !excluded.has(candidate) && !excludedKeys.has(getKey(candidate))
  );
  const availablePool = pool.length ? pool : candidates;
  const totals = availablePool.map((candidate) =>
    getUsageTotal(usage, getKey(candidate))
  );
  const minimum = Math.min(...totals);
  const bestPool = availablePool.filter(
    (candidate) => getUsageTotal(usage, getKey(candidate)) === minimum
  );
  const offset = Number(options.offset) || 0;

  return bestPool[offset % bestPool.length];
}

function chooseChestMuscle(usage, offset) {
  return chooseLeastUsed(CHEST_MUSCLES, usage, { offset });
}

function chooseUpperMuscle(usage, options = {}) {
  const category = chooseLeastUsed(UPPER_BODY_CATEGORIES, usage, {
    exclude: options.exclude,
    excludeKeys: options.excludeKeys,
    keyFn: getUpperCategoryKey,
    offset: options.offset,
  });

  if (category !== "Chest") {
    return category;
  }

  return chooseChestMuscle(usage, options.offset);
}

function rememberMuscleSets(usage, muscle, sets) {
  const currentMuscleTotal = getUsageTotal(usage, muscle);
  usage.setTotalsByMuscle.set(muscle, currentMuscleTotal + sets);

  const categoryKey = getUpperCategoryKey(muscle);
  if (categoryKey !== muscle) {
    const currentCategoryTotal = getUsageTotal(usage, categoryKey);
    usage.setTotalsByMuscle.set(categoryKey, currentCategoryTotal + sets);
  }
}

function createGroup(label, muscles, sets, supersetGroup = label) {
  return { label, muscles, sets, supersetGroup };
}

function chooseArmPair(seed, workoutIndex) {
  const startsWithTriceps = stableHash(seed, workoutIndex, "arms") % 2 === 0;
  return startsWithTriceps ? ["Triceps", "Biceps"] : ["Biceps", "Triceps"];
}

function buildType1Workout(workoutIndex, usage, seed) {
  const baseOffset = stableHash(seed, "type-1", workoutIndex);
  const firstLeg = chooseLeastUsed(LEG_MUSCLES, usage, {
    offset: baseOffset,
  });
  rememberMuscleSets(usage, firstLeg, 2);

  const firstUpper = chooseUpperMuscle(usage, {
    offset: baseOffset + 2,
  });
  rememberMuscleSets(usage, firstUpper, 2);

  const secondLeg = chooseLeastUsed(LEG_MUSCLES, usage, {
    exclude: [firstLeg],
    offset: baseOffset + 1,
  });
  rememberMuscleSets(usage, secondLeg, 2);

  const secondUpper = chooseUpperMuscle(usage, {
    excludeKeys: [getUpperCategoryKey(firstUpper)],
    offset: baseOffset + 3,
  });
  rememberMuscleSets(usage, secondUpper, 2);

  const armPair = chooseArmPair(seed, workoutIndex);
  rememberMuscleSets(usage, armPair[0], 2);
  rememberMuscleSets(usage, armPair[1], 2);

  return {
    name: `Workout ${workoutIndex + 1}`,
    groups: [
      createGroup("A", [firstLeg, firstUpper], 2),
      createGroup("B", [secondLeg, secondUpper], 2),
      createGroup("C", armPair, 2),
    ],
    workoutType: "type-1",
    workoutTypeLabel: WORKOUT_TYPE_CONFIGS["type-1"].label,
  };
}

function buildType2Workout(workoutIndex, usage, seed) {
  const baseOffset = stableHash(seed, "type-2", workoutIndex);
  const firstLeg = chooseLeastUsed(LEG_MUSCLES, usage, {
    offset: baseOffset,
  });
  rememberMuscleSets(usage, firstLeg, 3);

  const firstUpper = chooseUpperMuscle(usage, {
    offset: baseOffset + 2,
  });
  rememberMuscleSets(usage, firstUpper, 3);

  const secondLeg = chooseLeastUsed(LEG_MUSCLES, usage, {
    exclude: [firstLeg],
    offset: baseOffset + 1,
  });
  rememberMuscleSets(usage, secondLeg, 3);

  const secondUpper = chooseUpperMuscle(usage, {
    excludeKeys: [getUpperCategoryKey(firstUpper)],
    offset: baseOffset + 3,
  });
  rememberMuscleSets(usage, secondUpper, 3);

  const thirdUpper = chooseUpperMuscle(usage, {
    offset: baseOffset + 4,
  });
  rememberMuscleSets(usage, thirdUpper, 2);

  const fourthUpper = chooseUpperMuscle(usage, {
    excludeKeys: [getUpperCategoryKey(thirdUpper)],
    offset: baseOffset + 5,
  });
  rememberMuscleSets(usage, fourthUpper, 2);

  const armPair = chooseArmPair(seed, workoutIndex);
  rememberMuscleSets(usage, armPair[0], 2);
  rememberMuscleSets(usage, armPair[1], 2);
  rememberMuscleSets(usage, "Abs", 3);

  return {
    name: `Workout ${workoutIndex + 1}`,
    groups: [
      createGroup("A", [firstLeg, firstUpper], 3),
      createGroup("B", [secondLeg, secondUpper], 3),
      createGroup("C", [thirdUpper, fourthUpper], 2),
      createGroup("D", armPair, 2),
      createGroup("Abs", ["Abs"], 3, null),
    ],
    workoutType: "type-2",
    workoutTypeLabel: WORKOUT_TYPE_CONFIGS["type-2"].label,
  };
}

function buildNamedWorkout(workoutType, setCount = 3) {
  const sets = Math.max(1, Number(setCount) || 3);
  const workoutGroupsByType = {
    push: [
      createGroup("Chest", ["Upper Chest", "Chest", "Chest"], sets, null),
      createGroup("Shoulders", ["Side Delts", "Rear Delts"], sets, null),
      createGroup("Triceps", ["Triceps", "Triceps"], sets, null),
      createGroup("Abs", ["Abs"], sets, null),
    ],
    pull: [
      createGroup("Back", ["Lats", "Upper Back", "Lats"], sets, null),
      createGroup("Delts", ["Rear Delts", "Side Delts"], sets, null),
      createGroup("Traps", ["Traps"], sets, null),
      createGroup("Biceps", ["Biceps", "Biceps"], sets, null),
    ],
    upper: [
      createGroup("Chest", ["Upper Chest", "Chest"], sets, null),
      createGroup("Back", ["Lats", "Upper Back"], sets, null),
      createGroup("Shoulders", ["Side Delts"], sets, null),
      createGroup("Arms", ["Triceps", "Biceps"], sets, null),
    ],
    lower: [
      createGroup("Legs", ["Glutes", "Quads", "Hamstrings"], sets, null),
      createGroup("Calves", ["Calves"], sets, null),
      createGroup("Core", ["Abs", "Obliques"], sets, null),
    ],
    "full-body": [
      createGroup("Lower", ["Glutes", "Quads"], sets, null),
      createGroup("Chest", ["Chest"], sets, null),
      createGroup("Back", ["Lats", "Upper Back"], sets, null),
      createGroup("Shoulders", ["Side Delts"], sets, null),
      createGroup("Arms", ["Triceps", "Biceps"], sets, null),
      createGroup("Abs", ["Abs"], sets, null),
    ],
  };

  return {
    name: WORKOUT_TYPE_CONFIGS[workoutType]?.label || "Workout",
    groups: workoutGroupsByType[workoutType] || workoutGroupsByType["full-body"],
    workoutType,
    workoutTypeLabel: WORKOUT_TYPE_CONFIGS[workoutType]?.label || "Workout",
  };
}

function buildWorkoutDefinitions({
  daysPerWeek,
  planType,
  seed,
  setCount,
  workoutTypeByDay,
}) {
  const workoutCount = Math.max(1, Math.min(6, Number(daysPerWeek) || 2));

  if (planType === "type-3") {
    return Array.from({ length: workoutCount }, (_, workoutIndex) =>
      buildNamedWorkout(
        TYPE_3_WORKOUT_SEQUENCE[workoutIndex % TYPE_3_WORKOUT_SEQUENCE.length],
        setCount
      )
    );
  }

  if (planType === "type-4") {
    return Array.from({ length: workoutCount }, (_, workoutIndex) =>
      buildNamedWorkout(workoutTypeByDay?.[workoutIndex] || "full-body", setCount)
    );
  }

  const usage = {
    setTotalsByMuscle: new Map(),
  };
  const builder = planType === "type-1" ? buildType1Workout : buildType2Workout;

  return Array.from({ length: workoutCount }, (_, workoutIndex) =>
    builder(workoutIndex, usage, seed)
  );
}

function buildSingleWorkoutDefinition({ planType, seed, setCount, workoutType }) {
  if (workoutType === "type-1") {
    return buildType1Workout(0, { setTotalsByMuscle: new Map() }, seed);
  }

  if (workoutType === "type-2") {
    return buildType2Workout(0, { setTotalsByMuscle: new Map() }, seed);
  }

  return buildNamedWorkout(workoutType || planType || "full-body", setCount);
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

      if (CHEST_MUSCLES.includes(muscle)) {
        const usedChestVariants = usage.chestVariants || new Set();
        const chestVariant = getChestVariantKey(exercise);

        if (!usedChestVariants.has(chestVariant)) {
          score += 2;
        }

        if (chestVariant === "decline") {
          score -= 3;
        }
      }

      if (PULL_MUSCLES.includes(muscle)) {
        const usedPullVariants = usage.pullVariants || new Set();
        const pullVariant = getPullVariantKey(exercise);

        if (!usedPullVariants.has(pullVariant)) {
          score += 3;
        }
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

  if (CHEST_MUSCLES.includes(muscle)) {
    const chestVariants = usage.chestVariants || new Set();
    chestVariants.add(getChestVariantKey(exercise));
    usage.chestVariants = chestVariants;
  }

  if (PULL_MUSCLES.includes(muscle)) {
    const pullVariants = usage.pullVariants || new Set();
    pullVariants.add(getPullVariantKey(exercise));
    usage.pullVariants = pullVariants;
  }

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
    allowedRepWindow: 2,
    exercise,
    goalMode: getGoalMode(options.goal),
    history: options.history,
    preferredRepWindow: 2,
    setIndex: options.setIndex,
    targetReps: options.reps,
    targetRir: options.rir,
    weightIncrement: getExerciseWeightIncrement(exercise),
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
  generationMode = "plan",
  goal = "maintain",
  history,
  planType,
  reps,
  rir,
  seed = 0,
  sets,
  workoutType,
  workoutTypeByDay,
}) {
  const config = PLAN_CONFIGS[planType] || PLAN_CONFIGS["type-2"];
  const resolvedPlanType = PLAN_CONFIGS[planType] ? planType : "type-2";
  const isWorkoutMode = generationMode === "workout";
  const workoutConfig =
    WORKOUT_TYPE_CONFIGS[workoutType] || WORKOUT_TYPE_CONFIGS["full-body"];
  const workoutDefinitions = isWorkoutMode
    ? [
        buildSingleWorkoutDefinition({
          planType: resolvedPlanType,
          seed,
          setCount: sets,
          workoutType,
        }),
      ]
    : buildWorkoutDefinitions({
        daysPerWeek,
        planType: resolvedPlanType,
        seed,
        setCount: sets,
        workoutTypeByDay,
      });
  const workoutCount = workoutDefinitions.length;
  const activeExerciseLibrary = exerciseLibrary.filter(isExerciseActive);
  const usage = {
    chestVariants: new Set(),
    equipmentByMuscle: new Map(),
    exerciseIds: new Set(),
    pullVariants: new Set(),
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
      name: isWorkoutMode
        ? `${workoutConfig.label} Workout`
        : `${config.label} - ${workout.name}`,
      planType,
      workoutTypeLabel: workout.workoutTypeLabel || null,
      workoutType: isWorkoutMode
        ? workoutType
        : workout.workoutType || workoutTypeByDay?.[workoutIndex] || null,
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
