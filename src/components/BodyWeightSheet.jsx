import { useMemo, useState } from "react";
import { Plus, Scale, Trash2, X } from "lucide-react";
import WeightPickerModal from "./WeightPickerModal";

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function parseWeight(value) {
  const parsed = Number.parseFloat(String(value).trim());

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function daysBetween(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);

  return Math.round((end - start) / 86400000);
}

function WeightChart({ entries }) {
  const points = useMemo(
    () =>
      [...entries]
        .filter((entry) => entry.date && parseWeight(entry.weight))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [entries]
  );

  if (points.length === 0) {
    return (
      <div
        style={{
          alignItems: "center",
          background: "var(--surface-muted)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          color: "var(--text-muted)",
          display: "flex",
          minHeight: "150px",
          justifyContent: "center",
          padding: "12px",
        }}
      >
        No weight history yet
      </div>
    );
  }

  const width = 360;
  const height = 170;
  const padding = 28;
  const firstDate = points[0].date;
  const lastDate = points[points.length - 1].date;
  const dateSpan = Math.max(1, daysBetween(firstDate, lastDate));
  const weights = points.map((entry) => parseWeight(entry.weight));
  const minWeight = Math.min(...weights);
  const maxWeight = Math.max(...weights);
  const weightSpan = Math.max(1, maxWeight - minWeight);
  const plotted = points.map((entry) => {
    const weight = parseWeight(entry.weight);
    const x =
      points.length === 1
        ? width / 2
        : padding + (daysBetween(firstDate, entry.date) / dateSpan) * (width - padding * 2);
    const y =
      height -
      padding -
      ((weight - minWeight) / weightSpan) * (height - padding * 2);

    return {
      ...entry,
      weight,
      x,
      y,
    };
  });

  return (
    <div
      style={{
        background: "var(--surface-muted)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "8px",
      }}
    >
      <svg
        aria-label="Body weight chart"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
        style={{
          display: "block",
          height: "180px",
          width: "100%",
        }}
      >
        <line
          x1={padding}
          x2={width - padding}
          y1={height - padding}
          y2={height - padding}
          stroke="var(--border)"
        />
        <line
          x1={padding}
          x2={padding}
          y1={padding}
          y2={height - padding}
          stroke="var(--border)"
        />
        {plotted.slice(1).map((point, index) => {
          const previous = plotted[index];
          const skippedDays = daysBetween(previous.date, point.date) > 1;

          return (
            <line
              key={`${previous.date}-${point.date}`}
              x1={previous.x}
              x2={point.x}
              y1={previous.y}
              y2={point.y}
              stroke="#ef6c00"
              strokeDasharray={skippedDays ? "5 5" : undefined}
              strokeLinecap="round"
              strokeWidth="2.5"
            />
          );
        })}
        {plotted.map((point) => (
          <g key={point.date}>
            <circle cx={point.x} cy={point.y} fill="#ef6c00" r="4.5" />
            <text
              x={point.x}
              y={point.y - 8}
              fill="var(--text-h)"
              fontSize="10"
              textAnchor="middle"
            >
              {point.weight}
            </text>
          </g>
        ))}
        <text x={padding} y={height - 7} fill="var(--text-muted)" fontSize="10">
          {firstDate}
        </text>
        <text
          x={width - padding}
          y={height - 7}
          fill="var(--text-muted)"
          fontSize="10"
          textAnchor="end"
        >
          {lastDate}
        </text>
      </svg>
    </div>
  );
}

