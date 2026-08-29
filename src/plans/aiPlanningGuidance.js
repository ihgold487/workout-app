import {
  BENCHMARK_FAMILY_OPTIONS,
  getBenchmarkFamilyForExercise,
  isExerciseBenchmark,
} from "../utils/exerciseBenchmark";

export const AI_PLANNING_GUIDANCE_STORAGE_KEY =
  "workout-app.ai-planning-guidance.v1";

export const AI_BENCHMARK_FAMILIES = BENCHMARK_FAMILY_OPTIONS.map((family) => ({
  benchmarkFamily: family.contextLabel,
  id:
    family.key === "chest_barbell_press"
      ? "chestBarbellPress"
      : family.key === "posterior_chain_deadlift"
        ? "posteriorChainDeadlift"
        : "verticalPull",
  key: family.key,
  label: family.label,
}));

const DEFAULT_BENCHMARK_FAMILY_PRIORITIES = {
  chestBarbellPress: {
    emphasis: "strengthAndHypertrophy",
    benchmarkSelection: "Bench Press",
  },
  posteriorChainDeadlift: {
    emphasis: "aiDecides",
    benchmarkSelection: "aiDecides",
  },
  verticalPull: {
    emphasis: "aiDecides",
    benchmarkSelection: "aiDecides",
  },
};

export const DEFAULT_AI_PLANNING_GUIDANCE = {
  strengthPriority: "high",
  hypertrophyPriority: "high",
  muscleHypertrophyPriorities: "Chest",
  exerciseStrengthPriorities: "Bench Press",
  benchmarkFamilyPriorities: DEFAULT_BENCHMARK_FAMILY_PRIORITIES,
  additionalPriorities: "",
  blockEmphasis: "aiDecides",
  daysMode: "fixed",
  daysMin: "5",
  daysMax: "5",
  weeksMode: "fixed",
  weeksMin: "5",
  weeksMax: "5",
  deloadMode: "required",
  workoutDurationEnabled: false,
  workoutMinutesMin: "45",
  workoutMinutesTarget: "60",
  workoutMinutesMax: "75",
  setsMin: "3",
  setsMax: "4",
  restMode: "aiDecides",
  restMaximumSeconds: "",
  supersetMode: "aiDecides",
  dropSetMode: "aiDecides",
  requiredExercises: "",
  preferredExercises: "",
  avoidedExercises: "",
  userNotes: "",
};

function parseList(value) {
  return String(value || "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePositiveInteger(value) {
  const parsed = Number.parseInt(String(value || ""), 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function buildRange(mode, minimum, maximum) {
  const min = parsePositiveInteger(minimum);
  const max = parsePositiveInteger(maximum);

  if (mode === "aiDecides") {
    return { mode: "aiDecides" };
  }

  if (mode === "fixed") {
    return {
      mode: "fixed",
      value: min || max,
    };
  }

  return {
    mode: "range",
    min: min || null,
    max: max || null,
  };
}

export function readAiPlanningGuidance() {
  if (typeof window === "undefined") {
    return DEFAULT_AI_PLANNING_GUIDANCE;
  }

  try {
    const stored = JSON.parse(
      window.localStorage.getItem(AI_PLANNING_GUIDANCE_STORAGE_KEY) || "null"
    );

    if (!stored || typeof stored !== "object") {
      return DEFAULT_AI_PLANNING_GUIDANCE;
    }

    const migratedAdditionalPriorities =
      stored.additionalPriorities == null &&
      (stored.muscleHypertrophyPriorities !== "Chest" ||
        stored.exerciseStrengthPriorities !== "Bench Press")
        ? [
            stored.muscleHypertrophyPriorities
              ? `Hypertrophy: ${stored.muscleHypertrophyPriorities}`
              : null,
            stored.exerciseStrengthPriorities
              ? `Strength: ${stored.exerciseStrengthPriorities}`
              : null,
          ]
            .filter(Boolean)
            .join(", ")
        : stored.additionalPriorities || "";
    const storedFamilies = stored.benchmarkFamilyPriorities || {};
    const benchmarkFamilyPriorities = Object.fromEntries(
      AI_BENCHMARK_FAMILIES.map((family) => [
        family.id,
        {
          ...DEFAULT_BENCHMARK_FAMILY_PRIORITIES[family.id],
          ...(storedFamilies[family.id] || {}),
        },
      ])
    );

    return {
      ...DEFAULT_AI_PLANNING_GUIDANCE,
      ...stored,
      supersetMode:
        stored.supersetMode === "allowed"
          ? "preferred"
          : stored.supersetMode || DEFAULT_AI_PLANNING_GUIDANCE.supersetMode,
      additionalPriorities: migratedAdditionalPriorities,
      benchmarkFamilyPriorities,
    };
  } catch {
    return DEFAULT_AI_PLANNING_GUIDANCE;
  }
}

export function writeAiPlanningGuidance(guidance) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      AI_PLANNING_GUIDANCE_STORAGE_KEY,
      JSON.stringify(guidance)
    );
  } catch {
    // Planning guidance persistence is optional; ignore storage failures.
  }
}

