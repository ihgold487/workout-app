import { useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, Play, Save, Trash2, X } from "lucide-react";
import { AppPageHeader } from "./ui/AppSurface";
import {
  CARDIO_WORKOUT_FORMATS,
  createCardioExerciseSnapshot,
  createCardioWorkoutLog,
  getCardioExercises,
  getCardioWorkoutFormatLabel,
  getCardioWorkoutSummary,
  getDefaultCardioWorkoutName,
  formatCardioDuration,
  metersPerSecondToMph,
  metersToMiles,
  secondsToMinutes,
} from "../utils/cardioWorkouts";

function Field({ children, label }) {
  return (
    <label style={{ display: "grid", gap: "5px" }}>
      <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function NumericField({ label, onChange, step = "any", value }) {
  return (
    <Field label={label}>
      <input
        inputMode="decimal"
        min="0"
        onChange={(event) => onChange(event.target.value)}
        step={step}
        type="number"
        value={value}
      />
    </Field>
  );
}

function getPrescriptionFormValues(template) {
  const prescription = template?.prescription || {};
  const work = prescription.work || {};
  const recovery = prescription.recovery || {};

  return {
    gradePercent: prescription.gradePercent ?? "",
    plannedDistanceMiles: metersToMiles(prescription.plannedDistanceMeters),
    plannedDurationMinutes: secondsToMinutes(
      prescription.plannedDurationSeconds
    ),
    recoveryDurationSeconds: prescription.recoveryDurationSeconds ?? "",
    recoveryGradePercent: recovery.gradePercent ?? "",
    recoveryResistance: recovery.resistance ?? "",
    recoverySpeedMph: metersPerSecondToMph(recovery.speedMetersPerSecond),
    resistance: prescription.resistance ?? "",
    rounds: prescription.rounds ?? "",
    speedMph: metersPerSecondToMph(prescription.speedMetersPerSecond),
    workDurationSeconds: prescription.workDurationSeconds ?? "",
    workGradePercent: work.gradePercent ?? "",
    workResistance: work.resistance ?? "",
    workSpeedMph: metersPerSecondToMph(work.speedMetersPerSecond),
  };
}

export function CardioWorkoutEditor({
  exerciseLibrary,
  onCancel,
  onSave,
  template,
}) {
  const cardioExercises = useMemo(
    () => getCardioExercises(exerciseLibrary),
    [exerciseLibrary]
  );
  const [exerciseId, setExerciseId] = useState(
    template?.exercise?.exerciseId ?? cardioExercises[0]?.id ?? ""
  );
  const [format, setFormat] = useState(
    template?.format || CARDIO_WORKOUT_FORMATS.steady
  );
  const [name, setName] = useState(template?.name || "");
  const [values, setValues] = useState(() => getPrescriptionFormValues(template));
  const [error, setError] = useState("");
  const selectedExercise = cardioExercises.find(
    (exercise) => String(exercise.id) === String(exerciseId)
  );

  const updateValue = (key, value) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  function handleSave() {
    if (!selectedExercise) {
      setError("Choose a cardio exercise before saving.");
      return;
    }

    onSave({
      createdAt: template?.createdAt || null,
      exercise: createCardioExerciseSnapshot(selectedExercise),
      format,
      id: template?.id || null,
      name: name.trim() || getDefaultCardioWorkoutName(selectedExercise, format),
      prescription: values,
      updatedAt: null,
    });
  }

  if (cardioExercises.length === 0) {
    return (
      <section style={{ padding: "20px" }}>
        <h1>No cardio exercises yet</h1>
        <p style={{ color: "var(--text-muted)", lineHeight: 1.5 }}>
          Add or tag an active exercise with the cardio modality first, then
          return here to create a cardio workout.
        </p>
        <button onClick={onCancel} type="button">Back</button>
      </section>
    );
  }

  return (
    <section style={{ display: "grid", gap: "16px", padding: "20px" }}>
      <div>
        <button
          onClick={onCancel}
          style={{ alignItems: "center", display: "inline-flex", gap: "5px" }}
          type="button"
        >
          <ChevronLeft size={17} /> Back to Plans
        </button>
        <h1 style={{ marginBottom: "5px" }}>
          {template ? "Edit cardio workout" : "New cardio workout"}
        </h1>
        <p style={{ color: "var(--text-muted)", lineHeight: 1.5, margin: 0 }}>
          Save a reusable one-exercise workout. All prescription details are
          optional reference values.
        </p>
      </div>

      <div className="app-section-card" style={{ display: "grid", gap: "14px" }}>
        <Field label="Cardio exercise">
          <select onChange={(event) => setExerciseId(event.target.value)} value={exerciseId}>
            {cardioExercises.map((exercise) => (
              <option key={exercise.id} value={exercise.id}>
                {exercise.name}{exercise.equipment ? ` · ${Array.isArray(exercise.equipment) ? exercise.equipment.join(", ") : exercise.equipment}` : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Workout type">
          <select onChange={(event) => setFormat(event.target.value)} value={format}>
            <option value={CARDIO_WORKOUT_FORMATS.steady}>Steady state</option>
            <option value={CARDIO_WORKOUT_FORMATS.hiit}>HIIT</option>
          </select>
        </Field>

        <Field label="Workout name (optional)">
          <input
            onChange={(event) => setName(event.target.value)}
            placeholder={getDefaultCardioWorkoutName(selectedExercise, format)}
            value={name}
          />
        </Field>
      </div>

      <div className="app-section-card" style={{ display: "grid", gap: "14px" }}>
        <div>
          <h2 style={{ fontSize: "17px", margin: 0 }}>Reference prescription</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "13px", margin: "4px 0 0" }}>
            Leave any value blank when you do not need it.
          </p>
        </div>

        {format === CARDIO_WORKOUT_FORMATS.steady ? (
          <>
            <div className="cardio-field-grid">
              <NumericField label="Planned duration (minutes)" onChange={(value) => updateValue("plannedDurationMinutes", value)} value={values.plannedDurationMinutes} />
              <NumericField label="Planned distance (miles)" onChange={(value) => updateValue("plannedDistanceMiles", value)} value={values.plannedDistanceMiles} />
              <NumericField label="Speed (mph)" onChange={(value) => updateValue("speedMph", value)} value={values.speedMph} />
              <NumericField label="Incline / grade (%)" onChange={(value) => updateValue("gradePercent", value)} value={values.gradePercent} />
              <NumericField label="Resistance" onChange={(value) => updateValue("resistance", value)} value={values.resistance} />
            </div>
          </>
        ) : (
          <>
            <div className="cardio-field-grid">
              <NumericField label="Rounds" onChange={(value) => updateValue("rounds", value)} step="1" value={values.rounds} />
              <NumericField label="Work duration (seconds)" onChange={(value) => updateValue("workDurationSeconds", value)} step="1" value={values.workDurationSeconds} />
              <NumericField label="Recovery duration (seconds)" onChange={(value) => updateValue("recoveryDurationSeconds", value)} step="1" value={values.recoveryDurationSeconds} />
            </div>
            <div className="cardio-intensity-grid">
              <div>
                <h3>Work</h3>
                <div className="cardio-field-grid">
                  <NumericField label="Speed (mph)" onChange={(value) => updateValue("workSpeedMph", value)} value={values.workSpeedMph} />
                  <NumericField label="Incline / grade (%)" onChange={(value) => updateValue("workGradePercent", value)} value={values.workGradePercent} />
                  <NumericField label="Resistance" onChange={(value) => updateValue("workResistance", value)} value={values.workResistance} />
                </div>
              </div>
              <div>
                <h3>Recovery</h3>
                <div className="cardio-field-grid">
                  <NumericField label="Speed (mph)" onChange={(value) => updateValue("recoverySpeedMph", value)} value={values.recoverySpeedMph} />
                  <NumericField label="Incline / grade (%)" onChange={(value) => updateValue("recoveryGradePercent", value)} value={values.recoveryGradePercent} />
                  <NumericField label="Resistance" onChange={(value) => updateValue("recoveryResistance", value)} value={values.recoveryResistance} />
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {error && <div role="alert" style={{ color: "var(--danger-text)" }}>{error}</div>}
      <button className="app-primary-action" onClick={handleSave} type="button">
        <Save size={17} /> Save cardio workout
      </button>
    </section>
  );
}

export function CardioWorkoutDetail({
  history = [],
  onBack,
  onComplete,
  onEdit,
  template,
}) {
  const [startedAt, setStartedAt] = useState(null);
  const [notes, setNotes] = useState("");
  const [results, setResults] = useState({
    averageSpeedMph: "",
    caloriesKilocalories: "",
    cadenceRpm: "",
    distanceMiles: "",
    durationMinutes: "",
    gradePercent: "",
    location: "",
    maxSpeedMph: "",
    powerWatts: "",
    resistance: "",
  });
  const updateResult = (key, value) => {
    setResults((current) => ({ ...current, [key]: value }));
  };
  const isStarted = Boolean(startedAt);
  const templateHistory = history
    .filter((log) => String(log.templateId) === String(template.id))
    .sort((left, right) =>
      String(right.completedAt || "").localeCompare(String(left.completedAt || ""))
    );

  return (
    <section style={{ display: "grid", gap: "16px", padding: "20px" }}>
      <div>
        <button
          onClick={onBack}
          style={{ alignItems: "center", display: "inline-flex", gap: "5px" }}
          type="button"
        >
          <ChevronLeft size={17} /> Back
        </button>
        <div style={{ alignItems: "start", display: "flex", gap: "10px", justifyContent: "space-between" }}>
          <div>
            <h1 style={{ marginBottom: "4px" }}>{template.name}</h1>
            <div style={{ color: "var(--text-muted)" }}>
              {template.exercise.name}{template.exercise.equipment ? ` · ${template.exercise.equipment}` : ""} · {getCardioWorkoutFormatLabel(template.format)}
            </div>
          </div>
          <button onClick={onEdit} type="button">Edit</button>
        </div>
      </div>

      <div className="app-section-card">
        <strong>Prescription</strong>
        <div style={{ color: "var(--text-muted)", marginTop: "5px" }}>
          {getCardioWorkoutSummary(template)}
        </div>
      </div>

      {templateHistory.length > 0 && (
        <div className="app-section-card" style={{ display: "grid", gap: "8px" }}>
          <strong>Recent completions</strong>
          {templateHistory.slice(0, 5).map((log) => {
            const resultDetails = [
              formatCardioDuration(log.results?.durationSeconds),
              log.results?.distanceMeters
                ? `${metersToMiles(log.results.distanceMeters)} mi`
                : null,
            log.results?.averageSpeedMetersPerSecond
              ? `${metersPerSecondToMph(log.results.averageSpeedMetersPerSecond)} mph avg`
              : null,
            log.results?.powerWatts ? `${log.results.powerWatts} W` : null,
          ].filter(Boolean);

            return (
              <div
                key={log.id}
                style={{
                  borderTop: "1px solid var(--border)",
                  color: "var(--text-muted)",
                  fontSize: "13px",
                  paddingTop: "8px",
                }}
              >
                <strong style={{ color: "var(--text)" }}>
                  {new Date(log.completedAt).toLocaleDateString()}
                </strong>
                {resultDetails.length > 0 ? ` · ${resultDetails.join(" · ")}` : " · Completed"}
                {log.notes ? <div style={{ marginTop: "3px" }}>{log.notes}</div> : null}
              </div>
            );
          })}
        </div>
      )}

      {!isStarted ? (
        <button className="app-primary-action" onClick={() => setStartedAt(new Date().toISOString())} type="button">
          <Play size={17} /> Start workout
        </button>
      ) : (
        <>
          <div className="app-section-card" style={{ display: "grid", gap: "14px" }}>
            <div>
              <h2 style={{ fontSize: "17px", margin: 0 }}>Completion details</h2>
              <p style={{ color: "var(--text-muted)", fontSize: "13px", margin: "4px 0 0" }}>
                These fields are optional reference data for this completed session.
              </p>
            </div>
            <div className="cardio-field-grid">
              <NumericField label="Duration (minutes)" onChange={(value) => updateResult("durationMinutes", value)} value={results.durationMinutes} />
              <NumericField label="Distance (miles)" onChange={(value) => updateResult("distanceMiles", value)} value={results.distanceMiles} />
              <NumericField label="Average speed (mph)" onChange={(value) => updateResult("averageSpeedMph", value)} value={results.averageSpeedMph} />
              <NumericField label="Maximum speed (mph)" onChange={(value) => updateResult("maxSpeedMph", value)} value={results.maxSpeedMph} />
              <NumericField label="Power (watts)" onChange={(value) => updateResult("powerWatts", value)} value={results.powerWatts} />
              <NumericField label="Cadence (RPM)" onChange={(value) => updateResult("cadenceRpm", value)} value={results.cadenceRpm} />
              <NumericField label="Incline / grade (%)" onChange={(value) => updateResult("gradePercent", value)} value={results.gradePercent} />
              <NumericField label="Resistance" onChange={(value) => updateResult("resistance", value)} value={results.resistance} />
              <NumericField label="Calories" onChange={(value) => updateResult("caloriesKilocalories", value)} value={results.caloriesKilocalories} />
              <Field label="Location">
                <select onChange={(event) => updateResult("location", event.target.value)} value={results.location}>
                  <option value="">Not specified</option>
                  <option value="indoor">Indoor</option>
                  <option value="outdoor">Outdoor</option>
                </select>
              </Field>
            </div>
            <Field label="Session notes">
              <textarea onChange={(event) => setNotes(event.target.value)} rows="3" value={notes} />
            </Field>
          </div>
          <button
            className="app-primary-action"
            onClick={() => onComplete(createCardioWorkoutLog(template, results, notes, startedAt))}
            type="button"
          >
            <Save size={17} /> Complete and save workout
          </button>
        </>
      )}
    </section>
  );
}

export function CompletedCardioWorkoutSheet({ onClose, workout, zIndex = 2200 }) {
  if (!workout) {
    return null;
  }

  const results = workout.results || {};
  const resultDetails = [
    ["Duration", formatCardioDuration(results.durationSeconds)],
    [
      "Distance",
      results.distanceMeters ? `${metersToMiles(results.distanceMeters)} mi` : null,
    ],
    [
      "Average speed",
      results.averageSpeedMetersPerSecond
        ? `${metersPerSecondToMph(results.averageSpeedMetersPerSecond)} mph`
        : null,
    ],
    [
      "Maximum speed",
      results.maxSpeedMetersPerSecond
        ? `${metersPerSecondToMph(results.maxSpeedMetersPerSecond)} mph`
        : null,
    ],
    ["Power", results.powerWatts ? `${results.powerWatts} W` : null],
    ["Cadence", results.cadenceRpm ? `${results.cadenceRpm} RPM` : null],
    ["Incline / grade", results.gradePercent != null ? `${results.gradePercent}%` : null],
    ["Resistance", results.resistance != null ? String(results.resistance) : null],
    ["Calories", results.caloriesKilocalories ? `${results.caloriesKilocalories} cal` : null],
    ["Location", results.location ? `${results.location[0].toUpperCase()}${results.location.slice(1)}` : null],
  ].filter(([, value]) => value);
  const completedAt = new Date(workout.completedAt || workout.completed_at);

  return (
    <div
      aria-label="Completed cardio workout details"
      aria-modal="true"
      onClick={onClose}
      role="dialog"
      style={{
        alignItems: "flex-end",
        background: "rgba(0,0,0,.45)",
        display: "flex",
        inset: 0,
        justifyContent: "center",
        position: "fixed",
        zIndex,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          background: "var(--surface-raised)",
          borderRadius: "18px 18px 0 0",
          boxShadow: "0 -8px 28px rgba(0,0,0,.22)",
          boxSizing: "border-box",
          display: "grid",
          gap: "14px",
          maxHeight: "76vh",
          maxWidth: "560px",
          overflowY: "auto",
          padding: "16px 16px calc(16px + env(safe-area-inset-bottom))",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                alignItems: "center",
                display: "flex",
                fontSize: "18px",
                gap: "8px",
                lineHeight: 1.15,
                margin: 0,
              }}
            >
              <img
                alt=""
                aria-hidden="true"
                src="/cardio-workouts-icon.png"
                style={{ height: "25px", objectFit: "contain", width: "25px" }}
              />
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {workout.templateName || workout.exercise?.name || "Cardio workout"}
              </span>
            </h2>
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "12px",
                marginTop: "3px",
              }}
            >
              {Number.isFinite(completedAt.getTime())
                ? completedAt.toLocaleString()
                : "Completed cardio workout"}
              {workout.exercise?.name ? ` · ${workout.exercise.name}` : ""}
              {workout.format ? ` · ${getCardioWorkoutFormatLabel(workout.format)}` : ""}
            </div>
          </div>
          <button
            aria-label="Close completed cardio workout details"
            onClick={onClose}
            style={{
              alignItems: "center",
              display: "inline-flex",
              justifyContent: "center",
              minHeight: "36px",
              minWidth: "36px",
              padding: 0,
            }}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div
          style={{
            background: "var(--surface-muted)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            color: "var(--text-muted)",
            fontSize: "13px",
            padding: "10px",
          }}
        >
          <strong style={{ color: "var(--text-h)" }}>Prescription</strong>
          <div style={{ marginTop: "4px" }}>
            {getCardioWorkoutSummary(workout)}
          </div>
        </div>

        <div>
          <strong>Completed details</strong>
          {resultDetails.length > 0 ? (
            <div
              style={{
                display: "grid",
                gap: "8px",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                marginTop: "8px",
              }}
            >
              {resultDetails.map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    background: "var(--surface-muted)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    display: "grid",
                    gap: "3px",
                    padding: "10px",
                  }}
                >
                  <span style={{ color: "var(--text-muted)", fontSize: "11px" }}>
                    {label}
                  </span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: "var(--text-muted)", fontSize: "13px", marginTop: "5px" }}>
              Completed; no optional results were recorded.
            </div>
          )}
        </div>

        {workout.notes && (
          <div>
            <strong>Notes</strong>
            <div style={{ color: "var(--text-muted)", marginTop: "5px", whiteSpace: "pre-wrap" }}>
              {workout.notes}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function CardioWorkoutHistory({
  history = [],
  onBack,
  onDeleteLog,
  onOpenLog,
  template,
}) {
  const templateHistory = history
    .filter((log) => String(log.templateId) === String(template.id))
    .sort((left, right) =>
      String(right.completedAt || "").localeCompare(String(left.completedAt || ""))
    );

  return (
    <section className="workout-history-view">
      <AppPageHeader
        action={
          <button
            aria-label="Return to Home"
            className="workout-history-view__back"
            onClick={onBack}
            type="button"
          >
            <ArrowLeft size={18} /> <span>Home</span>
          </button>
        }
        icon={
          <span
            aria-hidden="true"
            style={{
              background: "#3f5f7d",
              display: "block",
              height: "25px",
              mask: "url('/cardio-workouts-icon.png') center / contain no-repeat",
              WebkitMask:
                "url('/cardio-workouts-icon.png') center / contain no-repeat",
              width: "25px",
            }}
          />
        }
        subtitle={`${templateHistory.length} completed ${templateHistory.length === 1 ? "workout" : "workouts"}`}
        title={`${template.name} history`}
      />

      {templateHistory.length === 0 ? (
        <div className="app-section-card" style={{ color: "var(--text-muted)" }}>
          No completed workouts for this template yet.
        </div>
      ) : (
        templateHistory.map((log) => {
          const resultDetails = [
            formatCardioDuration(log.results?.durationSeconds),
            log.results?.distanceMeters
              ? `${metersToMiles(log.results.distanceMeters)} mi`
              : null,
            log.results?.averageSpeedMetersPerSecond
              ? `${metersPerSecondToMph(log.results.averageSpeedMetersPerSecond)} mph avg`
              : null,
            log.results?.powerWatts ? `${log.results.powerWatts} W` : null,
          ].filter(Boolean);

          return (
            <div
              className="app-section-card"
              key={log.id}
              style={{
                alignItems: "center",
                display: "grid",
                gap: "10px",
                gridTemplateColumns: "minmax(0, 1fr) auto",
              }}
            >
              <button
                aria-label={`Open completed ${template.name} workout`}
                onClick={() => onOpenLog?.(log)}
                style={{
                  background: "transparent",
                  border: 0,
                  color: "var(--text)",
                  display: "grid",
                  gap: "8px",
                  minHeight: "44px",
                  padding: 0,
                  textAlign: "left",
                  width: "100%",
                }}
                type="button"
              >
                <strong>{new Date(log.completedAt).toLocaleString()}</strong>
                <div style={{ color: "var(--text-muted)", fontSize: "14px" }}>
                  {resultDetails.length > 0 ? resultDetails.join(" · ") : "Completed"}
                </div>
                {log.notes ? <div style={{ color: "var(--text-muted)", fontSize: "14px" }}>{log.notes}</div> : null}
              </button>
              <div>
                <button
                  aria-label="Delete completed cardio workout"
                  onClick={() => onDeleteLog?.(log)}
                  style={{ color: "var(--danger-text)", minHeight: "40px", minWidth: "40px", padding: "5px" }}
                  title="Delete completed workout"
                  type="button"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}
