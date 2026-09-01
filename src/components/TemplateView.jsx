import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Check,
  GripVertical,
  Link2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ExerciseSetupDialog from "./ExerciseSetupDialog";
import ExercisePickerSheet from "./ExercisePickerSheet";
import ExerciseDetailDialog from "./ExerciseDetailDialog";
import ExerciseLibraryEditDialog from "./ExerciseLibraryEditDialog";
import MuscleMap from "./MuscleMap";
import {
  AppPageHeader,
  AppSectionCard,
  AppSectionHeading,
  AppStatusPill,
} from "./ui/AppSurface";
import {
  WorkoutExercisePreviewGroup,
  WorkoutExercisePreviewRow,
} from "./WorkoutExercisePreviewList";
import WeightPickerModal from "./WeightPickerModal";
import { calculateE1RM, getLatestBodyWeightForDate } from "../utils/e1rm";
import { getGroupedPreviewExercises } from "../utils/previewExercises";
import { getRirForPlanWeek } from "../utils/rirPeriodization";
import {
  recommendSetTarget,
  recommendTargetPrescription,
  resolvePlanGoalMode,
} from "../utils/targetRecommendation";
import {
  getExerciseWeightIncrement,
  roundWeightToIncrement,
} from "../utils/weightIncrement";
import { findLatestExercisePerformance } from "../utils/workoutHistoryLookup";
import { REST_DURATION_PICKER_VALUES } from "../utils/restDurationPicker";
import { triggerNativeWarningHaptic } from "../native/pickerHaptics";

const MAIN_TARGET_PROGRESSION_PERCENT = 0.005;
const DELOAD_TARGET_REDUCTION_PERCENT = 0.005;