export function buildAiPlanningContext(guidance, exerciseLibrary = []) {
  const longTermGoals = [
    { goal: "strength", priority: guidance.strengthPriority },
    { goal: "hypertrophy", priority: guidance.hypertrophyPriority },
  ].filter((item) => item.priority !== "notAGoal");
  const benchmarkFamilyPriorities = AI_BENCHMARK_FAMILIES.map((family) => {
    const selection = guidance.benchmarkFamilyPriorities?.[family.id] ||
      DEFAULT_BENCHMARK_FAMILY_PRIORITIES[family.id];
    const savedBenchmarkSelection = selection.benchmarkSelection;
    const savedExerciseId = String(savedBenchmarkSelection || "").startsWith(
      "exercise:"
    )
      ? String(savedBenchmarkSelection).slice("exercise:".length)
      : null;
    const selectedExercise = exerciseLibrary.find(
      (exercise) =>
        exercise.active !== "inactive" &&
        isExerciseBenchmark(exercise) &&
        getBenchmarkFamilyForExercise(exercise) === family.benchmarkFamily &&
        (savedExerciseId
          ? String(exercise.id) === savedExerciseId
          : exercise.name === savedBenchmarkSelection)
    );

    return {
      benchmarkFamily: family.benchmarkFamily,
      emphasis: selection.emphasis || "aiDecides",
      familyId: family.id,
      label: family.label,
      benchmarkPreference:
        savedBenchmarkSelection && savedBenchmarkSelection !== "aiDecides"
          ? {
              mode: "fixed",
              exercise: selectedExercise?.name || savedBenchmarkSelection,
              ...(selectedExercise
                ? {
                    equipment: selectedExercise.equipment || [],
                    exerciseId: selectedExercise.id,
                  }
                : { availability: "savedPreferenceNotFoundInExerciseLibrary" }),
            }
          : { mode: "aiDecides" },
    };
  });
  const currentPriorities = parseList(guidance.additionalPriorities).map(
    (target) => ({
      priority: "high",
      scope: "additional",
      target,
    })
  );
  const workoutDuration = guidance.workoutDurationEnabled
    ? {
        enabled: true,
        minMinutes: parsePositiveInteger(guidance.workoutMinutesMin),
        targetMinutes: parsePositiveInteger(guidance.workoutMinutesTarget),
        maxMinutes: parsePositiveInteger(guidance.workoutMinutesMax),
        instruction:
          "Estimate each workout's duration from exercises, working sets, reps, rest, warm-ups, and transitions. Treat maxMinutes as a hard limit.",
      }
    : {
        enabled: false,
        instruction: "No explicit workout-duration constraint was supplied.",
      };
  const restMaximumSeconds = parsePositiveInteger(
    guidance.restMaximumSeconds
  );

  return {
    athleteProfile: {
      longTermGoals,
      note:
        "Long-term goals persist across blocks. Do not mistake the next block's emphasis for a change in these goals.",
    },
    planningRequest: {
      blockEmphasis: guidance.blockEmphasis,
      benchmarkFamilyGuidance: {
        families: benchmarkFamilyPriorities,
        instruction:
          "Benchmark families are broad areas for planning and longitudinal monitoring. Their selected emphasis guides adaptation for this block. Benchmark exercises are measurement instruments, not automatically the highest programming priorities. Preserve exercise-specific trend continuity when practical. AI-decides benchmark preferences permit choosing any configured benchmark in that family; fixed preferences should be retained unless the user agrees to a revision. Never compare e1RM values from different exercises as if they were the same measurement series.",
      },
      currentPriorities,
      deload: { mode: guidance.deloadMode },
      exerciseGuidance: {
        avoid: parseList(guidance.avoidedExercises),
        prefer: parseList(guidance.preferredExercises),
        require: parseList(guidance.requiredExercises),
      },
      mixedPurposePlanAllowed: true,
      programmingAuthority: {
        instruction:
          "Use explicit current priorities to determine which adaptations deserve emphasis, then use history, volume, adherence, fatigue, recovery, exercise exposure, body weight, and nutrition evidence to choose the appropriate dose and method for only the next block. A high priority is not an automatic instruction to increase volume, and an empty currentPriorities array does not erase long-term goals or available history. The AI may choose a mixed strength/hypertrophy emphasis and should explain material decisions. Do not create a speculative multi-block roadmap.",
      },
      rest: {
        mode: guidance.restMode,
        ...(restMaximumSeconds ? { maxSeconds: restMaximumSeconds } : {}),
      },
      schedule: {
        daysPerWeek: buildRange(
          guidance.daysMode,
          guidance.daysMin,
          guidance.daysMax
        ),
      },
      sets: {
        workingSetsPerExercise: {
          min: parsePositiveInteger(guidance.setsMin),
          max: parsePositiveInteger(guidance.setsMax),
        },
      },
      supersets: {
        mode: guidance.supersetMode,
        instruction:
          "Interpret mode as follows: avoid means do not prescribe supersets; preferred means favor supersets when they support workout efficiency and programming quality, but they are not mandatory when exercise compatibility, performance, fatigue, or another constraint argues against them; aiDecides means explicitly decide whether supersets improve the plan. A group contains two or more exercises from the same workout, performed in listed order round by round. Unequal set counts are supported by skipping an exercise when it has no set in a later round. Rest applies after the full round, not between its exercises.",
      },
      dropSets: {
        mode: guidance.dropSetMode,
        instruction:
          "Interpret mode as follows: avoid means prescribe zero drop sets; preferred means favor 1-3 drop sets after the final working set of suitable cable, machine, or isolation exercises when they support the goal, but they are not mandatory when fatigue, recovery, technique, or another constraint argues against them; aiDecides means explicitly decide whether and where drop sets improve the plan. Avoid drop sets on benchmarks, highly technical compounds, and movements where fatigue creates a meaningful safety concern unless specifically justified. An omitted weekly value inherits the exercise default, while 0 disables drop sets for that week. The count is the number of additional sequential load-reduction segments. Unless specifically justified, prescribe 0 during deload weeks. Each segment is AMRAP at RIR 0 with no rest, is not an e1RM set, and initially targets 80% of the preceding segment's actual weight rounded to a supported increment; the athlete may edit it.",
      },
      trainingBlock: {
        trainingWeeks: buildRange(
          guidance.weeksMode,
          guidance.weeksMin,
          guidance.weeksMax
        ),
      },
      userNotes: String(guidance.userNotes || "").trim(),
      workoutDuration,
    },
  };
}

