import { isExerciseActive } from "../utils/exerciseStatus";

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
  "type-5": {
    label: "Plan Type 5 'App'",
  },
  ai: {
    label: "Plan Type AI",
  },
};

const TYPE_3_WORKOUT_SEQUENCE = ["push", "pull", "lower", "upper", "lower"];
const TYPE_5_WORKOUT_SEQUENCE = ["push", "pull", "lower", "upper", "lower"];

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

function createSlot(muscle, options = {}) {
  return {
    muscle,
    ...options,
  };
}

function resolveGroupSlot(slot) {
  if (!slot || typeof slot !== "object") {
    return {
      muscle: slot,
    };
  }

  return slot;
}

function getRestDurationForReps(reps) {
  const numericReps = Number.parseInt(String(reps ?? ""), 10);

  if (!Number.isFinite(numericReps)) {
    return 120;
  }

  if (numericReps <= 6) {
    return 180;
  }

  if (numericReps <= 8) {
    return 150;
  }

  if (numericReps <= 10) {
    return 120;
  }

  if (numericReps <= 12) {
    return 90;
  }

  return 60;
}

function getSlotSetCount(slot, group) {
  const slotConfig = resolveGroupSlot(slot);
  return Math.max(1, Number(slotConfig.sets || group.sets) || 1);
}

function getSlotReps(slot, fallbackReps = 8) {
  const slotConfig = resolveGroupSlot(slot);
  return slotConfig.reps || fallbackReps;
}

function estimateWorkoutDurationMinutes(groups, options = {}) {
  const secondsPerSet = Number(options.secondsPerSet) || 45;
  const transitionSeconds = Number(options.transitionSeconds) || 45;
  const totalSeconds = groups.reduce((workoutTotal, group) => {
    const groupSeconds = group.muscles.reduce((groupTotal, slot) => {
      const setCount = getSlotSetCount(slot, group);
      const restSeconds = getRestDurationForReps(getSlotReps(slot));

      return (
        groupTotal +
        transitionSeconds +
        setCount * secondsPerSet +
        Math.max(0, setCount - 1) * restSeconds
      );
    }, 0);

    return workoutTotal + groupSeconds;
  }, 0);

  return Math.round(totalSeconds / 60);
}

function getRecentPlanContext(planHistoryWorkouts = []) {
  const recentExerciseIds = new Map();
  const recentEquipmentByMuscle = new Map();
  const recentSetTotalsByMuscle = new Map();
  const recentVariantByMuscle = new Map();

  (planHistoryWorkouts || []).forEach((workout) => {
    (workout?.exercises || []).forEach((exercise) => {
      const exerciseId = exercise.exerciseId || exercise.id;
      const muscle = exercise.planMuscle || exercise.muscles?.[0];

      if (!muscle) {
        return;
      }

      if (exerciseId != null) {
        const exerciseKey = String(exerciseId);
        recentExerciseIds.set(
          exerciseKey,
          (recentExerciseIds.get(exerciseKey) || 0) + 1
        );
      }

      const muscleKey = getMuscleUsageKey(muscle);
      const equipment = recentEquipmentByMuscle.get(muscleKey) || new Map();
      const equipmentKey = getExerciseEquipmentKey(exercise);
      equipment.set(equipmentKey, (equipment.get(equipmentKey) || 0) + 1);
      recentEquipmentByMuscle.set(muscleKey, equipment);

      const variant = recentVariantByMuscle.get(muscleKey) || new Map();
      const variantKey = getExerciseVariantKey(exercise);
      variant.set(variantKey, (variant.get(variantKey) || 0) + 1);
      recentVariantByMuscle.set(muscleKey, variant);

      recentSetTotalsByMuscle.set(
        muscleKey,
        (recentSetTotalsByMuscle.get(muscleKey) || 0) +
          Math.max(1, exercise.sets?.length || 1)
      );
    });
  });

  return {
    recentEquipmentByMuscle,
    recentExerciseIds,
    recentSetTotalsByMuscle,
    recentVariantByMuscle,
  };
}

function getRecentSetTotal(recentPlanContext, muscle) {
  return (
    recentPlanContext?.recentSetTotalsByMuscle?.get(getMuscleUsageKey(muscle)) ||
    0
  );
}

