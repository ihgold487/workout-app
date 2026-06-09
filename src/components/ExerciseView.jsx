import { useMemo, useState } from "react";

import { equipmentOptions } from "../data/seedEquipment";

const muscleGroups = [
  "Abs",
  "Biceps",
  "Calves",
  "Chest",
  "Forearms",
  "Front Delts",
  "Full Body",
  "Glutes",
  "Hamstrings",
  "Lats",
  "Quads",
  "Rear Delts",
  "Side Delts",
  "Triceps",
  "Upper Back",
  "Other",
];

const emptyDraft = {
  description: "",
  equipment: "",
  imageUrl: "",
  name: "",
  primaryMuscle: "Other",
  secondaryMuscles: [],
};

function getExerciseDraft(exercise = {}) {
  const muscles = Array.isArray(exercise.muscles) ? exercise.muscles : [];

  return {
    description: exercise.description || exercise.note || "",
    equipment: exercise.equipment?.[0] || "",
    imageUrl: exercise.imageUrl || exercise.image_url || "",
    name: exercise.name || "",
    primaryMuscle: muscles[0] || "Other",
    secondaryMuscles: muscles.slice(1),
  };
}

function exerciseFromDraft(draft, existing = {}) {
  const muscles = [
    draft.primaryMuscle || "Other",
    ...draft.secondaryMuscles.filter(
      (muscle) => muscle && muscle !== draft.primaryMuscle
    ),
  ];

  return {
    ...existing,
    description: draft.description.trim(),
    equipment: draft.equipment ? [draft.equipment] : [],
    imageUrl: draft.imageUrl.trim(),
    muscles,
    name: draft.name.trim(),
    note: draft.description.trim(),
  };
}

function toggleMuscle(muscles, muscle) {
  return muscles.includes(muscle)
    ? muscles.filter((item) => item !== muscle)
    : [...muscles, muscle];
}

