import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CalendarDays,
  CalendarCheck,
  Check,
  Palette,
  Dumbbell,
  ImagePlus,
  LineChart,
  ListChecks,
  Pencil,
  TrendingUp,
  Trophy,
  X,
} from "lucide-react";
import { calculateE1RM, formatE1RM, getLatestBodyWeightForDate } from "../utils/e1rm";
import {
  getBenchmarkFamilyForExercise,
  isExerciseBenchmark,
} from "../utils/exerciseBenchmark";
import { getExerciseWeightIncrement } from "../utils/weightIncrement";
import { exercisesMatch } from "../utils/workoutHistoryLookup";
import MuscleMap from "./MuscleMap";
import WeightPickerModal from "./WeightPickerModal";

const RANGE_OPTIONS = [
  { label: "1 week", value: 7 },
  { label: "1 month", value: 30 },
  { label: "3 months", value: 90 },
  { label: "6 months", value: 183 },
  { label: "9 months", value: 274 },
  { label: "1 year", value: 365 },
  { label: "All", value: null },
];

const TREND_OPTIONS = [
  { label: "None", value: null },
  { label: "1 week", value: 7 },
  { label: "2 weeks", value: 14 },
  { label: "1 month", value: 30 },
];

const CHART_SETTINGS_STORAGE_KEY = "exerciseHistoryChartSettings";
const CHART_METRIC_OPTIONS = ["maxWeight", "e1rm"];
const TREND_COLOR_CHANGE_THRESHOLD_LB = 5;
const TREND_COLOR_CHANGE_THRESHOLD_PERCENT = 0.025;
const RIR_PICKER_VALUES = Array.from({ length: 13 }, (_, index) => index * 0.5);
const TREND_COLORS = {
  decreasing: "#e53935",
  flat: "#fdd835",
  increasing: "#43a047",
};
const BENCH_ZONE_COLORS = {
  heavy: "#2563eb",
  lowConfidence: "#9ca3af",
  moderate: "#16a34a",
};
const BENCH_TREND_FLAT_THRESHOLD_LB_PER_WEEK = 0.25;
const BENCH_RATIO_ALIGNED_THRESHOLD = 0.99;
const BENCH_RATIO_LAGGING_THRESHOLD = 0.96;

function formatEquipment(equipment) {
  return Array.isArray(equipment) ? equipment.filter(Boolean).join(", ") : equipment || "";
}

function normalizeMuscleList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  return String(value || "").trim() ? [String(value).trim()] : [];
}

function getPrimaryMuscle(exercise) {
  const list = getPrimaryMuscleList(exercise);

  return list.length > 0 ? list.join(", ") : "n/a";
}

function getPrimaryMuscleList(exercise) {
  const primaryList = normalizeMuscleList(
    exercise.primaryMuscles || exercise.primary_muscles
  );

  if (primaryList.length > 0) {
    return primaryList;
  }

  return normalizeMuscleList(
    exercise.primaryMuscle ||
      exercise.primary_muscle ||
      exercise.muscles?.[0] ||
      exercise.planMuscle
  );
}

function getSecondaryMuscleList(exercise) {
  return normalizeMuscleList(
    exercise.secondaryMuscles ||
      exercise.secondary_muscles ||
      exercise.muscles?.slice(1)
  );
}

function getSecondaryMuscles(exercise) {
  const list = getSecondaryMuscleList(exercise);
  return list.length > 0 ? list.join(", ") : "n/a";
}

function getBodyweightLoadPercent(exercise) {
  const value =
    exercise?.bodyweightLoadPercent ?? exercise?.bodyweight_load_percent ?? 0;
  const parsed = Number.parseFloat(value);

  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 0;
}

function getInstructionSteps(exercise) {
  const value = exercise?.instructionSteps || exercise?.instruction_steps || [];

  return Array.isArray(value)
    ? value.map((step) => String(step || "").trim()).filter(Boolean)
    : [];
}

function getSetValue(set, actualField) {
  return set[actualField] || "";
}

function getDateKey(value) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);

  if (!Number.isFinite(parsed.getTime())) {
    return "";
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function daysBetween(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  return Math.round((end - start) / 86400000);
}

function addDaysToDateKey(dateKey, dayCount) {
  const date = new Date(`${dateKey}T00:00:00`);

  date.setDate(date.getDate() + dayCount);

  return getDateKey(date);
}

function getOptionLabel(options, value) {
  return options.find((option) => option.value === value)?.label || "";
}

function isValidOptionValue(options, value) {
  return options.some((option) => option.value === value);
}

function getStoredChartSettings() {
  if (typeof window === "undefined") {
    return {
      colorTrend: false,
      metric: "e1rm",
      rangeDays: null,
      trendDays: null,
    };
  }

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(CHART_SETTINGS_STORAGE_KEY) || "{}"
    );

    return {
      colorTrend: Boolean(parsed.colorTrend),
      metric: CHART_METRIC_OPTIONS.includes(parsed.metric)
        ? parsed.metric
        : "e1rm",
      rangeDays: isValidOptionValue(RANGE_OPTIONS, parsed.rangeDays)
        ? parsed.rangeDays
        : null,
      trendDays: isValidOptionValue(TREND_OPTIONS, parsed.trendDays)
        ? parsed.trendDays
        : null,
    };
  } catch {
    return {
      colorTrend: false,
      metric: "e1rm",
      rangeDays: null,
      trendDays: null,
    };
  }
}

function saveStoredChartSettings(settings) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      CHART_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings)
    );
  } catch (error) {
    console.warn("Failed to save exercise history chart settings:", error);
  }
}

function filterPointsByRange(points, rangeDays) {
  if (!rangeDays || points.length === 0) {
    return points;
  }

  const lastDate = points[points.length - 1].dateKey;
  return filterPointsByRangeEndDate(points, rangeDays, lastDate);
}

function filterPointsByRangeEndDate(points, rangeDays, endDateKey) {
  if (!rangeDays || points.length === 0 || !endDateKey) {
    return points;
  }

  const filtered = points.filter(
    (point) => daysBetween(point.dateKey, endDateKey) <= rangeDays
  );

  return filtered;
}

function buildTrendPoints(points, trendDays) {
  if (!trendDays || points.length === 0) {
    return [];
  }

  return points.map((point) => {
    const windowPoints = points.filter(
      (candidate) =>
        candidate.dateKey <= point.dateKey &&
        daysBetween(candidate.dateKey, point.dateKey) <= trendDays
    );
    const averageValue =
      windowPoints.reduce((total, candidate) => total + candidate.value, 0) /
      Math.max(1, windowPoints.length);

    return {
      ...point,
      value: averageValue,
    };
  });
}

function getRegressionTrendDirection(points) {
  if (points.length < 2) {
    return "flat";
  }

  const xValues = points.map((point) => new Date(`${point.dateKey}T00:00:00`).getTime());
  const yValues = points.map((point) => point.value);
  const xMean =
    xValues.reduce((total, value) => total + value, 0) / xValues.length;
  const yMean =
    yValues.reduce((total, value) => total + value, 0) / yValues.length;
  const denominator = xValues.reduce(
    (total, value) => total + (value - xMean) ** 2,
    0
  );

  if (!denominator) {
    return "flat";
  }

  const numerator = xValues.reduce(
    (total, value, index) =>
      total + (value - xMean) * (yValues[index] - yMean),
    0
  );
  const slope = numerator / denominator;
  const predictedFirst = yMean + slope * (xValues[0] - xMean);
  const predictedLast =
    yMean + slope * (xValues[xValues.length - 1] - xMean);
  const predictedChange = predictedLast - predictedFirst;
  const percentChange =
    predictedFirst === 0 ? 0 : predictedChange / Math.abs(predictedFirst);

  if (
    predictedChange >= TREND_COLOR_CHANGE_THRESHOLD_LB ||
    percentChange >= TREND_COLOR_CHANGE_THRESHOLD_PERCENT
  ) {
    return "increasing";
  }

  if (
    predictedChange <= -TREND_COLOR_CHANGE_THRESHOLD_LB ||
    percentChange <= -TREND_COLOR_CHANGE_THRESHOLD_PERCENT
  ) {
    return "decreasing";
  }

  return "flat";
}

function buildExerciseHistory(exercise, history, bodyWeightEntries = []) {
  return [...(history || [])]
    .flatMap((workout) => {
      const matchingExerciseIndex = workout.exercises?.findIndex((item) =>
        exercisesMatch(item, exercise)
      );
      const matchingExercise =
        matchingExerciseIndex >= 0 ? workout.exercises[matchingExerciseIndex] : null;

      if (!matchingExercise) {
        return [];
      }

      const bodyWeight = getLatestBodyWeightForDate(
        bodyWeightEntries,
        workout.completedAtIso || workout.completed_at || workout.completedAt
      );
      const sets = (matchingExercise.sets || []).map((set, index) => {
        const weight = getSetValue(set, "actualWeight");
        const reps = getSetValue(set, "actualReps");
        const rir = getSetValue(set, "actualRir");
        const e1rm = calculateE1RM(weight, reps, rir, null, null, null, {
          bodyWeight,
          exercise,
        });

        return {
          e1rm,
          prescribedReps:
            set.prescribedReps ?? set.targetReps ?? set.reps ?? null,
          reps,
          rir,
          setId: set.id || set.setId || null,
          setIndex: index,
          setNumber: index + 1,
          weight,
        };
      });
      const maxWeight = Math.max(
        0,
        ...sets.map((set) => Number(set.weight)).filter(Number.isFinite)
      );
      const maxE1RM = Math.max(
        0,
        ...sets.map((set) => Number(set.e1rm)).filter(Number.isFinite)
      );

      return [
        {
          completedAt: workout.completedAt || "Unknown date",
          completedDateKey: getDateKey(
            workout.completedAtIso || workout.completed_at || workout.completedAt
          ),
          exerciseId: matchingExercise.id || matchingExercise.exerciseId || null,
          exerciseIndex: matchingExerciseIndex,
          bodyWeight,
          sets,
          templateName: workout.templateName || workout.name || "Workout",
          maxWeight: maxWeight || null,
          maxE1RM: maxE1RM || null,
          workoutId: workout.id || null,
        },
      ];
    })
    .reverse();
}

function getHistoryEntryKey(entry) {
  return `${entry.workoutId || entry.completedAt}-${entry.exerciseId || entry.exerciseIndex}`;
}

function getHistorySetKey(set) {
  return set.setId == null ? `index-${set.setIndex}` : `id-${set.setId}`;
}

