import { hasExerciseModality } from "./exerciseModalities.js";

export const CARDIO_WORKOUT_FORMATS = {
  hiit: "hiit",
  steady: "steady",
};

export const CARDIO_PHASE_DEFAULT_COLORS = {
  cooldown: "#3f5f9b",
  recovery: "#ea7a17",
  warmup: "#ca8a04",
  work: "#2f8a6a",
};

export function getCardioPhaseColor(phase, color) {
  return optionalText(color) || CARDIO_PHASE_DEFAULT_COLORS[phase] || "#3f5f9b";
}

export function getCardioWorkoutFormatLabel(format) {
  return format === CARDIO_WORKOUT_FORMATS.hiit ? "HIIT" : "Steady state";
}

export function getCardioExercises(exerciseLibrary = []) {
  return exerciseLibrary.filter(
    (exercise) =>
      exercise?.active !== "inactive" &&
      hasExerciseModality(exercise, "cardio")
  );
}

export function getExerciseEquipmentLabel(exercise) {
  const equipment = Array.isArray(exercise?.equipment)
    ? exercise.equipment.filter(Boolean)
    : [exercise?.equipment].filter(Boolean);

  return equipment.join(", ");
}

export function createCardioExerciseSnapshot(exercise) {
  return {
    equipment: getExerciseEquipmentLabel(exercise),
    exerciseId: exercise?.id ?? null,
    name: exercise?.name || "Cardio exercise",
  };
}

