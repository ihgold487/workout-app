export default function ExerciseSetupDialog({
  exercise,
  exerciseMetadata,
  getLatestWorkoutPerformance,
  calculateE1RM,
  values,
  setValues,
}) {
  const performance = getLatestWorkoutPerformance(exercise.id);

  return (
    <>
      <div
        style={{
          fontSize: "0.9em",
          color: "#666",
          marginBottom: "12px",
        }}
      >
        Max e1RM: {exerciseMetadata?.[exercise.id]?.maxE1RM?.value ?? "—"}
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "12px",
        }}
      >
        🏋️
        <input
          type="number"
          placeholder="Weight"
          value={values?.weight || ""}
          onChange={(e) =>
            setValues({
              ...values,
              weight: e.target.value,
            })
          }
        />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "12px",
        }}
      >
        🔁
        <input
          type="number"
          placeholder="Reps"
          value={values?.reps || ""}
          onChange={(e) =>
            setValues({
              ...values,
              reps: e.target.value,
            })
          }
        />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "12px",
        }}
      >
        🔋
        <input
          type="number"
          placeholder="RIR"
          value={values?.rir || ""}
          onChange={(e) =>
            setValues({
              ...values,
              rir: e.target.value,
            })
          }
        />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "16px",
        }}
      >
        🔢
        <input
          type="number"
          placeholder="Sets"
          value={values?.sets || ""}
          onChange={(e) =>
            setValues({
              ...values,
              sets: e.target.value,
            })
          }
        />
      </div>
    </>
  );
}