function buildHistorySummary(exerciseHistory) {
  const maxWeight = Math.max(
    0,
    ...exerciseHistory
      .flatMap((entry) => entry.sets || [])
      .map((set) => Number(set.weight))
      .filter(Number.isFinite)
  );
  const maxE1RM = Math.max(
    0,
    ...exerciseHistory
      .flatMap((entry) => entry.sets || [])
      .map((set) => Number(set.e1rm))
      .filter(Number.isFinite)
  );

  return {
    maxE1RM: maxE1RM || null,
    maxWeight: maxWeight || null,
    workouts: exerciseHistory.length,
  };
}

function getLatestHistoryEntry(exerciseHistory) {
  return [...exerciseHistory]
    .filter((entry) => entry.completedDateKey)
    .sort((left, right) =>
      left.completedDateKey.localeCompare(right.completedDateKey)
    )
    .at(-1) || null;
}

function getBestHistorySet(exerciseHistory) {
  return exerciseHistory
    .flatMap((entry) =>
      (entry.sets || []).map((set) => ({
        ...set,
        completedAt: entry.completedAt,
      }))
    )
    .filter((set) => Number.isFinite(parseHistoryNumber(set.e1rm)))
    .sort(
      (left, right) =>
        parseHistoryNumber(right.e1rm) - parseHistoryNumber(left.e1rm)
    )[0] || null;
}

function parseHistoryNumber(value) {
  const parsed = Number.parseFloat(String(value ?? "").replace(/^\+/, ""));

  return Number.isFinite(parsed) ? parsed : null;
}

function parsePrescribedRepRange(value) {
  const values = String(value ?? "")
    .match(/\d+(?:\.\d+)?/g)
    ?.map(Number)
    .filter(Number.isFinite);

  if (!values?.length) return null;

  return {
    label: String(value).trim(),
    max: Math.max(...values),
    min: Math.min(...values),
  };
}

function getPrescriptionZone(prescription) {
  if (!prescription) return null;
  if (prescription.min >= 3 && prescription.max <= 7) return "heavy";
  if (prescription.min >= 8 && prescription.max <= 12) return "moderate";
  return null;
}

function setMeetsPrescription(set) {
  return (
    set.prescribedRepRange &&
    Number.isFinite(set.reps) &&
    set.reps >= set.prescribedRepRange.min &&
    set.reps <= set.prescribedRepRange.max
  );
}

function isBarbellBenchPress(exercise) {
  return (
    String(exercise?.name || "").trim().toLowerCase() === "bench press" &&
    formatEquipment(exercise?.equipment).toLowerCase().includes("barbell")
  );
}

function average(values) {
  const numericValues = values.filter(Number.isFinite);

  return numericValues.length > 0
    ? numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length
    : null;
}

function formatBenchMetric(value, digits = 1, suffix = "") {
  return Number.isFinite(value)
    ? `${value.toFixed(digits).replace(/\.0$/, "")}${suffix}`
    : "—";
}

function getBestSet(sets) {
  return sets.reduce(
    (best, set) => (!best || set.e1rm > best.e1rm ? set : best),
    null
  );
}

function getRollingAveragePoints(points, windowSize = 3) {
  return points.map((point, index) => {
    const windowPoints = points.slice(Math.max(0, index - windowSize + 1), index + 1);

    return {
      ...point,
      rawValue: point.value,
      value: average(windowPoints.map((item) => item.value)),
    };
  });
}

function getLinearRegression(points) {
  const sortedPoints = [...points]
    .filter((point) => Number.isFinite(point.value) && point.dateKey)
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey));

  if (sortedPoints.length < 2) {
    return null;
  }

  const firstDate = sortedPoints[0].dateKey;
  const xValues = sortedPoints.map((point) => daysBetween(firstDate, point.dateKey));
  const yValues = sortedPoints.map((point) => point.value);
  const meanX = average(xValues);
  const meanY = average(yValues);
  const denominator = xValues.reduce(
    (sum, x) => sum + (x - meanX) * (x - meanX),
    0
  );

  if (!denominator) {
    return null;
  }

  const slopePerDay =
    xValues.reduce(
      (sum, x, index) => sum + (x - meanX) * (yValues[index] - meanY),
      0
    ) / denominator;
  const intercept = meanY - slopePerDay * meanX;
  const firstX = xValues[0];
  const lastX = xValues[xValues.length - 1];

  return {
    end: {
      dateKey: sortedPoints[sortedPoints.length - 1].dateKey,
      value: intercept + slopePerDay * lastX,
    },
    pointCount: sortedPoints.length,
    slopePerWeek: slopePerDay * 7,
    start: {
      dateKey: firstDate,
      value: intercept + slopePerDay * firstX,
    },
  };
}

function buildBenchExperimentChartSeries(data, rangeDays) {
  const latestDateKey = [
    ...data.heavyPoints,
    ...data.moderatePoints,
    ...data.lowConfidencePoints,
  ]
    .map((point) => point.dateKey)
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
    .at(-1);
  const heavyRangePoints = filterPointsByRangeEndDate(
    data.heavyPoints,
    rangeDays,
    latestDateKey
  );
  const moderateRangePoints = filterPointsByRangeEndDate(
    data.moderatePoints,
    rangeDays,
    latestDateKey
  );
  const lowConfidenceRangePoints = filterPointsByRangeEndDate(
    data.lowConfidencePoints,
    rangeDays,
    latestDateKey
  );
  const heavyPoints = getRollingAveragePoints(heavyRangePoints);
  const moderatePoints = getRollingAveragePoints(moderateRangePoints);

  return {
    heavyPoints,
    heavyRegression: getLinearRegression(heavyPoints),
    latestDateKey,
    lowConfidencePoints: lowConfidenceRangePoints,
    moderatePoints,
    moderateRegression: getLinearRegression(moderatePoints),
  };
}

function getBenchTrendRead(regression) {
  if (!regression || regression.pointCount < 4) {
    return {
      label: "Limited",
      tone: "neutral",
    };
  }

  if (regression.slopePerWeek > BENCH_TREND_FLAT_THRESHOLD_LB_PER_WEEK) {
    return {
      label: "Rising",
      tone: "positive",
    };
  }

  if (regression.slopePerWeek < -BENCH_TREND_FLAT_THRESHOLD_LB_PER_WEEK) {
    return {
      label: "Falling",
      tone: "negative",
    };
  }

  return {
    label: "Flat",
    tone: "neutral",
  };
}

function getBenchRatioRead(ratio) {
  if (!Number.isFinite(ratio)) {
    return {
      label: "Unavailable",
      tone: "neutral",
    };
  }

  if (ratio >= BENCH_RATIO_ALIGNED_THRESHOLD) {
    return {
      label: "Aligned",
      tone: "positive",
    };
  }

  if (ratio >= BENCH_RATIO_LAGGING_THRESHOLD) {
    return {
      label: "Slight lag",
      tone: "neutral",
    };
  }

  return {
    label: "Lagging",
    tone: "negative",
  };
}

function getBenchFatigueRead(latestFatigue) {
  if (!latestFatigue) {
    return {
      label: "Unavailable",
      tone: "neutral",
    };
  }

  if (Number.isFinite(latestFatigue.e1rmDropPercent)) {
    if (latestFatigue.e1rmDropPercent <= 2) {
      return {
        label: "Stable",
        tone: "positive",
      };
    }

    if (latestFatigue.e1rmDropPercent >= 6) {
      return {
        label: "Dropping",
        tone: "negative",
      };
    }
  }

  return {
    label: "Watch",
    tone: "neutral",
  };
}

function formatBenchSlope(regression) {
  if (!regression) {
    return "—";
  }

  const sign = regression.slopePerWeek > 0 ? "+" : "";

  return `${sign}${formatBenchMetric(regression.slopePerWeek, 2, " lb/week")}`;
}

function getSetLabel(set) {
  return set
    ? `${formatBenchMetric(set.weight, 1)} x ${formatBenchMetric(
        set.reps,
        0
      )} @ ${formatBenchMetric(set.rir, 1)}`
    : "—";
}

function getBestBenchmarkSet(sets, predicate) {
  return sets
    .filter(predicate)
    .sort(
      (left, right) =>
        right.weight - left.weight ||
        right.reps - left.reps ||
        right.rir - left.rir ||
        right.e1rm - left.e1rm
    )[0] || null;
}

function getBestRepBenchmarkSet(sets, targetWeight) {
  return sets
    .filter(
      (set) =>
        set.weight === targetWeight &&
        Number.isFinite(set.reps) &&
        Number.isFinite(set.rir) &&
        set.rir >= 0 &&
        set.rir <= 3
    )
    .sort(
      (left, right) =>
        right.reps - left.reps ||
        right.rir - left.rir ||
        right.e1rm - left.e1rm
    )[0] || null;
}

function getWorkoutFatigueSummary(entry, sets) {
  const firstSet = sets[0] || null;
  const secondSet = sets[1] || null;
  const e1rmDropPercent =
    firstSet?.e1rm && secondSet?.e1rm
      ? ((firstSet.e1rm - secondSet.e1rm) / firstSet.e1rm) * 100
      : null;
  const repeatedWeightGroups = sets.reduce((groups, set) => {
    if (!Number.isFinite(set.weight) || !Number.isFinite(set.reps)) {
      return groups;
    }

    const key = String(set.weight);
    const group = groups.get(key) || {
      reps: 0,
      sets: 0,
      weight: set.weight,
    };

    group.reps += set.reps;
    group.sets += 1;
    groups.set(key, group);

    return groups;
  }, new Map());
  const bestRepeatedWeight =
    [...repeatedWeightGroups.values()]
      .filter((group) => group.sets > 1)
      .sort(
        (left, right) =>
          right.weight - left.weight ||
          right.reps - left.reps ||
          right.sets - left.sets
      )[0] || null;

  return {
    date: entry.completedAt,
    e1rmDropPercent,
    repeatedWeight: bestRepeatedWeight,
  };
}

