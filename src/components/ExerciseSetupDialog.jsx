export default function ExerciseSetupDialog({
  exercise,
  exerciseMetadata,
  getLatestWorkoutPerformance,
  calculateE1RM,
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
              {calculateE1RM(set.actualWeight, set.actualReps, set.actualRir)})
            </div>
          ))}
        </div>
      )}
    </>
  );
}
