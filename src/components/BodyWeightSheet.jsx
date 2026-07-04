import { useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  Plus,
  Scale,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import WeightPickerModal from "./WeightPickerModal";

const RANGE_OPTIONS = [
  { label: "1 week", value: 7 },
  { label: "1 month", value: 30 },
  { label: "3 months", value: 90 },
  { label: "6 months", value: 183 },
  { label: "9 months", value: 274 },
  { label: "1 year", value: 365 },
  { label: "All", value: null },
];

const TREND_OPTIONS = [
  { label: "None", value: null },
  { label: "1 week", value: 7 },
  { label: "2 weeks", value: 14 },
  { label: "1 month", value: 30 },
];
const CHART_SETTINGS_STORAGE_KEY = "bodyWeightChartSettings";

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

function getOptionLabel(options, value) {
  return options.find((option) => option.value === value)?.label || "";
}

function isValidOptionValue(options, value) {
  return options.some((option) => option.value === value);
}

function getStoredChartSettings() {
  if (typeof window === "undefined") {
    return {
      rangeDays: null,
      trendDays: null,
    };
  }

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(CHART_SETTINGS_STORAGE_KEY) || "{}"
    );
    const rangeDays = isValidOptionValue(RANGE_OPTIONS, parsed.rangeDays)
      ? parsed.rangeDays
      : null;
    const trendDays = isValidOptionValue(TREND_OPTIONS, parsed.trendDays)
      ? parsed.trendDays
      : null;

    return {
      rangeDays,
      trendDays,
    };
  } catch {
    return {
      rangeDays: null,
      trendDays: null,
    };
  }
}

function saveStoredChartSettings(settings) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      CHART_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings)
    );
  } catch (error) {
    console.warn("Failed to save body weight chart settings:", error);
  }
}

function filterPointsByRange(points, rangeDays) {
  if (!rangeDays || points.length === 0) {
    return points;
  }

  const lastDate = points[points.length - 1].date;
  const filtered = points.filter(
    (point) => daysBetween(point.date, lastDate) <= rangeDays
  );

  return filtered.length > 0 ? filtered : [points[points.length - 1]];
}

function buildTrendPoints(points, trendDays) {
  if (!trendDays || points.length === 0) {
    return [];
  }

  return points.map((point) => {
    const windowPoints = points.filter(
      (candidate) =>
        candidate.date <= point.date &&
        daysBetween(candidate.date, point.date) <= trendDays
    );
    const averageWeight =
      windowPoints.reduce((total, candidate) => total + candidate.weight, 0) /
      Math.max(1, windowPoints.length);

    return {
      ...point,
      weight: averageWeight,
    };
  });
}

