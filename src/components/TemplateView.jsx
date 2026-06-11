import { useState } from "react";
import {
  BatteryMedium,
  Check,
  Dumbbell,
  GripVertical,
  Link2,
  NotebookPen,
  Play,
  Plus,
  Repeat2,
  Save,
  Target,
  Trash2,
  X,
} from "lucide-react";
import WeightPickerModal from "./WeightPickerModal";
import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ExerciseSetupDialog from "./ExerciseSetupDialog";
import ExercisePickerSheet from "./ExercisePickerSheet";
import { calculateE1RM, formatE1RM } from "../utils/e1rm";

function IconButton({
  children,
  disabled = false,
  label,
  onClick,
  size = 36,
  style,
  tone = "neutral",
  type = "button",
}) {
  const toneColor =
    tone === "danger"
      ? "var(--danger-text)"
      : tone === "success"
        ? "var(--success-text)"
        : "var(--text)";

  return (
    <button
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type={type}
      style={{
        alignItems: "center",
        background: "var(--surface-raised)",
        border: "1px solid var(--border)",
        borderRadius: "999px",
        color: toneColor,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        flex: `0 0 ${size}px`,
        height: `${size}px`,
        justifyContent: "center",
        lineHeight: 1,
        opacity: disabled ? 0.45 : 1,
        padding: 0,
        width: `${size}px`,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function SortableExerciseRow({ exercise, children }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id: exercise.id,
    });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {children({
        attributes,
        listeners,
      })}
    </div>
  );
}

export default function TemplateView({
  template,
  templates,
  setTemplates,
  exerciseLibrary,
  exerciseMetadata,
  setExerciseMetadata,
  history,
  sessions,
  setSessions,
  setSelectedSessionId,
}) {
  const [search, setSearch] = useState("");

  const [selectedMuscle, setSelectedMuscle] = useState("");

  const [showAdd, setShowAdd] = useState(false);

  const [pendingExercise, setPendingExercise] = useState(null);

  const [newExerciseValues, setNewExerciseValues] = useState({
    weight: "",
    reps: "",
    sets: "",
    rir: "",
  });

  const [editingExercise, setEditingExercise] = useState(null);
  const [editingExerciseDraft, setEditingExerciseDraft] = useState(null);
  const [editingWeightSetIndex, setEditingWeightSetIndex] = useState(null);
  const [editingRepsSetIndex, setEditingRepsSetIndex] = useState(null);
  const [editingRirSetIndex, setEditingRirSetIndex] = useState(null);
  const [editingTemplateName, setEditingTemplateName] = useState(false);
  const [templateNameDraft, setTemplateNameDraft] = useState(template.name);

  function startWorkout() {
    const session = {
      id: Date.now(),

      templateId: template.id,

      templateName: template.name,

      exercises: template.exercises.map((exercise) => {
        const libraryExercise = exerciseLibrary.find(
          (ex) => ex.id === exercise.exerciseId
        );

        return {
          ...exercise,

          note: libraryExercise?.note || "",

          sets: exercise.sets.map((set) => ({
            ...set,

            actualWeight: "",

            actualReps: "",

            targetRir: set.targetRir || set.rir || "",

            actualRir: "",
          })),
        };
      }),
    };

    setSessions([...sessions, session]);

    setSelectedSessionId(session.id);
  }

  function addExercise(exercise) {
    const weight = newExerciseValues.weight;

    const reps = newExerciseValues.reps;

    const numSets = Number(newExerciseValues.sets);

    const rir = newExerciseValues.rir;

    const sets = Array.from(
      {
        length: numSets,
      },

      () => ({
        id: Date.now() + Math.random(),

        targetWeight: weight,

        targetReps: reps,

        targetRir: rir,
      })
    );

    setTemplates(
      templates.map((t) =>
        t.id === template.id
          ? {
              ...t,

              exercises: [
                ...t.exercises,

                {
                  id: Date.now(),

                  exerciseId: exercise.id,

                  name: exercise.name,

                  equipment: exercise.equipment,

                  muscles: exercise.muscles,

                  sets,
                },
              ],
            }
          : t
      )
    );

    setShowAdd(false);

    setSearch("");

    setPendingExercise(null);

    setNewExerciseValues({
      weight: "",
      reps: "",
      sets: "",
    });
  }

  function saveTemplateName() {
    const nextName = templateNameDraft.trim();

    if (!nextName) {
      return;
    }

    setTemplates(
      templates.map((t) =>
        t.id === template.id
          ? {
              ...t,
              name: nextName,
            }
          : t
      )
    );
    setEditingTemplateName(false);
  }

  function getLatestWorkoutPerformance(exerciseId) {
    const workout = history.find((workout) =>
      workout.exercises.some((exercise) => exercise.exerciseId === exerciseId)
    );

    if (!workout) {
      return null;
    }

    const exercise = workout.exercises.find(
      (exercise) => exercise.exerciseId === exerciseId
    );

    if (!exercise) {
      return null;
    }

    return {
      completedAt: workout.completedAt,
      sets: exercise.sets,
    };
  }

  return (
    <div
      style={{
        padding: "20px",
      }}
    >
      <button
        aria-label={`Edit workout name: ${template.name}`}
        onClick={() => {
          setTemplateNameDraft(template.name);
          setEditingTemplateName(true);
        }}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--text-h)",
          display: "block",
          fontSize: "2rem",
          fontWeight: "bold",
          lineHeight: 1.15,
          marginBottom: "20px",
          minWidth: 0,
          overflow: "hidden",
          padding: 0,
          textAlign: "left",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          width: "100%",
        }}
      >
        {template.name}
      </button>
      <div
        style={{
          display: "flex",
          gap: "8px",
          marginBottom: "10px",
        }}
      >
        <button
          onClick={startWorkout}
          style={{
            alignItems: "center",
            display: "inline-flex",
            gap: "6px",
          }}
        >
          <Play size={16} /> Start
        </button>
        <button
          onClick={() => setShowAdd(true)}
          style={{
            alignItems: "center",
            display: "inline-flex",
            gap: "6px",
          }}
        >
          <Plus size={16} /> Add Exercise
        </button>
      </div>

      {editingTemplateName && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Edit workout name"
          style={{
            alignItems: "center",
            background: "rgba(0,0,0,.42)",
            display: "flex",
            inset: 0,
            justifyContent: "center",
            padding: "18px",
            position: "fixed",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "var(--surface-raised)",
              borderRadius: "12px",
              boxShadow: "0 10px 28px rgba(0,0,0,.25)",
              boxSizing: "border-box",
              maxWidth: "360px",
              padding: "16px",
              width: "100%",
            }}
          >
            <h2
              style={{
                fontSize: "20px",
                marginBottom: "12px",
              }}
            >
              Workout name
            </h2>
            <input
              autoFocus
              value={templateNameDraft}
              onChange={(event) => setTemplateNameDraft(event.target.value)}
              style={{
                boxSizing: "border-box",
                font: "inherit",
                marginBottom: "12px",
                minHeight: "42px",
                padding: "7px 10px",
                width: "100%",
              }}
            />
            <div
              style={{
                display: "flex",
                gap: "8px",
                justifyContent: "space-between",
              }}
            >
              <button
                onClick={() => setEditingTemplateName(false)}
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  gap: "6px",
                }}
              >
                <X size={16} /> Cancel
              </button>
              <button
                disabled={!templateNameDraft.trim()}
                onClick={saveTemplateName}
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  gap: "6px",
                }}
              >
                <Save size={16} /> Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showAdd && (
        <ExercisePickerSheet
          title="Add exercise"
          exerciseLibrary={exerciseLibrary}
          history={history}
          search={search}
          selectedMuscle={selectedMuscle}
          setSearch={setSearch}
          setSelectedMuscle={setSelectedMuscle}
          onClose={() => {
            setShowAdd(false);
            setSearch("");
          }}
          onSelect={(exercise) => {
            setPendingExercise(exercise);
            setShowAdd(false);
          }}
        />
      )}

      {pendingExercise && (
            <div
              style={{
                position: "fixed",

                top: "50%",

                left: "50%",

                transform: "translate(-50%, -50%)",

                background: "var(--surface-raised)",

                border: "1px solid var(--border)",

                borderRadius: "12px",

                padding: "20px",

                width: "280px",

                zIndex: "1000",

                boxShadow: "0 4px 12px rgba(0,0,0,.2)",
              }}
            >
              <h3>
                {`${pendingExercise.name}${
                  pendingExercise.equipment?.[0]
                    ? ", " + pendingExercise.equipment[0]
                    : ""
                }`}
              </h3>

              <ExerciseSetupDialog
                exercise={pendingExercise}
                exerciseMetadata={exerciseMetadata}
                getLatestWorkoutPerformance={getLatestWorkoutPerformance}
                calculateE1RM={calculateE1RM}
                values={newExerciseValues}
                setValues={setNewExerciseValues}
              />

              <div
                style={{
                  marginTop: "12px",

                  display: "flex",

                  gap: "10px",

                  justifyContent: "flex-end",
                }}
              >
                <IconButton
                  label="Cancel add exercise"
                  onClick={() => {
                    setPendingExercise(null);

                    setNewExerciseValues({
                      weight: "",
                      reps: "",
                      sets: "",
                    });
                  }}
                >
                  <X size={18} />
                </IconButton>

                <IconButton
                  label="Add exercise"
                  tone="success"
                  onClick={() => {
                    addExercise(pendingExercise);

                    setNewExerciseValues({
                      weight: "",
                      reps: "",
                      sets: "",
                    });
                  }}
                >
                  <Check size={18} />
                </IconButton>
              </div>
            </div>
      )}
      <hr />
      {
        <DndContext
          collisionDetection={closestCenter}
          onDragEnd={({ active, over }) => {
            if (!over || active.id === over.id) {
              return;
            }

            const oldIndex = template.exercises.findIndex(
              (ex) => ex.id === active.id
            );

            const newIndex = template.exercises.findIndex(
              (ex) => ex.id === over.id
            );

            const reordered = arrayMove(template.exercises, oldIndex, newIndex);

            setTemplates(
              templates.map((t) =>
                t.id === template.id
                  ? {
                      ...t,
                      exercises: reordered,
                    }
                  : t
              )
            );
          }}
        >
          <SortableContext
            items={template.exercises.map((exercise) => exercise.id)}
            strategy={verticalListSortingStrategy}
          >
            {template.exercises.map((exercise) => (
              <SortableExerciseRow key={exercise.id} exercise={exercise}>
                {({ attributes, listeners }) => (
                  <div
                    key={exercise.id}
                    style={{
                      marginBottom: "20px",
                    }}
                  >
                    <h3
                      style={{
                        display: "flex",
                        alignItems: "center",
                        width: "100%",
                        fontSize: "0.85rem",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          flex: 1,
                          gap: "4px",
                        }}
                      >
                        <span
                          onClick={() => {}}
                          style={{
                            flex: 1,

                            minWidth: 0,

                            overflowWrap: "break-word",

                            cursor: "pointer",
                          }}
                        >
                          <IconButton
                            label="Exercise note"
                            size={32}
                            onClick={() => {
                              const note = prompt(
                                "Exercise note",
                                exerciseMetadata[exercise.exerciseId]?.note ||
                                  ""
                              );

                              if (note === null) return;

                              setExerciseMetadata({
                                ...exerciseMetadata,

                                [exercise.exerciseId]: {
                                  ...(exerciseMetadata[exercise.exerciseId] ||
                                    {}),

                                  note,
                                },
                              });
                            }}
                          >
                            <NotebookPen size={16} />
                          </IconButton>

                          {`${exercise.name}${
                            exercise.equipment?.[0]
                              ? ", " + exercise.equipment[0]
                              : ""
                          }`}
                        </span>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          gap: "4px",
                          marginLeft: "auto",
                          flexShrink: 0,
                        }}
                      >
                        <span
                          {...attributes}
                          {...listeners}
                          style={{
                            alignItems: "center",
                            background: "var(--surface-raised)",
                            border: "1px solid var(--border)",
                            borderRadius: "999px",
                            color: "var(--text-muted)",
                            cursor: "grab",
                            display: "inline-flex",
                            height: "32px",
                            justifyContent: "center",
                            padding: 0,
                            userSelect: "none",
                            touchAction: "none",
                            width: "32px",
                          }}
                        >
                          <GripVertical size={17} />
                        </span>

                        <IconButton
                          label="Edit superset"
                          size={exercise.supersetGroup ? 42 : 32}
                          onClick={() => {
                            const group = prompt(
                              "Superset group (A, B, etc). Leave empty to clear."
                            );

                            setTemplates(
                              templates.map((t) =>
                                t.id === template.id
                                  ? {
                                      ...t,

                                      exercises: t.exercises.map((ex) =>
                                        ex.id === exercise.id
                                          ? {
                                              ...ex,

                                              supersetGroup: group || null,
                                            }
                                          : ex
                                      ),
                                    }
                                  : t
                              )
                            );
                          }}
                        >
                          <Link2 size={16} />
                          {exercise.supersetGroup && (
                            <span
                              style={{
                                fontSize: "10px",
                                fontWeight: "bold",
                                marginLeft: "-3px",
                              }}
                            >
                              {exercise.supersetGroup}
                            </span>
                          )}
                        </IconButton>

                        <IconButton
                          label="Delete exercise"
                          size={32}
                          tone="danger"
                          onClick={() => {
                            setTemplates(
                              templates.map((t) =>
                                t.id === template.id
                                  ? {
                                      ...t,

                                      exercises: t.exercises.filter(
                                        (ex) => ex.id !== exercise.id
                                      ),
                                    }
                                  : t
                              )
                            );
                          }}
                        >
                          <Trash2 size={16} />
                        </IconButton>
                      </div>
                    </h3>

                    {(() => {
                      const note =
                        exerciseMetadata?.[exercise.exerciseId]?.note;

                      return note && note.trim().length > 0 ? (
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-muted)",
                            marginTop: "2px",
                            marginLeft: "28px",
                            textAlign: "left",
                            width: "100%",
                          }}
                        >
                          <span>
                            <NotebookPen
                              size={13}
                              style={{
                                marginRight: "4px",
                                verticalAlign: "-2px",
                              }}
                            />
                            {exerciseMetadata[exercise.exerciseId]?.note}
                          </span>

                          <IconButton
                            label="Clear note"
                            size={24}
                            onClick={() => {
                              const updated = {
                                ...exerciseMetadata,
                              };

                              delete updated[exercise.exerciseId];

                              setExerciseMetadata(updated);
                            }}
                            style={{
                              marginLeft: "8px",
                              verticalAlign: "-6px",
                            }}
                          >
                            <X size={13} />
                          </IconButton>
                        </div>
                      ) : null;
                    })()}

                    {exercise.sets.map((set) => (
                      <div
                        key={set.id}
                        onClick={() => {
                          setEditingExercise(exercise);

                          setEditingExerciseDraft(structuredClone(exercise));
                        }}
                        style={{
                          alignItems: "center",
                          cursor: "pointer",
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "4px",
                        }}
                      >
                        <Target size={14} /> {set.targetWeight}×{set.targetReps}
                        {set.targetRir || set.rir
                          ? ` @ ${set.targetRir || set.rir}`
                          : ""}{" "}
                        (<Dumbbell size={13} />{" "}
                        {calculateE1RM(
                          null,
                          set.targetReps,
                          set.targetRir || set.rir,
                          set.targetWeight
                        )?.toFixed(1)}
                        )
                      </div>
                    ))}
                  </div>
                )}
              </SortableExerciseRow>
            ))}
          </SortableContext>
        </DndContext>
      }
      {editingExercise && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "var(--surface-raised)",
              padding: "20px",
              borderRadius: "8px",
              minWidth: "300px",
            }}
          >
            <div>
              <h3>{editingExercise.name}</h3>

              <div
                style={{
                  fontSize: "0.9em",
                  color: "var(--text-muted)",
                  marginBottom: "12px",
                }}
              >
                Latest e1RM:{" "}
                {formatE1RM(
                  exerciseMetadata?.[editingExercise.id]?.latestE1RM?.value
                )}
                {" | "}
                Max e1RM:{" "}
                {formatE1RM(
                  exerciseMetadata?.[editingExercise.id]?.maxE1RM?.value
                )}
              </div>
            </div>

            <div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "30px 60px 60px 60px 70px 40px",
                  alignItems: "center",
                  marginBottom: "8px",
                  paddingBottom: "4px",
                  borderBottom: "1px solid var(--border)",
                  textAlign: "center",
                }}
              >
                <div>#</div>
                <div>
                  <Target size={15} aria-label="Target weight" />
                </div>
                <div>
                  <Repeat2 size={15} aria-label="Reps" />
                </div>
                <div>
                  <BatteryMedium size={15} aria-label="RIR" />
                </div>
                <div>
                  <Dumbbell size={15} aria-label="e1RM" />
                </div>
                <div></div>
              </div>

              {editingExerciseDraft.sets.map((set, index) => (
                <div
                  key={set.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "30px 60px 60px 60px 70px 40px",
                    alignItems: "center",
                    marginBottom: "6px",
                  }}
                >
                  <div>{index + 1}</div>

                  <div
                    style={{
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                    onClick={() => setEditingWeightSetIndex(index)}
                  >
                    {set.targetWeight}
                  </div>

                  <div
                    style={{
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                    onClick={() => setEditingRepsSetIndex(index)}
                  >
                    {set.targetReps}
                  </div>

                  <div
                    style={{
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                    onClick={() => setEditingRirSetIndex(index)}
                  >
                    {set.targetRir}
                  </div>

                  <div
                    style={{
                      textAlign: "center",
                      fontSize: "0.9em",
                    }}
                  >
                    {calculateE1RM(
                      null,
                      set.targetReps,
                      set.targetRir || set.rir,
                      set.targetWeight
                    )?.toFixed(1)}
                  </div>

                  <IconButton
                    label="Delete set"
                    size={30}
                    tone="danger"
                    onClick={() => {
                      if (editingExerciseDraft.sets.length <= 1) {
                        return;
                      }

                      const updated = structuredClone(editingExerciseDraft);

                      updated.sets.splice(index, 1);

                      setEditingExerciseDraft(updated);
                    }}
                  >
                    <Trash2 size={15} />
                  </IconButton>
                </div>
              ))}

              <button
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  gap: "5px",
                }}
                onClick={() => {
                  const updated = structuredClone(editingExerciseDraft);

                  updated.sets.push({
                    id: Date.now() + Math.random(),

                    targetWeight: updated.sets.at(-1)?.targetWeight || "",

                    targetReps: updated.sets.at(-1)?.targetReps || "",

                    targetRir: updated.sets.at(-1)?.targetRir || "",
                  });

                  setEditingExerciseDraft(updated);
                }}
              >
                <Plus size={15} /> Add Set
              </button>
            </div>

            {editingWeightSetIndex !== null && (
              <WeightPickerModal
                isOpen={editingWeightSetIndex !== null}
                onClose={() => setEditingWeightSetIndex(null)}
                value={
                  editingExerciseDraft?.sets[editingWeightSetIndex]
                    ?.targetWeight
                }
                onSelect={(value) => {
                  const updated = structuredClone(editingExerciseDraft);

                  updated.sets[editingWeightSetIndex].targetWeight =
                    String(value);

                  setEditingExerciseDraft(updated);

                  setEditingWeightSetIndex(null);
                }}
              />
            )}

            {editingRepsSetIndex !== null && (
              <WeightPickerModal
                isOpen={editingRepsSetIndex !== null}
                onClose={() => setEditingRepsSetIndex(null)}
                value={
                  editingExerciseDraft?.sets[editingRepsSetIndex]?.targetReps
                }
                increment={1}
                title="Select Reps"
                values={Array.from({ length: 20 }, (_, i) => i + 1)}
                onSelect={(value) => {
                  const updated = structuredClone(editingExerciseDraft);

                  updated.sets[editingRepsSetIndex].targetReps = String(value);

                  setEditingExerciseDraft(updated);

                  setEditingRepsSetIndex(null);
                }}
              />
            )}

            {editingRirSetIndex !== null && (
              <WeightPickerModal
                isOpen={editingRirSetIndex !== null}
                onClose={() => setEditingRirSetIndex(null)}
                value={
                  editingExerciseDraft?.sets[editingRirSetIndex]?.targetRir
                }
                title="Select RIR"
                values={[0, 1, 2, 3, 4, 5, 6]}
                onSelect={(value) => {
                  const updated = structuredClone(editingExerciseDraft);

                  updated.sets[editingRirSetIndex].targetRir = String(value);

                  setEditingExerciseDraft(updated);

                  setEditingRirSetIndex(null);
                }}
              />
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "12px",
              }}
            >
              <button
                onClick={() => {
                  setEditingExercise(null);

                  setEditingExerciseDraft(null);
                }}
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  gap: "6px",
                }}
              >
                <X size={16} /> Cancel
              </button>

              <button
                onClick={() => {
                  setTemplates(
                    templates.map((t) =>
                      t.id === template.id
                        ? {
                            ...t,

                            exercises: t.exercises.map((ex) =>
                              ex.id === editingExercise.id
                                ? editingExerciseDraft
                                : ex
                            ),
                          }
                        : t
                    )
                  );

                  setEditingExercise(null);

                  setEditingExerciseDraft(null);
                }}
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  gap: "6px",
                }}
              >
                <Save size={16} /> Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
