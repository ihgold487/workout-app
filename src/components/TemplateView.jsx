import { useState } from "react";
import {
  BarChart3,
  Check,
  GripVertical,
  Link2,
  NotebookPen,
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
import MuscleMap from "./MuscleMap";
import {
  WorkoutExercisePreviewGroup,
  WorkoutExercisePreviewRow,
} from "./WorkoutExercisePreviewList";
import WeightPickerModal from "./WeightPickerModal";
import { calculateE1RM, getLatestBodyWeightForDate } from "../utils/e1rm";
import { getGroupedPreviewExercises } from "../utils/previewExercises";
import { getRirForPlanWeek } from "../utils/rirPeriodization";
import { recommendSetTarget } from "../utils/targetRecommendation";
import { getExerciseWeightIncrement } from "../utils/weightIncrement";

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
    <div ref={setNodeRef} style={style}>
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
  template,
  templates,
  setTemplates,
  bodyWeightEntries = [],
  exerciseLibrary,
  exerciseMetadata,
  setExerciseMetadata,
  history,
  plans = [],
  planWeekOverride = null,
  sessions,
  setSessions,
  setSelectedSessionId,
  onEditModeChange,
}) {
  const [search, setSearch] = useState("");

  const [selectedMuscle, setSelectedMuscle] = useState("");

  const [showAdd, setShowAdd] = useState(false);

  const [pendingExercise, setPendingExercise] = useState(null);
  const [replacingExercise, setReplacingExercise] = useState(null);

  const [newExerciseValues, setNewExerciseValues] = useState({
    weight: "",
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
  const [showTemplateMuscleMap, setShowTemplateMuscleMap] = useState(false);
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
  const linkedPlan = plans.find((item) => item.id === template.planId);
  const currentPlanWeek = Number(planWeekOverride) || linkedPlan?.currentWeek || 1;
  const planWorkoutCompleteThisWeek = Boolean(
    linkedPlan?.completions?.some(
      (completion) =>
        Number(completion.weekNumber) === Number(currentPlanWeek) &&
        completion.planWorkoutId === template.planWorkoutId
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
    const muscles = Array.isArray(templateExercise.muscles)
      ? templateExercise.muscles
      : Array.isArray(libraryExercise?.muscles)
        ? libraryExercise.muscles
        : [templateExercise.planMuscle].filter(Boolean);

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
    };
  }

  function getGoalMode(plan) {
    return plan?.goal === "progress" ? "progress" : "maintenance";
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
    const targetSetCount = Math.max(
      1,
      Number(weekPrescription?.sets) || sourceSets.length || 1
    );

    return Array.from({ length: targetSetCount }, (_, index) => {
      const sourceSet = sourceSets[index] || sourceSets.at(-1) || {};

      return {
        ...sourceSet,
        id: sourceSets[index]?.id || Date.now() + Math.random() + index,
      };
    });
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

  function updateCurrentTemplate(updater, { requireEdit = true } = {}) {
    if (requireEdit) {
      enterEditMode();
    }

    setTemplates((currentTemplates) =>
      currentTemplates.map((currentTemplate) =>
        currentTemplate.id === template.id
          ? updater(currentTemplate)
          : currentTemplate
      )
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
        currentTemplates.map((currentTemplate) =>
          currentTemplate.id === template.id
            ? {
                ...currentTemplate,
                exercises: structuredClone(editSnapshot.exercises || []),
              }
            : currentTemplate
        )
      );
    }

    setShowAdd(false);
    setSearch("");
    setPendingExercise(null);
    setNewExerciseValues({
      weight: "",
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

  function getWorkoutPrescriptionSummary(exercise) {
    const setCount = exercise?.sets?.length || 0;
    const reps = formatRange(
      (exercise?.sets || []).map((set) => firstPresentValue(set.targetReps, set.reps))
    );
    const rir = formatRange(
      (exercise?.sets || []).map((set) => firstPresentValue(set.targetRir, set.rir))
    );
    const setLabel = setCount === 1 ? "set" : "sets";

    return `${setCount} ${setLabel} | ${reps || "—"} reps | ${rir || "—"} RIR`;
  }

  function getPrescriptionSignature(exercise) {
    return (exercise?.sets || [])
      .map((set) =>
        [
          firstPresentValue(set.targetReps, set.reps),
          firstPresentValue(set.targetRir, set.rir),
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

  function getLatestHistoryExercise(templateExercise) {
    const workout = history.find((historyWorkout) =>
      historyWorkout.exercises?.some((historyExercise) => {
        if (templateExercise.exerciseId && historyExercise.exerciseId) {
          return (
            String(templateExercise.exerciseId) ===
            String(historyExercise.exerciseId)
          );
        }

        return getExerciseKey(templateExercise) === getExerciseKey(historyExercise);
      })
    );

    return workout?.exercises?.find((historyExercise) => {
      if (templateExercise.exerciseId && historyExercise.exerciseId) {
        return (
          String(templateExercise.exerciseId) ===
          String(historyExercise.exerciseId)
        );
      }

      return getExerciseKey(templateExercise) === getExerciseKey(historyExercise);
    });
  }

  function getActualDefaultsForSet(templateExercise, setIndex, targetSet) {
    const historySet = getLatestHistoryExercise(templateExercise)?.sets?.[setIndex];

    if (historySet) {
      return {
        actualReps: formatTargetValue(
          firstPresentValue(historySet.actualReps, historySet.targetReps)
        ),
        actualRir: formatTargetValue(
          firstPresentValue(historySet.actualRir, historySet.targetRir)
        ),
        actualWeight: formatTargetValue(
          firstPresentValue(historySet.actualWeight, historySet.targetWeight)
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
    set,
    setIndex,
    weekPrescription,
  }) {
    const targetReps =
      weekPrescription?.reps ?? set.targetReps ?? set.reps ?? plan?.config?.reps ?? "";
    const targetRir =
      weekPrescription?.rir ??
      getPlanWeekRir(
        plan,
        currentPlanWeek,
        set.targetRir ?? set.rir ?? plan?.config?.rir ?? ""
      );
    const recommendationExercise = {
      ...(libraryExercise || {}),
      ...exercise,
      id: exercise.exerciseId || libraryExercise?.id || exercise.id,
      exerciseId: exercise.exerciseId || libraryExercise?.id || exercise.id,
    };
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
      weightIncrement: getExerciseWeightIncrement(recommendationExercise),
    });

    return recommendation.result?.recommendation || null;
  }

  function getEffectivePlanExercise(exercise, plan) {
    const libraryExercise = exerciseLibrary.find(
      (ex) => ex.id === exercise.exerciseId
    );
    const weekPrescription = getExerciseWeekPrescription(
      exercise,
      plan,
      currentPlanWeek
    );

    return {
      ...exercise,
      sets: getExerciseSetsForPlanWeek(exercise, weekPrescription).map(
        (set, setIndex) => {
          const dynamicTarget = getDynamicTargetPrescription({
            exercise,
            libraryExercise,
            plan,
            set,
            setIndex,
            weekPrescription,
          });

          return {
            ...set,
            targetWeight: formatTargetValue(
              dynamicTarget?.weight,
              set.targetWeight || ""
            ),
            targetReps: formatTargetValue(
              dynamicTarget?.reps,
              weekPrescription?.reps ??
                set.targetReps ??
                set.reps ??
                plan?.config?.reps ??
                ""
            ),
            targetRir: formatTargetValue(
              dynamicTarget?.rir,
              weekPrescription?.rir ??
                getPlanWeekRir(
                  plan,
                  currentPlanWeek,
                  set.targetRir ?? set.rir ?? plan?.config?.rir ?? ""
                )
            ),
          };
        }
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

  function startWorkout() {
    if (!canStartWorkout) {
      return;
    }

    const plan = plans.find((item) => item.id === template.planId);
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

        return {
          ...exercise,

          note: libraryExercise?.note || "",

          sets: getExerciseSetsForPlanWeek(
            exercise,
            getExerciseWeekPrescription(exercise, plan, currentPlanWeek)
          ).map((set, setIndex) => {
            const weekPrescription = getExerciseWeekPrescription(
              exercise,
              plan,
              currentPlanWeek
            );
            const dynamicTarget = getDynamicTargetPrescription({
              exercise,
              libraryExercise,
              plan,
              set,
              setIndex,
              weekPrescription,
            });

            const targetSet = {
              ...set,
              targetWeight: formatTargetValue(
                dynamicTarget?.weight,
                set.targetWeight || ""
              ),

              targetReps: formatTargetValue(
                dynamicTarget?.reps,
                weekPrescription?.reps ?? set.targetReps ?? set.reps ?? plan?.config?.reps ?? ""
              ),

              targetRir: formatTargetValue(
                dynamicTarget?.rir,
                weekPrescription?.rir ??
                  getPlanWeekRir(
                    plan,
                    currentPlanWeek,
                    set.targetRir ?? set.rir ?? plan?.config?.rir ?? ""
                  )
              ),
            };
            const actualDefaults = getActualDefaultsForSet(
              exercise,
              setIndex,
              targetSet
            );

            return {
              ...targetSet,
              ...actualDefaults,
            };
          }),
        };
      }),
    };

    setSessions([...sessions, session]);

    setSelectedSessionId(session.id);
  }

  function addExercise(exercise) {
    enterEditMode();

    const weight = newExerciseValues.weight;

    const reps = newExerciseValues.reps;

    const numSets = Number(newExerciseValues.sets);

    const rir = newExerciseValues.rir;

    const sets = Array.from(
      {
        length: numSets,
      },

      () => ({
        id: Date.now() + Math.random(),

        targetWeight: weight,

        targetReps: reps,

        targetRir: rir,
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
      return String(editingExerciseDraft.sets?.length || 1);
    }

    const firstSet = editingExerciseDraft.sets?.[0] || {};

    if (field === "reps") {
      return firstPresentValue(firstSet.targetReps, firstSet.reps);
    }

    if (field === "rir") {
      return firstPresentValue(firstSet.targetRir, firstSet.rir);
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
      const currentSets = updated.sets || [];
      const templateSet = currentSets.at(-1) || {
        targetReps: "",
        targetRir: "",
        targetWeight: "",
      };

      updated.sets = Array.from({ length: nextSetCount }, (_, index) => {
        const existingSet = currentSets[index];

        return existingSet
          ? existingSet
          : {
              id: Date.now() + Math.random() + index,
              targetReps: templateSet.targetReps || "",
              targetRir: templateSet.targetRir || "",
              targetWeight: templateSet.targetWeight || "",
            };
      });
    }

    if (field === "reps") {
      updated.sets = (updated.sets || []).map((set) => ({
        ...set,
        targetReps: String(value),
      }));
    }

    if (field === "rir") {
      updated.sets = (updated.sets || []).map((set) => ({
        ...set,
        targetRir: String(value),
      }));
    }

    setEditingExerciseDraft(updated);
    setEditingPrescriptionField(null);
  }

  return (
    <div
      style={{
        padding: isEditMode ? "20px 20px 150px" : "20px",
      }}
    >
      <div
        style={{
          alignItems: "start",
          display: "grid",
          gap: "8px",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          marginBottom: "20px",
        }}
      >
        <button
          aria-label={`Edit workout name: ${template.name}`}
          onClick={() => {
            setTemplateNameDraft(template.name);
            setEditingTemplateName(true);
          }}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-h)",
            display: "block",
            fontSize: "2rem",
            fontWeight: "bold",
            lineHeight: 1.15,
            minWidth: 0,
            overflow: "hidden",
            padding: 0,
            textAlign: "left",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            width: "100%",
          }}
        >
          {template.name}
        </button>

        <IconButton
          label={`${template.name} muscle map`}
          onClick={() => setShowTemplateMuscleMap(true)}
          size={38}
        >
          <BarChart3 size={18} />
        </IconButton>
      </div>
      <div
        style={{
          display: "flex",
          gap: "8px",
          justifyContent: "space-between",
          marginBottom: "10px",
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: "8px",
          }}
        >
          {!isEditMode && (
            <button
              disabled={!canStartWorkout}
              onClick={startWorkout}
              style={{
                alignItems: "center",
                display: "inline-flex",
                gap: "6px",
              }}
            >
              <Play size={16} /> Start
            </button>
          )}
          <button
            onClick={() => {
              if (!isEditMode) {
                enterEditMode();
                return;
              }

              setShowAdd(true);
            }}
            style={{
              alignItems: "center",
              display: "inline-flex",
              gap: "6px",
            }}
          >
            {isEditMode ? (
              <>
                <Plus size={16} /> Add Exercise
              </>
            ) : (
              <>
                <Pencil size={16} /> Edit
              </>
            )}
          </button>
        </div>

        {isPlanWorkout && !isEditMode && (
          <button
            disabled={addedToWorkouts}
            onClick={addPlanWorkoutToWorkouts}
            style={{
              alignItems: "center",
              display: "inline-flex",
              gap: "6px",
            }}
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
      {!isEditMode && startDisabledReason && (
        <div
          style={{
            color: "var(--text-muted)",
            fontSize: "12px",
            marginBottom: "10px",
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
                  ? {
                      ...templateExercise,
                      equipment: exercise.equipment,
                      exerciseId: exercise.id,
                      imageAlt: exercise.imageAlt || "",
                      imageUrl: exercise.imageUrl || "",
                      muscles: exercise.muscles,
                      name: exercise.name,
                    }
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
      <hr />
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
                  const exerciseDetail = getExerciseDetailRecord(exercise);
                  const note = exerciseMetadata?.[exercise.exerciseId]?.note;

                  return (
                    <SortableExerciseRow key={exercise.id} exercise={exercise}>
                      {({ attributes, listeners }) => (
                        <WorkoutExercisePreviewRow
                          exercise={exercise}
                          exerciseDetail={exerciseDetail}
                          note={note}
                          onExerciseClick={() => setDetailExercise(exerciseDetail)}
                          onClearNote={
                            note
                              ? () => {
                                  const updated = {
                                    ...exerciseMetadata,
                                  };

                                  delete updated[exercise.exerciseId];

                                  setExerciseMetadata(updated);
                                }
                              : null
                          }
                          onSetClick={() => {
                            setEditingExercise(templateExercise);

                            setEditingExerciseDraft(structuredClone(templateExercise));
                          }}
                          onPrescriptionClick={() => {
                            setEditingExercise(templateExercise);
                            setEditingExerciseDraft(structuredClone(templateExercise));
                          }}
                          prescriptionSummary={getWorkoutPrescriptionSummary(
                            templateExercise
                          )}
                          leadingControl={
                            <IconButton
                              label="Exercise note"
                              size={32}
                              onClick={() => {
                                const nextNote = prompt(
                                  "Exercise note",
                                  exerciseMetadata[exercise.exerciseId]?.note || ""
                                );

                                if (nextNote === null) return;

                                setExerciseMetadata({
                                  ...exerciseMetadata,

                                  [exercise.exerciseId]: {
                                    ...(exerciseMetadata[exercise.exerciseId] || {}),

                                    note: nextNote,
                                  },
                                });
                              }}
                            >
                              <NotebookPen size={16} />
                            </IconButton>
                          }
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
                                  setReplacingExercise(exercise);
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
                  gridTemplateColumns: "1fr 1fr 1fr",
                  textTransform: "uppercase",
                }}
              >
                <span>Sets</span>
                <span>Reps</span>
                <span>RIR</span>
              </div>

              <div
                style={{
                  display: "grid",
                  gap: "8px",
                  gridTemplateColumns: "1fr 1fr 1fr",
                }}
              >
                {[
                  ["sets", editingExerciseDraft?.sets?.length || 1],
                  ["reps", getPrescriptionPickerValue("reps") || "—"],
                  ["rir", getPrescriptionPickerValue("rir") || "—"],
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
                title={`Select ${
                  editingPrescriptionField === "sets"
                    ? "Sets"
                    : editingPrescriptionField === "reps"
                      ? "Reps"
                      : "RIR"
                }`}
                values={
                  editingPrescriptionField === "sets"
                    ? Array.from({ length: 10 }, (_, index) => index + 1)
                    : editingPrescriptionField === "reps"
                      ? Array.from({ length: 30 }, (_, index) => index + 1)
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
                        ex.id === editingExercise.id ? editingExerciseDraft : ex
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
          history={history}
          onClose={() => setDetailExercise(null)}
        />
      )}
      {showTemplateMuscleMap && (
        <TemplateMuscleMapSheet
          template={previewTemplate}
          onClose={() => setShowTemplateMuscleMap(false)}
        />
      )}
    </div>
  );
}
