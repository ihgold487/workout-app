import { useState } from "react";
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Coffee,
  Dumbbell,
  Scale,
  Sun,
  Sunrise,
  Sunset,
  Utensils,
  X,
} from "lucide-react";
import BodyWeightSheet from "./BodyWeightSheet";
import ExerciseDetailDialog from "./ExerciseDetailDialog";
import ExerciseThumbnail from "./ExerciseThumbnail";
import WeightPickerModal from "./WeightPickerModal";
import {
  deleteBodyWeightEntry,
  upsertBodyWeightEntry,
} from "../sync/bodyMeasurementCloudSync";
import { isSupabaseConfigured } from "../sync/supabaseClient";
import { calculateE1RM, getLatestBodyWeightForDate } from "../utils/e1rm";

const BODY_WEIGHT_LOG_KEY = "bodyWeightLogEntries";
const BASE_MEAL_OPTIONS = [
  ["breakfast", "Breakfast"],
  ["lunch", "Lunch"],
  ["dinner", "Dinner"],
];
const DEFAULT_MEAL = "breakfast";
const DEFAULT_SNACK_MEAL = "snack-1";
const RIR_PICKER_VALUES = Array.from({ length: 13 }, (_, index) => index * 0.5);

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatMacro(value, unit = "g") {
  const parsed = Number(value) || 0;

  return unit === "cal" ? String(Math.round(parsed)) : `${Math.round(parsed)}${unit}`;
}

function totalFoods(foods) {
  return foods.reduce(
    (totals, food) => ({
      calories: totals.calories + (Number(food.calories) || 0),
      carbs: totals.carbs + (Number(food.carbs) || 0),
      fat: totals.fat + (Number(food.fat) || 0),
      protein: totals.protein + (Number(food.protein) || 0),
    }),
    {
      calories: 0,
      carbs: 0,
      fat: 0,
      protein: 0,
    }
  );
}

function normalizeMeal(value) {
  const normalized = String(value || "").toLowerCase().trim();
  const meal = normalized === "snack" ? DEFAULT_SNACK_MEAL : normalized;

  if (BASE_MEAL_OPTIONS.some(([option]) => option === meal)) {
    return meal;
  }

  if (/^snack-[1-9]\d*$/.test(meal)) {
    return meal;
  }

  return DEFAULT_MEAL;
}

function getSnackIndex(meal) {
  const match = normalizeMeal(meal).match(/^snack-(\d+)$/);

  return match ? Number(match[1]) : 0;
}

function getMealLabel(meal) {
  const normalized = normalizeMeal(meal);
  const baseLabel = BASE_MEAL_OPTIONS.find(([option]) => option === normalized)?.[1];
  const snackIndex = getSnackIndex(normalized);

  if (baseLabel) {
    return baseLabel;
  }

  return snackIndex === 1 ? "Snack" : `Snack ${snackIndex}`;
}

function getMealGroups(foods) {
  const snackIndexes = new Set();

  foods.forEach((food) => {
    const snackIndex = getSnackIndex(food.meal);

    if (snackIndex) {
      snackIndexes.add(snackIndex);
    }
  });

  const mealOptions = [
    ...BASE_MEAL_OPTIONS,
    ...[...snackIndexes]
      .sort((a, b) => a - b)
      .map((snackIndex) => [`snack-${snackIndex}`, getMealLabel(`snack-${snackIndex}`)]),
  ];

  return mealOptions
    .map(([meal, label]) => {
      const entries = foods.filter((food) => normalizeMeal(food.meal) === meal);

      return {
        entries,
        label,
        meal,
        totals: totalFoods(entries),
      };
    })
    .filter((group) => group.entries.length > 0);
}

function MealIcon({ meal, size = 16 }) {
  const normalizedMeal = normalizeMeal(meal);

  if (normalizedMeal === "breakfast") {
    return <Sunrise size={size} color="#d97706" />;
  }

  if (normalizedMeal === "lunch") {
    return <Sun size={size} color="#ca8a04" />;
  }

  if (normalizedMeal === "dinner") {
    return <Sunset size={size} color="#c2410c" />;
  }

  return <Coffee size={size} color="#7c3f18" />;
}

function firstPresentValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function parseMetricValue(value) {
  const parsed = Number.parseFloat(String(value ?? "").replace("+", ""));

  return Number.isFinite(parsed) ? parsed : null;
}

function formatMetricValue(value, decimals = 1) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return "-";
  }

  return parsed.toFixed(decimals);
}

function formatPercentIncrease(value, referenceValue) {
  if (!Number.isFinite(value) || !Number.isFinite(referenceValue) || referenceValue <= 0) {
    return null;
  }

  if (value <= referenceValue) {
    return null;
  }

  return `+${(((value - referenceValue) / referenceValue) * 100).toFixed(1)}%`;
}

function getWorkoutTime(workout) {
  const parsed = new Date(
    workout.completedAtIso || workout.completed_at || workout.completedAt || 0
  );

  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : 0;
}

function getExerciseMatchKey(exercise) {
  const id = firstPresentValue(exercise.exerciseId, exercise.exercise_id, exercise.id);

  if (id) {
    return `id:${id}`;
  }

  const equipment = Array.isArray(exercise.equipment)
    ? exercise.equipment.filter(Boolean).join(", ")
    : exercise.equipment || "";

  return `name:${String(exercise.name || "").toLowerCase()}|${String(
    equipment
  ).toLowerCase()}`;
}

function findExerciseForHistoryExercise(historyExercise, exerciseLibrary = []) {
  const exerciseId = firstPresentValue(
    historyExercise?.exerciseId,
    historyExercise?.exercise_id
  );

  if (exerciseId !== undefined && exerciseId !== null) {
    const match = exerciseLibrary.find((exercise) => String(exercise.id) === String(exerciseId));

    if (match) {
      return {
        ...historyExercise,
        ...match,
      };
    }
  }

  return historyExercise;
}