function adjustType5VolumeForRecentContext(groups, recentPlanContext) {
  if (!recentPlanContext) {
    return groups;
  }

  const optionalGroups = new Set([
    "Abs",
    "Accessory",
    "Biceps",
    "Biceps Heavy",
    "Biceps Volume",
    "Calves",
    "Chest Accessory",
    "Core",
    "Hamstrings",
    "Quad Accessory",
    "Rear Delts",
    "Side Delts",
    "Traps",
    "Triceps",
  ]);

  return groups.map((group) => {
    if (!optionalGroups.has(group.label)) {
      return group;
    }

    return {
      ...group,
      muscles: group.muscles.map((slot) => {
        const slotConfig = resolveGroupSlot(slot);
        const currentSets = getSlotSetCount(slotConfig, group);
        const recentSets = getRecentSetTotal(
          recentPlanContext,
          slotConfig.muscle
        );
        let nextSets = currentSets;

        if (recentSets <= 6 && currentSets < 4) {
          nextSets = currentSets + 1;
        } else if (recentSets >= 16 && currentSets > 3) {
          nextSets = currentSets - 1;
        }

        if (nextSets === currentSets) {
          return slot;
        }

        return {
          ...slotConfig,
          sets: nextSets,
        };
      }),
    };
  });
}

