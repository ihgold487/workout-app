import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, Pause, Pencil, Play, RotateCcw, Save, Square, Trash2, X } from "lucide-react";
import { AppPageHeader, AppSectionCard, AppSectionHeading } from "./ui/AppSurface";
import {
  CARDIO_PHASE_DEFAULT_COLORS,
  CARDIO_WORKOUT_FORMATS,
  calculateCardioWorkoutDuration,
  createCardioExerciseSnapshot,
  createCardioWorkoutLog,
  getCardioExercises,
  getCardioWorkoutPhases,
  getCardioWorkoutFormatLabel,
  getCardioWorkoutSummary,
  getDefaultCardioWorkoutName,
  formatCardioDuration,
  metersPerSecondToMph,
  metersToMiles,
  normalizeCardioPrescription,
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

function CompactField({ children, label }) {
  return (
    <label className="cardio-compact-field">
      <span>{label}</span>
      <span className="cardio-compact-field__entry">{children}</span>
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

function formatWorkoutTimer(seconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainder = totalSeconds % 60;
  const paddedMinutes = String(minutes).padStart(2, "0");
  const paddedSeconds = String(remainder).padStart(2, "0");

  return hours > 0
    ? `${hours}:${paddedMinutes}:${paddedSeconds}`
    : `${paddedMinutes}:${paddedSeconds}`;
}

const DURATION_MINUTES = Array.from({ length: 121 }, (_, index) => index);
const DURATION_SECONDS = Array.from({ length: 60 }, (_, index) => index);
const TREADMILL_SPEEDS = Array.from(
  { length: 71 },
  (_, index) => (3 + index / 10).toFixed(1)
);
const TREADMILL_INCLINES = Array.from(
  { length: 151 },
  (_, index) => (index / 10).toFixed(1)
);
const PHASE_COLOR_OPTIONS = [
  { label: "Red", value: "#dc2626" },
  { label: "Orange", value: "#ea7a17" },
  { label: "Yellow", value: "#ca8a04" },
  { label: "Green", value: "#2f8a6a" },
  { label: "Blue", value: "#3f5f9b" },
  { label: "Purple", value: "#7c5aa6" },
];

function formatTreadmillPickerValue(value) {
  if (value === "" || value == null) return "";

  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue.toFixed(1) : "";
}

function DurationField({ label, onChange, value }) {
  const totalSeconds = Number(value);
  const isSet = Number.isFinite(totalSeconds) && totalSeconds > 0;
  const minutes = isSet ? Math.floor(totalSeconds / 60) : "";
  const seconds = isSet ? Math.round(totalSeconds % 60) : "";

  const updateDuration = (part, nextValue) => {
    const nextMinutes = Number(part === "minutes" ? nextValue : minutes) || 0;
    const nextSeconds = Number(part === "seconds" ? nextValue : seconds) || 0;
    onChange(nextMinutes * 60 + nextSeconds || "");
  };

  return (
    <CompactField label={label}>
      <span className="cardio-duration-picker">
        <select
          aria-label={`${label}: minutes`}
          onChange={(event) => updateDuration("minutes", event.target.value)}
          value={minutes}
        >
          <option value="">Min</option>
          {DURATION_MINUTES.map((minute) => (
            <option key={minute} value={minute}>{minute}</option>
          ))}
        </select>
        <span>:</span>
        <select
          aria-label={`${label}: seconds`}
          onChange={(event) => updateDuration("seconds", event.target.value)}
          value={seconds}
        >
          <option value="">Sec</option>
          {DURATION_SECONDS.map((second) => (
            <option key={second} value={second}>{String(second).padStart(2, "0")}</option>
          ))}
        </select>
      </span>
    </CompactField>
  );
}

function TreadmillPicker({ label, onChange, options, suffix, value }) {
  return (
    <CompactField label={label}>
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        <option value="">Not set</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}{suffix}</option>
        ))}
      </select>
    </CompactField>
  );
}

