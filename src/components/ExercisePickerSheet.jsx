import { Plus, Search, X } from "lucide-react";
import { useState } from "react";
import { isExerciseActive } from "../utils/exerciseStatus";
import ExerciseDetailDialog from "./ExerciseDetailDialog";
import ExerciseThumbnail from "./ExerciseThumbnail";

function formatEquipment(equipment) {
  if (Array.isArray(equipment)) {
    return equipment.filter(Boolean).join(", ");
  }

  return equipment || "";
}

export default function ExercisePickerSheet({
  actionLabel,
  bodyWeightEntries = [],
  exerciseLibrary,
  onAction,
  onClose,
  onSelect,
  history = [],
  search,
  selectedMuscle,
  setSearch,
  setSelectedMuscle,
  title,
}) {
  const [detailExercise, setDetailExercise] = useState(null);
  const activeExercises = exerciseLibrary.filter(isExerciseActive);
  const muscleGroups = [
    ...new Set(activeExercises.map((exercise) => exercise.muscles?.[0])),
  ]
    .filter(Boolean)
    .sort();

  const normalizedSearch = search.trim().toLowerCase();
  const filteredExercises = activeExercises
    .slice()
    .filter(
      (exercise) =>
        (!selectedMuscle || exercise.muscles?.[0] === selectedMuscle) &&
        (!normalizedSearch ||
          exercise.name.toLowerCase().includes(normalizedSearch) ||
          formatEquipment(exercise.equipment).toLowerCase().includes(normalizedSearch))
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        background: "rgba(0,0,0,.38)",
        inset: 0,
        position: "fixed",
        zIndex: 1200,
      }}
    >
      <div
        style={{
          background: "var(--surface-raised)",
          borderRadius: "18px 18px 0 0",
          bottom: 0,
          boxShadow: "0 -8px 28px rgba(0,0,0,.18)",
          display: "flex",
          flexDirection: "column",
          left: 0,
          maxHeight: "82vh",
          paddingBottom: "env(safe-area-inset-bottom)",
          position: "absolute",
          right: 0,
        }}
      >
        <div
          style={{
            borderBottom: "1px solid var(--border)",
            padding: "12px 14px 10px",
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              gap: "8px",
              justifyContent: "space-between",
              marginBottom: "10px",
            }}
          >
            <h2
              style={{
                fontSize: "18px",
                lineHeight: 1.15,
                margin: 0,
              }}
            >
              {title}
            </h2>

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
            style={{
              display: "grid",
              gap: "8px",
              gridTemplateColumns: "minmax(0, 1fr)",
            }}
          >
            <label
              style={{
                display: "grid",
                gap: "4px",
                fontSize: "12px",
                fontWeight: "bold",
              }}
            >
              Muscle
              <select
                value={selectedMuscle}
                onChange={(event) => setSelectedMuscle(event.target.value)}
                style={{
                  minHeight: "38px",
                  width: "100%",
                }}
              >
                <option value="">All muscles</option>

                {muscleGroups.map((muscle) => (
                  <option key={muscle} value={muscle}>
                    {muscle}
                  </option>
                ))}
              </select>
            </label>

            <label
              style={{
                alignItems: "center",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                display: "flex",
                gap: "8px",
                padding: "0 10px",
              }}
            >
              <Search size={16} color="#5f6368" />
              <input
                placeholder="Search exercise or equipment"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                style={{
                  border: "none",
                  flex: 1,
                  font: "inherit",
                  minHeight: "40px",
                  minWidth: 0,
                  outline: "none",
                }}
              />
            </label>
          </div>

          {onAction && (
            <button
              onClick={onAction}
              style={{
                alignItems: "center",
                display: "inline-flex",
                gap: "6px",
                marginTop: "10px",
                minHeight: "38px",
              }}
            >
              <Plus size={16} />
              {actionLabel}
            </button>
          )}
        </div>

        <div
          style={{
            overflowY: "auto",
            padding: "8px 10px 12px",
          }}
        >
          {filteredExercises.length === 0 ? (
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "14px",
                padding: "18px 8px",
                textAlign: "center",
              }}
            >
              No matching exercises.
            </div>
          ) : (
            filteredExercises.map((exercise) => {
              const equipment = formatEquipment(exercise.equipment);
              const primaryMuscle = exercise.muscles?.[0];

              return (
                <button
                  key={`${exercise.name}-${equipment}-${exercise.id}`}
                  onClick={() => setDetailExercise(exercise)}
                  style={{
                    alignItems: "center",
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px solid var(--border)",
                    display: "grid",
                    gap: "8px",
                    gridTemplateColumns: exercise.imageUrl
                      ? "46px minmax(0, 1fr)"
                      : "minmax(0, 1fr)",
                    justifyItems: "stretch",
                    minHeight: "54px",
                    padding: "9px 6px",
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  <ExerciseThumbnail
                    alt={exercise.imageAlt || `${exercise.name} demonstration`}
                    imageUrl={exercise.imageUrl}
                    size={46}
                  />
                  <span
                    style={{
                      display: "grid",
                      gap: "3px",
                      minWidth: 0,
                    }}
                  >
                    <span
                      style={{
                        fontWeight: "bold",
                        lineHeight: 1.15,
                      }}
                    >
                      {exercise.name}
                    </span>
                    {(equipment || primaryMuscle) && (
                      <span
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "12px",
                          lineHeight: 1.2,
                        }}
                      >
                        {[equipment, primaryMuscle].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {detailExercise && (
        <ExerciseDetailDialog
          bodyWeightEntries={bodyWeightEntries}
          exercise={detailExercise}
          exerciseLibrary={exerciseLibrary}
          history={history}
          onClose={() => setDetailExercise(null)}
          onSelect={(exercise) => {
            setDetailExercise(null);
            onSelect(exercise);
          }}
        />
      )}
    </div>
  );
}
