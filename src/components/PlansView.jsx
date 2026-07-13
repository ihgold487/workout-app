import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  ClipboardList,
  GripVertical,
  Link2,
  RefreshCw,
  Replace,
  Save,
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

function PlanDayButton({ active, count, label, onClick, workoutKey }) {
  const {
    attributes,
    listeners,
    setNodeRef: setSortableNodeRef,
    transform,
    transition,
  } = useSortable({
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

  return (
    <button
      ref={setRefs}
      aria-pressed={active}
      {...attributes}
      {...listeners}
      onClick={onClick}
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
        display: "inline-flex",
        flex: "1 1 0",
        fontSize: "13px",
        fontWeight: active ? "bold" : "normal",
        justifyContent: "center",
        minHeight: "38px",
        minWidth: 0,
        padding: highlighted ? "5px 7px" : "6px 8px",
        touchAction: "none",
        userSelect: "none",
        ...sortableStyle,
      }}
    >
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
  const tbdWeightExercises = exercises.filter(
    (exercise) => !exercise.sets[0]?.targetWeight
  );

  return {
    muscleSets: Object.entries(muscleSets).sort((a, b) =>
      a[0].localeCompare(b[0])
    ),
    tbdWeightExercises,
    totalSets,
  };
}

function WorkoutSummarySheet({ onClose, selectedWorkout, workouts }) {
  const [summaryScope, setSummaryScope] = useState("workout");
  const displayedWorkouts =
    summaryScope === "plan" ? workouts : [selectedWorkout];
  const summary = getWorkoutSummary(displayedWorkouts);
  const title =
    summaryScope === "plan" ? "Combined Plan" : selectedWorkout.name;

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

        {summary.tbdWeightExercises.length > 0 && (
          <div
            style={{
              background: "var(--surface-muted)",
              borderRadius: "8px",
              color: "var(--text-muted)",
              fontSize: "13px",
              marginTop: "14px",
              padding: "10px",
            }}
          >
            Weight TBD:{" "}
            {summary.tbdWeightExercises
              .map((exercise) => exercise.name)
              .join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}

function getDefaultSavedWorkoutName(workout, workoutIndex, planType) {
  return `${getCompactPlanTypeLabel(planType)} W${workoutIndex + 1}`;
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

function PlanWorkoutPreview({
  exerciseLibrary,
  onEditSuperset,
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
        </div>
      </PlanWorkoutDropZone>
    </section>
  );
}

function getPlanTypeLabel(planType) {
  return planType === "type-1" ? "Plan Type 1" : "Plan Type 2";
}

function getCompactPlanTypeLabel(planType) {
  return planType === "type-1" ? "P1" : "P2";
}

function PlanPickerButton({ disabled = false, label, onClick, value }) {
  return (
    <label
      style={{
        display: "grid",
        gap: "4px",
      }}
    >
      {label}
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

export default function PlansView({
  exerciseLibrary,
  exerciseMetadata,
  history,
  onSave,
  plans,
  setPlans,
  setTemplates,
  templates,
}) {
  const [durationWeeks, setDurationWeeks] = useState("4");
  const [daysPerWeek, setDaysPerWeek] = useState("2");
  const [generationMode, setGenerationMode] = useState("plan");
  const [goal, setGoal] = useState("maintain");
  const [planType, setPlanType] = useState("type-2");
  const [workoutType, setWorkoutType] = useState("type-2");
  const [planName, setPlanName] = useState(() =>
    getDefaultPlanName("type-2", "2", "4")
  );
  const [workoutName, setWorkoutName] = useState(() =>
    getDefaultWorkoutName("type-2")
  );
  const [isPlanNameCustom, setIsPlanNameCustom] = useState(false);
  const [reps, setReps] = useState("10");
  const [rir, setRir] = useState("2");
  const [seed, setSeed] = useState(0);
  const [saveStatus, setSaveStatus] = useState("");
  const [replacementBySlot, setReplacementBySlot] = useState({});
  const [workoutNameBySlot, setWorkoutNameBySlot] = useState({});
  const [pickerTarget, setPickerTarget] = useState(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerMuscle, setPickerMuscle] = useState("");
  const [summaryWorkout, setSummaryWorkout] = useState(null);
  const [detailExercise, setDetailExercise] = useState(null);
  const [activeValuePicker, setActiveValuePicker] = useState(null);
  const [activeWorkoutIndex, setActiveWorkoutIndex] = useState(0);
  const [exerciseLayoutByWorkout, setExerciseLayoutByWorkout] = useState(null);
  const [supersetGroupBySlot, setSupersetGroupBySlot] = useState({});
  const [dayOrder, setDayOrder] = useState(null);
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

  const generatedPlan = useMemo(
    () =>
      generatePlanWorkouts({
        daysPerWeek,
        durationWeeks,
        exerciseLibrary: generatorExerciseLibrary,
        exerciseMetadata,
        generationMode,
        goal,
        history,
        planType,
        reps,
        rir,
        seed,
        workoutType,
      }),
    [
      daysPerWeek,
      durationWeeks,
      generatorExerciseLibrary,
      exerciseMetadata,
      generationMode,
      goal,
      history,
      planType,
      reps,
      rir,
      seed,
      workoutType,
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
              ? createPlanExercise({
                  exercise: replacementExercise,
                  goal,
                  history,
                  planMuscle: exercise.planMuscle,
                  reps,
                  rir,
                  setCount: exercise.sets.length,
                  supersetGroup,
                })
              : {
                  ...exercise,
                  supersetGroup,
                };

            return {
              ...previewExercise,
              previewSlotKey: slotKey,
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
      reps,
      rir,
      workoutNameBySlot,
      generationMode,
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

  function resetPlanPreviewEdits() {
    setActiveWorkoutIndex(0);
    setExerciseLayoutByWorkout(null);
    setReplacementBySlot({});
    setSupersetGroupBySlot({});
    setDayOrder(null);
  }

  async function saveGeneratedPlan() {
    const isWorkoutMode = generationMode === "workout";
    const savedAt = Date.now();
    const planId = savedAt;
    const workouts = orderedPreviewWorkouts.map((workout, workoutIndex) => {
      const savedWorkout = { ...workout };

      delete savedWorkout.previewWorkoutKey;

      const templateId = savedAt + workoutIndex + 1;
      const planWorkoutId = `${planId}:workout-${workoutIndex + 1}`;

      return {
        ...savedWorkout,
        id: templateId,
        name: workout.name,
        dayNumber: workoutIndex + 1,
        planId: isWorkoutMode ? null : planId,
        planWorkoutId: isWorkoutMode ? null : planWorkoutId,
        exercises: workout.exercises.map((exercise, exerciseIndex) => {
          const savedExercise = { ...exercise };

          delete savedExercise.previewSlotKey;
          delete savedExercise.previewWorkoutKey;

          return {
            ...savedExercise,
            id: savedAt + workoutIndex * 100 + exerciseIndex,
            sets: exercise.sets.map((set, setIndex) => ({
              ...set,
              id: savedAt + workoutIndex * 1000 + exerciseIndex * 100 + setIndex,
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

        const { error } = await supabase.rpc("create_trainer_workout_for_user", {
          target_user_id: selectedTrainerUserId,
          workout_payload: workouts[0],
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
      id: planId,
      name:
        planName.trim() ||
        getDefaultPlanName(planType, daysPerWeek, durationWeeks),
      planType,
      goal,
      daysPerWeek: Number(daysPerWeek),
      durationWeeks: Number(durationWeeks),
      currentWeek: 1,
      status: "inactive",
      createdAt: new Date().toISOString(),
      completions: [],
      config: {
        reps,
        rir,
      },
      workouts: workouts.map((workout) => ({
        dayNumber: workout.dayNumber,
        name: workout.name,
        planWorkoutId: workout.planWorkoutId,
        templateId: workout.id,
      })),
    };

    if (!isTrainerTargetSelf) {
      setSaveStatus("Saving plan for selected user...");

      const { error } = await supabase.rpc("create_trainer_plan_for_user", {
        target_user_id: selectedTrainerUserId,
        plan_payload: plan,
        workouts_payload: workouts,
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

      {trainerUsers.length > 1 && (
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
              resetPlanPreviewEdits();
              setWorkoutNameBySlot({});
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
        <h2
          style={{
            fontSize: "18px",
            margin: 0,
          }}
        >
          {generationMode === "workout"
            ? getWorkoutTypeLabel(workoutType)
            : getPlanTypeLabel(planType)}
        </h2>

        <label
          style={{
            display: "grid",
            gap: "4px",
          }}
        >
          {generationMode === "workout" ? "Workout name" : "Plan name"}
          <input
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
        </label>

        <div
          style={{
            display: "flex",
            gap: "8px",
          }}
        >
          <button
            onClick={() => {
              setSeed((value) => value + 1);
              resetPlanPreviewEdits();
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

          <button
            onClick={saveGeneratedPlan}
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
        <label
          style={{
            display: "grid",
            gap: "4px",
          }}
        >
          Create
          <select
            value={generationMode}
            onChange={(event) => {
              const nextMode = event.target.value;

              setGenerationMode(nextMode);
              resetPlanPreviewEdits();
              setWorkoutNameBySlot({});
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

        {generationMode === "plan" ? (
          <label
            style={{
              display: "grid",
              gap: "4px",
            }}
          >
            Plan type
            <select
              value={planType}
              onChange={(event) => {
                setPlanType(event.target.value);
                if (!isPlanNameCustom) {
                  setPlanName(
                    getDefaultPlanName(
                      event.target.value,
                      daysPerWeek,
                      durationWeeks
                    )
                  );
                }
                resetPlanPreviewEdits();
                setWorkoutNameBySlot({});
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
            </select>
          </label>
        ) : (
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
                resetPlanPreviewEdits();
                setWorkoutNameBySlot({});
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

        <label
          style={{
            display: "grid",
            gap: "4px",
          }}
        >
          Goal
          <select
            value={goal}
            onChange={(event) => {
              setGoal(event.target.value);
              resetPlanPreviewEdits();
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

        {generationMode === "plan" && (
          <>
            <PlanPickerButton
              label="Days per week"
              value={`${daysPerWeek} ${daysPerWeek === "1" ? "day" : "days"}`}
              onClick={() => setActiveValuePicker("days")}
            />

            <PlanPickerButton
              label="Duration in weeks"
              value={durationWeeks}
              onClick={() => setActiveValuePicker("duration")}
            />
          </>
        )}

        <PlanPickerButton
          label="Reps"
          value={reps}
          onClick={() => setActiveValuePicker("reps")}
        />

        <PlanPickerButton
          label="RIR"
          value={rir}
          onClick={() => setActiveValuePicker("rir")}
        />

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
              setDayOrder(arrayMove(orderedWorkoutKeys, oldIndex, newIndex));
              setSaveStatus("");
            }

            return;
          }

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
                workoutKey={workout.previewWorkoutKey}
                onClick={() => {
                  setActiveWorkoutIndex(workout.previewWorkoutKey);
                  setSaveStatus("");
                }}
              />
            ))}
          </SortableContext>
        </div>

        <SortableContext
          items={allPreviewSlotKeys}
          strategy={verticalListSortingStrategy}
        >
          {displayedWorkout && (
            <PlanWorkoutPreview
              key={displayedWorkout.previewWorkoutKey}
              exerciseLibrary={exerciseLibrary}
              workout={displayedWorkout}
              onEditSuperset={(exercise) => {
                const group = prompt(
                  "Superset group (A, B, etc). Leave empty to clear.",
                  exercise.supersetGroup || ""
                );

                if (group === null) {
                  return;
                }

                setSupersetGroupBySlot((currentGroups) => ({
                  ...currentGroups,
                  [exercise.previewSlotKey]: group.trim() || null,
                }));
                setSaveStatus("");
              }}
              onRenameWorkout={(renamedWorkout, name) => {
                setWorkoutNameBySlot({
                  ...workoutNameBySlot,
                  [renamedWorkout.previewWorkoutKey]: name,
                });
                if (generationMode === "workout") {
                  setWorkoutName(name);
                }
                setSaveStatus("");
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

      {pickerTarget && (
        <ExercisePickerSheet
          title={`Replace ${getEffectivePrimaryMuscle(pickerTarget) || "exercise"}`}
          exerciseLibrary={generatorExerciseLibrary}
          history={history}
          search={pickerSearch}
          selectedMuscle={pickerMuscle}
          setSearch={setPickerSearch}
          setSelectedMuscle={setPickerMuscle}
          onClose={() => setPickerTarget(null)}
          onSelect={(exercise) => {
            setReplacementBySlot({
              ...replacementBySlot,
              [pickerTarget.previewSlotKey]: exercise,
            });
            setPickerTarget(null);
            setSaveStatus("");
          }}
        />
      )}

      {detailExercise && (
        <ExerciseDetailDialog
          exercise={detailExercise}
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
          resetPlanPreviewEdits();
          setWorkoutNameBySlot({});
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
          resetPlanPreviewEdits();
          setWorkoutNameBySlot({});
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
          resetPlanPreviewEdits();
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
          resetPlanPreviewEdits();
          setSaveStatus("");
        }}
      />
    </div>
  );
}
