import { useState } from "react";
import { Dumbbell, Scale, Utensils, X } from "lucide-react";
import ExerciseThumbnail from "./ExerciseThumbnail";

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

function firstPresentValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

export default function WorkoutCalendar({
  bodyWeightEntries = [],
  history,
  nutritionEntries = [],
}) {
  const [expanded, setExpanded] = useState(false);

  const [displayedMonth, setDisplayedMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedWorkout, setSelectedWorkout] = useState(null);

  const today = new Date();

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

    return bodyWeightEntries.find((entry) => entry.date === dateKey);
  };

  const getDateSummary = (date) => {
    const workouts = workoutsForDate(date);
    const foods = nutritionForDate(date);
    const bodyWeight = bodyWeightForDate(date);

    return {
      bodyWeight,
      foods,
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
                            <div
                              style={{
                                color: "var(--text-muted)",
                                fontSize: "13px",
                              }}
                            >
                              • {summary.bodyWeight.weight}{" "}
                              {summary.bodyWeight.unit || "lb"}
                            </div>
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
                            {summary.foods.map((food) => (
                              <div
                                key={food.id}
                                style={{
                                  color: "var(--text-muted)",
                                  fontSize: "13px",
                                  marginBottom: "4px",
                                }}
                              >
                                • {food.name} · {formatMacro(food.calories, "cal")} cal
                                {food.servingDescription
                                  ? ` · ${food.servingDescription}`
                                  : ""}
                              </div>
                            ))}
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

      {selectedWorkout && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Workout details"
          onClick={(event) => {
            event.stopPropagation();
            setSelectedWorkout(null);
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
                  {selectedWorkout.templateName ||
                    selectedWorkout.workout_name ||
                    "Workout"}
                </h2>
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "12px",
                    marginTop: "3px",
                  }}
                >
                  Completed{" "}
                  {selectedWorkout.completedAtIso
                    ? new Date(selectedWorkout.completedAtIso).toLocaleString([], {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })
                    : selectedWorkout.completedAt || "on selected date"}
                </div>
              </div>
              <button
                aria-label="Close workout details"
                onClick={() => setSelectedWorkout(null)}
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

            {(selectedWorkout.exercises || []).map((exercise) => (
              <div
                key={exercise.id}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  display: "grid",
                  gap: "10px",
                  padding: "10px",
                }}
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
                          gridTemplateColumns: "42px 1fr 1fr 1fr",
                          padding: "8px",
                        }}
                      >
                        <strong>Set {setIndex + 1}</strong>
                        <span>{actualWeight || "-"} lb</span>
                        <span>{actualReps || "-"} reps</span>
                        <span>RIR {actualRir ?? "-"}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