function getSetMetrics(set, exercise, bodyWeight) {
  const weight = parseMetricValue(
    firstPresentValue(set.actualWeight, set.actual_weight, set.targetWeight)
  );
  const reps = parseMetricValue(
    firstPresentValue(set.actualReps, set.actual_reps, set.targetReps)
  );
  const rir = firstPresentValue(set.actualRir, set.actual_rir, set.targetRir);
  const e1rm = calculateE1RM(weight, reps, rir, null, null, null, {
    bodyWeight,
    exercise,
  });

  return {
    e1rm: Number.isFinite(e1rm) ? e1rm : null,
    reps,
    volume: Number.isFinite(weight) && Number.isFinite(reps) ? weight * reps : null,
    weight,
  };
}

function average(values) {
  const numericValues = values.filter(Number.isFinite);

  if (numericValues.length === 0) {
    return null;
  }

  return numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
}

function calculateExerciseSummary(exercise, exerciseContext, bodyWeight) {
  const setMetrics = (exercise?.sets || []).map((set) =>
    getSetMetrics(set, exerciseContext || exercise, bodyWeight)
  );
  const volumes = setMetrics.map((set) => set.volume);
  const e1rms = setMetrics.map((set) => set.e1rm);
  const weights = setMetrics.map((set) => set.weight);
  const validVolumes = volumes.filter(Number.isFinite);
  const validE1rms = e1rms.filter(Number.isFinite);
  const validWeights = weights.filter(Number.isFinite);

  return {
    e1rmAverage: average(validE1rms),
    e1rmMax: validE1rms.length > 0 ? Math.max(...validE1rms) : null,
    volume:
      validVolumes.length > 0
        ? validVolumes.reduce((sum, value) => sum + value, 0)
        : null,
    volumeMax: validVolumes.length > 0 ? Math.max(...validVolumes) : null,
    weightAverage: average(validWeights),
    weightMax: validWeights.length > 0 ? Math.max(...validWeights) : null,
  };
}

function buildExerciseComparisons({
  bodyWeightEntries = [],
  exercise,
  exerciseLibrary = [],
  history,
  selectedWorkout,
}) {
  const matchKey = getExerciseMatchKey(exercise);
  const selectedTime = getWorkoutTime(selectedWorkout);
  const selectedId = selectedWorkout?.id;
  const priorSummaries = (history || [])
    .filter((workout) => workout.id !== selectedId && getWorkoutTime(workout) < selectedTime)
    .flatMap((workout) => {
      const match = (workout.exercises || []).find(
        (item) => getExerciseMatchKey(item) === matchKey
      );

      if (!match) {
        return [];
      }

      return [
        {
          completedAt: workout.completedAt,
          completedTime: getWorkoutTime(workout),
          summary: calculateExerciseSummary(
            match,
            findExerciseForHistoryExercise(match, exerciseLibrary),
            getLatestBodyWeightForDate(
              bodyWeightEntries,
              workout.completedAtIso || workout.completed_at || workout.completedAt
            )
          ),
        },
      ];
    })
    .sort((a, b) => b.completedTime - a.completedTime);

  const previousSummary = priorSummaries[0]?.summary || null;
  const allTimeHighs = priorSummaries.reduce((highs, entry) => {
    Object.entries(entry.summary).forEach(([key, value]) => {
      if (!Number.isFinite(value)) {
        return;
      }

      highs[key] = !Number.isFinite(highs[key]) ? value : Math.max(highs[key], value);
    });

    return highs;
  }, {});

  return {
    allTimeHighs,
    previousSummary,
  };
}

function getExerciseIncreaseFlags({
  bodyWeight,
  bodyWeightEntries = [],
  exercise,
  exerciseContext,
  exerciseLibrary = [],
  history,
  selectedWorkout,
}) {
  const summary = calculateExerciseSummary(exercise, exerciseContext, bodyWeight);
  const comparisons = buildExerciseComparisons({
    bodyWeightEntries,
    exercise,
    exerciseLibrary,
    history,
    selectedWorkout,
  });

  return Object.keys(summary).reduce(
    (flags, key) => {
      const value = summary[key];

      if (formatPercentIncrease(value, comparisons.previousSummary?.[key])) {
        flags.previous = true;
        flags.previousCount += 1;
      }

      if (formatPercentIncrease(value, comparisons.allTimeHighs[key])) {
        flags.allTime = true;
        flags.allTimeCount += 1;
      }

      return flags;
    },
    {
      allTime: false,
      allTimeCount: 0,
      previous: false,
      previousCount: 0,
    }
  );
}

function IncreaseBadge({ color, count, label }) {
  if (!count) {
    return null;
  }

  return (
    <span
      aria-label={`${count} ${label}`}
      title={`${count} ${label}`}
      style={{
        alignItems: "center",
        color,
        display: "inline-flex",
        flex: "0 0 auto",
        fontSize: "13px",
        fontWeight: "bold",
        gap: "1px",
        lineHeight: 1,
      }}
    >
      <span>{count}</span>
      <ArrowUp aria-hidden="true" color={color} size={20} strokeWidth={3.2} />
    </span>
  );
}

