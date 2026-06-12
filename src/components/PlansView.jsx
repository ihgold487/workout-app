import { useMemo, useState } from "react";
import { BarChart3, RefreshCw, Replace, Save, X } from "lucide-react";
import ExercisePickerSheet from "./ExercisePickerSheet";
import WeightPickerModal from "./WeightPickerModal";
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

function getDefaultSavedWorkoutName(workout, daysPerWeek, durationWeeks) {
  return daysPerWeek === "1"
    ? `${workout.name} (single)`
    : `${workout.name} (${daysPerWeek}d ${durationWeeks}wk)`;
}

function getGoalLabel(goal) {
  return goal === "progress" ? "Progress" : "Maintain";
}

function getDefaultPlanName(planType, daysPerWeek, durationWeeks) {
  return `${getPlanTypeLabel(planType)} (${daysPerWeek}d ${durationWeeks}wk)`;
}

function PlanWorkoutPreview({
  onRenameWorkout,
  onReplaceExercise,
  onShowSummary,
  workout,
}) {
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

      {Object.values(groupedExercises).map((group) => (
        <div
          key={group.label || group.exercises[0].id}
          style={{
            background: group.label ? "var(--surface-muted)" : "transparent",
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
                    <Replace size={17} />
                  </button>
                </div>
                <span
                  style={{
                    color: "var(--text-muted)",
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
  const [goal, setGoal] = useState("maintain");
  const [planType, setPlanType] = useState("type-2");
  const [planName, setPlanName] = useState(() =>
    getDefaultPlanName("type-2", "2", "4")
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
  const [activeValuePicker, setActiveValuePicker] = useState(null);

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
        name: Object.prototype.hasOwnProperty.call(
          workoutNameBySlot,
          workoutIndex
        )
          ? workoutNameBySlot[workoutIndex]
          : getDefaultSavedWorkoutName(workout, daysPerWeek, durationWeeks),
        previewWorkoutKey: workoutIndex,
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
      daysPerWeek,
      durationWeeks,
      workoutNameBySlot,
    ]
  );

  function saveGeneratedPlan() {
    const savedAt = Date.now();
    const planId = savedAt;
    const workouts = previewWorkouts.map((workout, workoutIndex) => {
      const savedWorkout = { ...workout };

      delete savedWorkout.previewWorkoutKey;

      const templateId = savedAt + workoutIndex + 1;
      const planWorkoutId = `${planId}:workout-${workoutIndex + 1}`;

      return {
        ...savedWorkout,
        id: templateId,
        name: workout.name,
        dayNumber: workoutIndex + 1,
        planId,
        planWorkoutId,
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

    setPlans([...plans, plan]);
    setTemplates([...templates, ...workouts]);
    setSaveStatus(`Saved plan with ${workouts.length} workouts.`);
    onSave?.();
  }

  return (
    <div
      style={{
        padding: "20px",
      }}
    >
      <h1>Plans</h1>

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
          {getPlanTypeLabel(planType)}
        </h2>

        <label
          style={{
            display: "grid",
            gap: "4px",
          }}
        >
          Plan name
          <input
            value={planName}
            onChange={(event) => {
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
              setReplacementBySlot({});
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
            Save Plan
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
              setReplacementBySlot({});
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

        <label
          style={{
            display: "grid",
            gap: "4px",
          }}
        >
          Goal
          <select
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
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

        <PlanPickerButton
          label="Days per week"
          value={`${daysPerWeek} ${daysPerWeek === "1" ? "day" : "days"}`}
          onClick={() => setActiveValuePicker("days")}
        />

        <PlanPickerButton
          disabled={daysPerWeek === "1"}
          label="Duration in weeks"
          value={daysPerWeek === "1" ? "Single workout" : durationWeeks}
          onClick={() => setActiveValuePicker("duration")}
        />

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

      {previewWorkouts.map((workout) => (
        <PlanWorkoutPreview
          key={workout.previewWorkoutKey}
          workout={workout}
          onRenameWorkout={(renamedWorkout, name) => {
            setWorkoutNameBySlot({
              ...workoutNameBySlot,
              [renamedWorkout.previewWorkoutKey]: name,
            });
            setSaveStatus("");
          }}
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

      {summaryWorkout && (
        <WorkoutSummarySheet
          selectedWorkout={summaryWorkout}
          workouts={previewWorkouts}
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
          setReplacementBySlot({});
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
          setReplacementBySlot({});
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
          setReplacementBySlot({});
          setSaveStatus("");
        }}
      />
    </div>
  );
}
