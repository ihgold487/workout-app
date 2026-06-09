import { useState } from "react";
import { formatE1RM } from "../utils/e1rm";
import WeightPickerModal from "./WeightPickerModal";

export default function ExerciseSetupDialog({
  exercise,
  exerciseMetadata,
  getLatestWorkoutPerformance,
  calculateE1RM,
  values,
  setValues,
}) {
  const [activePicker, setActivePicker] = useState(null);
  const performance = getLatestWorkoutPerformance(exercise.id);
  const maxE1RM = exerciseMetadata?.[exercise.id]?.maxE1RM?.value;

  function setValue(field, value) {
    setValues({
      ...values,
      [field]: String(value),
    });
  }

  function renderPickerButton({ field, icon, label, value }) {
    return (
      <div
        style={{
          alignItems: "center",
          display: "grid",
          gap: "10px",
          gridTemplateColumns: "24px minmax(0, 1fr)",
          marginBottom: "12px",
        }}
      >
        <span aria-hidden="true">{icon}</span>
        <button
          type="button"
          onClick={() => setActivePicker(field)}
          style={{
            minHeight: "40px",
            textAlign: "left",
            width: "100%",
          }}
        >
          {label}: {value || "Tap to set"}
        </button>
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          fontSize: "0.9em",
          color: "var(--text-muted)",
          marginBottom: "12px",
        }}
      >
        Max e1RM: {formatE1RM(maxE1RM)}
      </div>

      {!performance ? (
        <div
          style={{
            marginBottom: "12px",
            fontSize: "0.9em",
          }}
        >
          <div
            style={{
              fontWeight: "bold",
            }}
          >
            Last workout: none
          </div>
        </div>
      ) : (
        <div
          style={{
            marginBottom: "12px",
            fontSize: "0.9em",
          }}
        >
          <div
            style={{
              fontWeight: "bold",
              marginBottom: "4px",
            }}
          >
            Last workout ({performance.completedAt})
          </div>

          {performance.sets.map((set) => (
            <div key={set.id}>
              {set.actualWeight}
              {" × "}
              {set.actualReps}
              {" @ "}
              {set.actualRir} (e1RM{" "}
              {calculateE1RM(
                set.actualWeight,
                set.actualReps,
                set.actualRir
              )?.toFixed(1)}
              )
            </div>
          ))}
        </div>
      )}
      <div
        style={{
          marginBottom: "12px",
          fontWeight: "bold",
          textAlign: "center",
        }}
      >
        🏋️ e1RM:{" "}
        {calculateE1RM(values.weight, values.reps, values.rir)?.toFixed(1)}
      </div>
      {renderPickerButton({
        field: "weight",
        icon: "🏋️",
        label: "Weight",
        value: values?.weight,
      })}

      {renderPickerButton({
        field: "reps",
        icon: "🔁",
        label: "Reps",
        value: values?.reps,
      })}

      {renderPickerButton({
        field: "rir",
        icon: "🔋",
        label: "RIR",
        value: values?.rir,
      })}

      {renderPickerButton({
        field: "sets",
        icon: "🔢",
        label: "Sets",
        value: values?.sets,
      })}

      <WeightPickerModal
        isOpen={activePicker === "weight"}
        onClose={() => setActivePicker(null)}
        value={values?.weight}
        title="Select Weight"
        onSelect={(value) => setValue("weight", value)}
      />

      <WeightPickerModal
        isOpen={activePicker === "reps"}
        onClose={() => setActivePicker(null)}
        value={values?.reps}
        increment={1}
        title="Select Reps"
        values={Array.from({ length: 20 }, (_, index) => index + 1)}
        onSelect={(value) => setValue("reps", value)}
      />

      <WeightPickerModal
        isOpen={activePicker === "rir"}
        onClose={() => setActivePicker(null)}
        value={values?.rir}
        title="Select RIR"
        values={[0, 1, 2, 3, 4, 5, 6]}
        onSelect={(value) => setValue("rir", value)}
      />

      <WeightPickerModal
        isOpen={activePicker === "sets"}
        onClose={() => setActivePicker(null)}
        value={values?.sets}
        increment={1}
        title="Select Sets"
        values={Array.from({ length: 10 }, (_, index) => index + 1)}
        onSelect={(value) => setValue("sets", value)}
      />
    </>
  );
}