function getPrescriptionFormValues(template) {
  const prescription = template?.prescription || {};
  const work = prescription.work || {};
  const recovery = prescription.recovery || {};
  const warmup = prescription.warmup || {};
  const cooldown = prescription.cooldown || {};

  return {
    plannedDistanceMiles: metersToMiles(prescription.plannedDistanceMeters),
    cooldownDurationSeconds:
      cooldown.durationSeconds ?? prescription.cooldownDurationSeconds ?? "",
    cooldownLabel: cooldown.label ?? "",
    cooldownColor: cooldown.color ?? CARDIO_PHASE_DEFAULT_COLORS.cooldown,
    cooldownGradePercent: formatTreadmillPickerValue(cooldown.gradePercent),
    cooldownCadenceRpm: cooldown.cadenceRpm ?? "",
    cooldownPowerWatts: cooldown.powerWatts ?? "",
    cooldownResistance: cooldown.resistance ?? "",
    cooldownSpeedMph: formatTreadmillPickerValue(
      metersPerSecondToMph(cooldown.speedMetersPerSecond)
    ),
    recoveryDurationSeconds:
      recovery.durationSeconds ?? prescription.recoveryDurationSeconds ?? "",
    recoveryLabel: recovery.label ?? "",
    recoveryColor: recovery.color ?? CARDIO_PHASE_DEFAULT_COLORS.recovery,
    recoveryGradePercent: formatTreadmillPickerValue(recovery.gradePercent),
    recoveryCadenceRpm: recovery.cadenceRpm ?? "",
    recoveryPowerWatts: recovery.powerWatts ?? "",
    recoveryResistance: recovery.resistance ?? "",
    recoverySpeedMph: formatTreadmillPickerValue(
      metersPerSecondToMph(recovery.speedMetersPerSecond)
    ),
    rounds:
      prescription.rounds ??
      (template?.format === CARDIO_WORKOUT_FORMATS.steady ? 1 : ""),
    warmupDurationSeconds:
      warmup.durationSeconds ?? prescription.warmupDurationSeconds ?? "",
    warmupLabel: warmup.label ?? "",
    warmupColor: warmup.color ?? CARDIO_PHASE_DEFAULT_COLORS.warmup,
    warmupGradePercent: formatTreadmillPickerValue(warmup.gradePercent),
    warmupCadenceRpm: warmup.cadenceRpm ?? "",
    warmupPowerWatts: warmup.powerWatts ?? "",
    warmupResistance: warmup.resistance ?? "",
    warmupSpeedMph: formatTreadmillPickerValue(
      metersPerSecondToMph(warmup.speedMetersPerSecond)
    ),
    workDurationSeconds:
      (work.durationSeconds ??
        prescription.workDurationSeconds ??
        secondsToMinutes(prescription.plannedDurationSeconds) * 60) ||
      "",
    workLabel: work.label ?? "",
    workColor: work.color ?? CARDIO_PHASE_DEFAULT_COLORS.work,
    workGradePercent: formatTreadmillPickerValue(
      work.gradePercent ?? prescription.gradePercent
    ),
    workCadenceRpm: work.cadenceRpm ?? "",
    workPowerWatts: work.powerWatts ?? "",
    workResistance: work.resistance ?? "",
    workSpeedMph: formatTreadmillPickerValue(
      metersPerSecondToMph(
        work.speedMetersPerSecond ?? prescription.speedMetersPerSecond
      )
    ),
  };
}

function getExerciseTargetMode(exercise) {
  const name = String(exercise?.name || "").toLowerCase();
  if (name.includes("treadmill")) return "treadmill";
  if (name.includes("bike") || name.includes("cycling")) return "bike";
  return "instruction";
}

function getPhaseInstructionSuggestions(phase) {
  if (phase === "warmup" || phase === "cooldown") {
    return ["Easy", "Easy walk", "Easy jog", "Easy ride"];
  }

  return phase === "recovery"
    ? ["Walk", "Easy jog", "Easy ride", "Recovery"]
    : ["Easy jog", "Jog", "Run", "Sprint", "Moderate", "Hard"];
}