export default function BodyWeightSheet({
  entries,
  entryDate = getTodayKey(),
  initialAdding = false,
  onClose,
  onDelete,
  onSave,
}) {
  const [adding, setAdding] = useState(initialAdding);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => b.date.localeCompare(a.date)),
    [entries]
  );
  const latestEntry = sortedEntries[0] || null;
  const latestWeight = latestEntry ? parseWeight(latestEntry.weight) : null;
  const parsedDraft = parseWeight(draft);

  function saveEntry() {
    if (!parsedDraft) {
      return;
    }

    onSave(entryDate, parsedDraft);
    setDraft("");
    setAdding(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Body weight details"
      onClick={onClose}
      style={{
        alignItems: "flex-end",
        background: "rgba(0,0,0,.45)",
        display: "flex",
        inset: 0,
        justifyContent: "center",
        position: "fixed",
        zIndex: 2200,
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          background: "var(--surface-raised)",
          borderRadius: "18px 18px 0 0",
          boxShadow: "0 -8px 28px rgba(0,0,0,.22)",
          boxSizing: "border-box",
          display: "grid",
          gap: "14px",
          maxHeight: "86vh",
          maxWidth: "620px",
          overflowY: "auto",
          padding: "16px 16px calc(16px + env(safe-area-inset-bottom))",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <h2
            style={{
              alignItems: "center",
              display: "flex",
              fontSize: "18px",
              gap: "8px",
              lineHeight: 1.15,
              margin: 0,
            }}
          >
            <Scale size={18} color="#ef6c00" />
            Body weight
          </h2>
          <button
            aria-label="Close body weight details"
            onClick={onClose}
            style={{
              alignItems: "center",
              display: "inline-flex",
              justifyContent: "center",
              minHeight: "36px",
              minWidth: "36px",
              padding: 0,
            }}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <WeightChart entries={entries} />

        <button
          onClick={() => {
            if (latestWeight) {
              setPickerOpen(true);
              setAdding(false);
              return;
            }

            setAdding((current) => !current);
          }}
          style={{
            alignItems: "center",
            display: "inline-flex",
            gap: "6px",
            justifyContent: "center",
            minHeight: "42px",
          }}
          type="button"
        >
          <Plus size={17} />
          Add entry
        </button>

        {adding && (
          <div
            style={{
              alignItems: "end",
              display: "grid",
              gap: "8px",
              gridTemplateColumns: "minmax(0, 1fr) auto",
            }}
          >
            <label
              style={{
                display: "grid",
                gap: "5px",
                minWidth: 0,
              }}
            >
              {entryDate}
              <input
                aria-label="Body weight"
                inputMode="decimal"
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Weight"
                style={{
                  boxSizing: "border-box",
                  font: "inherit",
                  minHeight: "42px",
                  minWidth: 0,
                  padding: "7px 10px",
                  width: "100%",
                }}
                value={draft}
              />
            </label>
            <button
              disabled={!parsedDraft}
              onClick={saveEntry}
              style={{
                minHeight: "42px",
                padding: "7px 12px",
              }}
              type="button"
            >
              Save
            </button>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gap: "8px",
          }}
        >
          {sortedEntries.length > 0 ? (
            sortedEntries.map((entry) => (
              <div
                key={entry.id || entry.date}
                style={{
                  alignItems: "center",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  color: "var(--text-muted)",
                  display: "grid",
                  fontSize: "13px",
                  gap: "8px",
                  gridTemplateColumns: "minmax(0, 1fr) auto auto",
                  padding: "8px",
                }}
              >
                <span>{entry.date}</span>
                <strong style={{ color: "var(--text-h)" }}>
                  {entry.weight} {entry.unit || "lb"}
                </strong>
                <button
                  aria-label={`Remove body weight for ${entry.date}`}
                  onClick={() => onDelete(entry.date)}
                  style={{
                    alignItems: "center",
                    display: "inline-flex",
                    justifyContent: "center",
                    minHeight: "30px",
                    minWidth: "34px",
                    padding: "3px 6px",
                  }}
                  type="button"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))
          ) : (
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "13px",
                textAlign: "center",
              }}
            >
              No entries yet
            </div>
          )}
        </div>
      </div>
      <WeightPickerModal
        increment={0.1}
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(value) => onSave(entryDate, value)}
        range={50}
        title="Select body weight"
        value={latestWeight || ""}
      />
    </div>
  );
}
