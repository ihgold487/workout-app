import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Plus, ScanBarcode, Scale, Search, Trash2, Utensils, X } from "lucide-react";

const NUTRITION_LOG_KEY = "nutritionLogEntries";
const BODY_WEIGHT_LOG_KEY = "bodyWeightLogEntries";
const FDC_API_BASE_URL = "https://api.nal.usda.gov/fdc/v1";
const FDC_API_KEY = import.meta.env.VITE_USDA_FDC_API_KEY || "";

const emptyEntry = {
  calories: "",
  carbs: "",
  fat: "",
  name: "",
  protein: "",
};

const emptySelectedFood = null;

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

function formatFoodDataType(value) {
  return String(value || "").replace(/_/g, " ");
}

function getFoodNutrient(food, names) {
  const nutrient = (food.foodNutrients || []).find((item) => {
    const name = String(item.nutrientName || item.nutrient?.name || "")
      .toLowerCase()
      .trim();

    return names.some((target) => name === target || name.includes(target));
  });

  const value = Number(nutrient?.value ?? nutrient?.amount);

  return Number.isFinite(value) ? value : 0;
}

function getFoodMacros(food) {
  return {
    calories: getFoodNutrient(food, ["energy", "energy (atwater general factors)"]),
    carbs: getFoodNutrient(food, ["carbohydrate, by difference"]),
    fat: getFoodNutrient(food, ["total lipid (fat)", "total fat"]),
    protein: getFoodNutrient(food, ["protein"]),
  };
}

function scaleMacros(macros, amount) {
  const multiplier = parseMacroValue(amount) || 0;

  return {
    calories: macros.calories * multiplier,
    carbs: macros.carbs * multiplier,
    fat: macros.fat * multiplier,
    protein: macros.protein * multiplier,
  };
}

function formatDraftMacro(value) {
  return value ? String(Math.round(value)) : "";
}

function getServingDescription(food) {
  if (food.householdServingFullText) {
    return food.householdServingFullText;
  }

  if (food.servingSize && food.servingSizeUnit) {
    return `${food.servingSize}${food.servingSizeUnit}`;
  }

  return "100g reference";
}

async function searchFoodDataCentral(query) {
  const params = new URLSearchParams({
    api_key: FDC_API_KEY,
    dataType: "Foundation,Branded",
    pageSize: "12",
    query,
  });
  const response = await fetch(`${FDC_API_BASE_URL}/foods/search?${params}`);

  if (!response.ok) {
    throw new Error(`FoodData Central search failed (${response.status})`);
  }

  return response.json();
}