function getPhaseTitle(phase) {
  return {
    cooldown: "Cool-down",
    recovery: "Recovery",
    warmup: "Warm-up",
    work: "Working interval",
  }[phase];
}

function PhaseEditor({ mode, onChange, phase, values }) {
  const suggestionId = `cardio-${phase}-instructions`;
  const fieldPrefix = phase;
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const phaseColor = values[`${fieldPrefix}Color`] || CARDIO_PHASE_DEFAULT_COLORS[phase];
  const targetFields =
    mode === "bike"
      ? [
          ["Resistance", `${fieldPrefix}Resistance`, "any"],
          ["Cadence (RPM)", `${fieldPrefix}CadenceRpm`, "1"],
          ["Power (watts)", `${fieldPrefix}PowerWatts`, "1"],
        ]
      : [];

  return (
    <div className="cardio-phase-card" style={{ "--cardio-phase-color": phaseColor }}>
      <div className="cardio-phase-card__heading">
        <div className="cardio-phase-card__title">
          <div className="cardio-phase-color-picker">
            <button
              aria-expanded={isColorPickerOpen}
              aria-label={`Choose ${getPhaseTitle(phase).toLowerCase()} color`}
              className="cardio-phase-color-picker__trigger"
              onClick={() => setIsColorPickerOpen((open) => !open)}
              style={{ background: phaseColor }}
              type="button"
            />
            {isColorPickerOpen && (
              <div
                aria-label={`${getPhaseTitle(phase)} color options`}
                className="cardio-phase-color-picker__menu"
                role="group"
              >
                {PHASE_COLOR_OPTIONS.map((option) => (
                  <button
                    aria-label={option.label}
                    aria-pressed={option.value === phaseColor}
                    className="cardio-phase-color-picker__option"
                    key={option.value}
                    onClick={() => {
                      onChange(`${fieldPrefix}Color`, option.value);
                      setIsColorPickerOpen(false);
                    }}
                    style={{ background: option.value }}
                    type="button"
                  />
                ))}
              </div>
            )}
          </div>
          <h3>{getPhaseTitle(phase)}</h3>
        </div>
        <span>{phase === "work" ? "Main effort" : "Optional"}</span>
      </div>
      <div className="cardio-phase-card__fields">
        <DurationField
          label="Duration"
          onChange={(value) => onChange(`${fieldPrefix}DurationSeconds`, value)}
          value={values[`${fieldPrefix}DurationSeconds`]}
        />
        <Field label="Instruction (optional)">
          <input
            list={suggestionId}
            onChange={(event) => onChange(`${fieldPrefix}Label`, event.target.value)}
            placeholder={phase === "work" ? "e.g. Sprint" : "e.g. Easy walk"}
            value={values[`${fieldPrefix}Label`]}
          />
          <datalist id={suggestionId}>
            {getPhaseInstructionSuggestions(phase).map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </Field>
      </div>
      {mode === "treadmill" && (
        <div className="cardio-phase-card__targets">
          <TreadmillPicker
            label="Speed"
            onChange={(value) => onChange(`${fieldPrefix}SpeedMph`, value)}
            options={TREADMILL_SPEEDS}
            suffix=" mph"
            value={values[`${fieldPrefix}SpeedMph`]}
          />
          <TreadmillPicker
            label="Incline"
            onChange={(value) => onChange(`${fieldPrefix}GradePercent`, value)}
            options={TREADMILL_INCLINES}
            suffix="%"
            value={values[`${fieldPrefix}GradePercent`]}
          />
        </div>
      )}
      {targetFields.length > 0 && (
        <div className="cardio-phase-card__targets">
          {targetFields.map(([label, key, step]) => (
            <CompactField key={key} label={label}>
              <input
                inputMode="decimal"
                min="0"
                onChange={(event) => onChange(key, event.target.value)}
                step={step}
                type="number"
                value={values[key]}
              />
            </CompactField>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkoutMetricPlot({ color, formatValue, label, metric, onExpand, phases, totalDuration }) {
  const values = phases.map((phase) => Number(phase.target?.[metric]));
  if (!values.some(Number.isFinite)) return null;

  const width = 640;
  const height = 104;
  const chartTop = 22;
  const chartBottom = 76;
  const maxValue = Math.max(1, ...values.filter(Number.isFinite));
  let elapsed = 0;
  const segments = phases.map((phase, index) => {
    const start = (elapsed / totalDuration) * width;
    elapsed += phase.durationSeconds;
    const end = (elapsed / totalDuration) * width;
    const isSet = Number.isFinite(values[index]);
    const value = isSet ? values[index] : 0;
    const y = chartBottom - (value / maxValue) * (chartBottom - chartTop);
    return { end, isSet, phaseColor: phase.color, start, y };
  });
  let hasPreviousValue = false;
  const path = segments.map(({ end, isSet, start, y }) => {
    if (!isSet) {
      hasPreviousValue = false;
      return "";
    }
    const command = hasPreviousValue ? "L" : "M";
    hasPreviousValue = true;
    return `${command}${start} ${y} H${end}`;
  }).join(" ");

  const chart = (
    <div className="cardio-metric-plot">
      <div className="cardio-preview__axis-label">{label}</div>
      <svg aria-label={`${label} over time`} role="img" viewBox={`0 0 ${width} ${height}`}>
        {[0, 0.5, 1].map((fraction) => {
          const y = chartBottom - fraction * (chartBottom - chartTop);
          return <line key={fraction} stroke="var(--border)" x1="0" x2={width} y1={y} y2={y} />;
        })}
        {segments.map(({ end, isSet, phaseColor, start, y }, index) => (
          <rect
            fill={isSet ? phaseColor : "var(--surface-muted)"}
            fillOpacity={isSet ? "0.34" : "1"}
            height={chartBottom - y}
            key={index}
            width={Math.max(1, end - start - 2)}
            x={start + 1}
            y={y}
          />
        ))}
        <path d={path} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
        <text fill="var(--text-muted)" fontSize="11" x="0" y="14">{formatValue(maxValue)}</text>
        <text fill="var(--text-muted)" fontSize="11" textAnchor="end" x={width} y="96">{formatCardioDuration(totalDuration)}</text>
      </svg>
    </div>
  );

  return onExpand ? (
    <button
      aria-label={`Enlarge ${label} workout chart`}
      className="cardio-metric-plot__button"
      onClick={onExpand}
      type="button"
    >
      {chart}
    </button>
  ) : chart;
}

function PhasePreviewTable({ mode, phases }) {
  const rows = [];
  phases.forEach((phase) => {
    const prior = rows.find((row) => row.kind === phase.kind);
    if (prior) {
      prior.count += 1;
    } else {
      rows.push({ ...phase, count: 1 });
    }
  });

  return (
    <div className="cardio-preview-table-wrap">
      <table className="cardio-preview-table">
        <thead>
          <tr>
            <th>Phase</th>
            <th>Duration</th>
            {mode === "treadmill" && <th>Speed</th>}
            {mode === "treadmill" && <th>Incline</th>}
            <th>Instruction</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((phase) => (
            <tr key={phase.kind}>
              <td>
                <span
                  className="cardio-preview-table__phase-label"
                  style={{ "--cardio-phase-color": phase.color }}
                >
                  {phase.kind === "work" ? "Working" : getPhaseTitle(phase.kind)}
                </span>
              </td>
              <td>{phase.count > 1 ? `${phase.count} × ` : ""}{formatCardioDuration(phase.durationSeconds)}</td>
              {mode === "treadmill" && <td>{phase.target.speedMetersPerSecond != null ? `${metersPerSecondToMph(phase.target.speedMetersPerSecond)} mph` : "—"}</td>}
              {mode === "treadmill" && <td>{phase.target.gradePercent != null ? `${phase.target.gradePercent}%` : "—"}</td>}
              <td>{phase.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CardioWorkoutPreview({ mode, prescription }) {
  const phases = getCardioWorkoutPhases(prescription);
  const totalDuration = calculateCardioWorkoutDuration(prescription);
  const [isExpanded, setIsExpanded] = useState(false);

  if (!phases.length || !totalDuration) {
    return (
      <div className="cardio-preview__empty">
        Add a duration to any phase to see its workout preview.
      </div>
    );
  }

  const treadmillPlots = (onExpand) => (
    <div className="cardio-metric-plots">
      <WorkoutMetricPlot
        color="#3f5f7d"
        formatValue={(value) => `${metersPerSecondToMph(value)} mph`}
        label="Speed (mph)"
        metric="speedMetersPerSecond"
        onExpand={onExpand}
        phases={phases}
        totalDuration={totalDuration}
      />
      <WorkoutMetricPlot
        color="#408d82"
        formatValue={(value) => `${value}%`}
        label="Incline (%)"
        metric="gradePercent"
        onExpand={onExpand}
        phases={phases}
        totalDuration={totalDuration}
      />
    </div>
  );

  const structure = <PhasePreviewTable mode={mode} phases={phases} />;

  return (
    <>
      <div className="cardio-preview__content">
        {mode === "treadmill" && treadmillPlots(() => setIsExpanded(true))}
        {structure}
      </div>
      {isExpanded && (
        <div
          aria-label="Expanded cardio workout preview"
          aria-modal="true"
          className="cardio-preview-dialog"
          onClick={() => setIsExpanded(false)}
          role="dialog"
        >
          <div className="cardio-preview-dialog__content" onClick={(event) => event.stopPropagation()}>
            <div className="cardio-preview-dialog__header">
              <div>
                <strong>Workout preview</strong>
                <div>{formatCardioDuration(totalDuration)} total</div>
              </div>
              <button aria-label="Close workout preview" onClick={() => setIsExpanded(false)} type="button">
                <X size={18} />
              </button>
            </div>
            {mode === "treadmill" && treadmillPlots()}
            {structure}
          </div>
        </div>
      )}
    </>
  );
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
  const targetMode = getExerciseTargetMode(selectedExercise);
  const previewPrescription = useMemo(
    () => normalizeCardioPrescription({ format, values }),
    [format, values]
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
      </div>

      <div className="app-section-card" style={{ display: "grid", gap: "14px" }}>
        <CompactField label="Cardio exercise">
          <select onChange={(event) => setExerciseId(event.target.value)} value={exerciseId}>
            {cardioExercises.map((exercise) => (
              <option key={exercise.id} value={exercise.id}>
                {exercise.name}
              </option>
            ))}
          </select>
        </CompactField>

        <CompactField label="Workout type">
          <select
            onChange={(event) => {
              const nextFormat = event.target.value;
              setFormat(nextFormat);
              if (nextFormat === CARDIO_WORKOUT_FORMATS.steady) {
                updateValue("rounds", "1");
              }
            }}
            value={format}
          >
            <option value={CARDIO_WORKOUT_FORMATS.steady}>Steady state</option>
            <option value={CARDIO_WORKOUT_FORMATS.hiit}>HIIT</option>
          </select>
        </CompactField>

        <CompactField label="Workout name (optional)">
          <input
            onChange={(event) => setName(event.target.value)}
            placeholder={getDefaultCardioWorkoutName(selectedExercise, format)}
            value={name}
          />
        </CompactField>
      </div>

      <div className="app-section-card" style={{ display: "grid", gap: "14px" }}>
        <div>
          <h2 style={{ fontSize: "17px", margin: 0 }}>Workout structure</h2>
        </div>

        <div className="cardio-total-duration">
          <span>Total duration</span>
          <strong>
            {formatCardioDuration(
              calculateCardioWorkoutDuration(previewPrescription)
            ) || "Add phase times"}
          </strong>
        </div>

        <PhaseEditor mode={targetMode} onChange={updateValue} phase="warmup" values={values} />

        {format === CARDIO_WORKOUT_FORMATS.hiit ? (
          <div className="cardio-interval-pair-group">
            <div className="cardio-interval-pair-group__label">
              HIIT interval pair
            </div>
            <CompactField label="Repeat working / recovery pair">
              <span className="cardio-rounds-control">
                <input
                  inputMode="numeric"
                  min="1"
                  onChange={(event) => updateValue("rounds", event.target.value)}
                  step="1"
                  type="number"
                  value={values.rounds}
                />
                <span>times</span>
              </span>
            </CompactField>
            <PhaseEditor mode={targetMode} onChange={updateValue} phase="work" values={values} />
            <PhaseEditor mode={targetMode} onChange={updateValue} phase="recovery" values={values} />
          </div>
        ) : (
          <PhaseEditor mode={targetMode} onChange={updateValue} phase="work" values={values} />
        )}
        <PhaseEditor mode={targetMode} onChange={updateValue} phase="cooldown" values={values} />

        <CompactField label="Reference distance (miles, optional)">
          <input
            inputMode="decimal"
            min="0"
            onChange={(event) => updateValue("plannedDistanceMiles", event.target.value)}
            step="any"
            type="number"
            value={values.plannedDistanceMiles}
          />
        </CompactField>
      </div>

      <div className="app-section-card cardio-preview" style={{ display: "grid", gap: "10px" }}>
        <div>
          <h2 style={{ fontSize: "17px", margin: 0 }}>Workout preview</h2>
        </div>
        <CardioWorkoutPreview mode={targetMode} prescription={previewPrescription} />
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
  onComplete,
  onEdit,
  template,
}) {
  const [startedAt, setStartedAt] = useState(null);
  const [timerStatus, setTimerStatus] = useState("idle");
  const [timerStartedAt, setTimerStartedAt] = useState(null);
  const [elapsedBeforeRunSeconds, setElapsedBeforeRunSeconds] = useState(0);
  const [timerNow, setTimerNow] = useState(() => Date.now());
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
  const getElapsedTimerSeconds = (now = Date.now()) => {
    if (timerStatus !== "running" || !timerStartedAt) {
      return elapsedBeforeRunSeconds;
    }

    return elapsedBeforeRunSeconds + Math.max(
      0,
      Math.floor((now - new Date(timerStartedAt).getTime()) / 1000)
    );
  };
  const elapsedTimerSeconds = getElapsedTimerSeconds(timerNow);
  const isStarted = timerStatus !== "idle";
  const targetMode = getExerciseTargetMode(template.exercise);
  const templateHistory = history
    .filter((log) => String(log.templateId) === String(template.id))
    .sort((left, right) =>
      String(right.completedAt || "").localeCompare(String(left.completedAt || ""))
    );

  useEffect(() => {
    if (timerStatus !== "running") return undefined;

    setTimerNow(Date.now());
    const intervalId = window.setInterval(() => setTimerNow(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [timerStatus]);

  const startTimer = () => {
    const now = new Date();
    setStartedAt(now.toISOString());
    setElapsedBeforeRunSeconds(0);
    setTimerNow(now.getTime());
    setTimerStartedAt(now.toISOString());
    setTimerStatus("running");
  };

  const pauseOrStopTimer = (nextStatus) => {
    const now = Date.now();
    setElapsedBeforeRunSeconds(getElapsedTimerSeconds(now));
    setTimerNow(now);
    setTimerStartedAt(null);
    setTimerStatus(nextStatus);
  };

  const resumeTimer = () => {
    const now = new Date();
    setTimerNow(now.getTime());
    setTimerStartedAt(now.toISOString());
    setTimerStatus("running");
  };

  const restartTimer = () => {
    const now = new Date();
    setStartedAt(now.toISOString());
    setElapsedBeforeRunSeconds(0);
    setTimerNow(now.getTime());
    setTimerStartedAt(now.toISOString());
    setTimerStatus("running");
  };

  return (
    <section className="cardio-workout-detail">
      <AppPageHeader
        action={
          <button
            className="app-secondary-action cardio-workout-detail__edit-action"
            onClick={onEdit}
            type="button"
          >
            <Pencil size={16} /> Edit Workout
          </button>
        }
        subtitle={`${template.exercise.name}${template.exercise.equipment ? ` · ${template.exercise.equipment}` : ""} · ${getCardioWorkoutFormatLabel(template.format)}`}
        title={template.name}
      />

      <AppSectionCard className="cardio-workout-detail__summary" tone="accent">
        <AppSectionHeading
          eyebrow="Workout prescription"
          subtitle={getCardioWorkoutSummary(template)}
          title="Ready when you are"
        />
      </AppSectionCard>

      <div className="app-section-card cardio-preview" style={{ display: "grid", gap: "10px" }}>
        <div>
          <h2 style={{ fontSize: "17px", margin: 0 }}>Workout preview</h2>
          <p style={{ color: "var(--text-muted)", fontSize: "13px", margin: "4px 0 0" }}>
            {targetMode === "instruction"
              ? "Reference timeline for this workout."
              : "Reference timeline and machine settings for this workout."}
          </p>
        </div>
        <CardioWorkoutPreview mode={targetMode} prescription={template.prescription} />
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
        <div className="template-view__start-bar">
          <button
            className="app-primary-action template-view__start-button"
            onClick={startTimer}
            type="button"
          >
            <Play size={18} /> Start Workout
          </button>
        </div>
      ) : (
        <>
          <div className="app-section-card cardio-workout-timer" aria-live="polite">
            <div className="cardio-workout-timer__display">
              <span>Workout timer</span>
              <strong>{formatWorkoutTimer(elapsedTimerSeconds)}</strong>
              <small>
                {timerStatus === "running"
                  ? "Running"
                  : timerStatus === "paused"
                    ? "Paused"
                    : "Stopped"}
              </small>
            </div>
            <div className="cardio-workout-timer__controls">
              {timerStatus === "running" && (
                <>
                  <button className="app-secondary-action" onClick={() => pauseOrStopTimer("paused")} type="button">
                    <Pause size={16} /> Pause
                  </button>
                  <button className="app-secondary-action" onClick={() => pauseOrStopTimer("stopped")} type="button">
                    <Square size={15} /> Stop
                  </button>
                </>
              )}
              {timerStatus === "paused" && (
                <>
                  <button className="app-primary-action" onClick={resumeTimer} type="button">
                    <Play size={16} /> Resume
                  </button>
                  <button className="app-secondary-action" onClick={() => pauseOrStopTimer("stopped")} type="button">
                    <Square size={15} /> Stop
                  </button>
                </>
              )}
              {timerStatus !== "running" && (
                <button className="app-secondary-action" onClick={restartTimer} type="button">
                  <RotateCcw size={16} /> Restart
                </button>
              )}
            </div>
          </div>
          <div className="app-section-card" style={{ display: "grid", gap: "14px" }}>
            <div>
              <h2 style={{ fontSize: "17px", margin: 0 }}>Completion details</h2>
              <p style={{ color: "var(--text-muted)", fontSize: "13px", margin: "4px 0 0" }}>
                These fields are optional reference data for this completed session.
              </p>
            </div>
            <div className="cardio-field-grid">
              <NumericField label="Manual duration override (minutes)" onChange={(value) => updateResult("durationMinutes", value)} value={results.durationMinutes} />
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
            onClick={() => onComplete(createCardioWorkoutLog(
              template,
              results,
              notes,
              startedAt,
              getElapsedTimerSeconds()
            ))}
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
