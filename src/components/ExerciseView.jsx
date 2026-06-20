import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, ImagePlus, Link, X } from "lucide-react";

import { equipmentOptions } from "../data/seedEquipment";
import {
  EXERCISE_STATUS,
  getExerciseStatus,
  isExerciseActive,
} from "../utils/exerciseStatus";
import ExerciseDetailDialog from "./ExerciseDetailDialog";
import ExerciseThumbnail from "./ExerciseThumbnail";

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

const cropPreviewSize = 260;
const savedImageSize = 512;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

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

function getExerciseStatusButtonStyle(active) {
  return {
    background: active ? "var(--success-bg)" : "var(--danger-bg)",
    border: `1px solid ${
      active ? "var(--success-text)" : "var(--danger-text)"
    }`,
    color: active ? "var(--success-text)" : "var(--danger-text)",
    fontWeight: "bold",
  };
}

export default function ExerciseView({
  exerciseLibrary,
  history = [],
  setExerciseLibrary,
}) {
  const cropDragRef = useRef(null);
  const photoInputRef = useRef(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [detailExercise, setDetailExercise] = useState(null);
  const [editingExercise, setEditingExercise] = useState(null);
  const [editingDraft, setEditingDraft] = useState(emptyDraft);
  const [imageExercise, setImageExercise] = useState(null);
  const [imageUrlDraft, setImageUrlDraft] = useState("");
  const [copyImageExerciseId, setCopyImageExerciseId] = useState("");
  const [cropImage, setCropImage] = useState(null);
  const [cropOffset, setCropOffset] = useState({
    x: 0,
    y: 0,
  });
  const [cropZoom, setCropZoom] = useState(1);
  const [exerciseType, setExerciseType] = useState("");
  const [exerciseStatus, setExerciseStatus] = useState("");
  const [selectedEquipment, setSelectedEquipment] = useState("");
  const [selectedMuscle, setSelectedMuscle] = useState("");
  const [search, setSearch] = useState("");

  const customExerciseCount = exerciseLibrary.filter(
    (exercise) => !exercise.builtin
  ).length;

  useEffect(
    () => () => {
      if (cropImage?.url) {
        URL.revokeObjectURL(cropImage.url);
      }
    },
    [cropImage?.url]
  );

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
        const matchesStatus =
          !exerciseStatus || getExerciseStatus(exercise) === exerciseStatus;

        return (
          matchesSearch &&
          matchesMuscle &&
          matchesEquipment &&
          matchesType &&
          matchesStatus
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [
    exerciseLibrary,
    exerciseStatus,
    exerciseType,
    search,
    selectedEquipment,
    selectedMuscle,
  ]);

  function addExercise() {
    if (!draft.name.trim()) {
      alert("Exercise name required");
      return;
    }

    setExerciseLibrary([
      ...exerciseLibrary,
      exerciseFromDraft(draft, {
        builtin: false,
        active: EXERCISE_STATUS.active,
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

  function toggleExerciseStatus(exerciseToToggle) {
    const nextStatus = isExerciseActive(exerciseToToggle)
      ? EXERCISE_STATUS.inactive
      : EXERCISE_STATUS.active;

    setExerciseLibrary(
      exerciseLibrary.map((exercise) =>
        exercise.id === exerciseToToggle.id
          ? {
              ...exercise,
              active: nextStatus,
            }
          : exercise
      )
    );
  }

  function openImageSheet(event, exercise) {
    event.stopPropagation();
    setImageExercise(exercise);
    setImageUrlDraft(exercise.imageUrl || "");
    setCopyImageExerciseId("");
    setCropImage(null);
  }

  function closeImageSheet() {
    setImageExercise(null);
    setImageUrlDraft("");
    setCopyImageExerciseId("");
    setCropImage(null);
    setCropOffset({
      x: 0,
      y: 0,
    });
    setCropZoom(1);
  }

  function updateExerciseImage(exerciseId, imageUrl) {
    setExerciseLibrary(
      exerciseLibrary.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              imageUrl,
            }
          : exercise
      )
    );
    setImageExercise((exercise) =>
      exercise && exercise.id === exerciseId
        ? {
            ...exercise,
            imageUrl,
          }
        : exercise
    );
  }

  function saveImageUrl() {
    if (!imageExercise) {
      return;
    }

    updateExerciseImage(imageExercise.id, imageUrlDraft.trim());
    closeImageSheet();
  }

  function copyExerciseImage() {
    if (!imageExercise || !copyImageExerciseId) {
      return;
    }

    const sourceExercise = exerciseLibrary.find(
      (exercise) => String(exercise.id) === String(copyImageExerciseId)
    );

    if (!sourceExercise?.imageUrl) {
      return;
    }

    updateExerciseImage(imageExercise.id, sourceExercise.imageUrl);
    closeImageSheet();
  }

  function handleImageFile(file) {
    if (!file || !imageExercise) {
      return;
    }

    setCropImage({
      name: file.name,
      url: URL.createObjectURL(file),
    });
    setCropOffset({
      x: 0,
      y: 0,
    });
    setCropZoom(1);
  }

  function startCropDrag(event) {
    cropDragRef.current = {
      pointerId: event.pointerId,
      startOffset: cropOffset,
      x: event.clientX,
      y: event.clientY,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveCropDrag(event) {
    const drag = cropDragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    setCropOffset({
      x: clamp(drag.startOffset.x + event.clientX - drag.x, -160, 160),
      y: clamp(drag.startOffset.y + event.clientY - drag.y, -160, 160),
    });
  }

  function endCropDrag(event) {
    if (cropDragRef.current?.pointerId === event.pointerId) {
      cropDragRef.current = null;
    }
  }

  function cancelCropImage() {
    setCropImage(null);
    setCropOffset({
      x: 0,
      y: 0,
    });
    setCropZoom(1);
  }

  function saveCroppedImage() {
    if (!cropImage || !imageExercise) {
      return;
    }

    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = savedImageSize;
      canvas.height = savedImageSize;
      const context = canvas.getContext("2d");

      if (!context) {
        alert("Unable to crop this image.");
        return;
      }

      const naturalWidth = image.naturalWidth || image.width;
      const naturalHeight = image.naturalHeight || image.height;
      const baseScale = Math.max(
        cropPreviewSize / naturalWidth,
        cropPreviewSize / naturalHeight
      );
      const displayedWidth = naturalWidth * baseScale * cropZoom;
      const displayedHeight = naturalHeight * baseScale * cropZoom;
      const outputScale = savedImageSize / cropPreviewSize;

      context.fillStyle = "#fff";
      context.fillRect(0, 0, savedImageSize, savedImageSize);
      context.drawImage(
        image,
        (cropPreviewSize / 2 + cropOffset.x - displayedWidth / 2) *
          outputScale,
        (cropPreviewSize / 2 + cropOffset.y - displayedHeight / 2) *
          outputScale,
        displayedWidth * outputScale,
        displayedHeight * outputScale
      );

      updateExerciseImage(
        imageExercise.id,
        canvas.toDataURL("image/webp", 0.86)
      );
      closeImageSheet();
    };

    image.onerror = () => {
      alert("Unable to load this image.");
    };
    image.src = cropImage.url;
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

        <select
          value={exerciseStatus}
          onChange={(event) => setExerciseStatus(event.target.value)}
        >
          <option value="">All status</option>
          <option value={EXERCISE_STATUS.active}>Active</option>
          <option value={EXERCISE_STATUS.inactive}>Inactive</option>
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
          const active = isExerciseActive(exercise);

          return (
            <div
              key={exercise.id}
              role="button"
              tabIndex={0}
              onClick={() => setDetailExercise(exercise)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setDetailExercise(exercise);
                }
              }}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                color: "var(--text)",
                cursor: "pointer",
                padding: "10px",
                textAlign: "left",
                width: "100%",
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
                {exercise.builtin ? (
                  <ExerciseThumbnail
                    alt={exercise.imageAlt || `${exercise.name} demonstration`}
                    imageUrl={exercise.imageUrl}
                    size={76}
                  />
                ) : (
                  <button
                    aria-label={`Select image for ${exercise.name}`}
                    onClick={(event) => openImageSheet(event, exercise)}
                    style={{
                      background: "transparent",
                      border: "none",
                      flex: "0 0 76px",
                      height: "76px",
                      padding: 0,
                      width: "76px",
                    }}
                  >
                    {exercise.imageUrl ? (
                      <ExerciseThumbnail
                        alt={exercise.imageAlt || `${exercise.name} demonstration`}
                        imageUrl={exercise.imageUrl}
                        size={76}
                      />
                    ) : (
                      <span
                        style={{
                          alignItems: "center",
                          background: "var(--surface-muted)",
                          border: "1px solid var(--border)",
                          borderRadius: "6px",
                          color: "var(--text-muted)",
                          display: "flex",
                          height: "76px",
                          justifyContent: "center",
                          width: "76px",
                        }}
                      >
                        <ImagePlus size={24} />
                      </span>
                    )}
                  </button>
                )}

                <div
                  style={{
                    minWidth: 0,
                  }}
                >
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

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "6px",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleExerciseStatus(exercise);
                    }}
                    style={getExerciseStatusButtonStyle(active)}
                  >
                    {active ? "Active" : "Inactive"}
                  </button>

                  {!exercise.builtin && (
                    <>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        startEdit(exercise);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        setExerciseLibrary(
                          exerciseLibrary.filter((item) => item.id !== exercise.id)
                        );
                      }}
                    >
                      Delete
                    </button>
                    </>
                  )}
                </div>
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

              {(exercise.description || exercise.note) && (
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "12px",
                    marginTop: "6px",
                  }}
                >
                  {exercise.description || exercise.note}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {detailExercise && (
        <ExerciseDetailDialog
          exercise={detailExercise}
          history={history}
          onClose={() => setDetailExercise(null)}
        />
      )}

      <input
        ref={photoInputRef}
        accept="image/*"
        onChange={(event) => {
          handleImageFile(event.target.files?.[0]);
          event.target.value = "";
        }}
        style={{ display: "none" }}
        type="file"
      />

      {imageExercise && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Select image for ${imageExercise.name}`}
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
              borderRadius: "10px",
              boxShadow: "0 10px 28px rgba(0,0,0,.22)",
              display: "grid",
              gap: "12px",
              maxHeight: "calc(100vh - 32px)",
              maxWidth: "520px",
              overflow: "auto",
              padding: "14px",
              width: "100%",
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
              <h2
                style={{
                  fontSize: "1rem",
                  margin: 0,
                }}
              >
                Exercise Image
              </h2>
              <button
                aria-label="Close image options"
                onClick={closeImageSheet}
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  height: "34px",
                  justifyContent: "center",
                  width: "34px",
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "13px",
              }}
            >
              {imageExercise.name}
            </div>

            {cropImage ? (
              <div
                style={{
                  display: "grid",
                  gap: "12px",
                  justifyItems: "center",
                }}
              >
                <div
                  onPointerCancel={endCropDrag}
                  onPointerDown={startCropDrag}
                  onPointerMove={moveCropDrag}
                  onPointerUp={endCropDrag}
                  style={{
                    background: "var(--surface-muted)",
                    border: "2px solid var(--accent)",
                    borderRadius: "10px",
                    height: `${cropPreviewSize}px`,
                    overflow: "hidden",
                    position: "relative",
                    touchAction: "none",
                    width: `${cropPreviewSize}px`,
                  }}
                >
                  <img
                    alt="Crop preview"
                    src={cropImage.url}
                    style={{
                      display: "block",
                      height: "100%",
                      left: "50%",
                      objectFit: "cover",
                      position: "absolute",
                      top: "50%",
                      transform: `translate(calc(-50% + ${cropOffset.x}px), calc(-50% + ${cropOffset.y}px)) scale(${cropZoom})`,
                      transformOrigin: "center",
                      userSelect: "none",
                      width: "100%",
                    }}
                  />
                </div>

                <label
                  style={{
                    display: "grid",
                    gap: "6px",
                    width: "100%",
                  }}
                >
                  Zoom
                  <input
                    max="3"
                    min="1"
                    onChange={(event) =>
                      setCropZoom(Number.parseFloat(event.target.value))
                    }
                    step="0.05"
                    type="range"
                    value={cropZoom}
                  />
                </label>

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    justifyContent: "space-between",
                    width: "100%",
                  }}
                >
                  <button onClick={cancelCropImage} type="button">
                    Cancel
                  </button>
                  <button onClick={saveCroppedImage} type="button">
                    Use Crop
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={() => photoInputRef.current?.click()}
                  style={{
                    alignItems: "center",
                    display: "inline-flex",
                    gap: "6px",
                    justifyContent: "center",
                    minHeight: "42px",
                  }}
                >
                  <ImagePlus size={17} /> Choose Photo
                </button>

                <label
                  style={{
                    display: "grid",
                    gap: "6px",
                  }}
                >
                  <span
                    style={{
                      alignItems: "center",
                      display: "inline-flex",
                      gap: "6px",
                      fontWeight: "bold",
                    }}
                  >
                    <Copy size={16} /> Copy from exercise
                  </span>
                  <div
                    style={{
                      display: "grid",
                      gap: "8px",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                    }}
                  >
                    <select
                      value={copyImageExerciseId}
                      onChange={(event) =>
                        setCopyImageExerciseId(event.target.value)
                      }
                      style={{ minWidth: 0 }}
                    >
                      <option value="">Choose exercise</option>
                      {exerciseLibrary
                        .filter(
                          (exercise) =>
                            exercise.imageUrl && exercise.id !== imageExercise.id
                        )
                        .map((exercise) => (
                          <option key={exercise.id} value={exercise.id}>
                            {exercise.name}
                            {exercise.equipment?.[0]
                              ? ` (${exercise.equipment[0]})`
                              : ""}
                          </option>
                        ))}
                    </select>
                    <button
                      disabled={!copyImageExerciseId}
                      onClick={copyExerciseImage}
                      type="button"
                    >
                      Use
                    </button>
                  </div>
                </label>

                <label
                  style={{
                    display: "grid",
                    gap: "6px",
                  }}
                >
                  <span
                    style={{
                      alignItems: "center",
                      display: "inline-flex",
                      gap: "6px",
                      fontWeight: "bold",
                    }}
                  >
                    <Link size={16} /> Image URL
                  </span>
                  <div
                    style={{
                      display: "grid",
                      gap: "8px",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                    }}
                  >
                    <input
                      value={imageUrlDraft}
                      onChange={(event) => setImageUrlDraft(event.target.value)}
                      placeholder="https://..."
                      style={{ minWidth: 0 }}
                    />
                    <button onClick={saveImageUrl} type="button">
                      Save
                    </button>
                  </div>
                </label>
              </>
            )}
          </div>
        </div>
      )}

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
