import { Dumbbell, NotebookPen, Target, X } from "lucide-react";
import ExerciseThumbnail from "./ExerciseThumbnail";
import { calculateE1RM } from "../utils/e1rm";

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
  exercise,
  exerciseDetail,
  leadingControl,
  note,
  onClearNote,
  onExerciseClick,
  onPrescriptionClick,
  onSetClick,
  prescriptionSummary,
  sideContent,
}) {
  return (
    <div
      style={{
        marginBottom: "20px",
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

            {onExerciseClick ? (
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
                  fontWeight: "bold",
                  minWidth: 0,
                  overflowWrap: "break-word",
                  padding: 0,
                  textAlign: "left",
                }}
              >
                {`${exercise.name}${
                  exercise.equipment?.[0] ? ", " + exercise.equipment[0] : ""
                }`}
              </button>
            ) : (
              <strong
                style={{
                  flex: 1,
                  lineHeight: 1.15,
                  minWidth: 0,
                  overflowWrap: "break-word",
                }}
              >
                {`${exercise.name}${
                  exercise.equipment?.[0] ? ", " + exercise.equipment[0] : ""
                }`}
              </strong>
            )}
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

      {note && note.trim().length > 0 ? (
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
      ) : null}

      <div
        style={{
          alignItems: "flex-start",
          display: "flex",
          gap: "8px",
          marginTop: "6px",
        }}
      >
        <ExerciseThumbnail
          alt={exerciseDetail.imageAlt || `${exercise.name} demonstration`}
          imageUrl={exerciseDetail.imageUrl}
          size={42}
        />
        <div
          style={{
            display: "grid",
            flex: 1,
            gap: "5px",
            minWidth: 0,
          }}
        >
          {prescriptionSummary ? (
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
                fontSize: "13px",
                minHeight: "34px",
                padding: "6px 8px",
                textAlign: "left",
              }}
            >
              {prescriptionSummary}
            </button>
          ) : (
            exercise.sets.map((set) => {
              const reps = set.targetReps || set.reps || "";
              const rir = set.targetRir || set.rir || "";
              const targetE1RM = set.targetWeight
                ? calculateE1RM(null, reps, rir, set.targetWeight)?.toFixed(1)
                : null;

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
                    {set.targetWeight ? `${set.targetWeight}×` : ""}
                    {reps || "—"}
                    {rir ? ` @ ${rir}` : ""}
                    {set.targetWeight ? (
                      <>
                        {" "}
                        (<Dumbbell size={13} /> {targetE1RM || "—"})
                      </>
                    ) : null}
                  </span>
                </div>
              );
            })
          )}
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
