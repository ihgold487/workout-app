export default function HistoryView({ selectedHistory }) {
  const completedAtDetail = selectedHistory.completedAtIso
    ? new Date(selectedHistory.completedAtIso).toLocaleString([], {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : selectedHistory.completedAt;

  return (
    <div style={{ padding: "20px" }}>
      <h1>{selectedHistory.templateName}</h1>

      <p>Completed: {completedAtDetail}</p>

      {selectedHistory.exercises.map((exercise) => (
        <div
          key={exercise.id}
          style={{
            marginBottom: "20px",
          }}
        >
          <h3>{exercise.name}</h3>

          {exercise.note && <div>Note: {exercise.note}</div>}

          {exercise.sets.map((set) => (
            <div key={set.id}>
              {set.actualWeight}×{set.actualReps}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
