export const BENCHMARK_ZONE_BOUNDS = {
  heavy: { max: 7, min: 3 },
  moderate: { max: 12, min: 8 },
};

export function parsePrescribedRepRange(value) {
  const values = String(value ?? "")
    .match(/\d+(?:\.\d+)?/g)
    ?.map(Number)
    .filter(Number.isFinite);

  if (!values?.length) return null;

  return {
    label: String(value).trim(),
    max: Math.max(...values),
    min: Math.min(...values),
  };
}

export function getPrescriptionZone(prescription) {
  if (!prescription) return null;

  return Object.entries(BENCHMARK_ZONE_BOUNDS).find(
    ([, bounds]) =>
      prescription.min >= bounds.min && prescription.max <= bounds.max
  )?.[0] || null;
}

export function setMeetsBenchmarkZone(set) {
  const bounds = BENCHMARK_ZONE_BOUNDS[set?.prescriptionZone];

  return (
    Boolean(bounds) &&
    Number.isFinite(set?.reps) &&
    set.reps >= bounds.min &&
    set.reps <= bounds.max
  );
}
