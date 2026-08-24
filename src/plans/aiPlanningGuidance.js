export const AI_PLANNING_GUIDANCE_STORAGE_KEY =
  "workout-app.ai-planning-guidance.v1";

export const DEFAULT_AI_PLANNING_GUIDANCE = {
  strengthPriority: "high",
  hypertrophyPriority: "high",
  muscleHypertrophyPriorities: "Chest",
  exerciseStrengthPriorities: "Bench Press",
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

    return stored && typeof stored === "object"
      ? { ...DEFAULT_AI_PLANNING_GUIDANCE, ...stored }
      : DEFAULT_AI_PLANNING_GUIDANCE;
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

export function buildAiPlanningContext(guidance) {
  const longTermGoals = [
    { goal: "strength", priority: guidance.strengthPriority },
    { goal: "hypertrophy", priority: guidance.hypertrophyPriority },
  ].filter((item) => item.priority !== "notAGoal");
  const currentPriorities = [
    ...parseList(guidance.muscleHypertrophyPriorities).map((target) => ({
      goal: "hypertrophy",
      priority: "high",
      scope: "muscle",
      target,
    })),
    ...parseList(guidance.exerciseStrengthPriorities).map((target) => ({
      goal: "strength",
      priority: "high",
      scope: "exercise",
      target,
    })),
  ];
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
          "Use the long-term goals, history, prior AI rationale, watchNext items, and current evidence to choose only the next block. The AI may choose a mixed strength/hypertrophy emphasis and should explain material decisions. Do not create a speculative multi-block roadmap.",
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
      supersets: { mode: guidance.supersetMode },
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

  return [
    `Long-term: ${goals.join(" + ") || "none selected"}`,
    `Block: ${guidance.blockEmphasis === "aiDecides" ? "AI chooses emphasis" : guidance.blockEmphasis}`,
    formatRange(days, "days/week"),
    formatRange(weeks, "weeks"),
    guidance.workoutDurationEnabled
      ? `${guidance.workoutMinutesTarget || guidance.workoutMinutesMax} min target`
      : "workout time unconstrained",
  ].join(" · ");
}