function buildBenchPressExperiment(exerciseHistory) {
  const workouts = [...exerciseHistory]
    .filter((entry) => entry.completedDateKey)
    .sort((left, right) =>
      left.completedDateKey.localeCompare(right.completedDateKey)
    )
    .map((entry, index) => {
      const sets = (entry.sets || [])
        .map((set) => {
          const prescribedRepRange = parsePrescribedRepRange(
            set.prescribedReps
          );

          return {
            dateKey: entry.completedDateKey,
            e1rm: parseHistoryNumber(set.e1rm),
            prescribedRepRange,
            prescribedReps: set.prescribedReps,
            prescriptionZone: getPrescriptionZone(prescribedRepRange),
            reps: parseHistoryNumber(set.reps),
            rir: parseHistoryNumber(set.rir),
            setNumber: set.setNumber,
            weight: parseHistoryNumber(set.weight),
            workoutIndex: index,
          };
        })
        .filter((set) => Number.isFinite(set.weight) && Number.isFinite(set.reps));
      const heavySet = getBestSet(
        sets.filter(
          (set) =>
            set.prescriptionZone === "heavy" &&
            setMeetsPrescription(set) &&
            Number.isFinite(set.e1rm) &&
            Number.isFinite(set.rir) &&
            set.rir >= 0 &&
            set.rir <= 2
        )
      );
      const moderateSet = getBestSet(
        sets.filter(
          (set) =>
            set.prescriptionZone === "moderate" &&
            setMeetsPrescription(set) &&
            Number.isFinite(set.e1rm) &&
            Number.isFinite(set.rir) &&
            set.rir >= 0 &&
            set.rir <= 2
        )
      );
      const lowConfidenceSet = getBestSet(
        sets.filter(
          (set) =>
            set.prescriptionZone &&
            setMeetsPrescription(set) &&
            Number.isFinite(set.e1rm) &&
            Number.isFinite(set.rir) &&
            set.rir >= 3
        )
      );

      return {
        ...entry,
        fatigue: getWorkoutFatigueSummary(entry, sets),
        heavySet,
        lowConfidenceSet,
        moderateSet,
        sets,
      };
    });
  const heavyPoints = workouts
    .filter((workout) => workout.heavySet)
    .map((workout, index) => ({
      dateKey: workout.completedDateKey,
      key: `heavy-${workout.completedDateKey}-${index}`,
      label: `${workout.completedAt} · ${getSetLabel(workout.heavySet)}`,
      set: workout.heavySet,
      value: workout.heavySet.e1rm,
    }));
  const moderatePoints = workouts
    .filter((workout) => workout.moderateSet)
    .map((workout, index) => ({
      dateKey: workout.completedDateKey,
      key: `moderate-${workout.completedDateKey}-${index}`,
      label: `${workout.completedAt} · ${getSetLabel(workout.moderateSet)}`,
      set: workout.moderateSet,
      value: workout.moderateSet.e1rm,
    }));
  const allSets = workouts.flatMap((workout) =>
    workout.sets.map((set) => ({
      ...set,
      completedAt: workout.completedAt,
      templateName: workout.templateName,
    }))
  );
  const latestHeavyRolling = getRollingAveragePoints(heavyPoints).at(-1)?.value;
  const latestModerateRolling = getRollingAveragePoints(moderatePoints).at(-1)?.value;
  const heavyRegression = getLinearRegression(getRollingAveragePoints(heavyPoints));
  const moderateRegression = getLinearRegression(
    getRollingAveragePoints(moderatePoints)
  );
  const heavyExpressionRatio =
    latestHeavyRolling && latestModerateRolling
      ? latestHeavyRolling / latestModerateRolling
      : null;
  const latestFatigue =
    [...workouts].reverse().find(
      (workout) =>
        Number.isFinite(workout.fatigue.e1rmDropPercent) ||
        workout.fatigue.repeatedWeight
    )?.fatigue || null;

  return {
    benchmark6Rep: getBestBenchmarkSet(
      allSets,
      (set) => set.reps >= 6 && set.rir >= 1
    ),
    benchmark8Rep: getBestBenchmarkSet(
      allSets,
      (set) => set.reps >= 8 && set.rir >= 1
    ),
    benchmark135: getBestRepBenchmarkSet(allSets, 135),
    benchmark145: getBestRepBenchmarkSet(allSets, 145),
    heavyExpressionRatio,
    heavyPoints,
    heavyRegression,
    latestFatigue,
    lowConfidencePoints: workouts
      .filter((workout) => workout.lowConfidenceSet)
      .map((workout, index) => ({
        dateKey: workout.completedDateKey,
        key: `low-${workout.completedDateKey}-${index}`,
        label: `${workout.completedAt} · ${getSetLabel(workout.lowConfidenceSet)}`,
        set: workout.lowConfidenceSet,
        value: workout.lowConfidenceSet.e1rm,
      })),
    moderatePoints,
    moderateRegression,
  };
}

