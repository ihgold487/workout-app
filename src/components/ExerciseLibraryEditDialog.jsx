import { useState } from "react";
import { Save, X } from "lucide-react";
import { equipmentOptions } from "../data/seedEquipment";
import { updateBuiltInExercise } from "../sync/exerciseCloudSync";
import {
  BENCHMARK_FAMILY_OPTIONS,
  getBenchmarkFamilyKeyForExercise,
  isExerciseBenchmark,
} from "../utils/exerciseBenchmark";

const MUSCLE_GROUPS = [
  "Abs", "Obliques", "Biceps", "Calves", "Chest", "Forearms",
  "Front Delts", "Full Body", "Glutes", "Hamstrings", "Lats", "Quads",
  "Rear Delts", "Side Delts", "Triceps", "Upper Back", "Other",
];

function createDraft(exercise) {
  const muscles = Array.isArray(exercise?.muscles) ? exercise.muscles : [];
  const bodyweightLoadPercent =
    exercise?.bodyweightLoadPercent ?? exercise?.bodyweight_load_percent ?? "";

  return {
    benchmark: isExerciseBenchmark(exercise) ? "yes" : "no",
    benchmarkFamilyKey: getBenchmarkFamilyKeyForExercise(exercise),
    bodyweightLoadPercent:
      bodyweightLoadPercent === "" ? "" : String(bodyweightLoadPercent),
    description: exercise?.description || exercise?.note || "",
    equipment: Array.isArray(exercise?.equipment)
      ? exercise.equipment[0] || ""
      : exercise?.equipment || "",
    name: exercise?.name || "",
    primaryMuscle: muscles[0] || "Other",
    secondaryMuscles: muscles.slice(1),
  };
}

function exerciseFromDraft(draft, exercise) {
  const description = draft.description.trim();

  return {
    ...exercise,
    benchmark: draft.benchmark === "yes",
    benchmarkFamilyKey:
      draft.benchmark === "yes" ? draft.benchmarkFamilyKey : "",
    bodyweightLoadPercent:
      draft.bodyweightLoadPercent === ""
        ? null
        : Number(draft.bodyweightLoadPercent),
    description,
    equipment: draft.equipment ? [draft.equipment] : [],
    muscles: [draft.primaryMuscle, ...draft.secondaryMuscles].filter(Boolean),
    name: draft.name.trim(),
    note: description,
  };
}