function trimWorkoutDuration(groups, targetMinutes) {
  const nextGroups = groups.map((group) => ({
    ...group,
    muscles: group.muscles.map((slot) =>
      typeof slot === "object" && slot
        ? {
            ...slot,
          }
        : slot
    ),
  }));
  const groupPriority = [
    "Accessory",
    "Core",
    "Abs",
    "Biceps Volume",
    "Traps",
    "Side Delts",
    "Rear Delts",
    "Chest Accessory",
    "Quad Accessory",
    "Calves",
  ];
  let guard = 0;

  while (
    estimateWorkoutDurationMinutes(nextGroups) > targetMinutes &&
    guard < 20
  ) {
    guard += 1;
    const group = groupPriority
      .map((label) => nextGroups.find((item) => item.label === label))
      .find((item) =>
        item?.muscles.some((slot) => getSlotSetCount(slot, item) > 3)
      );

    if (!group) {
      break;
    }

    const slotIndex = group.muscles.findIndex(
      (slot) => getSlotSetCount(slot, group) > 3
    );
    const slot = group.muscles[slotIndex];
    const currentSets = getSlotSetCount(slot, group);

    group.muscles[slotIndex] =
      typeof slot === "object" && slot
        ? {
            ...slot,
            sets: currentSets - 1,
          }
        : createSlot(slot, {
            sets: currentSets - 1,
          });
  }

  return nextGroups;
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

function buildType5Workout(workoutIndex, recentPlanContext) {
  const workoutType =
    TYPE_5_WORKOUT_SEQUENCE[workoutIndex % TYPE_5_WORKOUT_SEQUENCE.length];
  const isSecondLowerDay =
    workoutType === "lower" &&
    workoutIndex % TYPE_5_WORKOUT_SEQUENCE.length === 4;
  const workoutDefinitionsByType = {
    push: {
      groups: [
        createGroup(
          "Bench",
          [
            createSlot("Chest", {
              anchor: true,
              prefer: ["bench press barbell"],
              avoid: ["close grip", "decline", "dumbbell"],
              reps: 6,
              sets: 4,
            }),
          ],
          4,
          null
        ),
        createGroup(
          "Upper Chest",
          [
            createSlot("Upper Chest", {
              prefer: ["incline bench press"],
              avoid: ["60", "close grip"],
              reps: 9,
              sets: 4,
            }),
          ],
          4,
          null
        ),
        createGroup(
          "Chest Accessory",
          [
            createSlot("Chest", {
              prefer: ["flys", "high cable flys"],
              reps: 11,
              sets: 4,
            }),
          ],
          4,
          null
        ),
        createGroup(
          "Rear Delts",
          [
            createSlot("Rear Delts", {
              prefer: ["reverse flys", "incline reverse flys"],
              reps: 10,
              sets: 4,
            }),
          ],
          4,
          null
        ),
        createGroup("Side Delts", [createSlot("Side Delts", { reps: 12 })], 3, null),
        createGroup("Triceps", [createSlot("Triceps", { reps: 10, sets: 4 })], 4, null),
        createGroup("Traps", [createSlot("Traps", { reps: 12 })], 3, null),
      ],
    },
    pull: {
      groups: [
        createGroup(
          "Vertical Pull",
          [
            createSlot("Lats", {
              anchor: true,
              prefer: ["pull-ups", "lat pulldowns"],
              reps: 6,
              sets: 4,
            }),
          ],
          4,
          null
        ),
        createGroup(
          "Rows",
          [
            createSlot("Upper Back", {
              anchor: true,
              prefer: ["rows", "t-bar rows"],
              reps: 8,
              sets: 4,
            }),
          ],
          4,
          null
        ),
        createGroup(
          "Second Vertical Pull",
          [
            createSlot("Lats", {
              prefer: ["lat pulldowns", "pull-ups"],
              reps: 10,
              sets: 3,
            }),
          ],
          3,
          null
        ),
        createGroup("Side Delts", [createSlot("Side Delts", { reps: 10, sets: 4 })], 4, null),
        createGroup("Rear Delts", [createSlot("Rear Delts", { reps: 12, sets: 4 })], 4, null),
        createGroup("Biceps Heavy", [createSlot("Biceps", { reps: 9, sets: 4 })], 4, null),
        createGroup("Biceps Volume", [createSlot("Biceps", { reps: 11 })], 3, null),
        createGroup("Abs", [createSlot("Abs", { reps: 10, sets: 4 })], 4, null),
      ],
    },
    lower: {
      groups: [
        createGroup(
          "Hinge",
          [
            createSlot("Glutes", {
              anchor: true,
              prefer: isSecondLowerDay
                ? ["sumo deadlifts", "deadlifts"]
                : ["deadlifts", "romanian deadlifts"],
              avoid: ["deficit"],
              reps: 6,
              sets: 4,
            }),
          ],
          4,
          null
        ),
        createGroup(
          "Squat",
          [
            createSlot("Quads", {
              prefer: isSecondLowerDay
                ? ["split squats", "lunges"]
                : ["front squats", "landmine front squat", "squats"],
              reps: isSecondLowerDay ? 11 : 8,
              sets: isSecondLowerDay ? 3 : 4,
            }),
          ],
          3,
          null
        ),
        createGroup(
          "Hamstrings",
          [
            createSlot("Hamstrings", {
              prefer: ["leg curls", "seated leg curls"],
              reps: isSecondLowerDay ? 9 : 10,
              sets: 4,
            }),
          ],
          4,
          null
        ),
        ...(isSecondLowerDay
          ? []
          : [
              createGroup(
                "Quad Accessory",
                [
                  createSlot("Quads", {
                    prefer: ["leg extensions", "lunges"],
                    reps: 10,
                  }),
                ],
                3,
                null
              ),
            ]),
        createGroup("Calves", [createSlot("Calves", { reps: isSecondLowerDay ? 12 : 10 })], 3, null),
        createGroup(
          "Accessory",
          isSecondLowerDay
            ? [createSlot("Obliques", { reps: 10, sets: 4 })]
            : [
                createSlot("Front Delts", {
                  prefer: ["landmine press", "shoulder press"],
                  reps: 10,
                  sets: 4,
                }),
              ],
          isSecondLowerDay ? 4 : 4,
          null
        ),
        createGroup("Core", [createSlot("Abs", { reps: isSecondLowerDay ? 12 : 10 })], 3, null),
      ],
    },
    upper: {
      groups: [
        createGroup(
          "Bench Variation",
          [
            createSlot("Chest", {
              anchor: true,
              prefer: ["bench press", "incline bench press"],
              avoid: ["decline"],
              reps: 8,
              sets: 4,
            }),
          ],
          4,
          null
        ),
        createGroup(
          "Incline Chest",
          [
            createSlot("Upper Chest", {
              prefer: ["incline bench press 20", "incline bench press"],
              reps: 12,
              sets: 4,
            }),
          ],
          4,
          null
        ),
        createGroup(
          "Row",
          [
            createSlot("Upper Back", {
              prefer: ["incline rows", "rows"],
              reps: 9,
            }),
          ],
          3,
          null
        ),
        createGroup(
          "Vertical Pull",
          [
            createSlot("Lats", {
              prefer: ["pull-ups", "lat pulldowns"],
              reps: 11,
            }),
          ],
          3,
          null
        ),
        createGroup("Shoulders", [createSlot("Side Delts", { reps: 15 })], 3, null),
        createGroup("Triceps", [createSlot("Triceps", { prefer: ["dips"], reps: 12, sets: 4 })], 4, null),
        createGroup("Biceps", [createSlot("Biceps", { reps: 15, sets: 4 })], 4, null),
      ],
    },
  };

  const targetMinutes = workoutType === "lower" ? 82 : 90;
  const groups = trimWorkoutDuration(
    adjustType5VolumeForRecentContext(
      workoutDefinitionsByType[workoutType].groups,
      recentPlanContext
    ),
    targetMinutes
  );

  return {
    estimatedDurationMinutes: estimateWorkoutDurationMinutes(groups),
    name: WORKOUT_TYPE_CONFIGS[workoutType]?.label || "Workout",
    groups,
    workoutType,
    workoutTypeLabel: WORKOUT_TYPE_CONFIGS[workoutType]?.label || "Workout",
  };
}

function buildWorkoutDefinitions({
  daysPerWeek,
  planType,
  recentPlanContext,
  seed,
  setCount,
  workoutTypeByDay,
}) {
  const workoutCount = Math.max(1, Math.min(6, Number(daysPerWeek) || 2));

  if (planType === "ai") {
    return [];
  }

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

  if (planType === "type-5") {
    return Array.from({ length: workoutCount }, (_, workoutIndex) =>
      buildType5Workout(workoutIndex, recentPlanContext)
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

function chooseExercise(exerciseLibrary, muscle, usage, offset, options = {}) {
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
      const searchText = getExerciseSearchText(exercise);

      if (!usedEquipment.has(getExerciseEquipmentKey(exercise))) {
        score += 2;
      }

      if (!usedVariants.has(getExerciseVariantKey(exercise))) {
        score += 2;
      }

      if (exercisePrimaryMuscleMatches(exercise, muscle)) {
        score += 3;
      }

      if (
        options.prefer?.some((term) =>
          searchText.includes(String(term).toLowerCase())
        )
      ) {
        score += 5;
      }

      if (
        options.avoid?.some((term) =>
          searchText.includes(String(term).toLowerCase())
        )
      ) {
        score -= 4;
      }

      const recentPlanContext = usage.recentPlanContext;
      const recentExerciseUseCount =
        recentPlanContext?.recentExerciseIds?.get(String(exercise.id)) || 0;
      const recentVariantUseCount =
        recentPlanContext?.recentVariantByMuscle
          ?.get(muscleKey)
          ?.get(getExerciseVariantKey(exercise)) || 0;
      const recentEquipmentUseCount =
        recentPlanContext?.recentEquipmentByMuscle
          ?.get(muscleKey)
          ?.get(getExerciseEquipmentKey(exercise)) || 0;
      const anchorMultiplier = options.anchor ? 0.4 : 1;

      score -= Math.min(8, recentExerciseUseCount * 3) * anchorMultiplier;
      score -= Math.min(5, recentVariantUseCount * 2) * anchorMultiplier;
      score -= Math.min(3, recentEquipmentUseCount) * anchorMultiplier;

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
  return Array.from({ length: count }, (_, index) => ({
    id: Date.now() + Math.random() + index,
    reps: formatTargetValue(options.reps),
    rir: formatTargetValue(options.rir),
  }));
}

function formatTargetValue(value, fallback = "") {
  return value == null || value === "" ? String(fallback) : String(value);
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
  planHistoryWorkouts,
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
  const recentPlanContext =
    resolvedPlanType === "type-5"
      ? getRecentPlanContext(planHistoryWorkouts)
      : null;
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
        recentPlanContext,
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
    recentPlanContext,
    variantByMuscle: new Map(),
  };
  const gaps = [];

  const workouts = workoutDefinitions.map((workout, workoutIndex) => {
    const exercises = workout.groups.flatMap((group, groupIndex) =>
      group.muscles.flatMap((slot, muscleIndex) => {
        const slotConfig = resolveGroupSlot(slot);
        const muscle = slotConfig.muscle;
        const exercise = chooseExercise(
          activeExerciseLibrary,
          muscle,
          usage,
          seed + workoutIndex + groupIndex + muscleIndex,
          slotConfig
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
            reps: slotConfig.reps || reps,
            rir: slotConfig.rir || rir,
            setCount: slotConfig.sets || group.sets,
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
      estimatedDurationMinutes: workout.estimatedDurationMinutes || null,
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
