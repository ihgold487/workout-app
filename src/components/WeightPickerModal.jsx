import { useState, useRef, useEffect, useMemo } from "react";

export default function WeightPickerModal({
  isOpen,
  onClose,
  value,
  onSelect,
  weightUnit,
  increment,
  title,
  values,
}) {
  const current = Number(value) || 0;

  const step = increment ?? (weightUnit === "kg" ? 1 : 2.5);

  const [manualValue, setManualValue] = useState(String(current));
  const scrollRef = useRef(null);

  const options = useMemo(() => {
    if (values) {
      return values;
    }

    const generatedOptions = [];

    for (
      let value = current - 20 * step;
      value <= current + 20 * step;
      value += step
    ) {
      generatedOptions.push(Number(value.toFixed(2)));
    }

    return generatedOptions;
  }, [current, step, values]);

  useEffect(() => {
    if (!isOpen || !scrollRef.current) {
      return;
    }

    setTimeout(() => {
      const selectedIndex = options.findIndex(
        (option) => option === Number(manualValue),
      );

      if (selectedIndex < 0) {
        return;
      }

      const selectedButton = scrollRef.current.children[selectedIndex];

      selectedButton?.scrollIntoView({
        block: "center",
      });
    }, 0);
  }, [isOpen, manualValue, options]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          padding: "16px",
          borderRadius: "8px",
          minWidth: "220px",
        }}
      >
        <div
          style={{
            fontWeight: "bold",
            marginBottom: "12px",
          }}
        >
          {title || "Select Value"}
        </div>

        <div
          style={{
            textAlign: "center",
            fontSize: "12px",
            color: "#666",
            marginBottom: "8px",
          }}
        >
          Scroll or tap a value
        </div>

        <div
          ref={scrollRef}
          style={{
            maxHeight: "320px",
            overflowY: "auto",
            border: "1px solid #ddd",
            padding: "4px",
          }}
        >
          {options.map((option) => (
            <button
              key={option}
              onClick={() => {
                setManualValue(String(option));
              }}
              style={{
                display: "block",

                width: "100%",

                padding: "6px",

                border: "none",

                background: "transparent",

                fontWeight: Number(manualValue) === option ? "bold" : "normal",

                fontSize: Number(manualValue) === option ? "24px" : "16px",

                opacity: Number(manualValue) === option ? 1 : 0.6,
              }}
            >
              {option}
            </button>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "12px",
          }}
        >
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              fontSize: "28px",
            }}
          >
            ❌
          </button>

          <input
            inputMode="decimal"
            value={manualValue}
            onChange={(e) => setManualValue(e.target.value)}
            style={{
              width: "90px",
              textAlign: "center",
              fontSize: "22px",
              fontWeight: "bold",
            }}
          />

          <button
            onClick={() => {
              const weight = Number(manualValue);

              if (!isNaN(weight)) {
                onSelect(weight);
              }

              onClose();
            }}
            style={{
              border: "none",
              background: "transparent",
              fontSize: "28px",
            }}
          >
            ✅
          </button>
        </div>
      </div>
    </div>
  );
}
