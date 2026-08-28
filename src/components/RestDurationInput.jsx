import { useEffect, useRef, useState } from "react";
import {
  formatRestDurationClock,
  getRestDurationEntryDigits,
  parseRestDurationEntryDigits,
} from "../utils/restDurationPicker";

export default function RestDurationInput({ onChange, value }) {
  const [digits, setDigits] = useState(() => getRestDurationEntryDigits(value));
  const [focused, setFocused] = useState(false);
  const inputRef = useRef(null);
  const parsedSeconds = parseRestDurationEntryDigits(digits);
  const valid = parsedSeconds != null;
  const displayValue = valid
    ? formatRestDurationClock(parsedSeconds).replace(":", " : ")
    : "— : ——";

  useEffect(() => {
    if (!focused) {
      const timeoutId = window.setTimeout(
        () => setDigits(getRestDurationEntryDigits(value)),
        0
      );

      return () => window.clearTimeout(timeoutId);
    }

    return undefined;
  }, [focused, value]);

  return (
    <div style={{ display: "grid", gap: "4px", justifyItems: "center" }}>
      <div
        onClick={() => inputRef.current?.focus()}
        style={{
          background: focused ? "var(--surface-muted)" : "transparent",
          borderRadius: "4px",
          position: "relative",
          width: "104px",
        }}
      >
        <input
          ref={inputRef}
          aria-label="Enter rest time as minutes and seconds"
          aria-valuetext={
            valid ? formatRestDurationClock(parsedSeconds) : "Invalid rest time"
          }
          inputMode="numeric"
          maxLength={4}
          onBlur={() => setFocused(false)}
          onChange={(event) => {
            const nextDigits = event.target.value.replace(/\D/g, "").slice(-4);
            const nextSeconds = parseRestDurationEntryDigits(nextDigits);

            if (nextSeconds == null) {
              return;
            }

            setDigits(nextDigits);
            onChange(nextSeconds);
          }}
          onFocus={(event) => {
            setFocused(true);
            setDigits("");
            event.currentTarget.setSelectionRange(0, 0);
          }}
          pattern="[0-9]*"
          value={digits}
          style={{
            background: "transparent",
            border: "none",
            boxSizing: "border-box",
            color: "transparent",
            caretColor: "transparent",
            fontSize: "22px",
            fontWeight: "bold",
            inset: 0,
            position: "absolute",
            textAlign: "center",
            width: "100%",
            WebkitTapHighlightColor: "transparent",
            zIndex: 1,
          }}
        />
        <div
          aria-hidden="true"
          style={{
            alignItems: "center",
            border: `1px solid ${valid ? "var(--border)" : "var(--danger-text)"}`,
            borderRadius: "4px",
            display: "flex",
            fontSize: "22px",
            fontWeight: "bold",
            justifyContent: "center",
            minHeight: "38px",
            pointerEvents: "none",
            position: "relative",
            zIndex: 2,
          }}
        >
          {displayValue}
        </div>
      </div>
      <div
        style={{ color: "var(--text-muted)", fontSize: "11px", textAlign: "center" }}
      >
        Enter MMSS · 2:30 = 230
      </div>
    </div>
  );
}