export function summarizeAiPlanningGuidance(guidance) {
  const goals = [
    guidance.strengthPriority !== "notAGoal" ? "strength" : null,
    guidance.hypertrophyPriority !== "notAGoal" ? "hypertrophy" : null,
  ].filter(Boolean);
  const days = buildRange(
    guidance.daysMode,
    guidance.daysMin,
    guidance.daysMax
  );
  const weeks = buildRange(
    guidance.weeksMode,
    guidance.weeksMin,
    guidance.weeksMax
  );
  const formatRange = (range, unit) => {
    if (range.mode === "aiDecides") return `AI chooses ${unit}`;
    if (range.mode === "fixed") return `${range.value} ${unit}`;
    return `${range.min || "?"}–${range.max || "?"} ${unit}`;
  };
  const emphasizedFamilies = AI_BENCHMARK_FAMILIES.map((family) => {
    const emphasis = guidance.benchmarkFamilyPriorities?.[family.id]?.emphasis;

    return emphasis && emphasis !== "aiDecides"
      ? `${family.label}: ${emphasis === "strengthAndHypertrophy" ? "strength + hypertrophy" : emphasis}`
      : null;
  }).filter(Boolean);

  return [
    `Long-term: ${goals.join(" + ") || "none selected"}`,
    `Block: ${guidance.blockEmphasis === "aiDecides" ? "AI chooses emphasis" : guidance.blockEmphasis}`,
    emphasizedFamilies.length
      ? emphasizedFamilies.join(", ")
      : "family emphasis: AI chooses",
    formatRange(days, "days/week"),
    formatRange(weeks, "weeks"),
    guidance.workoutDurationEnabled
      ? `${guidance.workoutMinutesTarget || guidance.workoutMinutesMax} min target`
      : "workout time unconstrained",
  ].join(" · ");
}
