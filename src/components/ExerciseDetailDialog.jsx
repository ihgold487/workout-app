import { useMemo, useState } from "react";
import {
  CalendarDays,
  CalendarCheck,
  Check,
  Palette,
  Dumbbell,
  ImagePlus,
  LineChart,
  ListChecks,
  TrendingUp,
  Trophy,
  X,
} from "lucide-react";
import { calculateE1RM, formatE1RM, getLatestBodyWeightForDate } from "../utils/e1rm";
import MuscleMap from "./MuscleMap";

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
const TREND_COLOR_CHANGE_THRESHOLD_LB = 5;
const TREND_COLOR_CHANGE_THRESHOLD_PERCENT = 0.025;
const TREND_COLORS = {
  decreasing: "#e53935",
  flat: "#fdd835",
  increasing: "#43a047",
};

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

function getInstructionSteps(exercise) {
  const value = exercise?.instructionSteps || exercise?.instruction_steps || [];

  return Array.isArray(value)
    ? value.map((step) => String(step || "").trim()).filter(Boolean)
    : [];
}

function matchesExercise(historyExercise, exercise) {
  const libraryId = exercise.exerciseId || exercise.id;
  const historyExerciseId = historyExercise.exerciseId || historyExercise.id;

  if (libraryId != null && historyExerciseId != null && libraryId === historyExerciseId) {
    return true;
  }

  return (
    String(historyExercise.name || "").toLowerCase() ===
      String(exercise.name || "").toLowerCase() &&
    formatEquipment(historyExercise.equipment).toLowerCase() ===
      formatEquipment(exercise.equipment).toLowerCase()
  );
}

function getSetValue(set, actualField, targetField) {
  return set[actualField] || set[targetField] || "";
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
  const filtered = points.filter(
    (point) => daysBetween(point.dateKey, lastDate) <= rangeDays
  );

  return filtered.length > 0 ? filtered : [points[points.length - 1]];
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
      const matchingExercise = workout.exercises?.find((item) =>
        matchesExercise(item, exercise)
      );

      if (!matchingExercise) {
        return [];
      }

      const bodyWeight = getLatestBodyWeightForDate(
        bodyWeightEntries,
        workout.completedAtIso || workout.completed_at || workout.completedAt
      );
      const sets = (matchingExercise.sets || []).map((set, index) => {
        const weight = getSetValue(set, "actualWeight", "targetWeight");
        const reps = getSetValue(set, "actualReps", "targetReps");
        const rir = getSetValue(set, "actualRir", "targetRir");
        const e1rm = calculateE1RM(weight, reps, rir, null, null, null, {
          bodyWeight,
          exercise,
        });

        return {
          e1rm,
          reps,
          rir,
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
          sets,
          templateName: workout.templateName || workout.name || "Workout",
          maxWeight: maxWeight || null,
          maxE1RM: maxE1RM || null,
        },
      ];
    })
    .reverse();
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
  onClose,
  onSelect,
  onToggleColorTrend,
  options,
  selectedValue,
  showColorTrendToggle = false,
  title,
}) {
  return (
    <div
      aria-label={title}
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
          maxWidth: "420px",
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
            {title}
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
            <button aria-label={`Close ${title}`} onClick={onClose} type="button">
              <X size={17} />
            </button>
          </div>
        </div>
        {options.map((option) => {
          const selected = option.value === selectedValue;

          return (
            <button
              key={option.label}
              onClick={() => {
                onSelect(option.value);
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

function MetricChart({ colorTrend, data, metric, rangeDays, trendDays }) {
  const allPoints = data
    .map((entry) => ({
      dateKey: entry.completedDateKey,
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
        style={{
          aspectRatio: "1 / 1",
          display: "block",
          width: "100%",
        }}
      >
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

export default function ExerciseDetailDialog({
  bodyWeightEntries = [],
  exercise,
  history = [],
  onClose,
  onSelect,
  zIndex = 1400,
}) {
  const [activeTab, setActiveTab] = useState("info");
  const [chartMetric, setChartMetric] = useState("maxWeight");
  const [chartSettings, setChartSettings] = useState(getStoredChartSettings);
  const [rangeSheetOpen, setRangeSheetOpen] = useState(false);
  const [trendSheetOpen, setTrendSheetOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const exerciseHistory = useMemo(
    () => buildExerciseHistory(exercise, history, bodyWeightEntries),
    [bodyWeightEntries, exercise, history]
  );
  const historySummary = useMemo(
    () => buildHistorySummary(exerciseHistory),
    [exerciseHistory]
  );
  const instructionSteps = getInstructionSteps(exercise);
  const { colorTrend, rangeDays, trendDays } = chartSettings;
  const rangeLabel = getOptionLabel(RANGE_OPTIONS, rangeDays);
  const trendLabel = getOptionLabel(TREND_OPTIONS, trendDays);
  const e1RMTrendColoringActive = chartMetric === "e1rm" && colorTrend;

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

        {activeTab === "history" && (
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
            gridTemplateColumns: "1fr 1fr",
            marginTop: "12px",
          }}
        >
          {[
            ["info", "Info", ListChecks],
            ["history", "History", LineChart],
          ].map(([value, label, Icon]) => (
            <button
              key={value}
              aria-selected={activeTab === value}
              onClick={() => setActiveTab(value)}
              role="tab"
              style={{
                alignItems: "center",
                background:
                  activeTab === value ? "color-mix(in srgb, var(--accent) 14%, var(--surface))" : "var(--button-bg)",
                borderColor:
                  activeTab === value ? "var(--accent)" : "var(--border)",
                color: activeTab === value ? "var(--accent)" : "var(--button-text)",
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

        {activeTab === "info" ? (
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
              {exercise.imageUrl ? (
                <img
                  alt={exercise.imageAlt || `${exercise.name} demonstration`}
                  src={exercise.imageUrl}
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
                onClick={() => setChartMetric("maxWeight")}
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
                onClick={() => setChartMetric("e1rm")}
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
                .map((entry) => (
                  <div
                    key={`${entry.completedAt}-${entry.templateName}`}
                    style={{
                      border: "1px solid var(--border)",
                      borderRadius: "6px",
                      padding: "10px",
                    }}
                  >
                    <div
                      style={{
                        fontWeight: "bold",
                      }}
                    >
                      {entry.completedAt}
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
                      {entry.sets.map((set) => (
                        <div
                          key={set.setNumber}
                          style={{
                            display: "grid",
                            fontSize: "13px",
                            gap: "4px",
                            gridTemplateColumns: "42px repeat(4, minmax(0, 1fr))",
                          }}
                        >
                          <strong>Set {set.setNumber}</strong>
                          <span>{set.weight || "—"} lb</span>
                          <span>{set.reps || "—"} reps</span>
                          <span>RIR {set.rir === "" ? "—" : set.rir}</span>
                          <span>e1RM {formatE1RM(set.e1rm)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
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
    </div>
  );
}