export default function ExerciseView({
  exerciseLibrary,
  setExerciseLibrary,
}) {
  const [draft, setDraft] = useState(emptyDraft);
  const [editingExercise, setEditingExercise] = useState(null);
  const [editingDraft, setEditingDraft] = useState(emptyDraft);
  const [exerciseType, setExerciseType] = useState("");
  const [selectedEquipment, setSelectedEquipment] = useState("");
  const [selectedMuscle, setSelectedMuscle] = useState("");
  const [search, setSearch] = useState("");

  const customExerciseCount = exerciseLibrary.filter(
    (exercise) => !exercise.builtin
  ).length;

  const filteredExercises = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return [...exerciseLibrary]
      .filter((exercise) => {
        const primaryMuscle = exercise.muscles?.[0] || "";
        const equipment = exercise.equipment?.[0] || "";
        const matchesSearch =
          !normalizedSearch ||
          exercise.name.toLowerCase().includes(normalizedSearch);
        const matchesMuscle = !selectedMuscle || primaryMuscle === selectedMuscle;
        const matchesEquipment =
          !selectedEquipment || equipment === selectedEquipment;
        const matchesType =
          !exerciseType ||
          (exerciseType === "builtin" && exercise.builtin) ||
          (exerciseType === "custom" && !exercise.builtin);

        return matchesSearch && matchesMuscle && matchesEquipment && matchesType;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [exerciseLibrary, exerciseType, search, selectedEquipment, selectedMuscle]);

  function addExercise() {
    if (!draft.name.trim()) {
      alert("Exercise name required");
      return;
    }

    setExerciseLibrary([
      ...exerciseLibrary,
      exerciseFromDraft(draft, {
        builtin: false,
        id: Date.now(),
      }),
    ]);
    setDraft(emptyDraft);
  }

  function startEdit(exercise) {
    setEditingExercise(exercise);
    setEditingDraft(getExerciseDraft(exercise));
  }

  function saveEdit() {
    if (!editingDraft.name.trim()) {
      alert("Exercise name required");
      return;
    }

    setExerciseLibrary(
      exerciseLibrary.map((exercise) =>
        exercise.id === editingExercise.id
          ? exerciseFromDraft(editingDraft, exercise)
          : exercise
      )
    );
    setEditingExercise(null);
    setEditingDraft(emptyDraft);
  }

  function renderExerciseForm(formDraft, setFormDraft, { compact = false } = {}) {
    const availableSecondaryMuscles = muscleGroups.filter(
      (muscle) => muscle !== formDraft.primaryMuscle
    );

    return (
      <div
        style={{
          display: "grid",
          gap: "8px",
          gridTemplateColumns: compact ? "1fr" : "minmax(0, 1fr) 140px",
        }}
      >
        <input
          value={formDraft.name}
          onChange={(event) =>
            setFormDraft({
              ...formDraft,
              name: event.target.value,
            })
          }
          placeholder="Exercise name"
          style={{
            minWidth: 0,
          }}
        />

        <select
          value={formDraft.equipment}
          onChange={(event) =>
            setFormDraft({
              ...formDraft,
              equipment: event.target.value,
            })
          }
        >
          <option value="">Equipment</option>
          {equipmentOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <textarea
          value={formDraft.description}
          onChange={(event) =>
            setFormDraft({
              ...formDraft,
              description: event.target.value,
            })
          }
          placeholder="Description or notes"
          rows={compact ? 2 : 3}
          style={{
            gridColumn: compact ? "auto" : "1 / -1",
            resize: "vertical",
          }}
        />

        <input
          value={formDraft.imageUrl}
          onChange={(event) =>
            setFormDraft({
              ...formDraft,
              imageUrl: event.target.value,
            })
          }
          placeholder="Image URL"
          style={{
            gridColumn: compact ? "auto" : "1 / -1",
            minWidth: 0,
          }}
        />

        <label
          style={{
            display: "grid",
            gap: "4px",
          }}
        >
          <span style={{ fontSize: "12px", fontWeight: "bold" }}>
            Primary muscle
          </span>
          <select
            value={formDraft.primaryMuscle}
            onChange={(event) =>
              setFormDraft({
                ...formDraft,
                primaryMuscle: event.target.value,
                secondaryMuscles: formDraft.secondaryMuscles.filter(
                  (muscle) => muscle !== event.target.value
                ),
              })
            }
          >
            {muscleGroups.map((muscle) => (
              <option key={muscle} value={muscle}>
                {muscle}
              </option>
            ))}
          </select>
        </label>

        <div
          style={{
            gridColumn: compact ? "auto" : "1 / -1",
          }}
        >
          <div
            style={{
              fontSize: "12px",
              fontWeight: "bold",
              marginBottom: "4px",
              textAlign: "left",
            }}
          >
            Secondary muscles
          </div>
          <div
            style={{
              display: "grid",
              gap: "4px",
              gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))",
            }}
          >
            {availableSecondaryMuscles.map((muscle) => (
              <label
                key={muscle}
                style={{
                  alignItems: "center",
                  display: "flex",
                  fontSize: "12px",
                  gap: "4px",
                }}
              >
                <input
                  checked={formDraft.secondaryMuscles.includes(muscle)}
                  onChange={() =>
                    setFormDraft({
                      ...formDraft,
                      secondaryMuscles: toggleMuscle(
                        formDraft.secondaryMuscles,
                        muscle
                      ),
                    })
                  }
                  type="checkbox"
                />
                {muscle}
              </label>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        margin: "0 auto",
        maxWidth: "760px",
        padding: "16px",
        textAlign: "left",
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          gap: "8px",
          justifyContent: "flex-end",
          marginBottom: "12px",
        }}
      >
        <div
          style={{
            color: "var(--text-muted)",
            fontSize: "12px",
          }}
        >
          {exerciseLibrary.length} exercises · {customExerciseCount} custom
        </div>
      </div>

      <h1
        style={{
          fontSize: "1.6rem",
          margin: "0 0 12px",
        }}
      >
        Exercises
      </h1>

      <section
        style={{
          border: "1px solid var(--border)",
          borderRadius: "6px",
          marginBottom: "14px",
          padding: "12px",
        }}
      >
        <h2
          style={{
            fontSize: "1rem",
            margin: "0 0 10px",
          }}
        >
          Add Custom Exercise
        </h2>

        {renderExerciseForm(draft, setDraft)}

        <button
          onClick={addExercise}
          style={{
            marginTop: "10px",
          }}
        >
          + Add Exercise
        </button>
      </section>

      <section
        style={{
          display: "grid",
          gap: "8px",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          marginBottom: "12px",
        }}
      >
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search exercises"
          style={{
            minWidth: 0,
          }}
        />

        <select
          value={selectedMuscle}
          onChange={(event) => setSelectedMuscle(event.target.value)}
        >
          <option value="">All muscles</option>
          {muscleGroups.map((muscle) => (
            <option key={muscle} value={muscle}>
              {muscle}
            </option>
          ))}
        </select>

        <select
          value={selectedEquipment}
          onChange={(event) => setSelectedEquipment(event.target.value)}
        >
          <option value="">All equipment</option>
          {equipmentOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <select
          value={exerciseType}
          onChange={(event) => setExerciseType(event.target.value)}
        >
          <option value="">All types</option>
          <option value="builtin">Built-in</option>
          <option value="custom">Custom</option>
        </select>
      </section>

      <div
        style={{
          display: "grid",
          gap: "8px",
        }}
      >
        {filteredExercises.map((exercise) => {
          const primaryMuscle = exercise.muscles?.[0] || "Other";
          const secondaryMuscles = exercise.muscles?.slice(1) || [];

          return (
            <div
              key={exercise.id}
              style={{
                border: "1px solid var(--border)",
                borderRadius: "6px",
                padding: "10px",
              }}
            >
              <div
                style={{
                  alignItems: "flex-start",
                  display: "flex",
                  gap: "8px",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div
                    style={{
                      fontWeight: "bold",
                    }}
                  >
                    {exercise.name}
                  </div>
                  <div
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "12px",
                      marginTop: "2px",
                    }}
                  >
                    {exercise.equipment?.[0] || "No equipment"} ·{" "}
                    {exercise.builtin ? "Built-in" : "Custom"}
                  </div>
                </div>

                {!exercise.builtin && (
                  <div
                    style={{
                      display: "flex",
                      gap: "6px",
                    }}
                  >
                    <button onClick={() => startEdit(exercise)}>Edit</button>
                    <button
                      onClick={() =>
                        setExerciseLibrary(
                          exerciseLibrary.filter((item) => item.id !== exercise.id)
                        )
                      }
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>

              <div
                style={{
                  color: "var(--text)",
                  fontSize: "13px",
                  marginTop: "8px",
                }}
              >
                <strong>{primaryMuscle}</strong>
                {secondaryMuscles.length > 0
                  ? ` · ${secondaryMuscles.join(", ")}`
                  : ""}
              </div>

              {(exercise.description || exercise.note || exercise.imageUrl) && (
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "12px",
                    marginTop: "6px",
                  }}
                >
                  {exercise.description || exercise.note}
                  {exercise.imageUrl ? (
                    <div
                      style={{
                        overflowWrap: "anywhere",
                      }}
                    >
                      {exercise.imageUrl}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {editingExercise && (
        <div
          role="dialog"
          aria-label="Edit exercise"
          style={{
            alignItems: "center",
            background: "rgba(0,0,0,.45)",
            display: "flex",
            inset: 0,
            justifyContent: "center",
            padding: "16px",
            position: "fixed",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "var(--surface-raised)",
              borderRadius: "8px",
              maxHeight: "calc(100vh - 32px)",
              maxWidth: "520px",
              overflow: "auto",
              padding: "14px",
              width: "100%",
            }}
          >
            <h2
              style={{
                fontSize: "1rem",
                margin: "0 0 10px",
              }}
            >
              Edit Custom Exercise
            </h2>

            {renderExerciseForm(editingDraft, setEditingDraft, {
              compact: true,
            })}

            <div
              style={{
                display: "flex",
                gap: "8px",
                justifyContent: "flex-end",
                marginTop: "12px",
              }}
            >
              <button
                onClick={() => {
                  setEditingExercise(null);
                  setEditingDraft(emptyDraft);
                }}
              >
                Cancel
              </button>
              <button onClick={saveEdit}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
