export const REST_DURATION_PICKER_VALUES = Array.from(
  { length: 20 },
  (_, index) => (index + 1) * 15
);

export function formatRestDurationClock(seconds) {
  const numericSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(numericSeconds / 60);
  const remainder = numericSeconds % 60;

  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function getRestDurationEntryDigits(seconds) {
  const numericSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(numericSeconds / 60);
  const remainder = numericSeconds % 60;

  return `${minutes}${String(remainder).padStart(2, "0")}`.replace(/^0+(?=\d)/, "");
}

export function parseRestDurationEntryDigits(value) {
  const digits = String(value ?? "").replace(/\D/g, "").slice(-4);

  if (!digits) {
    return 0;
  }

  const secondsDigits = digits.slice(-2);
  const minutesDigits = digits.slice(0, -2);
  const seconds = Number(secondsDigits);

  if (seconds >= 60) {
    return null;
  }

  return Number(minutesDigits || 0) * 60 + seconds;
}
