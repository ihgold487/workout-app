import { hasExerciseModality } from "./exerciseModalities.js";

export const CARDIO_WORKOUT_FORMATS = {
  hiit: "hiit",
  steady: "steady",
};

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

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item != null && item !== "")
  );
}

export function normalizeCardioPrescription({ format, values = {} }) {
  const shared = {
    plannedDistanceMeters: milesToMeters(values.plannedDistanceMiles),
    plannedDurationSeconds: minutesToSeconds(values.plannedDurationMinutes),
  };

  if (format === CARDIO_WORKOUT_FORMATS.hiit) {
    const recovery = compactObject({
      gradePercent: optionalNonNegativeNumber(values.recoveryGradePercent),
      resistance: optionalNonNegativeNumber(values.recoveryResistance),
      speedMetersPerSecond: mphToMetersPerSecond(values.recoverySpeedMph),
    });
    const work = compactObject({
      gradePercent: optionalNonNegativeNumber(values.workGradePercent),
      resistance: optionalNonNegativeNumber(values.workResistance),
      speedMetersPerSecond: mphToMetersPerSecond(values.workSpeedMph),
    });

    return compactObject({
      ...shared,
      ...(Object.keys(recovery).length > 0 ? { recovery } : {}),
      rounds: optionalPositiveNumber(values.rounds),
      ...(Object.keys(work).length > 0 ? { work } : {}),
      workDurationSeconds: optionalPositiveNumber(values.workDurationSeconds),
      recoveryDurationSeconds: optionalPositiveNumber(
        values.recoveryDurationSeconds
      ),
    });
  }

  return compactObject({
    ...shared,
    gradePercent: optionalNonNegativeNumber(values.gradePercent),
    resistance: optionalNonNegativeNumber(values.resistance),
    speedMetersPerSecond: mphToMetersPerSecond(values.speedMph),
  });
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
  const duration = formatCardioDuration(prescription.plannedDurationSeconds);

  if (workout?.format === CARDIO_WORKOUT_FORMATS.hiit) {
    const roundDetails = [
      prescription.rounds ? `${prescription.rounds} rounds` : null,
      prescription.workDurationSeconds
        ? `${formatCardioDuration(prescription.workDurationSeconds)} work`
        : null,
      prescription.recoveryDurationSeconds
        ? `${formatCardioDuration(prescription.recoveryDurationSeconds)} recovery`
        : null,
    ].filter(Boolean);

    return roundDetails.join(" · ") || "Interval details optional";
  }

  return duration ? `${duration} planned` : "Details optional";
}
