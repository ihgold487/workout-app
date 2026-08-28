import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { triggerNativePickerSelectionHaptic } from "../native/pickerHaptics";
import RestDurationInput from "./RestDurationInput";

function WeightPickerModalContent({
  current,
  onClose,
  onSelect,
  optionLabel,
  options,
  restDurationInput = false,
  title,
  zIndex = 1000,
}) {
  const [manualValue, setManualValue] = useState(String(current));
  const scrollRef = useRef(null);
  const isUserScrollingRef = useRef(false);
  const hapticIndexRef = useRef(null);

  function handlePickerScroll() {
    const scroller = scrollRef.current;

    if (!scroller || !isUserScrollingRef.current || !scroller.children.length) {
      return;
    }

    const scrollerRect = scroller.getBoundingClientRect();
    const selectionY = scrollerRect.top + scrollerRect.height / 2;
    let closestIndex = 0;
    let closestDistance = Number.POSITIVE_INFINITY;

    Array.from(scroller.children).forEach((child, index) => {
      const childRect = child.getBoundingClientRect();
      const childCenter = childRect.top + childRect.height / 2;
      const distance = Math.abs(childCenter - selectionY);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestIndex = index;
      }
    });

    if (hapticIndexRef.current !== closestIndex) {
      hapticIndexRef.current = closestIndex;
      void triggerNativePickerSelectionHaptic();
    }
  }

  useEffect(() => {
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const previousBodyStyles = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    };

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    return () => {
      document.body.style.overflow = previousBodyStyles.overflow;
      document.body.style.position = previousBodyStyles.position;
      document.body.style.top = previousBodyStyles.top;
      document.body.style.width = previousBodyStyles.width;
      window.scrollTo(0, scrollY);
    };
  }, []);

  useEffect(() => {
    if (!scrollRef.current) {
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
  }, [manualValue, options]);

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
        padding: "12px",
        boxSizing: "border-box",
        overscrollBehavior: "contain",
        touchAction: "none",
        zIndex,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface-raised)",
          color: "var(--text)",
          padding: "16px",
          borderRadius: "8px",
          boxSizing: "border-box",
          display: "grid",
          gap: "10px",
          gridTemplateRows: "auto auto auto minmax(0, 1fr)",
          maxHeight:
            "min(560px, calc(100dvh - 24px - env(safe-area-inset-bottom)))",
          minWidth: "220px",
          width: "min(100%, 300px)",
        }}
      >
        <div
          style={{
            fontWeight: "bold",
            lineHeight: 1.2,
          }}
        >
          {title || "Select Value"}
        </div>

        <div
          style={{
            textAlign: "center",
            fontSize: "12px",
            color: "var(--text-muted)",
            lineHeight: 1.2,
          }}
        >
          Scroll or tap a value
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            minHeight: "38px",
          }}
        >
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              fontSize: "28px",
              lineHeight: 1,
            }}
          >
            ❌
          </button>

          {restDurationInput ? (
            <RestDurationInput
              value={manualValue}
              onChange={(value) => setManualValue(String(value))}
            />
          ) : (
            <input
              inputMode="decimal"
              min="0"
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              style={{
                width: "90px",
                textAlign: "center",
                fontSize: "22px",
                fontWeight: "bold",
                lineHeight: 1.2,
              }}
            />
          )}

          <button
            onClick={() => {
              const weight = Math.max(0, Number(manualValue));

              if (!isNaN(weight)) {
                onSelect(weight);
              }

              onClose();
            }}
            style={{
              border: "none",
              background: "transparent",
              fontSize: "28px",
              lineHeight: 1,
            }}
          >
            ✅
          </button>
        </div>

        <div
          ref={scrollRef}
          onPointerDown={() => {
            isUserScrollingRef.current = true;
          }}
          onScroll={handlePickerScroll}
          onWheel={() => {
            isUserScrollingRef.current = true;
          }}
          style={{
            minHeight: 0,
            overflowY: "auto",
            overscrollBehavior: "contain",
            border: "1px solid var(--border)",
            padding: "4px",
            touchAction: "pan-y",
            WebkitOverflowScrolling: "touch",
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
              {optionLabel ? optionLabel(option) : option}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function WeightPickerModal({
  isOpen,
  onClose,
  value,
  onSelect,
  optionLabel,
  weightUnit,
  increment,
  range,
  restDurationInput = false,
  title,
  values,
  zIndex,
}) {
  const current = Number(value) || 0;
  const step = increment ?? (weightUnit === "kg" ? 1 : 2.5);
  const options = useMemo(() => {
    if (values) {
      return values;
    }

    const generatedOptions = [];
    const spread = range ?? 20 * step;
    const start = Math.max(0, current - spread);

    for (let value = start; value <= current + spread; value += step) {
      generatedOptions.push(Number(value.toFixed(2)));
    }

    return generatedOptions;
  }, [current, range, step, values]);

  if (!isOpen) {
    return null;
  }

  const modal = (
    <WeightPickerModalContent
      key={`${title || "value"}-${current}`}
      current={current}
      onClose={onClose}
      onSelect={onSelect}
      optionLabel={optionLabel}
      options={options}
      restDurationInput={restDurationInput}
      title={title}
      zIndex={zIndex}
    />
  );

  return typeof document === "undefined"
    ? modal
    : createPortal(modal, document.body);
}