export default function ExerciseLibraryEditDialog({
  canEditBuiltIn = false,
  exercise,
  exerciseLibrary,
  onCancel,
  onSaved,
  session,
  setExerciseLibrary,
}) {
  const [draft, setDraft] = useState(() => createDraft(exercise));
  const [status, setStatus] = useState("");
  const availableSecondaryMuscles = MUSCLE_GROUPS.filter(
    (muscle) => muscle !== draft.primaryMuscle
  );

  async function save() {
    if (!draft.name.trim()) {
      setStatus("Exercise name required.");
      return;
    }
    if (draft.benchmark === "yes" && !draft.benchmarkFamilyKey) {
      setStatus("Benchmark family required.");
      return;
    }
    if (exercise.builtin && !canEditBuiltIn) {
      setStatus("Only trainer admins can edit built-in exercises.");
      return;
    }

    let savedExercise = exerciseFromDraft(draft, exercise);
    setStatus(exercise.builtin ? "Saving built-in exercise..." : "Saving...");

    try {
      if (exercise.builtin) {
        const exerciseId = await updateBuiltInExercise(
          savedExercise,
          session,
          exercise
        );
        savedExercise = {
          ...savedExercise,
          exerciseId: exerciseId || savedExercise.exerciseId,
        };
      }

      setExerciseLibrary(
        exerciseLibrary.map((item) =>
          item.id === exercise.id ? savedExercise : item
        )
      );
      onSaved(savedExercise);
    } catch (error) {
      console.error("Failed to update exercise from data sheet:", error);
      setStatus(`Unable to save exercise: ${error.message}`);
    }
  }

  return (
    <div
      aria-label="Edit exercise"
      aria-modal="true"
      role="dialog"
      style={{
        alignItems: "center",
        background: "rgba(0,0,0,.45)",
        display: "flex",
        inset: 0,
        justifyContent: "center",
        padding: "16px",
        position: "fixed",
        zIndex: 1500,
      }}
    >
      <div style={{
        background: "var(--surface-raised)", borderRadius: "8px",
        maxHeight: "calc(100vh - 32px)", maxWidth: "520px", overflow: "auto",
        padding: "14px", width: "100%",
      }}>
        <h2 style={{ fontSize: "1rem", margin: "0 0 10px" }}>
          {exercise.builtin ? "Edit Built-in Exercise" : "Edit Custom Exercise"}
        </h2>
        <div style={{ display: "grid", gap: "8px" }}>
          <input
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            placeholder="Exercise name"
            value={draft.name}
          />
          <select
            onChange={(event) => setDraft({ ...draft, equipment: event.target.value })}
            value={draft.equipment}
          >
            <option value="">Equipment</option>
            {equipmentOptions.map((equipment) => (
              <option key={equipment} value={equipment}>{equipment}</option>
            ))}
          </select>
          <label style={{ display: "grid", gap: "4px" }}>
            <strong style={{ fontSize: "12px" }}>Benchmark</strong>
            <select
              onChange={(event) => setDraft({
                ...draft,
                benchmark: event.target.value,
                benchmarkFamilyKey:
                  event.target.value === "yes" ? draft.benchmarkFamilyKey : "",
              })}
              value={draft.benchmark}
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </label>
          {draft.benchmark === "yes" && (
            <label style={{ display: "grid", gap: "4px" }}>
              <strong style={{ fontSize: "12px" }}>Benchmark Family</strong>
              <select
                onChange={(event) => setDraft({
                  ...draft,
                  benchmarkFamilyKey: event.target.value,
                })}
                value={draft.benchmarkFamilyKey}
              >
                <option value="">Select family</option>
                {BENCHMARK_FAMILY_OPTIONS.map((family) => (
                  <option key={family.key} value={family.key}>{family.label}</option>
                ))}
              </select>
            </label>
          )}
          <label style={{ display: "grid", gap: "4px" }}>
            <strong style={{ fontSize: "12px" }}>Bodyweight e1RM %</strong>
            <select
              onChange={(event) => setDraft({
                ...draft,
                bodyweightLoadPercent: event.target.value,
              })}
              value={draft.bodyweightLoadPercent === "" ? "0" : draft.bodyweightLoadPercent}
            >
              {[0, 25, 50, 100].map((value) => (
                <option key={value} value={String(value)}>{value}</option>
              ))}
            </select>
          </label>
          <textarea
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            placeholder="Description or notes"
            rows={2}
            value={draft.description}
          />
          <label style={{ display: "grid", gap: "4px" }}>
            <strong style={{ fontSize: "12px" }}>Primary muscle</strong>
            <select
              onChange={(event) => setDraft({
                ...draft,
                primaryMuscle: event.target.value,
                secondaryMuscles: draft.secondaryMuscles.filter(
                  (muscle) => muscle !== event.target.value
                ),
              })}
              value={draft.primaryMuscle}
            >
              {MUSCLE_GROUPS.map((muscle) => (
                <option key={muscle} value={muscle}>{muscle}</option>
              ))}
            </select>
          </label>
          <div>
            <strong style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>
              Secondary muscles
            </strong>
            <div style={{ display: "grid", gap: "4px", gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))" }}>
              {availableSecondaryMuscles.map((muscle) => (
                <label key={muscle} style={{ alignItems: "center", display: "flex", fontSize: "12px", gap: "4px" }}>
                  <input
                    checked={draft.secondaryMuscles.includes(muscle)}
                    onChange={() => setDraft({
                      ...draft,
                      secondaryMuscles: draft.secondaryMuscles.includes(muscle)
                        ? draft.secondaryMuscles.filter((item) => item !== muscle)
                        : [...draft.secondaryMuscles, muscle],
                    })}
                    type="checkbox"
                  />
                  {muscle}
                </label>
              ))}
            </div>
          </div>
        </div>
        {status && <div role="status" style={{ color: status.startsWith("Unable") ? "var(--danger-text)" : "var(--text-muted)", fontSize: "12px", marginTop: "10px" }}>{status}</div>}
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "12px" }}>
          <button onClick={onCancel} type="button"><X size={16} /> Cancel</button>
          <button onClick={save} type="button"><Save size={16} /> Save</button>
        </div>
      </div>
    </div>
  );
}