function SelectionSheet({ onClose, onSelect, options, selectedValue, title }) {
  return (
    <div
      aria-label={title}
      aria-modal="true"
      onClick={onClose}
      role="dialog"
      style={{
        alignItems: "flex-end",
        background: "rgba(0,0,0,.35)",
        display: "flex",
        inset: 0,
        justifyContent: "center",
        position: "fixed",
        zIndex: 2350,
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
          gap: "10px",
          maxWidth: "620px",
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
          <h3
            style={{
              fontSize: "17px",
              margin: 0,
            }}
          >
            {title}
          </h3>
          <button
            aria-label={`Close ${title}`}
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
        <div
          style={{
            display: "grid",
            gap: "8px",
          }}
        >
          {options.map((option) => {
            const selected = option.value === selectedValue;

            return (
              <button
                key={option.label}
                onClick={() => {
                  onSelect(option.value);
                  onClose();
                }}
                style={{
                  alignItems: "center",
                  background: selected ? "var(--surface-muted)" : undefined,
                  borderColor: selected ? "#ef6c00" : undefined,
                  display: "flex",
                  fontWeight: selected ? 700 : 500,
                  justifyContent: "space-between",
                  minHeight: "46px",
                  padding: "8px 12px",
                  textAlign: "left",
                }}
                type="button"
              >
                <span>{option.label}</span>
                {selected && <Check size={17} color="#ef6c00" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WeightChart({ entries, rangeDays, trendDays }) {
  const [selectedPointDate, setSelectedPointDate] = useState(null);
  const allPoints = useMemo(
    () =>
      [...entries]
        .map((entry) => ({
          ...entry,
          weight: parseWeight(entry.weight),
        }))
        .filter((entry) => entry.date && entry.weight)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [entries]
  );
  const points = useMemo(
    () => filterPointsByRange(allPoints, rangeDays),
    [allPoints, rangeDays]
  );
  const trendPoints = useMemo(
    () => buildTrendPoints(points, trendDays),
    [points, trendDays]
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
  const height = 360;
  const paddingLeft = 42;
  const paddingRight = 16;
  const paddingTop = 22;
  const paddingBottom = 34;
  const firstDate = points[0].date;
  const lastDate = points[points.length - 1].date;
  const middleDate = points[Math.floor((points.length - 1) / 2)]?.date || firstDate;
  const dateSpan = Math.max(1, daysBetween(firstDate, lastDate));
  const weights = points.map((entry) => entry.weight);
  const minWeight = Math.min(...weights);
  const maxWeight = Math.max(...weights);
  const weightSpan = Math.max(1, maxWeight - minWeight);
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;
  const plotted = points.map((entry) => {
    const x =
      points.length === 1
        ? width / 2
        : paddingLeft + (daysBetween(firstDate, entry.date) / dateSpan) * plotWidth;
    const y =
      height -
      paddingBottom -
      ((entry.weight - minWeight) / weightSpan) * plotHeight;

    return {
      ...entry,
      x,
      y,
    };
  });
  const trendPlotted = trendPoints.map((entry) => {
    const x =
      points.length === 1
        ? width / 2
        : paddingLeft + (daysBetween(firstDate, entry.date) / dateSpan) * plotWidth;
    const y =
      height -
      paddingBottom -
      ((entry.weight - minWeight) / weightSpan) * plotHeight;

    return {
      ...entry,
      x,
      y,
    };
  });
  const selectedPoint =
    plotted.find((point) => point.date === selectedPointDate) || null;
  const selectedLabelX = selectedPoint
    ? Math.min(width - 52, Math.max(paddingLeft + 52, selectedPoint.x))
    : 0;
  const selectedLabelY = selectedPoint
    ? Math.max(paddingTop + 18, selectedPoint.y - 18)
    : 0;

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
        onClick={() => setSelectedPointDate(null)}
        style={{
          aspectRatio: "1 / 1",
          display: "block",
          width: "100%",
        }}
      >
        <rect
          x="0"
          y="0"
          width={width}
          height={height}
          fill="transparent"
        />
        <line
          x1={paddingLeft}
          x2={width - paddingRight}
          y1={height - paddingBottom}
          y2={height - paddingBottom}
          stroke="var(--border)"
        />
        <line
          x1={paddingLeft}
          x2={paddingLeft}
          y1={paddingTop}
          y2={height - paddingBottom}
          stroke="var(--border)"
        />
        <text
          x={paddingLeft - 8}
          y={paddingTop + 4}
          fill="var(--text-muted)"
          fontSize="10"
          textAnchor="end"
        >
          {maxWeight.toFixed(1)}
        </text>
        <text
          x={paddingLeft - 8}
          y={height - paddingBottom + 4}
          fill="var(--text-muted)"
          fontSize="10"
          textAnchor="end"
        >
          {minWeight.toFixed(1)}
        </text>
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
              stroke={trendDays ? "color-mix(in srgb, #ef6c00 30%, var(--border))" : "#ef6c00"}
              strokeDasharray={skippedDays ? "5 5" : undefined}
              strokeLinecap="round"
              strokeWidth={trendDays ? "2" : "2.5"}
            />
          );
        })}
        {trendDays &&
          trendPlotted.slice(1).map((point, index) => {
            const previous = trendPlotted[index];
            const skippedDays = daysBetween(previous.date, point.date) > 1;

            return (
              <line
                key={`trend-${previous.date}-${point.date}`}
                x1={previous.x}
                x2={point.x}
                y1={previous.y}
                y2={point.y}
                stroke="#ef6c00"
                strokeDasharray={skippedDays ? "5 5" : undefined}
                strokeLinecap="round"
                strokeWidth="3.5"
              />
            );
          })}
        {plotted.map((point) => (
          <circle
            key={point.date}
            aria-label={`${point.date}: ${point.weight} lb`}
            cx={point.x}
            cy={point.y}
            fill="transparent"
            onClick={(event) => {
              event.stopPropagation();
              setSelectedPointDate(point.date);
            }}
            r="9"
            role="button"
            style={{
              cursor: "pointer",
            }}
          />
        ))}
        {selectedPoint && (
          <g pointerEvents="none">
            <line
              x1={selectedPoint.x}
              x2={selectedPoint.x}
              y1={paddingTop}
              y2={height - paddingBottom}
              stroke="color-mix(in srgb, #ef6c00 45%, var(--border))"
              strokeDasharray="4 4"
            />
            <circle cx={selectedPoint.x} cy={selectedPoint.y} fill="#ef6c00" r="4" />
            <rect
              x={selectedLabelX - 48}
              y={selectedLabelY - 16}
              width="96"
              height="30"
              rx="7"
              fill="var(--surface-raised)"
              stroke="var(--border)"
            />
            <text
              x={selectedLabelX}
              y={selectedLabelY - 3}
              fill="var(--text-h)"
              fontSize="11"
              fontWeight="bold"
              textAnchor="middle"
            >
              {selectedPoint.weight.toFixed(1)} lb
            </text>
            <text
              x={selectedLabelX}
              y={selectedLabelY + 10}
              fill="var(--text-muted)"
              fontSize="9"
              textAnchor="middle"
            >
              {selectedPoint.date}
            </text>
          </g>
        )}
        <text
          x={paddingLeft}
          y={height - 7}
          fill="var(--text-muted)"
          fontSize="10"
        >
          {firstDate}
        </text>
        {points.length > 2 && (
          <text
            x={paddingLeft + plotWidth / 2}
            y={height - 7}
            fill="var(--text-muted)"
            fontSize="10"
            textAnchor="middle"
          >
            {middleDate}
          </text>
        )}
        <text
          x={width - paddingRight}
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
  const [chartSettings, setChartSettings] = useState(getStoredChartSettings);
  const [rangeSheetOpen, setRangeSheetOpen] = useState(false);
  const [trendSheetOpen, setTrendSheetOpen] = useState(false);
  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => b.date.localeCompare(a.date)),
    [entries]
  );
  const latestEntry = sortedEntries[0] || null;
  const latestWeight = latestEntry ? parseWeight(latestEntry.weight) : null;
  const parsedDraft = parseWeight(draft);
  const { rangeDays, trendDays } = chartSettings;
  const rangeLabel = getOptionLabel(RANGE_OPTIONS, rangeDays);
  const trendLabel = getOptionLabel(TREND_OPTIONS, trendDays);

  function updateChartSettings(nextSettings) {
    setChartSettings((currentSettings) => {
      const updatedSettings = {
        ...currentSettings,
        ...nextSettings,
      };

      saveStoredChartSettings(updatedSettings);

      return updatedSettings;
    });
  }

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
          <div
            style={{
              alignItems: "center",
              display: "inline-flex",
              gap: "6px",
            }}
          >
            <button
              aria-label={`Set weight trend, current ${trendLabel}`}
              onClick={() => setTrendSheetOpen(true)}
              style={{
                alignItems: "center",
                borderColor: trendDays ? "#ef6c00" : undefined,
                color: trendDays ? "#ef6c00" : undefined,
                display: "inline-flex",
                justifyContent: "center",
                minHeight: "36px",
                minWidth: "36px",
                padding: 0,
              }}
              title={`Trend: ${trendLabel}`}
              type="button"
            >
              <TrendingUp size={18} />
            </button>
            <button
              aria-label={`Set weight range, current ${rangeLabel}`}
              onClick={() => setRangeSheetOpen(true)}
              style={{
                alignItems: "center",
                borderColor: rangeDays ? "#ef6c00" : undefined,
                color: rangeDays ? "#ef6c00" : undefined,
                display: "inline-flex",
                justifyContent: "center",
                minHeight: "36px",
                minWidth: "36px",
                padding: 0,
              }}
              title={`Range: ${rangeLabel}`}
              type="button"
            >
              <CalendarDays size={18} />
            </button>
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
        </div>

        <WeightChart entries={entries} rangeDays={rangeDays} trendDays={trendDays} />

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
      {rangeSheetOpen && (
        <SelectionSheet
          onClose={() => setRangeSheetOpen(false)}
          onSelect={(value) => updateChartSettings({ rangeDays: value })}
          options={RANGE_OPTIONS}
          selectedValue={rangeDays}
          title="Weight range"
        />
      )}
      {trendSheetOpen && (
        <SelectionSheet
          onClose={() => setTrendSheetOpen(false)}
          onSelect={(value) => updateChartSettings({ trendDays: value })}
          options={TREND_OPTIONS}
          selectedValue={trendDays}
          title="Weight trend"
        />
      )}
    </div>
  );
}
