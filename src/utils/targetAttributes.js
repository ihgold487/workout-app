export const MIN_REP_DEVIATION_VALUES = [-3, -2, -1, 0];
export const MAX_REP_DEVIATION_VALUES = [0, 1, 2, 3];
export const PROGRESSION_PERCENT_VALUES = [0, 0.5, 1, 1.5, 2, 2.5, 3];

export const DEFAULT_TARGET_ATTRIBUTES = Object.freeze({
  minRepDeviation: 0,
  maxRepDeviation: 1,
  progressionPercent: 0.005,
  maxProgressionPercent: 0.01,
});

export function getTargetAttributeDefaults(value) {
  const attributes = value && typeof value === "object" ? value : {};
  const numberOrDefault = (candidate, fallback) => {
    const parsed = Number(candidate);

    return Number.isFinite(parsed) ? parsed : fallback;
  };

  return {
    minRepDeviation: Math.min(
      0,
      numberOrDefault(
        attributes.minRepDeviation,
        DEFAULT_TARGET_ATTRIBUTES.minRepDeviation
      )
    ),
    maxRepDeviation: Math.max(
      0,
      numberOrDefault(
        attributes.maxRepDeviation,
        DEFAULT_TARGET_ATTRIBUTES.maxRepDeviation
      )
    ),
    progressionPercent: Math.max(
      0,
      numberOrDefault(
        attributes.progressionPercent,
        DEFAULT_TARGET_ATTRIBUTES.progressionPercent
      )
    ),
    maxProgressionPercent: Math.max(
      0,
      numberOrDefault(
        attributes.maxProgressionPercent,
        DEFAULT_TARGET_ATTRIBUTES.maxProgressionPercent
      )
    ),
  };
}
