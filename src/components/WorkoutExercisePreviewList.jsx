import { NotebookPen, Target, X } from "lucide-react";
import ExerciseThumbnail from "./ExerciseThumbnail";
import BenchmarkTrophy from "./BenchmarkTrophy";
import { isExerciseBenchmark } from "../utils/exerciseBenchmark";

export function WorkoutExercisePreviewGroup({ children, group }) {
  return (
    <div
      style={{
        background: group ? "var(--surface-muted)" : "transparent",
        borderBottom: group ? "3px solid #777" : "none",
        borderRadius: "8px",
        borderTop: group ? "3px solid #777" : "none",
        marginBottom: "8px",
        padding: "12px",
      }}
    >
      {children}
    </div>
  );
}

export function WorkoutExercisePreviewRow({
  actions,
  compact = false,
  exercise,
  exerciseDetail,
  leadingControl,
  layout = "default",
  note,
  onClearNote,
  onExerciseClick,
  onPrescriptionClick,
  onSetClick,
  prescriptionSummary,
  showNote = true,
  sideContent,
}) {
  const isTemplateCompact = layout === "templateCompact";
  const equipmentLabel = exercise.equipment?.[0] || "";
  const benchmark = isExerciseBenchmark(exerciseDetail || exercise);
  const hasMultiLinePrescription = String(prescriptionSummary || "").includes("\n");
  const exerciseTitle = (
    <>
      <span
        style={{
          alignItems: "center",
          display: "inline-flex",
          gap: "5px",
        }}
      >
        {benchmark ? <BenchmarkTrophy size={15} /> : null}
        <span style={{ fontWeight: "bold" }}>{exercise.name}</span>
      </span>
      {equipmentLabel ? (
        <span
          style={{
            color: "var(--text-muted)",
            fontSize: "0.78em",
            fontWeight: "normal",
          }}
        >
          {`, ${equipmentLabel}`}
        </span>
      ) : null}
    </>
  );
  const titleContent = onExerciseClick ? (
    <button
      type="button"
      onClick={onExerciseClick}
      style={{
        background: "transparent",
        border: 0,
        color: "var(--text)",
        cursor: "pointer",
        flex: 1,
        font: "inherit",
        minWidth: 0,
        overflowWrap: "break-word",
        padding: 0,
        textAlign: "left",
      }}
    >
      {exerciseTitle}
    </button>
  ) : (
    <span
      style={{
        flex: 1,
        lineHeight: 1.15,
        minWidth: 0,
        overflowWrap: "break-word",
      }}
    >
      {exerciseTitle}
    </span>
  );
  const prescriptionContent = prescriptionSummary ? (
    <button
      onClick={onPrescriptionClick}
      type="button"
      style={{
        background: "var(--surface-raised)",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        color: "var(--text)",
        cursor: onPrescriptionClick ? "pointer" : "default",
        font: "inherit",
        fontSize: isTemplateCompact ? "12.5px" : "13px",
        minHeight: isTemplateCompact ? "28px" : compact ? "30px" : "34px",
        minWidth: 0,
        overflow: isTemplateCompact && !hasMultiLinePrescription ? "hidden" : undefined,
        padding: compact ? "4px 6px" : "6px 8px",
        textAlign: "left",
        textOverflow: isTemplateCompact && !hasMultiLinePrescription ? "ellipsis" : undefined,
        whiteSpace:
          isTemplateCompact && !hasMultiLinePrescription ? "nowrap" : "pre-line",
      }}
    >
      {prescriptionSummary}
    </button>
  ) : (
    exercise.sets.map((set) => {
      const reps = set.prescribedReps || set.reps || set.targetReps || "";
      const rir = set.prescribedRir || set.rir || set.targetRir || "";

      return (
        <div
          key={set.id}
          onClick={() => onSetClick?.(set)}
          style={{
            alignItems: "center",
            cursor: onSetClick ? "pointer" : "default",
            display: "flex",
            flexWrap: "wrap",
            gap: "6px",
          }}
        >
          <span>
            <Target size={14} />{" "}
            {reps || "—"}
            {rir ? ` @ ${rir}` : ""}
          </span>
        </div>
      );
    })
  );
  const noteContent =
    showNote && note && note.trim().length > 0 ? (
      <div
        style={{
          color: "var(--text-muted)",
          fontSize: "0.75rem",
          marginLeft: "28px",
          marginTop: "2px",
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
          {note}
        </span>

        {onClearNote && (
          <button
            aria-label="Clear note"
            onClick={onClearNote}
            style={{
              alignItems: "center",
              background: "var(--surface-raised)",
              border: "1px solid var(--border)",
              borderRadius: "999px",
              color: "var(--text)",
              display: "inline-flex",
              height: "24px",
              justifyContent: "center",
              marginLeft: "8px",
              padding: 0,
              verticalAlign: "-6px",
              width: "24px",
            }}
          >
            <X size={13} />
          </button>
        )}
      </div>
    ) : null;

  if (isTemplateCompact) {
    return (
      <div
        style={{
          marginBottom: compact ? "8px" : "20px",
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: "8px",
            minWidth: 0,
          }}
        >
          <ExerciseThumbnail
            alt={exerciseDetail.imageAlt || `${exercise.name} demonstration`}
            imageUrl={exerciseDetail.imageUrl}
            size={compact ? 36 : 42}
          />

          <h3
            style={{
              alignItems: "center",
              display: "flex",
              flex: 1,
              fontSize: "0.85rem",
              margin: 0,
              minWidth: 0,
            }}
          >
            {leadingControl}
            {titleContent}
          </h3>
        </div>

        {noteContent}

        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: "6px",
            marginTop: "6px",
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: "grid",
              flex: "0 1 auto",
              maxWidth: "min(46vw, 196px)",
              minWidth: 0,
            }}
          >
            {prescriptionContent}
          </div>

          {actions && (
            <div
              style={{
                display: "flex",
                flexShrink: 0,
                gap: "4px",
                marginLeft: "auto",
              }}
            >
              {actions}
            </div>
          )}

          {sideContent ? (
            <div
              style={{
                flexShrink: 0,
              }}
            >
              {sideContent}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        marginBottom: compact ? "10px" : "20px",
      }}
    >
      <h3
        style={{
          alignItems: "center",
          display: "flex",
          fontSize: "0.85rem",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            flex: 1,
            gap: "4px",
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              flex: 1,
              gap: "6px",
              minWidth: 0,
            }}
          >
            {leadingControl}

            {titleContent}
          </div>
        </div>

        {actions && (
          <div
            style={{
              display: "flex",
              flexShrink: 0,
              gap: "4px",
              marginLeft: "auto",
            }}
          >
            {actions}
          </div>
        )}
      </h3>

      {noteContent}

      <div
        style={{
          alignItems: "flex-start",
          display: "flex",
          gap: "8px",
          marginTop: compact ? "3px" : "6px",
        }}
      >
        <ExerciseThumbnail
          alt={exerciseDetail.imageAlt || `${exercise.name} demonstration`}
          imageUrl={exerciseDetail.imageUrl}
          size={compact ? 36 : 42}
        />
        <div
          style={{
            display: "grid",
            flex: 1,
            gap: "5px",
            minWidth: 0,
          }}
        >
          {prescriptionContent}
        </div>

        {sideContent ? (
          <div
            style={{
              flexShrink: 0,
              marginLeft: "auto",
            }}
          >
            {sideContent}
          </div>
        ) : null}
      </div>
    </div>
  );
}