export function CompletedWorkoutSheet({
  bodyWeightEntries = [],
  exerciseLibrary = [],
  history = [],
  onClose,
  onUpdateSet,
  workout,
  zIndex = 2200,
}) {
  const [selectedWorkoutExercise, setSelectedWorkoutExercise] = useState(null);
  const [selectedWorkoutExerciseDetail, setSelectedWorkoutExerciseDetail] =
    useState(null);
  const [weightPickerData, setWeightPickerData] = useState(null);
  const [repsPickerData, setRepsPickerData] = useState(null);
  const [rirPickerData, setRirPickerData] = useState(null);

  if (!workout) {
    return null;
  }

  const workoutBodyWeight = getLatestBodyWeightForDate(
    bodyWeightEntries,
    workout.completedAtIso || workout.completed_at || workout.completedAt
  );

  const closeSheet = () => {
    setSelectedWorkoutExerciseDetail(null);
    setSelectedWorkoutExercise(null);
    setWeightPickerData(null);
    setRepsPickerData(null);
    setRirPickerData(null);
    onClose?.();
  };

  const updateWorkoutSet = ({ exerciseId, field, setId, value }) => {
    onUpdateSet?.({
      exerciseId,
      field,
      setId,
      value: String(value),
      workoutId: workout.id,
    });

    setSelectedWorkoutExercise((current) =>
      current && String(current.id) === String(exerciseId)
        ? {
            ...current,
            sets: (current.sets || []).map((set) =>
              String(set.id) === String(setId)
                ? {
                    ...set,
                    [field]: String(value),
                  }
                : set
            ),
          }
        : current
    );
  };

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Workout details"
        onClick={(event) => {
          event.stopPropagation();
          closeSheet();
        }}
        style={{
          alignItems: "flex-end",
          background: "rgba(0,0,0,.45)",
          display: "flex",
          inset: 0,
          justifyContent: "center",
          position: "fixed",
          zIndex,
        }}
      >
        <div
          onClick={(event) => event.stopPropagation()}
          style={{
            background: "var(--surface-raised)",
            borderRadius: "18px 18px 0 0",
            boxShadow: "0 -8px 28px rgba(0,0,0,.22)",
            boxSizing: "border-box",
            display: "grid",
            gap: "12px",
            maxHeight: "86vh",
            maxWidth: "680px",
            overflowY: "auto",
            padding: "16px 16px calc(16px + env(safe-area-inset-bottom))",
            width: "100%",
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                minWidth: 0,
              }}
            >
              <h2
                style={{
                  fontSize: "18px",
                  lineHeight: 1.15,
                  margin: 0,
                }}
              >
                {workout.templateName || workout.workout_name || "Workout"}
              </h2>
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "12px",
                  marginTop: "3px",
                }}
              >
                Completed{" "}
                {workout.completedAtIso
                  ? new Date(workout.completedAtIso).toLocaleString([], {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })
                  : workout.completedAt || "on selected date"}
              </div>
            </div>
            <button
              aria-label="Close workout details"
              onClick={closeSheet}
              style={{
                alignItems: "center",
                display: "inline-flex",
                justifyContent: "center",
                minHeight: "36px",
                minWidth: "36px",
                padding: 0,
              }}
              type="button"
            >
              <X size={18} />
            </button>
          </div>

          {(workout.exercises || []).map((exercise) => {
            const exerciseContext = findExerciseForHistoryExercise(
              exercise,
              exerciseLibrary
            );
            const increaseFlags = getExerciseIncreaseFlags({
              bodyWeight: workoutBodyWeight,
              bodyWeightEntries,
              exercise,
              exerciseContext,
              exerciseLibrary,
              history,
              selectedWorkout: workout,
            });

            return (
              <div
                key={exercise.id}
                onClick={() => setSelectedWorkoutExercise(exercise)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedWorkoutExercise(exercise);
                  }
                }}
                role="button"
                style={{
                  background: "var(--surface-raised)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--text-h)",
                  cursor: "pointer",
                  display: "grid",
                  gap: "10px",
                  font: "inherit",
                  padding: "10px",
                  textAlign: "left",
                  width: "100%",
                }}
                tabIndex={0}
              >
                <div
                  style={{
                    alignItems: "center",
                    display: "grid",
                    gap: "10px",
                    gridTemplateColumns: "52px minmax(0, 1fr)",
                  }}
                >
                  <ExerciseThumbnail
                    alt={exercise.imageAlt || exercise.name || "Exercise"}
                    imageUrl={exercise.imageUrl}
                    size={52}
                  />
                  <div
                    style={{
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        alignItems: "center",
                        display: "flex",
                        gap: "6px",
                        minWidth: 0,
                      }}
                    >
                      <strong
                        style={{
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {exercise.name}
                      </strong>
                      <IncreaseBadge
                        color="#c62828"
                        count={increaseFlags.previousCount}
                        label="improvements from previous workout"
                      />
                      <IncreaseBadge
                        color="#1565c0"
                        count={increaseFlags.allTimeCount}
                        label="new all-time highs"
                      />
                    </div>
                    {exercise.note && (
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "12px",
                          marginTop: "3px",
                        }}
                      >
                        {exercise.note}
                      </div>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "6px",
                  }}
                >
                  {(exercise.sets || []).map((set, setIndex) => {
                    const actualWeight = firstPresentValue(
                      set.actualWeight,
                      set.actual_weight
                    );
                    const actualReps = firstPresentValue(
                      set.actualReps,
                      set.actual_reps
                    );
                    const actualRir = firstPresentValue(
                      set.actualRir,
                      set.actual_rir
                    );

                    return (
                      <div
                        key={set.id || setIndex}
                        style={{
                          alignItems: "center",
                          background: "var(--surface-muted)",
                          borderRadius: "8px",
                          display: "grid",
                          fontSize: "13px",
                          gap: "8px",
                          gridTemplateColumns: "42px 1fr 1fr 1fr 1fr",
                          padding: "8px",
                        }}
                      >
                        <strong>Set {setIndex + 1}</strong>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            setWeightPickerData({
                              exerciseId: exercise.id,
                              setId: set.id,
                              value: Number(actualWeight || 0),
                            });
                          }}
                          style={{
                            background: "var(--surface-raised)",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                            color: "var(--text-h)",
                            font: "inherit",
                            minHeight: "30px",
                            padding: "4px 6px",
                            textAlign: "center",
                          }}
                          type="button"
                        >
                          {actualWeight || "-"} lb
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            setRepsPickerData({
                              exerciseId: exercise.id,
                              setId: set.id,
                              value: Number(actualReps || 0),
                            });
                          }}
                          style={{
                            background: "var(--surface-raised)",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                            color: "var(--text-h)",
                            font: "inherit",
                            minHeight: "30px",
                            padding: "4px 6px",
                            textAlign: "center",
                          }}
                          type="button"
                        >
                          {actualReps || "-"} reps
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            setRirPickerData({
                              exerciseId: exercise.id,
                              setId: set.id,
                              value: Number(actualRir || 0),
                            });
                          }}
                          style={{
                            background: "var(--surface-raised)",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                            color: "var(--text-h)",
                            font: "inherit",
                            minHeight: "30px",
                            padding: "4px 6px",
                            textAlign: "center",
                          }}
                          type="button"
                        >
                          RIR {actualRir ?? "-"}
                        </button>
                        <span>
                          e1RM{" "}
                          {formatMetricValue(
                            getSetMetrics({
                              ...set,
                              actualReps,
                              actualRir,
                              actualWeight,
                            }, exerciseContext, workoutBodyWeight).e1rm,
                            1
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedWorkoutExercise && (() => {
        const exerciseContext = findExerciseForHistoryExercise(
          selectedWorkoutExercise,
          exerciseLibrary
        );
        const summary = calculateExerciseSummary(
          selectedWorkoutExercise,
          exerciseContext,
          workoutBodyWeight
        );
        const comparisons = buildExerciseComparisons({
          bodyWeightEntries,
          exercise: selectedWorkoutExercise,
          exerciseLibrary,
          history,
          selectedWorkout: workout,
        });
        const metrics = [
          ["volume", "Volume", "Total weight x reps across all sets", 0],
          ["volumeMax", "Volume Max", "Highest weight x reps for one set", 0],
          ["e1rmMax", "1 Rep Max", "Best estimated 1RM set", 1],
          ["e1rmAverage", "1 Rep Max Average", "Average estimated 1RM", 1],
          ["weightMax", "Weight Max", "Highest set weight", 1],
          ["weightAverage", "Weight Average", "Average set weight", 1],
        ];

        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedWorkoutExercise.name} workout summary`}
            onClick={(event) => {
              event.stopPropagation();
              setSelectedWorkoutExerciseDetail(null);
              setSelectedWorkoutExercise(null);
            }}
            style={{
              alignItems: "flex-end",
              background: "rgba(0,0,0,.45)",
              display: "flex",
              inset: 0,
              justifyContent: "center",
              position: "fixed",
              zIndex: zIndex + 100,
            }}
          >
            <div
              onClick={(event) => event.stopPropagation()}
              style={{
                background: "var(--surface-raised)",
                borderRadius: "18px 18px 0 0",
                boxShadow: "0 -8px 28px rgba(0,0,0,.22)",
                boxSizing: "border-box",
                display: "grid",
                gap: "12px",
                maxHeight: "82vh",
                maxWidth: "600px",
                overflowY: "auto",
                padding: "16px 16px calc(16px + env(safe-area-inset-bottom))",
                width: "100%",
              }}
            >
              <div
                style={{
                  alignItems: "center",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <div
                  style={{
                    alignItems: "center",
                    display: "grid",
                    gap: "10px",
                    gridTemplateColumns: "40px minmax(0, 1fr)",
                    minWidth: 0,
                  }}
                >
                  <ExerciseThumbnail
                    alt={selectedWorkoutExercise.name || "Exercise"}
                    imageUrl={selectedWorkoutExercise.imageUrl}
                    size={40}
                  />
                  <div
                    style={{
                      minWidth: 0,
                    }}
                  >
                    <button
                      onClick={() =>
                        setSelectedWorkoutExerciseDetail(exerciseContext)
                      }
                      style={{
                        background: "transparent",
                        border: 0,
                        color: "var(--text-h)",
                        fontSize: "18px",
                        fontWeight: "bold",
                        lineHeight: 1.15,
                        margin: 0,
                        padding: 0,
                        textAlign: "left",
                      }}
                      type="button"
                    >
                      {selectedWorkoutExercise.name}
                    </button>
                    <div
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "12px",
                        marginTop: "3px",
                      }}
                    >
                      Workout performance summary
                    </div>
                  </div>
                </div>
                <button
                  aria-label="Close exercise summary"
                  onClick={() => {
                    setSelectedWorkoutExerciseDetail(null);
                    setSelectedWorkoutExercise(null);
                  }}
                  style={{
                    alignItems: "center",
                    display: "inline-flex",
                    justifyContent: "center",
                    minHeight: "36px",
                    minWidth: "36px",
                    padding: 0,
                  }}
                  type="button"
                >
                  <X size={18} />
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gap: "8px",
                }}
              >
                {metrics.map(([key, label, description, decimals]) => {
                  const value = summary[key];
                  const previousValue = comparisons.previousSummary?.[key];
                  const allTimeValue = comparisons.allTimeHighs[key];
                  const previousIncrease = formatPercentIncrease(
                    value,
                    previousValue
                  );
                  const allTimeIncrease = formatPercentIncrease(value, allTimeValue);

                  return (
                    <div
                      key={key}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        display: "grid",
                        gap: "6px",
                        padding: "10px",
                      }}
                    >
                      <div
                        style={{
                          alignItems: "start",
                          display: "grid",
                          gap: "8px",
                          gridTemplateColumns: "minmax(0, 1fr) auto",
                        }}
                      >
                        <div>
                          <strong>{label}</strong>
                          <div
                            style={{
                              color: "var(--text-muted)",
                              fontSize: "12px",
                              marginTop: "2px",
                            }}
                          >
                            {description}
                          </div>
                        </div>
                        <strong
                          style={{
                            fontSize: "18px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatMetricValue(value, decimals)}
                        </strong>
                      </div>

                      {(previousIncrease || allTimeIncrease) && (
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "6px",
                          }}
                        >
                          {previousIncrease && (
                            <span
                              style={{
                                background:
                                  "color-mix(in srgb, #c62828 14%, var(--surface))",
                                border: "1px solid #c62828",
                                borderRadius: "999px",
                                color: "#c62828",
                                fontSize: "12px",
                                fontWeight: "bold",
                                padding: "3px 8px",
                              }}
                            >
                              Previous {previousIncrease}
                            </span>
                          )}
                          {allTimeIncrease && (
                            <span
                              style={{
                                background:
                                  "color-mix(in srgb, #1565c0 14%, var(--surface))",
                                border: "1px solid #1565c0",
                                borderRadius: "999px",
                                color: "#1565c0",
                                fontSize: "12px",
                                fontWeight: "bold",
                                padding: "3px 8px",
                              }}
                            >
                              All-time {allTimeIncrease}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {selectedWorkoutExerciseDetail && (
        <ExerciseDetailDialog
          bodyWeightEntries={bodyWeightEntries}
          exercise={selectedWorkoutExerciseDetail}
          history={history}
          onClose={() => setSelectedWorkoutExerciseDetail(null)}
          zIndex={zIndex + 200}
        />
      )}

      <WeightPickerModal
        isOpen={Boolean(weightPickerData)}
        onClose={() => setWeightPickerData(null)}
        value={weightPickerData?.value}
        title="Select Weight"
        onSelect={(value) => {
          if (!weightPickerData) {
            return;
          }

          updateWorkoutSet({
            exerciseId: weightPickerData.exerciseId,
            field: "actualWeight",
            setId: weightPickerData.setId,
            value,
          });
        }}
        zIndex={zIndex + 300}
      />

      <WeightPickerModal
        isOpen={Boolean(repsPickerData)}
        onClose={() => setRepsPickerData(null)}
        value={repsPickerData?.value}
        increment={1}
        title="Select Reps"
        values={Array.from({ length: 20 }, (_, i) => i + 1)}
        onSelect={(value) => {
          if (!repsPickerData) {
            return;
          }

          updateWorkoutSet({
            exerciseId: repsPickerData.exerciseId,
            field: "actualReps",
            setId: repsPickerData.setId,
            value,
          });
        }}
        zIndex={zIndex + 300}
      />

      <WeightPickerModal
        isOpen={Boolean(rirPickerData)}
        onClose={() => setRirPickerData(null)}
        value={rirPickerData?.value}
        title="Select RIR"
        values={RIR_PICKER_VALUES}
        onSelect={(value) => {
          if (!rirPickerData) {
            return;
          }

          updateWorkoutSet({
            exerciseId: rirPickerData.exerciseId,
            field: "actualRir",
            setId: rirPickerData.setId,
            value,
          });
        }}
        zIndex={zIndex + 300}
      />
    </>
  );
}

export default function WorkoutCalendar({
  bodyWeightEntries = [],
  exerciseLibrary = [],
  history,
  nutritionEntries = [],
  onUpdateWorkoutSet,
  session = null,
}) {
  const [expanded, setExpanded] = useState(false);

  const [displayedMonth, setDisplayedMonth] = useState(new Date());
  const [localBodyWeightEntries, setLocalBodyWeightEntries] =
    useState(bodyWeightEntries);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedFood, setSelectedFood] = useState(null);
  const [selectedFoods, setSelectedFoods] = useState(null);
  const [expandedFoodMeals, setExpandedFoodMeals] = useState({});
  const [selectedWeight, setSelectedWeight] = useState(null);
  const [selectedWorkout, setSelectedWorkout] = useState(null);

  const today = new Date();

  const updateSelectedWorkoutSet = ({ exerciseId, field, setId, value }) => {
    setSelectedWorkout((current) =>
      current
        ? {
            ...current,
            exercises: (current.exercises || []).map((exercise) =>
              String(exercise.id) === String(exerciseId)
                ? {
                    ...exercise,
                    sets: (exercise.sets || []).map((set) =>
                      String(set.id) === String(setId)
                        ? {
                            ...set,
                            [field]: value,
                          }
                        : set
                    ),
                  }
                : exercise
            ),
          }
        : current
    );
  };

  const updateBodyWeightEntries = (nextEntries) => {
    setLocalBodyWeightEntries(nextEntries);
    localStorage.setItem(BODY_WEIGHT_LOG_KEY, JSON.stringify(nextEntries));
  };

  const saveBodyWeight = async (entryDate, weightValue) => {
    const weight = Number.parseFloat(String(weightValue).trim());

    if (!Number.isFinite(weight) || weight <= 0) {
      return;
    }

    const existingEntry = localBodyWeightEntries.find(
      (entry) => entry.date === entryDate
    );
    const nextEntries = [
      ...localBodyWeightEntries.filter((entry) => entry.date !== entryDate),
      {
        date: entryDate,
        id: existingEntry?.id || Date.now(),
        unit: "lb",
        weight,
      },
    ].sort((a, b) => a.date.localeCompare(b.date));

    updateBodyWeightEntries(nextEntries);

    if (session?.user?.id && isSupabaseConfigured) {
      try {
        await upsertBodyWeightEntry(nextEntries.find((entry) => entry.date === entryDate), session);
      } catch (error) {
        console.error("Failed to save body weight from calendar:", error);
      }
    }
  };

  const removeBodyWeight = async (entryDate) => {
    updateBodyWeightEntries(
      localBodyWeightEntries.filter((entry) => entry.date !== entryDate)
    );

    if (session?.user?.id && isSupabaseConfigured) {
      try {
        await deleteBodyWeightEntry(entryDate, session);
      } catch (error) {
        console.error("Failed to delete body weight from calendar:", error);
      }
    }
  };

  const getSessionDateKey = (session) => {
    if (session.completedAtIso) {
      const parsed = new Date(session.completedAtIso);

      if (Number.isFinite(parsed.getTime())) {
        return getLocalDateKey(parsed);
      }
    }

    if (session.completed_at) {
      const parsed = new Date(session.completed_at);

      if (Number.isFinite(parsed.getTime())) {
        return getLocalDateKey(parsed);
      }
    }

    if (session.completedAt) {
      const parsed = new Date(session.completedAt);

      if (Number.isFinite(parsed.getTime())) {
        return getLocalDateKey(parsed);
      }
    }

    return "";
  };

  const startOfWeek = new Date(today);

  const day = startOfWeek.getDay();

  const mondayOffset = day === 0 ? -6 : 1 - day;

  startOfWeek.setDate(today.getDate() + mondayOffset);

  const days = [...Array(7)].map((_, i) => {
    const date = new Date(startOfWeek);

    date.setDate(startOfWeek.getDate() + i);

    return date;
  });

  const workoutsForDate = (date) => {
    const dateKey = getLocalDateKey(date);

    return history.filter((session) => getSessionDateKey(session) === dateKey);
  };

  const nutritionForDate = (date) => {
    const dateKey = getLocalDateKey(date);

    return nutritionEntries.filter((entry) => entry.date === dateKey);
  };

  const bodyWeightForDate = (date) => {
    const dateKey = getLocalDateKey(date);

    return localBodyWeightEntries.find((entry) => entry.date === dateKey);
  };

  const getDateSummary = (date) => {
    const workouts = workoutsForDate(date);
    const foods = nutritionForDate(date);
    const bodyWeight = bodyWeightForDate(date);

    return {
      bodyWeight,
      foods,
      foodTotals: totalFoods(foods),
      hasActivity: workouts.length > 0 || foods.length > 0 || Boolean(bodyWeight),
      workouts,
    };
  };

  const activityDots = (summary) => (
    <div
      aria-hidden="true"
      style={{
        alignItems: "center",
        display: "flex",
        height: "9px",
        justifyContent: "center",
        marginTop: "2px",
        minWidth: "30px",
      }}
    >
      {summary.workouts.length > 0 && (
        <span
          style={{
            background: "#2e7d32",
            borderRadius: "999px",
            height: "8px",
            marginRight: "-1px",
            width: "8px",
          }}
        />
      )}
      {summary.bodyWeight && (
        <span
          style={{
            background: "#ef6c00",
            borderRadius: "999px",
            height: "8px",
            marginLeft: "-1px",
            marginRight: "-1px",
            width: "8px",
          }}
        />
      )}
      {summary.foods.length > 0 && (
        <span
          style={{
            background: "#fbc02d",
            borderRadius: "999px",
            height: "8px",
            marginLeft: "-1px",
            width: "8px",
          }}
        />
      )}
    </div>
  );

  return (
    <div
      onClick={() => {
        setExpanded((current) => {
          if (current) {
            setSelectedDate(null);
            setSelectedFood(null);
            setSelectedFoods(null);
            setSelectedWeight(null);
            setSelectedWorkout(null);
          }

          return !current;
        });
      }}
      style={{
        marginBottom: "20px",
        padding: "12px",
        border: "1px solid var(--border)",
        borderRadius: "12px",
        cursor: "pointer",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7,1fr)",
          textAlign: "center",
          gap: "4px",
        }}
      >
        {days.map((date) => {
          const summary = getDateSummary(date);

          return (
            <div key={date.toISOString()}>
              <div
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                }}
              >
                {date
                  .toLocaleDateString(undefined, { weekday: "short" })
                  .slice(0, 2)}
              </div>

              <div
                style={{
                  fontSize: "18px",
                  fontWeight: "bold",
                  color: "var(--text-h)",

                  border:
                    date.toDateString() === today.toDateString()
                      ? "2px solid #1976d2"
                      : "2px solid transparent",

                  borderRadius: "999px",

                  width: "32px",
                  height: "32px",

                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",

                  margin: "0 auto",
                }}
              >
                {date.getDate()}
              </div>
              {activityDots(summary)}
            </div>
          );
        })}
      </div>

      {expanded &&
        (() => {
          const firstDay = new Date(
            displayedMonth.getFullYear(),
            displayedMonth.getMonth(),
            1
          );

          const lastDay = new Date(
            displayedMonth.getFullYear(),
            displayedMonth.getMonth() + 1,
            0
          );

          const startOffset = (firstDay.getDay() + 6) % 7;

          const totalDays = lastDay.getDate();

          const cells = [];

          for (let i = 0; i < startOffset; i++) cells.push(null);

          for (let day = 1; day <= totalDays; day++)
            cells.push(
              new Date(
                displayedMonth.getFullYear(),
                displayedMonth.getMonth(),
                day
              )
            );

          return (
            <div
              style={{
                marginTop: "16px",
                paddingTop: "12px",
                borderTop: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "12px",
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();

                    setDisplayedMonth(
                      new Date(
                        displayedMonth.getFullYear(),
                        displayedMonth.getMonth() - 1,
                        1
                      )
                    );
                  }}
                >
                  ←
                </button>

                <div
                  style={{
                    fontWeight: "bold",
                  }}
                >
                  {displayedMonth.toLocaleDateString(undefined, {
                    month: "long",
                    year: "numeric",
                  })}
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();

                    setDisplayedMonth(
                      new Date(
                        displayedMonth.getFullYear(),
                        displayedMonth.getMonth() + 1,
                        1
                      )
                    );
                  }}
                >
                  →
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7,1fr)",
                  gap: "6px",
                  textAlign: "center",
                }}
              >
                {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => (
                  <div
                    key={day}
                    style={{
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      fontWeight: "bold",
                    }}
                  >
                    {day}
                  </div>
                ))}

                {cells.map((date, i) => {
                  const summary = date ? getDateSummary(date) : null;
                  const selected =
                    date &&
                    selectedDate &&
                    selectedDate.toDateString() === date.toDateString();

                  return (
                    <button
                      key={i}
                      onClick={(e) => {
                        e.stopPropagation();

                        if (date && summary.hasActivity) {
                          setSelectedFood(null);
                          setSelectedFoods(null);
                          setSelectedWeight(null);
                          setSelectedWorkout(null);
                          setSelectedDate(
                            selectedDate &&
                              selectedDate.toDateString() === date.toDateString()
                              ? null
                              : date
                          );
                        }
                      }}
                      style={{
                        alignItems: "center",
                        background: selected ? "var(--text-h)" : "transparent",
                        border:
                          selected
                            ? "2px solid var(--text-h)"
                            : date && date.toDateString() === today.toDateString()
                            ? "2px solid #1976d2"
                            : "2px solid transparent",
                        borderRadius: "8px",
                        color: selected ? "var(--surface)" : "var(--text-h)",
                        cursor: date && summary.hasActivity ? "pointer" : "default",
                        display: "grid",
                        font: "inherit",
                        gap: "0",
                        justifyItems: "center",
                        minHeight: "42px",
                        padding: "2px",
                      }}
                      type="button"
                    >
                      <span
                        style={{
                          alignItems: "center",
                          display: "flex",
                          fontWeight: "normal",
                          height: "24px",
                          justifyContent: "center",
                          width: "24px",
                        }}
                      >
                        {date ? date.getDate() : ""}
                      </span>
                      {summary ? activityDots(summary) : <span style={{ height: "6px" }} />}
                    </button>
                  );
                })}
              </div>

              <button
                onClick={(event) => {
                  const nextToday = new Date();

                  event.stopPropagation();
                  setDisplayedMonth(
                    new Date(nextToday.getFullYear(), nextToday.getMonth(), 1)
                  );
                  setSelectedFood(null);
                  setSelectedFoods(null);
                  setSelectedWeight(null);
                  setSelectedWorkout(null);
                  setSelectedDate(nextToday);
                }}
                style={{
                  marginTop: "12px",
                  minHeight: "40px",
                  width: "100%",
                }}
                type="button"
              >
                Today
              </button>

              {selectedDate && (
                <div
                  style={{
                    marginTop: "16px",
                    paddingTop: "12px",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      fontWeight: "bold",
                      marginBottom: "8px",
                    }}
                  >
                    {selectedDate.toLocaleDateString()}
                  </div>

                  {(() => {
                    const summary = getDateSummary(selectedDate);

                    return (
                      <div
                        style={{
                          display: "grid",
                          gap: "10px",
                        }}
                      >
                        {summary.workouts.length > 0 && (
                          <div>
                            <div
                              style={{
                                alignItems: "center",
                                display: "flex",
                                fontSize: "13px",
                                fontWeight: "bold",
                                gap: "6px",
                                marginBottom: "4px",
                              }}
                            >
                              <Dumbbell size={15} color="#2e7d32" />
                              Workouts
                            </div>
                            {summary.workouts.map((workout) => (
                              <button
                                key={workout.id}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setSelectedWorkout(workout);
                                }}
                                style={{
                                  background: "var(--surface-muted)",
                                  border: "1px solid var(--border)",
                                  borderRadius: "8px",
                                  color: "var(--text-h)",
                                  display: "block",
                                  fontSize: "13px",
                                  font: "inherit",
                                  marginBottom: "4px",
                                  padding: "8px",
                                  textAlign: "left",
                                  width: "100%",
                                }}
                                type="button"
                              >
                                {workout.templateName || workout.workout_name || "Workout"}
                                {workout.completedAtIso
                                  ? ` (${new Date(
                                      workout.completedAtIso
                                    ).toLocaleTimeString([], {
                                      hour: "numeric",
                                      minute: "2-digit",
                                    })})`
                                  : ""}
                              </button>
                            ))}
                          </div>
                        )}

                        {summary.bodyWeight && (
                          <div>
                            <div
                              style={{
                                alignItems: "center",
                                display: "flex",
                                fontSize: "13px",
                                fontWeight: "bold",
                                gap: "6px",
                                marginBottom: "4px",
                              }}
                            >
                              <Scale size={15} color="#ef6c00" />
                              Weight
                            </div>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedWeight(summary.bodyWeight);
                              }}
                              style={{
                                background: "var(--surface-muted)",
                                border: "1px solid var(--border)",
                                borderRadius: "8px",
                                color: "var(--text-muted)",
                                display: "block",
                                fontSize: "13px",
                                font: "inherit",
                                padding: "8px",
                                textAlign: "left",
                                width: "100%",
                              }}
                              type="button"
                            >
                              {summary.bodyWeight.weight}{" "}
                              {summary.bodyWeight.unit || "lb"}
                            </button>
                          </div>
                        )}

                        {summary.foods.length > 0 && (
                          <div>
                            <div
                              style={{
                                alignItems: "center",
                                display: "flex",
                                fontSize: "13px",
                                fontWeight: "bold",
                                gap: "6px",
                                marginBottom: "4px",
                              }}
                            >
                              <Utensils size={15} color="#fbc02d" />
                              Food
                            </div>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                setExpandedFoodMeals({});
                                setSelectedFoods({
                                  date: getLocalDateKey(selectedDate),
                                  foods: summary.foods,
                                  totals: summary.foodTotals,
                                });
                              }}
                              style={{
                                background: "var(--surface-muted)",
                                border: "1px solid var(--border)",
                                borderRadius: "8px",
                                color: "var(--text-muted)",
                                display: "block",
                                fontSize: "13px",
                                font: "inherit",
                                padding: "8px",
                                textAlign: "left",
                                width: "100%",
                              }}
                              type="button"
                            >
                              {formatMacro(summary.foodTotals.calories, "cal")} cal ·{" "}
                              {formatMacro(summary.foodTotals.protein)} protein ·{" "}
                              {formatMacro(summary.foodTotals.carbs)} carbs ·{" "}
                              {formatMacro(summary.foodTotals.fat)} fat
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })()}

      {selectedWeight && (
        <BodyWeightSheet
          entries={localBodyWeightEntries}
          entryDate={selectedWeight.date || getLocalDateKey(today)}
          onClose={() => setSelectedWeight(null)}
          onDelete={removeBodyWeight}
          onSave={saveBodyWeight}
        />
      )}

      {selectedFoods && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Food list"
          onClick={(event) => {
            event.stopPropagation();
            setExpandedFoodMeals({});
            setSelectedFoods(null);
          }}
          style={{
            alignItems: "flex-end",
            background: "rgba(0,0,0,.45)",
            display: "flex",
            inset: 0,
            justifyContent: "center",
            position: "fixed",
            zIndex: 2200,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              background: "var(--surface-raised)",
              borderRadius: "18px 18px 0 0",
              boxShadow: "0 -8px 28px rgba(0,0,0,.22)",
              boxSizing: "border-box",
              display: "grid",
              gap: "12px",
              maxHeight: "76vh",
              maxWidth: "560px",
              overflowY: "auto",
              padding: "16px 16px calc(16px + env(safe-area-inset-bottom))",
              width: "100%",
            }}
          >
            <div
              style={{
                alignItems: "center",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <div>
                <h2
                  style={{
                    alignItems: "center",
                    display: "flex",
                    fontSize: "18px",
                    gap: "8px",
                    lineHeight: 1.15,
                    margin: 0,
                  }}
                >
                  <Utensils size={18} color="#fbc02d" />
                  Food
                </h2>
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "12px",
                    marginTop: "3px",
                  }}
                >
                  {selectedFoods.date} · {selectedFoods.foods.length}{" "}
                  {selectedFoods.foods.length === 1 ? "item" : "items"}
                </div>
              </div>
              <button
                aria-label="Close food list"
                onClick={() => {
                  setExpandedFoodMeals({});
                  setSelectedFoods(null);
                }}
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  justifyContent: "center",
                  minHeight: "36px",
                  minWidth: "36px",
                  padding: 0,
                }}
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                background: "var(--surface-muted)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                display: "grid",
                gap: "3px",
                padding: "10px",
              }}
            >
              <strong>{formatMacro(selectedFoods.totals.calories, "cal")} cal</strong>
              <span
                style={{
                  color: "var(--text-muted)",
                  fontSize: "12px",
                }}
              >
                {formatMacro(selectedFoods.totals.protein)} protein ·{" "}
                {formatMacro(selectedFoods.totals.carbs)} carbs ·{" "}
                {formatMacro(selectedFoods.totals.fat)} fat
              </span>
            </div>

            <div
              style={{
                display: "grid",
                gap: "10px",
              }}
            >
              {getMealGroups(selectedFoods.foods).map((group) => (
                <section
                  key={group.meal}
                  style={{
                    background: "var(--surface-muted)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    display: "grid",
                    gap: "8px",
                    padding: "10px",
                  }}
                >
                  <button
                    aria-expanded={Boolean(expandedFoodMeals[group.meal])}
                    onClick={() =>
                      setExpandedFoodMeals((current) => ({
                        ...current,
                        [group.meal]: !current[group.meal],
                      }))
                    }
                    style={{
                      alignItems: "center",
                      background: "transparent",
                      border: 0,
                      color: "inherit",
                      display: "flex",
                      font: "inherit",
                      gap: "8px",
                      justifyContent: "space-between",
                      padding: 0,
                      textAlign: "left",
                      width: "100%",
                    }}
                    type="button"
                  >
                    <div
                      style={{
                        alignItems: "center",
                        color: "var(--text-h)",
                        display: "flex",
                        fontWeight: 700,
                        gap: "7px",
                      }}
                    >
                      <MealIcon meal={group.meal} />
                      {group.label}
                    </div>
                    <div
                      style={{
                        alignItems: "center",
                        color: "var(--text-muted)",
                        display: "flex",
                        fontSize: "12px",
                        gap: "6px",
                      }}
                    >
                      <span>
                        {group.entries.length}{" "}
                        {group.entries.length === 1 ? "item" : "items"}
                      </span>
                      {expandedFoodMeals[group.meal] ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </div>
                  </button>
                  <span
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "12px",
                    }}
                  >
                    {formatMacro(group.totals.calories, "cal")} cal ·{" "}
                    {formatMacro(group.totals.protein)} protein ·{" "}
                    {formatMacro(group.totals.carbs)} carbs ·{" "}
                    {formatMacro(group.totals.fat)} fat
                  </span>
                  {expandedFoodMeals[group.meal] && (
                    <div
                      style={{
                        display: "grid",
                        gap: "6px",
                      }}
                    >
                      {group.entries.map((food) => (
                        <button
                          key={food.id}
                          onClick={() => {
                            setExpandedFoodMeals({});
                            setSelectedFoods(null);
                            setSelectedFood(food);
                          }}
                          style={{
                            background: "var(--surface-raised)",
                            border: "1px solid var(--border)",
                            borderRadius: "8px",
                            color: "var(--text-muted)",
                            display: "grid",
                            font: "inherit",
                            gap: "3px",
                            padding: "9px",
                            textAlign: "left",
                            width: "100%",
                          }}
                          type="button"
                        >
                          <strong
                            style={{
                              color: "var(--text-h)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {food.name}
                          </strong>
                          <span
                            style={{
                              fontSize: "12px",
                            }}
                          >
                            {formatMacro(food.calories, "cal")} cal ·{" "}
                            {formatMacro(food.protein)} protein ·{" "}
                            {formatMacro(food.carbs)} carbs ·{" "}
                            {formatMacro(food.fat)} fat
                            {food.servingDescription
                              ? ` · ${food.servingDescription}`
                              : ""}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

      {selectedFood && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Food details"
          onClick={(event) => {
            event.stopPropagation();
            setSelectedFood(null);
          }}
          style={{
            alignItems: "flex-end",
            background: "rgba(0,0,0,.45)",
            display: "flex",
            inset: 0,
            justifyContent: "center",
            position: "fixed",
            zIndex: 2200,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              background: "var(--surface-raised)",
              borderRadius: "18px 18px 0 0",
              boxShadow: "0 -8px 28px rgba(0,0,0,.22)",
              boxSizing: "border-box",
              display: "grid",
              gap: "14px",
              maxHeight: "76vh",
              maxWidth: "560px",
              overflowY: "auto",
              padding: "16px 16px calc(16px + env(safe-area-inset-bottom))",
              width: "100%",
            }}
          >
            <div
              style={{
                alignItems: "center",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <div
                style={{
                  minWidth: 0,
                }}
              >
                <h2
                  style={{
                    alignItems: "center",
                    display: "flex",
                    fontSize: "18px",
                    gap: "8px",
                    lineHeight: 1.15,
                    margin: 0,
                  }}
                >
                  <Utensils size={18} color="#fbc02d" />
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {selectedFood.name}
                  </span>
                </h2>
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "12px",
                    marginTop: "3px",
                  }}
                >
                  {selectedFood.date}
                  {selectedFood.servingDescription
                    ? ` · ${selectedFood.servingDescription}`
                    : ""}
                </div>
              </div>
              <button
                aria-label="Close food details"
                onClick={() => setSelectedFood(null)}
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  justifyContent: "center",
                  minHeight: "36px",
                  minWidth: "36px",
                  padding: 0,
                }}
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gap: "8px",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              }}
            >
              {[
                ["Calories", formatMacro(selectedFood.calories, "cal")],
                ["Protein", formatMacro(selectedFood.protein)],
                ["Carbs", formatMacro(selectedFood.carbs)],
                ["Fat", formatMacro(selectedFood.fat)],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    background: "var(--surface-muted)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    display: "grid",
                    gap: "3px",
                    padding: "10px",
                  }}
                >
                  <span
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "11px",
                    }}
                  >
                    {label}
                  </span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>

            {(selectedFood.source || selectedFood.sourceKey || selectedFood.recipeId) && (
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "12px",
                }}
              >
                {selectedFood.source ? `Source: ${selectedFood.source}` : ""}
                {selectedFood.recipeId ? " · Recipe" : ""}
              </div>
            )}
          </div>
        </div>
      )}

      {selectedWorkout && (
        <CompletedWorkoutSheet
          bodyWeightEntries={localBodyWeightEntries}
          exerciseLibrary={exerciseLibrary}
          history={history}
          onClose={() => {
            setSelectedWorkout(null);
          }}
          onUpdateSet={(payload) => {
            updateSelectedWorkoutSet(payload);
            onUpdateWorkoutSet?.(payload);
          }}
          workout={selectedWorkout}
        />
      )}
    </div>
  );
}
