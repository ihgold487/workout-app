import { useMemo, useState } from "react";
import { BarChart3, RefreshCw, Save, X } from "lucide-react";
import ExercisePickerSheet from "./ExercisePickerSheet";
import {
  createPlanExercise,
  generatePlanWorkouts,
} from "../plans/planType2Generator";

function formatEquipment(equipment) {
  if (Array.isArray(equipment)) {
    return equipment.filter(Boolean).join(", ");
  }

  return equipment || "";
}

function getWorkoutSummary(workouts) {
  const workoutList = Array.isArray(workouts) ? workouts : [workouts];
  const exercises = workoutList.flatMap((workout) => workout.exercises);
  const muscleSets = exercises.reduce((summary, exercise) => {
    const muscle = exercise.planMuscle || exercise.muscles?.[0] || "Unknown";

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
          background: "#fff",
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
                color: "#666",
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
            background: "#f1f3f4",
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
                  background: active ? "#fff" : "transparent",
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
          {summary.muscleSets.map(([muscle, sets]) => (
            <div
              key={muscle}
              style={{
                alignItems: "center",
                borderBottom: "1px solid #eee",
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
              background: "#f6f7f8",
              borderRadius: "8px",
              color: "#555",
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

function PlanWorkoutPreview({ onReplaceExercise, onShowSummary, workout }) {
  const groupedExercises = workout.exercises.reduce((groups, exercise) => {
    const key = exercise.supersetGroup || `single-${exercise.id}`;

    if (!groups[key]) {
      groups[key] = {
        label: exercise.supersetGroup,
        exercises: [],
      };
    }

    groups[key].exercises.push(exercise);

    return groups;
  }, {});

  return (
    <section
      style={{
        borderTop: "1px solid #ddd",
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
        <h3
          style={{
            lineHeight: 1.15,
            margin: 0,
          }}
        >
          {workout.name}
        </h3>

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

      {Object.values(groupedExercises).map((group) => (
        <div
          key={group.label || group.exercises[0].id}
          style={{
            background: group.label ? "#f6f7f8" : "transparent",
            borderLeft: group.label ? "4px solid #1769aa" : "none",
            borderRadius: "6px",
            marginBottom: "10px",
            padding: group.label ? "8px 10px" : "4px 0",
          }}
        >
          {group.label && (
            <div
              style={{
                color: "#1769aa",
                fontSize: "12px",
                fontWeight: "bold",
                marginBottom: "6px",
              }}
            >
              Superset {group.label}
            </div>
          )}

          {group.exercises.map((exercise) => {
            const firstSet = exercise.sets[0];

            return (
              <div
                key={exercise.id}
                style={{
                  display: "grid",
                  gap: "2px",
                  marginBottom: "8px",
                }}
              >
                <div
                  style={{
                    alignItems: "center",
                    display: "grid",
                    gap: "8px",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                  }}
                >
                  <strong
                    style={{
                      lineHeight: 1.15,
                      minWidth: 0,
                    }}
                  >
                    {exercise.name}
                  </strong>

                  <button
                    aria-label={`Replace ${exercise.name}`}
                    onClick={() => onReplaceExercise(exercise)}
                    style={{
                      fontSize: "18px",
                      lineHeight: 1,
                      minHeight: "30px",
                      minWidth: "34px",
                      padding: "4px 6px",
                    }}
                  >
                    🔄
                  </button>
                </div>
                <span
                  style={{
                    color: "#666",
                    fontSize: "12px",
                  }}
                >
                  {[exercise.planMuscle, formatEquipment(exercise.equipment)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <span
                  style={{
                    fontSize: "12px",
                  }}
                >
                  {exercise.sets.length} sets ·{" "}
                  {firstSet.targetWeight
                    ? `${firstSet.targetWeight} × ${firstSet.targetReps}`
                    : `weight TBD × ${firstSet.targetReps}`}
                  {firstSet.targetRir ? ` @ ${firstSet.targetRir} RIR` : ""}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}

function getPlanTypeLabel(planType) {
  return planType === "type-1" ? "Plan Type 1" : "Plan Type 2";
}

export default function PlansView({
  exerciseLibrary,
  exerciseMetadata,
  history,
  setTemplates,
  templates,
}) {
  const [durationWeeks, setDurationWeeks] = useState("4");
  const [daysPerWeek, setDaysPerWeek] = useState("2");
  const [planType, setPlanType] = useState("type-2");
  const [reps, setReps] = useState("10");
  const [rir, setRir] = useState("2");
  const [seed, setSeed] = useState(0);
  const [saveStatus, setSaveStatus] = useState("");
  const [replacementBySlot, setReplacementBySlot] = useState({});
  const [pickerTarget, setPickerTarget] = useState(null);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerMuscle, setPickerMuscle] = useState("");
  const [summaryWorkout, setSummaryWorkout] = useState(null);

  const generatedPlan = useMemo(
    () =>
      generatePlanWorkouts({
        daysPerWeek,
        durationWeeks,
        exerciseLibrary,
        exerciseMetadata,
        history,
        planType,
        reps,
        rir,
        seed,
      }),
    [
      daysPerWeek,
      durationWeeks,
      exerciseLibrary,
      exerciseMetadata,
      history,
      planType,
      reps,
      rir,
      seed,
    ]
  );

  const previewWorkouts = useMemo(
    () =>
      generatedPlan.workouts.map((workout, workoutIndex) => ({
        ...workout,
        exercises: workout.exercises.map((exercise) => {
          const slotKey = `${workoutIndex}:${exercise.id}`;
          const replacementExercise = replacementBySlot[slotKey];
          const previewExercise = replacementExercise
            ? createPlanExercise({
                exercise: replacementExercise,
                exerciseMetadata,
                history,
                planMuscle: exercise.planMuscle,
                reps,
                rir,
                setCount: exercise.sets.length,
                supersetGroup: exercise.supersetGroup,
              })
            : exercise;

          return {
            ...previewExercise,
            previewSlotKey: slotKey,
          };
        }),
      })),
    [
      exerciseMetadata,
      generatedPlan.workouts,
      history,
      replacementBySlot,
      reps,
      rir,
    ]
  );

  function saveGeneratedWorkouts() {
    const savedAt = Date.now();
    const workouts = previewWorkouts.map((workout, workoutIndex) => ({
      ...workout,
      id: savedAt + workoutIndex,
      name: `${workout.name} (${daysPerWeek}d ${durationWeeks}wk)`,
      exercises: workout.exercises.map((exercise, exerciseIndex) => {
        const savedExercise = { ...exercise };

        delete savedExercise.previewSlotKey;

        return {
          ...savedExercise,
          id: savedAt + workoutIndex * 100 + exerciseIndex,
          sets: exercise.sets.map((set, setIndex) => ({
            ...set,
            id: savedAt + workoutIndex * 1000 + exerciseIndex * 100 + setIndex,
          })),
        };
      }),
    }));

    setTemplates([...templates, ...workouts]);
    setSaveStatus(`Saved ${workouts.length} generated workouts.`);
  }

  return (
    <div
      style={{
        padding: "20px",
      }}
    >
      <h1>Plans</h1>

      <section
        style={{
          display: "grid",
          gap: "10px",
          marginBottom: "16px",
        }}
      >
        <h2
          style={{
            fontSize: "18px",
            margin: 0,
          }}
        >
          {getPlanTypeLabel(planType)}
        </h2>

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
              setReplacementBySlot({});
              setSaveStatus("");
            }}
          >
            <option value="type-1">Type 1</option>
            <option value="type-2">Type 2</option>
          </select>
        </label>

        <label
          style={{
            display: "grid",
            gap: "4px",
          }}
        >
          Days per week
          <select
            value={daysPerWeek}
            onChange={(event) => {
              setDaysPerWeek(event.target.value);
              setReplacementBySlot({});
              setSaveStatus("");
            }}
          >
            <option value="2">2 days/week</option>
            <option value="3">3 days/week</option>
          </select>
        </label>

        <label
          style={{
            display: "grid",
            gap: "4px",
          }}
        >
          Duration
          <select
            value={durationWeeks}
            onChange={(event) => setDurationWeeks(event.target.value)}
          >
            <option value="4">4 weeks</option>
            <option value="5">5 weeks</option>
            <option value="6">6 weeks</option>
          </select>
        </label>

        <label
          style={{
            display: "grid",
            gap: "4px",
          }}
        >
          Reps
          <input
            inputMode="numeric"
            type="number"
            value={reps}
            onChange={(event) => setReps(event.target.value)}
          />
        </label>

        <label
          style={{
            display: "grid",
            gap: "4px",
          }}
        >
          RIR
          <input
            inputMode="decimal"
            type="number"
            value={rir}
            onChange={(event) => setRir(event.target.value)}
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
              setReplacementBySlot({});
              setSaveStatus("");
            }}
            style={{
              alignItems: "center",
              display: "inline-flex",
              gap: "6px",
            }}
          >
            <RefreshCw size={16} />
            Regenerate
          </button>

          <button
            onClick={saveGeneratedWorkouts}
            style={{
              alignItems: "center",
              display: "inline-flex",
              gap: "6px",
            }}
          >
            <Save size={16} />
            Save Workouts
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

        {generatedPlan.gaps.length > 0 && (
          <div
            style={{
              background: "#fff8e1",
              border: "1px solid #e6c86e",
              borderRadius: "6px",
              color: "#5b4700",
              fontSize: "13px",
              padding: "8px",
            }}
          >
            Missing exercise metadata for: {generatedPlan.gaps.join(", ")}.
          </div>
        )}
      </section>

      {previewWorkouts.map((workout) => (
        <PlanWorkoutPreview
          key={workout.name}
          workout={workout}
          onShowSummary={setSummaryWorkout}
          onReplaceExercise={(exercise) => {
            setPickerTarget(exercise);
            setPickerMuscle(exercise.planMuscle || "");
            setPickerSearch("");
          }}
        />
      ))}

      {pickerTarget && (
        <ExercisePickerSheet
          title={`Replace ${pickerTarget.planMuscle}`}
          exerciseLibrary={exerciseLibrary}
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

      {summaryWorkout && (
        <WorkoutSummarySheet
          selectedWorkout={summaryWorkout}
          workouts={previewWorkouts}
          onClose={() => setSummaryWorkout(null)}
        />
      )}
    </div>
  );
}