function optionalNumber(value) {
  if (value === "" || value == null) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalPositiveNumber(value) {
  const parsed = optionalNumber(value);
  return parsed != null && parsed > 0 ? parsed : null;
}

function optionalNonNegativeNumber(value) {
  const parsed = optionalNumber(value);
  return parsed != null && parsed >= 0 ? parsed : null;
}

export function milesToMeters(value) {
  const miles = optionalPositiveNumber(value);
  return miles == null ? null : miles * 1609.344;
}

export function metersToMiles(value) {
  const meters = optionalPositiveNumber(value);
  return meters == null ? "" : (meters / 1609.344).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function mphToMetersPerSecond(value) {
  const mph = optionalPositiveNumber(value);
  return mph == null ? null : mph * 0.44704;
}

export function metersPerSecondToMph(value) {
  const metersPerSecond = optionalPositiveNumber(value);
  return metersPerSecond == null
    ? ""
    : (metersPerSecond / 0.44704).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function minutesToSeconds(value) {
  const minutes = optionalPositiveNumber(value);
  return minutes == null ? null : Math.round(minutes * 60);
}

export function secondsToMinutes(value) {
  const seconds = optionalPositiveNumber(value);
  return seconds == null ? "" : (seconds / 60).toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function optionalText(value) {
  const text = String(value || "").trim();
  return text || null;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item != null && item !== "")
  );
}

export function normalizeCardioPrescription({ format, values = {} }) {
  const phase = (name) => {
    const prefix = name;
    const speedValue = values[`${prefix}SpeedMph`] ??
      (name === "work" ? values.speedMph : undefined);
    const gradeValue = values[`${prefix}GradePercent`] ??
      (name === "work" ? values.gradePercent : undefined);
    const resistanceValue = values[`${prefix}Resistance`] ??
      (name === "work" ? values.resistance : undefined);
    const cadenceValue = values[`${prefix}CadenceRpm`];
    const powerValue = values[`${prefix}PowerWatts`];
    const durationValue = values[`${name}DurationSeconds`];

    return compactObject({
      cadenceRpm: optionalNonNegativeNumber(cadenceValue),
      color: optionalText(values[`${name}Color`]),
      durationSeconds: optionalPositiveNumber(durationValue),
      gradePercent: optionalNonNegativeNumber(gradeValue),
      label: optionalText(values[`${name}Label`]),
      powerWatts: optionalNonNegativeNumber(powerValue),
      resistance: optionalNonNegativeNumber(resistanceValue),
      speedMetersPerSecond: mphToMetersPerSecond(speedValue),
    });
  };

  const warmup = phase("warmup");
  const work = phase("work");
  const recovery = phase("recovery");
  const cooldown = phase("cooldown");
  const rounds = optionalPositiveNumber(values.rounds);

  // Existing templates stored a steady-state duration and targets at the
  // prescription root. New templates store every timed portion as a phase.
  // Keep accepting the older editor values so old saves remain valid.
  if (format === CARDIO_WORKOUT_FORMATS.steady) {
    const legacyDuration = minutesToSeconds(values.plannedDurationMinutes);
    if (work.durationSeconds == null && legacyDuration != null) {
      work.durationSeconds = legacyDuration;
    }
  }

  const normalizedRounds =
    format === CARDIO_WORKOUT_FORMATS.steady
      ? 1
      : rounds;
  const plannedDurationSeconds = calculateCardioWorkoutDuration({
    cooldown,
    format,
    recovery,
    rounds: normalizedRounds,
    warmup,
    work,
  });

  return compactObject({
    ...(Object.keys(warmup).length > 0 ? { warmup } : {}),
    ...(Object.keys(work).length > 0 ? { work } : {}),
    ...(Object.keys(recovery).length > 0 ? { recovery } : {}),
    ...(Object.keys(cooldown).length > 0 ? { cooldown } : {}),
    plannedDistanceMeters: milesToMeters(values.plannedDistanceMiles),
    plannedDurationSeconds,
    rounds: normalizedRounds,
  });
}

function phaseDuration(phase) {
  return optionalPositiveNumber(phase?.durationSeconds) || 0;
}

export function calculateCardioWorkoutDuration(prescription = {}) {
  const rounds = optionalPositiveNumber(prescription.rounds) || 0;
  const workDuration = phaseDuration(prescription.work) ||
    optionalPositiveNumber(prescription.workDurationSeconds) || 0;
  const recoveryDuration = phaseDuration(prescription.recovery) ||
    optionalPositiveNumber(prescription.recoveryDurationSeconds) || 0;
  const warmupDuration = phaseDuration(prescription.warmup) ||
    optionalPositiveNumber(prescription.warmupDurationSeconds) || 0;
  const cooldownDuration = phaseDuration(prescription.cooldown) ||
    optionalPositiveNumber(prescription.cooldownDurationSeconds) || 0;
  const legacySteadyDuration = optionalPositiveNumber(
    prescription.plannedDurationSeconds
  ) || 0;
  const effectiveRounds = rounds || (workDuration || legacySteadyDuration ? 1 : 0);
  const effectiveWorkDuration = workDuration ||
    (effectiveRounds === 1 ? legacySteadyDuration : 0);

  return warmupDuration +
    effectiveRounds * effectiveWorkDuration +
    effectiveRounds * recoveryDuration +
    cooldownDuration || null;
}

export function getCardioWorkoutPhases(prescription = {}) {
  const rounds = optionalPositiveNumber(prescription.rounds) || 0;
  const legacySteadyDuration = optionalPositiveNumber(
    prescription.plannedDurationSeconds
  ) || 0;
  const work = prescription.work || {};
  const recovery = prescription.recovery || {};
  const warmup = prescription.warmup || {};
  const cooldown = prescription.cooldown || {};
  const workDuration = phaseDuration(work) ||
    optionalPositiveNumber(prescription.workDurationSeconds) ||
    (rounds <= 1 ? legacySteadyDuration : 0);
  const recoveryDuration = phaseDuration(recovery) ||
    optionalPositiveNumber(prescription.recoveryDurationSeconds) || 0;
  const effectiveRounds = rounds || (workDuration ? 1 : 0);
  const phases = [];

  const addPhase = (kind, phase, durationSeconds, index = null) => {
    if (!durationSeconds) return;
    phases.push({
      color: getCardioPhaseColor(kind, phase?.color),
      durationSeconds,
      index,
      kind,
      label: optionalText(phase?.label) ||
        (kind === "warmup"
          ? "Warm-up"
          : kind === "cooldown"
            ? "Cool-down"
            : kind === "recovery"
              ? "Recovery"
              : "Working"),
      target: compactObject({
        cadenceRpm: phase?.cadenceRpm,
        gradePercent: phase?.gradePercent,
        powerWatts: phase?.powerWatts,
        resistance: phase?.resistance,
        speedMetersPerSecond: phase?.speedMetersPerSecond,
      }),
    });
  };

  addPhase("warmup", warmup, phaseDuration(warmup));
  for (let round = 0; round < effectiveRounds; round += 1) {
    addPhase("work", work, workDuration, round + 1);
    addPhase("recovery", recovery, recoveryDuration, round + 1);
  }
  addPhase("cooldown", cooldown, phaseDuration(cooldown));

  return phases;
}

export function normalizeCardioResults(values = {}) {
  return compactObject({
    averageSpeedMetersPerSecond: mphToMetersPerSecond(values.averageSpeedMph),
    caloriesKilocalories: optionalNonNegativeNumber(values.caloriesKilocalories),
    cadenceRpm: optionalNonNegativeNumber(values.cadenceRpm),
    distanceMeters: milesToMeters(values.distanceMiles),
    durationSeconds: minutesToSeconds(values.durationMinutes),
    gradePercent: optionalNonNegativeNumber(values.gradePercent),
    location: values.location || null,
    maxSpeedMetersPerSecond: mphToMetersPerSecond(values.maxSpeedMph),
    powerWatts: optionalNonNegativeNumber(values.powerWatts),
    resistance: optionalNonNegativeNumber(values.resistance),
  });
}

export function getDefaultCardioWorkoutName(exercise, format) {
  return `${exercise?.name || "Cardio"} ${getCardioWorkoutFormatLabel(format)}`;
}

export function createCardioWorkoutLog(template, results, notes, startedAt) {
  const completedAt = new Date().toISOString();

  return {
    completedAt,
    exercise: { ...template.exercise },
    format: template.format,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    notes: String(notes || "").trim(),
    prescription: structuredClone(template.prescription || {}),
    results: normalizeCardioResults(results),
    startedAt: startedAt || null,
    templateId: template.id,
    templateName: template.name,
  };
}

export function formatCardioDuration(seconds) {
  const duration = optionalPositiveNumber(seconds);
  if (duration == null) return null;

  const totalSeconds = Math.round(duration);
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;

  return minutes > 0
    ? `${minutes}m${remainder ? ` ${remainder}s` : ""}`
    : `${remainder}s`;
}

export function getCardioWorkoutSummary(workout) {
  const prescription = workout?.prescription || {};
  const duration = formatCardioDuration(
    calculateCardioWorkoutDuration(prescription)
  );
  const phases = getCardioWorkoutPhases(prescription);
  const work = phases.find((phase) => phase.kind === "work");
  const recovery = phases.find((phase) => phase.kind === "recovery");
  const roundCount = prescription.rounds || (work ? 1 : null);
  const structure = [
    roundCount && work
      ? `${roundCount} × ${formatCardioDuration(work.durationSeconds)} ${work.label.toLowerCase()}`
      : null,
    recovery ? `${formatCardioDuration(recovery.durationSeconds)} ${recovery.label.toLowerCase()}` : null,
  ].filter(Boolean);

  return [duration ? `${duration} total` : null, ...structure].join(" · ") ||
    "Add phase times to see the workout structure";
}