function HistorySummaryItem({ icon: Icon, label, value }) {
  return (
    <div
      style={{
        alignItems: "center",
        display: "grid",
        gap: "6px",
        gridTemplateColumns: "auto minmax(0, 1fr)",
        minWidth: 0,
      }}
    >
      <Icon size={17} color="var(--accent)" />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            color: "var(--text-muted)",
            fontSize: "11px",
            lineHeight: 1.1,
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontSize: "14px",
            fontWeight: 700,
            lineHeight: 1.2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function SelectionSheet({
  colorTrend,
  mode = "trend",
  onClose,
  onSelect,
  onSelectRange,
  onToggleColorTrend,
  onToggleRegression,
  options,
  rangeOptions = [],
  rangeSelectedValue,
  regressionEnabled = false,
  selectedValue,
  showColorTrendToggle = false,
  showRangeToggle = false,
  showRegressionToggle = false,
  title,
}) {
  const [activeMode, setActiveMode] = useState(mode);
  const activeOptions =
    activeMode === "range" && showRangeToggle ? rangeOptions : options;
  const activeSelectedValue =
    activeMode === "range" && showRangeToggle ? rangeSelectedValue : selectedValue;
  const activeOnSelect =
    activeMode === "range" && showRangeToggle ? onSelectRange : onSelect;
  const activeTitle =
    activeMode === "range" && showRangeToggle ? "Exercise range" : title;

  return (
    <div
      aria-label={activeTitle}
      aria-modal="true"
      onClick={onClose}
      role="dialog"
      style={{
        alignItems: "flex-end",
        background: "rgba(0,0,0,.45)",
        display: "flex",
        inset: 0,
        justifyContent: "center",
        position: "fixed",
        zIndex: 1600,
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
          gap: "8px",
          maxHeight: "82vh",
          maxWidth: "420px",
          overflow: "auto",
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
          <h3
            style={{
              fontSize: "17px",
              margin: 0,
            }}
          >
            {activeTitle}
          </h3>
          <div
            style={{
              display: "inline-flex",
              gap: "6px",
            }}
          >
            {showColorTrendToggle && (
              <button
                aria-label={
                  colorTrend
                    ? "Turn e1RM trend coloring off"
                    : "Turn e1RM trend coloring on"
                }
                aria-pressed={colorTrend}
                onClick={onToggleColorTrend}
                style={{
                  alignItems: "center",
                  borderColor: colorTrend ? TREND_COLORS.increasing : undefined,
                  color: colorTrend ? TREND_COLORS.increasing : undefined,
                  display: "grid",
                  justifyContent: "center",
                  minHeight: "34px",
                  minWidth: "34px",
                  padding: 0,
                  placeItems: "center",
                }}
                title={
                  colorTrend
                    ? "Trend coloring is on"
                    : "Trend coloring is off"
                }
                type="button"
              >
                <span
                  style={{
                    alignItems: "center",
                    display: "grid",
                    gap: "1px",
                    justifyItems: "center",
                    lineHeight: 1,
                  }}
                >
                  <Palette size={17} />
                  {colorTrend && (
                    <span
                      aria-hidden="true"
                      style={{
                        display: "grid",
                        gap: "1px",
                        gridTemplateColumns: "repeat(3, 4px)",
                      }}
                    >
                      {[
                        TREND_COLORS.decreasing,
                        TREND_COLORS.flat,
                        TREND_COLORS.increasing,
                      ].map((color) => (
                        <span
                          key={color}
                          style={{
                            background: color,
                            borderRadius: "999px",
                            height: "4px",
                            width: "4px",
                          }}
                        />
                      ))}
                    </span>
                  )}
                </span>
              </button>
            )}
            {showRangeToggle && (
              <button
                aria-label={
                  activeMode === "range"
                    ? "Show exercise trend options"
                    : "Show exercise range options"
                }
                aria-pressed={activeMode === "range"}
                onClick={() =>
                  setActiveMode((currentMode) =>
                    currentMode === "range" ? "trend" : "range"
                  )
                }
                style={{
                  alignItems: "center",
                  borderColor:
                    activeMode === "range" || rangeSelectedValue
                      ? "var(--accent)"
                      : undefined,
                  color:
                    activeMode === "range" || rangeSelectedValue
                      ? "var(--accent)"
                      : undefined,
                  display: "grid",
                  justifyContent: "center",
                  minHeight: "34px",
                  minWidth: "34px",
                  padding: 0,
                  placeItems: "center",
                }}
                title={`Range: ${getOptionLabel(rangeOptions, rangeSelectedValue)}`}
                type="button"
              >
                <CalendarDays size={17} />
              </button>
            )}
            {showRegressionToggle && (
              <button
                aria-label={
                  regressionEnabled
                    ? "Hide regression line"
                    : "Show regression line"
                }
                aria-pressed={regressionEnabled}
                onClick={onToggleRegression}
                style={{
                  alignItems: "center",
                  borderColor: regressionEnabled ? "var(--accent)" : undefined,
                  color: regressionEnabled ? "var(--accent)" : undefined,
                  display: "grid",
                  justifyContent: "center",
                  minHeight: "34px",
                  minWidth: "34px",
                  padding: 0,
                  placeItems: "center",
                }}
                title={
                  regressionEnabled
                    ? "Regression line is on"
                    : "Regression line is off"
                }
                type="button"
              >
                <LineChart size={17} />
              </button>
            )}
            <button aria-label={`Close ${activeTitle}`} onClick={onClose} type="button">
              <X size={17} />
            </button>
          </div>
        </div>
        {activeOptions.map((option) => {
          const selected = option.value === activeSelectedValue;

          return (
            <button
              key={option.label}
              onClick={() => {
                activeOnSelect?.(option.value);
                onClose();
              }}
              style={{
                alignItems: "center",
                display: "grid",
                gap: "8px",
                gridTemplateColumns: "20px minmax(0, 1fr)",
                justifyItems: "start",
                minHeight: "42px",
                textAlign: "left",
              }}
              type="button"
            >
              {selected ? <Check size={17} color="var(--accent)" /> : <span />}
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PortalSelectionSheet(props) {
  if (typeof document === "undefined") {
    return <SelectionSheet {...props} />;
  }

  return createPortal(<SelectionSheet {...props} />, document.body);
}

function MetricChart({ colorTrend, data, metric, rangeDays, trendDays }) {
  const [selectedPointKey, setSelectedPointKey] = useState(null);
  const scrubbingRef = useRef(false);
  const allPoints = data
    .map((entry, index) => ({
      dateKey: entry.completedDateKey,
      key: `${entry.completedDateKey || "date"}-${index}`,
      label: entry.completedAt,
      value: metric === "maxWeight" ? entry.maxWeight : entry.maxE1RM,
    }))
    .filter((point) => Number.isFinite(point.value) && point.dateKey)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  const points = filterPointsByRange(allPoints, rangeDays);
  const trendPoints = buildTrendPoints(points, trendDays);
  const trendColorPoints = trendDays ? trendPoints : points;
  const trendDirection =
    metric === "e1rm" && colorTrend
      ? getRegressionTrendDirection(trendColorPoints)
      : null;
  const chartColor = trendDirection
    ? TREND_COLORS[trendDirection]
    : "var(--accent)";

  if (points.length < 2) {
    return (
      <div
        style={{
          alignItems: "center",
          background: "var(--surface-muted)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          color: "var(--text-muted)",
          display: "flex",
          fontSize: "12px",
          justifyContent: "center",
          minHeight: "260px",
          padding: "12px",
        }}
      >
        Not enough history for a chart yet.
      </div>
    );
  }

  const width = 360;
  const height = 360;
  const paddingLeft = 42;
  const paddingRight = 16;
  const paddingTop = 22;
  const paddingBottom = 34;
  const min = Math.min(...points.map((point) => point.value));
  const max = Math.max(...points.map((point) => point.value));
  const range = max - min || 1;
  const firstDate = points[0].dateKey;
  const lastDate = points[points.length - 1].dateKey;
  const middleDate = points[Math.floor((points.length - 1) / 2)]?.dateKey || firstDate;
  const dateSpan = Math.max(1, daysBetween(firstDate, lastDate));
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;
  const plotPoint = (point) => {
    const x =
      points.length === 1
        ? width / 2
        : paddingLeft +
          (daysBetween(firstDate, point.dateKey) / dateSpan) * plotWidth;
    const y =
      height -
      paddingBottom -
      ((point.value - min) / range) * plotHeight;

    return {
      ...point,
      x,
      y,
    };
  };
  const plotted = points.map(plotPoint);
  const trendPlotted = trendPoints.map(plotPoint);
  const selectedPoint =
    plotted.find((point) => point.key === selectedPointKey) || null;
  const selectedLabelX = selectedPoint
    ? Math.min(width - 52, Math.max(paddingLeft + 52, selectedPoint.x))
    : 0;
  const selectedLabelY = selectedPoint
    ? Math.max(paddingTop + 18, selectedPoint.y - 18)
    : 0;
  const selectedValueLabel = selectedPoint
    ? `${selectedPoint.value.toFixed(1)} lb`
    : "";
  const selectNearestPoint = (event) => {
    if (!plotted.length) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * width;
    const y = ((event.clientY - bounds.top) / bounds.height) * height;
    const plotLeft = paddingLeft;
    const plotRight = width - paddingRight;
    const plotTop = paddingTop;
    const plotBottom = height - paddingBottom;
    const hitPadding = 18;

    if (
      x < plotLeft - hitPadding ||
      x > plotRight + hitPadding ||
      y < plotTop - hitPadding ||
      y > plotBottom + hitPadding
    ) {
      setSelectedPointKey(null);
      return;
    }

    const nearest = plotted
      .map((point) => ({
        point,
        distance: Math.hypot(point.x - x, point.y - y),
      }))
      .sort((a, b) => a.distance - b.distance)[0]?.point;

    if (nearest) {
      setSelectedPointKey(nearest.key);
    }
  };
  const startPointScrub = (event) => {
    scrubbingRef.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    selectNearestPoint(event);
  };
  const scrubNearestPoint = (event) => {
    if (!scrubbingRef.current) {
      return;
    }

    selectNearestPoint(event);
  };
  const stopPointScrub = (event) => {
    scrubbingRef.current = false;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  return (
    <div
      style={{
        background: "var(--surface-muted)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "8px",
      }}
    >
      <svg
        role="img"
        aria-label={metric === "maxWeight" ? "Max weight over time" : "e1RM over time"}
        viewBox={`0 0 ${width} ${height}`}
        onPointerCancel={stopPointScrub}
        onPointerDown={startPointScrub}
        onPointerMove={scrubNearestPoint}
        onPointerUp={stopPointScrub}
        style={{
          aspectRatio: "1 / 1",
          display: "block",
          cursor: "pointer",
          touchAction: "manipulation",
          width: "100%",
        }}
      >
        <rect
          x="0"
          y="0"
          width={width}
          height={height}
          fill="transparent"
        />
        <line
          x1={paddingLeft}
          x2={width - paddingRight}
          y1={height - paddingBottom}
          y2={height - paddingBottom}
          stroke="var(--border)"
        />
        <line
          x1={paddingLeft}
          x2={paddingLeft}
          y1={paddingTop}
          y2={height - paddingBottom}
          stroke="var(--border)"
        />
        <text
          x={paddingLeft - 8}
          y={paddingTop + 4}
          fill="var(--text-muted)"
          fontSize="10"
          textAnchor="end"
        >
          {max.toFixed(1)}
        </text>
        <text
          x={paddingLeft - 8}
          y={height - paddingBottom + 4}
          fill="var(--text-muted)"
          fontSize="10"
          textAnchor="end"
        >
          {min.toFixed(1)}
        </text>
        {plotted.slice(1).map((point, index) => {
          const previous = plotted[index];

          return (
            <line
              key={`${previous.dateKey}-${point.dateKey}-${index}`}
              x1={previous.x}
              x2={point.x}
              y1={previous.y}
              y2={point.y}
              stroke={
                trendDays
                  ? `color-mix(in srgb, ${chartColor} 30%, var(--border))`
                  : chartColor
              }
              strokeLinecap="round"
              strokeWidth={trendDays ? "2" : "2.5"}
            />
          );
        })}
        {trendDays &&
          trendPlotted.slice(1).map((point, index) => {
            const previous = trendPlotted[index];

            return (
              <line
                key={`trend-${previous.dateKey}-${point.dateKey}-${index}`}
                x1={previous.x}
                x2={point.x}
                y1={previous.y}
                y2={point.y}
                stroke={chartColor}
                strokeLinecap="round"
                strokeWidth="3.5"
              />
            );
          })}
        {selectedPoint && (
          <g pointerEvents="none">
            <line
              x1={selectedPoint.x}
              x2={selectedPoint.x}
              y1={paddingTop}
              y2={height - paddingBottom}
              stroke={`color-mix(in srgb, ${chartColor} 45%, var(--border))`}
              strokeDasharray="4 4"
            />
            <circle
              cx={selectedPoint.x}
              cy={selectedPoint.y}
              fill={chartColor}
              r="4"
            />
            <rect
              x={selectedLabelX - 52}
              y={selectedLabelY - 16}
              width="104"
              height="30"
              rx="7"
              fill="var(--surface-raised)"
              stroke="var(--border)"
            />
            <text
              x={selectedLabelX}
              y={selectedLabelY - 3}
              fill="var(--text-h)"
              fontSize="11"
              fontWeight="bold"
              textAnchor="middle"
            >
              {selectedValueLabel}
            </text>
            <text
              x={selectedLabelX}
              y={selectedLabelY + 10}
              fill="var(--text-muted)"
              fontSize="9"
              textAnchor="middle"
            >
              {selectedPoint.label || selectedPoint.dateKey}
            </text>
          </g>
        )}
        <text
          x={paddingLeft}
          y={height - 7}
          fill="var(--text-muted)"
          fontSize="10"
        >
          {firstDate}
        </text>
        {points.length > 2 && (
          <text
            x={paddingLeft + plotWidth / 2}
            y={height - 7}
            fill="var(--text-muted)"
            fontSize="10"
            textAnchor="middle"
          >
            {middleDate}
          </text>
        )}
        <text
          x={width - paddingRight}
          y={height - 7}
          fill="var(--text-muted)"
          fontSize="10"
          textAnchor="end"
        >
          {lastDate}
        </text>
      </svg>
    </div>
  );
}

function BenchExperimentStat({ label, sublabel, value }) {
  return (
    <div
      style={{
        background: "var(--surface-muted)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        display: "grid",
        gap: "3px",
        padding: "8px",
      }}
    >
      <div
        style={{
          color: "var(--text-muted)",
          fontSize: "11px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "14px",
          fontWeight: 800,
          lineHeight: 1.15,
        }}
      >
        {value}
      </div>
      {sublabel && (
        <div
          style={{
            color: "var(--text-muted)",
            fontSize: "11px",
            lineHeight: 1.2,
          }}
        >
          {sublabel}
        </div>
      )}
    </div>
  );
}

function BenchZoneChart({
  data,
  rangeDays,
  showTrendLines = false,
}) {
  const [selectedPointKey, setSelectedPointKey] = useState(null);
  const {
    heavyPoints,
    heavyRegression,
    latestDateKey,
    lowConfidencePoints,
    moderatePoints,
    moderateRegression,
  } = buildBenchExperimentChartSeries(data, rangeDays);
  const regressionEndpointPoints = showTrendLines
    ? [
        heavyRegression?.start,
        heavyRegression?.end,
        moderateRegression?.start,
        moderateRegression?.end,
      ].filter(Boolean)
    : [];
  const allDatedPoints = [
    ...heavyPoints,
    ...moderatePoints,
    ...lowConfidencePoints,
    ...regressionEndpointPoints,
  ].filter((point) => Number.isFinite(point.value) && point.dateKey);

  if (allDatedPoints.length < 2) {
    return (
      <div
        style={{
          alignItems: "center",
          background: "var(--surface-muted)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          color: "var(--text-muted)",
          display: "flex",
          fontSize: "12px",
          justifyContent: "center",
          minHeight: "220px",
          padding: "12px",
          textAlign: "center",
        }}
      >
        Not enough prescription-classified bench data for zone trends yet.
      </div>
    );
  }

  const width = 360;
  const height = 300;
  const paddingLeft = 42;
  const paddingRight = 16;
  const paddingTop = 22;
  const paddingBottom = 34;
  const sortedByDate = [...allDatedPoints].sort((left, right) =>
    left.dateKey.localeCompare(right.dateKey)
  );
  const lastDate = rangeDays && latestDateKey
    ? latestDateKey
    : sortedByDate[sortedByDate.length - 1].dateKey;
  const firstDate =
    rangeDays && latestDateKey
      ? addDaysToDateKey(latestDateKey, -rangeDays)
      : sortedByDate[0].dateKey;
  const dateSpan = Math.max(1, daysBetween(firstDate, lastDate));
  const values = allDatedPoints.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;
  const plotPoint = (point) => ({
    ...point,
    x:
      paddingLeft +
      (daysBetween(firstDate, point.dateKey) / dateSpan) * plotWidth,
    y:
      height -
      paddingBottom -
      ((point.value - min) / range) * plotHeight,
  });
  const heavyPlotted = heavyPoints.map((point) => ({
    ...plotPoint(point),
    color: BENCH_ZONE_COLORS.heavy,
    zone: "Heavy",
  }));
  const moderatePlotted = moderatePoints.map((point) => ({
    ...plotPoint(point),
    color: BENCH_ZONE_COLORS.moderate,
    zone: "Moderate",
  }));
  const lowConfidencePlotted = lowConfidencePoints.map((point) => ({
    ...plotPoint(point),
    color: BENCH_ZONE_COLORS.lowConfidence,
    zone: "Low confidence",
  }));
  const selectedPoint =
    [...heavyPlotted, ...moderatePlotted, ...lowConfidencePlotted].find(
      (point) => point.key === selectedPointKey
    ) || null;
  const selectedPointPrimaryLabel = selectedPoint
    ? `${selectedPoint.zone}${
        Number.isFinite(selectedPoint.rawValue) ? " rolling" : ""
      }: ${formatBenchMetric(selectedPoint.value, 1, " lb")}`
    : "";
  const selectedPointDetailLabel = selectedPoint
    ? Number.isFinite(selectedPoint.rawValue)
      ? `${selectedPoint.dateKey} · Raw ${formatBenchMetric(
          selectedPoint.rawValue,
          1,
          " lb"
        )} · Set ${selectedPoint.set.setNumber} · Prescribed ${
          selectedPoint.set.prescribedRepRange.label
        } reps · Actual ${getSetLabel(selectedPoint.set)}`
      : selectedPoint.label
    : "";
  const plotRegression = (regression) => {
    if (!regression) {
      return null;
    }

    return {
      end: plotPoint(regression.end),
      start: plotPoint(regression.start),
    };
  };
  const heavyRegressionLine = showTrendLines
    ? plotRegression(heavyRegression)
    : null;
  const moderateRegressionLine = showTrendLines
    ? plotRegression(moderateRegression)
    : null;

  function renderLine(points, color) {
    return points.slice(1).map((point, index) => {
      const previous = points[index];

      return (
        <line
          key={`${color}-${previous.key}-${point.key}`}
          x1={previous.x}
          x2={point.x}
          y1={previous.y}
          y2={point.y}
          stroke={color}
          strokeLinecap="round"
          strokeWidth="3"
        />
      );
    });
  }

  function renderRegressionLine(regressionLine, color, key) {
    if (!regressionLine) {
      return null;
    }

    return (
      <line
        key={key}
        x1={regressionLine.start.x}
        x2={regressionLine.end.x}
        y1={regressionLine.start.y}
        y2={regressionLine.end.y}
        stroke={color}
        strokeDasharray="6 5"
        strokeLinecap="round"
        strokeWidth="2"
      />
    );
  }

  return (
    <div
      style={{
        background: "var(--surface-muted)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "8px",
      }}
    >
      {selectedPoint && (
        <div
          style={{
            background: "var(--surface-raised)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            display: "grid",
            gap: "3px",
            marginBottom: "8px",
            padding: "8px",
          }}
        >
          <div
            style={{
              color: selectedPoint.color,
              fontSize: "13px",
              fontWeight: 800,
              lineHeight: 1.2,
            }}
          >
            {selectedPointPrimaryLabel}
          </div>
          <div
            style={{
              color: "var(--text-muted)",
              fontSize: "12px",
              lineHeight: 1.25,
            }}
          >
            {selectedPointDetailLabel}
          </div>
        </div>
      )}
      <svg
        aria-label="Bench press heavy and moderate zone e1RM trends"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
        onPointerDown={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const x = ((event.clientX - bounds.left) / bounds.width) * width;
          const y = ((event.clientY - bounds.top) / bounds.height) * height;
          const nearest = [
            ...heavyPlotted,
            ...moderatePlotted,
            ...lowConfidencePlotted,
          ]
            .map((point) => ({
              distance: Math.hypot(point.x - x, point.y - y),
              point,
            }))
            .sort((left, right) => left.distance - right.distance)[0];

          setSelectedPointKey(
            nearest && nearest.distance <= 28 ? nearest.point.key : null
          );
        }}
        style={{
          display: "block",
          touchAction: "manipulation",
          width: "100%",
        }}
      >
        <rect width={width} height={height} fill="transparent" />
        <line
          x1={paddingLeft}
          x2={width - paddingRight}
          y1={height - paddingBottom}
          y2={height - paddingBottom}
          stroke="var(--border)"
        />
        <line
          x1={paddingLeft}
          x2={paddingLeft}
          y1={paddingTop}
          y2={height - paddingBottom}
          stroke="var(--border)"
        />
        <text
          x={paddingLeft - 8}
          y={paddingTop + 4}
          fill="var(--text-muted)"
          fontSize="10"
          textAnchor="end"
        >
          {max.toFixed(1)}
        </text>
        <text
          x={paddingLeft - 8}
          y={height - paddingBottom + 4}
          fill="var(--text-muted)"
          fontSize="10"
          textAnchor="end"
        >
          {min.toFixed(1)}
        </text>
        {renderLine(heavyPlotted, BENCH_ZONE_COLORS.heavy)}
        {renderLine(moderatePlotted, BENCH_ZONE_COLORS.moderate)}
        {renderRegressionLine(
          heavyRegressionLine,
          BENCH_ZONE_COLORS.heavy,
          "heavy-regression"
        )}
        {renderRegressionLine(
          moderateRegressionLine,
          BENCH_ZONE_COLORS.moderate,
          "moderate-regression"
        )}
        {lowConfidencePlotted.map((point) => (
          <circle
            key={point.key}
            cx={point.x}
            cy={point.y}
            fill={BENCH_ZONE_COLORS.lowConfidence}
            opacity=".38"
            r="3"
          />
        ))}
        {heavyPlotted.map((point) => (
          <circle
            key={point.key}
            cx={point.x}
            cy={point.y}
            fill={BENCH_ZONE_COLORS.heavy}
            r="3.5"
          />
        ))}
        {moderatePlotted.map((point) => (
          <circle
            key={point.key}
            cx={point.x}
            cy={point.y}
            fill={BENCH_ZONE_COLORS.moderate}
            r="3.5"
          />
        ))}
        {selectedPoint && (
          <g pointerEvents="none">
            <line
              x1={paddingLeft}
              x2={selectedPoint.x}
              y1={selectedPoint.y}
              y2={selectedPoint.y}
              stroke={selectedPoint.color}
              strokeDasharray="4 4"
              strokeLinecap="round"
              strokeWidth="1.5"
            />
            <line
              x1={selectedPoint.x}
              x2={selectedPoint.x}
              y1={selectedPoint.y}
              y2={height - paddingBottom}
              stroke={selectedPoint.color}
              strokeDasharray="4 4"
              strokeLinecap="round"
              strokeWidth="1.5"
            />
            <circle
              cx={selectedPoint.x}
              cy={selectedPoint.y}
              fill="var(--surface-raised)"
              r="5.5"
              stroke={selectedPoint.color}
              strokeWidth="2"
            />
          </g>
        )}
        <text
          x={paddingLeft}
          y={height - 7}
          fill="var(--text-muted)"
          fontSize="10"
        >
          {firstDate}
        </text>
        <text
          x={width - paddingRight}
          y={height - 7}
          fill="var(--text-muted)"
          fontSize="10"
          textAnchor="end"
        >
          {lastDate}
        </text>
      </svg>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "10px",
          justifyContent: "center",
          marginTop: "6px",
        }}
      >
        {[
          ["Heavy 3-7 reps, 0-2 RIR", BENCH_ZONE_COLORS.heavy],
          ["Moderate 8-12 reps, 0-2 RIR", BENCH_ZONE_COLORS.moderate],
          ["Low-confidence >=3 RIR", BENCH_ZONE_COLORS.lowConfidence],
        ].map(([label, color]) => (
          <span
            key={label}
            style={{
              alignItems: "center",
              color: "var(--text-muted)",
              display: "inline-flex",
              fontSize: "11px",
              gap: "5px",
            }}
          >
            <span
              style={{
                background: color,
                borderRadius: "999px",
                height: "8px",
                width: "8px",
              }}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function BenchReadItem({ label, read, detail }) {
  const toneColors = {
    negative: "var(--danger-text)",
    neutral: "var(--text-muted)",
    positive: "var(--success-text)",
  };

  return (
    <div
      style={{
        background: "var(--surface-muted)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "8px",
      }}
    >
      <div
        style={{
          color: "var(--text-muted)",
          fontSize: "11px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: toneColors[read.tone] || toneColors.neutral,
          fontSize: "14px",
          fontWeight: 800,
          lineHeight: 1.15,
        }}
      >
        {read.label}
      </div>
      {detail && (
        <div
          style={{
            color: "var(--text-muted)",
            fontSize: "11px",
            lineHeight: 1.2,
          }}
        >
          {detail}
        </div>
      )}
    </div>
  );
}

function BenchmarkPerformance({ benchmarkFamily, exerciseHistory }) {
  const historySummary = buildHistorySummary(exerciseHistory);
  const latestEntry = getLatestHistoryEntry(exerciseHistory);
  const bestSet = getBestHistorySet(exerciseHistory);

  return (
    <BenchmarkZoneExperiment
      benchmarkFamily={benchmarkFamily}
      exerciseHistory={exerciseHistory}
      summaryStats={[
        {
          label: "Benchmark family",
          sublabel: "Current categorization",
          value: benchmarkFamily || "Not categorized",
        },
        {
          label: "Workouts",
          sublabel: "Completed history",
          value: historySummary.workouts,
        },
        {
          label: "Best e1RM",
          sublabel: bestSet?.completedAt || "No completed set",
          value: formatE1RM(historySummary.maxE1RM),
        },
        {
          label: "Latest e1RM",
          sublabel: latestEntry?.completedAt || "No completed workout",
          value: formatE1RM(latestEntry?.maxE1RM),
        },
        {
          label: "Best set",
          sublabel: bestSet?.completedAt || "No completed set",
          value: getSetLabel(bestSet),
        },
      ]}
      title="Benchmark"
    />
  );
}

function BenchPressExperiment({ exerciseHistory }) {
  return (
    <BenchmarkZoneExperiment
      description="Temporary bench-only view comparing heavy strength expression against moderate-rep performance."
      exerciseHistory={exerciseHistory}
      showBenchPressStats
      title="Bench Press Experiment"
    />
  );
}

function BenchmarkZoneExperiment({
  description = "Exercise-specific benchmark history comparing heavy strength expression against moderate-rep performance.",
  exerciseHistory,
  showBenchPressStats = false,
  summaryStats = [],
  title,
}) {
  const [rangeDays, setRangeDays] = useState(null);
  const [showTrendLines, setShowTrendLines] = useState(false);
  const [trendSheetOpen, setTrendSheetOpen] = useState(false);
  const data = useMemo(
    () => buildBenchPressExperiment(exerciseHistory),
    [exerciseHistory]
  );
  const chartSeries = useMemo(
    () => buildBenchExperimentChartSeries(data, rangeDays),
    [data, rangeDays]
  );
  const latestHeavy = chartSeries.heavyPoints;
  const latestModerate = chartSeries.moderatePoints;
  const latestHeavyValue =
    latestHeavy.length > 0 ? latestHeavy[latestHeavy.length - 1].value : null;
  const latestModerateValue =
    latestModerate.length > 0
      ? latestModerate[latestModerate.length - 1].value
      : null;
  const visibleHeavyExpressionRatio =
    latestHeavyValue && latestModerateValue
      ? latestHeavyValue / latestModerateValue
      : null;
  const heavyRead = getBenchTrendRead(chartSeries.heavyRegression);
  const moderateRead = getBenchTrendRead(chartSeries.moderateRegression);
  const ratioRead = getBenchRatioRead(visibleHeavyExpressionRatio);
  const fatigueRead = getBenchFatigueRead(data.latestFatigue);
  const rangeLabel = getOptionLabel(RANGE_OPTIONS, rangeDays);

  return (
    <section
      style={{
        border: "1px solid var(--border)",
        borderRadius: "8px",
        display: "grid",
        gap: "10px",
        padding: "10px",
      }}
    >
      <div>
        <h3
          style={{
            fontSize: "15px",
            margin: "0 0 4px",
          }}
        >
          {title}
        </h3>
        <div
          style={{
            color: "var(--text-muted)",
            fontSize: "12px",
          }}
        >
          {description}
        </div>
      </div>
      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: "8px",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            color: "var(--text-muted)",
            fontSize: "12px",
          }}
        >
          Running averages and regression use the selected calendar range.
        </div>
        <button
          aria-label={`Set bench experiment range, current ${rangeLabel}`}
          aria-pressed={Boolean(rangeDays || showTrendLines)}
          onClick={() => setTrendSheetOpen(true)}
          style={{
            alignItems: "center",
            borderColor:
              rangeDays || showTrendLines
                ? "var(--accent)"
                : undefined,
            color:
              rangeDays || showTrendLines
                ? "var(--accent)"
                : undefined,
            display: "inline-flex",
            gap: "5px",
            minHeight: "32px",
            padding: "4px 9px",
            whiteSpace: "nowrap",
          }}
          title={`Range: ${rangeLabel}`}
          type="button"
        >
          <TrendingUp size={14} />
          Trend
        </button>
      </div>
      <BenchZoneChart
        data={data}
        rangeDays={rangeDays}
        showTrendLines={showTrendLines}
      />
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: "8px",
          display: "grid",
          gap: "8px",
          padding: "8px",
        }}
      >
        <div
          style={{
            fontSize: "13px",
            fontWeight: 800,
          }}
        >
          Current read
        </div>
        <div
          style={{
            display: "grid",
            gap: "8px",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          }}
        >
          <BenchReadItem
            detail={formatBenchSlope(chartSeries.heavyRegression)}
            label="Heavy trend"
            read={heavyRead}
          />
          <BenchReadItem
            detail={formatBenchSlope(chartSeries.moderateRegression)}
            label="Moderate trend"
            read={moderateRead}
          />
          <BenchReadItem
            detail={formatBenchMetric(visibleHeavyExpressionRatio, 3)}
            label="Heavy expression"
            read={ratioRead}
          />
          <BenchReadItem
            detail={data.latestFatigue?.date || "Latest comparable workout"}
            label="Repeatability"
            read={fatigueRead}
          />
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gap: "8px",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        }}
      >
        <BenchExperimentStat
          label="Heavy rolling e1RM"
          sublabel="3-7 reps, 0-2 RIR"
          value={formatBenchMetric(latestHeavyValue, 1, " lb")}
        />
        <BenchExperimentStat
          label="Moderate rolling e1RM"
          sublabel="8-12 reps, 0-2 RIR"
          value={formatBenchMetric(latestModerateValue, 1, " lb")}
        />
        <BenchExperimentStat
          label="Heavy / moderate"
          sublabel="Rolling values"
          value={formatBenchMetric(visibleHeavyExpressionRatio, 3)}
        />
        <BenchExperimentStat
          label="Low-confidence sets"
          sublabel="Best >=3 RIR points shown faintly"
          value={chartSeries.lowConfidencePoints.length}
        />
      </div>
      {summaryStats.length > 0 && (
        <div
          style={{
            display: "grid",
            gap: "8px",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          }}
        >
          {summaryStats.map((stat) => (
            <BenchExperimentStat
              key={stat.label}
              label={stat.label}
              sublabel={stat.sublabel}
              value={stat.value}
            />
          ))}
        </div>
      )}
      {showBenchPressStats && (
        <>
          <div
            style={{
              display: "grid",
              gap: "8px",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            }}
          >
            <BenchExperimentStat
              label="Best 6+ rep set"
              sublabel="At least 1 RIR"
              value={getSetLabel(data.benchmark6Rep)}
            />
            <BenchExperimentStat
              label="Best 8+ rep set"
              sublabel="At least 1 RIR"
              value={getSetLabel(data.benchmark8Rep)}
            />
            <BenchExperimentStat
              label="Best at 135 lb"
              sublabel="0-3 RIR"
              value={getSetLabel(data.benchmark135)}
            />
            <BenchExperimentStat
              label="Best at 145 lb"
              sublabel="0-3 RIR"
              value={getSetLabel(data.benchmark145)}
            />
          </div>
          <div
            style={{
              display: "grid",
              gap: "8px",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            }}
          >
            <BenchExperimentStat
              label="Latest set 1 -> 2 drop"
              sublabel={data.latestFatigue?.date || "No comparable workout"}
              value={
                Number.isFinite(data.latestFatigue?.e1rmDropPercent)
                  ? `${formatBenchMetric(data.latestFatigue.e1rmDropPercent, 1)}%`
                  : "—"
              }
            />
            <BenchExperimentStat
              label="Latest same-weight retention"
              sublabel={data.latestFatigue?.date || "No repeated weight"}
              value={
                data.latestFatigue?.repeatedWeight
                  ? `${formatBenchMetric(
                      data.latestFatigue.repeatedWeight.weight,
                      1,
                      " lb"
                    )}: ${formatBenchMetric(
                      data.latestFatigue.repeatedWeight.reps,
                      0
                    )} reps`
                  : "—"
              }
            />
          </div>
        </>
      )}
      {trendSheetOpen && (
        <PortalSelectionSheet
          onClose={() => setTrendSheetOpen(false)}
          onSelect={setRangeDays}
          onToggleRegression={() =>
            setShowTrendLines((currentValue) => !currentValue)
          }
          options={RANGE_OPTIONS}
          regressionEnabled={showTrendLines}
          selectedValue={rangeDays}
          showRegressionToggle
          title="Exercise range"
        />
      )}
    </section>
  );
}

export default function ExerciseDetailDialog({
  bodyWeightEntries = [],
  exercise,
  exerciseLibrary = [],
  history = [],
  onClose,
  onSelect,
  onUpdateHistoryWorkoutSet,
  zIndex = 1400,
}) {
  const [activeTab, setActiveTab] = useState("info");
  const [chartSettings, setChartSettings] = useState(getStoredChartSettings);
  const [editingHistoryKey, setEditingHistoryKey] = useState(null);
  const [editingHistoryDraft, setEditingHistoryDraft] = useState(null);
  const [rangeSheetOpen, setRangeSheetOpen] = useState(false);
  const [trendSheetOpen, setTrendSheetOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [weightPickerData, setWeightPickerData] = useState(null);
  const [repsPickerData, setRepsPickerData] = useState(null);
  const [rirPickerData, setRirPickerData] = useState(null);
  const exerciseHistory = useMemo(
    () => buildExerciseHistory(exercise, history, bodyWeightEntries),
    [bodyWeightEntries, exercise, history]
  );
  const historySummary = useMemo(
    () => buildHistorySummary(exerciseHistory),
    [exerciseHistory]
  );
  const detailImageExercise = useMemo(() => {
    if (exercise?.imageUrl) {
      return exercise;
    }

    return (
      exerciseLibrary.find(
        (libraryExercise) =>
          libraryExercise?.imageUrl && exercisesMatch(libraryExercise, exercise)
      ) || exercise
    );
  }, [exercise, exerciseLibrary]);
  const instructionSteps = getInstructionSteps(exercise);
  const benchmark = isExerciseBenchmark(exercise);
  const benchmarkFamily = getBenchmarkFamilyForExercise(exercise);
  const { colorTrend, metric: chartMetric, rangeDays, trendDays } = chartSettings;
  const rangeLabel = getOptionLabel(RANGE_OPTIONS, rangeDays);
  const trendLabel = getOptionLabel(TREND_OPTIONS, trendDays);
  const e1RMTrendColoringActive = chartMetric === "e1rm" && colorTrend;
  const showBenchPressExperiment = isBarbellBenchPress(exercise);
  const showBenchmarkTab = benchmark;
  const activeDetailTab =
    activeTab === "benchmark" && !showBenchmarkTab ? "history" : activeTab;
  const detailTabs = [
    ["info", "Info", ListChecks],
    ["history", "History", LineChart],
    ...(showBenchmarkTab ? [["benchmark", "Benchmark", Trophy]] : []),
  ];

  function updateChartSettings(nextSettings) {
    setChartSettings((currentSettings) => {
      const updatedSettings = {
        ...currentSettings,
        ...nextSettings,
      };

      saveStoredChartSettings(updatedSettings);

      return updatedSettings;
    });
  }

  function closeExerciseDetail() {
    setIsClosing(true);
  }

  function startEditingHistoryEntry(entry) {
    const entryKey = getHistoryEntryKey(entry);

    setEditingHistoryKey(entryKey);
    setEditingHistoryDraft({
      entryKey,
      sets: Object.fromEntries(
        entry.sets.map((set) => [
          getHistorySetKey(set),
          {
            actualReps: set.reps,
            actualRir: set.rir,
            actualWeight: set.weight,
          },
        ])
      ),
    });
  }

  function cancelEditingHistoryEntry() {
    setEditingHistoryKey(null);
    setEditingHistoryDraft(null);
    setWeightPickerData(null);
    setRepsPickerData(null);
    setRirPickerData(null);
  }

  function commitEditingHistoryEntry(entry) {
    if (!editingHistoryDraft || editingHistoryDraft.entryKey !== getHistoryEntryKey(entry)) {
      cancelEditingHistoryEntry();
      return;
    }

    const updates = entry.sets.flatMap((set) => {
      const draftSet = editingHistoryDraft.sets[getHistorySetKey(set)];

      if (!draftSet) {
        return [];
      }

      return [
        ["actualWeight", set.weight],
        ["actualReps", set.reps],
        ["actualRir", set.rir],
      ]
        .filter(([field, originalValue]) => draftSet[field] !== originalValue)
        .map(([field]) => ({
          exerciseId: entry.exerciseId,
          exerciseIndex: entry.exerciseIndex,
          field,
          setId: set.setId,
          setIndex: set.setIndex,
          value: draftSet[field],
        }));
    });

    if (updates.length > 0) {
      onUpdateHistoryWorkoutSet?.({
        updates,
        workoutId: entry.workoutId,
      });
    }

    cancelEditingHistoryEntry();
  }

  function updateHistorySetDraft(pickerData, field, value) {
    if (!pickerData) {
      return;
    }

    setEditingHistoryDraft((currentDraft) => {
      if (!currentDraft || currentDraft.entryKey !== pickerData.entryKey) {
        return currentDraft;
      }

      const currentSet = currentDraft.sets[pickerData.setKey] || {};

      return {
        ...currentDraft,
        sets: {
          ...currentDraft.sets,
          [pickerData.setKey]: {
            ...currentSet,
            [field]: value,
          },
        },
      };
    });
  }

  if (!exercise) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${exercise.name} details`}
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
      <style>
        {`
          .exercise-detail-sheet {
            animation: exerciseDetailSheetSlideUp 750ms cubic-bezier(.16, 1, .3, 1) both;
            will-change: opacity, transform;
          }

          .exercise-detail-sheet[data-closing="true"] {
            animation-name: exerciseDetailSheetSlideDown;
          }

          @keyframes exerciseDetailSheetSlideUp {
            from {
              opacity: 0.25;
              transform: translateY(calc(100% + 24px));
            }

            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @keyframes exerciseDetailSheetSlideDown {
            from {
              opacity: 1;
              transform: translateY(0);
            }

            to {
              opacity: 0;
              transform: translateY(calc(100% + 24px));
            }
          }
        `}
      </style>
      <div
        className="exercise-detail-sheet"
        data-closing={isClosing ? "true" : "false"}
        onAnimationEnd={(event) => {
          if (event.currentTarget === event.target && isClosing) {
            onClose();
          }
        }}
        onClick={(event) => event.stopPropagation()}
        style={{
          background: "var(--surface-raised)",
          borderRadius: "18px 18px 0 0",
          boxShadow: "0 -8px 28px rgba(0,0,0,.2)",
          maxHeight: "88vh",
          maxWidth: "620px",
          overflow: "auto",
          padding: "14px",
          paddingBottom: "calc(14px + env(safe-area-inset-bottom))",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: "8px",
            justifyContent: "space-between",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                fontSize: "19px",
                lineHeight: 1.15,
                margin: 0,
              }}
            >
              {exercise.name}
            </h2>
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "12px",
                marginTop: "3px",
              }}
            >
              {formatEquipment(exercise.equipment) || "No equipment"}
            </div>
          </div>
          <div
            style={{
              alignItems: "center",
              display: "flex",
              flexShrink: 0,
              gap: "8px",
            }}
          >
            {onSelect && (
              <button
                onClick={() => onSelect(exercise)}
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  gap: "6px",
                  minHeight: "36px",
                  padding: "6px 10px",
                }}
                type="button"
              >
                <Check size={16} />
                Select Exercise
              </button>
            )}
            <button
              aria-label="Close"
              onClick={closeExerciseDetail}
              style={{
                alignItems: "center",
                borderRadius: "999px",
                display: "inline-flex",
                height: "36px",
                justifyContent: "center",
                width: "36px",
              }}
              type="button"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {activeDetailTab === "history" && (
          <div
            aria-label="Exercise history summary"
            style={{
              border: "1px solid var(--border)",
              borderRadius: "8px",
              display: "grid",
              gap: "10px",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              marginTop: "12px",
              padding: "10px",
            }}
          >
            <HistorySummaryItem
              icon={CalendarCheck}
              label="Workouts"
              value={historySummary.workouts}
            />
            <HistorySummaryItem
              icon={Trophy}
              label="Max weight"
              value={
                historySummary.maxWeight == null
                  ? "—"
                  : `${historySummary.maxWeight} lb`
              }
            />
            <HistorySummaryItem
              icon={Dumbbell}
              label="e1RM"
              value={formatE1RM(historySummary.maxE1RM)}
            />
          </div>
        )}

        <div
          role="tablist"
          aria-label="Exercise detail tabs"
          style={{
            display: "grid",
            gap: "6px",
            gridTemplateColumns: `repeat(${detailTabs.length}, minmax(0, 1fr))`,
            marginTop: "12px",
          }}
        >
          {detailTabs.map(([value, label, Icon]) => (
            <button
              key={value}
              aria-selected={activeDetailTab === value}
              onClick={() => setActiveTab(value)}
              role="tab"
              style={{
                alignItems: "center",
                background:
                  activeDetailTab === value ? "color-mix(in srgb, var(--accent) 14%, var(--surface))" : "var(--button-bg)",
                borderColor:
                  activeDetailTab === value ? "var(--accent)" : "var(--border)",
                color: activeDetailTab === value ? "var(--accent)" : "var(--button-text)",
                display: "inline-flex",
                gap: "6px",
                justifyContent: "center",
                minHeight: "40px",
              }}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        {activeDetailTab === "info" ? (
          <div
            style={{
              display: "grid",
              gap: "12px",
              marginTop: "12px",
            }}
          >
            <div
              style={{
                alignItems: "center",
                background: "var(--surface-muted)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                color: "var(--text-muted)",
                display: "flex",
                justifyContent: "center",
                minHeight: "260px",
                overflow: "hidden",
              }}
            >
              {detailImageExercise.imageUrl ? (
                <img
                  alt={
                    detailImageExercise.imageAlt ||
                    `${exercise.name} demonstration`
                  }
                  src={detailImageExercise.imageUrl}
                  style={{
                    display: "block",
                    maxHeight: "440px",
                    objectFit: "contain",
                    width: "100%",
                  }}
                />
              ) : (
                <ImagePlus
                  aria-label={`${exercise.name} image placeholder`}
                  role="img"
                  size={48}
                />
              )}
            </div>

            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "6px",
                display: "grid",
                gap: "8px",
                padding: "10px",
              }}
            >
              <div>
                <strong>Primary:</strong> {getPrimaryMuscle(exercise)}
              </div>
              <div>
                <strong>Secondary:</strong> {getSecondaryMuscles(exercise)}
              </div>
              <MuscleMap
                label={exercise.name}
                primaryMuscles={getPrimaryMuscleList(exercise)}
                secondaryMuscles={getSecondaryMuscleList(exercise)}
              />
              {exercise.description || exercise.note ? (
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "13px",
                  }}
                >
                  {exercise.description || exercise.note}
                </div>
              ) : null}
              <div
                style={{
                  alignItems: "center",
                  borderTop: "1px solid var(--border)",
                  display: "flex",
                  justifyContent: "space-between",
                  paddingTop: "8px",
                }}
              >
                <strong>Benchmark:</strong>
                <span>{benchmark ? "Yes" : "No"}</span>
              </div>
              {benchmark && (
                <div
                  style={{
                    alignItems: "center",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <strong>Benchmark family:</strong>
                  <span>{benchmarkFamily || "Not categorized"}</span>
                </div>
              )}
              <div
                style={{
                  alignItems: "center",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <strong>Bodyweight e1RM %:</strong>
                <span>{getBodyweightLoadPercent(exercise)}%</span>
              </div>
            </div>

            {instructionSteps.length > 0 && (
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  display: "grid",
                  gap: "8px",
                  padding: "10px",
                }}
              >
                <div
                  style={{
                    alignItems: "center",
                    display: "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <strong>Instructions</strong>
                  {exercise.instructionSourceUrl ||
                  exercise.instruction_source_url ? (
                    <a
                      href={
                        exercise.instructionSourceUrl ||
                        exercise.instruction_source_url
                      }
                      rel="noreferrer"
                      target="_blank"
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "12px",
                      }}
                    >
                      {exercise.instructionSource ||
                        exercise.instruction_source ||
                        "Source"}
                    </a>
                  ) : null}
                </div>
                <ol
                  style={{
                    color: "var(--text-muted)",
                    display: "grid",
                    fontSize: "13px",
                    gap: "6px",
                    margin: 0,
                    paddingLeft: "20px",
                  }}
                >
                  {instructionSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        ) : activeDetailTab === "benchmark" ? (
          <div
            style={{
              display: "grid",
              gap: "12px",
              marginTop: "12px",
            }}
          >
            {showBenchPressExperiment ? (
              <BenchPressExperiment exerciseHistory={exerciseHistory} />
            ) : (
              <BenchmarkPerformance
                benchmarkFamily={benchmarkFamily}
                exerciseHistory={exerciseHistory}
              />
            )}
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "12px",
              marginTop: "12px",
            }}
          >
            <div
              style={{
                display: "grid",
                gap: "8px",
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto auto",
              }}
            >
              <button
                onClick={() => updateChartSettings({ metric: "maxWeight" })}
                style={{
                  background:
                    chartMetric === "maxWeight"
                      ? "color-mix(in srgb, var(--accent) 14%, var(--surface))"
                      : "var(--button-bg)",
                  color:
                    chartMetric === "maxWeight"
                      ? "var(--accent)"
                      : "var(--button-text)",
                }}
              >
                Max Weight
              </button>
              <button
                onClick={() => updateChartSettings({ metric: "e1rm" })}
                style={{
                  background:
                    chartMetric === "e1rm"
                      ? "color-mix(in srgb, var(--accent) 14%, var(--surface))"
                      : "var(--button-bg)",
                  color:
                    chartMetric === "e1rm"
                      ? "var(--accent)"
                      : "var(--button-text)",
                }}
              >
                e1RM
              </button>
              <button
                aria-label={`Set exercise trend, current ${trendLabel}`}
                onClick={() => setTrendSheetOpen(true)}
                style={{
                  alignItems: "center",
                  borderColor:
                    trendDays || e1RMTrendColoringActive
                      ? "var(--accent)"
                      : undefined,
                  color:
                    trendDays || e1RMTrendColoringActive
                      ? "var(--accent)"
                      : undefined,
                  display: "inline-flex",
                  justifyContent: "center",
                  minHeight: "40px",
                  minWidth: "40px",
                  padding: 0,
                }}
                title={`Trend: ${trendLabel}`}
                type="button"
              >
                <TrendingUp size={18} />
              </button>
              <button
                aria-label={`Set exercise range, current ${rangeLabel}`}
                onClick={() => setRangeSheetOpen(true)}
                style={{
                  alignItems: "center",
                  borderColor: rangeDays ? "var(--accent)" : undefined,
                  color: rangeDays ? "var(--accent)" : undefined,
                  display: "inline-flex",
                  justifyContent: "center",
                  minHeight: "40px",
                  minWidth: "40px",
                  padding: 0,
                }}
                title={`Range: ${rangeLabel}`}
                type="button"
              >
                <CalendarDays size={18} />
              </button>
            </div>

            <MetricChart
              colorTrend={colorTrend}
              data={exerciseHistory}
              metric={chartMetric}
              rangeDays={rangeDays}
              trendDays={trendDays}
            />

            {exerciseHistory.length === 0 ? (
              <div
                style={{
                  color: "var(--text-muted)",
                  padding: "12px 0",
                  textAlign: "center",
                }}
              >
                No completed history for this exercise yet.
              </div>
            ) : (
              exerciseHistory
                .slice()
                .reverse()
                .map((entry) => {
                  const entryKey = getHistoryEntryKey(entry);
                  const isEditingEntry = editingHistoryKey === entryKey;

                  return (
                    <div
                      key={`${entryKey}-${entry.templateName}`}
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: "6px",
                        padding: "10px",
                      }}
                    >
                      <div
                        style={{
                          alignItems: "center",
                          display: "flex",
                          gap: "8px",
                          justifyContent: "space-between",
                        }}
                      >
                        <div
                          style={{
                            fontWeight: "bold",
                            minWidth: 0,
                          }}
                        >
                          {entry.completedAt}
                        </div>
                        {onUpdateHistoryWorkoutSet && (
                          <div
                            style={{
                              display: "inline-flex",
                              flexShrink: 0,
                              gap: "6px",
                            }}
                          >
                            {isEditingEntry && (
                              <button
                                aria-label={`Discard edits for ${entry.completedAt}`}
                                onClick={cancelEditingHistoryEntry}
                                style={{
                                  alignItems: "center",
                                  color: "var(--text-muted)",
                                  display: "inline-flex",
                                  height: "32px",
                                  justifyContent: "center",
                                  padding: 0,
                                  width: "32px",
                                }}
                                title="Discard edits"
                                type="button"
                              >
                                <X size={15} />
                              </button>
                            )}
                            <button
                              aria-label={
                                isEditingEntry
                                  ? `Save edits for ${entry.completedAt}`
                                  : `Edit ${entry.completedAt} history`
                              }
                              onClick={() =>
                                isEditingEntry
                                  ? commitEditingHistoryEntry(entry)
                                  : startEditingHistoryEntry(entry)
                              }
                              style={{
                                alignItems: "center",
                                borderColor: isEditingEntry
                                  ? "var(--accent)"
                                  : "var(--border)",
                                color: isEditingEntry
                                  ? "var(--accent)"
                                  : "var(--button-text)",
                                display: "inline-flex",
                                height: "32px",
                                justifyContent: "center",
                                padding: 0,
                                width: "32px",
                              }}
                              title={isEditingEntry ? "Save edits" : "Edit sets"}
                              type="button"
                            >
                              {isEditingEntry ? (
                                <Check size={15} />
                              ) : (
                                <Pencil size={15} />
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "12px",
                          marginTop: "2px",
                        }}
                      >
                        {entry.templateName}
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gap: "6px",
                          marginTop: "8px",
                        }}
                      >
                        {entry.sets.map((set) => {
                          const setKey = getHistorySetKey(set);
                          const draftSet =
                            isEditingEntry && editingHistoryDraft?.entryKey === entryKey
                              ? editingHistoryDraft.sets[setKey]
                              : null;
                          const displayWeight = draftSet?.actualWeight ?? set.weight;
                          const displayReps = draftSet?.actualReps ?? set.reps;
                          const displayRir = draftSet?.actualRir ?? set.rir;
                          const displayE1RM = isEditingEntry
                            ? calculateE1RM(
                                displayWeight,
                                displayReps,
                                displayRir,
                                null,
                                null,
                                null,
                                {
                                  bodyWeight: entry.bodyWeight,
                                  exercise,
                                }
                              )
                            : set.e1rm;

                          return (
                            <div
                              key={set.setNumber}
                              style={{
                                alignItems: "center",
                                columnGap: "4px",
                                display: "grid",
                                fontSize: "12px",
                                gridTemplateColumns:
                                  "34px minmax(46px, .85fr) minmax(46px, .85fr) minmax(42px, .75fr) minmax(66px, 1.2fr)",
                                minWidth: 0,
                              }}
                            >
                              <strong style={{ whiteSpace: "nowrap" }}>
                                Set {set.setNumber}
                              </strong>
                              {isEditingEntry ? (
                                <button
                                  onClick={() =>
                                    setWeightPickerData({
                                      entryKey,
                                      increment: getExerciseWeightIncrement(
                                        exercise,
                                        undefined,
                                        displayWeight
                                      ),
                                      setKey,
                                      value: displayWeight,
                                    })
                                  }
                                  style={{
                                    fontSize: "12px",
                                    minHeight: "30px",
                                    minWidth: 0,
                                    padding: "4px 6px",
                                    whiteSpace: "nowrap",
                                  }}
                                  type="button"
                                >
                                  {displayWeight || "—"} lb
                                </button>
                              ) : (
                                <span style={{ whiteSpace: "nowrap" }}>
                                  {displayWeight || "—"} lb
                                </span>
                              )}
                              {isEditingEntry ? (
                                <button
                                  onClick={() =>
                                    setRepsPickerData({
                                      entryKey,
                                      setKey,
                                      value: displayReps,
                                    })
                                  }
                                  style={{
                                    fontSize: "12px",
                                    minHeight: "30px",
                                    minWidth: 0,
                                    padding: "4px 6px",
                                    whiteSpace: "nowrap",
                                  }}
                                  type="button"
                                >
                                  {displayReps || "—"} reps
                                </button>
                              ) : (
                                <span style={{ whiteSpace: "nowrap" }}>
                                  {displayReps || "—"} reps
                                </span>
                              )}
                              {isEditingEntry ? (
                                <button
                                  onClick={() =>
                                    setRirPickerData({
                                      entryKey,
                                      setKey,
                                      value: displayRir,
                                    })
                                  }
                                  style={{
                                    fontSize: "12px",
                                    minHeight: "30px",
                                    minWidth: 0,
                                    padding: "4px 6px",
                                    whiteSpace: "nowrap",
                                  }}
                                  type="button"
                                >
                                  RIR {displayRir === "" ? "—" : displayRir}
                                </button>
                              ) : (
                                <span style={{ whiteSpace: "nowrap" }}>
                                  RIR {displayRir === "" ? "—" : displayRir}
                                </span>
                              )}
                              <span style={{ whiteSpace: "nowrap" }}>
                                e1RM {formatE1RM(displayE1RM)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        )}
      </div>
      {rangeSheetOpen && (
        <SelectionSheet
          onClose={() => setRangeSheetOpen(false)}
          onSelect={(value) => updateChartSettings({ rangeDays: value })}
          options={RANGE_OPTIONS}
          selectedValue={rangeDays}
          title="Exercise range"
        />
      )}
      {trendSheetOpen && (
        <SelectionSheet
          colorTrend={colorTrend}
          onClose={() => setTrendSheetOpen(false)}
          onSelect={(value) => updateChartSettings({ trendDays: value })}
          onToggleColorTrend={() =>
            updateChartSettings({ colorTrend: !colorTrend })
          }
          options={TREND_OPTIONS}
          selectedValue={trendDays}
          showColorTrendToggle={chartMetric === "e1rm"}
          title="Exercise trend"
        />
      )}
      <WeightPickerModal
        isOpen={Boolean(weightPickerData)}
        onClose={() => setWeightPickerData(null)}
        onSelect={(value) => {
          updateHistorySetDraft(weightPickerData, "actualWeight", value);
          setWeightPickerData(null);
        }}
        title="Select Weight"
        value={weightPickerData?.value}
        increment={weightPickerData?.increment}
        zIndex={zIndex + 300}
      />
      <WeightPickerModal
        increment={1}
        isOpen={Boolean(repsPickerData)}
        onClose={() => setRepsPickerData(null)}
        onSelect={(value) => {
          updateHistorySetDraft(repsPickerData, "actualReps", value);
          setRepsPickerData(null);
        }}
        title="Select Reps"
        value={repsPickerData?.value}
        values={Array.from({ length: 20 }, (_, index) => index + 1)}
        zIndex={zIndex + 300}
      />
      <WeightPickerModal
        isOpen={Boolean(rirPickerData)}
        onClose={() => setRirPickerData(null)}
        onSelect={(value) => {
          updateHistorySetDraft(rirPickerData, "actualRir", value);
          setRirPickerData(null);
        }}
        title="Select RIR"
        value={rirPickerData?.value}
        values={RIR_PICKER_VALUES}
        zIndex={zIndex + 300}
      />
    </div>
  );
}
