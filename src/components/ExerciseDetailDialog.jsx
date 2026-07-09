import { useMemo, useState } from "react";
import { ImagePlus, LineChart, ListChecks, X } from "lucide-react";
import { calculateE1RM, formatE1RM } from "../utils/e1rm";

function formatEquipment(equipment) {
  return Array.isArray(equipment) ? equipment.filter(Boolean).join(", ") : equipment || "";
}

function getPrimaryMuscle(exercise) {
  return (
    exercise.primaryMuscle ||
    exercise.primary_muscle ||
    exercise.muscles?.[0] ||
    exercise.planMuscle ||
    "n/a"
  );
}

function getSecondaryMuscles(exercise) {
  const value =
    exercise.secondaryMuscles ||
    exercise.secondary_muscles ||
    exercise.muscles?.slice(1) ||
    [];
  const list = Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);

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

function buildExerciseHistory(exercise, history) {
  return [...(history || [])]
    .flatMap((workout) => {
      const matchingExercise = workout.exercises?.find((item) =>
        matchesExercise(item, exercise)
      );

      if (!matchingExercise) {
        return [];
      }

      const sets = (matchingExercise.sets || []).map((set, index) => {
        const weight = getSetValue(set, "actualWeight", "targetWeight");
        const reps = getSetValue(set, "actualReps", "targetReps");
        const rir = getSetValue(set, "actualRir", "targetRir");
        const e1rm = calculateE1RM(weight, reps, rir);

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

function MetricChart({ data, metric }) {
  const points = data
    .map((entry) => ({
      dateKey: entry.completedDateKey,
      label: entry.completedAt,
      value: metric === "maxWeight" ? entry.maxWeight : entry.maxE1RM,
    }))
    .filter((point) => Number.isFinite(point.value) && point.dateKey)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  if (points.length < 2) {
    return (
      <div
        style={{
          color: "var(--text-muted)",
          fontSize: "12px",
          padding: "12px 0",
        }}
      >
        Not enough history for a chart yet.
      </div>
    );
  }

  const width = 320;
  const height = 150;
  const padding = 24;
  const min = Math.min(...points.map((point) => point.value));
  const max = Math.max(...points.map((point) => point.value));
  const range = max - min || 1;
  const firstDate = points[0].dateKey;
  const lastDate = points[points.length - 1].dateKey;
  const dateSpan = Math.max(1, daysBetween(firstDate, lastDate));
  const plotted = points.map((point) => {
    const x =
      padding +
      (daysBetween(firstDate, point.dateKey) / dateSpan) *
        (width - padding * 2);
    const y =
      height -
      padding -
      ((point.value - min) / range) * (height - padding * 2);

    return {
      ...point,
      x,
      y,
    };
  });

  return (
    <svg
      role="img"
      aria-label={metric === "maxWeight" ? "Max weight over time" : "e1RM over time"}
      viewBox={`0 0 ${width} ${height}`}
      style={{
        background: "var(--surface-muted)",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        width: "100%",
      }}
    >
      <line
        x1={padding}
        x2={width - padding}
        y1={height - padding}
        y2={height - padding}
        stroke="var(--border)"
      />
      <line
        x1={padding}
        x2={padding}
        y1={padding}
        y2={height - padding}
        stroke="var(--border)"
      />
      {plotted.slice(1).map((point, index) => {
        const previous = plotted[index];
        const skippedDays = daysBetween(previous.dateKey, point.dateKey) > 1;

        return (
          <line
            key={`${previous.dateKey}-${point.dateKey}-${index}`}
            x1={previous.x}
            x2={point.x}
            y1={previous.y}
            y2={point.y}
            stroke="var(--accent)"
            strokeDasharray={skippedDays ? "5 5" : undefined}
            strokeLinecap="round"
            strokeWidth="3"
          />
        );
      })}
      {plotted.map((point, pointIndex) => (
        <circle
          key={`${point.label}-${pointIndex}`}
          cx={point.x}
          cy={point.y}
          fill="var(--accent)"
          r="4"
        />
      ))}
      <text x={padding} y="16" fill="var(--text-muted)" fontSize="11">
        {max.toFixed(1)}
      </text>
      <text x={padding} y={height - 6} fill="var(--text-muted)" fontSize="11">
        {min.toFixed(1)}
      </text>
      <text x={padding} y={height - 18} fill="var(--text-muted)" fontSize="10">
        {firstDate}
      </text>
      <text
        x={width - padding}
        y={height - 18}
        fill="var(--text-muted)"
        fontSize="10"
        textAnchor="end"
      >
        {lastDate}
      </text>
    </svg>
  );
}

export default function ExerciseDetailDialog({
  exercise,
  history = [],
  onClose,
  onSelect,
  zIndex = 1400,
}) {
  const [activeTab, setActiveTab] = useState("info");
  const [chartMetric, setChartMetric] = useState("maxWeight");
  const exerciseHistory = useMemo(
    () => buildExerciseHistory(exercise, history),
    [exercise, history]
  );
  const instructionSteps = getInstructionSteps(exercise);

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
      <div
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
          <button
            aria-label="Close"
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
                gridTemplateColumns: "1fr 1fr",
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
            </div>

            <MetricChart data={exerciseHistory} metric={chartMetric} />

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
                          <span>{formatE1RM(set.e1rm)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
            )}
          </div>
        )}

        {onSelect && (
          <button
            onClick={() => onSelect(exercise)}
            style={{
              marginTop: "12px",
              minHeight: "44px",
              width: "100%",
            }}
          >
            Select Exercise
          </button>
        )}
      </div>
    </div>
  );
}
