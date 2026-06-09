import { useMemo, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { generatePlanType2Workouts } from "../plans/planType2Generator";

function formatEquipment(equipment) {
  if (Array.isArray(equipment)) {
    return equipment.filter(Boolean).join(", ");
  }

  return equipment || "";
}

function PlanWorkoutPreview({ workout }) {
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
      <h3
        style={{
          margin: "0 0 10px",
        }}
      >
        {workout.name}
      </h3>

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
                <strong
                  style={{
                    lineHeight: 1.15,
                  }}
                >
                  {exercise.name}
                </strong>
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

export default function PlansView({
  exerciseLibrary,
  exerciseMetadata,
  history,
  setTemplates,
  templates,
}) {
  const [durationWeeks, setDurationWeeks] = useState("4");
  const [reps, setReps] = useState("10");
  const [rir, setRir] = useState("2");
  const [seed, setSeed] = useState(0);
  const [saveStatus, setSaveStatus] = useState("");

  const generatedPlan = useMemo(
    () =>
      generatePlanType2Workouts({
        durationWeeks,
        exerciseLibrary,
        exerciseMetadata,
        history,
        reps,
        rir,
        seed,
      }),
    [durationWeeks, exerciseLibrary, exerciseMetadata, history, reps, rir, seed]
  );

  function saveGeneratedWorkouts() {
    const savedAt = Date.now();
    const workouts = generatedPlan.workouts.map((workout, workoutIndex) => ({
      ...workout,
      id: savedAt + workoutIndex,
      name: `${workout.name} (${durationWeeks} wk)`,
      exercises: workout.exercises.map((exercise, exerciseIndex) => ({
        ...exercise,
        id: savedAt + workoutIndex * 100 + exerciseIndex,
        sets: exercise.sets.map((set, setIndex) => ({
          ...set,
          id: savedAt + workoutIndex * 1000 + exerciseIndex * 100 + setIndex,
        })),
      })),
    }));

    setTemplates([...templates, ...workouts]);
    setSaveStatus("Saved two generated workouts.");
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
          Plan Type 2
        </h2>

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

      {generatedPlan.workouts.map((workout) => (
        <PlanWorkoutPreview key={workout.name} workout={workout} />
      ))}
    </div>
  );
}
