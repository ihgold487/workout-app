import { useMemo, useState } from "react";
import { Plus, Scale, Trash2, Utensils } from "lucide-react";

const NUTRITION_LOG_KEY = "nutritionLogEntries";
const BODY_WEIGHT_LOG_KEY = "bodyWeightLogEntries";

const emptyEntry = {
  calories: "",
  carbs: "",
  fat: "",
  name: "",
  protein: "",
};

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function readNutritionEntries() {
  try {
    const entries = JSON.parse(localStorage.getItem(NUTRITION_LOG_KEY) || "[]");

    return Array.isArray(entries) ? entries : [];
  } catch (error) {
    console.error("Failed to load nutrition entries:", error);

    return [];
  }
}

function saveNutritionEntries(entries) {
  localStorage.setItem(NUTRITION_LOG_KEY, JSON.stringify(entries));
}

function readBodyWeightEntries() {
  try {
    const entries = JSON.parse(localStorage.getItem(BODY_WEIGHT_LOG_KEY) || "[]");

    return Array.isArray(entries) ? entries : [];
  } catch (error) {
    console.error("Failed to load body weight entries:", error);

    return [];
  }
}

function saveBodyWeightEntries(entries) {
  localStorage.setItem(BODY_WEIGHT_LOG_KEY, JSON.stringify(entries));
}

