import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Brain,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  GripVertical,
  Link2,
  Plus,
  RefreshCw,
  Replace,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ExerciseDetailDialog from "./ExerciseDetailDialog";
import ExercisePickerSheet from "./ExercisePickerSheet";
import MuscleMap from "./MuscleMap";
import WeightPickerModal from "./WeightPickerModal";
import {
  WorkoutExercisePreviewGroup,
  WorkoutExercisePreviewRow,
} from "./WorkoutExercisePreviewList";
import { getGroupedPreviewExercises } from "../utils/previewExercises";
import {
  createPlanExercise,
  generatePlanWorkouts,
} from "../plans/planType2Generator";
import { isSupabaseConfigured, supabase } from "../sync/supabaseClient";
import { assertRemoteWriteAllowed } from "../sync/remoteWritePolicy";
import {
  triggerNativePickerSelectionHaptic,
  triggerNativeWarningHaptic,
} from "../native/pickerHaptics";
import {
  RIR_PERIODIZATION_MODES,
  RIR_PERIODIZATION_ORDER,
  getDefaultRirPeriodizationMode,
  getRirForPlanWeek,
} from "../utils/rirPeriodization";

function formatList(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(", ");
  }

  return value || "";
}

function normalizeLookupValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getExerciseKey(exercise) {
  return `${normalizeLookupValue(exercise?.name)}||${normalizeLookupValue(
    formatList(exercise?.equipment)
  )}`;
}

function getExerciseDetailRecord(exercise, exerciseLibrary) {
  const exerciseKey = getExerciseKey(exercise);
  const idMatch = exercise.exerciseId
    ? exerciseLibrary.find(
        (libraryExercise) =>
          String(libraryExercise.id) === String(exercise.exerciseId)
      )
    : null;
  const keyMatches = exerciseLibrary.filter(
    (libraryExercise) => getExerciseKey(libraryExercise) === exerciseKey
  );
  const libraryExercise =
    keyMatches.find((libraryItem) => libraryItem.imageUrl) ||
    keyMatches[0] ||
    idMatch ||
    null;
  const muscles = Array.isArray(exercise.muscles)
    ? exercise.muscles
    : Array.isArray(libraryExercise?.muscles)
      ? libraryExercise.muscles
      : [exercise.planMuscle].filter(Boolean);

  return {
    ...(libraryExercise || {}),
    ...exercise,
    equipment: exercise.equipment || libraryExercise?.equipment || [],
    id: exercise.exerciseId || libraryExercise?.id || exercise.id,
    imageAlt: libraryExercise?.imageAlt || exercise.imageAlt || "",
    imageUrl: libraryExercise?.imageUrl || exercise.imageUrl || "",
    muscles,
  };
}

function getPrimaryMuscles(exercise) {
  const muscles = Array.isArray(exercise?.muscles) ? exercise.muscles : [];
  return muscles[0] ? [muscles[0]] : [];
}

function getSecondaryMuscles(exercise) {
  const muscles = Array.isArray(exercise?.muscles) ? exercise.muscles : [];
  const primaryMuscle = muscles[0] || "";

  return muscles
    .slice(1)
    .filter((muscle) => muscle && muscle !== primaryMuscle);
}

function ExerciseMuscleMapThumbnails({ exercise }) {
  const primaryMuscles = getPrimaryMuscles(exercise);
  const secondaryMuscles = getSecondaryMuscles(exercise);

  if (primaryMuscles.length === 0 && secondaryMuscles.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        display: "grid",
        gap: "4px",
        width: "66px",
      }}
    >
      {primaryMuscles.length > 0 ? (
        <MuscleMap
          compact
          label={`${exercise.name} primary muscles`}
          primaryMuscles={primaryMuscles}
          showLegend={false}
          showViewLabels={false}
        />
      ) : null}

      {secondaryMuscles.length > 0 ? (
        <MuscleMap
          compact
          label={`${exercise.name} secondary muscles`}
          secondaryMuscles={secondaryMuscles}
          showLegend={false}
          showViewLabels={false}
        />
      ) : null}
    </div>
  );
}

function getExercisePreferenceKeys(exercise) {
  return [
    exercise?.exerciseId,
    exercise?.id,
    exercise?.sourceKey,
    exercise?.source_key,
  ]
    .filter((value) => value !== "" && value != null)
    .map(String);
}

function getPreferenceExerciseKeys(preference) {
  return [
    preference?.exercise_id,
    preference?.metadata?.localExerciseId,
    preference?.metadata?.localExerciseID,
  ]
    .filter((value) => value !== "" && value != null)
    .map(String);
}

function dayPointerThenClosestCenter(args) {
  if (String(args.active?.id || "").startsWith("plan-day:")) {
    return closestCenter(args);
  }

  const dayIntersections = pointerWithin(args).filter((intersection) =>
    String(intersection.id).startsWith("day:")
  );

  return dayIntersections.length > 0
    ? dayIntersections
    : closestCenter(args);
}

function getEffectivePrimaryMuscle(exercise) {
  return exercise?.muscles?.[0] || exercise?.planMuscle || "";
}

function normalizeDayOrder(dayOrder, workoutCount) {
  const defaultOrder = Array.from({ length: workoutCount }, (_, index) => index);

  if (!Array.isArray(dayOrder)) {
    return defaultOrder;
  }

  const seen = new Set();
  const validOrder = dayOrder.filter((workoutKey) => {
    const valid =
      Number.isInteger(workoutKey) &&
      workoutKey >= 0 &&
      workoutKey < workoutCount &&
      !seen.has(workoutKey);

    if (valid) {
      seen.add(workoutKey);
    }

    return valid;
  });

  return [
    ...validOrder,
    ...defaultOrder.filter((workoutKey) => !seen.has(workoutKey)),
  ];
}

function renameWorkoutForDayOrder(name, dayNumber, planType) {
  const compactPrefix = getCompactPlanTypeLabel(planType);
  const fallbackName = `${compactPrefix} W${dayNumber}`;
  const currentName = String(name || fallbackName).trim();

  return currentName || fallbackName;
}

function getWorkoutTypeLabel(workoutType) {
  const labels = {
    "type-1": "Workout Type 1",
    "type-2": "Workout Type 2",
    push: "Push",
    pull: "Pull",
    upper: "Upper",
    lower: "Lower",
    "full-body": "Full Body",
  };

  return labels[workoutType] || "Workout";
}

const WORKOUT_TYPE_OPTIONS = [
  { label: "Type 1", value: "type-1" },
  { label: "Type 2", value: "type-2" },
  { label: "Push", value: "push" },
  { label: "Pull", value: "pull" },
  { label: "Upper", value: "upper" },
  { label: "Lower", value: "lower" },
  { label: "Full Body", value: "full-body" },
];

function findWorkoutIndexForSlot(layout, slotKey) {
  return layout.findIndex((slotKeys) => slotKeys.includes(slotKey));
}

function moveSlotInLayout(layout, activeSlotKey, overId) {
  const nextLayout = layout.map((slotKeys) => [...slotKeys]);
  const fromWorkoutIndex = findWorkoutIndexForSlot(nextLayout, activeSlotKey);

  if (fromWorkoutIndex < 0) {
    return layout;
  }

  const fromIndex = nextLayout[fromWorkoutIndex].indexOf(activeSlotKey);
  const overValue = String(overId || "");
  const isDayDrop = overValue.startsWith("day:");
  const isWorkoutDrop = overValue.startsWith("workout:");
  const isSupersetDrop = overValue.startsWith("superset:");
  const toWorkoutIndex = isDayDrop
    ? Number(overValue.replace("day:", ""))
    : isWorkoutDrop
    ? Number(overValue.replace("workout:", ""))
    : isSupersetDrop
      ? Number(overValue.split(":")[1])
      : findWorkoutIndexForSlot(nextLayout, overValue);

  if (!Number.isInteger(toWorkoutIndex) || toWorkoutIndex < 0) {
    return layout;
  }

  if (!isWorkoutDrop && fromWorkoutIndex === toWorkoutIndex) {
    const toIndex = nextLayout[toWorkoutIndex].indexOf(overValue);

    if (toIndex < 0 || fromIndex === toIndex) {
      return layout;
    }

    nextLayout[toWorkoutIndex] = arrayMove(
      nextLayout[toWorkoutIndex],
      fromIndex,
      toIndex
    );
    return nextLayout;
  }

  const [movedSlotKey] = nextLayout[fromWorkoutIndex].splice(fromIndex, 1);
  const toIndex = isDayDrop || isWorkoutDrop || isSupersetDrop
    ? nextLayout[toWorkoutIndex].length
    : nextLayout[toWorkoutIndex].indexOf(overValue);

  nextLayout[toWorkoutIndex].splice(
    toIndex < 0 ? nextLayout[toWorkoutIndex].length : toIndex,
    0,
    movedSlotKey
  );

  return nextLayout;
}

function getDropSupersetGroup(overId, previewWorkouts) {
  const overValue = String(overId || "");

  if (overValue.startsWith("superset:")) {
    return decodeURIComponent(overValue.split(":").slice(2).join(":"));
  }

  if (overValue.startsWith("day:") || overValue.startsWith("workout:")) {
    return null;
  }

  const targetExercise = previewWorkouts
    .flatMap((workout) => workout.exercises)
    .find((exercise) => exercise.previewSlotKey === overValue);

  return targetExercise?.supersetGroup || null;
}

function SortablePlanExerciseRow({ children, slotKey }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id: slotKey,
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({
        attributes,
        listeners,
      })}
    </div>
  );
}

function PlanWorkoutDropZone({ children, workoutKey }) {
  const { setNodeRef } = useDroppable({
    id: `workout:${workoutKey}`,
  });

  return <div ref={setNodeRef}>{children}</div>;
}

function PlanSupersetDropZone({ children, group, workoutKey }) {
  const { setNodeRef } = useDroppable({
    disabled: !group,
    id: `superset:${workoutKey}:${encodeURIComponent(group || "")}`,
  });

  return <div ref={setNodeRef}>{children}</div>;
}

function PlanDayButton({
  active,
  count,
  label,
  onClick,
  onLongPress,
  sortable = true,
  sublabel,
  workoutKey,
}) {
  const longPressTimeoutRef = useRef(null);
  const longPressTriggeredRef = useRef(false);
  const {
    attributes,
    listeners,
    setNodeRef: setSortableNodeRef,
    transform,
    transition,
  } = useSortable({
    disabled: !sortable,
    id: `plan-day:${workoutKey}`,
  });
  const { isOver, setNodeRef } = useDroppable({
    disabled: active,
    id: `day:${workoutKey}`,
  });
  const highlighted = isOver && !active;
  const setRefs = (node) => {
    setSortableNodeRef(node);
    setNodeRef(node);
  };
  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const clearLongPress = () => {
    window.clearTimeout(longPressTimeoutRef.current);
  };
  const startLongPress = (event) => {
    if (!onLongPress) {
      return;
    }

    clearLongPress();
    longPressTriggeredRef.current = false;
    longPressTimeoutRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      onLongPress(event);
    }, 520);
  };

  return (
    <button
      ref={setRefs}
      aria-pressed={active}
      {...attributes}
      {...(sortable ? listeners : {})}
      onClick={(event) => {
        if (longPressTriggeredRef.current) {
          event.preventDefault();
          longPressTriggeredRef.current = false;
          return;
        }

        onClick?.(event);
      }}
      onContextMenu={(event) => {
        if (!onLongPress) {
          return;
        }

        event.preventDefault();
        onLongPress(event);
      }}
      onPointerCancel={clearLongPress}
      onPointerDown={startLongPress}
      onPointerLeave={clearLongPress}
      onPointerUp={clearLongPress}
      style={{
        background: active
          ? "var(--accent)"
          : highlighted
            ? "var(--surface-muted)"
            : "var(--surface-raised)",
        border: active
          ? "1px solid var(--accent)"
          : highlighted
            ? "2px solid var(--accent)"
            : "1px solid var(--border)",
        boxShadow: highlighted ? "0 0 0 3px var(--accent-bg)" : "none",
        color: active
          ? "#fff"
          : highlighted
            ? "var(--accent)"
            : "var(--text)",
        alignItems: "center",
        display: "inline-flex",
        flex: "1 1 0",
        flexDirection: "column",
        fontSize: "13px",
        fontWeight: active ? "bold" : "normal",
        justifyContent: "center",
        minHeight: "38px",
        minWidth: 0,
        padding: highlighted ? "5px 7px" : "6px 8px",
        touchAction: "none",
        userSelect: "none",
        WebkitTouchCallout: "none",
        WebkitUserSelect: "none",
        ...sortableStyle,
      }}
    >
      <span>
        {label}
        <span
          style={{
            color:
              active || highlighted
                ? active
                  ? "rgba(255,255,255,.78)"
                  : "var(--accent)"
                : "var(--text-muted)",
            fontSize: "11px",
            marginLeft: "4px",
          }}
        >
          ({count})
        </span>
      </span>
      {sublabel && (
        <span
          style={{
            color: active ? "rgba(255,255,255,.82)" : "var(--text-muted)",
            fontSize: "11px",
            lineHeight: 1.1,
          }}
        >
          {sublabel}
        </span>
      )}
    </button>
  );
}

function getWorkoutSummary(workouts) {
  const workoutList = Array.isArray(workouts) ? workouts : [workouts];
  const exercises = workoutList.flatMap((workout) => workout.exercises);
  const muscleSets = exercises.reduce((summary, exercise) => {
    const muscle = exercise.muscles?.[0] || exercise.planMuscle || "Unknown";

    summary[muscle] = (summary[muscle] || 0) + exercise.sets.length;

    return summary;
  }, {});
  const totalSets = Object.values(muscleSets).reduce(
    (total, sets) => total + sets,
    0
  );
  return {
    muscleSets: Object.entries(muscleSets).sort((a, b) =>
      a[0].localeCompare(b[0])
    ),
    totalSets,
  };
}

