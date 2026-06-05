export function calculateE1RM(
  actualWeight,
  actualReps,
  actualRir,
  targetWeight,
  targetReps,
  targetRir
) {
  const w = parseFloat(actualWeight || targetWeight);

  const r = parseFloat(actualReps || targetReps);

  const reserve = parseFloat(actualRir || targetRir || 0);

  if (isNaN(w) || isNaN(r)) {
    return null;
  }

  return w * (1 + (r + reserve) / 30);
}