function parseMacroValue(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMacro(value, unit = "g") {
  if (!value) return unit === "cal" ? "0" : `0${unit}`;

  return unit === "cal" ? String(Math.round(value)) : `${Math.round(value)}${unit}`;
}

function totalEntries(entries) {
  return entries.reduce(
    (totals, entry) => ({
      calories: totals.calories + parseMacroValue(entry.calories),
      carbs: totals.carbs + parseMacroValue(entry.carbs),
      fat: totals.fat + parseMacroValue(entry.fat),
      protein: totals.protein + parseMacroValue(entry.protein),
    }),
    {
      calories: 0,
      carbs: 0,
      fat: 0,
      protein: 0,
    }
  );
}

export default function NutritionView() {
  const [entries, setEntries] = useState(readNutritionEntries);
  const [bodyWeightEntries, setBodyWeightEntries] = useState(
    readBodyWeightEntries
  );
  const [entryDraft, setEntryDraft] = useState(emptyEntry);
  const [selectedDate, setSelectedDate] = useState(getTodayKey);
  const [weightDraft, setWeightDraft] = useState("");

  const dayEntries = useMemo(
    () => entries.filter((entry) => entry.date === selectedDate),
    [entries, selectedDate]
  );
  const dayBodyWeight = useMemo(
    () => bodyWeightEntries.find((entry) => entry.date === selectedDate),
    [bodyWeightEntries, selectedDate]
  );
  const recentBodyWeights = useMemo(
    () =>
      [...bodyWeightEntries]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 7),
    [bodyWeightEntries]
  );
  const totals = useMemo(() => totalEntries(dayEntries), [dayEntries]);

  function updateEntries(nextEntries) {
    setEntries(nextEntries);
    saveNutritionEntries(nextEntries);
  }

  function updateBodyWeightEntries(nextEntries) {
    setBodyWeightEntries(nextEntries);
    saveBodyWeightEntries(nextEntries);
  }

  function addEntry() {
    const name = entryDraft.name.trim();

    if (!name) {
      return;
    }

    updateEntries([
      ...entries,
      {
        ...entryDraft,
        calories: parseMacroValue(entryDraft.calories),
        carbs: parseMacroValue(entryDraft.carbs),
        date: selectedDate,
        fat: parseMacroValue(entryDraft.fat),
        id: Date.now(),
        name,
        protein: parseMacroValue(entryDraft.protein),
      },
    ]);
    setEntryDraft(emptyEntry);
  }

  function removeEntry(entryId) {
    updateEntries(entries.filter((entry) => entry.id !== entryId));
  }

  function saveBodyWeight() {
    const weight = parseMacroValue(weightDraft);

    if (!weight) {
      return;
    }

    const nextEntries = [
      ...bodyWeightEntries.filter((entry) => entry.date !== selectedDate),
      {
        date: selectedDate,
        id: dayBodyWeight?.id || Date.now(),
        unit: "lb",
        weight,
      },
    ].sort((a, b) => a.date.localeCompare(b.date));

    updateBodyWeightEntries(nextEntries);
    setWeightDraft("");
  }

  function removeBodyWeight(entryDate) {
    updateBodyWeightEntries(
      bodyWeightEntries.filter((entry) => entry.date !== entryDate)
    );
  }

  const macroCards = [
    ["Calories", formatMacro(totals.calories, "cal"), "#1769aa", "#eaf3fb"],
    ["Protein", formatMacro(totals.protein), "#137333", "#e7f4ea"],
    ["Carbs", formatMacro(totals.carbs), "#b06000", "#fff4e5"],
    ["Fat", formatMacro(totals.fat), "#7b3fc7", "#f2eafa"],
  ];

  return (
    <div
      style={{
        padding: "18px 16px",
        textAlign: "left",
      }}
    >
      <header
        style={{
          alignItems: "center",
          display: "flex",
          gap: "10px",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            alignItems: "center",
            background: "#eaf3fb",
            borderRadius: "999px",
            color: "#1769aa",
            display: "inline-flex",
            height: "42px",
            justifyContent: "center",
            width: "42px",
          }}
        >
          <Utensils size={22} />
        </div>
        <div>
          <h1
            style={{
              fontSize: "30px",
              lineHeight: 1,
              margin: 0,
            }}
          >
            Nutrition
          </h1>
          <div
            style={{
              color: "#666",
              fontSize: "13px",
              marginTop: "4px",
            }}
          >
            Manual calories and macros
          </div>
        </div>
      </header>

      <label
        style={{
          display: "grid",
          gap: "5px",
          marginBottom: "14px",
        }}
      >
        Day
        <input
          type="date"
          value={selectedDate}
          onChange={(event) => setSelectedDate(event.target.value)}
          style={{
            boxSizing: "border-box",
            font: "inherit",
            minHeight: "42px",
            padding: "7px 10px",
            width: "100%",
          }}
        />
      </label>

      <section
        aria-label="Daily macro totals"
        style={{
          display: "grid",
          gap: "8px",
          gridTemplateColumns: "1fr 1fr",
          marginBottom: "16px",
        }}
      >
        {macroCards.map(([label, value, color, background]) => (
          <div
            key={label}
            style={{
              background,
              borderRadius: "8px",
              color,
              padding: "10px",
            }}
          >
            <div
              style={{
                fontSize: "12px",
                fontWeight: "bold",
              }}
            >
              {label}
            </div>
            <div
              style={{
                color: "#222",
                fontSize: "24px",
                fontWeight: "bold",
                lineHeight: 1.1,
                marginTop: "4px",
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </section>

      <section
        style={{
          borderTop: "1px solid #e5e5e5",
          marginBottom: "16px",
          paddingTop: "14px",
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: "8px",
            marginBottom: "10px",
          }}
        >
          <Scale size={20} color="#1769aa" />
          <h2
            style={{
              fontSize: "18px",
              margin: 0,
            }}
          >
            Body weight
          </h2>
        </div>

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
            {dayBodyWeight
              ? `${dayBodyWeight.weight} ${dayBodyWeight.unit}`
              : "No weight logged"}
            <input
              aria-label="Body weight"
              inputMode="decimal"
              placeholder="Weight"
              value={weightDraft}
              onChange={(event) => setWeightDraft(event.target.value)}
              style={{
                boxSizing: "border-box",
                font: "inherit",
                minHeight: "42px",
                minWidth: 0,
                padding: "7px 10px",
                width: "100%",
              }}
            />
          </label>
          <button
            disabled={!parseMacroValue(weightDraft)}
            onClick={saveBodyWeight}
            style={{
              minHeight: "42px",
              padding: "7px 12px",
            }}
          >
            Save
          </button>
        </div>

        {recentBodyWeights.length > 0 && (
          <div
            style={{
              display: "grid",
              gap: "6px",
              marginTop: "10px",
            }}
          >
            {recentBodyWeights.map((entry) => (
              <div
                key={entry.date}
                style={{
                  alignItems: "center",
                  color: "#555",
                  display: "grid",
                  fontSize: "13px",
                  gap: "8px",
                  gridTemplateColumns: "minmax(0, 1fr) auto auto",
                }}
              >
                <span>{entry.date}</span>
                <strong>
                  {entry.weight} {entry.unit}
                </strong>
                <button
                  aria-label={`Remove body weight for ${entry.date}`}
                  onClick={() => removeBodyWeight(entry.date)}
                  style={{
                    alignItems: "center",
                    display: "inline-flex",
                    justifyContent: "center",
                    minHeight: "30px",
                    minWidth: "34px",
                    padding: "3px 6px",
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section
        style={{
          borderTop: "1px solid #e5e5e5",
          paddingTop: "14px",
        }}
      >
        <h2
          style={{
            fontSize: "18px",
            marginBottom: "10px",
          }}
        >
          Add food
        </h2>
        <div
          style={{
            display: "grid",
            gap: "8px",
          }}
        >
          <input
            aria-label="Food name"
            placeholder="Food or meal"
            value={entryDraft.name}
            onChange={(event) =>
              setEntryDraft({ ...entryDraft, name: event.target.value })
            }
            style={{
              boxSizing: "border-box",
              font: "inherit",
              minHeight: "42px",
              padding: "7px 10px",
              width: "100%",
            }}
          />

          <div
            style={{
              display: "grid",
              gap: "8px",
              gridTemplateColumns: "1fr 1fr",
            }}
          >
            {[
              ["calories", "Calories"],
              ["protein", "Protein"],
              ["carbs", "Carbs"],
              ["fat", "Fat"],
            ].map(([field, label]) => (
              <input
                key={field}
                aria-label={label}
                inputMode="decimal"
                placeholder={label}
                value={entryDraft[field]}
                onChange={(event) =>
                  setEntryDraft({
                    ...entryDraft,
                    [field]: event.target.value,
                  })
                }
                style={{
                  boxSizing: "border-box",
                  font: "inherit",
                  minHeight: "42px",
                  minWidth: 0,
                  padding: "7px 10px",
                  width: "100%",
                }}
              />
            ))}
          </div>

          <button
            disabled={!entryDraft.name.trim()}
            onClick={addEntry}
            style={{
              alignItems: "center",
              display: "inline-flex",
              gap: "6px",
              justifyContent: "center",
              minHeight: "42px",
            }}
          >
            <Plus size={18} />
            Add Food
          </button>
        </div>
      </section>

      <section
        style={{
          marginTop: "18px",
        }}
      >
        <h2
          style={{
            fontSize: "18px",
            marginBottom: "10px",
          }}
        >
          Today&apos;s log
        </h2>

        {dayEntries.length === 0 ? (
          <div
            style={{
              background: "#f6f7f8",
              borderRadius: "8px",
              color: "#666",
              fontSize: "14px",
              padding: "12px",
              textAlign: "center",
            }}
          >
            No foods logged for this day.
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gap: "8px",
            }}
          >
            {dayEntries.map((entry) => (
              <div
                key={entry.id}
                style={{
                  alignItems: "center",
                  borderBottom: "1px solid #eee",
                  display: "grid",
                  gap: "8px",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  padding: "8px 0",
                }}
              >
                <div
                  style={{
                    minWidth: 0,
                  }}
                >
                  <strong
                    style={{
                      display: "block",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.name}
                  </strong>
                  <span
                    style={{
                      color: "#666",
                      fontSize: "12px",
                    }}
                  >
                    {formatMacro(entry.calories, "cal")} cal ·{" "}
                    {formatMacro(entry.protein)} protein ·{" "}
                    {formatMacro(entry.carbs)} carbs · {formatMacro(entry.fat)} fat
                  </span>
                </div>

                <button
                  aria-label={`Remove ${entry.name}`}
                  onClick={() => removeEntry(entry.id)}
                  style={{
                    alignItems: "center",
                    display: "inline-flex",
                    justifyContent: "center",
                    minHeight: "34px",
                    minWidth: "38px",
                    padding: "4px 8px",
                  }}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