function WorkoutSummarySheet({
  initialScope = "workout",
  lockScope = false,
  onClose,
  planTitle = "Combined Plan",
  selectedWorkout,
  workouts,
}) {
  const [summaryScope, setSummaryScope] = useState(initialScope);
  const displayedWorkouts =
    summaryScope === "plan" ? workouts : [selectedWorkout];
  const summary = getWorkoutSummary(displayedWorkouts);
  const title =
    summaryScope === "plan" ? planTitle : selectedWorkout.name;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${title} summary`}
      style={{
        background: "rgba(0,0,0,.38)",
        inset: 0,
        position: "fixed",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "var(--surface-raised)",
          borderRadius: "18px 18px 0 0",
          bottom: 0,
          boxShadow: "0 -8px 28px rgba(0,0,0,.18)",
          left: 0,
          maxHeight: "78vh",
          overflowY: "auto",
          padding: "14px 16px calc(16px + env(safe-area-inset-bottom))",
          position: "absolute",
          right: 0,
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: "8px",
            justifyContent: "space-between",
            marginBottom: "12px",
          }}
        >
          <div>
            <h2
              style={{
                fontSize: "18px",
                lineHeight: 1.15,
                margin: 0,
              }}
            >
              {title}
            </h2>
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "12px",
                marginTop: "3px",
              }}
            >
              {summary.totalSets} planned sets
            </div>
          </div>

          <button
            aria-label="Close summary"
            onClick={onClose}
            style={{
              alignItems: "center",
              borderRadius: "999px",
              display: "inline-flex",
              height: "36px",
              justifyContent: "center",
              width: "36px",
            }}
          >
            <X size={18} />
          </button>
        </div>

        {!lockScope && (
          <div
            role="tablist"
            aria-label="Summary scope"
            style={{
              background: "var(--surface-muted)",
              borderRadius: "999px",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              marginBottom: "12px",
              padding: "3px",
            }}
          >
            {[
              ["workout", "Workout"],
              ["plan", "Plan"],
            ].map(([value, label]) => {
              const active = summaryScope === value;

              return (
                <button
                  key={value}
                  aria-selected={active}
                  role="tab"
                  onClick={() => setSummaryScope(value)}
                  style={{
                    background: active ? "var(--surface-raised)" : "transparent",
                    border: "none",
                    borderRadius: "999px",
                    boxShadow: active ? "0 1px 4px rgba(0,0,0,.12)" : "none",
                    fontWeight: active ? "bold" : "normal",
                    minHeight: "34px",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

        <div
          style={{
            display: "grid",
            gap: "8px",
          }}
        >
          <MuscleMap
            label={`${title} primary muscles`}
            primaryMuscles={summary.muscleSets.map(([muscle, sets]) => ({
              muscle,
              sets,
            }))}
            scaleIntensity
            showLegend={false}
          />
          {summary.muscleSets.map(([muscle, sets]) => (
            <div
              key={muscle}
              style={{
                alignItems: "center",
                borderBottom: "1px solid var(--border)",
                display: "grid",
                gap: "8px",
                gridTemplateColumns: "minmax(0, 1fr) auto",
                padding: "8px 0",
              }}
            >
              <strong>{muscle}</strong>
              <span>{sets} sets</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function getDefaultSavedWorkoutName(workout, workoutIndex, planType) {
  const compactPrefix = getCompactPlanTypeLabel(planType);

  if (["type-3", "type-5"].includes(planType) && workout?.workoutTypeLabel) {
    return `${compactPrefix} W${workoutIndex + 1} ${workout.workoutTypeLabel}`;
  }

  if (planType === "type-4" && workout?.workoutTypeLabel) {
    return `${compactPrefix} W${workoutIndex + 1} ${workout.workoutTypeLabel}`;
  }

  return `${compactPrefix} W${workoutIndex + 1}`;
}

function getDefaultWorkoutName(workoutType) {
  return `${getWorkoutTypeLabel(workoutType)} Workout`;
}

function getGoalLabel(goal) {
  return goal === "progress" ? "Progress" : "Maintain";
}

function getDefaultPlanName(planType, daysPerWeek, durationWeeks) {
  return `${getPlanTypeLabel(planType)} (${daysPerWeek}d ${durationWeeks}wk)`;
}

function formatPlanSetting(value, fallback) {
  return value == null || value === "" ? fallback : String(value);
}

function firstPresentValue(...values) {
  const value = values.find((item) => item != null && item !== "");

  return value == null ? "" : value;
}

function buildTrainerWorkoutPayload(workout) {
  return {
    ...workout,
    exercises: (workout.exercises || []).map((exercise) => ({
      ...exercise,
      sets: (exercise.sets || []).map((set) => ({
        ...set,
        prescribedReps: firstPresentValue(set.prescribedReps, set.reps, set.targetReps),
        prescribedRir: firstPresentValue(set.prescribedRir, set.rir, set.targetRir),
        targetReps: firstPresentValue(set.prescribedReps, set.reps, set.targetReps),
        targetRir: firstPresentValue(set.prescribedRir, set.rir, set.targetRir),
        targetWeight: null,
      })),
    })),
  };
}

const WEEKLY_RIR_VALUES = [0, 1, 2, 3, 4, 5, 6];
const WEEKLY_SET_VALUES = [1, 2, 3, 4, 5, 6];
const WEEKLY_REP_VALUES = Array.from({ length: 15 }, (_, index) => index + 1);
const WEEKLY_REST_SECOND_VALUES = [45, 60, 75, 90, 120, 150, 180, 210, 240, 300];
const AI_PLAN_DRAFT_STORAGE_KEY = "workoutAppLastAiPlanDraftJson";

const PLAN_TYPE_DEFAULTS = {
  "type-1": {
    deload: false,
    daysPerWeek: "2",
    durationWeeks: "4",
    goal: "maintain",
    rirPeriodization: RIR_PERIODIZATION_MODES.CONSTANT,
    reps: "15",
    rir: "2",
  },
  "type-2": {
    deload: false,
    daysPerWeek: "2",
    durationWeeks: "4",
    goal: "maintain",
    rirPeriodization: RIR_PERIODIZATION_MODES.CONSTANT,
    reps: "12",
    rir: "2",
  },
  "type-3": {
    deload: true,
    daysPerWeek: "5",
    durationWeeks: "5",
    goal: "progress",
    rirPeriodization: RIR_PERIODIZATION_MODES.STEP,
    reps: "8",
    rir: "3",
    sets: "3",
  },
  "type-4": {
    deload: false,
    daysPerWeek: "3",
    durationWeeks: "4",
    goal: "maintain",
    rirPeriodization: RIR_PERIODIZATION_MODES.CONSTANT,
    reps: "8",
    rir: "2",
    sets: "3",
  },
  "type-5": {
    deload: true,
    daysPerWeek: "5",
    durationWeeks: "5",
    goal: "progress",
    rirPeriodization: RIR_PERIODIZATION_MODES.STEP,
    reps: "8",
    rir: "3",
    sets: "3",
  },
  ai: {
    deload: true,
    daysPerWeek: "5",
    durationWeeks: "5",
    goal: "progress",
    rirPeriodization: RIR_PERIODIZATION_MODES.STEP,
    reps: "8",
    rir: "3",
    sets: "3",
  },
};

function getPlanTypeDefaults(planType) {
  return PLAN_TYPE_DEFAULTS[planType] || PLAN_TYPE_DEFAULTS["type-2"];
}

function readStoredAiPlanDraftText() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return window.localStorage.getItem(AI_PLAN_DRAFT_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function writeStoredAiPlanDraftText(text) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (String(text || "").trim()) {
      window.localStorage.setItem(AI_PLAN_DRAFT_STORAGE_KEY, text);
    } else {
      window.localStorage.removeItem(AI_PLAN_DRAFT_STORAGE_KEY);
    }
  } catch {
    // Local draft restore is optional; ignore storage failures.
  }
}

function buildEditablePlanWorkouts(plan, templates) {
  if (!plan) {
    return null;
  }

  return (plan.workouts || []).map((planWorkout, workoutIndex) => {
    const template = templates.find(
      (item) => String(item.id) === String(planWorkout.templateId)
    );
    const weeklyPrescriptionsByPosition =
      planWorkout.weeklyPrescriptionsByPosition || {};
    const setRestSecondsByPosition = planWorkout.setRestSecondsByPosition || {};
    const exercises = (template?.exercises || []).map(
      (exercise, exerciseIndex) => {
        const weeklyPrescriptions =
          weeklyPrescriptionsByPosition[exerciseIndex + 1];
        const setRestSeconds = setRestSecondsByPosition[exerciseIndex + 1];

        return {
          ...exercise,
          sets: Array.isArray(setRestSeconds)
            ? (exercise.sets || []).map((set, setIndex) => ({
                ...set,
                ...(setRestSeconds[setIndex]
                  ? { restSeconds: setRestSeconds[setIndex] }
                  : {}),
              }))
            : exercise.sets || [],
          ...(Array.isArray(weeklyPrescriptions)
            ? {
                weeklyPrescriptions: weeklyPrescriptions.map((week) => ({
                  ...week,
                })),
              }
            : {}),
        };
      }
    );

    return {
      ...(template || {
        exercises: [],
      }),
      dayNumber: planWorkout.dayNumber || workoutIndex + 1,
      exercises,
      id: template?.id || planWorkout.templateId || `${plan.id}:template-${workoutIndex + 1}`,
      name: template?.name || planWorkout.name || `Workout ${workoutIndex + 1}`,
      planId: plan.id,
      planWorkoutId:
        planWorkout.planWorkoutId || `${plan.id}:workout-${workoutIndex + 1}`,
      workoutType:
        planWorkout.workoutType ||
        template?.workoutType ||
        plan?.config?.workoutTypeByDay?.[workoutIndex] ||
        null,
      workoutTypeLabel:
        planWorkout.workoutTypeLabel ||
        template?.workoutTypeLabel ||
        (plan?.config?.workoutTypeByDay?.[workoutIndex]
          ? getWorkoutTypeLabel(plan.config.workoutTypeByDay[workoutIndex])
          : null),
    };
  });
}

function buildRecentPlanHistoryWorkouts(plans, templates, excludedPlanId) {
  const templateById = new Map(
    (templates || []).map((template) => [String(template.id), template])
  );

  return (plans || [])
    .filter((plan) => String(plan.id) !== String(excludedPlanId || ""))
    .sort((a, b) => {
      const statusScore = (plan) => (plan.status === "active" ? 0 : 1);
      const scoreDifference = statusScore(a) - statusScore(b);

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      return (
        new Date(b.updatedAt || b.createdAt || 0).getTime() -
        new Date(a.updatedAt || a.createdAt || 0).getTime()
      );
    })
    .slice(0, 4)
    .flatMap((plan) =>
      (plan.workouts || [])
        .map((workout) => templateById.get(String(workout.templateId)))
        .filter(Boolean)
    );
}

function sortObjectKeys(value) {
  if (Array.isArray(value)) {
    return value.map(sortObjectKeys);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.keys(value)
    .sort()
    .reduce((normalized, key) => {
      if (key === "previewSlotKey" || key === "previewWorkoutKey") {
        return normalized;
      }

      normalized[key] = sortObjectKeys(value[key]);
      return normalized;
    }, {});
}

function getPlanComparable(plan) {
  return sortObjectKeys({
    id: plan?.id,
    name: plan?.name || "",
    planType: plan?.planType || "",
    goal: plan?.goal || "",
    daysPerWeek: Number(plan?.daysPerWeek || 0),
    durationWeeks: Number(plan?.durationWeeks || 0),
    config: {
      deload: Boolean(plan?.config?.deload),
      reps: formatPlanSetting(plan?.config?.reps, ""),
      rir: formatPlanSetting(plan?.config?.rir, ""),
      rirPeriodization:
        plan?.config?.rirPeriodization ||
        getDefaultRirPeriodizationMode(plan?.planType),
      sets: formatPlanSetting(plan?.config?.sets, ""),
      workoutTypeByDay: plan?.config?.workoutTypeByDay || {},
    },
    workouts: (plan?.workouts || []).map((workout) => ({
      dayNumber: Number(workout?.dayNumber || 0),
      name: workout?.name || "",
      planWorkoutId: workout?.planWorkoutId || "",
      templateId: workout?.templateId,
      workoutType: workout?.workoutType || null,
      workoutTypeLabel: workout?.workoutTypeLabel || null,
    })),
  });
}

function getWorkoutComparable(workouts) {
  return sortObjectKeys(
    (workouts || []).map((workout) => ({
      ...workout,
      dayNumber: Number(workout?.dayNumber || 0),
    }))
  );
}

function hasPlanUpdateChanges(editingPlan, nextPlan, previousWorkouts, nextWorkouts) {
  return (
    JSON.stringify(getPlanComparable(editingPlan)) !==
      JSON.stringify(getPlanComparable(nextPlan)) ||
    JSON.stringify(getWorkoutComparable(previousWorkouts)) !==
      JSON.stringify(getWorkoutComparable(nextWorkouts))
  );
}

function PlanWorkoutPreview({
  enableWeeklyPrescriptions = false,
  exerciseLibrary,
  onAddExercise,
  onDeleteExercise,
  onEditSuperset,
  onEditWeeklyPrescription,
  onRenameWorkout,
  onReplaceExercise,
  onShowExerciseDetail,
  onShowSummary,
  workout,
}) {
  return (
    <section
      style={{
        borderTop: "1px solid var(--border)",
        padding: "14px 0",
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "grid",
          gap: "8px",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          marginBottom: "10px",
        }}
      >
        <input
          aria-label={`${workout.name} name`}
          value={workout.name}
          onChange={(event) => onRenameWorkout(workout, event.target.value)}
          style={{
            boxSizing: "border-box",
            font: "inherit",
            fontSize: "18px",
            fontWeight: "bold",
            lineHeight: 1.15,
            minHeight: "38px",
            minWidth: 0,
            width: "100%",
          }}
        />

        <button
          aria-label={`${workout.name} summary`}
          onClick={() => onShowSummary(workout)}
          style={{
            alignItems: "center",
            display: "inline-flex",
            justifyContent: "center",
            minHeight: "34px",
            minWidth: "38px",
            padding: "4px 8px",
          }}
        >
          <BarChart3 size={18} />
        </button>
      </div>

      <PlanWorkoutDropZone workoutKey={workout.previewWorkoutKey}>
        <div
          style={{
            minHeight: "24px",
          }}
        >
          {getGroupedPreviewExercises(workout.exercises).map((group) => (
            <PlanSupersetDropZone
              key={group.group || group.exercises[0].id}
              group={group.group}
              workoutKey={workout.previewWorkoutKey}
            >
              <WorkoutExercisePreviewGroup group={group.group}>
                {group.exercises.map((exercise) => {
                  const exerciseDetail = getExerciseDetailRecord(
                    exercise,
                    exerciseLibrary
                  );

                  return (
                    <SortablePlanExerciseRow
                      key={exercise.previewSlotKey}
                      slotKey={exercise.previewSlotKey}
                    >
                      {({ attributes, listeners }) => (
                      <WorkoutExercisePreviewRow
                        exercise={exercise}
                        exerciseDetail={exerciseDetail}
                        onExerciseClick={() => onShowExerciseDetail(exerciseDetail)}
                        onPrescriptionClick={
                          enableWeeklyPrescriptions
                            ? () => onEditWeeklyPrescription(exercise)
                            : null
                        }
                        prescriptionSummary={
                          enableWeeklyPrescriptions
                            ? getPrescriptionSummary(
                                exercise.weeklyPrescriptions || []
                              )
                            : null
                        }
                        sideContent={
                          <ExerciseMuscleMapThumbnails exercise={exerciseDetail} />
                        }
                        leadingControl={
                          <span
                            {...attributes}
                            {...listeners}
                            style={{
                              alignItems: "center",
                              background: "var(--surface-raised)",
                              border: "1px solid var(--border)",
                              borderRadius: "999px",
                              color: "var(--text-muted)",
                              cursor: "grab",
                              display: "inline-flex",
                              height: "32px",
                              justifyContent: "center",
                              padding: 0,
                              touchAction: "none",
                              userSelect: "none",
                              width: "32px",
                            }}
                          >
                            <GripVertical size={17} />
                          </span>
                        }
                        actions={
                          <>
                            <button
                              aria-label={
                                exercise.supersetGroup
                                  ? `Edit superset ${exercise.supersetGroup}`
                                  : "Link superset"
                              }
                              onClick={() => onEditSuperset(exercise)}
                              style={{
                                alignItems: "center",
                                color: exercise.supersetGroup
                                  ? "var(--accent)"
                                  : "var(--text-muted)",
                                display: "inline-flex",
                                gap: "1px",
                                justifyContent: "center",
                                minHeight: "32px",
                                minWidth: exercise.supersetGroup ? "40px" : "34px",
                                padding: "4px 6px",
                              }}
                            >
                              <Link2 size={16} />
                              {exercise.supersetGroup && (
                                <span
                                  style={{
                                    fontSize: "10px",
                                    fontWeight: "bold",
                                  }}
                                >
                                  {exercise.supersetGroup}
                                </span>
                              )}
                            </button>

                            <button
                              aria-label={`Replace ${exercise.name}`}
                              onClick={() => onReplaceExercise(exercise)}
                              style={{
                                alignItems: "center",
                                display: "inline-flex",
                                justifyContent: "center",
                                minHeight: "32px",
                                minWidth: "34px",
                                padding: "4px 6px",
                              }}
                            >
                              <Replace size={17} />
                            </button>

                            <button
                              aria-label={`Delete ${exercise.name}`}
                              onClick={() => onDeleteExercise(workout, exercise)}
                              style={{
                                alignItems: "center",
                                color: "var(--danger-text)",
                                display: "inline-flex",
                                justifyContent: "center",
                                minHeight: "32px",
                                minWidth: "34px",
                                padding: "4px 6px",
                              }}
                              type="button"
                            >
                              <Trash2 size={17} />
                            </button>
                          </>
                        }
                      />
                      )}
                    </SortablePlanExerciseRow>
                  );
                })}
              </WorkoutExercisePreviewGroup>
            </PlanSupersetDropZone>
          ))}
          <button
            onClick={() => onAddExercise(workout)}
            style={{
              alignItems: "center",
              display: "inline-flex",
              gap: "6px",
              justifyContent: "center",
              marginTop: "10px",
              minHeight: "42px",
              padding: "8px 12px",
              width: "100%",
            }}
            type="button"
          >
            <Plus size={17} />
            Add Exercise
          </button>
        </div>
      </PlanWorkoutDropZone>
    </section>
  );
}

function getPlanTypeLabel(planType) {
  const labels = {
    "type-1": "Plan Type 1 'Laura'",
    "type-2": "Plan Type 2 'Sam'",
    "type-3": "Plan Type 3 'Ira'",
    "type-4": "Plan Type 4 'General'",
    "type-5": "Plan Type 5 'App'",
    ai: "Plan Type AI",
  };

  return labels[planType] || labels["type-2"];
}

function getCompactPlanTypeLabel(planType) {
  const labels = {
    "type-1": "P1",
    "type-2": "P2",
    "type-3": "P3",
    "type-4": "P4",
    "type-5": "P5",
    ai: "AI",
  };

  return labels[planType] || labels["type-2"];
}

function PlanPickerButton({ disabled = false, label, onClick, value }) {
  return (
    <label
      style={{
        display: "grid",
        gap: "4px",
      }}
    >
      <span style={{ textAlign: "left" }}>{label}</span>
      <button
        disabled={disabled}
        onClick={onClick}
        style={{
          minHeight: "40px",
          textAlign: "left",
        }}
      >
        {value}
      </button>
    </label>
  );
}

function ToggleSwitch({ checked, label, onChange }) {
  return (
    <button
      aria-label={label}
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      type="button"
      style={{
        alignItems: "center",
        background: checked ? "var(--accent)" : "var(--surface-muted)",
        border: "1px solid var(--border)",
        borderRadius: "999px",
        display: "inline-flex",
        height: "40px",
        justifyContent: checked ? "flex-end" : "flex-start",
        padding: "3px",
        width: "62px",
      }}
    >
      <span
        style={{
          background: "var(--surface)",
          borderRadius: "999px",
          display: "block",
          height: "30px",
          width: "30px",
        }}
      />
    </button>
  );
}

function getRirPeriodizationLabel(mode) {
  if (mode === RIR_PERIODIZATION_MODES.LINEAR) {
    return "Linear RIR decrease";
  }

  if (mode === RIR_PERIODIZATION_MODES.STEP) {
    return "Stair-step RIR decrease";
  }

  return "Constant RIR";
}

function RirPeriodizationIcon({ mode }) {
  if (mode === RIR_PERIODIZATION_MODES.STEP) {
    return (
      <svg aria-hidden="true" height="24" viewBox="0 0 32 24" width="32">
        <path
          d="M5 5 H13 V11 H21 V17 H27"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
        />
      </svg>
    );
  }

  if (mode === RIR_PERIODIZATION_MODES.LINEAR) {
    return (
      <svg aria-hidden="true" height="24" viewBox="0 0 32 24" width="32">
        <path
          d="M5 5 L27 19"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2.5"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" height="24" viewBox="0 0 32 24" width="32">
      <path
        d="M5 12 H27"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2.5"
      />
    </svg>
  );
}

function getNextRirPeriodizationMode(mode) {
  const currentIndex = RIR_PERIODIZATION_ORDER.indexOf(mode);
  const nextIndex = currentIndex < 0 ? 0 : currentIndex + 1;

  return RIR_PERIODIZATION_ORDER[nextIndex % RIR_PERIODIZATION_ORDER.length];
}

function RirPeriodizationButton({ mode, onChange }) {
  const label = getRirPeriodizationLabel(mode);

  return (
    <button
      aria-label={label}
      onClick={() => onChange(getNextRirPeriodizationMode(mode))}
      title={label}
      style={{
        alignItems: "center",
        alignSelf: "end",
        display: "inline-flex",
        justifyContent: "center",
        minHeight: "40px",
        minWidth: "56px",
        padding: "6px 10px",
      }}
    >
      <RirPeriodizationIcon mode={mode} />
    </button>
  );
}

function formatRange(values) {
  const normalizedValues = [...new Set(values.map(String).filter(Boolean))];

  if (normalizedValues.length === 0) {
    return "";
  }

  const numericValues = normalizedValues
    .map(Number)
    .filter((value) => Number.isFinite(value));

  if (numericValues.length !== normalizedValues.length) {
    return normalizedValues.join("/");
  }

  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);
  const formatValue = (value) =>
    Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));

  return min === max ? formatValue(min) : `${formatValue(min)}-${formatValue(max)}`;
}

function normalizeRestSeconds(value) {
  const seconds = Number(value);

  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null;
}

function getDefaultRestSecondsForReps(reps) {
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

function formatRestDuration(seconds) {
  const normalizedSeconds = normalizeRestSeconds(seconds);

  if (!normalizedSeconds) {
    return "";
  }

  const minutes = Math.floor(normalizedSeconds / 60);
  const remainder = normalizedSeconds % 60;

  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatRestRange(values) {
  const normalizedValues = [
    ...new Set(values.map(normalizeRestSeconds).filter(Boolean)),
  ].sort((left, right) => left - right);

  if (normalizedValues.length === 0) {
    return "";
  }

  const first = normalizedValues[0];
  const last = normalizedValues.at(-1);

  return first === last
    ? formatRestDuration(first)
    : `${formatRestDuration(first)}-${formatRestDuration(last)}`;
}

function formatWeeklyPrescriptionValue(field, value) {
  return field === "restSeconds" ? formatRestDuration(value) || "Default" : value;
}

function getBaseExercisePrescription(exercise, fallbackReps, fallbackRir) {
  const firstSet = exercise?.sets?.[0] || {};
  const reps = firstPresentValue(
    firstSet.prescribedReps,
    firstSet.reps,
    firstSet.targetReps,
    fallbackReps
  );
  const restSeconds =
    normalizeRestSeconds(
      firstPresentValue(
        firstSet.prescribedRestSeconds,
        firstSet.restSeconds,
        firstSet.rest_seconds,
        exercise?.restSeconds,
        exercise?.rest_seconds
      )
    ) || getDefaultRestSecondsForReps(reps);

  return {
    reps,
    restSeconds: String(restSeconds),
    rir: firstPresentValue(firstSet.prescribedRir, firstSet.rir, firstSet.targetRir, fallbackRir),
    sets: String(exercise?.sets?.length || 1),
  };
}

function cloneWeeklyPrescriptions(weeklyPrescriptions) {
  return Array.isArray(weeklyPrescriptions)
    ? weeklyPrescriptions.map((week) => ({ ...week }))
    : [];
}

function createReplacementPlanExercise({
  goal,
  history,
  replacementExercise,
  replacedExercise,
  supersetGroup,
  fallbackReps,
  fallbackRir,
}) {
  const basePrescription = getBaseExercisePrescription(
    replacedExercise,
    fallbackReps,
    fallbackRir
  );
  const nextExercise = createPlanExercise({
    exercise: replacementExercise,
    goal,
    history,
    planMuscle: replacedExercise.planMuscle,
    reps: basePrescription.reps,
    rir: basePrescription.rir,
    setCount: replacedExercise.sets?.length || Number(basePrescription.sets) || 1,
    supersetGroup,
  });

  if (!Array.isArray(replacedExercise.weeklyPrescriptions)) {
    return nextExercise;
  }

  return {
    ...nextExercise,
    weeklyPrescriptions: cloneWeeklyPrescriptions(
      replacedExercise.weeklyPrescriptions
    ),
  };
}

function getDefaultWeeklyPrescriptions({
  deload,
  durationWeeks,
  exercise,
  reps,
  rir,
  rirPeriodization,
}) {
  const weekCount = Math.max(1, Number(durationWeeks) || 1);
  const base = getBaseExercisePrescription(exercise, reps, rir);
  const trainingWeeks = Array.from({ length: weekCount }, (_, index) => {
    const weekNumber = index + 1;

    return {
      reps: String(base.reps),
      restSeconds: String(base.restSeconds),
      rir: getRirForPlanWeek({
        durationWeeks: weekCount,
        initialRir: base.rir,
        mode: rirPeriodization,
        weekNumber,
      }),
      sets: String(base.sets),
      weekNumber,
    };
  });

  if (!deload) {
    return trainingWeeks;
  }

  return [
    ...trainingWeeks,
    {
      isDeload: true,
      label: "D",
      reps: String(trainingWeeks[0]?.reps || base.reps),
      restSeconds: String(trainingWeeks[0]?.restSeconds || base.restSeconds),
      rir: "5",
      sets: "2",
      weekNumber: weekCount + 1,
    },
  ];
}

function normalizeWeeklyPrescriptions({
  deload,
  durationWeeks,
  exercise,
  overrides,
  reps,
  rir,
  rirPeriodization,
}) {
  const defaults = getDefaultWeeklyPrescriptions({
    deload,
    durationWeeks,
    exercise,
    reps,
    rir,
    rirPeriodization,
  });
  const savedByWeek = new Map(
    (exercise?.weeklyPrescriptions || []).map((week) => [
      Number(week.weekNumber),
      week,
    ])
  );
  const overrideByWeek = new Map(
    (overrides || []).map((week) => [Number(week.weekNumber), week])
  );

  const normalWeeks = defaults
    .filter((week) => !week.isDeload)
    .map((defaultWeek) => ({
      ...defaultWeek,
      ...(savedByWeek.get(defaultWeek.weekNumber) || {}),
      ...(overrideByWeek.get(defaultWeek.weekNumber) || {}),
      weekNumber: defaultWeek.weekNumber,
    }));
  const deloadWeek = defaults.find((week) => week.isDeload);

  if (!deloadWeek) {
    return normalWeeks;
  }

  return [
    ...normalWeeks,
    {
      ...deloadWeek,
      reps: String(normalWeeks[0]?.reps || deloadWeek.reps),
    },
  ];
}

function getPrescriptionSummary(weeklyPrescriptions) {
  const primaryWeeks = weeklyPrescriptions.filter((week) => !week.isDeload);
  const setRange = formatRange(primaryWeeks.map((week) => week.sets));
  const repRange = formatRange(primaryWeeks.map((week) => week.reps));
  const rirRange = formatRange(primaryWeeks.map((week) => week.rir));
  const restRange = formatRestRange(primaryWeeks.map((week) => week.restSeconds));
  const setLabel = setRange === "1" ? "set" : "sets";

  return `${setRange} ${setLabel} | ${repRange} reps | ${rirRange} RIR${
    restRange ? `\n${restRange} rest` : ""
  }`;
}

function WeeklyPrescriptionSheet({
  exercise,
  onClose,
  onEditValue,
  weeklyPrescriptions,
}) {
  const [isClosing, setIsClosing] = useState(false);

  if (!exercise) {
    return null;
  }

  function closeWithAnimation() {
    setIsClosing(true);
    setTimeout(onClose, 750);
  }

  return (
    <div
      onClick={closeWithAnimation}
      style={{
        alignItems: "flex-end",
        background: "rgba(0,0,0,.45)",
        display: "flex",
        inset: 0,
        justifyContent: "center",
        position: "fixed",
        zIndex: 900,
      }}
    >
      <style>
        {`
          .plan-weekly-prescription-sheet {
            animation: planSheetSlideUp 750ms cubic-bezier(.16, 1, .3, 1) both;
            will-change: opacity, transform;
          }

          .plan-weekly-prescription-sheet[data-closing="true"] {
            animation-name: planSheetSlideDown;
          }

          @keyframes planSheetSlideUp {
            from {
              opacity: 0.25;
              transform: translateY(calc(100% + 24px));
            }

            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @keyframes planSheetSlideDown {
            from {
              opacity: 1;
              transform: translateY(0);
            }

            to {
              opacity: 0;
              transform: translateY(calc(100% + 24px));
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .plan-weekly-prescription-sheet {
              animation: none;
            }
          }
        `}
      </style>
      <div
        onClick={(event) => event.stopPropagation()}
        className="plan-weekly-prescription-sheet"
        data-closing={isClosing ? "true" : "false"}
        style={{
          background: "var(--surface-raised)",
          borderTopLeftRadius: "10px",
          borderTopRightRadius: "10px",
          boxShadow: "0 -6px 24px rgba(0,0,0,.25)",
          boxSizing: "border-box",
          color: "var(--text)",
          maxHeight: "calc(100dvh - 16px)",
          overflowY: "auto",
          padding: "14px 16px calc(96px + env(safe-area-inset-bottom))",
          WebkitOverflowScrolling: "touch",
          width: "min(560px, 100%)",
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: "8px",
            justifyContent: "space-between",
            marginBottom: "12px",
          }}
        >
          <h2
            style={{
              fontSize: "18px",
              lineHeight: 1.15,
              margin: 0,
            }}
          >
            {exercise.name}
          </h2>

          <button
            aria-label="Close weekly targets"
            onClick={closeWithAnimation}
            style={{
              alignItems: "center",
              display: "inline-flex",
              justifyContent: "center",
              minHeight: "34px",
              minWidth: "34px",
              padding: "4px",
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gap: "8px",
            paddingBottom: "8px",
          }}
        >
          <div
            style={{
              color: "var(--text-muted)",
              display: "grid",
              fontSize: "12px",
              fontWeight: "bold",
              gap: "6px",
              gridTemplateColumns: "48px 1fr 1fr 1fr 1.2fr",
              textTransform: "uppercase",
            }}
          >
            <span>Week</span>
            <span>Sets</span>
            <span>Reps</span>
            <span>RIR</span>
            <span>Rest</span>
          </div>

          {weeklyPrescriptions.map((week) => (
            <div
              key={week.weekNumber}
              style={{
                alignItems: "center",
                display: "grid",
                gap: "6px",
                gridTemplateColumns: "48px 1fr 1fr 1fr 1.2fr",
              }}
            >
              <strong>{week.isDeload ? "D" : `W${week.weekNumber}`}</strong>
              {["sets", "reps", "rir", "restSeconds"].map((field) => (
                <button
                  key={field}
                  disabled={week.isDeload}
                  onClick={() => {
                    if (!week.isDeload) {
                      onEditValue(week.weekNumber, field);
                    }
                  }}
                  style={{
                    opacity: week.isDeload ? 0.72 : 1,
                    minHeight: "38px",
                    padding: "6px 8px",
                    textAlign: "center",
                  }}
                >
                  {formatWeeklyPrescriptionValue(field, week[field])}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScopeSwitch({ checked, label, onChange }) {
  return (
    <label
      style={{
        alignItems: "center",
        display: "flex",
        gap: "8px",
        justifyContent: "space-between",
      }}
    >
      <span>{label}</span>
      <button
        aria-pressed={checked}
        onClick={() => onChange(!checked)}
        type="button"
        style={{
          alignItems: "center",
          background: checked ? "var(--accent)" : "var(--surface-muted)",
          border: "1px solid var(--border)",
          borderRadius: "999px",
          display: "inline-flex",
          height: "26px",
          justifyContent: checked ? "flex-end" : "flex-start",
          padding: "2px",
          width: "46px",
        }}
      >
        <span
          style={{
            background: "var(--surface)",
            borderRadius: "999px",
            display: "block",
            height: "20px",
            width: "20px",
          }}
        />
      </button>
    </label>
  );
}

function WeeklyPrescriptionValuePicker({
  field,
  onClose,
  onSelect,
  scope,
  setScope,
  value,
  weekNumber,
}) {
  const [isClosing, setIsClosing] = useState(false);
  const [manualValue, setManualValue] = useState(String(value ?? ""));
  const scrollRef = useRef(null);
  const isUserScrollingRef = useRef(false);
  const hapticIndexRef = useRef(null);
  const values =
    field === "sets"
      ? WEEKLY_SET_VALUES
      : field === "reps"
        ? WEEKLY_REP_VALUES
        : field === "restSeconds"
          ? WEEKLY_REST_SECOND_VALUES
          : WEEKLY_RIR_VALUES;
  const title =
    field === "sets"
      ? "sets"
      : field === "reps"
        ? "reps"
        : field === "restSeconds"
          ? "rest"
          : "RIR";

  function handlePickerScroll() {
    const scroller = scrollRef.current;

    if (!scroller || !isUserScrollingRef.current || !scroller.children.length) {
      return;
    }

    const scrollerRect = scroller.getBoundingClientRect();
    const selectionY = scrollerRect.top + scrollerRect.height / 2;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    Array.from(scroller.children).forEach((child, index) => {
      const childRect = child.getBoundingClientRect();
      const childCenter = childRect.top + childRect.height / 2;
      const distance = Math.abs(childCenter - selectionY);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    if (hapticIndexRef.current !== closestIndex) {
      hapticIndexRef.current = closestIndex;
      void triggerNativePickerSelectionHaptic();
    }
  }

  useEffect(() => {
    if (!scrollRef.current) {
      return;
    }

    setTimeout(() => {
      const selectedIndex = values.findIndex(
        (option) => option === Number(manualValue)
      );

      if (selectedIndex < 0) {
        return;
      }

      scrollRef.current.children[selectedIndex]?.scrollIntoView({
        block: "center",
      });
    }, 0);
  }, [manualValue, values]);

  function closeWithAnimation() {
    setIsClosing(true);
    setTimeout(onClose, 750);
  }

  function saveManualValue() {
    const nextValue = Math.max(0, Number(manualValue));

    if (!Number.isNaN(nextValue)) {
      onSelect(nextValue);
    }

    closeWithAnimation();
  }

  if (!field) {
    return null;
  }

  return (
    <div
      onClick={closeWithAnimation}
      style={{
        alignItems: "flex-end",
        background: "rgba(0,0,0,.45)",
        display: "flex",
        inset: 0,
        justifyContent: "center",
        position: "fixed",
        zIndex: 1200,
      }}
    >
      <style>
        {`
          .plan-weekly-value-picker-sheet {
            animation: planSheetSlideUp 750ms cubic-bezier(.16, 1, .3, 1) both;
            will-change: opacity, transform;
          }

          .plan-weekly-value-picker-sheet[data-closing="true"] {
            animation-name: planSheetSlideDown;
          }

          @media (prefers-reduced-motion: reduce) {
            .plan-weekly-value-picker-sheet {
              animation: none;
            }
          }
        `}
      </style>
      <div
        onClick={(event) => event.stopPropagation()}
        className="plan-weekly-value-picker-sheet"
        data-closing={isClosing ? "true" : "false"}
        style={{
          background: "var(--surface-raised)",
          borderTopLeftRadius: "10px",
          borderTopRightRadius: "10px",
          boxShadow: "0 -6px 24px rgba(0,0,0,.25)",
          boxSizing: "border-box",
          color: "var(--text)",
          maxHeight: "calc(100dvh - 16px)",
          overflowY: "auto",
          padding: "14px 16px calc(96px + env(safe-area-inset-bottom))",
          WebkitOverflowScrolling: "touch",
          width: "min(420px, 100%)",
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "12px",
          }}
        >
          <strong>
            Week {weekNumber} {title}
          </strong>
          <button
            aria-label="Close value picker"
            onClick={closeWithAnimation}
            style={{
              alignItems: "center",
              display: "inline-flex",
              justifyContent: "center",
              minHeight: "34px",
              minWidth: "34px",
              padding: "4px",
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gap: "8px",
            marginBottom: "14px",
          }}
        >
          <ScopeSwitch
            checked={scope.allExercises}
            label="All exercises"
            onChange={(checked) =>
              setScope((current) => ({ ...current, allExercises: checked }))
            }
          />
          <ScopeSwitch
            checked={scope.allDays}
            label="All days"
            onChange={(checked) =>
              setScope((current) => ({ ...current, allDays: checked }))
            }
          />
          <ScopeSwitch
            checked={scope.allWeeks}
            label="All weeks"
            onChange={(checked) =>
              setScope((current) => ({ ...current, allWeeks: checked }))
            }
          />
        </div>

        <div
          style={{
            color: "var(--text-muted)",
            fontSize: "12px",
            marginBottom: "8px",
            textAlign: "center",
          }}
        >
          Scroll or tap a value
        </div>

        <div
          ref={scrollRef}
          onPointerDown={() => {
            isUserScrollingRef.current = true;
          }}
          onScroll={handlePickerScroll}
          onWheel={() => {
            isUserScrollingRef.current = true;
          }}
          style={{
            border: "1px solid var(--border)",
            maxHeight: "260px",
            overflowY: "auto",
            padding: "4px",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {values.map((option) => (
            <button
              key={option}
              onClick={() => {
                setManualValue(String(option));
              }}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text)",
                display: "block",
                fontSize: Number(manualValue) === option ? "24px" : "16px",
                fontWeight: Number(manualValue) === option ? "bold" : "normal",
                opacity: Number(manualValue) === option ? 1 : 0.6,
                padding: "6px",
                width: "100%",
              }}
            >
              {field === "restSeconds" ? formatRestDuration(option) : option}
            </button>
          ))}
        </div>

        <div
          style={{
            alignItems: "center",
            display: "flex",
            justifyContent: "space-between",
            marginTop: "12px",
          }}
        >
          <button
            aria-label="Cancel value change"
            onClick={closeWithAnimation}
            style={{
              border: "none",
              background: "transparent",
              fontSize: "28px",
            }}
          >
            ❌
          </button>

          <input
            inputMode={field === "restSeconds" ? "numeric" : "decimal"}
            min="0"
            value={manualValue}
            onChange={(event) => setManualValue(event.target.value)}
            style={{
              fontSize: "22px",
              fontWeight: "bold",
              textAlign: "center",
              width: "90px",
            }}
          />

          <button
            aria-label="Apply value change"
            onClick={saveManualValue}
            style={{
              border: "none",
              background: "transparent",
              fontSize: "28px",
            }}
          >
            ✅
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkoutTypePickerSheet({
  canMoveLeft = false,
  canMoveRight = false,
  currentWorkoutType,
  dayLabel,
  onClose,
  onDelete,
  onMoveLeft,
  onMoveRight,
  onSelect,
  showDelete = false,
  showMove = false,
}) {
  const [isClosing, setIsClosing] = useState(false);
  const [isInteractive, setIsInteractive] = useState(false);
  const closeWithAnimation = () => {
    setIsClosing(true);
    window.setTimeout(onClose, 730);
  };

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setIsInteractive(true);
    }, 260);

    return () => window.clearTimeout(timeoutId);
  }, []);

  if (!dayLabel) {
    return null;
  }

  return (
    <div
      role="presentation"
      style={{
        background: "rgba(0,0,0,.42)",
        inset: 0,
        position: "fixed",
        zIndex: 2200,
      }}
    >
      <style>
        {`
          .plan-workout-type-picker-sheet {
            animation: planSheetSlideUp 750ms cubic-bezier(.16, 1, .3, 1) both;
            -webkit-touch-callout: none;
            -webkit-user-select: none;
            user-select: none;
          }

          .plan-workout-type-picker-sheet[data-closing="true"] {
            animation-name: planSheetSlideDown;
          }

          @keyframes planSheetSlideUp {
            from {
              transform: translateY(calc(100% + 24px));
            }

            to {
              transform: translateY(0);
            }
          }

          @keyframes planSheetSlideDown {
            from {
              transform: translateY(0);
            }

            to {
              transform: translateY(calc(100% + 24px));
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .plan-workout-type-picker-sheet {
              animation: none;
            }
          }
        `}
      </style>
      <div
        className="plan-workout-type-picker-sheet"
        data-closing={isClosing ? "true" : "false"}
        role="dialog"
        aria-modal="true"
        aria-label={`${dayLabel} workout type`}
        onClick={(event) => event.stopPropagation()}
        style={{
          background: "var(--surface-raised)",
          borderTop: "1px solid var(--border)",
          borderRadius: "12px 12px 0 0",
          bottom: 0,
          boxShadow: "0 -16px 36px rgba(0,0,0,.28)",
          display: "grid",
          gap: "10px",
          left: 0,
          maxHeight: "76vh",
          overflowY: "auto",
          padding: "14px",
          pointerEvents: isInteractive ? "auto" : "none",
          position: "absolute",
          right: 0,
          WebkitOverflowScrolling: "touch",
          WebkitTouchCallout: "none",
          WebkitUserSelect: "none",
          userSelect: "none",
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <h3
            style={{
              fontSize: "16px",
              margin: 0,
            }}
          >
            {dayLabel} Workout Type
          </h3>
          <div
            style={{
              display: "flex",
              gap: "6px",
            }}
          >
            {showMove && (
              <>
                <button
                  aria-label={`Move ${dayLabel} earlier`}
                  disabled={!canMoveLeft}
                  onClick={() => {
                    if (!isInteractive || !canMoveLeft) {
                      return;
                    }

                    onMoveLeft?.();
                  }}
                  style={{
                    opacity: canMoveLeft ? 1 : 0.45,
                  }}
                  type="button"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  aria-label={`Move ${dayLabel} later`}
                  disabled={!canMoveRight}
                  onClick={() => {
                    if (!isInteractive || !canMoveRight) {
                      return;
                    }

                    onMoveRight?.();
                  }}
                  style={{
                    opacity: canMoveRight ? 1 : 0.45,
                  }}
                  type="button"
                >
                  <ChevronRight size={16} />
                </button>
              </>
            )}
            {showDelete && (
              <button
                aria-label={`Delete ${dayLabel}`}
                onClick={() => {
                  if (!isInteractive) {
                    return;
                  }

                  onDelete?.();
                }}
                style={{
                  background: "var(--danger-bg)",
                  border: "1px solid var(--danger-border)",
                  color: "var(--danger-text)",
                }}
              >
                <Trash2 size={16} />
              </button>
            )}
            <button aria-label="Close workout type picker" onClick={closeWithAnimation}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: "8px",
          }}
        >
          {WORKOUT_TYPE_OPTIONS.map((option) => {
            const selected = option.value === currentWorkoutType;

            return (
              <button
                key={option.value}
                aria-pressed={selected}
                onContextMenu={(event) => event.preventDefault()}
                onClick={() => {
                  if (!isInteractive) {
                    return;
                  }

	                  onSelect(option.value);
	                }}
                style={{
                  alignItems: "center",
                  background: selected ? "var(--accent)" : "var(--surface-muted)",
                  border: selected
                    ? "1px solid var(--accent)"
                    : "1px solid var(--border)",
                  color: selected ? "#fff" : "var(--text)",
                  display: "flex",
                  justifyContent: "space-between",
                  minHeight: "42px",
                  padding: "8px 10px",
                  textAlign: "left",
                  WebkitTouchCallout: "none",
                  WebkitUserSelect: "none",
                  userSelect: "none",
                }}
              >
                {option.label}
                {selected && <span>Current</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function PlansView({
  bodyWeightEntries = [],
  editingPlan,
  exerciseLibrary,
  exerciseMetadata,
  history,
  onBuildAiPlanDraft,
  onCancel,
  onCopyAiPlanPrompt,
  onDownloadAiPlanContext,
  onOpenChatGptForAiPlan,
  onShowAiPlanNotes,
  onSave,
  plans,
  setPlans,
  setTemplates,
  templates,
}) {
  const initialPlanType = editingPlan?.planType || "ai";
  const initialPlanDefaults = getPlanTypeDefaults(initialPlanType);
  const editingPlanConfig = editingPlan?.config || {};
  const initialDaysPerWeek = formatPlanSetting(
    editingPlan?.daysPerWeek,
    initialPlanDefaults.daysPerWeek
  );
  const initialDurationWeeks = formatPlanSetting(
    editingPlan?.durationWeeks,
    initialPlanDefaults.durationWeeks
  );
  const [durationWeeks, setDurationWeeks] = useState(
    initialDurationWeeks
  );
  const [deload, setDeload] = useState(
    editingPlanConfig.deload ?? initialPlanDefaults.deload ?? false
  );
  const [daysPerWeek, setDaysPerWeek] = useState(
    initialDaysPerWeek
  );
  const [generationMode, setGenerationMode] = useState("plan");
  const [goal, setGoal] = useState(editingPlan?.goal || initialPlanDefaults.goal);
  const [planType, setPlanType] = useState(initialPlanType);
  const [workoutType, setWorkoutType] = useState("type-2");
  const [planName, setPlanName] = useState(() =>
    editingPlan?.name ||
    getDefaultPlanName(initialPlanType, initialDaysPerWeek, initialDurationWeeks)
  );
  const [workoutName, setWorkoutName] = useState(() =>
    getDefaultWorkoutName("type-2")
  );
  const [isPlanNameCustom, setIsPlanNameCustom] = useState(Boolean(editingPlan));
  const [reps, setReps] = useState(
    formatPlanSetting(editingPlanConfig.reps, initialPlanDefaults.reps)
  );
  const [rir, setRir] = useState(
    formatPlanSetting(editingPlanConfig.rir, initialPlanDefaults.rir)
  );
  const [sets, setSets] = useState(
    formatPlanSetting(editingPlanConfig.sets, initialPlanDefaults.sets || "3")
  );
  const [rirPeriodization, setRirPeriodization] = useState(
    editingPlanConfig.rirPeriodization ||
      initialPlanDefaults.rirPeriodization ||
      getDefaultRirPeriodizationMode(initialPlanType)
  );
  const [editPreviewWorkouts, setEditPreviewWorkouts] = useState(() =>
    buildEditablePlanWorkouts(editingPlan, templates)
  );
  const [createPreviewEditMode, setCreatePreviewEditMode] = useState(false);
  const [createPreviewEditSnapshot, setCreatePreviewEditSnapshot] =
    useState(null);
  const [seed, setSeed] = useState(0);
  const [saveStatus, setSaveStatus] = useState("");
  const [replacementBySlot, setReplacementBySlot] = useState({});
  const [weeklyPrescriptionBySlot, setWeeklyPrescriptionBySlot] = useState({});
  const [weeklyPrescriptionTarget, setWeeklyPrescriptionTarget] = useState(null);
  const [weeklyPrescriptionPicker, setWeeklyPrescriptionPicker] = useState(null);
  const [weeklyPrescriptionScope, setWeeklyPrescriptionScope] = useState({
    allDays: false,
    allExercises: false,
    allWeeks: false,
  });
  const [workoutTypeByDay, setWorkoutTypeByDay] = useState(
    editingPlanConfig.workoutTypeByDay || {}
  );
  const [workoutTypePickerTarget, setWorkoutTypePickerTarget] = useState(null);
  const [confirmDeleteDay, setConfirmDeleteDay] = useState(null);
  const [confirmDeleteExercise, setConfirmDeleteExercise] = useState(null);
  const [workoutNameBySlot, setWorkoutNameBySlot] = useState({});
  const [pickerTarget, setPickerTarget] = useState(null);
  const [addExerciseTarget, setAddExerciseTarget] = useState(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerMuscle, setPickerMuscle] = useState("");
  const [summaryWorkout, setSummaryWorkout] = useState(null);
  const [planSummaryOpen, setPlanSummaryOpen] = useState(false);
  const [aiPlanDraftText, setAiPlanDraftText] = useState(() =>
    editingPlan ? "" : readStoredAiPlanDraftText()
  );
  const [aiPlanStatus, setAiPlanStatus] = useState("");
  const [aiPlanAnalysis, setAiPlanAnalysis] = useState(editingPlan?.aiAnalysis || null);
  const [aiPlanDeloadWeeks, setAiPlanDeloadWeeks] = useState(
    editingPlanConfig.deloadWeeks ?? null
  );
  const [detailExercise, setDetailExercise] = useState(null);
  const [activeValuePicker, setActiveValuePicker] = useState(null);
  const [activeWorkoutIndex, setActiveWorkoutIndex] = useState(0);
  const [exerciseLayoutByWorkout, setExerciseLayoutByWorkout] = useState(null);
  const [supersetGroupBySlot, setSupersetGroupBySlot] = useState({});
  const [dayOrder, setDayOrder] = useState(null);
  const planStickyHeaderRef = useRef(null);
  const planDayStripRef = useRef(null);
  const aiPlanDraftRestoredRef = useRef(false);
  const [trainerUsers, setTrainerUsers] = useState([]);
  const [selectedTrainerUserId, setSelectedTrainerUserId] = useState("");
  const [trainerPreferences, setTrainerPreferences] = useState([]);
  const [trainerStatus, setTrainerStatus] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: 320,
        tolerance: 8,
      },
    })
  );
  const selectedTrainerUser =
    trainerUsers.find((user) => user.user_id === selectedTrainerUserId) ||
    trainerUsers.find((user) => user.is_self) ||
    trainerUsers[0] ||
    null;
  const isTrainerTargetSelf = !selectedTrainerUser || selectedTrainerUser.is_self;
  const isPlanEditMode = Boolean(editingPlan) || createPreviewEditMode;
  const isCreateDraftEditMode =
    !editingPlan && generationMode === "plan" && createPreviewEditMode;
  const isAiPlanType = generationMode === "plan" && planType === "ai";
  const showPlanSetPicker =
    generationMode === "plan" &&
    ["type-3", "type-4", "type-5"].includes(planType);

  useEffect(() => {
    let cancelled = false;

    async function loadTrainerUsers() {
      if (!isSupabaseConfigured || !supabase) {
        return;
      }

      const { data, error } = await supabase.rpc("list_trainer_users");

      if (cancelled) {
        return;
      }

      if (error) {
        setTrainerStatus(`Unable to load users: ${error.message}`);
        return;
      }

      const users = Array.isArray(data) ? data : [];
      setTrainerUsers(users);
      setSelectedTrainerUserId((currentUserId) => {
        if (currentUserId && users.some((user) => user.user_id === currentUserId)) {
          return currentUserId;
        }

        return users.find((user) => user.is_self)?.user_id || users[0]?.user_id || "";
      });
      setTrainerStatus("");
    }

    loadTrainerUsers();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadTrainerPreferences() {
      if (!selectedTrainerUserId || !isSupabaseConfigured || !supabase) {
        setTrainerPreferences([]);
        return;
      }

      const { data, error } = await supabase.rpc(
        "get_trainer_user_exercise_preferences",
        {
          target_user_id: selectedTrainerUserId,
        }
      );

      if (cancelled) {
        return;
      }

      if (error) {
        setTrainerStatus(`Unable to load exercise preferences: ${error.message}`);
        setTrainerPreferences([]);
        return;
      }

      setTrainerPreferences(Array.isArray(data) ? data : []);
      setTrainerStatus("");
    }

    loadTrainerPreferences();

    return () => {
      cancelled = true;
    };
  }, [selectedTrainerUserId]);

  useEffect(() => {
    if (!workoutTypePickerTarget || !planDayStripRef.current) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const stripRect = planDayStripRef.current.getBoundingClientRect();
      const headerHeight =
        planStickyHeaderRef.current?.getBoundingClientRect().height || 0;
      const visibleTopOffset = headerHeight + 18;
      const targetTop = window.scrollY + stripRect.top - visibleTopOffset;

      window.scrollTo({
        top: Math.max(0, targetTop),
        behavior: "smooth",
      });
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [workoutTypePickerTarget]);

  const generatorExerciseLibrary = useMemo(() => {
    if (isTrainerTargetSelf) {
      return exerciseLibrary;
    }

    const preferenceByKey = new Map();
    trainerPreferences.forEach((preference) => {
      getPreferenceExerciseKeys(preference).forEach((key) => {
        preferenceByKey.set(key, preference);
      });
    });

    return exerciseLibrary
      .filter((exercise) => exercise.builtin)
      .map((exercise) => {
        const preference = getExercisePreferenceKeys(exercise)
          .map((key) => preferenceByKey.get(key))
          .find(Boolean);

        return {
          ...exercise,
          active: preference?.exclude_from_plans ? "inactive" : "active",
        };
      });
  }, [
    exerciseLibrary,
    isTrainerTargetSelf,
    trainerPreferences,
  ]);

  const recentPlanHistoryWorkouts = useMemo(
    () => buildRecentPlanHistoryWorkouts(plans, templates, editingPlan?.id),
    [editingPlan?.id, plans, templates]
  );

  const generatedPlan = useMemo(
    () => {
      if (editPreviewWorkouts) {
        return {
          gaps: [],
          workouts: editPreviewWorkouts,
        };
      }

      if (isAiPlanType) {
        return {
          gaps: [],
          workouts: [],
        };
      }

      return generatePlanWorkouts({
        daysPerWeek,
        durationWeeks,
        exerciseLibrary: generatorExerciseLibrary,
        exerciseMetadata,
        generationMode,
        goal,
        history,
        planHistoryWorkouts: recentPlanHistoryWorkouts,
        planType,
        reps,
        rir,
        seed,
        sets,
        workoutType,
        workoutTypeByDay,
      });
    },
    [
      daysPerWeek,
      durationWeeks,
      editPreviewWorkouts,
      generatorExerciseLibrary,
      exerciseMetadata,
      generationMode,
      goal,
      history,
      isAiPlanType,
      recentPlanHistoryWorkouts,
      planType,
      reps,
      rir,
      seed,
      sets,
      workoutType,
      workoutTypeByDay,
    ]
  );

  const exerciseSlotByKey = useMemo(() => {
    const slots = new Map();

    generatedPlan.workouts.forEach((workout, workoutIndex) => {
      workout.exercises.forEach((exercise) => {
        const slotKey = `${workoutIndex}:${exercise.id}`;

        slots.set(slotKey, {
          exercise,
          slotKey,
          workoutIndex,
        });
      });
    });

    return slots;
  }, [generatedPlan.workouts]);

  const normalizedExerciseLayout = useMemo(() => {
    const defaultLayout = generatedPlan.workouts.map((workout, workoutIndex) =>
      workout.exercises.map((exercise) => `${workoutIndex}:${exercise.id}`)
    );

    if (!exerciseLayoutByWorkout) {
      return defaultLayout;
    }

    const validSlotKeys = new Set(exerciseSlotByKey.keys());
    const usedSlotKeys = new Set();
    const layout = generatedPlan.workouts.map((workout, workoutIndex) => {
      const savedSlotKeys = exerciseLayoutByWorkout[workoutIndex] || [];

      return savedSlotKeys.filter((slotKey) => {
        if (!validSlotKeys.has(slotKey) || usedSlotKeys.has(slotKey)) {
          return false;
        }

        usedSlotKeys.add(slotKey);
        return true;
      });
    });

    defaultLayout.forEach((slotKeys, workoutIndex) => {
      slotKeys.forEach((slotKey) => {
        if (!usedSlotKeys.has(slotKey)) {
          layout[workoutIndex].push(slotKey);
          usedSlotKeys.add(slotKey);
        }
      });
    });

    return layout;
  }, [exerciseLayoutByWorkout, exerciseSlotByKey, generatedPlan.workouts]);

  const previewWorkouts = useMemo(
    () =>
      generatedPlan.workouts.map((workout, workoutIndex) => ({
        ...workout,
        name: Object.prototype.hasOwnProperty.call(
          workoutNameBySlot,
          workoutIndex
        )
          ? workoutNameBySlot[workoutIndex]
          : generationMode === "workout"
            ? workoutName
            : editPreviewWorkouts
              ? workout.name
              : getDefaultSavedWorkoutName(workout, workoutIndex, planType),
        previewWorkoutKey: workoutIndex,
        exercises: normalizedExerciseLayout[workoutIndex]
          .map((slotKey) => {
            const slot = exerciseSlotByKey.get(slotKey);

            if (!slot) {
              return null;
            }

            const exercise = slot.exercise;
            const replacementExercise = replacementBySlot[slotKey];
            const supersetGroup = Object.prototype.hasOwnProperty.call(
              supersetGroupBySlot,
              slotKey
            )
              ? supersetGroupBySlot[slotKey]
              : exercise.supersetGroup;
            const previewExercise = replacementExercise
              ? createReplacementPlanExercise({
                  goal,
                  history,
                  replacementExercise,
                  replacedExercise: exercise,
                  supersetGroup,
                  fallbackReps: reps,
                  fallbackRir: rir,
                })
              : {
                  ...exercise,
                  supersetGroup,
                };

            return {
              ...previewExercise,
              previewSlotKey: slotKey,
              ...(generationMode === "plan"
                ? {
                    weeklyPrescriptions: normalizeWeeklyPrescriptions({
                      deload,
                      durationWeeks,
                      exercise: previewExercise,
                      overrides: weeklyPrescriptionBySlot[slotKey],
                      reps,
                      rir,
                      rirPeriodization,
                    }),
                  }
                : {}),
            };
          })
          .filter(Boolean),
      })),
    [
      generatedPlan.workouts,
      goal,
      history,
      exerciseSlotByKey,
      normalizedExerciseLayout,
      replacementBySlot,
      supersetGroupBySlot,
      deload,
      durationWeeks,
      reps,
      rir,
      rirPeriodization,
      weeklyPrescriptionBySlot,
      workoutNameBySlot,
      generationMode,
      editPreviewWorkouts,
      planType,
      workoutName,
    ]
  );

  const allPreviewSlotKeys = useMemo(
    () =>
      previewWorkouts.flatMap((workout) =>
        workout.exercises.map((exercise) => exercise.previewSlotKey)
      ),
    [previewWorkouts]
  );
  const orderedWorkoutKeys = useMemo(
    () => normalizeDayOrder(dayOrder, previewWorkouts.length),
    [dayOrder, previewWorkouts.length]
  );
  const orderedPreviewWorkouts = useMemo(
    () =>
      orderedWorkoutKeys
        .map((workoutKey, dayIndex) => {
          const workout = previewWorkouts[workoutKey];

          if (!workout) {
            return null;
          }

          return {
            ...workout,
            dayNumber: dayIndex + 1,
            name:
              generationMode === "workout"
                ? workout.name
                : editPreviewWorkouts
                  ? workout.name
                : renameWorkoutForDayOrder(
                    workout.name,
                    dayIndex + 1,
                    planType
                  ),
          };
        })
        .filter(Boolean),
    [
      generationMode,
      editPreviewWorkouts,
      orderedWorkoutKeys,
      planType,
      previewWorkouts,
    ]
  );
  const displayedWorkout =
    orderedPreviewWorkouts.find(
      (workout) => workout.previewWorkoutKey === activeWorkoutIndex
    ) ||
    orderedPreviewWorkouts[0] ||
    null;
  const displayedWorkoutKey = displayedWorkout?.previewWorkoutKey ?? 0;
  const canEditPlanDays = generationMode === "plan";
  const canAddPlanDay = generationMode === "plan" && isPlanEditMode;
  const canSaveGeneratedPlan =
    generationMode === "workout" || orderedPreviewWorkouts.length > 0;
  const weeklyPrescriptionExercise = useMemo(() => {
    if (!weeklyPrescriptionTarget) {
      return null;
    }

    return (
      orderedPreviewWorkouts
        .flatMap((workout) => workout.exercises)
        .find(
          (exercise) =>
            String(exercise.previewSlotKey) ===
            String(weeklyPrescriptionTarget.previewSlotKey)
        ) || null
    );
  }, [orderedPreviewWorkouts, weeklyPrescriptionTarget]);

  function getWeeksForExercise(exercise, currentOverrides) {
    return (
      currentOverrides?.[exercise.previewSlotKey] ||
      exercise.weeklyPrescriptions ||
      normalizeWeeklyPrescriptions({
        deload,
        durationWeeks,
        exercise,
        reps,
        rir,
        rirPeriodization,
      })
    );
  }

  function clonePlanEditWorkouts(workouts) {
    return (workouts || []).map((workout, workoutIndex) => ({
      ...workout,
      dayNumber: workoutIndex + 1,
      exercises: (workout.exercises || []).map((exercise) => ({
        ...exercise,
        sets: (exercise.sets || []).map((set) => ({ ...set })),
        weeklyPrescriptions: exercise.weeklyPrescriptions
          ? exercise.weeklyPrescriptions.map((week) => ({ ...week }))
          : undefined,
      })),
      previewWorkoutKey: workoutIndex,
    }));
  }

  function makeGeneratedWorkoutForType(workoutTypeValue, workoutIndex) {
    const workout = generatePlanWorkouts({
      daysPerWeek: 1,
      durationWeeks,
      exerciseLibrary: generatorExerciseLibrary,
      exerciseMetadata,
      generationMode: "workout",
      goal,
      history,
      planType,
      reps,
      rir,
      seed: seed + Number(workoutIndex || 0),
      workoutType: workoutTypeValue,
    }).workouts[0];

    return {
      ...workout,
      dayNumber: workoutIndex + 1,
      name:
        ["type-4", "type-5"].includes(planType)
          ? `${getCompactPlanTypeLabel(planType)} W${workoutIndex + 1} ${
              workout.workoutTypeLabel || getWorkoutTypeLabel(workoutTypeValue)
            }`
          : workout.name,
      previewWorkoutKey: workoutIndex,
    };
  }

  function enterPlanDraftEditMode(workouts = orderedPreviewWorkouts) {
    if (generationMode !== "plan") {
      return;
    }

    if (!editingPlan) {
      setCreatePreviewEditMode(true);
      setCreatePreviewEditSnapshot((currentSnapshot) => {
        if (currentSnapshot) {
          return currentSnapshot;
        }

        return {
          activeWorkoutIndex,
          dayOrder: dayOrder ? [...dayOrder] : null,
          editPreviewWorkouts: editPreviewWorkouts
            ? clonePlanEditWorkouts(editPreviewWorkouts)
            : null,
          exerciseLayoutByWorkout: exerciseLayoutByWorkout
            ? Object.fromEntries(
                Object.entries(exerciseLayoutByWorkout).map(([key, value]) => [
                  key,
                  [...value],
                ])
              )
            : null,
          replacementBySlot: { ...replacementBySlot },
          supersetGroupBySlot: { ...supersetGroupBySlot },
          weeklyPrescriptionBySlot: Object.fromEntries(
            Object.entries(weeklyPrescriptionBySlot).map(([key, weeks]) => [
              key,
              weeks.map((week) => ({ ...week })),
            ])
          ),
          workoutNameBySlot: { ...workoutNameBySlot },
          workoutTypeByDay: { ...workoutTypeByDay },
          workouts: clonePlanEditWorkouts(workouts),
        };
      });
    }

    if (!editPreviewWorkouts) {
      setEditPreviewWorkouts(clonePlanEditWorkouts(workouts));
    }
  }

  function updateWeeklyPrescriptionValue(
    slotKey,
    weekNumber,
    field,
    value,
    scope = weeklyPrescriptionScope
  ) {
    enterPlanDraftEditMode();
    setWeeklyPrescriptionBySlot((current) => {
      const targetWorkout = orderedPreviewWorkouts.find((workout) =>
        workout.exercises.some(
          (exercise) => String(exercise.previewSlotKey) === String(slotKey)
        )
      );
      const targetExercise = targetWorkout?.exercises.find(
        (exercise) => String(exercise.previewSlotKey) === String(slotKey)
      );
      const scopedWorkouts = scope.allDays
        ? orderedPreviewWorkouts
        : [targetWorkout].filter(Boolean);
      const exerciseMatchesTarget = (exercise) => {
        if (!targetExercise) {
          return false;
        }

        if (exercise.exerciseId && targetExercise.exerciseId) {
          return String(exercise.exerciseId) === String(targetExercise.exerciseId);
        }

        return (
          String(exercise.name || "").toLowerCase() ===
            String(targetExercise.name || "").toLowerCase() &&
          String(exercise.equipment?.[0] || "").toLowerCase() ===
            String(targetExercise.equipment?.[0] || "").toLowerCase()
        );
      };
      const scopedExercises = scopedWorkouts.flatMap((workout) =>
        scope.allExercises
          ? workout.exercises
          : workout.exercises.filter((exercise) => exerciseMatchesTarget(exercise))
      );

      return scopedExercises.reduce(
        (next, exercise) => ({
          ...next,
          [exercise.previewSlotKey]: getWeeksForExercise(exercise, next).map((week) =>
            !week.isDeload &&
            (scope.allWeeks || Number(week.weekNumber) === Number(weekNumber))
              ? {
                  ...week,
                  [field]: String(value),
                }
              : week
          ),
        }),
        {
          ...current,
        }
      );
    });
    setSaveStatus("");
  }

  function resetPlanPreviewEdits() {
    setActiveWorkoutIndex(0);
    setCreatePreviewEditMode(false);
    setCreatePreviewEditSnapshot(null);
    setExerciseLayoutByWorkout(null);
    setReplacementBySlot({});
    setWeeklyPrescriptionBySlot({});
    setWeeklyPrescriptionTarget(null);
    setWeeklyPrescriptionPicker(null);
    setWorkoutTypeByDay({});
    setWorkoutTypePickerTarget(null);
    setConfirmDeleteExercise(null);
    setAddExerciseTarget(null);
    setPickerTarget(null);
    setSupersetGroupBySlot({});
    setDayOrder(null);
  }

  function addPlanDay(workoutTypeValue = "full-body") {
    const baseWorkouts = clonePlanEditWorkouts(orderedPreviewWorkouts);
    const nextWorkoutIndex = baseWorkouts.length;
    const nextWorkout = makeGeneratedWorkoutForType(
      workoutTypeValue,
      nextWorkoutIndex
    );
    const nextWorkouts = [...baseWorkouts, nextWorkout].map((workout, index) => ({
      ...workout,
      dayNumber: index + 1,
      previewWorkoutKey: index,
    }));

    enterPlanDraftEditMode(nextWorkouts);
    setEditPreviewWorkouts(nextWorkouts);
    setDaysPerWeek(String(nextWorkouts.length));
    setDayOrder(null);
    setWorkoutTypeByDay(
      nextWorkouts.reduce((types, workout, index) => {
        types[index] = workout.workoutType || "full-body";
        return types;
      }, {})
    );
    setActiveWorkoutIndex(nextWorkoutIndex);
    setWorkoutTypePickerTarget(null);
    setSaveStatus("");
  }

  function requestDeletePlanDay(target) {
    if (!target || orderedPreviewWorkouts.length <= 1) {
      setWorkoutTypePickerTarget(null);
      setSaveStatus("A plan needs at least one day.");
      return;
    }

    void triggerNativeWarningHaptic();
    setConfirmDeleteDay(target);
  }

  function movePlanDay(target, direction) {
    if (!target || target.isNewDay) {
      return;
    }

    const currentIndex = orderedWorkoutKeys.indexOf(target.workoutKey);
    const nextIndex = currentIndex + direction;

    if (
      currentIndex === -1 ||
      nextIndex < 0 ||
      nextIndex >= orderedWorkoutKeys.length
    ) {
      return;
    }

    enterPlanDraftEditMode();
    setDayOrder(arrayMove(orderedWorkoutKeys, currentIndex, nextIndex));
    setActiveWorkoutIndex(target.workoutKey);
    setWorkoutTypePickerTarget({
      ...target,
      dayIndex: nextIndex,
    });
    setSaveStatus("");
  }

  function deletePlanDay(target) {
    if (!target) {
      return;
    }

    const nextWorkouts = clonePlanEditWorkouts(orderedPreviewWorkouts)
      .filter((workout) => workout.previewWorkoutKey !== target.workoutKey)
      .map((workout, index) => ({
        ...workout,
        dayNumber: index + 1,
        previewWorkoutKey: index,
      }));

    if (nextWorkouts.length === 0) {
      setConfirmDeleteDay(null);
      setSaveStatus("A plan needs at least one day.");
      return;
    }

    enterPlanDraftEditMode(nextWorkouts);
    setEditPreviewWorkouts(nextWorkouts);
    setDaysPerWeek(String(nextWorkouts.length));
    setActiveWorkoutIndex(Math.min(target.dayIndex, nextWorkouts.length - 1));
    setDayOrder(null);
    setWorkoutTypeByDay(
      nextWorkouts.reduce((types, workout, index) => {
        types[index] = workout.workoutType || "full-body";
        return types;
      }, {})
    );
    setReplacementBySlot({});
    setExerciseLayoutByWorkout(null);
    setSupersetGroupBySlot({});
    setWeeklyPrescriptionBySlot({});
    setWorkoutTypePickerTarget(null);
    setConfirmDeleteDay(null);
    setSaveStatus("");
  }

  function commitPreviewWorkoutExerciseEdit(nextWorkouts, activeIndex) {
    const normalizedWorkouts = nextWorkouts.map((workout, index) => ({
      ...workout,
      dayNumber: index + 1,
      previewWorkoutKey: index,
    }));

    enterPlanDraftEditMode(normalizedWorkouts);
    setEditPreviewWorkouts(normalizedWorkouts);
    setActiveWorkoutIndex(
      Math.min(Math.max(0, activeIndex || 0), normalizedWorkouts.length - 1)
    );
    setDayOrder(null);
    setReplacementBySlot({});
    setExerciseLayoutByWorkout(null);
    setSupersetGroupBySlot({});
    setWeeklyPrescriptionBySlot({});
    setSaveStatus("");
  }

  function deletePlanExercise(target) {
    if (!target?.workout || !target?.exercise) {
      setConfirmDeleteExercise(null);
      return;
    }

    const workoutIndex = orderedPreviewWorkouts.findIndex(
      (workout) =>
        workout.previewWorkoutKey === target.workout.previewWorkoutKey
    );

    if (workoutIndex < 0) {
      setConfirmDeleteExercise(null);
      return;
    }

    const nextWorkouts = clonePlanEditWorkouts(orderedPreviewWorkouts).map(
      (workout, index) =>
        index === workoutIndex
          ? {
              ...workout,
              exercises: workout.exercises.filter(
                (exercise) =>
                  String(exercise.previewSlotKey) !==
                  String(target.exercise.previewSlotKey)
              ),
            }
          : workout
    );

    commitPreviewWorkoutExerciseEdit(nextWorkouts, workoutIndex);
    setConfirmDeleteExercise(null);
  }

  function addPlanExerciseToWorkout(targetWorkout, selectedExercise) {
    if (!targetWorkout || !selectedExercise) {
      setAddExerciseTarget(null);
      return;
    }

    const workoutIndex = orderedPreviewWorkouts.findIndex(
      (workout) => workout.previewWorkoutKey === targetWorkout.previewWorkoutKey
    );

    if (workoutIndex < 0) {
      setAddExerciseTarget(null);
      return;
    }

    const setCount =
      Number(sets) ||
      targetWorkout.exercises?.[0]?.sets?.length ||
      orderedPreviewWorkouts[0]?.exercises?.[0]?.sets?.length ||
      3;
    const nextExercise = createPlanExercise({
      exercise: selectedExercise,
      goal,
      history,
      planMuscle: selectedExercise.muscles?.[0] || "",
      reps,
      rir,
      setCount,
      supersetGroup: null,
    });
    const nextWorkouts = clonePlanEditWorkouts(orderedPreviewWorkouts).map(
      (workout, index) =>
        index === workoutIndex
          ? {
              ...workout,
              exercises: [...workout.exercises, nextExercise],
            }
          : workout
    );

    commitPreviewWorkoutExerciseEdit(nextWorkouts, workoutIndex);
    setAddExerciseTarget(null);
    setPickerSearch("");
    setPickerMuscle("");
  }

  function changePlanDayWorkoutType(workoutKey, nextWorkoutType) {
    const currentWorkout = orderedPreviewWorkouts.find(
      (workout) => workout.previewWorkoutKey === workoutKey
    );
    const currentWorkoutType = currentWorkout?.workoutType || "full-body";

    if (!currentWorkout || currentWorkoutType === nextWorkoutType) {
      setWorkoutTypePickerTarget(null);
      return;
    }

    const baseWorkouts = clonePlanEditWorkouts(orderedPreviewWorkouts);
    const nextWorkouts = baseWorkouts.map((workout, index) => {
      if (workout.previewWorkoutKey !== workoutKey) {
        return workout;
      }

      return {
        ...makeGeneratedWorkoutForType(nextWorkoutType, index),
        dayNumber: workout.dayNumber || index + 1,
        id: workout.id,
        name: workoutNameBySlot[index] || workout.name,
        planId: workout.planId,
        planWorkoutId: workout.planWorkoutId,
        previewWorkoutKey: index,
      };
    });

    enterPlanDraftEditMode(nextWorkouts);
    setEditPreviewWorkouts(nextWorkouts);
    setWorkoutTypeByDay(
      nextWorkouts.reduce((types, workout, index) => {
        types[index] = workout.workoutType || "full-body";
        return types;
      }, {})
    );

    setWorkoutNameBySlot((current) => {
      if (Object.prototype.hasOwnProperty.call(current, workoutKey)) {
        return current;
      }

      return current;
    });
    setReplacementBySlot({});
    setExerciseLayoutByWorkout(null);
    setSupersetGroupBySlot({});
    setWeeklyPrescriptionBySlot({});
    setWorkoutTypePickerTarget(null);
    setSaveStatus("");
  }

  function regeneratePlanPreview() {
    setEditPreviewWorkouts(null);
    resetPlanPreviewEdits();
  }

  const applyAiPlanDraftText = useCallback((text, sourceName = "AI plan draft") => {
    if (typeof onBuildAiPlanDraft !== "function") {
      setAiPlanStatus("AI plan draft import is unavailable.");
      return;
    }

    try {
      const imported = onBuildAiPlanDraft(text);
      const importedPlan = imported.plan || {};
      const importedConfig = importedPlan.config || {};
      const importedWorkouts = clonePlanEditWorkouts(imported.templates || []);

      setAiPlanDraftText(text);
      writeStoredAiPlanDraftText(text);
      setPlanType("ai");
      setGenerationMode("plan");
      setPlanName(importedPlan.name || sourceName || "AI Plan Draft");
      setIsPlanNameCustom(true);
      setDaysPerWeek(String(importedPlan.daysPerWeek || importedWorkouts.length || "5"));
      setDurationWeeks(String(importedPlan.durationWeeks || "5"));
      setDeload(Boolean(importedConfig.deload));
      setAiPlanDeloadWeeks(importedConfig.deloadWeeks ?? null);
      setGoal(importedPlan.goal || "progress");
      setReps(formatPlanSetting(importedConfig.reps, "8"));
      setRir(formatPlanSetting(importedConfig.rir, "3"));
      setSets(formatPlanSetting(importedConfig.sets, "3"));
      setRirPeriodization(
        importedConfig.rirPeriodization ||
          getDefaultRirPeriodizationMode("ai")
      );
      setAiPlanAnalysis(importedPlan.aiAnalysis || null);
      setEditPreviewWorkouts(importedWorkouts);
      setCreatePreviewEditMode(true);
      setCreatePreviewEditSnapshot(null);
      setActiveWorkoutIndex(importedWorkouts[0]?.previewWorkoutKey || 0);
      setDayOrder(null);
      setWorkoutNameBySlot({});
      setWorkoutTypeByDay({});
      setReplacementBySlot({});
      setExerciseLayoutByWorkout(null);
      setSupersetGroupBySlot({});
      setWeeklyPrescriptionBySlot({});
      setSaveStatus("");
      setAiPlanStatus(
        `Loaded ${sourceName} with ${importedWorkouts.length} workouts.${
          importedPlan.aiAnalysis ? " AI notes will be saved with the plan." : ""
        }${
          imported.unmatchedExercises?.length
            ? ` Review unmatched exercises: ${imported.unmatchedExercises
                .slice(0, 5)
                .join(", ")}${imported.unmatchedExercises.length > 5 ? "..." : ""}.`
            : ""
        }`
      );
    } catch (error) {
      setAiPlanStatus(error.message);
    }
  }, [onBuildAiPlanDraft]);

  useEffect(() => {
    if (
      aiPlanDraftRestoredRef.current ||
      editingPlan ||
      !isAiPlanType ||
      editPreviewWorkouts ||
      !aiPlanDraftText.trim()
    ) {
      return;
    }

    aiPlanDraftRestoredRef.current = true;
    applyAiPlanDraftText(aiPlanDraftText, "saved AI plan draft");
  }, [
    aiPlanDraftText,
    applyAiPlanDraftText,
    editPreviewWorkouts,
    editingPlan,
    isAiPlanType,
  ]);

  function loadAiPlanDraftFile(file) {
    if (!file) {
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      applyAiPlanDraftText(String(reader.result || ""), file.name);
    };
    reader.onerror = () => {
      setAiPlanStatus(`Could not read ${file.name}.`);
    };
    reader.readAsText(file);
  }

  function handleAiPlanDraftFileChange(event) {
    loadAiPlanDraftFile(event.target.files?.[0]);
    event.target.value = "";
  }

  function handleAiPlanDraftDrop(event) {
    event.preventDefault();
    loadAiPlanDraftFile(event.dataTransfer.files?.[0]);
  }

  function preservePlanDraftEditMode() {
    if (generationMode === "plan" && isPlanEditMode) {
      enterPlanDraftEditMode();
      return true;
    }

    return false;
  }

  function cancelCreateDraftEditMode() {
    if (!createPreviewEditSnapshot) {
      regeneratePlanPreview();
      setWorkoutNameBySlot({});
      setSaveStatus("Plan edits canceled.");
      return;
    }

    setActiveWorkoutIndex(createPreviewEditSnapshot.activeWorkoutIndex || 0);
    setCreatePreviewEditMode(false);
    setCreatePreviewEditSnapshot(null);
    setDayOrder(
      createPreviewEditSnapshot.dayOrder
        ? [...createPreviewEditSnapshot.dayOrder]
        : null
    );
    setEditPreviewWorkouts(
      createPreviewEditSnapshot.editPreviewWorkouts
        ? clonePlanEditWorkouts(createPreviewEditSnapshot.editPreviewWorkouts)
        : null
    );
    setExerciseLayoutByWorkout(
      createPreviewEditSnapshot.exerciseLayoutByWorkout
        ? Object.fromEntries(
            Object.entries(createPreviewEditSnapshot.exerciseLayoutByWorkout).map(
              ([key, value]) => [key, [...value]]
            )
          )
        : null
    );
    setReplacementBySlot({ ...createPreviewEditSnapshot.replacementBySlot });
    setSupersetGroupBySlot({ ...createPreviewEditSnapshot.supersetGroupBySlot });
    setWeeklyPrescriptionBySlot(
      Object.fromEntries(
        Object.entries(createPreviewEditSnapshot.weeklyPrescriptionBySlot).map(
          ([key, weeks]) => [key, weeks.map((week) => ({ ...week }))]
        )
      )
    );
    setWorkoutNameBySlot({ ...createPreviewEditSnapshot.workoutNameBySlot });
    setWorkoutTypeByDay({ ...createPreviewEditSnapshot.workoutTypeByDay });
    setWorkoutTypePickerTarget(null);
    setConfirmDeleteDay(null);
    setWeeklyPrescriptionTarget(null);
    setWeeklyPrescriptionPicker(null);
    setSaveStatus("Plan edits canceled.");
  }

  async function saveGeneratedPlan({ saveAs = false } = {}) {
    const isWorkoutMode = generationMode === "workout";

    if (!isWorkoutMode && orderedPreviewWorkouts.length === 0) {
      setSaveStatus(
        isAiPlanType
          ? "Load an AI plan draft before saving."
          : "Add at least one workout before saving."
      );
      return;
    }

    const isEditingExistingPlan = Boolean(editingPlan && !isWorkoutMode && !saveAs);
    const savedAt = Date.now();
    const planId = isEditingExistingPlan ? editingPlan.id : savedAt;
    const existingPlanWorkouts = editingPlan?.workouts || [];
    const workouts = orderedPreviewWorkouts.map((workout, workoutIndex) => {
      const savedWorkout = { ...workout };
      const existingPlanWorkout = isEditingExistingPlan
        ? existingPlanWorkouts.find(
            (item) =>
              workout.planWorkoutId &&
              String(item.planWorkoutId) === String(workout.planWorkoutId)
          ) ||
          existingPlanWorkouts.find(
            (item) => workout.id && String(item.templateId) === String(workout.id)
          ) ||
          existingPlanWorkouts[workoutIndex]
        : null;
      const existingTemplate = existingPlanWorkout
        ? templates.find(
            (template) =>
              String(template.id) === String(existingPlanWorkout.templateId)
          )
        : null;

      delete savedWorkout.previewWorkoutKey;

      const templateId = isEditingExistingPlan
        ? existingPlanWorkout?.templateId || savedAt + workoutIndex + 1
        : savedAt + workoutIndex + 1;
      const planWorkoutId = isEditingExistingPlan
        ? workout.planWorkoutId ||
          existingPlanWorkout?.planWorkoutId ||
          `${planId}:workout-${workoutIndex + 1}`
        : `${planId}:workout-${workoutIndex + 1}`;

      return {
        ...savedWorkout,
        id: templateId,
        name: workout.name,
        dayNumber: workoutIndex + 1,
        planId: isWorkoutMode ? null : planId,
        planWorkoutId: isWorkoutMode ? null : planWorkoutId,
        exercises: workout.exercises.map((exercise, exerciseIndex) => {
          const savedExercise = { ...exercise };
          const existingExercise = existingTemplate?.exercises?.[exerciseIndex];

          delete savedExercise.previewSlotKey;
          delete savedExercise.previewWorkoutKey;

          return {
            ...savedExercise,
            id: isEditingExistingPlan
              ? existingExercise?.id || savedAt + workoutIndex * 100 + exerciseIndex
              : savedAt + workoutIndex * 100 + exerciseIndex,
            sets: exercise.sets.map((set, setIndex) => ({
              ...set,
              id: isEditingExistingPlan
                ? existingExercise?.sets?.[setIndex]?.id ||
                  savedAt + workoutIndex * 1000 + exerciseIndex * 100 + setIndex
                : savedAt + workoutIndex * 1000 + exerciseIndex * 100 + setIndex,
            })),
          };
        }),
      };
    });

    if (!isTrainerTargetSelf && !selectedTrainerUserId) {
      setSaveStatus("Choose a user before saving.");
      return;
    }

    if (!isTrainerTargetSelf && (!isSupabaseConfigured || !supabase)) {
      setSaveStatus("Sign in and configure Supabase before saving for another user.");
      return;
    }

    if (isWorkoutMode) {
      if (!isTrainerTargetSelf) {
        setSaveStatus("Saving workout for selected user...");

        assertRemoteWriteAllowed("trainer workout create");

        const { error } = await supabase.rpc("create_trainer_workout_for_user", {
          target_user_id: selectedTrainerUserId,
          workout_payload: buildTrainerWorkoutPayload(workouts[0]),
        });

        if (error) {
          setSaveStatus(`Unable to save workout: ${error.message}`);
          return;
        }

        setSaveStatus("Saved workout for selected user.");
        onSave?.({
          targetUserId: selectedTrainerUserId,
          type: "trainer-workout",
        });
        return;
      }

      setTemplates([...templates, ...workouts]);
      setSaveStatus("Saved workout.");
      onSave?.({
        type: "workout",
      });
      return;
    }

    const plan = {
      ...(editingPlan || {}),
      id: planId,
      aiAnalysis: aiPlanAnalysis,
      name:
        saveAs && editingPlan && planName.trim() === editingPlan.name
          ? `${editingPlan.name} Copy`
          : planName.trim() ||
        getDefaultPlanName(planType, daysPerWeek, durationWeeks),
      planType,
      goal,
      daysPerWeek: Number(daysPerWeek),
      durationWeeks: Number(durationWeeks),
      currentWeek: isEditingExistingPlan ? editingPlan?.currentWeek || 1 : 1,
      status: isEditingExistingPlan ? editingPlan?.status || "inactive" : "inactive",
      createdAt:
        isEditingExistingPlan && editingPlan?.createdAt
          ? editingPlan.createdAt
          : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completions: isEditingExistingPlan ? editingPlan?.completions || [] : [],
      config: {
        deload,
        reps,
        rir,
        rirPeriodization,
        sets: showPlanSetPicker ? sets : undefined,
        ...(isAiPlanType && aiPlanDeloadWeeks != null
          ? { deloadWeeks: aiPlanDeloadWeeks }
          : {}),
        workoutTypeByDay:
          planType === "type-4"
            ? orderedPreviewWorkouts.reduce((types, workout, workoutIndex) => {
                types[workoutIndex] = workout.workoutType || "full-body";
                return types;
              }, {})
            : {},
      },
      workouts: workouts.map((workout) => ({
        dayNumber: workout.dayNumber,
        name: workout.name,
        planWorkoutId: workout.planWorkoutId,
        templateId: workout.id,
        workoutType: workout.workoutType || null,
        workoutTypeLabel: workout.workoutTypeLabel || null,
      })),
    };

    if (!isTrainerTargetSelf) {
      setSaveStatus("Saving plan for selected user...");

      assertRemoteWriteAllowed("trainer plan create");

      const trainerWorkoutsPayload = workouts.map(buildTrainerWorkoutPayload);

      const { error } = await supabase.rpc("create_trainer_plan_for_user", {
        target_user_id: selectedTrainerUserId,
        plan_payload: plan,
        workouts_payload: trainerWorkoutsPayload,
      });

      if (error) {
        setSaveStatus(`Unable to save plan: ${error.message}`);
        return;
      }

      setSaveStatus(`Saved plan for ${selectedTrainerUser.display_name}.`);
      onSave?.({
        targetUserId: selectedTrainerUserId,
        type: "trainer-plan",
      });
      return;
    }

    if (isEditingExistingPlan) {
      const previousWorkouts = existingPlanWorkouts.map((workout) =>
        templates.find((template) => String(template.id) === String(workout.templateId))
      );

      if (!hasPlanUpdateChanges(editingPlan, plan, previousWorkouts, workouts)) {
        setSaveStatus("No plan changes to update.");
        return;
      }

      const replacedTemplateIds = new Set(
        existingPlanWorkouts
          .map((workout) => workout.templateId)
          .filter((templateId) => templateId != null)
          .map((templateId) => String(templateId))
      );

      setPlans(
        plans.map((item) => (String(item.id) === String(plan.id) ? plan : item))
      );
      setTemplates([
        ...templates.filter(
          (template) => !replacedTemplateIds.has(String(template.id))
        ),
        ...workouts,
      ]);
      setSaveStatus(`Updated ${plan.name}.`);
      onSave?.({
        planId: plan.id,
        type: "plan-update",
      });
      return;
    }

    setPlans([...plans, plan]);
    setTemplates([...templates, ...workouts]);
    setSaveStatus(`Saved plan with ${workouts.length} workouts.`);
    onSave?.({
      type: "plan",
    });
  }

  return (
    <div
      style={{
        padding: "20px",
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: "10px",
          marginBottom: "16px",
        }}
      >
        <ClipboardList size={26} />
        <h1
          style={{
            fontSize: "1.6rem",
            margin: 0,
          }}
        >
          Plans
        </h1>
      </div>

      {!isPlanEditMode && trainerUsers.length > 1 && (
        <label
          style={{
            display: "grid",
            gap: "4px",
            marginBottom: "12px",
          }}
        >
          User name
          <select
            value={selectedTrainerUserId}
            onChange={(event) => {
              setSelectedTrainerUserId(event.target.value);
              regeneratePlanPreview();
              setWorkoutNameBySlot({});
              setWorkoutTypeByDay({});
              setSaveStatus("");
            }}
            style={{
              boxSizing: "border-box",
              font: "inherit",
              minHeight: "40px",
              padding: "6px 10px",
              width: "100%",
            }}
          >
            {trainerUsers.map((user) => (
              <option key={user.user_id} value={user.user_id}>
                {user.display_name}
                {user.is_self ? " (you)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      {trainerStatus && (
        <div
          role="status"
          style={{
            background: "var(--warning-bg)",
            border: "1px solid #e6c86e",
            borderRadius: "6px",
            color: "var(--warning-text)",
            fontSize: "13px",
            marginBottom: "12px",
            padding: "8px",
          }}
        >
          {trainerStatus}
        </div>
      )}

      <div
        ref={planStickyHeaderRef}
        style={{
          background: "color-mix(in srgb, var(--surface) 96%, transparent)",
          borderBottom: "1px solid var(--border)",
          display: "grid",
          gap: "8px",
          margin: "0 -20px 12px",
          padding: "8px 20px 10px",
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <div
          style={{
            display: "grid",
            gap: "4px",
            textAlign: "left",
          }}
        >
          <span
            style={{
              alignItems: "center",
              display: "grid",
              gap: "8px",
              gridTemplateColumns: "minmax(0, 1fr) auto",
            }}
          >
            <span>
              {generationMode === "workout" ? "Workout name" : "Plan name"}
            </span>
            {generationMode === "plan" && (
              <button
                aria-label={`${planName || "Plan"} summary`}
                disabled={orderedPreviewWorkouts.length === 0}
                onClick={(event) => {
                  event.preventDefault();
                  setPlanSummaryOpen(true);
                }}
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  justifyContent: "center",
                  minHeight: "34px",
                  minWidth: "38px",
                  padding: "4px 8px",
                }}
                type="button"
              >
                <BarChart3 size={18} />
              </button>
            )}
          </span>
          <input
            aria-label={
              generationMode === "workout" ? "Workout name" : "Plan name"
            }
            value={generationMode === "workout" ? workoutName : planName}
            onChange={(event) => {
              if (generationMode === "workout") {
                setWorkoutName(event.target.value);
                setWorkoutNameBySlot({
                  ...workoutNameBySlot,
                  0: event.target.value,
                });
                return;
              }

              setIsPlanNameCustom(true);
              setPlanName(event.target.value);
            }}
            style={{
              boxSizing: "border-box",
              font: "inherit",
              minHeight: "40px",
              padding: "6px 10px",
              width: "100%",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "8px",
          }}
        >
          {editingPlan ? (
            <>
              {editingPlan.aiAnalysis && (
                <button
                  onClick={() => onShowAiPlanNotes?.(editingPlan)}
                  style={{
                    alignItems: "center",
                    display: "inline-flex",
                    gap: "6px",
                    minHeight: "40px",
                    padding: "6px 10px",
                  }}
                  type="button"
                >
                  <Brain size={16} />
                  AI Notes
                </button>
              )}

              <button
                disabled={!canSaveGeneratedPlan}
                onClick={() => saveGeneratedPlan()}
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  gap: "6px",
                  minHeight: "40px",
                  padding: "6px 10px",
                }}
              >
                <Save size={16} />
                Update Plan
              </button>

              <button
                disabled={!canSaveGeneratedPlan}
                onClick={() => saveGeneratedPlan({ saveAs: true })}
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  gap: "6px",
                  minHeight: "40px",
                  padding: "6px 10px",
                }}
              >
                <Copy size={16} />
                Save As
              </button>

              <button
                onClick={onCancel}
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  gap: "6px",
                  minHeight: "40px",
                  padding: "6px 10px",
                }}
              >
                <X size={16} />
                Cancel
              </button>
            </>
          ) : isCreateDraftEditMode ? (
            <>
              {aiPlanAnalysis && (
                <button
                  onClick={() =>
                    onShowAiPlanNotes?.({
                      aiAnalysis: aiPlanAnalysis,
                      name: planName || "AI Plan Draft",
                    })
                  }
                  style={{
                    alignItems: "center",
                    display: "inline-flex",
                    gap: "6px",
                    minHeight: "40px",
                    padding: "6px 10px",
                  }}
                  type="button"
                >
                  <Brain size={16} />
                  AI Notes
                </button>
              )}

              <button
                disabled={!canSaveGeneratedPlan}
                onClick={() => saveGeneratedPlan()}
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  gap: "6px",
                  minHeight: "40px",
                  padding: "6px 10px",
                }}
              >
                <Save size={16} />
                Save Plan
              </button>

              <button
                onClick={cancelCreateDraftEditMode}
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  gap: "6px",
                  minHeight: "40px",
                  padding: "6px 10px",
                }}
              >
                <X size={16} />
                Cancel
              </button>
            </>
          ) : (
            <>
              {!isAiPlanType && (
                <button
                  onClick={() => {
                    setSeed((value) => value + 1);
                    regeneratePlanPreview();
                    setSaveStatus("");
                  }}
                  style={{
                    alignItems: "center",
                    display: "inline-flex",
                    gap: "6px",
                    minHeight: "40px",
                    padding: "6px 10px",
                  }}
                >
                  <RefreshCw size={16} />
                  Regenerate
                </button>
              )}

              <button
                disabled={!canSaveGeneratedPlan}
                onClick={() => saveGeneratedPlan()}
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  gap: "6px",
                  minHeight: "40px",
                  padding: "6px 10px",
                }}
              >
                <Save size={16} />
                {generationMode === "workout" ? "Save Workout" : "Save Plan"}
              </button>
            </>
          )}
        </div>

        {saveStatus && (
          <div
            role="status"
            style={{
              color: "#1769aa",
              fontSize: "13px",
              fontWeight: "bold",
            }}
          >
            {saveStatus}
          </div>
        )}
      </div>

      <section
        style={{
          display: "grid",
          gap: "10px",
          marginBottom: "16px",
        }}
      >
        {!isPlanEditMode && (
          <label
            style={{
              display: "grid",
              gap: "4px",
              textAlign: "left",
            }}
          >
            Create
              <select
                value={generationMode}
                onChange={(event) => {
                const nextMode = event.target.value;

                setGenerationMode(nextMode);
                regeneratePlanPreview();
                setWorkoutNameBySlot({});
                setWorkoutTypeByDay({});
                setSaveStatus("");
              }}
              style={{
                boxSizing: "border-box",
                font: "inherit",
                minHeight: "40px",
                padding: "6px 10px",
                width: "100%",
              }}
            >
              <option value="plan">Plan</option>
              <option value="workout">Workout</option>
            </select>
          </label>
        )}

        {generationMode === "plan" && !isPlanEditMode && (
          <label
            style={{
              display: "grid",
              gap: "4px",
              textAlign: "left",
            }}
          >
            Plan type
            <select
              value={planType}
              onChange={(event) => {
                const nextPlanType = event.target.value;
                const nextDefaults = getPlanTypeDefaults(nextPlanType);

                setPlanType(nextPlanType);
                setGoal(nextDefaults.goal);
                setDaysPerWeek(nextDefaults.daysPerWeek);
                setDurationWeeks(nextDefaults.durationWeeks);
                setDeload(Boolean(nextDefaults.deload));
                setRirPeriodization(
                  nextDefaults.rirPeriodization ||
                    getDefaultRirPeriodizationMode(nextPlanType)
                );
                setReps(nextDefaults.reps);
                setRir(nextDefaults.rir);
                setSets(nextDefaults.sets || "3");
                setAiPlanStatus("");
                setAiPlanDraftText("");
                setAiPlanAnalysis(null);
                setAiPlanDeloadWeeks(null);
                if (!isPlanNameCustom) {
                  setPlanName(
                    getDefaultPlanName(
                      nextPlanType,
                      nextDefaults.daysPerWeek,
                      nextDefaults.durationWeeks
                    )
                  );
                }
                regeneratePlanPreview();
                setWorkoutNameBySlot({});
                setWorkoutTypeByDay({});
                setSaveStatus("");
              }}
              style={{
                boxSizing: "border-box",
                font: "inherit",
                minHeight: "40px",
                padding: "6px 10px",
                width: "100%",
              }}
            >
              <option value="type-1">{getPlanTypeLabel("type-1")}</option>
              <option value="type-2">{getPlanTypeLabel("type-2")}</option>
              <option value="type-3">{getPlanTypeLabel("type-3")}</option>
              <option value="type-4">{getPlanTypeLabel("type-4")}</option>
              <option value="type-5">{getPlanTypeLabel("type-5")}</option>
              <option value="ai">{getPlanTypeLabel("ai")}</option>
            </select>
          </label>
        )}

        {generationMode === "workout" && (
          <label
            style={{
              display: "grid",
              gap: "4px",
            }}
          >
            Workout type
            <select
              value={workoutType}
              onChange={(event) => {
                const nextWorkoutType = event.target.value;

                setWorkoutType(nextWorkoutType);
                setWorkoutName(getDefaultWorkoutName(nextWorkoutType));
                regeneratePlanPreview();
                setWorkoutNameBySlot({});
                setWorkoutTypeByDay({});
                setSaveStatus("");
              }}
              style={{
                boxSizing: "border-box",
                font: "inherit",
                minHeight: "40px",
                padding: "6px 10px",
                width: "100%",
              }}
            >
              <option value="type-1">Type 1</option>
              <option value="type-2">Type 2</option>
              <option value="push">Push</option>
              <option value="pull">Pull</option>
              <option value="upper">Upper</option>
              <option value="lower">Lower</option>
              <option value="full-body">Full Body</option>
            </select>
          </label>
        )}

        {!isAiPlanType && (
          <label
            style={{
              display: "grid",
              gap: "4px",
              textAlign: "left",
            }}
          >
            Goal
            <select
              value={goal}
              onChange={(event) => {
                setGoal(event.target.value);
                regeneratePlanPreview();
                setSaveStatus("");
              }}
              style={{
                boxSizing: "border-box",
                font: "inherit",
                minHeight: "40px",
                padding: "6px 10px",
                width: "100%",
              }}
            >
              <option value="maintain">{getGoalLabel("maintain")}</option>
              <option value="progress">{getGoalLabel("progress")}</option>
            </select>
          </label>
        )}

        {generationMode === "plan" && !isAiPlanType && (
          <>
            {!isPlanEditMode && (
              <PlanPickerButton
                label="Days per week"
                value={`${daysPerWeek} ${daysPerWeek === "1" ? "day" : "days"}`}
                onClick={() => setActiveValuePicker("days")}
              />
            )}

            <div
              style={{
                alignItems: "end",
                display: "grid",
                gap: "8px",
                gridTemplateColumns: "1fr auto",
              }}
            >
              <PlanPickerButton
                label="Duration in weeks"
                value={durationWeeks}
                onClick={() => setActiveValuePicker("duration")}
              />

              <label
                style={{
                  display: "grid",
                  gap: "4px",
                  justifyItems: "end",
                }}
              >
                <span style={{ textAlign: "right" }}>Deload</span>
                <ToggleSwitch
                  checked={deload}
                  label="Deload"
                  onChange={(checked) => {
                    setDeload(checked);
                    setSaveStatus("");
                  }}
                />
              </label>
            </div>
          </>
        )}

        {isAiPlanType && (
          <div
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleAiPlanDraftDrop}
            style={{
              border: "1px dashed var(--border)",
              borderRadius: "8px",
              display: "grid",
              gap: "8px",
              padding: "10px",
            }}
          >
            <div
              style={{
                alignItems: "center",
                display: "flex",
                gap: "6px",
                justifyContent: "center",
              }}
            >
              <Brain size={16} />
              <strong>AI Plan Draft</strong>
            </div>
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "12px",
                textAlign: "left",
              }}
            >
              Download the context, attach it in ChatGPT, then load the returned
              workout-app AI plan JSON here. No plan days are generated until a
              draft file is loaded.
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "8px",
                justifyContent: "center",
              }}
            >
              <button onClick={onDownloadAiPlanContext} type="button">
                Context
              </button>
              <button onClick={onCopyAiPlanPrompt} type="button">
                <Copy size={14} />
                Prompt
              </button>
              <button onClick={onOpenChatGptForAiPlan} type="button">
                Open ChatGPT
              </button>
            </div>
            <textarea
              aria-label="AI plan draft JSON"
              onChange={(event) => {
                setAiPlanDraftText(event.target.value);
                setAiPlanStatus("");
              }}
              placeholder="Paste or drop ChatGPT's workout-app.ai-plan-draft.v1 JSON here"
              value={aiPlanDraftText}
              style={{
                background: "var(--surface-muted)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                boxSizing: "border-box",
                color: "var(--text)",
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                fontSize: "11px",
                lineHeight: 1.45,
                minHeight: "130px",
                padding: "8px",
                resize: "vertical",
                width: "100%",
              }}
            />
            <div
              style={{
                display: "grid",
                gap: "8px",
                gridTemplateColumns: "1fr 1fr",
              }}
            >
              <label
                style={{
                  alignItems: "center",
                  background: "var(--button-bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  color: "var(--button-text)",
                  cursor: "pointer",
                  display: "inline-flex",
                  fontSize: "13px",
                  gap: "6px",
                  justifyContent: "center",
                  padding: "8px",
                }}
              >
                Load File
                <input
                  accept="application/json,.json,.txt"
                  onChange={handleAiPlanDraftFileChange}
                  style={{ display: "none" }}
                  type="file"
                />
              </label>
              <button
                disabled={!aiPlanDraftText.trim()}
                onClick={() => applyAiPlanDraftText(aiPlanDraftText, "pasted draft")}
                type="button"
              >
                Load Draft
              </button>
            </div>
            {aiPlanStatus && (
              <div
                role="status"
                aria-live="polite"
                style={{
                  color: "var(--text-muted)",
                  fontSize: "12px",
                }}
              >
                {aiPlanStatus}
              </div>
            )}
          </div>
        )}

        {showPlanSetPicker && (
          <PlanPickerButton
            label="Sets"
            value={sets}
            onClick={() => setActiveValuePicker("sets")}
          />
        )}

        {!isAiPlanType && (
          <PlanPickerButton
            label="Reps"
            value={reps}
            onClick={() => setActiveValuePicker("reps")}
          />
        )}

        {!isAiPlanType && (
          <div
            style={{
              alignItems: "end",
              display: "grid",
              gap: "8px",
              gridTemplateColumns:
                generationMode === "plan" ? "1fr auto" : "1fr",
            }}
          >
            <PlanPickerButton
              label="RIR"
              value={rir}
              onClick={() => setActiveValuePicker("rir")}
            />

            {generationMode === "plan" && (
              <label
                style={{
                  display: "grid",
                  gap: "4px",
                  justifyItems: "end",
                }}
              >
                <span style={{ textAlign: "right" }}>Periodization</span>
                <RirPeriodizationButton
                  mode={rirPeriodization}
                  onChange={(nextMode) => {
                    preservePlanDraftEditMode();
                    setRirPeriodization(nextMode);
                    setSaveStatus("");
                  }}
                />
              </label>
            )}
          </div>
        )}

        {generatedPlan.gaps.length > 0 && (
          <div
            style={{
              background: "var(--warning-bg)",
              border: "1px solid #e6c86e",
              borderRadius: "6px",
              color: "var(--warning-text)",
              fontSize: "13px",
              padding: "8px",
            }}
          >
            Missing exercise metadata for: {generatedPlan.gaps.join(", ")}.
          </div>
        )}
      </section>

      <DndContext
        collisionDetection={dayPointerThenClosestCenter}
        sensors={sensors}
        onDragEnd={({ active, over }) => {
          if (!over || active.id === over.id) {
            return;
          }

          const activeValue = String(active.id);
          const overValue = String(over.id);

          if (activeValue.startsWith("plan-day:")) {
            const activeWorkoutKey = Number(
              activeValue.replace("plan-day:", "")
            );
            const overWorkoutKey = Number(
              overValue
                .replace("plan-day:", "")
                .replace("day:", "")
            );
            const oldIndex = orderedWorkoutKeys.indexOf(activeWorkoutKey);
            const newIndex = orderedWorkoutKeys.indexOf(overWorkoutKey);

            if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
              enterPlanDraftEditMode();
              setDayOrder(arrayMove(orderedWorkoutKeys, oldIndex, newIndex));
              setSaveStatus("");
            }

            return;
          }

          enterPlanDraftEditMode();
          setExerciseLayoutByWorkout((currentLayout) =>
            moveSlotInLayout(
              currentLayout || normalizedExerciseLayout,
              String(active.id),
              over.id
            )
          );
          setSupersetGroupBySlot((currentGroups) => ({
            ...currentGroups,
            [String(active.id)]: getDropSupersetGroup(over.id, previewWorkouts),
          }));
          setSaveStatus("");
        }}
      >
        <div
          aria-label={generationMode === "workout" ? "Workout" : "Plan days"}
          ref={planDayStripRef}
          style={{
            display: "flex",
            gap: "6px",
            marginBottom: "12px",
            overflowX: "auto",
            paddingBottom: "2px",
          }}
        >
          <SortableContext
            items={orderedWorkoutKeys.map(
              (workoutKey) => `plan-day:${workoutKey}`
            )}
            strategy={horizontalListSortingStrategy}
          >
            {orderedPreviewWorkouts.map((workout, dayIndex) => (
              <PlanDayButton
                key={workout.previewWorkoutKey}
                active={workout.previewWorkoutKey === displayedWorkoutKey}
                count={workout.exercises.length}
                label={
                  generationMode === "workout"
                    ? "Workout"
                    : `Day ${dayIndex + 1}`
                }
                onLongPress={
                  canEditPlanDays
                    ? () => {
                        setActiveWorkoutIndex(workout.previewWorkoutKey);
                        setWorkoutTypePickerTarget({
                          dayIndex,
                          workoutKey: workout.previewWorkoutKey,
                        });
                      }
                    : null
                }
                sortable={!canEditPlanDays}
                sublabel={
                  canEditPlanDays
                    ? workout.workoutTypeLabel ||
                      getWorkoutTypeLabel(workout.workoutType || "full-body")
                    : null
                }
                workoutKey={workout.previewWorkoutKey}
                onClick={() => {
                  setActiveWorkoutIndex(workout.previewWorkoutKey);
                  setSaveStatus("");
                }}
              />
            ))}
          </SortableContext>
          {canAddPlanDay && (
            <button
              aria-label="Add plan day"
              onClick={() =>
                setWorkoutTypePickerTarget({
                  dayIndex: orderedPreviewWorkouts.length,
                  isNewDay: true,
                  workoutKey: orderedPreviewWorkouts.length,
                })
              }
              style={{
                alignItems: "center",
                display: "inline-flex",
                flex: "0 0 42px",
                fontSize: "22px",
                justifyContent: "center",
                minHeight: "38px",
                padding: "6px 8px",
              }}
              type="button"
            >
              +
            </button>
          )}
        </div>

        <SortableContext
          items={allPreviewSlotKeys}
          strategy={verticalListSortingStrategy}
        >
          {displayedWorkout && (
            <PlanWorkoutPreview
              key={displayedWorkout.previewWorkoutKey}
              enableWeeklyPrescriptions={generationMode === "plan"}
              exerciseLibrary={exerciseLibrary}
              workout={displayedWorkout}
              onAddExercise={(workout) => {
                setAddExerciseTarget(workout);
                setPickerSearch("");
                setPickerMuscle("");
              }}
              onDeleteExercise={(workout, exercise) => {
                void triggerNativeWarningHaptic();
                setConfirmDeleteExercise({
                  exercise,
                  workout,
                });
              }}
              onEditSuperset={(exercise) => {
                const group = prompt(
                  "Superset group (A, B, etc). Leave empty to clear.",
                  exercise.supersetGroup || ""
                );

                if (group === null) {
                  return;
                }

                enterPlanDraftEditMode();
                setSupersetGroupBySlot((currentGroups) => ({
                  ...currentGroups,
                  [exercise.previewSlotKey]: group.trim() || null,
                }));
                setSaveStatus("");
              }}
              onRenameWorkout={(renamedWorkout, name) => {
                enterPlanDraftEditMode();
                setWorkoutNameBySlot({
                  ...workoutNameBySlot,
                  [renamedWorkout.previewWorkoutKey]: name,
                });
                if (generationMode === "workout") {
                  setWorkoutName(name);
                }
                setSaveStatus("");
              }}
              onEditWeeklyPrescription={(exercise) => {
                setWeeklyPrescriptionTarget({
                  previewSlotKey: exercise.previewSlotKey,
                });
              }}
              onShowSummary={setSummaryWorkout}
              onShowExerciseDetail={setDetailExercise}
              onReplaceExercise={(exercise) => {
                setPickerTarget(exercise);
                setPickerMuscle(getEffectivePrimaryMuscle(exercise));
                setPickerSearch("");
              }}
            />
          )}
        </SortableContext>
      </DndContext>

      {isAiPlanType && orderedPreviewWorkouts.length === 0 && (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "8px",
            color: "var(--text-muted)",
            fontSize: "13px",
            padding: "14px",
            textAlign: "center",
          }}
        >
          Load an AI plan draft JSON file to populate the plan days.
        </div>
      )}

      {workoutTypePickerTarget && (
        <WorkoutTypePickerSheet
          canMoveLeft={
            !workoutTypePickerTarget.isNewDay &&
            orderedWorkoutKeys.indexOf(workoutTypePickerTarget.workoutKey) > 0
          }
          canMoveRight={
            !workoutTypePickerTarget.isNewDay &&
            orderedWorkoutKeys.indexOf(workoutTypePickerTarget.workoutKey) !== -1 &&
            orderedWorkoutKeys.indexOf(workoutTypePickerTarget.workoutKey) <
              orderedWorkoutKeys.length - 1
          }
          currentWorkoutType={
            workoutTypePickerTarget.isNewDay
              ? "full-body"
              : orderedPreviewWorkouts.find(
                  (workout) =>
                    workout.previewWorkoutKey === workoutTypePickerTarget.workoutKey
                )?.workoutType || "full-body"
          }
          dayLabel={`Day ${workoutTypePickerTarget.dayIndex + 1}`}
          onClose={() => setWorkoutTypePickerTarget(null)}
          onDelete={() => requestDeletePlanDay(workoutTypePickerTarget)}
          onMoveLeft={() => movePlanDay(workoutTypePickerTarget, -1)}
          onMoveRight={() => movePlanDay(workoutTypePickerTarget, 1)}
          onSelect={(nextWorkoutType) => {
            if (workoutTypePickerTarget.isNewDay) {
              addPlanDay(nextWorkoutType);
              return;
            }

            changePlanDayWorkoutType(
              workoutTypePickerTarget.workoutKey,
              nextWorkoutType
            );
          }}
          showDelete={!workoutTypePickerTarget.isNewDay}
          showMove={!workoutTypePickerTarget.isNewDay}
        />
      )}

      {confirmDeleteDay && (
        <div
          role="presentation"
          style={{
            alignItems: "center",
            background: "rgba(0,0,0,.52)",
            display: "flex",
            inset: 0,
            justifyContent: "center",
            padding: "18px",
            position: "fixed",
            zIndex: 2400,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Delete Day ${confirmDeleteDay.dayIndex + 1}`}
            style={{
              background: "var(--surface-raised)",
              border: "1px solid var(--danger-border)",
              borderRadius: "10px",
              boxShadow: "0 18px 42px rgba(0,0,0,.32)",
              display: "grid",
              gap: "12px",
              maxWidth: "360px",
              padding: "16px",
              width: "100%",
            }}
          >
            <h3
              style={{
                color: "var(--danger-text)",
                margin: 0,
              }}
            >
              Delete Day {confirmDeleteDay.dayIndex + 1}?
            </h3>
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "13px",
                margin: 0,
              }}
            >
              This removes the day and all exercises in it from the plan.
            </p>
            <div
              style={{
                display: "grid",
                gap: "8px",
                gridTemplateColumns: "1fr 1fr",
              }}
            >
              <button onClick={() => setConfirmDeleteDay(null)} type="button">
                Cancel
              </button>
              <button
                onClick={() => deletePlanDay(confirmDeleteDay)}
                style={{
                  background: "var(--danger-bg)",
                  border: "1px solid var(--danger-border)",
                  color: "var(--danger-text)",
                }}
                type="button"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteExercise && (
        <div
          role="presentation"
          style={{
            alignItems: "center",
            background: "rgba(0,0,0,.52)",
            display: "flex",
            inset: 0,
            justifyContent: "center",
            padding: "18px",
            position: "fixed",
            zIndex: 2400,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Delete ${confirmDeleteExercise.exercise.name}`}
            style={{
              background: "var(--surface-raised)",
              border: "1px solid var(--danger-border)",
              borderRadius: "10px",
              boxShadow: "0 18px 42px rgba(0,0,0,.32)",
              display: "grid",
              gap: "12px",
              maxWidth: "360px",
              padding: "16px",
              width: "100%",
            }}
          >
            <h3
              style={{
                color: "var(--danger-text)",
                margin: 0,
              }}
            >
              Delete {confirmDeleteExercise.exercise.name}?
            </h3>
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: "13px",
                margin: 0,
              }}
            >
              This removes the exercise and all of its sets from this day.
            </p>
            <div
              style={{
                display: "grid",
                gap: "8px",
                gridTemplateColumns: "1fr 1fr",
              }}
            >
              <button
                onClick={() => setConfirmDeleteExercise(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={() => deletePlanExercise(confirmDeleteExercise)}
                style={{
                  background: "var(--danger-bg)",
                  border: "1px solid var(--danger-border)",
                  color: "var(--danger-text)",
                }}
                type="button"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {pickerTarget && (
        <ExercisePickerSheet
          bodyWeightEntries={bodyWeightEntries}
          title={`Replace ${getEffectivePrimaryMuscle(pickerTarget) || "exercise"}`}
          exerciseLibrary={generatorExerciseLibrary}
          history={history}
          search={pickerSearch}
          selectedMuscle={pickerMuscle}
          setSearch={setPickerSearch}
          setSelectedMuscle={setPickerMuscle}
          onClose={() => setPickerTarget(null)}
          onSelect={(exercise) => {
            enterPlanDraftEditMode();
            setReplacementBySlot({
              ...replacementBySlot,
              [pickerTarget.previewSlotKey]: exercise,
            });
            setPickerTarget(null);
            setSaveStatus("");
          }}
        />
      )}

      {addExerciseTarget && (
        <ExercisePickerSheet
          bodyWeightEntries={bodyWeightEntries}
          title="Add Exercise"
          exerciseLibrary={generatorExerciseLibrary}
          history={history}
          search={pickerSearch}
          selectedMuscle={pickerMuscle}
          setSearch={setPickerSearch}
          setSelectedMuscle={setPickerMuscle}
          onClose={() => setAddExerciseTarget(null)}
          onSelect={(exercise) =>
            addPlanExerciseToWorkout(addExerciseTarget, exercise)
          }
        />
      )}

      {detailExercise && (
        <ExerciseDetailDialog
          bodyWeightEntries={bodyWeightEntries}
          exercise={detailExercise}
          exerciseLibrary={generatorExerciseLibrary}
          history={history}
          onClose={() => setDetailExercise(null)}
        />
      )}

      {summaryWorkout && (
        <WorkoutSummarySheet
          selectedWorkout={summaryWorkout}
          workouts={orderedPreviewWorkouts}
          onClose={() => setSummaryWorkout(null)}
        />
      )}

      {planSummaryOpen && (
        <WorkoutSummarySheet
          initialScope="plan"
          lockScope
          planTitle={planName || "Plan"}
          selectedWorkout={displayedWorkout || orderedPreviewWorkouts[0]}
          workouts={orderedPreviewWorkouts}
          onClose={() => setPlanSummaryOpen(false)}
        />
      )}

      {weeklyPrescriptionTarget && weeklyPrescriptionExercise && (
        <WeeklyPrescriptionSheet
          exercise={weeklyPrescriptionExercise}
          weeklyPrescriptions={weeklyPrescriptionExercise.weeklyPrescriptions || []}
          onClose={() => {
            setWeeklyPrescriptionTarget(null);
            setWeeklyPrescriptionPicker(null);
          }}
          onEditValue={(weekNumber, field) => {
            const week = weeklyPrescriptionExercise.weeklyPrescriptions?.find(
              (item) => Number(item.weekNumber) === Number(weekNumber)
            );

            setWeeklyPrescriptionPicker({
              field,
              previewSlotKey: weeklyPrescriptionExercise.previewSlotKey,
              value: week?.[field] || "",
              weekNumber,
            });
            setWeeklyPrescriptionScope({
              allDays: false,
              allExercises: false,
              allWeeks: false,
            });
          }}
        />
      )}

      <WeeklyPrescriptionValuePicker
        key={`${weeklyPrescriptionPicker?.field || "closed"}-${weeklyPrescriptionPicker?.weekNumber || "none"}-${weeklyPrescriptionPicker?.value || ""}`}
        field={weeklyPrescriptionPicker?.field}
        onClose={() => setWeeklyPrescriptionPicker(null)}
        scope={weeklyPrescriptionScope}
        setScope={setWeeklyPrescriptionScope}
        value={weeklyPrescriptionPicker?.value}
        weekNumber={weeklyPrescriptionPicker?.weekNumber}
        onSelect={(value) => {
          if (!weeklyPrescriptionPicker) {
            return;
          }

          updateWeeklyPrescriptionValue(
            weeklyPrescriptionPicker.previewSlotKey,
            weeklyPrescriptionPicker.weekNumber,
            weeklyPrescriptionPicker.field,
            value,
            weeklyPrescriptionScope
          );
        }}
      />

      <WeightPickerModal
        isOpen={activeValuePicker === "days"}
        onClose={() => setActiveValuePicker(null)}
        value={daysPerWeek}
        title="Days per week"
        values={[1, 2, 3, 4, 5, 6]}
        onSelect={(value) => {
          const nextDaysPerWeek = String(value);

          setDaysPerWeek(nextDaysPerWeek);
          if (!isPlanNameCustom) {
            setPlanName(
              getDefaultPlanName(planType, nextDaysPerWeek, durationWeeks)
            );
          }
          if (!preservePlanDraftEditMode()) {
            regeneratePlanPreview();
          }
          setWorkoutNameBySlot({});
          setWorkoutTypeByDay({});
          setSaveStatus("");
        }}
      />

      <WeightPickerModal
        isOpen={activeValuePicker === "duration"}
        onClose={() => setActiveValuePicker(null)}
        value={durationWeeks}
        title="Duration in weeks"
        values={[3, 4, 5, 6]}
        onSelect={(value) => {
          const nextDurationWeeks = String(value);

          setDurationWeeks(nextDurationWeeks);
          if (!isPlanNameCustom) {
            setPlanName(
              getDefaultPlanName(planType, daysPerWeek, nextDurationWeeks)
            );
          }
          if (!preservePlanDraftEditMode()) {
            regeneratePlanPreview();
          }
          setWorkoutNameBySlot({});
          setSaveStatus("");
        }}
      />

      <WeightPickerModal
        isOpen={activeValuePicker === "sets"}
        onClose={() => setActiveValuePicker(null)}
        value={sets}
        increment={1}
        title="Select Sets"
        values={WEEKLY_SET_VALUES}
        onSelect={(value) => {
          setSets(String(value));
          if (!preservePlanDraftEditMode()) {
            regeneratePlanPreview();
          }
          setSaveStatus("");
        }}
      />

      <WeightPickerModal
        isOpen={activeValuePicker === "reps"}
        onClose={() => setActiveValuePicker(null)}
        value={reps}
        increment={1}
        title="Select Reps"
        values={Array.from({ length: 20 }, (_, index) => index + 1)}
        onSelect={(value) => {
          setReps(String(value));
          if (!preservePlanDraftEditMode()) {
            regeneratePlanPreview();
          }
          setSaveStatus("");
        }}
      />

      <WeightPickerModal
        isOpen={activeValuePicker === "rir"}
        onClose={() => setActiveValuePicker(null)}
        value={rir}
        title="Select RIR"
        values={[0, 1, 2, 3, 4, 5, 6]}
        onSelect={(value) => {
          setRir(String(value));
          if (!preservePlanDraftEditMode()) {
            regeneratePlanPreview();
          }
          setSaveStatus("");
        }}
      />
    </div>
  );
}