function IconButton({
  children,
  disabled = false,
  label,
  onClick,
  size = 36,
  style,
  tone = "neutral",
  type = "button",
}) {
  const toneColor =
    tone === "danger"
      ? "var(--danger-text)"
      : tone === "success"
        ? "var(--success-text)"
        : "var(--text)";

  return (
    <button
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type={type}
      style={{
        alignItems: "center",
        background: "var(--surface-raised)",
        border: "1px solid var(--border)",
        borderRadius: "999px",
        color: toneColor,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        flex: `0 0 ${size}px`,
        height: `${size}px`,
        justifyContent: "center",
        lineHeight: 1,
        opacity: disabled ? 0.45 : 1,
        padding: 0,
        width: `${size}px`,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function SortableExerciseRow({ exercise, children }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id: exercise.id,
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div className="template-view__exercise-card" ref={setNodeRef} style={style}>
      {children({
        attributes,
        listeners,
      })}
    </div>
  );
}

function getTemplateWorkoutSummary(template) {
  const exercises = template.exercises || [];
  const muscleSets = exercises.reduce((summary, exercise) => {
    const muscle = exercise.muscles?.[0] || exercise.planMuscle || "Unknown";

    summary[muscle] =
      (summary[muscle] || 0) +
      (exercise.sets || []).filter((set) => !set.isDropSet).length;

    return summary;
  }, {});
  const totalSets = Object.values(muscleSets).reduce(
    (total, sets) => total + sets,
    0
  );

  return {
    exerciseCount: exercises.length,
    muscleSets: Object.entries(muscleSets).sort((a, b) =>
      a[0].localeCompare(b[0])
    ),
    totalSets,
  };
}

function getEstimatedWorkoutMinutes(template) {
  const exercises = template.exercises || [];
  const totalSeconds = exercises.reduce((workoutSeconds, exercise) => {
    const sets = exercise.sets || [];
    const exerciseSeconds = sets.reduce((setSeconds, set, setIndex) => {
      const restSeconds = Number(
        set.prescribedRestSeconds ?? set.restSeconds ?? 90
      );
      const includesRest = setIndex < sets.length - 1 && !set.isDropSet;

      return setSeconds + 45 + (includesRest ? restSeconds : 0);
    }, 0);

    return workoutSeconds + exerciseSeconds + 45;
  }, 0);

  return Math.max(1, Math.round(totalSeconds / 60));
}

function TemplateMuscleMapSheet({ onClose, template }) {
  const summary = getTemplateWorkoutSummary(template);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${template.name} muscle map`}
      style={{
        background: "rgba(0,0,0,.38)",
        inset: 0,
        position: "fixed",
        zIndex: 1200,
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
              {template.name}
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

          <IconButton label="Close muscle map" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>

        <div
          style={{
            display: "grid",
            gap: "8px",
          }}
        >
          <MuscleMap
            label={`${template.name} primary muscles`}
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

export default function TemplateView({
  autoStart = false,
  template,
  templates,
  setTemplates,
  bodyWeightEntries = [],
  exerciseLibrary,
  setExerciseLibrary,
  session = null,
  canEditBuiltInExercises = false,
  exerciseMetadata,
  setExerciseMetadata,
  history,
  plans = [],
  setPlans,
  planWeekOverride = null,
  sessions,
  setSessions,
  setSelectedSessionId,
  onEditModeChange,
  onAutoStartHandled,
}) {
  const autoStartHandledRef = useRef(false);
  const [search, setSearch] = useState("");

  const [selectedMuscle, setSelectedMuscle] = useState("");

  const [showAdd, setShowAdd] = useState(false);

  const [pendingExercise, setPendingExercise] = useState(null);
  const [replacingExercise, setReplacingExercise] = useState(null);

  const [newExerciseValues, setNewExerciseValues] = useState({
    weight: "",
    minimumReps: "",
    reps: "",
    sets: "",
    rir: "",
  });

  const [editingExercise, setEditingExercise] = useState(null);
  const [editingExerciseDraft, setEditingExerciseDraft] = useState(null);
  const [editingPrescriptionField, setEditingPrescriptionField] = useState(null);
  const [editingTemplateName, setEditingTemplateName] = useState(false);
  const [templateNameDraft, setTemplateNameDraft] = useState(template.name);
  const [detailExercise, setDetailExercise] = useState(null);
  const [libraryEditingExercise, setLibraryEditingExercise] = useState(null);
  const [showTemplateMuscleMap, setShowTemplateMuscleMap] = useState(false);
  const [confirmPreviousWeekIncomplete, setConfirmPreviousWeekIncomplete] =
    useState(false);
  const [isStartingWorkout, setIsStartingWorkout] = useState(false);
  const templateBodyWeight = getLatestBodyWeightForDate(bodyWeightEntries);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editSnapshot, setEditSnapshot] = useState(null);
  const [addToWorkoutsState, setAddToWorkoutsState] = useState({
    added: false,
    templateId: null,
  });
  const addedToWorkouts =
    addToWorkoutsState.added &&
    String(addToWorkoutsState.templateId) === String(template.id);
  const linkedPlan = plans.find(
    (item) => String(item.id) === String(template.planId)
  );
  const currentPlanWeek = Number(planWeekOverride) || linkedPlan?.currentWeek || 1;
  const planWorkoutCompleteThisWeek = Boolean(
    linkedPlan?.completions?.some(
      (completion) =>
        Number(completion.weekNumber) === Number(currentPlanWeek) &&
        String(completion.planWorkoutId) === String(template.planWorkoutId)
    )
  );
  const isPlanWorkout = Boolean(template.planId);
  const canStartWorkout =
    !isPlanWorkout ||
    (linkedPlan?.status === "active" && !planWorkoutCompleteThisWeek);
  const startDisabledReason = !isPlanWorkout
    ? ""
    : !linkedPlan
      ? "This plan workout is no longer linked to an active plan."
      : linkedPlan.status === "completed"
        ? "This plan is complete."
        : linkedPlan.status !== "active"
          ? "Activate this plan before starting its workouts."
          : planWorkoutCompleteThisWeek
            ? `This workout is already complete for week ${currentPlanWeek}.`
            : "";

  function isPreviousPlanWeekIncomplete(plan) {
    const previousWeek = Number(currentPlanWeek) - 1;

    if (!plan || previousWeek < 1 || !Array.isArray(plan.workouts)) {
      return false;
    }

    const completedPreviousWeek = (plan.completions || []).filter(
      (completion) => Number(completion.weekNumber) === previousWeek
    ).length;

    return completedPreviousWeek < plan.workouts.length;
  }

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

  function getExerciseDetailRecord(templateExercise) {
    const exerciseKey = getExerciseKey(templateExercise);
    const idMatch = templateExercise.exerciseId
      ? exerciseLibrary.find(
          (exercise) => String(exercise.id) === String(templateExercise.exerciseId)
        )
      : null;
    const keyMatches = exerciseLibrary.filter(
      (exercise) => getExerciseKey(exercise) === exerciseKey
    );
    const libraryExercise =
      keyMatches.find((exercise) => exercise.imageUrl) ||
      keyMatches[0] ||
      idMatch ||
      null;
    const libraryMuscles = Array.isArray(libraryExercise?.muscles)
      ? libraryExercise.muscles.filter(Boolean)
      : [];
    const templateMuscles = Array.isArray(templateExercise.muscles)
      ? templateExercise.muscles.filter(Boolean)
      : [templateExercise.planMuscle].filter(Boolean);
    const muscles =
      libraryMuscles.length > 0 ? libraryMuscles : templateMuscles;

    return {
      ...(libraryExercise || {}),
      ...templateExercise,
      equipment: templateExercise.equipment || libraryExercise?.equipment || [],
      id:
        templateExercise.exerciseId ||
        libraryExercise?.id ||
        templateExercise.id,
      imageAlt: libraryExercise?.imageAlt || templateExercise.imageAlt || "",
      imageUrl: libraryExercise?.imageUrl || templateExercise.imageUrl || "",
      muscles,
      primaryMuscles: muscles.length > 0 ? [muscles[0]] : [],
      primary_muscles: muscles.length > 0 ? [muscles[0]] : [],
      primaryMuscle: muscles[0] || "",
      primary_muscle: muscles[0] || "",
      secondaryMuscles: muscles.slice(1),
      secondary_muscles: muscles.slice(1),
    };
  }

  function getGoalMode(plan) {
    if (isDeloadPlanWorkout(plan)) {
      return "maintenance";
    }

    return plan ? resolvePlanGoalMode(plan.goal) : "maintenance";
  }

  function isDeloadPlanWorkout(plan) {
    if (!plan?.config?.deload) {
      return false;
    }

    return Number(currentPlanWeek) === Number(plan.durationWeeks || 0) + 1;
  }

  function getPlanWeekRir(plan, weekNumber, fallbackRir = "") {
    if (!plan) {
      return fallbackRir;
    }

    return getRirForPlanWeek({
      durationWeeks: plan.durationWeeks,
      initialRir: plan.config?.rir ?? fallbackRir,
      mode: plan.config?.rirPeriodization,
      weekNumber,
    });
  }

  function getExerciseWeekPrescription(exercise, plan, weekNumber) {
    if (!plan) {
      return null;
    }

    return (
      exercise.weeklyPrescriptions?.find(
        (week) => Number(week.weekNumber) === Number(weekNumber)
      ) || null
    );
  }

  function getExerciseSetsForPlanWeek(exercise, weekPrescription) {
    const sourceSets = exercise.sets || [];
    const sourceWorkingSets = sourceSets.filter((set) => !set.isDropSet);
    const sourceDropSets = sourceSets.filter((set) => set.isDropSet);
    const targetSetCount = Math.max(
      1,
      Number(weekPrescription?.sets) || sourceWorkingSets.length || 1
    );
    const targetDropSetCount = Math.max(
      0,
      Math.min(
        3,
        Number(
          weekPrescription?.dropSets ??
            weekPrescription?.drop_sets ??
            sourceDropSets.length
        ) || 0
      )
    );
    const workingSets = Array.from({ length: targetSetCount }, (_, index) => {
      const sourceSet =
        sourceWorkingSets[index] || sourceWorkingSets.at(-1) || {};

      return {
        ...sourceSet,
        isDropSet: false,
        id:
          sourceWorkingSets[index]?.id || Date.now() + Math.random() + index,
      };
    });

    const dropSets = Array.from({ length: targetDropSetCount }, (_, index) => {
      const sourceSet = sourceDropSets[index] || {};

      return {
        ...sourceSet,
        id:
          sourceDropSets[index]?.id ||
          Date.now() + Math.random() + targetSetCount + index,
        isDropSet: true,
        prescribedReps: "AMRAP",
        prescribedRestSeconds: 0,
        prescribedRir: "0",
        reps: "AMRAP",
        restSeconds: 0,
        rir: "0",
        targetReps: "AMRAP",
        targetRir: "0",
      };
    });

    return [...workingSets, ...dropSets];
  }

  function applyInitialDropSetWeights(sets, exercise) {
    let sourceWeight = null;

    return sets.map((set) => {
      if (!set.isDropSet) {
        const parsedWeight = Number.parseFloat(
          String(set.actualWeight || set.targetWeight || "")
        );
        sourceWeight = Number.isFinite(parsedWeight) ? parsedWeight : null;
        return set;
      }

      if (sourceWeight == null) {
        return set;
      }

      const dropWeight = roundWeightToIncrement(
        sourceWeight * 0.8,
        getExerciseWeightIncrement(exercise, undefined, sourceWeight)
      );
      sourceWeight = dropWeight;

      return {
        ...set,
        actualWeight: String(dropWeight),
        targetWeight: String(dropWeight),
      };
    });
  }

  function getSetPrescriptionReps(set, fallback = "") {
    return firstPresentValue(
      set?.prescribedReps,
      set?.reps,
      set?.targetReps,
      fallback
    );
  }

  function getSetMinimumReps(set, fallback = "") {
    return firstPresentValue(
      set?.prescribedMinimumReps,
      set?.minimumReps,
      set?.minimum_reps,
      set?.targetMinimumReps,
      fallback
    );
  }

  function getSetPrescriptionRir(set, fallback = "") {
    return firstPresentValue(
      set?.prescribedRir,
      set?.rir,
      set?.targetRir,
      fallback
    );
  }

  function getSetPrescriptionRestSeconds(set, fallback = null) {
    const parsed = Number(
      firstPresentValue(
        set?.prescribedRestSeconds,
        set?.restSeconds,
        set?.rest_seconds,
        fallback
      )
    );

    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
  }

  function getPlannedSetPrescription({ plan, set, weekPrescription }) {
    if (set?.isDropSet) {
      return {
        minimumReps: "",
        reps: "AMRAP",
        restSeconds: 0,
        rir: "0",
      };
    }

    const restSeconds = getSetPrescriptionRestSeconds(
      {
        restSeconds: weekPrescription?.restSeconds ?? weekPrescription?.rest_seconds,
      },
      getSetPrescriptionRestSeconds(set)
    );

    return {
      minimumReps: formatTargetValue(
        weekPrescription?.minimumReps ??
          weekPrescription?.minimum_reps ??
          getSetMinimumReps(set)
      ),
      reps: formatTargetValue(
        weekPrescription?.reps ??
          getSetPrescriptionReps(set, plan?.config?.reps ?? "")
      ),
      restSeconds,
      rir: formatTargetValue(
        weekPrescription?.rir ??
          getPlanWeekRir(
            plan,
            currentPlanWeek,
            getSetPrescriptionRir(set, plan?.config?.rir ?? "")
          )
      ),
    };
  }

  function cloneTemplateEditState(sourceTemplate = template) {
    return {
      exercises: structuredClone(sourceTemplate.exercises || []),
    };
  }

  function enterEditMode(sourceTemplate = template) {
    if (isEditMode) {
      return;
    }

    setEditSnapshot(cloneTemplateEditState(sourceTemplate));
    setIsEditMode(true);
    onEditModeChange?.(true);
  }

  function syncLinkedPlanTemplate(nextTemplate) {
    if (!nextTemplate?.planId || typeof setPlans !== "function") {
      return;
    }

    setPlans((currentPlans) =>
      (currentPlans || []).map((plan) => {
        if (String(plan.id) !== String(nextTemplate.planId)) {
          return plan;
        }

        return {
          ...plan,
          updatedAt: new Date().toISOString(),
          workouts: (plan.workouts || []).map((planWorkout) =>
            String(planWorkout.templateId) === String(nextTemplate.id) ||
            String(planWorkout.planWorkoutId) === String(nextTemplate.planWorkoutId)
              ? {
                  ...planWorkout,
                  exercises: structuredClone(nextTemplate.exercises || []),
                  name: nextTemplate.name || planWorkout.name,
                  workoutType: nextTemplate.workoutType || planWorkout.workoutType || null,
                  workoutTypeLabel:
                    nextTemplate.workoutTypeLabel ||
                    planWorkout.workoutTypeLabel ||
                    null,
                }
              : planWorkout
          ),
        };
      })
    );
  }

  function updateCurrentTemplate(updater, { requireEdit = true } = {}) {
    if (requireEdit) {
      enterEditMode();
    }

    setTemplates((currentTemplates) =>
      currentTemplates.map((currentTemplate) => {
        if (currentTemplate.id !== template.id) {
          return currentTemplate;
        }

        const nextTemplate = updater(currentTemplate);

        syncLinkedPlanTemplate(nextTemplate);

        return nextTemplate;
      })
    );
  }

  function clearSingleExerciseSupersets(exercises) {
    const groupCounts = exercises.reduce((counts, exercise) => {
      const group = String(exercise.supersetGroup || "").trim();

      if (!group) {
        return counts;
      }

      counts.set(group, (counts.get(group) || 0) + 1);
      return counts;
    }, new Map());

    return exercises.map((exercise) => {
      const group = String(exercise.supersetGroup || "").trim();

      if (!group || groupCounts.get(group) < 2) {
        return {
          ...exercise,
          supersetGroup: null,
        };
      }

      return {
        ...exercise,
        supersetGroup: group,
      };
    });
  }

  function commitEditMode() {
    updateCurrentTemplate(
      (currentTemplate) => ({
        ...currentTemplate,
        exercises: clearSingleExerciseSupersets(currentTemplate.exercises || []),
      }),
      {
        requireEdit: false,
      }
    );
    setIsEditMode(false);
    setEditSnapshot(null);
    onEditModeChange?.(false);
    setAddToWorkoutsState({
      added: false,
      templateId: template.id,
    });
  }

  function cancelEditMode() {
    if (editSnapshot) {
      setTemplates((currentTemplates) =>
        currentTemplates.map((currentTemplate) => {
          if (currentTemplate.id !== template.id) {
            return currentTemplate;
          }

          const restoredTemplate = {
            ...currentTemplate,
            exercises: structuredClone(editSnapshot.exercises || []),
          };

          syncLinkedPlanTemplate(restoredTemplate);

          return restoredTemplate;
        })
      );
    }

    setShowAdd(false);
    setSearch("");
    setPendingExercise(null);
    setNewExerciseValues({
      weight: "",
      minimumReps: "",
      reps: "",
      sets: "",
      rir: "",
    });
    setEditingExercise(null);
    setEditingExerciseDraft(null);
    setEditingPrescriptionField(null);
    setIsEditMode(false);
    setEditSnapshot(null);
    onEditModeChange?.(false);
  }

  function formatTargetValue(value, fallback = "") {
    return value == null || value === "" ? String(fallback) : String(value);
  }

  function firstPresentValue(...values) {
    const value = values.find((item) => item != null && item !== "");

    return value == null ? "" : value;
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
    const normalizedSeconds = Number(seconds);

    if (!Number.isFinite(normalizedSeconds) || normalizedSeconds <= 0) {
      return "";
    }

    const roundedSeconds = Math.round(normalizedSeconds);
    const minutes = Math.floor(roundedSeconds / 60);
    const remainder = roundedSeconds % 60;

    return `${minutes}:${String(remainder).padStart(2, "0")}`;
  }

  function formatRestRange(values) {
    const normalizedValues = [
      ...new Set(
        values
          .map((value) => Number(value))
          .filter((value) => Number.isFinite(value) && value > 0)
          .map((value) => Math.round(value))
      ),
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

  function getEffectiveSetRestSeconds(set) {
    const reps = getSetPrescriptionReps(set);

    return (
      getSetPrescriptionRestSeconds(set) ||
      getDefaultRestSecondsForReps(reps)
    );
  }

  function getWorkoutPrescriptionSummary(exercise) {
    const workingSets = (exercise?.sets || []).filter((set) => !set.isDropSet);
    const dropSetCount = (exercise?.sets || []).filter(
      (set) => set.isDropSet
    ).length;
    const setCount = workingSets.length;
    const reps = formatRange(
      workingSets.flatMap((set) => {
        const maximumReps = getSetPrescriptionReps(set);

        return [getSetMinimumReps(set, maximumReps), maximumReps];
      })
    );
    const rir = formatRange(
      workingSets.map((set) => getSetPrescriptionRir(set))
    );
    const rest = formatRestRange(
      workingSets.map((set) => getEffectiveSetRestSeconds(set))
    );
    const setLabel = setCount === 1 ? "set" : "sets";

    return `${setCount}\u00a0${setLabel} | ${dropSetCount}\u00a0drops | ${
      reps || "—"
    }\u00a0reps | ${rir || "—"}\u00a0RIR | ${rest || "—"}\u00a0rest`;
  }

  function getExerciseWithCurrentInstancePrescription(exercise) {
    const weekPrescription = getExerciseWeekPrescription(
      exercise,
      linkedPlan,
      currentPlanWeek
    );

    if (!linkedPlan || !weekPrescription) {
      return exercise;
    }

    return {
      ...exercise,
      sets: getExerciseSetsForPlanWeek(exercise, weekPrescription).map((set) => ({
        ...set,
        ...getPlannedSetPrescription({
          plan: linkedPlan,
          set,
          weekPrescription,
        }),
      })),
    };
  }

  function getCurrentInstancePrescriptionChanges(originalExercise, draftExercise) {
    const originalFirstSet = originalExercise?.sets?.[0] || {};
    const draftFirstSet = draftExercise?.sets?.[0] || {};

    return {
      reps:
        getSetPrescriptionReps(originalFirstSet) !==
          getSetPrescriptionReps(draftFirstSet) ||
        getSetMinimumReps(
          originalFirstSet,
          getSetPrescriptionReps(originalFirstSet)
        ) !==
          getSetMinimumReps(draftFirstSet, getSetPrescriptionReps(draftFirstSet)),
      rest:
        getEffectiveSetRestSeconds(originalFirstSet) !==
        getEffectiveSetRestSeconds(draftFirstSet),
      rir:
        getSetPrescriptionRir(originalFirstSet) !==
        getSetPrescriptionRir(draftFirstSet),
      sets:
        (originalExercise?.sets || []).filter((set) => !set.isDropSet).length !==
        (draftExercise?.sets || []).filter((set) => !set.isDropSet).length,
      dropSets:
        (originalExercise?.sets || []).filter((set) => set.isDropSet).length !==
        (draftExercise?.sets || []).filter((set) => set.isDropSet).length,
    };
  }

  function applyCurrentInstancePrescription(
    baseExercise,
    instanceExercise,
    prescriptionChanges = null
  ) {
    if (!linkedPlan || !Array.isArray(baseExercise?.weeklyPrescriptions)) {
      return instanceExercise;
    }

    const changes =
      prescriptionChanges ||
      getCurrentInstancePrescriptionChanges(
        getExerciseWithCurrentInstancePrescription(baseExercise),
        instanceExercise
      );
    const firstSet = instanceExercise?.sets?.[0] || {};
    const editedSets = String(
      (instanceExercise?.sets || []).filter((set) => !set.isDropSet).length || 1
    );
    const editedDropSets = String(
      (instanceExercise?.sets || []).filter((set) => set.isDropSet).length
    );
    const editedReps = getSetPrescriptionReps(firstSet);
    const editedMinimumReps = getSetMinimumReps(firstSet, editedReps);
    const editedRestSeconds = getEffectiveSetRestSeconds(firstSet);
    const editedRir = getSetPrescriptionRir(firstSet);
    const nextWeeklyPrescriptions = baseExercise.weeklyPrescriptions.map((week) => {
      const weekNumber = Number(week.weekNumber);

      if (weekNumber < Number(currentPlanWeek)) {
        return week;
      }

      if (week.isDeload && weekNumber !== Number(currentPlanWeek)) {
        return week;
      }

      const nextWeek = {
        ...week,
        ...(changes.reps
          ? {
              reps: editedReps,
              ...(String(editedMinimumReps) === String(editedReps)
                ? {}
                : { minimumReps: editedMinimumReps }),
            }
          : {}),
        ...(changes.rest ? { restSeconds: String(editedRestSeconds) } : {}),
        ...(changes.sets ? { sets: editedSets } : {}),
        ...(changes.dropSets ? { dropSets: editedDropSets } : {}),
        ...(weekNumber === Number(currentPlanWeek)
          ? {
              ...(changes.rir ? { rir: editedRir } : {}),
            }
          : {}),
      };

      if (changes.reps && String(editedMinimumReps) === String(editedReps)) {
        delete nextWeek.minimumReps;
        delete nextWeek.minimum_reps;
      }

      return nextWeek;
    });

    return {
      ...baseExercise,
      equipment: instanceExercise.equipment,
      exerciseId: instanceExercise.exerciseId,
      imageAlt: instanceExercise.imageAlt,
      imageUrl: instanceExercise.imageUrl,
      muscles: instanceExercise.muscles,
      name: instanceExercise.name,
      note: instanceExercise.note,
      supersetGroup: instanceExercise.supersetGroup,
      weeklyPrescriptions: nextWeeklyPrescriptions,
    };
  }

  function getPrescriptionSignature(exercise) {
    return (exercise?.sets || [])
      .map((set) =>
        [
          getSetPrescriptionReps(set),
          getSetMinimumReps(set, getSetPrescriptionReps(set)),
          getSetPrescriptionRir(set),
          getEffectiveSetRestSeconds(set),
          set.isDropSet ? "drop" : "working",
        ].join(":")
      )
      .join("|");
  }

  function hasPrescriptionChanged(originalExercise, draftExercise) {
    return (
      (originalExercise?.sets?.length || 0) !== (draftExercise?.sets?.length || 0) ||
      getPrescriptionSignature(originalExercise) !== getPrescriptionSignature(draftExercise)
    );
  }

  function getLatestHistoryPerformance(templateExercise) {
    return findLatestExercisePerformance({
      currentIsDeload: isDeloadPlanWorkout(linkedPlan),
      exercise: templateExercise,
      history,
      plan: linkedPlan,
      planWeek: currentPlanWeek,
      planWorkoutId: template.planWorkoutId,
      plans,
      templateId: template.id,
      templates,
    });
  }

  function getLatestHistoryExercise(templateExercise) {
    return getLatestHistoryPerformance(templateExercise)?.exercise;
  }

  function getActualDefaultsForSet(
    templateExercise,
    setIndex,
    targetSet,
    latestHistoryExercise = getLatestHistoryExercise(templateExercise)
  ) {
    const historySet = latestHistoryExercise?.sets?.[setIndex];

    if (historySet) {
      return {
        actualReps: formatTargetValue(
          firstPresentValue(historySet.actualReps)
        ),
        actualRir: formatTargetValue(
          firstPresentValue(historySet.actualRir)
        ),
        actualWeight: formatTargetValue(
          firstPresentValue(historySet.actualWeight)
        ),
      };
    }

    return {
      actualReps: formatTargetValue(targetSet.targetReps),
      actualRir: formatTargetValue(targetSet.targetRir),
      actualWeight: "",
    };
  }

  function getDynamicTargetPrescription({
    exercise,
    libraryExercise,
    plan,
    setIndex,
    targetReps,
    targetRir,
    latestPerformance = getLatestHistoryPerformance(exercise),
  }) {
    const recommendationExercise = {
      ...(libraryExercise || {}),
      ...exercise,
      id: exercise.exerciseId || libraryExercise?.id || exercise.id,
      exerciseId: exercise.exerciseId || libraryExercise?.id || exercise.id,
    };

    const isDeload = isDeloadPlanWorkout(plan);

    if (isDeload || (getGoalMode(plan) === "progress" && setIndex === 0)) {
      const latestHistoryExercise = latestPerformance?.exercise;
      const historicalBodyWeight = getLatestBodyWeightForDate(
        bodyWeightEntries,
        latestPerformance?.workout?.completedAt ||
          latestPerformance?.workout?.workoutStartedAtIso ||
          latestPerformance?.workout?.startedAtIso ||
          latestPerformance?.workout?.startedAt
      );
      const latestMaxE1RM = Math.max(
        0,
        ...(latestHistoryExercise?.sets || [])
          .map((set) =>
            calculateE1RM(
              firstPresentValue(set.actualWeight),
              firstPresentValue(set.actualReps),
              firstPresentValue(set.actualRir),
              null,
              null,
              null,
              {
                bodyWeight: historicalBodyWeight,
                exercise: recommendationExercise,
              }
            )
          )
          .filter(Number.isFinite)
      );

      if (latestMaxE1RM > 0) {
        const result = recommendTargetPrescription({
          allowedRepWindow: 2,
          bodyWeight: templateBodyWeight,
          exercise: recommendationExercise,
          goalMode: getGoalMode(plan),
          preferredRepWindow: 2,
          previousE1RM: latestMaxE1RM,
          progressionPercent: isDeload
            ? -DELOAD_TARGET_REDUCTION_PERCENT
            : MAIN_TARGET_PROGRESSION_PERCENT,
          targetReps,
          targetRir,
          weightIncrement: (weight) =>
            getExerciseWeightIncrement(recommendationExercise, undefined, weight),
        });

        if (!isDeload) {
          return result?.recommendation || null;
        }

        return [result?.recommendation, ...(result?.alternatives || [])].find(
          (candidate) => candidate?.e1rm < latestMaxE1RM
        ) || null;
      }
    }

    const recommendation = recommendSetTarget({
      allowedRepWindow: 2,
      bodyWeight: templateBodyWeight,
      exercise: recommendationExercise,
      goalMode: getGoalMode(plan),
      history,
      preferredRepWindow: 2,
      setIndex,
      targetReps,
      targetRir,
      weightIncrement: (weight) =>
        getExerciseWeightIncrement(recommendationExercise, undefined, weight),
    });

    return recommendation.result?.recommendation || null;
  }

  function getEffectivePlanExercise(exercise, plan) {
    const weekPrescription = getExerciseWeekPrescription(
      exercise,
      plan,
      currentPlanWeek
    );

    return {
      ...exercise,
      sets: getExerciseSetsForPlanWeek(exercise, weekPrescription).map(
        (set) => ({
          ...set,
          ...getPlannedSetPrescription({
            plan,
            set,
            weekPrescription,
          }),
        })
      ),
    };
  }

  const previewExercises =
    linkedPlan && !isEditMode
      ? template.exercises.map((exercise) =>
          getEffectivePlanExercise(exercise, linkedPlan)
        )
      : template.exercises;
  const previewTemplate = {
    ...template,
    exercises: previewExercises,
  };
  const workoutSummary = getTemplateWorkoutSummary(previewTemplate);
  const estimatedWorkoutMinutes = getEstimatedWorkoutMinutes(previewTemplate);
  const planContextLabel = linkedPlan
    ? `${linkedPlan.name} · Week ${currentPlanWeek}`
    : "Standalone workout";

  function startWorkout() {
    if (!canStartWorkout || isStartingWorkout) {
      return;
    }

    const plan = plans.find(
      (item) => String(item.id) === String(template.planId)
    );

    if (isPreviousPlanWeekIncomplete(plan)) {
      void triggerNativeWarningHaptic();
      setConfirmPreviousWeekIncomplete(true);
      return;
    }

    beginStartWorkout(plan);
  }

  function beginStartWorkout(plan) {
    if (isStartingWorkout) {
      return;
    }

    setIsStartingWorkout(true);
    window.requestAnimationFrame(() => {
      window.setTimeout(() => startWorkoutSession(plan), 0);
    });
  }

  function startWorkoutSession(
    plan = plans.find((item) => String(item.id) === String(template.planId))
  ) {
    const startedAtIso = new Date().toISOString();
    const session = {
      id: Date.now(),

      templateId: template.id,

      templateName: template.name,
      startedAt: new Date(startedAtIso).toLocaleDateString(),
      startedAtIso,
      workoutStartedAtIso: startedAtIso,
      workoutTimerBaseSeconds: 0,
      workoutTimerPaused: false,
      workoutTimerResumedAtIso: startedAtIso,
      planId: template.planId || null,
      planWeek: plan ? currentPlanWeek : null,
      planWorkoutId: template.planWorkoutId || null,

      exercises: template.exercises.map((exercise) => {
        const libraryExercise = exerciseLibrary.find(
          (ex) => ex.id === exercise.exerciseId
        );
        const latestPerformance = getLatestHistoryPerformance(exercise);
        const latestHistoryExercise = latestPerformance?.exercise;

        return {
          ...exercise,

          note: libraryExercise?.note || "",

          sets: applyInitialDropSetWeights(
            getExerciseSetsForPlanWeek(
              exercise,
              getExerciseWeekPrescription(exercise, plan, currentPlanWeek)
            ).map((set, setIndex) => {
              const weekPrescription = getExerciseWeekPrescription(
                exercise,
                plan,
                currentPlanWeek
              );
              const plannedPrescription = getPlannedSetPrescription({
                plan,
                set,
                weekPrescription,
              });
              const dynamicTarget = getDynamicTargetPrescription({
                exercise,
                libraryExercise,
                plan,
                setIndex,
                targetReps: plannedPrescription.reps,
                targetRir: plannedPrescription.rir,
                latestPerformance,
              });

              const targetSet = {
                ...set,
                ...(plannedPrescription.minimumReps
                  ? {
                      minimumReps: plannedPrescription.minimumReps,
                      prescribedMinimumReps: plannedPrescription.minimumReps,
                      targetMinimumReps: plannedPrescription.minimumReps,
                    }
                  : {}),
                prescribedReps: plannedPrescription.reps,
                prescribedRestSeconds:
                  plannedPrescription.restSeconds || undefined,
                prescribedRir: plannedPrescription.rir,
                reps: plannedPrescription.reps,
                restSeconds:
                  plannedPrescription.restSeconds || set.restSeconds,
                rir: plannedPrescription.rir,
                targetWeight: formatTargetValue(dynamicTarget?.weight),

                targetReps: plannedPrescription.reps,

                targetRir: plannedPrescription.rir,
              };
              const actualDefaults = getActualDefaultsForSet(
                exercise,
                setIndex,
                targetSet,
                latestHistoryExercise
              );

              return {
                ...targetSet,
                ...actualDefaults,
              };
            }),
            { ...(libraryExercise || {}), ...exercise }
          ),
        };
      }),
    };

    setSessions([...sessions, session]);

    setSelectedSessionId(session.id);
  }

  useEffect(() => {
    if (!autoStart || autoStartHandledRef.current) {
      return;
    }

    autoStartHandledRef.current = true;
    onAutoStartHandled?.();
    startWorkout();
  }, [autoStart, onAutoStartHandled]);

  function addExercise(exercise) {
    enterEditMode();

    const reps = newExerciseValues.reps;
    const minimumReps = newExerciseValues.minimumReps || reps;

    const numSets = Number(newExerciseValues.sets);

    const rir = newExerciseValues.rir;

    const sets = Array.from(
      {
        length: numSets,
      },

      () => ({
        id: Date.now() + Math.random(),
        ...(String(minimumReps) === String(reps) ? {} : { minimumReps }),
        reps,

        rir,
      })
    );

    updateCurrentTemplate(
      (currentTemplate) => ({
        ...currentTemplate,

        exercises: [
          ...currentTemplate.exercises,

          {
            id: Date.now(),

            exerciseId: exercise.id,

            name: exercise.name,

            equipment: exercise.equipment,

            muscles: exercise.muscles,

            sets,
          },
        ],
      }),
      {
        requireEdit: false,
      }
    );

    setShowAdd(false);

    setSearch("");

    setPendingExercise(null);

    setNewExerciseValues({
      weight: "",
      minimumReps: "",
      reps: "",
      sets: "",
      rir: "",
    });
  }

  function saveTemplateName() {
    const nextName = templateNameDraft.trim();

    if (!nextName) {
      return;
    }

    setTemplates(
      templates.map((t) =>
        t.id === template.id
          ? {
              ...t,
              name: nextName,
            }
          : t
      )
    );
    setEditingTemplateName(false);
    setAddToWorkoutsState({
      added: false,
      templateId: template.id,
    });
  }

  function addPlanWorkoutToWorkouts() {
    const copiedAt = Date.now();
    const copy = {
      ...template,
      id: copiedAt,
      lastCompleted: null,
      name: `${template.name} copy`,
      parentWorkoutId: template.id,
      planId: null,
      planWeek: null,
      planWorkoutId: null,
      exercises: template.exercises.map((exercise, exerciseIndex) => ({
        ...exercise,
        id: copiedAt + exerciseIndex + 1,
        sets: exercise.sets.map((set, setIndex) => ({
          ...set,
          id: copiedAt + exerciseIndex * 100 + setIndex,
        })),
      })),
    };

    setTemplates([...templates, copy]);
    setAddToWorkoutsState({
      added: true,
      templateId: template.id,
    });
  }

  function getLatestWorkoutPerformance(exerciseId) {
    const workout = history.find((workout) =>
      workout.exercises.some((exercise) => exercise.exerciseId === exerciseId)
    );

    if (!workout) {
      return null;
    }

    const exercise = workout.exercises.find(
      (exercise) => exercise.exerciseId === exerciseId
    );

    if (!exercise) {
      return null;
    }

    return {
      completedAt: workout.completedAt,
      completedAtIso: workout.completedAtIso || workout.completed_at || workout.completedAt,
      sets: exercise.sets,
    };
  }

  function getPrescriptionPickerValue(field) {
    if (!editingExerciseDraft) {
      return "";
    }

    if (field === "sets") {
      return String(
        (editingExerciseDraft.sets || []).filter((set) => !set.isDropSet)
          .length || 1
      );
    }

    if (field === "dropSets") {
      return String(
        (editingExerciseDraft.sets || []).filter((set) => set.isDropSet).length
      );
    }

    const firstSet = editingExerciseDraft.sets?.[0] || {};

    if (field === "reps") {
      return getSetPrescriptionReps(firstSet);
    }

    if (field === "minimumReps") {
      return getSetMinimumReps(firstSet, getSetPrescriptionReps(firstSet));
    }

    if (field === "rir") {
      return getSetPrescriptionRir(firstSet);
    }

    if (field === "restSeconds") {
      return String(getEffectiveSetRestSeconds(firstSet));
    }

    return "";
  }

  function updateEditingPrescription(field, value) {
    if (!editingExerciseDraft) {
      return;
    }

    const updated = structuredClone(editingExerciseDraft);

    if (field === "sets") {
      const nextSetCount = Math.max(1, Number(value) || 1);
      const currentSets = (updated.sets || []).filter((set) => !set.isDropSet);
      const dropSets = (updated.sets || []).filter((set) => set.isDropSet);
      const templateSet = currentSets.at(-1) || {
        reps: "",
        restSeconds: "",
        rir: "",
      };

      const workingSets = Array.from({ length: nextSetCount }, (_, index) => {
        const existingSet = currentSets[index];

        return existingSet
          ? existingSet
          : {
              id: Date.now() + Math.random() + index,
              ...(getSetMinimumReps(templateSet)
                ? { minimumReps: getSetMinimumReps(templateSet) }
                : {}),
              reps: getSetPrescriptionReps(templateSet),
              restSeconds: getEffectiveSetRestSeconds(templateSet),
              rir: getSetPrescriptionRir(templateSet),
            };
      });
      updated.sets = [...workingSets, ...dropSets];
    }

    if (field === "dropSets") {
      const nextDropSetCount = Math.max(0, Math.min(3, Number(value) || 0));
      const workingSets = (updated.sets || []).filter((set) => !set.isDropSet);
      const currentDropSets = (updated.sets || []).filter(
        (set) => set.isDropSet
      );
      const dropSets = Array.from({ length: nextDropSetCount }, (_, index) => ({
        ...(currentDropSets[index] || {}),
        id:
          currentDropSets[index]?.id ||
          Date.now() + Math.random() + workingSets.length + index,
        isDropSet: true,
        prescribedReps: "AMRAP",
        prescribedRestSeconds: 0,
        prescribedRir: "0",
        reps: "AMRAP",
        restSeconds: 0,
        rir: "0",
        targetReps: "AMRAP",
        targetRir: "0",
      }));

      updated.sets = [...workingSets, ...dropSets];
    }

    if (field === "reps" || field === "minimumReps") {
      updated.sets = (updated.sets || []).map((set) => {
        if (set.isDropSet) {
          return set;
        }
        const currentMaximum = Number(getSetPrescriptionReps(set));
        const currentMinimum = Number(
          getSetMinimumReps(set, getSetPrescriptionReps(set))
        );
        const selectedValue = Number(value);
        const maximumReps =
          field === "reps" ? selectedValue : Math.max(currentMaximum, selectedValue);
        const minimumReps =
          field === "minimumReps" ? selectedValue : Math.min(currentMinimum, selectedValue);
        const nextSet = {
          ...set,
          prescribedReps: String(maximumReps),
          reps: String(maximumReps),
          targetReps: String(maximumReps),
        };

        delete nextSet.minimumReps;
        delete nextSet.minimum_reps;
        delete nextSet.prescribedMinimumReps;
        delete nextSet.targetMinimumReps;

        if (minimumReps !== maximumReps) {
          nextSet.minimumReps = String(minimumReps);
        }

        return nextSet;
      });
    }

    if (field === "rir") {
      updated.sets = (updated.sets || []).map((set) => ({
        ...set,
        ...(set.isDropSet ? {} : { rir: String(value) }),
      }));
    }

    if (field === "restSeconds") {
      updated.sets = (updated.sets || []).map((set) => ({
        ...set,
        ...(set.isDropSet
          ? {}
          : {
              prescribedRestSeconds: Number(value),
              restSeconds: Number(value),
            }),
      }));
    }

    setEditingExerciseDraft(updated);
    setEditingPrescriptionField(null);
  }

  return (
    <div
      className="template-view"
      style={{
        padding: "20px 20px 150px",
      }}
    >
      <AppPageHeader
        subtitle={planContextLabel}
        title={
          <button
            aria-label={`Edit workout name: ${template.name}`}
            className="template-view__title-button"
            onClick={() => {
              setTemplateNameDraft(template.name);
              setEditingTemplateName(true);
            }}
            type="button"
          >
            {template.name}
          </button>
        }
      />

      <AppSectionCard className="template-view__summary" tone="accent">
        <AppSectionHeading
          action={
            <AppStatusPill tone={isPlanWorkout ? "accent" : "neutral"}>
              {isPlanWorkout ? `Week ${currentPlanWeek}` : "Workout"}
            </AppStatusPill>
          }
          eyebrow="Workout overview"
          subtitle={`${workoutSummary.exerciseCount} exercise${
            workoutSummary.exerciseCount === 1 ? "" : "s"
          } · ${workoutSummary.totalSets} planned set${
            workoutSummary.totalSets === 1 ? "" : "s"
          } · About ${estimatedWorkoutMinutes} min`}
          title="Ready when you are"
        />

        <div className="template-view__muscles">
          {workoutSummary.muscleSets.slice(0, 4).map(([muscle, sets]) => (
            <span className="template-view__muscle-chip" key={muscle}>
              {muscle} · {sets}
            </span>
          ))}
          {workoutSummary.muscleSets.length > 4 && (
            <button
              className="template-view__muscle-more"
              onClick={() => setShowTemplateMuscleMap(true)}
              type="button"
            >
              +{workoutSummary.muscleSets.length - 4} more
            </button>
          )}
        </div>

        <div className="template-view__toolbar">
          <button
            className="app-secondary-action"
            onClick={() => setShowTemplateMuscleMap(true)}
            type="button"
          >
            <BarChart3 size={17} /> Muscle Map
          </button>
          <button
            className="app-secondary-action"
            onClick={() => {
              if (!isEditMode) {
                enterEditMode();
                return;
              }

              setShowAdd(true);
            }}
            type="button"
          >
            {isEditMode ? (
              <>
                <Plus size={16} /> Add Exercise
              </>
            ) : (
              <>
                <Pencil size={16} /> Edit Workout
              </>
            )}
          </button>

          {isPlanWorkout && !isEditMode && (
            <button
              className="app-secondary-action"
              disabled={addedToWorkouts}
              onClick={addPlanWorkoutToWorkouts}
              type="button"
            >
              {addedToWorkouts ? (
                <>
                  <Check size={16} /> Added
                </>
              ) : (
                <>
                  <Plus size={16} /> Add to Workouts
                </>
              )}
            </button>
          )}
        </div>
      </AppSectionCard>

      {!isEditMode && startDisabledReason && (
        <div
          role="status"
          style={{
            background: "var(--surface-muted)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            color: "var(--text-muted)",
            fontSize: "12px",
            marginBottom: "12px",
            padding: "9px 11px",
            textAlign: "left",
          }}
        >
          {startDisabledReason}
        </div>
      )}

      {editingTemplateName && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Edit workout name"
          style={{
            alignItems: "center",
            background: "rgba(0,0,0,.42)",
            display: "flex",
            inset: 0,
            justifyContent: "center",
            padding: "18px",
            position: "fixed",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "var(--surface-raised)",
              borderRadius: "12px",
              boxShadow: "0 10px 28px rgba(0,0,0,.25)",
              boxSizing: "border-box",
              maxWidth: "360px",
              padding: "16px",
              width: "100%",
            }}
          >
            <h2
              style={{
                fontSize: "20px",
                marginBottom: "12px",
              }}
            >
              Workout name
            </h2>
            <input
              autoFocus
              value={templateNameDraft}
              onChange={(event) => setTemplateNameDraft(event.target.value)}
              style={{
                boxSizing: "border-box",
                font: "inherit",
                marginBottom: "12px",
                minHeight: "42px",
                padding: "7px 10px",
                width: "100%",
              }}
            />
            <div
              style={{
                display: "flex",
                gap: "8px",
                justifyContent: "space-between",
              }}
            >
              <button
                onClick={() => setEditingTemplateName(false)}
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  gap: "6px",
                }}
              >
                <X size={16} /> Cancel
              </button>
              <button
                disabled={!templateNameDraft.trim()}
                onClick={saveTemplateName}
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  gap: "6px",
                }}
              >
                <Save size={16} /> Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <ExercisePickerSheet
          bodyWeightEntries={bodyWeightEntries}
          title="Add exercise"
          exerciseLibrary={exerciseLibrary}
          history={history}
          search={search}
          selectedMuscle={selectedMuscle}
          setSearch={setSearch}
          setSelectedMuscle={setSelectedMuscle}
          onClose={() => {
            setShowAdd(false);
            setSearch("");
          }}
          onSelect={(exercise) => {
            setPendingExercise(exercise);
            setShowAdd(false);
          }}
        />
      )}

      {replacingExercise && (
        <ExercisePickerSheet
          bodyWeightEntries={bodyWeightEntries}
          title="Replace exercise"
          exerciseLibrary={exerciseLibrary}
          history={history}
          search={search}
          selectedMuscle={selectedMuscle}
          setSearch={setSearch}
          setSelectedMuscle={setSelectedMuscle}
          onClose={() => {
            setReplacingExercise(null);
            setSearch("");
            setSelectedMuscle("");
          }}
          onSelect={(exercise) => {
            updateCurrentTemplate((currentTemplate) => ({
              ...currentTemplate,
              exercises: currentTemplate.exercises.map((templateExercise) =>
                templateExercise.id === replacingExercise.id
                  ? (() => {
                      const preservedPrescription =
                        getExerciseWithCurrentInstancePrescription(templateExercise);

                      return applyCurrentInstancePrescription(templateExercise, {
                        ...preservedPrescription,
                        equipment: exercise.equipment,
                        exerciseId: exercise.id,
                        imageAlt: exercise.imageAlt || "",
                        imageUrl: exercise.imageUrl || "",
                        muscles: exercise.muscles,
                        name: exercise.name,
                      });
                    })()
                  : templateExercise
              ),
            }));

            setReplacingExercise(null);
            setSearch("");
            setSelectedMuscle("");
          }}
        />
      )}

      {pendingExercise && (
            <div
              style={{
                position: "fixed",

                top: "50%",

                left: "50%",

                transform: "translate(-50%, -50%)",

                background: "var(--surface-raised)",

                border: "1px solid var(--border)",

                borderRadius: "12px",

                padding: "20px",

                width: "280px",

                zIndex: "1000",

                boxShadow: "0 4px 12px rgba(0,0,0,.2)",
              }}
            >
              <h3>
                {`${pendingExercise.name}${
                  pendingExercise.equipment?.[0]
                    ? ", " + pendingExercise.equipment[0]
                    : ""
                }`}
              </h3>

              <ExerciseSetupDialog
              bodyWeightEntries={bodyWeightEntries}
              exercise={pendingExercise}
                exerciseMetadata={exerciseMetadata}
                getLatestWorkoutPerformance={getLatestWorkoutPerformance}
              calculateE1RM={calculateE1RM}
              values={newExerciseValues}
                setValues={setNewExerciseValues}
              />

              <div
                style={{
                  marginTop: "12px",

                  display: "flex",

                  gap: "10px",

                  justifyContent: "flex-end",
                }}
              >
                <IconButton
                  label="Cancel add exercise"
                  onClick={() => {
                    setPendingExercise(null);

                    setNewExerciseValues({
                      weight: "",
                      minimumReps: "",
                      reps: "",
                      sets: "",
                      rir: "",
                    });
                  }}
                >
                  <X size={18} />
                </IconButton>

                <IconButton
                  label="Add exercise"
                  tone="success"
                  onClick={() => {
                    addExercise(pendingExercise);

                    setNewExerciseValues({
                      weight: "",
                      minimumReps: "",
                      reps: "",
                      sets: "",
                      rir: "",
                    });
                  }}
                >
                  <Check size={18} />
                </IconButton>
              </div>
            </div>
      )}
      <div className="template-view__exercise-heading">
        <span>Exercises</span>
        <span>{workoutSummary.exerciseCount}</span>
      </div>
      {
        <DndContext
          collisionDetection={closestCenter}
          onDragEnd={({ active, over }) => {
            if (!over || active.id === over.id) {
              return;
            }

            const oldIndex = template.exercises.findIndex(
              (ex) => ex.id === active.id
            );

            const newIndex = template.exercises.findIndex(
              (ex) => ex.id === over.id
            );

            const reordered = arrayMove(template.exercises, oldIndex, newIndex);

            updateCurrentTemplate((currentTemplate) => ({
              ...currentTemplate,
              exercises: reordered,
            }));
          }}
        >
          <SortableContext
            items={previewExercises.map((exercise) => exercise.id)}
            strategy={verticalListSortingStrategy}
          >
            {getGroupedPreviewExercises(previewExercises).map((group) => (
              <WorkoutExercisePreviewGroup
                key={group.group || group.exercises[0].id}
                group={group.group}
              >
                {group.exercises.map((exercise) => {
                  const templateExercise =
                    template.exercises.find((item) => item.id === exercise.id) ||
                    exercise;
                  const prescriptionExercise =
                    getExerciseWithCurrentInstancePrescription(templateExercise);
                  const exerciseDetail = getExerciseDetailRecord(exercise);
                  return (
                    <SortableExerciseRow key={exercise.id} exercise={exercise}>
                      {({ attributes, listeners }) => (
                        <WorkoutExercisePreviewRow
                          compact
                          exercise={exercise}
                          exerciseDetail={exerciseDetail}
                          layout="templateCompact"
                          onExerciseClick={() => setDetailExercise(exerciseDetail)}
                          showNote={false}
                          onSetClick={() => {
                            setEditingExercise(prescriptionExercise);

                            setEditingExerciseDraft(
                              structuredClone(prescriptionExercise)
                            );
                          }}
                          onPrescriptionClick={() => {
                            setEditingExercise(prescriptionExercise);
                            setEditingExerciseDraft(
                              structuredClone(prescriptionExercise)
                            );
                          }}
                          prescriptionSummary={getWorkoutPrescriptionSummary(
                            prescriptionExercise
                          )}
                          actions={
                            <>
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

                              <IconButton
                                label="Replace exercise"
                                size={32}
                                onClick={() => {
                                  setShowAdd(false);
                                  setPendingExercise(null);
                                  setReplacingExercise(prescriptionExercise);
                                  setSelectedMuscle(exerciseDetail?.muscles?.[0] || "");
                                  setSearch("");
                                }}
                              >
                                <RefreshCw size={16} />
                              </IconButton>

                              <IconButton
                                label="Edit superset"
                                size={exercise.supersetGroup ? 42 : 32}
                                onClick={() => {
                                  const group = prompt(
                                    "Superset group (A, B, etc). Leave empty to clear.",
                                    exercise.supersetGroup || ""
                                  );

                                  if (group === null) {
                                    return;
                                  }

                                  updateCurrentTemplate((currentTemplate) => ({
                                    ...currentTemplate,

                                    exercises: currentTemplate.exercises.map((ex) =>
                                      ex.id === exercise.id
                                        ? {
                                            ...ex,

                                            supersetGroup: group || null,
                                          }
                                        : ex
                                    ),
                                  }));
                                }}
                              >
                                <Link2 size={16} />
                                {exercise.supersetGroup && (
                                  <span
                                    style={{
                                      fontSize: "10px",
                                      fontWeight: "bold",
                                      marginLeft: "-3px",
                                    }}
                                  >
                                    {exercise.supersetGroup}
                                  </span>
                                )}
                              </IconButton>

                              <IconButton
                                label="Delete exercise"
                                size={32}
                                tone="danger"
                                onClick={() => {
                                  updateCurrentTemplate((currentTemplate) => ({
                                    ...currentTemplate,

                                    exercises: currentTemplate.exercises.filter(
                                      (ex) => ex.id !== exercise.id
                                    ),
                                  }));
                                }}
                              >
                                <Trash2 size={16} />
                              </IconButton>
                            </>
                          }
                        />
                      )}
                    </SortableExerciseRow>
                  );
                })}
              </WorkoutExercisePreviewGroup>
            ))}
          </SortableContext>
        </DndContext>
      }
      {!isEditMode && (
        <div className="template-view__start-bar">
          <button
            aria-busy={isStartingWorkout}
            className="app-primary-action template-view__start-button"
            disabled={!canStartWorkout || isStartingWorkout}
            onClick={startWorkout}
            type="button"
          >
            <Play size={18} />
            {isStartingWorkout ? "Starting workout…" : "Start Workout"}
          </button>
        </div>
      )}
      {isEditMode && (
        <div
          aria-hidden="true"
          style={{
            bottom: 0,
            left: 0,
            position: "fixed",
            right: 0,
            top: "calc(100vh - 62px - env(safe-area-inset-bottom))",
            zIndex: 1090,
          }}
        />
      )}
      {isEditMode && (
        <div
          style={{
            alignItems: "center",
            background: "var(--surface)",
            borderTop: "1px solid var(--border)",
            bottom: "calc(62px + env(safe-area-inset-bottom))",
            boxShadow: "0 -8px 20px rgba(0,0,0,.08)",
            boxSizing: "border-box",
            display: "flex",
            gap: "10px",
            justifyContent: "space-between",
            left: 0,
            padding: "10px 16px",
            position: "fixed",
            right: 0,
            zIndex: 1100,
          }}
        >
          <button
            onClick={cancelEditMode}
            style={{
              alignItems: "center",
              background: "var(--danger-bg)",
              border: "1px solid var(--danger-text)",
              borderRadius: "999px",
              color: "var(--danger-text)",
              display: "inline-flex",
              fontWeight: "bold",
              gap: "8px",
              justifyContent: "center",
              minHeight: "46px",
              minWidth: "132px",
              padding: "10px 18px",
            }}
          >
            Cancel <X size={20} strokeWidth={2.6} />
          </button>
          <button
            onClick={commitEditMode}
            style={{
              alignItems: "center",
              background: "var(--success-bg)",
              border: "1px solid var(--success-text)",
              borderRadius: "999px",
              color: "var(--success-text)",
              display: "inline-flex",
              fontWeight: "bold",
              gap: "8px",
              justifyContent: "center",
              minHeight: "46px",
              minWidth: "132px",
              padding: "10px 18px",
            }}
          >
            OK <Check size={20} strokeWidth={2.8} />
          </button>
        </div>
      )}
      {editingExercise && (
        <div
          onClick={() => {
            setEditingExercise(null);
            setEditingExerciseDraft(null);
            setEditingPrescriptionField(null);
          }}
          style={{
            alignItems: "center",
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            inset: 0,
            justifyContent: "center",
            padding: "16px",
            position: "fixed",
            zIndex: 1000,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              background: "var(--surface-raised)",
              borderRadius: "10px",
              boxSizing: "border-box",
              maxWidth: "420px",
              padding: "18px",
              width: "100%",
            }}
          >
            <h3
              style={{
                fontSize: "18px",
                lineHeight: 1.15,
                margin: "0 0 4px",
              }}
            >
              {editingExercise.name}
            </h3>

            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "13px",
                marginBottom: "14px",
              }}
            >
              {getWorkoutPrescriptionSummary(editingExerciseDraft)}
            </div>

            <div
              style={{
                display: "grid",
                gap: "8px",
              }}
            >
	              <div
	                style={{
	                  color: "var(--text-muted)",
	                  display: "grid",
	                  fontSize: "12px",
	                  fontWeight: "bold",
	                  gap: "8px",
	                  gridTemplateColumns: "0.8fr 0.9fr 1fr 1fr 0.8fr 1.2fr",
	                  textTransform: "uppercase",
	                }}
	              >
	                <span>Sets</span>
	                <span>Drops</span>
	                <span>Min</span>
	                <span>Max</span>
	                <span>RIR</span>
	                <span>Rest</span>
	              </div>

	              <div
	                style={{
	                  display: "grid",
	                  gap: "8px",
	                  gridTemplateColumns: "0.8fr 0.9fr 1fr 1fr 0.8fr 1.2fr",
	                }}
	              >
	                {[
	                  ["sets", getPrescriptionPickerValue("sets")],
	                  ["dropSets", getPrescriptionPickerValue("dropSets")],
	                  ["minimumReps", getPrescriptionPickerValue("minimumReps") || "—"],
	                  ["reps", getPrescriptionPickerValue("reps") || "—"],
	                  ["rir", getPrescriptionPickerValue("rir") || "—"],
	                  [
	                    "restSeconds",
	                    formatRestDuration(
	                      getPrescriptionPickerValue("restSeconds")
	                    ) || "—",
	                  ],
	                ].map(([field, value]) => (
	                  <button
	                    key={field}
	                    onClick={() => setEditingPrescriptionField(field)}
	                    style={{
                      minHeight: "42px",
                      padding: "8px",
                      textAlign: "center",
                    }}
                    type="button"
                  >
	                    {value}
	                  </button>
	                ))}
	              </div>
            </div>

            {editingPrescriptionField && (
              <WeightPickerModal
	                isOpen={Boolean(editingPrescriptionField)}
	                onClose={() => setEditingPrescriptionField(null)}
	                value={getPrescriptionPickerValue(editingPrescriptionField)}
	                increment={editingPrescriptionField === "rir" ? 0.5 : 1}
	                optionLabel={
	                  editingPrescriptionField === "restSeconds"
	                    ? formatRestDuration
	                    : undefined
	                }
	                restDurationInput={editingPrescriptionField === "restSeconds"}
	                title={`Select ${
	                  editingPrescriptionField === "sets"
	                    ? "Sets"
	                    : editingPrescriptionField === "dropSets"
	                      ? "Drop Sets"
	                    : editingPrescriptionField === "minimumReps"
	                      ? "Minimum Reps"
	                      : editingPrescriptionField === "reps"
	                        ? "Maximum Reps"
	                      : editingPrescriptionField === "restSeconds"
	                        ? "Rest"
	                        : "RIR"
	                }`}
	                values={
	                  editingPrescriptionField === "sets"
	                    ? Array.from({ length: 10 }, (_, index) => index + 1)
	                    : editingPrescriptionField === "dropSets"
	                      ? [0, 1, 2, 3]
	                    : editingPrescriptionField === "reps" ||
	                        editingPrescriptionField === "minimumReps"
	                      ? Array.from({ length: 30 }, (_, index) => index + 1)
	                      : editingPrescriptionField === "restSeconds"
	                        ? REST_DURATION_PICKER_VALUES
	                        : Array.from({ length: 13 }, (_, index) => index * 0.5)
	                }
                onSelect={(value) => {
                  updateEditingPrescription(editingPrescriptionField, value);
                }}
              />
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "12px",
              }}
            >
              <button
                onClick={() => {
                  setEditingExercise(null);
                  setEditingExerciseDraft(null);
                  setEditingPrescriptionField(null);
                }}
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  gap: "6px",
                }}
              >
                <X size={16} /> Cancel
              </button>

              <button
                onClick={() => {
                  if (hasPrescriptionChanged(editingExercise, editingExerciseDraft)) {
                    updateCurrentTemplate((currentTemplate) => ({
                      ...currentTemplate,

                      exercises: currentTemplate.exercises.map((ex) =>
                        ex.id === editingExercise.id
                          ? applyCurrentInstancePrescription(
                              ex,
                              editingExerciseDraft,
                              getCurrentInstancePrescriptionChanges(
                                editingExercise,
                                editingExerciseDraft
                              )
                            )
                          : ex
                      ),
                    }));
                  }

                  setEditingExercise(null);
                  setEditingExerciseDraft(null);
                  setEditingPrescriptionField(null);
                }}
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  gap: "6px",
                }}
              >
                <Save size={16} /> Save
              </button>
            </div>
          </div>
        </div>
      )}
      {detailExercise && (
        <ExerciseDetailDialog
          bodyWeightEntries={bodyWeightEntries}
          exercise={detailExercise}
          exerciseLibrary={exerciseLibrary}
          history={history}
          onClose={() => setDetailExercise(null)}
          onEdit={
            !detailExercise.builtin || canEditBuiltInExercises
              ? (exercise) => {
                  const exerciseKey = getExerciseKey(exercise);
                  const libraryExercise = exerciseLibrary.find(
                    (item) =>
                      String(item.id) === String(exercise.id) ||
                      String(item.exerciseId || "") === String(exercise.id) ||
                      getExerciseKey(item) === exerciseKey
                  );

                  if (libraryExercise) {
                    setLibraryEditingExercise(libraryExercise);
                  }
                }
              : undefined
          }
        />
      )}
      {libraryEditingExercise && (
        <ExerciseLibraryEditDialog
          canEditBuiltIn={canEditBuiltInExercises}
          exercise={libraryEditingExercise}
          exerciseLibrary={exerciseLibrary}
          onCancel={() => setLibraryEditingExercise(null)}
          onSaved={(savedExercise) => {
            setDetailExercise(savedExercise);
            setLibraryEditingExercise(null);
          }}
          session={session}
          setExerciseLibrary={setExerciseLibrary}
        />
      )}
      {showTemplateMuscleMap && (
        <TemplateMuscleMapSheet
          template={previewTemplate}
          onClose={() => setShowTemplateMuscleMap(false)}
        />
      )}
      {confirmPreviousWeekIncomplete && (
        <div
          aria-label="Previous week incomplete"
          aria-modal="true"
          onClick={() => setConfirmPreviousWeekIncomplete(false)}
          role="dialog"
          style={{
            alignItems: "center",
            background: "rgba(0,0,0,.45)",
            display: "flex",
            inset: 0,
            justifyContent: "center",
            padding: "16px",
            position: "fixed",
            zIndex: 1500,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              boxShadow: "0 8px 28px rgba(0,0,0,.22)",
              boxSizing: "border-box",
              display: "grid",
              gap: "12px",
              maxWidth: "360px",
              padding: "16px",
              width: "100%",
            }}
          >
            <div
              style={{
                color: "var(--text-h)",
                fontSize: "15px",
                lineHeight: 1.35,
              }}
            >
              Not all workouts from the previous week are complete. Do you want
              to continue?
            </div>
            <div
              style={{
                display: "grid",
                gap: "8px",
                gridTemplateColumns: "1fr 1fr",
              }}
            >
              <button
                onClick={() => setConfirmPreviousWeekIncomplete(false)}
                type="button"
              >
                No
              </button>
              <button
                onClick={() => {
                  setConfirmPreviousWeekIncomplete(false);
                  beginStartWorkout(linkedPlan);
                }}
                type="button"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