async function searchFoodDataCentralByBarcode(barcode) {
  const params = new URLSearchParams({
    api_key: FDC_API_KEY,
    dataType: "Branded",
    pageSize: "12",
    query: barcode,
  });
  const response = await fetch(`${FDC_API_BASE_URL}/foods/search?${params}`);

  if (!response.ok) {
    throw new Error(`FoodData Central barcode search failed (${response.status})`);
  }

  return response.json();
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
  const [foodSearchQuery, setFoodSearchQuery] = useState("");
  const [foodSearchResults, setFoodSearchResults] = useState([]);
  const [foodSearchStatus, setFoodSearchStatus] = useState("");
  const [foodSearchLoading, setFoodSearchLoading] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [barcodeDraft, setBarcodeDraft] = useState("");
  const [barcodeStatus, setBarcodeStatus] = useState("");
  const [selectedFood, setSelectedFood] = useState(emptySelectedFood);
  const [servingAmount, setServingAmount] = useState("1");
  const entryFormRef = useRef(null);
  const foodNameInputRef = useRef(null);
  const barcodeVideoRef = useRef(null);
  const barcodeControlsRef = useRef(null);

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

  useEffect(() => {
    if (!showBarcodeScanner) {
      barcodeControlsRef.current?.stop?.();
      barcodeControlsRef.current = null;
      return undefined;
    }

    let cancelled = false;
    const codeReader = new BrowserMultiFormatReader();

    async function startBarcodeScanner() {
      if (!barcodeVideoRef.current) {
        return;
      }

      setBarcodeStatus("Point the camera at a UPC barcode.");

      try {
        const controls = await codeReader.decodeFromVideoDevice(
          undefined,
          barcodeVideoRef.current,
          (result) => {
            if (!result || cancelled) {
              return;
            }

            const barcode = result.getText();

            barcodeControlsRef.current?.stop?.();
            barcodeControlsRef.current = null;
            setBarcodeDraft(barcode);
            searchFoodsByBarcode(barcode);
          }
        );

        if (cancelled) {
          controls.stop();
          return;
        }

        barcodeControlsRef.current = controls;
      } catch (error) {
        console.error("Barcode scanner failed:", error);
        setBarcodeStatus(
          "Camera barcode scanning is not available. Enter the UPC manually."
        );
      }
    }

    startBarcodeScanner();

    return () => {
      cancelled = true;
      barcodeControlsRef.current?.stop?.();
      barcodeControlsRef.current = null;
    };
  }, [showBarcodeScanner]);

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
        servingAmount: selectedFood ? parseMacroValue(servingAmount) : null,
        servingDescription: selectedFood?.servingDescription || null,
        source: selectedFood ? "fdc" : "manual",
        sourceKey: selectedFood?.fdcId ? String(selectedFood.fdcId) : null,
      },
    ]);
    setEntryDraft(emptyEntry);
    setSelectedFood(emptySelectedFood);
    setServingAmount("1");
    clearFoodSearch();
  }

  function clearFoodSearch() {
    setFoodSearchQuery("");
    setFoodSearchResults([]);
    setFoodSearchStatus("");
    setBarcodeDraft("");
    setBarcodeStatus("");
  }

  async function searchFoods(event) {
    event?.preventDefault();

    const query = foodSearchQuery.trim();

    if (!query) {
      return;
    }

    if (!FDC_API_KEY) {
      setFoodSearchStatus(
        "Add VITE_USDA_FDC_API_KEY to your local environment to search FoodData Central."
      );
      return;
    }

    setFoodSearchLoading(true);
    setFoodSearchStatus("Searching FoodData Central...");

    try {
      const result = await searchFoodDataCentral(query);
      const foods = Array.isArray(result.foods) ? result.foods : [];

      setFoodSearchResults(foods);
      setFoodSearchStatus(
        foods.length ? `${foods.length} foods found` : "No foods found"
      );
    } catch (error) {
      console.error("FoodData Central search failed:", error);
      setFoodSearchStatus(error.message);
      setFoodSearchResults([]);
    } finally {
      setFoodSearchLoading(false);
    }
  }

  async function searchFoodsByBarcode(barcodeValue) {
    const barcode = String(barcodeValue || "").replace(/\D/g, "");

    if (!barcode) {
      return;
    }

    if (!FDC_API_KEY) {
      setBarcodeStatus(
        "Add VITE_USDA_FDC_API_KEY to your local environment to search FoodData Central."
      );
      return;
    }

    setFoodSearchQuery(barcode);
    setFoodSearchLoading(true);
    setFoodSearchStatus(`Searching UPC ${barcode}...`);
    setBarcodeStatus(`Searching UPC ${barcode}...`);

    try {
      const result = await searchFoodDataCentralByBarcode(barcode);
      const foods = Array.isArray(result.foods) ? result.foods : [];

      setFoodSearchResults(foods);
      setFoodSearchStatus(
        foods.length ? `${foods.length} foods found for UPC ${barcode}` : "No foods found for that UPC"
      );
      setBarcodeStatus(
        foods.length ? `Found ${foods.length} foods.` : "No foods found for that UPC."
      );
      setShowBarcodeScanner(false);
    } catch (error) {
      console.error("FoodData Central barcode search failed:", error);
      setFoodSearchStatus(error.message);
      setBarcodeStatus(error.message);
      setFoodSearchResults([]);
    } finally {
      setFoodSearchLoading(false);
    }
  }

  function selectFoodResult(food) {
    const macros = getFoodMacros(food);
    const servingDescription = getServingDescription(food);
    const nextSelectedFood = {
      baseMacros: macros,
      fdcId: food.fdcId,
      servingDescription,
    };
    const scaledMacros = scaleMacros(macros, "1");

    setSelectedFood(nextSelectedFood);
    setServingAmount("1");
    setEntryDraft({
      calories: formatDraftMacro(scaledMacros.calories),
      carbs: formatDraftMacro(scaledMacros.carbs),
      fat: formatDraftMacro(scaledMacros.fat),
      name: food.brandName
        ? `${food.description} (${food.brandName})`
        : food.description || "",
      protein: formatDraftMacro(scaledMacros.protein),
    });
    window.requestAnimationFrame(() => {
      entryFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      foodNameInputRef.current?.focus();
    });
  }

  function updateServingAmount(value) {
    setServingAmount(value);

    if (!selectedFood) {
      return;
    }

    const scaledMacros = scaleMacros(selectedFood.baseMacros, value);

    setEntryDraft((current) => ({
      ...current,
      calories: formatDraftMacro(scaledMacros.calories),
      carbs: formatDraftMacro(scaledMacros.carbs),
      fat: formatDraftMacro(scaledMacros.fat),
      protein: formatDraftMacro(scaledMacros.protein),
    }));
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
    [
      "Calories",
      formatMacro(totals.calories, "cal"),
      "#1769aa",
      "color-mix(in srgb, #1769aa 14%, var(--surface))",
    ],
    [
      "Protein",
      formatMacro(totals.protein),
      "#137333",
      "color-mix(in srgb, #137333 16%, var(--surface))",
    ],
    [
      "Carbs",
      formatMacro(totals.carbs),
      "#b06000",
      "color-mix(in srgb, #b06000 16%, var(--surface))",
    ],
    [
      "Fat",
      formatMacro(totals.fat),
      "#7b3fc7",
      "color-mix(in srgb, #7b3fc7 16%, var(--surface))",
    ],
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
            background: "var(--accent-bg)",
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
              color: "var(--text-muted)",
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
                color: "var(--text-h)",
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
          borderTop: "1px solid var(--border)",
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
                  color: "var(--text-muted)",
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
          borderTop: "1px solid var(--border)",
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

        <form
          onSubmit={searchFoods}
          style={{
            background: "var(--surface-muted)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            display: "grid",
            gap: "8px",
            marginBottom: "12px",
            padding: "10px",
          }}
        >
          <label
            style={{
              display: "grid",
              gap: "5px",
            }}
          >
            Search USDA FoodData Central
            <div
              style={{
                display: "grid",
                gap: "8px",
                gridTemplateColumns: "minmax(0, 1fr) auto auto auto",
              }}
            >
              <input
                aria-label="Search foods"
                placeholder="Chicken breast, Greek yogurt, cereal..."
                value={foodSearchQuery}
                onChange={(event) => setFoodSearchQuery(event.target.value)}
                style={{
                  boxSizing: "border-box",
                  font: "inherit",
                  minHeight: "42px",
                  minWidth: 0,
                  padding: "7px 10px",
                  width: "100%",
                }}
              />
              <button
                aria-label="Clear food search"
                disabled={
                  !foodSearchQuery &&
                  foodSearchResults.length === 0 &&
                  !foodSearchStatus
                }
                onClick={clearFoodSearch}
                type="button"
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  justifyContent: "center",
                  minHeight: "42px",
                  minWidth: "42px",
                  padding: 0,
                }}
              >
                <X size={17} />
              </button>
              <button
                disabled={foodSearchLoading || !foodSearchQuery.trim()}
                type="submit"
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  gap: "6px",
                  justifyContent: "center",
                  minHeight: "42px",
                  minWidth: "46px",
                }}
              >
                <Search size={17} />
                <span
                  style={{
                    display: "none",
                  }}
                >
                  Search
                </span>
              </button>
              <button
                aria-label="Scan barcode"
                onClick={() => {
                  setBarcodeStatus("");
                  setShowBarcodeScanner(true);
                }}
                type="button"
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  justifyContent: "center",
                  minHeight: "42px",
                  minWidth: "46px",
                }}
              >
                <ScanBarcode size={18} />
              </button>
            </div>
          </label>

          {foodSearchStatus && (
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "12px",
              }}
            >
              {foodSearchStatus}
            </div>
          )}

          {foodSearchResults.length > 0 && (
            <div
              style={{
                display: "grid",
                gap: "8px",
              }}
            >
              {foodSearchResults.map((food) => {
                const macros = getFoodMacros(food);

                return (
                  <div
                    key={food.fdcId}
                    style={{
                      background: "var(--surface-raised)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      display: "grid",
                      gap: "8px",
                      padding: "10px",
                    }}
                  >
                    <div
                      style={{
                        alignItems: "start",
                        display: "grid",
                        gap: "8px",
                        gridTemplateColumns: "minmax(0, 1fr) auto",
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
                          {food.description}
                        </strong>
                        <span
                          style={{
                            color: "var(--text-muted)",
                            display: "block",
                            fontSize: "12px",
                            marginTop: "3px",
                          }}
                        >
                          {[food.brandName, formatFoodDataType(food.dataType)]
                            .filter(Boolean)
                            .join(" · ")}{" "}
                          · {getServingDescription(food)}
                        </span>
                      </div>
                      <button
                        onClick={() => selectFoodResult(food)}
                        type="button"
                        style={{
                          minHeight: "34px",
                          padding: "5px 10px",
                        }}
                      >
                        Use
                      </button>
                    </div>
                    <div
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "12px",
                      }}
                    >
                      {formatMacro(macros.calories, "cal")} cal ·{" "}
                      {formatMacro(macros.protein)} protein ·{" "}
                      {formatMacro(macros.carbs)} carbs ·{" "}
                      {formatMacro(macros.fat)} fat
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </form>

        {showBarcodeScanner && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Scan barcode"
            onClick={() => setShowBarcodeScanner(false)}
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
                gap: "12px",
                maxHeight: "82vh",
                maxWidth: "520px",
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
                <div>
                  <h2
                    style={{
                      fontSize: "18px",
                      lineHeight: 1.15,
                      margin: 0,
                    }}
                  >
                    Scan Barcode
                  </h2>
                  <div
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "12px",
                      marginTop: "3px",
                    }}
                  >
                    Scan a UPC, then search USDA branded foods
                  </div>
                </div>
                <button
                  aria-label="Close barcode scanner"
                  onClick={() => setShowBarcodeScanner(false)}
                  style={{
                    alignItems: "center",
                    display: "inline-flex",
                    justifyContent: "center",
                    minHeight: "36px",
                    minWidth: "36px",
                    padding: 0,
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              <video
                ref={barcodeVideoRef}
                muted
                playsInline
                style={{
                  aspectRatio: "4 / 3",
                  background: "var(--surface-muted)",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  objectFit: "cover",
                  width: "100%",
                }}
              />

              {barcodeStatus && (
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "13px",
                  }}
                >
                  {barcodeStatus}
                </div>
              )}

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  searchFoodsByBarcode(barcodeDraft);
                }}
                style={{
                  display: "grid",
                  gap: "8px",
                }}
              >
                <label
                  style={{
                    display: "grid",
                    gap: "5px",
                  }}
                >
                  UPC
                  <div
                    style={{
                      display: "grid",
                      gap: "8px",
                      gridTemplateColumns: "minmax(0, 1fr) auto",
                    }}
                  >
                    <input
                      aria-label="UPC"
                      inputMode="numeric"
                      placeholder="Enter UPC manually"
                      value={barcodeDraft}
                      onChange={(event) => setBarcodeDraft(event.target.value)}
                      style={{
                        boxSizing: "border-box",
                        font: "inherit",
                        minHeight: "42px",
                        minWidth: 0,
                        padding: "7px 10px",
                        width: "100%",
                      }}
                    />
                    <button
                      disabled={foodSearchLoading || !barcodeDraft.trim()}
                      type="submit"
                      style={{
                        minHeight: "42px",
                        padding: "7px 12px",
                      }}
                    >
                      Search
                    </button>
                  </div>
                </label>
              </form>
            </div>
          </div>
        )}

        <div
          ref={entryFormRef}
          style={{
            display: "grid",
            gap: "8px",
            scrollMarginTop: "12px",
          }}
        >
          <label
            style={{
              display: "grid",
              gap: "5px",
            }}
          >
            Food name
            <input
              ref={foodNameInputRef}
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
          </label>

          {selectedFood && (
            <div
              style={{
                background: "var(--surface-muted)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                display: "grid",
                gap: "8px",
                padding: "10px",
              }}
            >
              <label
                style={{
                  display: "grid",
                  gap: "5px",
                }}
              >
                Amount
                <input
                  aria-label="Serving amount"
                  inputMode="decimal"
                  value={servingAmount}
                  onChange={(event) => updateServingAmount(event.target.value)}
                  style={{
                    boxSizing: "border-box",
                    font: "inherit",
                    minHeight: "42px",
                    padding: "7px 10px",
                    width: "100%",
                  }}
                />
              </label>
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "12px",
                }}
              >
                Serving basis: {selectedFood.servingDescription}. Values below
                update as the amount changes.
              </div>
            </div>
          )}

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
              <label
                key={field}
                style={{
                  display: "grid",
                  gap: "5px",
                  minWidth: 0,
                }}
              >
                {label}
                <input
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
              </label>
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
              background: "var(--surface-muted)",
              borderRadius: "8px",
              color: "var(--text-muted)",
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
                  borderBottom: "1px solid var(--border)",
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
                      color: "var(--text-muted)",
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
