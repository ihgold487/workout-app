import { Flame, Hash, Weight, X } from "lucide-react";

function formatWeight(value) {
  if (!Number.isFinite(Number(value))) {
    return "—";
  }

  const numericValue = Number(value);
  return Number.isInteger(numericValue)
    ? String(numericValue)
    : numericValue.toFixed(1).replace(/\.0$/, "");
}

function formatPercent(value) {
  return Number.isFinite(Number(value))
    ? `${(Number(value) * 100).toFixed(1).replace(/\.0$/, "")}%`
    : "—";
}

export default function WarmupSetsSheet({
  exerciseName,
  onClose,
  recommendations,
  weightUnit = "lb",
}) {
  if (!recommendations) {
    return null;
  }

  return (
    <div
      aria-label={`Warmup sets for ${exerciseName}`}
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
        zIndex: 9999,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          background: "var(--surface-raised)",
          borderRadius: "18px 18px 0 0",
          boxSizing: "border-box",
          maxHeight: "82vh",
          maxWidth: "520px",
          overflowY: "auto",
          padding: "16px",
          paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
          width: "100%",
        }}
      >
        <div style={{ alignItems: "center", display: "flex", gap: "12px", justifyContent: "space-between", marginBottom: "12px" }}>
          <div style={{ minWidth: 0, textAlign: "left" }}>
            <div style={{ alignItems: "center", display: "flex", gap: "8px", fontWeight: "bold" }}>
              <Flame size={18} />
              <span>Warmup sets</span>
            </div>
            <div style={{ color: "var(--text-muted)", fontSize: "13px", marginTop: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {exerciseName}
            </div>
          </div>
          <button aria-label="Close warmup sets" onClick={onClose} style={{ alignItems: "center", display: "inline-flex", justifyContent: "center", minHeight: "44px", minWidth: "44px", padding: "4px" }} type="button">
            <X size={17} />
          </button>
        </div>

        <div style={{ background: "var(--surface-muted)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "13px", marginBottom: "12px", padding: "10px", textAlign: "left" }}>
          Based on suggested set 1:{" "}
          <strong>
            {formatWeight(recommendations.baseWeight)}{weightUnit} ×{" "}
            {recommendations.baseReps} @ {recommendations.targetRir}
          </strong>
          <span style={{ color: "var(--text-muted)" }}>
            {" "}(e1RM {formatWeight(recommendations.baseE1RM)}{weightUnit})
          </span>
        </div>

        <div style={{ display: "grid", gap: "12px" }}>
          {recommendations.options.map((option) => (
            <section key={option.label} style={{ border: "1px solid var(--border)", borderRadius: "8px", padding: "12px" }}>
              <div style={{ fontWeight: "bold", marginBottom: "12px", textAlign: "left" }}>{option.label}</div>
              <div style={{ display: "grid", gap: "8px" }}>
                <div style={{ alignItems: "center", color: "var(--text-muted)", display: "grid", fontSize: "12px", fontWeight: "bold", gap: "8px", gridTemplateColumns: "46px 1fr 44px 54px", textAlign: "center" }}>
                  <span style={{ textAlign: "left" }}>Set</span>
                  <Weight aria-label="Weight" size={15} style={{ justifySelf: "center" }} />
                  <Hash aria-label="Reps" size={15} style={{ justifySelf: "center" }} />
                  <span>%</span>
                </div>
                {option.sets.map((warmupSet, index) => (
                  <div key={`${option.label}-${warmupSet.reps}`} style={{ alignItems: "center", display: "grid", gap: "8px", gridTemplateColumns: "46px 1fr 44px 54px", textAlign: "center" }}>
                    <span style={{ color: "var(--text-muted)", fontSize: "13px", textAlign: "left" }}>Set {index + 1}</span>
                    <strong style={{ whiteSpace: "nowrap" }}>{formatWeight(warmupSet.target?.weight)}{weightUnit}</strong>
                    <span>{warmupSet.reps}</span>
                    <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>{formatPercent(warmupSet.target?.percent)}</span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
