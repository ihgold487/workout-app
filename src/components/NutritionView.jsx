import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarcodeFormat,
  BrowserMultiFormatReader,
} from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";
import {
  Bell,
  BellOff,
  BicepsFlexed,
  BookPlus,
  CalendarDays,
  CalendarPlus,
  Camera,
  ChefHat,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Coffee,
  Library,
  Plus,
  ScanBarcode,
  Scale,
  Search,
  Sun,
  Sunrise,
  Sunset,
  Target,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import BodyWeightSheet from "./BodyWeightSheet";
import WeightPickerModal from "./WeightPickerModal";
import {
  getNutritionOutbox,
  initializeNutritionPersistence,
  loadNutritionSnapshot,
  mergeNutritionEntryCollections,
  persistNutritionEntries,
  queueBodyWeightDelete,
  queueBodyWeightUpsert,
  queueNutritionDelete,
  queueNutritionTargetUpsert,
  queueNutritionUpserts,
} from "../storage/nutritionStorage";
import { isSupabaseConfigured, supabase } from "../sync/supabaseClient";
import { assertRemoteWriteAllowed } from "../sync/remoteWritePolicy";
import {
  cancelNativeCreatineNotifications,
  canUseNativeCreatineNotifications,
  scheduleNativeCreatineNotifications,
} from "../native/creatineReminderNotifications";
import { triggerNativePickerSelectionHaptic } from "../native/pickerHaptics";

const NUTRITION_LOG_KEY = "nutritionLogEntries";
const BODY_WEIGHT_LOG_KEY = "bodyWeightLogEntries";
const DAILY_CALORIE_GOAL_KEY = "dailyCalorieGoal";
const DAILY_CALORIE_GOAL_HISTORY_KEY = "dailyCalorieGoalHistory";
const CALORIE_CHART_SETTINGS_STORAGE_KEY = "calorieChartSettings";
const RANGE_OPTIONS = [
  { label: "1 week", value: 7 },
  { label: "1 month", value: 30 },
  { label: "3 months", value: 90 },
  { label: "6 months", value: 183 },
  { label: "9 months", value: 274 },
  { label: "1 year", value: 365 },
  { label: "All", value: null },
];
const DAILY_CREATINE_LOG_KEY = "dailyCreatineLog";
const DAILY_CREATINE_REMINDER_KEY = "dailyCreatineReminder";
const DAILY_CREATINE_REMINDER_TIME_KEY = "dailyCreatineReminderTime";
const NUTRITION_ADD_MEAL_KEY = "nutritionAddMeal";
const DEFAULT_DAILY_CREATINE_REMINDER_TIME = "16:00";
const CREATINE_REMINDER_HOUR_OPTIONS = Array.from(
  { length: 24 },
  (_, hour) => ({
    label: `${hour % 12 || 12} ${hour >= 12 ? "PM" : "AM"}`,
    value: hour,
  })
);
const CREATINE_REMINDER_MINUTE_OPTIONS = Array.from(
  { length: 60 },
  (_, minute) => ({
    label: String(minute).padStart(2, "0"),
    value: minute,
  })
);
const FDC_API_BASE_URL = "https://api.nal.usda.gov/fdc/v1";
const FDC_API_KEY = import.meta.env.VITE_USDA_FDC_API_KEY || "";
const SUPPLEMENTAL_FOOD_SOURCE = "supplemental_library";
const SUPPLEMENTAL_RECIPE_SOURCE = "supplemental_recipe_library";
const FATSECRET_BADGE_URL =
  "https://platform.fatsecret.com/api/static/images/powered_by_fatsecret.svg";
const GRAMS_PER_OUNCE = 28.349523125;
const ML_PER_TEASPOON = 4.92892159375;
const ML_PER_TABLESPOON = 14.78676478125;
const ML_PER_FLUID_OUNCE = 29.5735295625;
const ML_PER_CUP = 240;
const PORTION_UNIT_OPTIONS = [
  ["serving", "servings"],
  ["g", "grams"],
  ["oz", "ounces"],
  ["ml", "mL"],
  ["fl-oz", "fl oz"],
  ["tsp", "tsp"],
  ["tbsp", "tbsp"],
  ["cup", "cups"],
  ["cake", "cakes"],
  ["piece", "pieces"],
  ["slice", "slices"],
  ["bar", "bars"],
  ["packet", "packets"],
  ["container", "containers"],
];
const FATSECRET_SEARCH_DETAIL_LIMIT = 5;
const FOOD_BARCODE_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
];
const NATIVE_BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];
const RECIPE_OCR_IMPORT_TIMEOUT_MS = 90000;
const BARCODE_VIDEO_CONSTRAINTS = {
  audio: false,
  video: {
    advanced: [
      {
        focusMode: "continuous",
      },
    ],
    facingMode: {
      ideal: "environment",
    },
    height: {
      ideal: 1080,
    },
    width: {
      ideal: 1920,
    },
  },
};
const RECIPE_CAMERA_VIDEO_CONSTRAINTS = {
  audio: false,
  video: {
    advanced: [
      {
        focusMode: "continuous",
      },
    ],
    facingMode: {
      ideal: "environment",
    },
    height: {
      ideal: 1440,
    },
    width: {
      ideal: 1920,
    },
  },
};
const RECIPE_OCR_INGREDIENT_UNITS = new Set([
  "bag",
  "bags",
  "bunch",
  "bunches",
  "can",
  "cans",
  "clove",
  "cloves",
  "cup",
  "cups",
  "g",
  "gram",
  "grams",
  "lb",
  "lbs",
  "ml",
  "ounce",
  "ounces",
  "oz",
  "package",
  "packages",
  "packet",
  "packets",
  "pinch",
  "pound",
  "pounds",
  "slice",
  "slices",
  "sprig",
  "sprigs",
  "tablespoon",
  "tablespoons",
  "tbsp",
  "teaspoon",
  "teaspoons",
  "tsp",
]);
const RECIPE_OCR_SKIP_LINE_PATTERN =
  /^(add|bake|bring|cook|directions?|divide|for serving|garnish|heat|instructions?|method|notes?|prepare|preparation|recipe|serve|serves|step|steps|stir|yield)s?\b/i;
const RECIPE_OCR_UNIT_PATTERN =
  "(?:cup|cups|teaspoon|teaspoons|tsp|tablespoon|tablespoons|tbsp)";
const DEFAULT_RECIPE_CROP = {
  height: 0.78,
  width: 0.44,
  x: 0.04,
  y: 0.08,
};
const BASE_MEAL_OPTIONS = [
  ["breakfast", "Breakfast"],
  ["lunch", "Lunch"],
  ["dinner", "Dinner"],
];
const ADD_SNACK_VALUE = "__add_snack__";
const COPY_TO_MEAL_VALUE = "__copy_to_meal__";
const DEFAULT_SNACK_MEAL = "snack-1";
const ALWAYS_VISIBLE_MEALS = new Set([
  "breakfast",
  "lunch",
  "dinner",
  DEFAULT_SNACK_MEAL,
]);
const DEFAULT_MEAL = "breakfast";
const MACRO_COLORS = {
  calories: "#1769aa",
  carbs: "#b06000",
  fat: "#7b3fc7",
  protein: "#137333",
};
const DAILY_PROTEIN_TARGET_GRAMS = 200;
const DAILY_PROTEIN_TARGET_CALORIES = DAILY_PROTEIN_TARGET_GRAMS * 4;

const emptyEntry = {
  calories: "",
  carbs: "",
  fat: "",
  meal: DEFAULT_MEAL,
  name: "",
  protein: "",
};

const emptySelectedFood = null;
const emptyLibraryDraft = {
  brand: "",
  calories: "",
  carbs: "",
  fat: "",
  name: "",
  protein: "",
  servingAmount: "1",
  servingUnit: "serving",
};
const emptyRecipeDraft = {
  description: "",
  name: "",
  servingSize: "1",
  servingUnit: "serving",
  servingsPerRecipe: "1",
};

function getTodayKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getLocalDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseLocalDateKey(dateKey) {
  const [year, month, day] = String(dateKey || "")
    .split("-")
    .map((part) => Number(part));

  if (!year || !month || !day) {
    return new Date();
  }

  return new Date(year, month - 1, day);
}

function addDays(dateKey, days) {
  const date = parseLocalDateKey(dateKey);
  date.setDate(date.getDate() + days);

  return getLocalDateKey(date);
}

function daysBetween(startDate, endDate) {
  const start = parseLocalDateKey(startDate);
  const end = parseLocalDateKey(endDate);

  return Math.round((end - start) / 86400000);
}

function getOptionLabel(options, value) {
  return options.find((option) => option.value === value)?.label || "";
}

function isValidOptionValue(options, value) {
  return options.some((option) => option.value === value);
}

function getStoredCalorieChartSettings() {
  if (typeof window === "undefined") {
    return {
      rangeDays: null,
    };
  }

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(CALORIE_CHART_SETTINGS_STORAGE_KEY) || "{}"
    );

    return {
      rangeDays: isValidOptionValue(RANGE_OPTIONS, parsed.rangeDays)
        ? parsed.rangeDays
        : null,
    };
  } catch {
    return {
      rangeDays: null,
    };
  }
}

function saveStoredCalorieChartSettings(settings) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      CALORIE_CHART_SETTINGS_STORAGE_KEY,
      JSON.stringify(settings)
    );
  } catch (error) {
    console.warn("Failed to save calorie chart settings:", error);
  }
}

function startOfMondayWeek(date) {
  const start = new Date(date);
  const day = start.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;

  start.setDate(start.getDate() + mondayOffset);
  start.setHours(0, 0, 0, 0);

  return start;
}

function getNutritionLogStorageKey(userId) {
  return userId ? `${NUTRITION_LOG_KEY}:${userId}` : NUTRITION_LOG_KEY;
}

function getNutritionAddMealStorageKey(userId) {
  return userId ? `${NUTRITION_ADD_MEAL_KEY}:${userId}` : NUTRITION_ADD_MEAL_KEY;
}

function getDailyCalorieGoalStorageKey(userId) {
  return userId ? `${DAILY_CALORIE_GOAL_KEY}:${userId}` : DAILY_CALORIE_GOAL_KEY;
}

function getDailyCalorieGoalHistoryStorageKey(userId) {
  return userId
    ? `${DAILY_CALORIE_GOAL_HISTORY_KEY}:${userId}`
    : DAILY_CALORIE_GOAL_HISTORY_KEY;
}

function getDailyCreatineLogStorageKey(userId) {
  return userId ? `${DAILY_CREATINE_LOG_KEY}:${userId}` : DAILY_CREATINE_LOG_KEY;
}

function getDailyCreatineReminderStorageKey(userId) {
  return userId
    ? `${DAILY_CREATINE_REMINDER_KEY}:${userId}`
    : DAILY_CREATINE_REMINDER_KEY;
}

function getDailyCreatineReminderTimeStorageKey(userId) {
  return userId
    ? `${DAILY_CREATINE_REMINDER_TIME_KEY}:${userId}`
    : DAILY_CREATINE_REMINDER_TIME_KEY;
}

function readNutritionEntries(storageKey = NUTRITION_LOG_KEY) {
  try {
    const entries = JSON.parse(localStorage.getItem(storageKey) || "[]");

    return Array.isArray(entries) ? entries : [];
  } catch (error) {
    console.error("Failed to load nutrition entries:", error);

    return [];
  }
}

function saveNutritionEntries(entries, storageKey = NUTRITION_LOG_KEY) {
  localStorage.setItem(storageKey, JSON.stringify(entries));
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

function readNutritionAddMeal(storageKey = NUTRITION_ADD_MEAL_KEY) {
  try {
    return normalizeMeal(localStorage.getItem(storageKey) || DEFAULT_MEAL);
  } catch (error) {
    console.error("Failed to load nutrition add meal:", error);

    return DEFAULT_MEAL;
  }
}

function saveNutritionAddMeal(meal, storageKey = NUTRITION_ADD_MEAL_KEY) {
  try {
    localStorage.setItem(storageKey, normalizeMeal(meal));
  } catch (error) {
    console.error("Failed to save nutrition add meal:", error);
  }
}

function readDailyCalorieGoal(storageKey = DAILY_CALORIE_GOAL_KEY) {
  try {
    const parsed = Number(localStorage.getItem(storageKey));

    return Number.isFinite(parsed) && parsed > 0 ? parsed : "";
  } catch (error) {
    console.error("Failed to load daily calorie goal:", error);

    return "";
  }
}

function saveDailyCalorieGoal(goal, storageKey = DAILY_CALORIE_GOAL_KEY) {
  if (!goal) {
    localStorage.removeItem(storageKey);
    return;
  }

  localStorage.setItem(storageKey, String(goal));
}

function readDailyCalorieGoalHistory(
  fallbackGoal = "",
  storageKey = DAILY_CALORIE_GOAL_HISTORY_KEY
) {
  try {
    const entries = JSON.parse(
      localStorage.getItem(storageKey) || "[]"
    );

    if (Array.isArray(entries) && entries.length > 0) {
      return entries
        .map((entry) => ({
          date: String(entry.date || "").slice(0, 10),
          goal: Math.round(parseMacroValue(entry.goal)),
          updatedAt: entry.updatedAt || null,
        }))
        .filter((entry) => entry.date && entry.goal > 0)
        .sort((a, b) => a.date.localeCompare(b.date));
    }
  } catch (error) {
    console.error("Failed to load daily calorie goal history:", error);
  }

  const goal = Math.round(parseMacroValue(fallbackGoal));

  return goal > 0
    ? [
        {
          date: getTodayKey(),
          goal,
        },
      ]
    : [];
}

function saveDailyCalorieGoalHistory(
  history,
  storageKey = DAILY_CALORIE_GOAL_HISTORY_KEY
) {
  localStorage.setItem(storageKey, JSON.stringify(history));
}

function readDailyCreatineLog(storageKey = DAILY_CREATINE_LOG_KEY) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "{}");

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .map(([date, value]) => [String(date).slice(0, 10), Boolean(value)])
        .filter(([date, value]) => date && value)
    );
  } catch (error) {
    console.error("Failed to load daily creatine log:", error);

    return {};
  }
}

function saveDailyCreatineLog(log, storageKey = DAILY_CREATINE_LOG_KEY) {
  localStorage.setItem(storageKey, JSON.stringify(log || {}));
}

function readDailyCreatineReminderEnabled(
  storageKey = DAILY_CREATINE_REMINDER_KEY
) {
  try {
    return localStorage.getItem(storageKey) === "true";
  } catch (error) {
    console.error("Failed to load daily creatine reminder:", error);

    return false;
  }
}

function hasStoredDailyCreatineReminderEnabled(storageKey) {
  try {
    const value = localStorage.getItem(storageKey);

    return value === "true" || value === "false";
  } catch (error) {
    console.error("Failed to check daily creatine reminder:", error);

    return false;
  }
}

function saveDailyCreatineReminderEnabled(enabled, storageKey) {
  localStorage.setItem(storageKey, enabled ? "true" : "false");
}

function normalizeTimeValue(value) {
  const time = String(value || "").trim();

  return /^\d{2}:\d{2}$/.test(time)
    ? time
    : DEFAULT_DAILY_CREATINE_REMINDER_TIME;
}

function readDailyCreatineReminderTime(storageKey) {
  try {
    return normalizeTimeValue(localStorage.getItem(storageKey));
  } catch (error) {
    console.error("Failed to load daily creatine reminder time:", error);

    return DEFAULT_DAILY_CREATINE_REMINDER_TIME;
  }
}

function saveDailyCreatineReminderTime(time, storageKey) {
  localStorage.setItem(storageKey, normalizeTimeValue(time));
}

function isCreatineReminderTime(timestamp = Date.now(), reminderTime) {
  const date = new Date(timestamp);
  const [hours, minutes] = normalizeTimeValue(reminderTime)
    .split(":")
    .map(Number);

  return (
    date.getHours() > hours ||
    (date.getHours() === hours && date.getMinutes() >= minutes)
  );
}

function formatReminderTime(time) {
  const [hours, minutes] = normalizeTimeValue(time).split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;

  return `${displayHours}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

function CreatineTimePickerColumn({ label, onChange, options, value }) {
  const scrollRef = useRef(null);
  const scrollSelectionTimerRef = useRef(null);
  const isUserScrollingRef = useRef(false);
  const hapticValueRef = useRef(value);

  function getCenteredValue() {
    const scroller = scrollRef.current;

    if (!scroller) {
      return null;
    }

    const centerY = scroller.getBoundingClientRect().top + scroller.clientHeight / 2;
    let closestValue = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    scroller.querySelectorAll("[data-time-value]").forEach((option) => {
      const bounds = option.getBoundingClientRect();
      const distance = Math.abs(bounds.top + bounds.height / 2 - centerY);

      if (distance < closestDistance) {
        closestDistance = distance;
        closestValue = Number(option.dataset.timeValue);
      }
    });

    return closestValue;
  }

  function handlePickerScroll() {
    if (!isUserScrollingRef.current) {
      return;
    }

    const centeredValue = getCenteredValue();

    if (centeredValue == null) {
      return;
    }

    if (hapticValueRef.current !== centeredValue) {
      hapticValueRef.current = centeredValue;
      void triggerNativePickerSelectionHaptic();
    }

    window.clearTimeout(scrollSelectionTimerRef.current);
    scrollSelectionTimerRef.current = window.setTimeout(() => {
      isUserScrollingRef.current = false;
      onChange(centeredValue);
    }, 120);
  }

  useEffect(() => {
    const selectedOption = scrollRef.current?.querySelector(
      `[data-time-value="${value}"]`
    );

    selectedOption?.scrollIntoView({ block: "center" });
    hapticValueRef.current = value;
  }, [value]);

  useEffect(
    () => () => window.clearTimeout(scrollSelectionTimerRef.current),
    []
  );

  return (
    <label style={{ display: "grid", gap: "6px", minWidth: 0 }}>
      <span
        style={{
          color: "var(--text-muted)",
          fontSize: "12px",
          textAlign: "center",
        }}
      >
        {label}
      </span>
      <div
        onPointerDown={() => {
          isUserScrollingRef.current = true;
          hapticValueRef.current = value;
        }}
        onScroll={handlePickerScroll}
        onWheel={() => {
          isUserScrollingRef.current = true;
          hapticValueRef.current = value;
        }}
        ref={scrollRef}
        style={{
          border: "1px solid var(--border)",
          borderRadius: "8px",
          height: "174px",
          overflowY: "auto",
          padding: "58px 4px",
          scrollSnapType: "y mandatory",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {options.map((option) => {
          const selected = option.value === value;

          return (
            <button
              aria-pressed={selected}
              data-time-value={option.value}
              key={option.value}
              onClick={() => {
                isUserScrollingRef.current = false;
                window.clearTimeout(scrollSelectionTimerRef.current);
                onChange(option.value);
                void triggerNativePickerSelectionHaptic();
              }}
              style={{
                background: selected ? "#e6f4ea" : "transparent",
                border: selected ? "1px solid #137333" : "1px solid transparent",
                borderRadius: "6px",
                color: selected ? "#137333" : "var(--text)",
                display: "block",
                fontSize: selected ? "20px" : "16px",
                fontWeight: selected ? 700 : 400,
                minHeight: "44px",
                padding: "6px 8px",
                scrollSnapAlign: "center",
                width: "100%",
              }}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </label>
  );
}

function upsertDailyCalorieGoalHistory(history, date, goal) {
  const normalizedGoal = Math.round(parseMacroValue(goal));

  if (!date || !normalizedGoal) {
    return history;
  }

  return [
    ...history.filter((entry) => entry.date !== date),
    {
      date,
      goal: normalizedGoal,
      updatedAt: new Date().toISOString(),
    },
  ].sort((a, b) => a.date.localeCompare(b.date));
}

function normalizeBarcodeSearchQuery(value) {
  const digits = String(value || "").replace(/\D/g, "");
  const text = String(value || "").trim();

  if (digits.length !== text.length) {
    return "";
  }

  return [8, 12, 13, 14].includes(digits.length) ? digits : "";
}

async function createNativeBarcodeDetector() {
  if (typeof window === "undefined" || !("BarcodeDetector" in window)) {
    return null;
  }

  try {
    const BarcodeDetectorConstructor = window.BarcodeDetector;
    const supportedFormats =
      typeof BarcodeDetectorConstructor.getSupportedFormats === "function"
        ? await BarcodeDetectorConstructor.getSupportedFormats()
        : NATIVE_BARCODE_FORMATS;
    const formats = NATIVE_BARCODE_FORMATS.filter((format) =>
      supportedFormats.includes(format)
    );

    if (formats.length === 0) {
      return null;
    }

    return new BarcodeDetectorConstructor({ formats });
  } catch (error) {
    console.warn("Native barcode detector is unavailable:", error);

    return null;
  }
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

function getServingSizeUnit(food) {
  return String(food.servingSizeUnit || "")
    .trim()
    .toLowerCase();
}

function normalizePortionUnit(unit) {
  const normalized = String(unit || "")
    .toLowerCase()
    .replace(/[().]/g, "")
    .trim();

  if (["cake", "cakes"].includes(normalized)) return "cake";
  if (["piece", "pieces", "pc", "pcs"].includes(normalized)) return "piece";
  if (["serving", "servings"].includes(normalized)) return "serving";
  if (["slice", "slices"].includes(normalized)) return "slice";
  if (["container", "containers"].includes(normalized)) return "container";
  if (["bar", "bars"].includes(normalized)) return "bar";
  if (["packet", "packets", "package", "packages"].includes(normalized)) return "packet";
  if (["tbsp", "tablespoon", "tablespoons"].includes(normalized)) return "tbsp";
  if (["tsp", "teaspoon", "teaspoons"].includes(normalized)) return "tsp";
  if (["cup", "cups"].includes(normalized)) return "cup";
  if (["fl oz", "floz", "fluid ounce", "fluid ounces"].includes(normalized)) {
    return "fl-oz";
  }

  return normalized || "";
}

function getPortionUnitLabel(unit, amount = 2) {
  const plural = Number(amount) !== 1;

  switch (unit) {
    case "bar":
      return plural ? "bars" : "bar";
    case "cake":
      return plural ? "cakes" : "cake";
    case "container":
      return plural ? "containers" : "container";
    case "cup":
      return plural ? "cups" : "cup";
    case "fl-oz":
      return "fl oz";
    case "packet":
      return plural ? "packets" : "packet";
    case "piece":
      return plural ? "pieces" : "piece";
    case "serving":
      return plural ? "servings" : "serving";
    case "slice":
      return plural ? "slices" : "slice";
    case "tbsp":
      return "tbsp";
    case "tsp":
      return "tsp";
    default:
      return unit || "servings";
  }
}

function parseHouseholdServing(food) {
  const text = String(food.householdServingFullText || "").trim();
  const match = text.match(/^(\d+(?:\.\d+)?|\d+\s*\/\s*\d+)\s+([a-zA-Z][a-zA-Z\s.]*)/);

  if (!match) {
    return null;
  }

  const rawAmount = match[1].replace(/\s/g, "");
  const amount = rawAmount.includes("/")
    ? rawAmount
        .split("/")
        .map(Number)
        .reduce((numerator, denominator) => numerator / denominator)
    : Number(rawAmount);
  const unit = normalizePortionUnit(match[2]);

  if (!Number.isFinite(amount) || amount <= 0 || !unit) {
    return null;
  }

  return {
    amount,
    unit,
  };
}

function getServingSizeInReferenceUnits(food) {
  const servingSize = Number(food.servingSize);
  const servingUnit = getServingSizeUnit(food);

  if (!Number.isFinite(servingSize) || servingSize <= 0) {
    return null;
  }

  if (["g", "gram", "grams", "grm"].includes(servingUnit)) {
    return servingSize;
  }

  if (["ml", "milliliter", "milliliters", "mlt"].includes(servingUnit)) {
    return servingSize;
  }

  return null;
}

function getServingReferenceMultiplier(food) {
  const servingSize = getServingSizeInReferenceUnits(food);

  return servingSize ? servingSize / 100 : 1;
}

function getFoodServingMacros(food) {
  return scaleMacros(getFoodMacros(food), getServingReferenceMultiplier(food));
}

function getSupplementalFoodMacros(food) {
  return {
    calories: parseMacroValue(food.calories),
    carbs: parseMacroValue(food.carb_grams),
    fat: parseMacroValue(food.fat_grams),
    protein: parseMacroValue(food.protein_grams),
  };
}

function getSupplementalServingDescription(food) {
  const amount = Number(food.serving_size);
  const unit = food.serving_unit || "serving";

  return Number.isFinite(amount) && amount > 0
    ? `${amount} ${getPortionUnitLabel(unit, amount)}`
    : getPortionUnitLabel(unit, 1);
}

function getSupplementalPortionOptions(food) {
  const unit = food.serving_unit || "serving";

  return [
    {
      key: unit,
      label: getPortionUnitLabel(unit),
      servingMultiplier: 1 / (parseMacroValue(food.serving_size) || 1),
    },
    {
      key: "serving",
      label: "servings",
      servingMultiplier: 1,
    },
  ].filter(
    (option, index, options) =>
      options.findIndex((item) => item.key === option.key) === index
  );
}

function getSupplementalRecipeMacros(recipe) {
  const servings = parseMacroValue(recipe.servings_per_recipe) || 1;

  return {
    calories: parseMacroValue(recipe.calories) / servings,
    carbs: parseMacroValue(recipe.carb_grams) / servings,
    fat: parseMacroValue(recipe.fat_grams) / servings,
    protein: parseMacroValue(recipe.protein_grams) / servings,
  };
}

function getSupplementalRecipeServingDescription(recipe) {
  const servingSize = parseMacroValue(recipe.serving_size) || 1;
  const servingUnit = recipe.serving_unit || "serving";
  const servings = parseMacroValue(recipe.servings_per_recipe) || 1;

  return `${servingSize} ${getPortionUnitLabel(
    servingUnit,
    servingSize
  )} of ${servings} ${getPortionUnitLabel("serving", servings)}`;
}

function getSupplementalRecipePortionOptions(recipe) {
  const servingSize = parseMacroValue(recipe.serving_size) || 1;
  const servingUnit = recipe.serving_unit || "serving";

  return [
    {
      key: "serving",
      label: "servings",
      servingMultiplier: 1,
    },
    {
      key: servingUnit,
      label: getPortionUnitLabel(servingUnit),
      servingMultiplier: 1 / servingSize,
    },
  ].filter(
    (option, index, options) =>
      options.findIndex((item) => item.key === option.key) === index
  );
}

function getPortionOptions(food) {
  const servingSize = getServingSizeInReferenceUnits(food);
  const servingUnit = getServingSizeUnit(food);
  const householdServing = parseHouseholdServing(food);
  const options = [
    {
      key: "serving",
      label: "servings",
      servingMultiplier: 1,
    },
  ];
  const optionKeys = new Set(options.map((option) => option.key));

  function addOption(option) {
    if (!option.key || optionKeys.has(option.key)) {
      return;
    }

    optionKeys.add(option.key);
    options.push(option);
  }

  if (householdServing?.unit && householdServing.unit !== "serving") {
    addOption({
      key: householdServing.unit,
      label: getPortionUnitLabel(householdServing.unit),
      servingMultiplier: 1 / householdServing.amount,
    });
  }

  if (servingSize && ["g", "gram", "grams", "grm"].includes(servingUnit)) {
    addOption({
      key: "g",
      label: "grams",
      servingMultiplier: 1 / servingSize,
    });
    addOption({
      key: "oz",
      label: "ounces",
      servingMultiplier: GRAMS_PER_OUNCE / servingSize,
    });
  }

  if (servingSize && ["ml", "milliliter", "milliliters", "mlt"].includes(servingUnit)) {
    addOption({
      key: "ml",
      label: "mL",
      servingMultiplier: 1 / servingSize,
    });
    addOption({
      key: "fl-oz",
      label: "fl oz",
      servingMultiplier: ML_PER_FLUID_OUNCE / servingSize,
    });
    addOption({
      key: "tsp",
      label: "tsp",
      servingMultiplier: ML_PER_TEASPOON / servingSize,
    });
    addOption({
      key: "tbsp",
      label: "tbsp",
      servingMultiplier: ML_PER_TABLESPOON / servingSize,
    });
    addOption({
      key: "cup",
      label: "cups",
      servingMultiplier: ML_PER_CUP / servingSize,
    });
  }

  return options;
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
  const servingSize = getServingSizeInReferenceUnits(food);
  const servingUnit = getServingSizeUnit(food);
  const servingSizeText =
    servingSize && servingUnit ? `${servingSize}${servingUnit}` : "";

  if (food.householdServingFullText) {
    const householdText = food.householdServingFullText;

    return servingSizeText &&
      !householdText.toLowerCase().includes(servingSizeText.toLowerCase())
      ? `${householdText} (${servingSizeText})`
      : householdText;
  }

  if (servingSizeText) {
    return servingSizeText;
  }

  return "100g reference";
}

function getFatSecretFoodKey(food) {
  return String(food?.fatsecretFoodId || food?.fdcId || "")
    .replace(/^fatsecret:/, "")
    .trim();
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

async function searchFatSecretFoods(query) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.functions.invoke("fatsecret-search-foods", {
    body: {
      maxResults: 12,
      query,
    },
  });

  if (error) {
    throw error;
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return {
    foods: Array.isArray(data?.foods) ? data.foods : [],
  };
}

async function autocompleteFatSecretFoods(query) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.functions.invoke("fatsecret-search-foods", {
    body: {
      action: "autocomplete",
      maxResults: 6,
      query,
    },
  });

  if (error) {
    throw error;
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return Array.isArray(data?.suggestions) ? data.suggestions : [];
}

async function fetchFatSecretFoodDetails(foodId) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.functions.invoke("fatsecret-search-foods", {
    body: {
      action: "getFood",
      foodId,
    },
  });

  if (error) {
    throw error;
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data?.food || null;
}

async function searchFatSecretFoodByBarcode(barcode) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured.");
  }

  const { data, error } = await supabase.functions.invoke("fatsecret-search-foods", {
    body: {
      action: "barcode",
      barcode,
    },
  });

  if (error) {
    throw error;
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data?.food || null;
}

function storeHydratedFatSecretFood(food) {
  const key = getFatSecretFoodKey(food);

  if (!key) {
    return;
  }

  return {
    [key]: {
      food,
      status: "loaded",
    },
  };
}

function getFatSecretPortionOptions(food) {
  const servings = Array.isArray(food.fatsecretServings)
    ? food.fatsecretServings
    : [];

  if (servings.length === 0) {
    return getPortionOptions(food);
  }

  const options = servings.map((serving) => ({
    baseMacros: serving.sourceServing || {
      calories: 0,
      carbs: 0,
      fat: 0,
      protein: 0,
    },
    key: serving.key,
    label: serving.label || "serving",
    servingId: serving.servingId || "",
    servingMultiplier: 1,
  }));
  const defaultServing =
    servings.find((serving) => serving.isDefault) || servings[0];
  const baseMacros = defaultServing.sourceServing || {
    calories: 0,
    carbs: 0,
    fat: 0,
    protein: 0,
  };
  const metricAmount = parseMacroValue(defaultServing.metricAmount);
  const metricUnit = String(defaultServing.metricUnit || "").toLowerCase();
  const optionKeys = new Set(options.map((option) => option.key));

  function addDerivedOption(key, label, servingMultiplier) {
    if (!metricAmount || optionKeys.has(key)) {
      return;
    }

    optionKeys.add(key);
    options.push({
      baseMacros,
      key,
      label,
      servingMultiplier,
    });
  }

  if (metricUnit === "g") {
    addDerivedOption("fatsecret:g", "grams", 1 / metricAmount);
    addDerivedOption("fatsecret:oz", "ounces", GRAMS_PER_OUNCE / metricAmount);
  }

  if (metricUnit === "oz") {
    addDerivedOption("fatsecret:oz", "ounces", 1 / metricAmount);
    addDerivedOption(
      "fatsecret:g",
      "grams",
      1 / (metricAmount * GRAMS_PER_OUNCE)
    );
  }

  if (metricUnit === "ml") {
    addDerivedOption("fatsecret:ml", "mL", 1 / metricAmount);
    addDerivedOption(
      "fatsecret:fl-oz",
      "fl oz",
      ML_PER_FLUID_OUNCE / metricAmount
    );
    addDerivedOption("fatsecret:tsp", "tsp", ML_PER_TEASPOON / metricAmount);
    addDerivedOption("fatsecret:tbsp", "tbsp", ML_PER_TABLESPOON / metricAmount);
    addDerivedOption("fatsecret:cup", "cups", ML_PER_CUP / metricAmount);
  }

  return options;
}

function FatSecretAttribution({ justify = "start" }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: justify,
      }}
    >
      <a
        href="https://www.fatsecret.com"
        rel="noreferrer"
        target="_blank"
      >
        <img
          alt="Powered by fatsecret"
          src={FATSECRET_BADGE_URL}
          style={{
            border: 0,
            display: "block",
            height: "24px",
            width: "auto",
          }}
        />
      </a>
    </div>
  );
}

function MacroDonutChart({ segments, totalCalories }) {
  const visibleSegments = segments.filter((segment) => segment.calories > 0);
  let cursor = 0;
  const gradientStops =
    visibleSegments.length > 0
      ? visibleSegments
          .map((segment) => {
            const start = cursor;
            const size = (segment.calories / totalCalories) * 100;
            const end = start + size;
            cursor = end;

            return `${segment.color} ${start}% ${end}%`;
          })
          .join(", ")
      : "var(--surface-muted) 0% 100%";

  return (
    <div
      aria-label="Macro calorie distribution"
      role="img"
      style={{
        alignItems: "center",
        background: `conic-gradient(${gradientStops})`,
        borderRadius: "999px",
        display: "inline-flex",
        height: "112px",
        justifyContent: "center",
        position: "relative",
        width: "112px",
      }}
      title={visibleSegments
        .map((segment) => `${segment.label}: ${Math.round(segment.percent)}%`)
        .join(", ")}
    >
      <div
        style={{
          alignItems: "center",
          background: "var(--surface)",
          borderRadius: "999px",
          display: "grid",
          height: "68px",
          justifyItems: "center",
          width: "68px",
        }}
      >
        <span
          style={{
            color: "var(--text-muted)",
            fontSize: "11px",
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          macros
        </span>
      </div>
    </div>
  );
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

async function searchSupplementalFoodLibrary(query) {
  if (!isSupabaseConfigured || !supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("nutrition_foods")
    .select(
      "id,name,brand,serving_size,serving_unit,calories,protein_grams,carb_grams,fat_grams,source,source_key"
    )
    .is("user_id", null)
    .eq("source", SUPPLEMENTAL_FOOD_SOURCE)
    .is("deleted_at", null)
    .ilike("name", `%${query}%`)
    .order("name")
    .limit(12);

  if (error) {
    throw error;
  }

  return data || [];
}

async function searchSupplementalRecipeLibrary(query) {
  if (!isSupabaseConfigured || !supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("nutrition_recipes")
    .select(
      "id,name,description,serving_size,serving_unit,servings_per_recipe,calories,protein_grams,carb_grams,fat_grams,source,source_key"
    )
    .is("user_id", null)
    .eq("source", SUPPLEMENTAL_RECIPE_SOURCE)
    .is("deleted_at", null)
    .ilike("name", `%${query}%`)
    .order("name")
    .limit(12);

  if (error) {
    throw error;
  }

  return data || [];
}

async function findSupplementalFoodDuplicate(draft) {
  if (!isSupabaseConfigured || !supabase) {
    return null;
  }

  const name = draft.name.trim();

  if (!name) {
    return null;
  }

  const { data, error } = await supabase
    .from("nutrition_foods")
    .select("id,name,brand,serving_size,serving_unit")
    .is("user_id", null)
    .eq("source", SUPPLEMENTAL_FOOD_SOURCE)
    .is("deleted_at", null)
    .ilike("name", name)
    .limit(1);

  if (error) {
    throw error;
  }

  return data?.[0] || null;
}

async function addSupplementalFoodToLibrary(draft, session) {
  assertRemoteWriteAllowed("supplemental-food create");

  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured.");
  }

  if (!session?.user?.id) {
    throw new Error("Sign in before adding foods to the shared library.");
  }

  const { data, error } = await supabase.rpc("add_supplemental_nutrition_food", {
    food_payload: {
      brand: draft.brand.trim() || null,
      calories: Math.round(parseMacroValue(draft.calories)),
      carbs: parseMacroValue(draft.carbs),
      fat: parseMacroValue(draft.fat),
      name: draft.name.trim(),
      protein: parseMacroValue(draft.protein),
      serving_amount: parseMacroValue(draft.servingAmount) || 1,
      serving_unit: draft.servingUnit || "serving",
    },
  });

  if (error) {
    throw error;
  }

  return data;
}

async function updateSupplementalFoodInLibrary(foodId, draft, session) {
  assertRemoteWriteAllowed("supplemental-food update");

  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured.");
  }

  if (!session?.user?.id) {
    throw new Error("Sign in before updating shared library foods.");
  }

  const { data, error } = await supabase.rpc("update_supplemental_nutrition_food", {
    food_payload: {
      brand: draft.brand.trim() || null,
      calories: Math.round(parseMacroValue(draft.calories)),
      carbs: parseMacroValue(draft.carbs),
      fat: parseMacroValue(draft.fat),
      name: draft.name.trim(),
      protein: parseMacroValue(draft.protein),
      serving_amount: parseMacroValue(draft.servingAmount) || 1,
      serving_unit: draft.servingUnit || "serving",
    },
    target_food_id: foodId,
  });

  if (error) {
    throw error;
  }

  return data;
}

async function deleteSupplementalFoodFromLibrary(foodId, session) {
  assertRemoteWriteAllowed("supplemental-food delete");

  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured.");
  }

  if (!session?.user?.id) {
    throw new Error("Sign in before deleting shared library foods.");
  }

  const { data, error } = await supabase.rpc("delete_supplemental_nutrition_food", {
    target_food_id: foodId,
  });

  if (error) {
    throw error;
  }

  return data;
}

async function addSupplementalRecipeToLibrary(recipeDraft, ingredients, session) {
  assertRemoteWriteAllowed("supplemental-recipe create");

  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured.");
  }

  if (!session?.user?.id) {
    throw new Error("Sign in before adding recipes to the shared library.");
  }

  const { data, error } = await supabase.rpc("add_supplemental_nutrition_recipe", {
    ingredients_payload: ingredients.map((ingredient, index) => ({
      amount: parseMacroValue(ingredient.amount) || 1,
      brand: ingredient.brand || null,
      calories: parseMacroValue(ingredient.calories),
      carbs: parseMacroValue(ingredient.carbs),
      external_id: ingredient.externalId || null,
      external_source: ingredient.externalSource || null,
      fat: parseMacroValue(ingredient.fat),
      food_id: ingredient.foodId || null,
      ingredient_name: ingredient.name,
      metadata: {
        serving_description: ingredient.servingDescription || null,
      },
      position: index + 1,
      protein: parseMacroValue(ingredient.protein),
      unit: ingredient.unit || "serving",
    })),
    recipe_payload: {
      description: recipeDraft.description.trim() || null,
      name: recipeDraft.name.trim(),
      serving_size: parseMacroValue(recipeDraft.servingSize) || 1,
      serving_unit: recipeDraft.servingUnit || "serving",
      servings_per_recipe: parseMacroValue(recipeDraft.servingsPerRecipe) || 1,
      source: SUPPLEMENTAL_RECIPE_SOURCE,
    },
  });

  if (error) {
    throw error;
  }

  return data;
}

function buildRecipeIngredientPayload(ingredients) {
  return ingredients.map((ingredient, index) => ({
    amount: parseMacroValue(ingredient.amount) || 1,
    brand: ingredient.brand || null,
    calories: parseMacroValue(ingredient.calories),
    carbs: parseMacroValue(ingredient.carbs),
    external_id: ingredient.externalId || null,
    external_source: ingredient.externalSource || null,
    fat: parseMacroValue(ingredient.fat),
    food_id: ingredient.foodId || null,
    ingredient_name: ingredient.name,
    metadata: {
      serving_description: ingredient.servingDescription || null,
    },
    position: index + 1,
    protein: parseMacroValue(ingredient.protein),
    unit: ingredient.unit || "serving",
  }));
}

function buildRecipePayload(recipeDraft) {
  return {
    description: recipeDraft.description.trim() || null,
    name: recipeDraft.name.trim(),
    serving_size: parseMacroValue(recipeDraft.servingSize) || 1,
    serving_unit: recipeDraft.servingUnit || "serving",
    servings_per_recipe: parseMacroValue(recipeDraft.servingsPerRecipe) || 1,
    source: SUPPLEMENTAL_RECIPE_SOURCE,
  };
}

async function updateSupplementalRecipeInLibrary(
  recipeId,
  recipeDraft,
  ingredients,
  session
) {
  assertRemoteWriteAllowed("supplemental-recipe update");

  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured.");
  }

  if (!session?.user?.id) {
    throw new Error("Sign in before updating shared library recipes.");
  }

  const { data, error } = await supabase.rpc("update_supplemental_nutrition_recipe", {
    ingredients_payload: buildRecipeIngredientPayload(ingredients),
    recipe_payload: buildRecipePayload(recipeDraft),
    target_recipe_id: recipeId,
  });

  if (error) {
    throw error;
  }

  return data;
}

async function deleteSupplementalRecipeFromLibrary(recipeId, session) {
  assertRemoteWriteAllowed("supplemental-recipe delete");

  if (!isSupabaseConfigured || !supabase) {
    throw new Error("Supabase is not configured.");
  }

  if (!session?.user?.id) {
    throw new Error("Sign in before deleting shared library recipes.");
  }

  const { data, error } = await supabase.rpc("delete_supplemental_nutrition_recipe", {
    target_recipe_id: recipeId,
  });

  if (error) {
    throw error;
  }

  return data;
}

async function fetchSupplementalRecipeIngredients(recipeId) {
  if (!isSupabaseConfigured || !supabase) {
    return [];
  }

  const { data, error } = await supabase
    .from("nutrition_recipe_ingredients")
    .select(
      "id,food_id,position,ingredient_name,brand,amount,unit,calories,protein_grams,carb_grams,fat_grams,external_source,external_id,metadata"
    )
    .eq("recipe_id", recipeId)
    .is("deleted_at", null)
    .order("position");

  if (error) {
    throw error;
  }

  return data || [];
}

function createRecipeIngredientFromFdcFood(food) {
  const macros = getFoodServingMacros(food);
  const portionOptions = getPortionOptions(food);
  const unit = portionOptions[0]?.key || "serving";

  return {
    amount: "1",
    baseMacros: macros,
    brand: food.brandName || "",
    calories: macros.calories,
    carbs: macros.carbs,
    externalId: food.fdcId ? String(food.fdcId) : "",
    externalSource: "fdc",
    fat: macros.fat,
    foodId: null,
    id: `ingredient-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: food.brandName
      ? `${food.description} (${food.brandName})`
      : food.description || "",
    portionOptions,
    protein: macros.protein,
    servingDescription: getServingDescription(food),
    sourceLabel: "USDA",
    unit,
  };
}

function createRecipeIngredientFromFatSecretFood(food) {
  const portionOptions = getFatSecretPortionOptions(food);
  const selectedOption = portionOptions[0] || null;
  const macros =
    selectedOption?.baseMacros ||
    (food.source === "fatsecret" ? getFoodMacros(food) : getFoodServingMacros(food));
  const unit = selectedOption?.key || "serving";

  return {
    amount: "1",
    baseMacros: macros,
    brand: food.brandName || "",
    calories: macros.calories,
    carbs: macros.carbs,
    externalId: food.fatsecretFoodId || food.fdcId || "",
    externalSource: "fatsecret",
    fat: macros.fat,
    foodId: null,
    id: `ingredient-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: food.brandName
      ? `${food.description} (${food.brandName})`
      : food.description || "",
    portionOptions,
    protein: macros.protein,
    servingDescription:
      selectedOption?.label || getServingDescription(food) || "serving",
    sourceLabel: "FatSecret",
    unit,
  };
}

function createRecipeIngredientFromLibraryFood(food) {
  const macros = getSupplementalFoodMacros(food);
  const portionOptions = getSupplementalPortionOptions(food);
  const unit = food.serving_unit || "serving";

  return {
    amount: String(food.serving_size || 1),
    baseMacros: macros,
    brand: food.brand || "",
    calories: macros.calories,
    carbs: macros.carbs,
    externalId: food.source_key || food.id || "",
    externalSource: SUPPLEMENTAL_FOOD_SOURCE,
    fat: macros.fat,
    foodId: food.id,
    id: `ingredient-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: food.brand ? `${food.name} (${food.brand})` : food.name || "",
    portionOptions,
    protein: macros.protein,
    servingDescription: getSupplementalServingDescription(food),
    sourceLabel: "Library",
    unit,
  };
}

function createRecipeIngredientFromSavedIngredient(ingredient) {
  const amount = parseMacroValue(ingredient.amount) || 1;
  const unit = ingredient.unit || "serving";
  const macros = {
    calories: parseMacroValue(ingredient.calories),
    carbs: parseMacroValue(ingredient.carb_grams),
    fat: parseMacroValue(ingredient.fat_grams),
    protein: parseMacroValue(ingredient.protein_grams),
  };

  return {
    amount: String(amount),
    baseMacros: scaleMacros(macros, 1 / amount),
    brand: ingredient.brand || "",
    calories: macros.calories,
    carbs: macros.carbs,
    externalId: ingredient.external_id || "",
    externalSource: ingredient.external_source || "snapshot",
    fat: macros.fat,
    foodId: ingredient.food_id || null,
    id: ingredient.id || `ingredient-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: ingredient.ingredient_name || "",
    portionOptions: [
      {
        key: unit,
        label: getPortionUnitLabel(unit),
        servingMultiplier: 1,
      },
    ],
    protein: macros.protein,
    servingDescription: ingredient.metadata?.serving_description || unit,
    sourceLabel: ingredient.external_source === SUPPLEMENTAL_FOOD_SOURCE ? "Library" : "Saved",
    unit,
  };
}

function getIngredientPortionMultiplier(ingredient, amount, unit) {
  const selectedOption = ingredient.portionOptions?.find(
    (option) => option.key === unit
  );

  return parseMacroValue(amount) * (selectedOption?.servingMultiplier || 1);
}

function scaleRecipeIngredient(ingredient, amount, unit) {
  const scaledMacros = scaleMacros(
    ingredient.baseMacros,
    getIngredientPortionMultiplier(ingredient, amount, unit)
  );

  return {
    ...ingredient,
    amount,
    calories: scaledMacros.calories,
    carbs: scaledMacros.carbs,
    fat: scaledMacros.fat,
    protein: scaledMacros.protein,
    unit,
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(new Error("Could not read the recipe image."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function cropImageDataUrl(imageDataUrl, crop) {
  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onerror = () => reject(new Error("Could not crop the recipe image."));
    image.onload = () => {
      const sourceX = Math.max(0, Math.round(image.naturalWidth * crop.x));
      const sourceY = Math.max(0, Math.round(image.naturalHeight * crop.y));
      const sourceWidth = Math.max(
        1,
        Math.round(image.naturalWidth * crop.width)
      );
      const sourceHeight = Math.max(
        1,
        Math.round(image.naturalHeight * crop.height)
      );
      const canvas = document.createElement("canvas");

      canvas.width = sourceWidth;
      canvas.height = sourceHeight;
      canvas
        .getContext("2d")
        ?.drawImage(
          image,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          sourceWidth,
          sourceHeight
        );

      resolve(canvas.toDataURL("image/jpeg", 0.92));
    };
    image.src = imageDataUrl;
  });
}

function normalizeOcrFractionArtifacts(line) {
  return String(line || "")
    .replace(/^for[’']?\s*/i, "")
    .replace(
      new RegExp(`^2\\s+(?=cup\\b)`, "i"),
      "1/2 "
    )
    .replace(
      new RegExp(`^15\\s+(?=${RECIPE_OCR_UNIT_PATTERN}\\b)`, "i"),
      "1/2 "
    )
    .replace(
      new RegExp(`^145\\s+(?=${RECIPE_OCR_UNIT_PATTERN}\\b)`, "i"),
      "1/2 "
    )
    .replace(
      new RegExp(`^12\\s+(?=${RECIPE_OCR_UNIT_PATTERN}\\b)`, "i"),
      "1/2 "
    )
    .replace(
      new RegExp(`^Y2\\s+(?=${RECIPE_OCR_UNIT_PATTERN}\\b)`, "i"),
      "1/2 "
    )
    .replace(
      new RegExp(`^¥2\\s+(?=${RECIPE_OCR_UNIT_PATTERN}\\b)`, "i"),
      "1/2 "
    )
    .replace(
      new RegExp(`^V4\\s+(?=${RECIPE_OCR_UNIT_PATTERN}\\b)`, "i"),
      "1/4 "
    )
    .replace(
      new RegExp(`^Ys\\s+(?=${RECIPE_OCR_UNIT_PATTERN}\\b)`, "i"),
      "1/4 "
    )
    .replace(
      new RegExp(`^¥s\\s+(?=${RECIPE_OCR_UNIT_PATTERN}\\b)`, "i"),
      "1/4 "
    )
    .replace(
      new RegExp(`^[\\\"'>]+\\s+(?=${RECIPE_OCR_UNIT_PATTERN}\\b)`, "i"),
      "1/2 "
    )
    .replace(
      new RegExp(`^3\\s+(?=cup\\b)`, "i"),
      "3/4 "
    )
    .replace(
      new RegExp(`^1\\s+%\\s+(?=${RECIPE_OCR_UNIT_PATTERN}\\b)`, "i"),
      "1 1/4 "
    )
    .replace(
      new RegExp(`^(?:1\\s+)?%\\s+(?=${RECIPE_OCR_UNIT_PATTERN}\\b)`, "i"),
      "1/2 "
    );
}

function normalizeOcrTextLine(line) {
  const normalized = String(line || "")
    .replace(/[•·]/g, "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/^\s*\|\s*/i, "")
    .replace(/^\s*(?:\[\s*\||\[\s*\]|\|\s*\]|\(\s*\)|☐|□|0)\s*/i, "")
    .replace(/(\d)([¼½¾⅓⅔⅛⅜⅝⅞])/g, "$1 $2")
    .replace(/(\d+)-(\d+\/\d+)/g, "$1 $2")
    .replace(/^[¥%yY]\s+(?=(?:cup|cups|teaspoon|teaspoons|tsp|tablespoon|tablespoons|tbsp)\b)/i, "1/2 ")
    .replace(/\b[¥%]\s+(?=(?:cup|cups|teaspoon|teaspoons|tsp|tablespoon|tablespoons|tbsp)\b)/i, "1/2 ")
    .replace(/\b[VvYy]4\s+(?=(?:cup|cups|teaspoon|teaspoons|tsp|tablespoon|tablespoons|tbsp)\b)/i, "1/4 ")
    .replace(/\b[¥Yy]2\s+(?=(?:cup|cups|teaspoon|teaspoons|tsp|tablespoon|tablespoons|tbsp)\b)/i, "1/2 ")
    .replace(/\b[¥Yy]s\s+(?=(?:cup|cups|teaspoon|teaspoons|tsp|tablespoon|tablespoons|tbsp)\b)/i, "1/4 ")
    .replace(/\b3[¥%]\s+(?=(?:cup|cups|teaspoon|teaspoons|tsp|tablespoon|tablespoons|tbsp)\b)/i, "3/4 ")
    .replace(/\s+/g, " ")
    .trim();

  return normalizeOcrFractionArtifacts(normalized);
}

function parseOcrAmountText(value) {
  const normalized = String(value || "")
    .replace(/[¼]/g, " 1/4")
    .replace(/[½]/g, " 1/2")
    .replace(/[¾]/g, " 3/4")
    .replace(/[⅓]/g, " 1/3")
    .replace(/[⅔]/g, " 2/3")
    .replace(/[⅛]/g, " 1/8")
    .replace(/[⅜]/g, " 3/8")
    .replace(/[⅝]/g, " 5/8")
    .replace(/[⅞]/g, " 7/8")
    .trim();

  if (!normalized) {
    return "";
  }

  const total = normalized.split(/\s+/).reduce((sum, part) => {
    if (/^\d+\/\d+$/.test(part)) {
      const [numerator, denominator] = part.split("/").map(Number);

      return denominator ? sum + numerator / denominator : sum;
    }

    const parsed = Number(part);

    return Number.isFinite(parsed) ? sum + parsed : sum;
  }, 0);

  return total ? String(Number(total.toFixed(3))) : normalized;
}

function extractRecipeServingsFromOcrLine(line) {
  const match = line.match(/\b(?:serves|servings|yield|makes)\s*:?\s*(\d+(?:\.\d+)?)/i);

  return match ? match[1] : "";
}

function stripOcrIngredientNotes(value) {
  return String(value || "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\bsee\s+tip\b.*$/i, "")
    .replace(/^(?:(?:fine|finely|freshly|roughly|coarsely|shelled|chopped|diced|minced|sliced|ground|large|ripe|ey)\s+)+/i, "")
    .replace(/,\s*(?:chopped|diced|minced|sliced|thinly sliced|divided|plus more.*|to taste).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function simplifyOcrSearchIngredient(value) {
  const stripped = stripOcrIngredientNotes(removeOcrSuchAsClause(value));

  if (/,/.test(stripped)) {
    return stripped.split(",")[0].trim();
  }

  return stripped.replace(/\s+\bor\b\s+.+$/i, "").trim();
}

function removeOcrSuchAsClause(value) {
  return String(value || "")
    .replace(/\s*\(optional\).*$/i, "")
    .replace(/,\s*such as\s+.*$/i, "")
    .replace(/\s+such as\s+.*$/i, "")
    .trim();
}

function isLikelyOcrJunkLine(line) {
  const normalized = String(line || "").trim();

  if (!normalized) {
    return true;
  }

  if (/^[^\w¼½¾⅓⅔⅛⅜⅝⅞]+$/.test(normalized)) {
    return true;
  }

  if (/^[A-Z£$€¥]{1,3}\)?$/i.test(normalized) && normalized.length <= 4) {
    return true;
  }

  if (/^[£$€¥]?\d{1,3}$/.test(normalized)) {
    return true;
  }

  if (/^re\)?$/i.test(normalized)) {
    return true;
  }

  if (/^j$/i.test(normalized)) {
    return true;
  }

  return false;
}

function shouldMergeOcrLineWithPrevious(line, previousLine) {
  if (!previousLine) {
    return false;
  }

  if (/^(ingredients?|yield|scale|convert)\b/i.test(line)) {
    return false;
  }

  if (/^(?:\d+(?:\.\d+)?|\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞])\b/.test(line)) {
    return /(?:\bor\b|,|\(|-)$/.test(previousLine);
  }

  return (
    /^[a-z(]/.test(line) ||
    /^(?:as|or|such as)\b/i.test(line) ||
    /^(?:black|white|red|fine|fresh|freshly|ground|pumpkin)\b/i.test(line)
  );
}

function mergeOcrIngredientLines(lines) {
  return lines.reduce((merged, line) => {
    const previous = merged[merged.length - 1] || "";

    if (shouldMergeOcrLineWithPrevious(line, previous)) {
      const separator = previous.endsWith("-") ? "" : " ";
      merged[merged.length - 1] = `${previous}${separator}${line}`.replace(
        /-\s+/g,
        ""
      );
      return merged;
    }

    merged.push(line);
    return merged;
  }, []);
}

function extractPreferredGramIngredient(line) {
  const gramsMatch = line.match(
    /(?:^|[\s/])(\d+(?:\.\d+)?)\s*(?:g|grams?)\s+(.+)$/i
  );

  if (!gramsMatch) {
    return null;
  }

  const ingredient = simplifyOcrSearchIngredient(
    gramsMatch[2]
      .replace(/\s+\bor\b\s+(?:\d+(?:\.\d+)?|\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞]).*$/i, "")
      .replace(/\s+\(.*$/i, "")
  );

  return ingredient
    ? {
        amount: gramsMatch[1],
        ingredient,
        originalLine: line,
        unit: "g",
      }
    : null;
}

function extractPreferredOunceIngredient(line) {
  const ounceMatch = line.match(
    /^(?:(?:\d+(?:\.\d+)?|\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞])(?:\s+(?:\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞]))?\s+\w+\s+)?\((\d+(?:\.\d+)?)\s*(?:oz|ounces?)\)\s+(.+)$/i
  );

  if (!ounceMatch) {
    return null;
  }

  const ingredient = simplifyOcrSearchIngredient(ounceMatch[2]);

  return ingredient
    ? {
        amount: ounceMatch[1],
        ingredient,
        originalLine: line,
        unit: "oz",
      }
    : null;
}

function extractCountIngredient(line) {
  const countMatch = line.match(/^(\d+(?:\.\d+)?)\s+(?:large|medium|small)?\s*(eggs?)\b/i);

  if (!countMatch) {
    return null;
  }

  return {
    amount: countMatch[1],
    ingredient: countMatch[2].toLowerCase(),
    originalLine: line,
    unit: "serving",
  };
}

function extractGarlicCloveIngredient(line) {
  const garlicMatch = line.match(/^(\d+(?:\.\d+)?)\s+(?:garlic\s+cloves?|cloves?\s+garlic)\b/i);

  if (!garlicMatch) {
    return null;
  }

  return {
    amount: garlicMatch[1],
    ingredient: "garlic",
    originalLine: line,
    unit: "clove",
  };
}

function extractSliceIngredient(line) {
  const sliceMatch = line.match(
    /^(\d+(?:\.\d+)?)\s+\([^)]*\)\s+slices?\s+(?:from\s+)?(?:an?\s+)?(.+)$/i
  );

  if (!sliceMatch) {
    return null;
  }

  const ingredient = simplifyOcrSearchIngredient(sliceMatch[2]);

  return ingredient
    ? {
        amount: sliceMatch[1],
        ingredient,
        originalLine: line,
        unit: "slice",
      }
    : null;
}

function parseOcrIngredientLine(line) {
  const normalizedLine = normalizeOcrTextLine(line);

  if (
    normalizedLine.length < 3 ||
    normalizedLine.length > 140 ||
    RECIPE_OCR_SKIP_LINE_PATTERN.test(normalizedLine) ||
    /\(optional\)/i.test(normalizedLine)
  ) {
    return null;
  }

  const gramIngredient = extractPreferredGramIngredient(normalizedLine);

  if (gramIngredient) {
    return gramIngredient;
  }

  const ounceIngredient = extractPreferredOunceIngredient(normalizedLine);

  if (ounceIngredient) {
    return ounceIngredient;
  }

  const countIngredient = extractCountIngredient(normalizedLine);

  if (countIngredient) {
    return countIngredient;
  }

  const garlicCloveIngredient = extractGarlicCloveIngredient(normalizedLine);

  if (garlicCloveIngredient) {
    return garlicCloveIngredient;
  }

  const sliceIngredient = extractSliceIngredient(normalizedLine);

  if (sliceIngredient) {
    return sliceIngredient;
  }

  const amountMatch = normalizedLine.match(
    /^((?:\d+(?:\.\d+)?|\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞])(?:\s+(?:\d+\/\d+|[¼½¾⅓⅔⅛⅜⅝⅞]))?)\s+([a-zA-Z-]+)?\s*(.+)$/
  );

  if (amountMatch) {
    const possibleUnit = String(amountMatch[2] || "").toLowerCase();
    const hasUnit = RECIPE_OCR_INGREDIENT_UNITS.has(possibleUnit);
    const ingredient = stripOcrIngredientNotes(
      hasUnit ? amountMatch[3] : [amountMatch[2], amountMatch[3]].filter(Boolean).join(" ")
    );

    return ingredient
      ? {
          amount: parseOcrAmountText(amountMatch[1]),
          ingredient,
          originalLine: normalizedLine,
          unit: hasUnit ? possibleUnit : "",
        }
      : null;
  }

  if (/^(kosher|fine|fresh|freshly|ground|black|white|red)\s/i.test(normalizedLine)) {
    return {
      amount: "",
      ingredient: stripOcrIngredientNotes(normalizedLine),
      originalLine: normalizedLine,
      unit: "",
    };
  }

  if (/^[a-z][a-z\s,'-]{3,80}$/i.test(normalizedLine)) {
    const ingredient = simplifyOcrSearchIngredient(normalizedLine);

    return ingredient
      ? {
          amount: "",
          ingredient,
          originalLine: normalizedLine,
          unit: "",
        }
      : null;
  }

  return null;
}

function parseRecipeFromOcrText(text) {
  const rawLines = String(text || "")
    .split(/\r?\n/)
    .map(normalizeOcrTextLine)
    .filter((line) => !isLikelyOcrJunkLine(line));
  const lines = mergeOcrIngredientLines(rawLines);
  const ingredients = [];
  let recipeName = "";
  let servings = "";

  lines.forEach((line, index) => {
    if (!servings) {
      servings = extractRecipeServingsFromOcrLine(line);
    }

    const ingredient = parseOcrIngredientLine(line);

    if (ingredient) {
      ingredients.push(ingredient);
    } else if (!recipeName && index < 5 && line.length > 4 && line.length < 80) {
      recipeName = line;
    }
  });

  return {
    ingredients,
    recipeName,
    servings,
  };
}

async function recognizeRecipeTextFromImage(imageDataUrl, onProgress) {
  const tesseract = await import("tesseract.js");
  const createWorker = tesseract.createWorker || tesseract.default?.createWorker;
  const psm = tesseract.PSM || tesseract.default?.PSM || {};

  if (!createWorker) {
    throw new Error("Local OCR could not be loaded.");
  }

  const worker = await createWorker("eng", 1, {
    logger: (message) => {
      if (message?.status) {
        const percent = Number.isFinite(message.progress)
          ? Math.round(message.progress * 100)
          : null;

        onProgress?.(
          percent === null
            ? `OCR: ${message.status}...`
            : `OCR: ${message.status} ${percent}%...`
        );
      }
    },
  });

  try {
    await worker.setParameters({
      preserve_interword_spaces: "1",
      tessedit_pageseg_mode: psm.SPARSE_TEXT || "11",
    });

    const {
      data: { text },
    } = await worker.recognize(imageDataUrl);

    return text || "";
  } finally {
    await worker.terminate();
  }
}

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    window.clearTimeout(timeoutId);
  });
}

function formatRecipeImageImportError(error) {
  return error?.message || "Recipe image import failed.";
}

function normalizeImportedIngredientUnit(unit) {
  const normalized = String(unit || "").toLowerCase().replace(/\./g, "").trim();
  const aliases = {
    c: "cup",
    cups: "cup",
    fluidounce: "fl-oz",
    fluidounces: "fl-oz",
    floz: "fl-oz",
    gram: "g",
    grams: "g",
    lbs: "lb",
    milliliter: "ml",
    milliliters: "ml",
    ounce: "oz",
    ounces: "oz",
    tablespoon: "tbsp",
    tablespoons: "tbsp",
    teaspoon: "tsp",
    teaspoons: "tsp",
  };

  return aliases[normalized.replace(/\s+/g, "")] || normalized;
}

function applyImportedIngredientAmount(ingredient, importedIngredient) {
  const amount = String(importedIngredient.amount || "").trim();
  const normalizedUnit = normalizeImportedIngredientUnit(importedIngredient.unit);
  const matchingOption = ingredient.portionOptions?.find(
    (option) => option.key === normalizedUnit
  );

  if (!amount) {
    return ingredient;
  }

  if (matchingOption) {
    return scaleRecipeIngredient(ingredient, amount, matchingOption.key);
  }

  return {
    ...ingredient,
    importOriginalLine: importedIngredient.originalLine || "",
    importUnitWarning: importedIngredient.unit
      ? `Check unit: parsed "${importedIngredient.unit}", matched serving "${ingredient.servingDescription}".`
      : "",
  };
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

function getGoalForDate(goalHistory, date, fallbackGoal = "") {
  const fallback = Math.round(parseMacroValue(fallbackGoal));
  const candidates = goalHistory
    .filter((entry) => entry.date <= date)
    .sort((a, b) => b.date.localeCompare(a.date));

  return candidates[0]?.goal || fallback || 0;
}

function buildDailyCalorieRows(entries, goalHistory, fallbackGoal = "") {
  const rowsByDate = new Map();

  entries.forEach((entry) => {
    if (!entry.date) {
      return;
    }

    const current = rowsByDate.get(entry.date) || {
      calories: 0,
      carbs: 0,
      date: entry.date,
      fat: 0,
      hasEntries: false,
      protein: 0,
    };

    rowsByDate.set(entry.date, {
      ...current,
      calories: current.calories + parseMacroValue(entry.calories),
      carbs: current.carbs + parseMacroValue(entry.carbs),
      fat: current.fat + parseMacroValue(entry.fat),
      hasEntries: true,
      protein: current.protein + parseMacroValue(entry.protein),
    });
  });

  const today = getTodayKey();

  if (!rowsByDate.has(today)) {
    rowsByDate.set(today, {
      calories: 0,
      carbs: 0,
      date: today,
      fat: 0,
      hasEntries: false,
      protein: 0,
    });
  }

  return [...rowsByDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      ...row,
      goal: getGoalForDate(goalHistory, row.date, fallbackGoal),
    }));
}

function filterCalorieRowsByRange(rows, rangeDays) {
  const datedRows = rows.filter((row) => row.date);

  if (!rangeDays || datedRows.length === 0) {
    return datedRows;
  }

  const lastDate = datedRows[datedRows.length - 1].date;
  const filtered = datedRows.filter(
    (row) => daysBetween(row.date, lastDate) <= rangeDays
  );

  return filtered.length > 0 ? filtered : [datedRows[datedRows.length - 1]];
}

function fillMissingCalorieDays(rows, goalHistory, fallbackGoal = "") {
  if (rows.length === 0) {
    return rows;
  }

  const rowsByDate = new Map(rows.map((row) => [row.date, row]));
  const firstDate = rows[0].date;
  const lastDate = rows[rows.length - 1].date;
  const dayCount = Math.max(0, daysBetween(firstDate, lastDate));

  return Array.from({ length: dayCount + 1 }, (_, index) => {
    const date = addDays(firstDate, index);
    const existing = rowsByDate.get(date);

    if (existing) {
      return existing;
    }

    return {
      calories: 0,
      carbs: 0,
      date,
      fat: 0,
      goal: getGoalForDate(goalHistory, date, fallbackGoal),
      hasEntries: false,
      protein: 0,
    };
  });
}

function getCalorieGoalStatusColor(calories, goal, tolerancePercent) {
  const normalizedGoal = parseMacroValue(goal);

  if (!normalizedGoal) {
    return MACRO_COLORS.calories;
  }

  const toleranceRatio = Math.max(0, parseMacroValue(tolerancePercent)) / 100;
  const lowerBound = normalizedGoal * (1 - toleranceRatio);
  const upperBound = normalizedGoal * (1 + toleranceRatio);

  if (calories < lowerBound) {
    return "#f9a825";
  }

  if (calories > upperBound) {
    return "#c62828";
  }

  return "#2e7d32";
}

function CalorieHistoryChart({ calorieGoal, goalHistory, rangeDays, rows }) {
  const [chartMode, setChartMode] = useState("macros");
  const [selectedDate, setSelectedDate] = useState(null);
  const [tolerancePercent, setTolerancePercent] = useState("5");
  const points = fillMissingCalorieDays(
    filterCalorieRowsByRange(rows, rangeDays),
    goalHistory,
    calorieGoal
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
          justifyContent: "center",
          minHeight: "150px",
          padding: "12px",
        }}
      >
        No calorie history yet
      </div>
    );
  }

  const width = 360;
  const height = 240;
  const paddingLeft = 42;
  const paddingRight = 16;
  const paddingTop = 22;
  const paddingBottom = 32;
  const plotWidth = width - paddingLeft - paddingRight;
  const plotHeight = height - paddingTop - paddingBottom;
  const rawMaxValue = Math.max(
    100,
    DAILY_PROTEIN_TARGET_CALORIES,
    ...points.map((row) => Math.max(row.calories, row.goal || 0))
  );
  const maxValue = Math.ceil((rawMaxValue * 1.1) / 100) * 100;
  const slotWidth = plotWidth / points.length;
  const barGap = points.length > 16 ? 2 : 5;
  const barWidth = Math.max(1, slotWidth - barGap);
  const firstDate = points[0].date;
  const lastDate = points[points.length - 1].date;
  const selectedPoint =
    points.find((point) => point.date === selectedDate) || points[points.length - 1];
  const currentGoal = points[points.length - 1]?.goal || 0;
  const currentGoalY =
    height - paddingBottom - (currentGoal / maxValue) * plotHeight;
  const proteinTargetY =
    height -
    paddingBottom -
    (DAILY_PROTEIN_TARGET_CALORIES / maxValue) * plotHeight;
  const selectedIndex = points.findIndex((point) => point.date === selectedPoint.date);
  const selectedX =
    paddingLeft +
    selectedIndex * slotWidth +
    slotWidth / 2;
  const selectedY =
    height -
    paddingBottom -
    (Math.max(selectedPoint.calories, selectedPoint.goal || 0) / maxValue) *
      plotHeight;
  const selectedIndicatorColor =
    chartMode === "goal"
      ? getCalorieGoalStatusColor(
          selectedPoint.calories,
          selectedPoint.goal,
          tolerancePercent
        )
      : MACRO_COLORS.calories;
  const targetPoints = points.map((row, index) => {
    const x =
      paddingLeft +
      index * slotWidth +
      slotWidth / 2;
    const y =
      height - paddingBottom - ((row.goal || 0) / maxValue) * plotHeight;

    return `${x},${y}`;
  });
  const selectedMacroCalories = {
    carbs: selectedPoint.carbs * 4,
    fat: selectedPoint.fat * 9,
    protein: selectedPoint.protein * 4,
  };
  const selectedTotalMacroCalories =
    selectedMacroCalories.protein +
    selectedMacroCalories.carbs +
    selectedMacroCalories.fat;
  const selectedMacroSegments = [
    {
      calories: selectedMacroCalories.protein,
      color: MACRO_COLORS.protein,
      label: "Protein",
      percent: selectedTotalMacroCalories
        ? (selectedMacroCalories.protein / selectedTotalMacroCalories) * 100
        : 0,
      value: formatMacro(selectedPoint.protein),
    },
    {
      calories: selectedMacroCalories.carbs,
      color: MACRO_COLORS.carbs,
      label: "Carbs",
      percent: selectedTotalMacroCalories
        ? (selectedMacroCalories.carbs / selectedTotalMacroCalories) * 100
        : 0,
      value: formatMacro(selectedPoint.carbs),
    },
    {
      calories: selectedMacroCalories.fat,
      color: MACRO_COLORS.fat,
      label: "Fat",
      percent: selectedTotalMacroCalories
        ? (selectedMacroCalories.fat / selectedTotalMacroCalories) * 100
        : 0,
      value: formatMacro(selectedPoint.fat),
    },
  ];

  return (
    <div
      style={{
        background: "var(--surface-muted)",
        border: "1px solid var(--border)",
        borderRadius: "8px",
        display: "grid",
        gap: "10px",
        padding: "8px",
      }}
    >
      <svg
        aria-label="Daily calorie chart"
        onClick={() => setSelectedDate(null)}
        role="img"
        viewBox={`0 0 ${width} ${height}`}
        style={{
          aspectRatio: "3 / 2",
          display: "block",
          width: "100%",
        }}
      >
        <rect x="0" y="0" width={width} height={height} fill="transparent" />
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
          {formatMacro(maxValue, "cal")}
        </text>
        {currentGoal > 0 && (
          <>
            <line
              x1={paddingLeft - 4}
              x2={paddingLeft}
              y1={currentGoalY}
              y2={currentGoalY}
              stroke="var(--text-muted)"
            />
            <text
              x={paddingLeft - 8}
              y={currentGoalY + 4}
              fill="var(--text-muted)"
              fontSize="10"
              textAnchor="end"
            >
              {formatMacro(currentGoal, "cal")}
            </text>
          </>
        )}
        {chartMode === "macros" && (
          <>
            <line
              x1={paddingLeft - 4}
              x2={paddingLeft}
              y1={proteinTargetY}
              y2={proteinTargetY}
              stroke={MACRO_COLORS.protein}
            />
            <text
              x={paddingLeft - 8}
              y={proteinTargetY + 4}
              fill={MACRO_COLORS.protein}
              fontSize="10"
              textAnchor="end"
            >
              {formatMacro(DAILY_PROTEIN_TARGET_CALORIES, "cal")}
            </text>
          </>
        )}
        <text
          x={paddingLeft - 8}
          y={height - paddingBottom + 4}
          fill="var(--text-muted)"
          fontSize="10"
          textAnchor="end"
        >
          0
        </text>
        {points.map((row, index) => {
          const x = paddingLeft + index * slotWidth + (slotWidth - barWidth) / 2;
          const barHeight = (row.calories / maxValue) * plotHeight;
          const y = height - paddingBottom - barHeight;
          const goalStatusColor = getCalorieGoalStatusColor(
            row.calories,
            row.goal,
            tolerancePercent
          );
          const macroCalories = {
            carbs: row.carbs * 4,
            fat: row.fat * 9,
            protein: row.protein * 4,
          };
          const totalMacroCalories =
            macroCalories.protein + macroCalories.carbs + macroCalories.fat;
          const macroSegments = [
            ["protein", macroCalories.protein, MACRO_COLORS.protein],
            ["carbs", macroCalories.carbs, MACRO_COLORS.carbs],
            ["fat", macroCalories.fat, MACRO_COLORS.fat],
          ].filter(([, calories]) => calories > 0);
          let stackedHeight = 0;

          return (
            <g
              key={row.date}
              aria-label={`${row.date}: ${formatMacro(row.calories, "cal")} calories`}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedDate(row.date);
              }}
              opacity={selectedDate && selectedDate !== row.date ? 0.42 : 0.9}
              role="button"
              style={{ cursor: "pointer" }}
            >
              {!row.hasEntries ? null : chartMode === "goal" ? (
                <rect
                  fill={goalStatusColor}
                  height={Math.max(1, barHeight)}
                  rx="2"
                  width={barWidth}
                  x={x}
                  y={y}
                />
              ) : macroSegments.length > 0 ? (
                macroSegments.map(([macro, calories, color], segmentIndex) => {
                  const isLastSegment =
                    segmentIndex === macroSegments.length - 1;
                  const segmentHeight = isLastSegment
                    ? barHeight - stackedHeight
                    : (calories / totalMacroCalories) * barHeight;
                  const segmentY =
                    height - paddingBottom - stackedHeight - segmentHeight;

                  stackedHeight += segmentHeight;

                  return (
                    <rect
                      key={macro}
                      fill={color}
                      height={Math.max(1, segmentHeight)}
                      rx="2"
                      width={barWidth}
                      x={x}
                      y={segmentY}
                    />
                  );
                })
              ) : (
                <rect
                  fill="var(--border)"
                  height={Math.max(1, barHeight)}
                  rx="2"
                  width={barWidth}
                  x={x}
                  y={y}
                />
              )}
            </g>
          );
        })}
        {points.some((row) => row.goal > 0) && (
          <polyline
            fill="none"
            points={targetPoints.join(" ")}
            stroke="#111827"
            strokeDasharray="5 4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        )}
        {chartMode === "macros" && (
          <line
            x1={paddingLeft}
            x2={width - paddingRight}
            y1={proteinTargetY}
            y2={proteinTargetY}
            stroke={MACRO_COLORS.protein}
            strokeDasharray="2 4"
            strokeLinecap="round"
            strokeWidth="2"
          />
        )}
        {selectedPoint && (
          <g pointerEvents="none">
            <line
              x1={selectedX}
              x2={selectedX}
              y1={paddingTop}
              y2={height - paddingBottom}
              stroke="color-mix(in srgb, #1769aa 45%, var(--border))"
              strokeDasharray="4 4"
            />
            <circle cx={selectedX} cy={selectedY} fill={selectedIndicatorColor} r="3.5" />
          </g>
        )}
        <text x={paddingLeft} y={height - 7} fill="var(--text-muted)" fontSize="10">
          {firstDate}
        </text>
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

      <div
        style={{
          alignItems: "center",
          display: "grid",
          gap: "8px",
          gridTemplateColumns: "minmax(0, 1fr) 108px",
        }}
      >
        <div
          aria-label="Calorie chart display"
          role="group"
          style={{
            background: "var(--surface-raised)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            display: "grid",
            gap: "4px",
            gridTemplateColumns: "1fr 1fr",
            padding: "4px",
          }}
        >
          {[
            ["macros", "Macros"],
            ["goal", "Goal"],
          ].map(([mode, label]) => {
            const active = chartMode === mode;

            return (
              <button
                key={mode}
                aria-pressed={active}
                onClick={() => setChartMode(mode)}
                type="button"
                style={{
                  background: active ? "var(--accent)" : "transparent",
                  border: "1px solid transparent",
                  borderRadius: "6px",
                  color: active ? "white" : "var(--text-muted)",
                  minHeight: "34px",
                  padding: "6px 8px",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <label
          style={{
            alignItems: "center",
            background: "var(--surface-raised)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            display: "flex",
            gap: "6px",
            padding: "4px 8px",
          }}
        >
          <input
            aria-label="Calorie goal tolerance percent"
            inputMode="decimal"
            min="0"
            onChange={(event) => setTolerancePercent(event.target.value)}
            step="0.5"
            type="number"
            value={tolerancePercent}
            style={{
              boxSizing: "border-box",
              minHeight: "34px",
              minWidth: 0,
              textAlign: "right",
              width: "100%",
            }}
          />
          <span
            aria-hidden="true"
            style={{
              color: "var(--text-muted)",
              fontSize: "13px",
            }}
          >
            %
          </span>
        </label>
      </div>

      <div
        style={{
          alignItems: "center",
          background: "var(--surface-raised)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          display: "grid",
          gap: "10px",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          padding: "10px",
        }}
      >
        <div
          style={{
            display: "grid",
            gap: "8px",
            minWidth: 0,
          }}
        >
          <div>
            <strong>{selectedPoint.date}</strong>
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "12px",
                marginTop: "2px",
              }}
            >
              {formatMacro(selectedPoint.calories, "cal")} cal · Goal{" "}
              {selectedPoint.goal ? formatMacro(selectedPoint.goal, "cal") : "--"} cal
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gap: "5px",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            }}
          >
            {[
              ["Protein", selectedPoint.protein, MACRO_COLORS.protein],
              ["Carbs", selectedPoint.carbs, MACRO_COLORS.carbs],
              ["Fat", selectedPoint.fat, MACRO_COLORS.fat],
            ].map(([label, value, color]) => (
              <div
                key={label}
                style={{
                  color: "var(--text-muted)",
                  fontSize: "11px",
                  minWidth: 0,
                }}
              >
                <span style={{ color }}>{label}</span>
                <strong
                  style={{
                    color: "var(--text-h)",
                    display: "block",
                    fontSize: "14px",
                    marginTop: "2px",
                  }}
                >
                  {formatMacro(value)}
                </strong>
              </div>
            ))}
          </div>
        </div>
        <MacroDonutChart
          segments={selectedMacroSegments}
          totalCalories={selectedTotalMacroCalories}
        />
      </div>
    </div>
  );
}

function CalorieHistorySheet({
  calorieGoal,
  entries,
  goalHistory,
  onClose,
  onSelectDate,
}) {
  const [chartSettings, setChartSettings] = useState(getStoredCalorieChartSettings);
  const [rangeSheetOpen, setRangeSheetOpen] = useState(false);
  const rows = useMemo(
    () => buildDailyCalorieRows(entries, goalHistory, calorieGoal),
    [calorieGoal, entries, goalHistory]
  );
  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => b.date.localeCompare(a.date)),
    [rows]
  );
  const { rangeDays } = chartSettings;
  const rangeLabel = getOptionLabel(RANGE_OPTIONS, rangeDays);

  function updateChartSettings(nextSettings) {
    setChartSettings((currentSettings) => {
      const updatedSettings = {
        ...currentSettings,
        ...nextSettings,
      };

      saveStoredCalorieChartSettings(updatedSettings);

      return updatedSettings;
    });
  }

  return (
    <div
      aria-label="Calorie history"
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
            <Target size={18} color={MACRO_COLORS.calories} />
            Calories
          </h2>
          <div
            style={{
              alignItems: "center",
              display: "flex",
              gap: "6px",
            }}
          >
            <button
              aria-label={`Set calorie range, current ${rangeLabel}`}
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
              aria-label="Close calorie history"
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

        <CalorieHistoryChart
          calorieGoal={calorieGoal}
          goalHistory={goalHistory}
          rangeDays={rangeDays}
          rows={rows}
        />

        <div
          style={{
            color: "var(--text-muted)",
            fontSize: "12px",
          }}
        >
          Use Macros for stacked nutrient calories or Goal for tolerance coloring.
          The black dashed line shows the daily target. The green dotted line
          shows the 200g protein target as 800 calories.
        </div>

        <div
          style={{
            display: "grid",
            gap: "8px",
          }}
        >
          {sortedRows.map((row) => {
            const remaining = row.goal ? row.goal - row.calories : 0;

            return (
              <button
                key={row.date}
                onClick={() => onSelectDate?.(row.date)}
                style={{
                  alignItems: "center",
                  background: "transparent",
                  borderBottom: "1px solid var(--border)",
                  borderLeft: 0,
                  borderRight: 0,
                  borderTop: 0,
                  borderRadius: 0,
                  color: "inherit",
                  cursor: "pointer",
                  display: "grid",
                  font: "inherit",
                  gap: "8px",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  padding: "9px 0",
                  textAlign: "left",
                  width: "100%",
                }}
                type="button"
              >
                <div style={{ minWidth: 0 }}>
                  <strong>{row.date}</strong>
                  <div
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "12px",
                      marginTop: "2px",
                    }}
                  >
                    Goal {row.goal ? formatMacro(row.goal, "cal") : "--"} cal
                    {row.goal
                      ? remaining >= 0
                        ? ` · ${formatMacro(remaining, "cal")} left`
                        : ` · ${formatMacro(Math.abs(remaining), "cal")} over`
                      : ""}
                  </div>
                </div>
                <strong
                  style={{
                    color: row.goal && row.calories > row.goal ? "#c62828" : "var(--text-h)",
                  }}
                >
                  {formatMacro(row.calories, "cal")} cal
                </strong>
              </button>
            );
          })}
        </div>
      </div>
      {rangeSheetOpen && (
        <SelectionSheet
          onClose={() => setRangeSheetOpen(false)}
          onSelect={(value) => updateChartSettings({ rangeDays: value })}
          options={RANGE_OPTIONS}
          selectedValue={rangeDays}
          title="Calorie range"
        />
      )}
    </div>
  );
}

function NutritionDateCalendar({
  bodyWeightEntries = [],
  entries = [],
  onSelectDate,
  selectedDate,
}) {
  const selectedDateObject = parseLocalDateKey(selectedDate);
  const today = new Date();
  const [expanded, setExpanded] = useState(false);
  const [displayedMonth, setDisplayedMonth] = useState(
    () =>
      new Date(
        selectedDateObject.getFullYear(),
        selectedDateObject.getMonth(),
        1
      )
  );
  const todayKey = getTodayKey();
  const selectedDateKey = selectedDate || todayKey;
  const entryDates = useMemo(
    () => new Set(entries.map((entry) => entry.date).filter(Boolean)),
    [entries]
  );
  const bodyWeightDates = useMemo(
    () =>
      new Set(bodyWeightEntries.map((entry) => entry.date).filter(Boolean)),
    [bodyWeightEntries]
  );
  const weekStart = startOfMondayWeek(today);
  const weekDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);

    date.setDate(weekStart.getDate() + index);

    return date;
  });
  const firstDay = new Date(
    displayedMonth.getFullYear(),
    displayedMonth.getMonth(),
    1
  );
  const lastDay = new Date(
    displayedMonth.getFullYear(),
    displayedMonth.getMonth() + 1,
    0
  );
  const startOffset = (firstDay.getDay() + 6) % 7;
  const monthCells = [
    ...Array.from({ length: startOffset }, () => null),
    ...Array.from({ length: lastDay.getDate() }, (_, index) => {
      const date = new Date(
        displayedMonth.getFullYear(),
        displayedMonth.getMonth(),
        index + 1
      );

      return date;
    }),
  ];

  function selectDate(date) {
    onSelectDate(getLocalDateKey(date));
  }

  return (
    <section
      aria-label="Nutrition date"
      style={{
        border: "1px solid var(--border)",
        borderRadius: "8px",
        display: "grid",
        gap: expanded ? "12px" : 0,
        overflow: "hidden",
      }}
    >
      <button
        aria-expanded={expanded}
        onClick={() => {
          setDisplayedMonth(
            new Date(
              selectedDateObject.getFullYear(),
              selectedDateObject.getMonth(),
              1
            )
          );
          setExpanded((open) => !open);
        }}
        style={{
          background: "transparent",
          border: 0,
          borderRadius: 0,
          display: "grid",
          gap: "8px",
          padding: "10px",
          textAlign: "center",
          width: "100%",
        }}
        type="button"
      >
        <span
          style={{
            alignItems: "baseline",
            display: "flex",
            gap: "8px",
            justifyContent: "space-between",
            textAlign: "left",
          }}
        >
          <strong>Day</strong>
          <span
            style={{
              color: "var(--text-muted)",
              fontSize: "12px",
            }}
          >
            {selectedDateKey}
          </span>
        </span>
        <span
          style={{
            display: "grid",
            gap: "4px",
            gridTemplateColumns: "repeat(7, 1fr)",
          }}
        >
          {weekDays.map((date) => {
            const dateKey = getLocalDateKey(date);
            const selected = dateKey === selectedDateKey;
            const isToday = dateKey === todayKey;

            return (
              <span key={dateKey}>
                <span
                  style={{
                    color: "var(--text-muted)",
                    display: "block",
                    fontSize: "12px",
                  }}
                >
                  {date
                    .toLocaleDateString(undefined, { weekday: "short" })
                    .slice(0, 2)}
                </span>
                <span
                  style={{
                    alignItems: "center",
                    border: selected
                      ? "2px solid var(--text-h)"
                      : isToday
                        ? "2px solid #1976d2"
                        : "2px solid transparent",
                    borderRadius: "999px",
                    color: "var(--text-h)",
                    display: "flex",
                    fontSize: "18px",
                    fontWeight: "bold",
                    height: "32px",
                    justifyContent: "center",
                    margin: "0 auto",
                    width: "32px",
                  }}
                >
                  {date.getDate()}
                </span>
                <span
                  aria-hidden="true"
                  style={{
                    alignItems: "center",
                    display: "flex",
                    height: "9px",
                    justifyContent: "center",
                    marginTop: "2px",
                  }}
                >
                  {bodyWeightDates.has(dateKey) && (
                    <span
                      style={{
                        background: "#ef6c00",
                        borderRadius: "999px",
                        height: "8px",
                        marginRight: entryDates.has(dateKey) ? "-1px" : 0,
                        width: "8px",
                      }}
                    />
                  )}
                  {entryDates.has(dateKey) && (
                    <span
                      style={{
                        background: "#fbc02d",
                        borderRadius: "999px",
                        height: "8px",
                        marginLeft: bodyWeightDates.has(dateKey) ? "-1px" : 0,
                        width: "8px",
                      }}
                    />
                  )}
                </span>
              </span>
            );
          })}
        </span>
      </button>

      {expanded && (
        <div
          style={{
            borderTop: "1px solid var(--border)",
            display: "grid",
            gap: "12px",
            padding: "12px 10px 10px",
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <button
              onClick={() =>
                setDisplayedMonth(
                  new Date(
                    displayedMonth.getFullYear(),
                    displayedMonth.getMonth() - 1,
                    1
                  )
                )
              }
              type="button"
            >
              ←
            </button>
            <strong>
              {displayedMonth.toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </strong>
            <button
              onClick={() =>
                setDisplayedMonth(
                  new Date(
                    displayedMonth.getFullYear(),
                    displayedMonth.getMonth() + 1,
                    1
                  )
                )
              }
              type="button"
            >
              →
            </button>
          </div>
          <div
            style={{
              display: "grid",
              gap: "6px",
              gridTemplateColumns: "repeat(7, 1fr)",
              textAlign: "center",
            }}
          >
            {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => (
              <div
                key={day}
                style={{
                  color: "var(--text-muted)",
                  fontSize: "12px",
                  fontWeight: "bold",
                }}
              >
                {day}
              </div>
            ))}
            {monthCells.map((date, index) => {
              const dateKey = date ? getLocalDateKey(date) : "";
              const selected = dateKey === selectedDateKey;
              const isToday = dateKey === todayKey;

              return (
                <button
                  key={dateKey || `empty-${index}`}
                  disabled={!date}
                  onClick={() => {
                    if (!date) {
                      return;
                    }

                    selectDate(date);
                    setExpanded(false);
                  }}
                  style={{
                    alignItems: "center",
                    background: selected ? "var(--text-h)" : "transparent",
                    border: selected
                      ? "2px solid var(--text-h)"
                      : isToday
                        ? "2px solid #1976d2"
                        : "2px solid transparent",
                    borderRadius: "8px",
                    color: selected ? "var(--surface)" : "var(--text-h)",
                    cursor: date ? "pointer" : "default",
                    display: "grid",
                    font: "inherit",
                    gap: "0",
                    justifyItems: "center",
                    minHeight: "42px",
                    opacity: date ? 1 : 0,
                    padding: "2px",
                  }}
                  type="button"
                >
                  <span
                    style={{
                      alignItems: "center",
                      display: "flex",
                      fontWeight: "normal",
                      height: "24px",
                      justifyContent: "center",
                      width: "24px",
                    }}
                  >
                    {date ? date.getDate() : ""}
                  </span>
                  <span
                    aria-hidden="true"
                    style={{
                      alignItems: "center",
                      display: "flex",
                      height: "8px",
                      justifyContent: "center",
                    }}
                  >
                    {date && bodyWeightDates.has(dateKey) && (
                      <span
                        style={{
                          background: "#ef6c00",
                          borderRadius: "999px",
                          height: "8px",
                          marginRight: entryDates.has(dateKey) ? "-1px" : 0,
                          width: "8px",
                        }}
                      />
                    )}
                    {date && entryDates.has(dateKey) && (
                      <span
                        style={{
                          background: "#fbc02d",
                          borderRadius: "999px",
                          height: "8px",
                          marginLeft: bodyWeightDates.has(dateKey) ? "-1px" : 0,
                          width: "8px",
                        }}
                      />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          <button
            onClick={() => {
              const nextToday = new Date();

              setDisplayedMonth(
                new Date(nextToday.getFullYear(), nextToday.getMonth(), 1)
              );
              selectDate(nextToday);
              setExpanded(false);
            }}
            style={{
              minHeight: "40px",
              width: "100%",
            }}
            type="button"
          >
            Today
          </button>
        </div>
      )}
    </section>
  );
}

function normalizeMeal(value) {
  const normalized = String(value || "").toLowerCase().trim();
  const legacyMealAliases = {
    snack: DEFAULT_SNACK_MEAL,
  };
  const meal = legacyMealAliases[normalized] || normalized;

  if (BASE_MEAL_OPTIONS.some(([option]) => option === meal)) {
    return meal;
  }

  if (/^snack-[1-9]\d*$/.test(meal)) {
    return meal;
  }

  return DEFAULT_MEAL;
}

function getSnackIndex(meal) {
  const match = normalizeMeal(meal).match(/^snack-(\d+)$/);

  return match ? Number(match[1]) : 0;
}

function getMealLabel(meal) {
  const normalized = normalizeMeal(meal);
  const baseLabel = BASE_MEAL_OPTIONS.find(([option]) => option === normalized)?.[1];
  const snackIndex = getSnackIndex(normalized);

  if (baseLabel) {
    return baseLabel;
  }

  if (snackIndex === 1) {
    return "Snack";
  }

  return `Snack ${snackIndex}`;
}

function getNextSnackMeal(entries) {
  const highestSnackIndex = entries.reduce(
    (highest, entry) => Math.max(highest, getSnackIndex(entry.meal)),
    0
  );

  return `snack-${highestSnackIndex + 1}`;
}

function getSnackMealOptions(entries, currentMeal = DEFAULT_SNACK_MEAL) {
  const snackIndexes = new Set([1]);
  const currentSnackIndex = getSnackIndex(currentMeal);

  if (currentSnackIndex) {
    snackIndexes.add(currentSnackIndex);
  }

  entries.forEach((entry) => {
    const snackIndex = getSnackIndex(entry.meal);

    if (snackIndex) {
      snackIndexes.add(snackIndex);
    }
  });

  return [...snackIndexes]
    .sort((a, b) => a - b)
    .map((snackIndex) => [`snack-${snackIndex}`, getMealLabel(`snack-${snackIndex}`)]);
}

function getMealSelectOptions(entries, currentMeal) {
  return [
    ...BASE_MEAL_OPTIONS,
    ...getSnackMealOptions(entries, currentMeal),
    [ADD_SNACK_VALUE, "+ Snack"],
  ];
}

function getMealMoveOptions(entries, currentMeal) {
  return [
    ...getMealSelectOptions(entries, currentMeal),
    [COPY_TO_MEAL_VALUE, "Copy to ..."],
  ];
}

function getMealGroups(entries, expandedMeals) {
  const snackMeals = getSnackMealOptions(entries);
  const mealOptions = [...BASE_MEAL_OPTIONS, ...snackMeals];

  return mealOptions.map(([meal, label]) => {
    const mealEntries = entries.filter(
      (entry) => normalizeMeal(entry.meal) === meal
    );

    return {
      entries: mealEntries,
      expanded: Boolean(expandedMeals[meal]),
      label,
      meal,
      totals: totalEntries(mealEntries),
    };
  });
}

function MealIcon({ meal, size = 16 }) {
  const normalizedMeal = normalizeMeal(meal);

  if (normalizedMeal === "breakfast") {
    return <Sunrise size={size} color="#d97706" />;
  }

  if (normalizedMeal === "lunch") {
    return <Sun size={size} color="#ca8a04" />;
  }

  if (normalizedMeal === "dinner") {
    return <Sunset size={size} color="#c2410c" />;
  }

  return <Coffee size={size} color="#7c3f18" />;
}

function MealSelect({
  ariaLabel = "Meal",
  onChange,
  onClick,
  onKeyDown,
  options,
  selectStyle,
  value,
}) {
  return (
    <div
      style={{
        position: "relative",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          alignItems: "center",
          display: "inline-flex",
          height: "100%",
          left: "10px",
          pointerEvents: "none",
          position: "absolute",
          top: 0,
        }}
      >
        <MealIcon meal={value} />
      </span>
      <select
        aria-label={ariaLabel}
        onChange={onChange}
        onClick={onClick}
        onKeyDown={onKeyDown}
        value={value}
        style={{
          boxSizing: "border-box",
          font: "inherit",
          minHeight: "42px",
          padding: "7px 10px 7px 34px",
          width: "100%",
          ...selectStyle,
        }}
      >
        {options.map(([meal, label]) => (
          <option key={meal} value={meal}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

function MealMacroSummary({ totals }) {
  return (
    <>
      {formatMacro(totals.calories, "cal")}{" "}
      <span style={{ color: MACRO_COLORS.calories }}>cal</span> ·{" "}
      {formatMacro(totals.protein)}{" "}
      <span style={{ color: MACRO_COLORS.protein }}>protein</span> ·{" "}
      {formatMacro(totals.carbs)}{" "}
      <span style={{ color: MACRO_COLORS.carbs }}>carbs</span> ·{" "}
      {formatMacro(totals.fat)}{" "}
      <span style={{ color: MACRO_COLORS.fat }}>fat</span>
    </>
  );
}

function getEditableServingLabel(entry) {
  const description = String(entry?.servingDescription || "").trim();
  const amount = parseMacroValue(entry?.servingAmount);

  if (!description) {
    return "serving";
  }

  const multiplierMatch = description.match(/^\d+(?:\.\d+)?\s*x\s*(.+)$/i);

  if (multiplierMatch?.[1]) {
    return multiplierMatch[1].trim();
  }

  const parts = description.split(/\s+/);

  if (Number(parts[0]) === amount && parts.length > 1) {
    return parts.slice(1).join(" ");
  }

  return description;
}

function formatEditableServingDescription(amount, basis) {
  const parsedAmount = parseMacroValue(amount);
  const label = String(basis?.label || "serving").trim();

  if (/^\d/.test(label)) {
    return `${parsedAmount || 0} x ${label}`;
  }

  return `${parsedAmount || 0} ${label}`;
}

function includesCreatine(value) {
  return /\bcreatine\b/i.test(String(value || ""));
}

export default function NutritionView({ session = null }) {
  const signedInUserId = session?.user?.id || null;
  const nutritionStorageKey = useMemo(
    () => getNutritionLogStorageKey(signedInUserId),
    [signedInUserId]
  );
  const nutritionAddMealStorageKey = useMemo(
    () => getNutritionAddMealStorageKey(signedInUserId),
    [signedInUserId]
  );
  const dailyCalorieGoalStorageKey = useMemo(
    () => getDailyCalorieGoalStorageKey(signedInUserId),
    [signedInUserId]
  );
  const dailyCalorieGoalHistoryStorageKey = useMemo(
    () => getDailyCalorieGoalHistoryStorageKey(signedInUserId),
    [signedInUserId]
  );
  const dailyCreatineLogStorageKey = useMemo(
    () => getDailyCreatineLogStorageKey(signedInUserId),
    [signedInUserId]
  );
  const dailyCreatineReminderStorageKey = useMemo(
    () => getDailyCreatineReminderStorageKey(signedInUserId),
    [signedInUserId]
  );
  const dailyCreatineReminderTimeStorageKey = useMemo(
    () => getDailyCreatineReminderTimeStorageKey(signedInUserId),
    [signedInUserId]
  );
  const nutritionStorageKeyRef = useRef(nutritionStorageKey);
  const dailyCalorieGoalStorageKeyRef = useRef(dailyCalorieGoalStorageKey);
  const dailyCalorieGoalHistoryStorageKeyRef = useRef(
    dailyCalorieGoalHistoryStorageKey
  );
  const dailyCreatineLogStorageKeyRef = useRef(dailyCreatineLogStorageKey);
  const dailyCreatineReminderStorageKeyRef = useRef(
    dailyCreatineReminderStorageKey
  );
  const dailyCreatineReminderTimeStorageKeyRef = useRef(
    dailyCreatineReminderTimeStorageKey
  );
  const [entries, setEntries] = useState(() =>
    readNutritionEntries(nutritionStorageKey)
  );
  const [bodyWeightEntries, setBodyWeightEntries] = useState(
    readBodyWeightEntries
  );
  const [dailyCalorieGoal, setDailyCalorieGoal] = useState(() =>
    readDailyCalorieGoal(dailyCalorieGoalStorageKey)
  );
  const [dailyCalorieGoalHistory, setDailyCalorieGoalHistory] = useState(() =>
    readDailyCalorieGoalHistory(
      readDailyCalorieGoal(dailyCalorieGoalStorageKey),
      dailyCalorieGoalHistoryStorageKey
    )
  );
  const [dailyCreatineLog, setDailyCreatineLog] = useState(() =>
    readDailyCreatineLog(dailyCreatineLogStorageKey)
  );
  const [dailyCreatineReminderEnabled, setDailyCreatineReminderEnabled] =
    useState(() =>
      readDailyCreatineReminderEnabled(dailyCreatineReminderStorageKey)
    );
  const [dailyCreatineReminderTime, setDailyCreatineReminderTime] = useState(
    () => readDailyCreatineReminderTime(dailyCreatineReminderTimeStorageKey)
  );
  const [creatineReminderTick, setCreatineReminderTick] = useState(() =>
    Date.now()
  );
  const [creatineReminderTimePickerOpen, setCreatineReminderTimePickerOpen] =
    useState(false);
  const [creatineReminderStatus, setCreatineReminderStatus] = useState("");
  const [preferredAddMeal, setPreferredAddMeal] = useState(() =>
    readNutritionAddMeal(nutritionAddMealStorageKey)
  );
  const [entryDraft, setEntryDraft] = useState(emptyEntry);
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [expandedMealGroups, setExpandedMealGroups] = useState({});
  const [copyFoodSheetOpen, setCopyFoodSheetOpen] = useState(false);
  const [copyFoodSourceDate, setCopyFoodSourceDate] = useState("");
  const [copyFoodStatus, setCopyFoodStatus] = useState("");
  const [pendingCopySelection, setPendingCopySelection] = useState(null);
  const [copyDestinationMeal, setCopyDestinationMeal] = useState(DEFAULT_MEAL);
  const [pendingMealCopyEntry, setPendingMealCopyEntry] = useState(null);
  const [mealCopyDestinationMeal, setMealCopyDestinationMeal] =
    useState(DEFAULT_MEAL);
  const [selectedDate, setSelectedDate] = useState(getTodayKey);
  const [dayPanelOpen, setDayPanelOpen] = useState(true);
  const [calorieHistorySheetOpen, setCalorieHistorySheetOpen] = useState(false);
  const [calorieGoalPickerOpen, setCalorieGoalPickerOpen] = useState(false);
  const [calorieTargetSyncStatus, setCalorieTargetSyncStatus] = useState("");
  const [weightSheetInitialAdding, setWeightSheetInitialAdding] =
    useState(false);
  const [weightSyncStatus, setWeightSyncStatus] = useState("");
  const [weightSheetOpen, setWeightSheetOpen] = useState(false);
  const [weightPickerOpen, setWeightPickerOpen] = useState(false);
  const [foodSearchQuery, setFoodSearchQuery] = useState("");
  const [foodSearchSource, setFoodSearchSource] = useState("fatsecret");
  const [foodAutocompleteSuggestions, setFoodAutocompleteSuggestions] = useState([]);
  const [foodAutocompleteSuppressed, setFoodAutocompleteSuppressed] =
    useState(false);
  const [foodSearchResults, setFoodSearchResults] = useState([]);
  const [fatSecretDetailsById, setFatSecretDetailsById] = useState({});
  const [librarySearchResults, setLibrarySearchResults] = useState([]);
  const [recipeSearchResults, setRecipeSearchResults] = useState([]);
  const [foodSearchStatus, setFoodSearchStatus] = useState("");
  const [foodSearchLoading, setFoodSearchLoading] = useState(false);
  const [foodResultsSheetOpen, setFoodResultsSheetOpen] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [barcodeScannerMode, setBarcodeScannerMode] = useState("food");
  const [barcodeDraft, setBarcodeDraft] = useState("");
  const [barcodeStatus, setBarcodeStatus] = useState("");
  const [selectedFood, setSelectedFood] = useState(emptySelectedFood);
  const [editingServingBasis, setEditingServingBasis] = useState(null);
  const [servingAmount, setServingAmount] = useState("1");
  const [servingUnit, setServingUnit] = useState("serving");
  const [libraryDraft, setLibraryDraft] = useState(emptyLibraryDraft);
  const [librarySheetOpen, setLibrarySheetOpen] = useState(false);
  const [libraryStatus, setLibraryStatus] = useState("");
  const [librarySaving, setLibrarySaving] = useState(false);
  const [libraryManagerOpen, setLibraryManagerOpen] = useState(false);
  const [libraryManagerMode, setLibraryManagerMode] = useState("foods");
  const [libraryManagerQuery, setLibraryManagerQuery] = useState("");
  const [libraryManagerFoods, setLibraryManagerFoods] = useState([]);
  const [libraryManagerRecipes, setLibraryManagerRecipes] = useState([]);
  const [libraryManagerStatus, setLibraryManagerStatus] = useState("");
  const [libraryManagerLoading, setLibraryManagerLoading] = useState(false);
  const [selectedLibraryFoodId, setSelectedLibraryFoodId] = useState(null);
  const [recipeSheetOpen, setRecipeSheetOpen] = useState(false);
  const [recipeDraft, setRecipeDraft] = useState(emptyRecipeDraft);
  const [recipeIngredients, setRecipeIngredients] = useState([]);
  const [recipeIngredientSearchSource, setRecipeIngredientSearchSource] =
    useState("fatsecret");
  const [selectedLibraryRecipeId, setSelectedLibraryRecipeId] = useState(null);
  const [recipeIngredientQuery, setRecipeIngredientQuery] = useState("");
  const [
    recipeIngredientAutocompleteSuggestions,
    setRecipeIngredientAutocompleteSuggestions,
  ] = useState([]);
  const [recipeIngredientResults, setRecipeIngredientResults] = useState([]);
  const [recipeLibraryIngredientResults, setRecipeLibraryIngredientResults] =
    useState([]);
  const [recipeSearchStatus, setRecipeSearchStatus] = useState("");
  const [recipeSearchLoading, setRecipeSearchLoading] = useState(false);
  const [recipeImageImportLoading, setRecipeImageImportLoading] =
    useState(false);
  const [recipeCameraOpen, setRecipeCameraOpen] = useState(false);
  const [recipeCameraStatus, setRecipeCameraStatus] = useState("");
  const [recipeCrop, setRecipeCrop] = useState(DEFAULT_RECIPE_CROP);
  const [recipeCropImageDataUrl, setRecipeCropImageDataUrl] = useState("");
  const [recipeCropOpen, setRecipeCropOpen] = useState(false);
  const [recipeImageImportRows, setRecipeImageImportRows] = useState([]);
  const [recipeImageImportRawText, setRecipeImageImportRawText] = useState("");
  const [recipeImageImportRawTextOpen, setRecipeImageImportRawTextOpen] =
    useState(false);
  const [recipeImageImportStatus, setRecipeImageImportStatus] = useState("");
  const [recipeStatus, setRecipeStatus] = useState("");
  const [recipeSaving, setRecipeSaving] = useState(false);
  const [recipeCreatineById, setRecipeCreatineById] = useState({});
  const [expandedRecipeEntries, setExpandedRecipeEntries] = useState({});
  const [recipeIngredientsByRecipeId, setRecipeIngredientsByRecipeId] =
    useState({});
  const [recipeIngredientLoadingByRecipeId, setRecipeIngredientLoadingByRecipeId] =
    useState({});
  const [recipeIngredientErrorByRecipeId, setRecipeIngredientErrorByRecipeId] =
    useState({});
  const entryFormRef = useRef(null);
  const foodNameInputRef = useRef(null);
  const servingAmountInputRef = useRef(null);
  const recipeImageInputRef = useRef(null);
  const recipeCameraVideoRef = useRef(null);
  const recipeCameraStreamRef = useRef(null);
  const recipeCropImageRef = useRef(null);
  const barcodeVideoRef = useRef(null);
  const barcodeControlsRef = useRef(null);
  const barcodeSearchHandlerRef = useRef(null);
  const fatSecretHydrationRunRef = useRef(0);
  const latestNutritionEntriesRef = useRef(entries);
  const latestDailyCalorieGoalRef = useRef(dailyCalorieGoal);
  const latestDailyCalorieGoalHistoryRef = useRef(dailyCalorieGoalHistory);
  const entryDraftMealContextRef = useRef({
    dayEntryCount: 0,
    selectedDate,
  });

  useEffect(() => {
    nutritionStorageKeyRef.current = nutritionStorageKey;
  }, [nutritionStorageKey]);

  useEffect(() => {
    setPreferredAddMeal(readNutritionAddMeal(nutritionAddMealStorageKey));
  }, [nutritionAddMealStorageKey]);

  useEffect(() => {
    dailyCalorieGoalStorageKeyRef.current = dailyCalorieGoalStorageKey;
  }, [dailyCalorieGoalStorageKey]);

  useEffect(() => {
    dailyCalorieGoalHistoryStorageKeyRef.current =
      dailyCalorieGoalHistoryStorageKey;
  }, [dailyCalorieGoalHistoryStorageKey]);

  useEffect(() => {
    dailyCreatineLogStorageKeyRef.current = dailyCreatineLogStorageKey;
  }, [dailyCreatineLogStorageKey]);

  useEffect(() => {
    dailyCreatineReminderStorageKeyRef.current =
      dailyCreatineReminderStorageKey;
  }, [dailyCreatineReminderStorageKey]);

  useEffect(() => {
    dailyCreatineReminderTimeStorageKeyRef.current =
      dailyCreatineReminderTimeStorageKey;
  }, [dailyCreatineReminderTimeStorageKey]);

  useEffect(() => {
    latestNutritionEntriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    latestDailyCalorieGoalRef.current = dailyCalorieGoal;
  }, [dailyCalorieGoal]);

  useEffect(() => {
    latestDailyCalorieGoalHistoryRef.current = dailyCalorieGoalHistory;
  }, [dailyCalorieGoalHistory]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCreatineReminderTick(Date.now());
    }, 60 * 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  const dayEntries = useMemo(
    () => entries.filter((entry) => entry.date === selectedDate),
    [entries, selectedDate]
  );
  useEffect(() => {
    const previousContext = entryDraftMealContextRef.current;
    const dayEntryCount = dayEntries.length;
    const dateChanged = previousContext.selectedDate !== selectedDate;
    const becameEmpty =
      previousContext.selectedDate === selectedDate &&
      previousContext.dayEntryCount > 0 &&
      dayEntryCount === 0;
    const becamePopulated =
      previousContext.selectedDate === selectedDate &&
      previousContext.dayEntryCount === 0 &&
      dayEntryCount > 0;

    entryDraftMealContextRef.current = {
      dayEntryCount,
      selectedDate,
    };

    if (editingEntryId || (!dateChanged && !becameEmpty && !becamePopulated)) {
      return;
    }

    const nextMeal = dayEntryCount > 0 ? preferredAddMeal : DEFAULT_MEAL;

    setEntryDraft((current) => {
      const normalizedCurrentMeal = normalizeMeal(current.meal);

      return normalizedCurrentMeal === nextMeal
        ? current
        : {
            ...current,
            meal: nextMeal,
          };
    });
  }, [dayEntries.length, editingEntryId, preferredAddMeal, selectedDate]);
  const dayRecipeIds = useMemo(
    () =>
      [
        ...new Set(
          dayEntries
            .map((entry) => entry.recipeId)
            .filter(Boolean)
            .map(String)
        ),
      ].sort(),
    [dayEntries]
  );
  const creatineFoodDetected = useMemo(
    () =>
      dayEntries.some(
        (entry) =>
          includesCreatine(entry.name) ||
          includesCreatine(entry.servingDescription)
      ),
    [dayEntries]
  );
  const creatineRecipeDetected = useMemo(
    () => dayRecipeIds.some((recipeId) => recipeCreatineById[recipeId]),
    [dayRecipeIds, recipeCreatineById]
  );
  const creatineAutoDetected = creatineFoodDetected || creatineRecipeDetected;
  const creatineManuallyChecked = Boolean(dailyCreatineLog[selectedDate]);
  const creatineTaken = creatineAutoDetected || creatineManuallyChecked;
  const creatineReminderSkippedDates = useMemo(() => {
    const dates = new Set(Object.keys(dailyCreatineLog));

    entries.forEach((entry) => {
      if (
        entry.date &&
        (includesCreatine(entry.name) ||
          includesCreatine(entry.servingDescription))
      ) {
        dates.add(entry.date);
      }
    });

    if (selectedDate && creatineAutoDetected) {
      dates.add(selectedDate);
    }

    return [...dates];
  }, [creatineAutoDetected, dailyCreatineLog, entries, selectedDate]);
  const creatineReminderDue =
    dailyCreatineReminderEnabled &&
    selectedDate === getTodayKey() &&
    !creatineTaken &&
    isCreatineReminderTime(creatineReminderTick, dailyCreatineReminderTime);
  const creatineReminderTimeLabel = formatReminderTime(
    dailyCreatineReminderTime
  );
  const [creatineReminderHours, creatineReminderMinutes] =
    dailyCreatineReminderTime.split(":").map(Number);

  useEffect(() => {
    if (!canUseNativeCreatineNotifications()) {
      return undefined;
    }

    let cancelled = false;

    async function reconcileReminder() {
      const result = dailyCreatineReminderEnabled
        ? await scheduleNativeCreatineNotifications({
            skippedDates: creatineReminderSkippedDates,
            time: dailyCreatineReminderTime,
          })
        : {
            status: (await cancelNativeCreatineNotifications())
              ? "off"
              : "error",
          };

      if (cancelled) {
        return;
      }

      if (result.status === "permission-required") {
        setCreatineReminderStatus(
          "Creatine reminders need notification permission in iPhone Settings."
        );
      } else if (result.status === "error") {
        setCreatineReminderStatus(
          "The creatine reminder could not be scheduled."
        );
      } else {
        setCreatineReminderStatus("");
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void reconcileReminder();
      }
    }

    void reconcileReminder();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    creatineReminderSkippedDates,
    dailyCreatineReminderEnabled,
    dailyCreatineReminderTime,
  ]);
  const latestBodyWeight = useMemo(
    () =>
      [...bodyWeightEntries].sort((a, b) => b.date.localeCompare(a.date))[0] ||
      null,
    [bodyWeightEntries]
  );
  const totals = useMemo(() => totalEntries(dayEntries), [dayEntries]);
  const mealGroups = useMemo(
    () => getMealGroups(dayEntries, expandedMealGroups),
    [dayEntries, expandedMealGroups]
  );
  const visibleMealGroups = useMemo(
    () =>
      mealGroups.filter(
        (group) => group.entries.length > 0 || ALWAYS_VISIBLE_MEALS.has(group.meal)
      ),
    [mealGroups]
  );
  const copyFoodSourceDates = useMemo(
    () =>
      [...new Set(entries.map((entry) => entry.date).filter(Boolean))]
        .filter((date) => date !== selectedDate)
        .sort((a, b) => b.localeCompare(a)),
    [entries, selectedDate]
  );
  const copyFoodSourceEntries = useMemo(
    () => entries.filter((entry) => entry.date === copyFoodSourceDate),
    [copyFoodSourceDate, entries]
  );
  const copyFoodMealGroups = useMemo(
    () =>
      getMealGroups(copyFoodSourceEntries, {}).filter(
        (group) => group.entries.length > 0
      ),
    [copyFoodSourceEntries]
  );
  const mealSelectOptions = useMemo(
    () => getMealSelectOptions(dayEntries, entryDraft.meal),
    [dayEntries, entryDraft.meal]
  );
  const copyDestinationMealOptions = useMemo(
    () => getMealSelectOptions(dayEntries, copyDestinationMeal),
    [copyDestinationMeal, dayEntries]
  );
  const mealCopyDestinationMealOptions = useMemo(
    () => getMealSelectOptions(dayEntries, mealCopyDestinationMeal),
    [dayEntries, mealCopyDestinationMeal]
  );
  const calorieGoalValue = parseMacroValue(dailyCalorieGoal);
  const caloriesRemaining = calorieGoalValue - totals.calories;
  const calorieGoalProgress = calorieGoalValue
    ? Math.min((totals.calories / calorieGoalValue) * 100, 100)
    : 0;
  const macroCalories = {
    carbs: totals.carbs * 4,
    fat: totals.fat * 9,
    protein: totals.protein * 4,
  };
  const totalMacroCalories =
    macroCalories.protein + macroCalories.carbs + macroCalories.fat;
  const macroSegments = [
	      {
	        calories: macroCalories.protein,
	        color: MACRO_COLORS.protein,
      label: "Protein",
      percent: totalMacroCalories
        ? (macroCalories.protein / totalMacroCalories) * 100
        : 0,
      value: formatMacro(totals.protein),
    },
	      {
	        calories: macroCalories.carbs,
	        color: MACRO_COLORS.carbs,
      label: "Carbs",
      percent: totalMacroCalories
        ? (macroCalories.carbs / totalMacroCalories) * 100
        : 0,
      value: formatMacro(totals.carbs),
    },
	      {
	        calories: macroCalories.fat,
	        color: MACRO_COLORS.fat,
      label: "Fat",
      percent: totalMacroCalories
        ? (macroCalories.fat / totalMacroCalories) * 100
        : 0,
      value: formatMacro(totals.fat),
    },
  ];
  const calorieGoalOptions = useMemo(
    () => Array.from({ length: 57 }, (_, index) => 1200 + index * 50),
    []
  );
  const recipeTotals = useMemo(
    () => totalEntries(recipeIngredients),
    [recipeIngredients]
  );
  const hasFoodSearchResults =
    foodSearchResults.length > 0 ||
    librarySearchResults.length > 0 ||
    recipeSearchResults.length > 0;
  const hasFatSecretSearchResults = foodSearchResults.some(
    (food) => food.source === "fatsecret"
  );

  useEffect(() => {
    const scopedLog = readDailyCreatineLog(dailyCreatineLogStorageKey);
    const legacyLog =
      signedInUserId && Object.keys(scopedLog).length === 0
        ? readDailyCreatineLog(DAILY_CREATINE_LOG_KEY)
        : {};
    const seededLog =
      Object.keys(scopedLog).length > 0 ? scopedLog : legacyLog;

    setDailyCreatineLog(seededLog);
    saveDailyCreatineLog(seededLog, dailyCreatineLogStorageKey);
  }, [dailyCreatineLogStorageKey, signedInUserId]);

  useEffect(() => {
    const hasScopedReminder = hasStoredDailyCreatineReminderEnabled(
      dailyCreatineReminderStorageKey
    );
    const scopedReminder = hasScopedReminder
      ? readDailyCreatineReminderEnabled(dailyCreatineReminderStorageKey)
      : signedInUserId
        ? readDailyCreatineReminderEnabled(DAILY_CREATINE_REMINDER_KEY)
        : false;

    setDailyCreatineReminderEnabled(scopedReminder);
    saveDailyCreatineReminderEnabled(
      scopedReminder,
      dailyCreatineReminderStorageKey
    );
  }, [dailyCreatineReminderStorageKey, signedInUserId]);

  useEffect(() => {
    const scopedReminderTime = readDailyCreatineReminderTime(
      dailyCreatineReminderTimeStorageKey
    );

    setDailyCreatineReminderTime(scopedReminderTime);
    saveDailyCreatineReminderTime(
      scopedReminderTime,
      dailyCreatineReminderTimeStorageKey
    );
  }, [dailyCreatineReminderTimeStorageKey]);

  useEffect(() => {
    if (
      dayRecipeIds.length === 0 ||
      !session?.user?.id ||
      !isSupabaseConfigured
    ) {
      setRecipeCreatineById({});
      return undefined;
    }

    let cancelled = false;

    async function loadCreatineRecipeIngredients() {
      const entriesByRecipeId = {};

      await Promise.all(
        dayRecipeIds.map(async (recipeId) => {
          try {
            const ingredients = await fetchSupplementalRecipeIngredients(recipeId);
            entriesByRecipeId[recipeId] = ingredients.some((ingredient) =>
              includesCreatine(ingredient.ingredient_name)
            );
          } catch (error) {
            console.error("Failed to check recipe ingredients for creatine:", error);
            entriesByRecipeId[recipeId] = false;
          }
        })
      );

      if (!cancelled) {
        setRecipeCreatineById(entriesByRecipeId);
      }
    }

    loadCreatineRecipeIngredients();

    return () => {
      cancelled = true;
    };
  }, [dayRecipeIds, session]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateNutrition() {
      const scopedLocalEntries = readNutritionEntries(nutritionStorageKey);
      const legacyLocalEntries =
        signedInUserId && scopedLocalEntries.length === 0
          ? readNutritionEntries(NUTRITION_LOG_KEY)
          : [];
      const legacyEntries =
        scopedLocalEntries.length > 0 ? scopedLocalEntries : legacyLocalEntries;
      const savedEntries =
        (await loadNutritionSnapshot(signedInUserId)) ||
        (await initializeNutritionPersistence(signedInUserId, legacyEntries));
      const pendingItems = signedInUserId
        ? await getNutritionOutbox(signedInUserId)
        : [];
      const pendingDeleteIds = new Set(
        pendingItems
          .filter((item) => item.operation === "delete")
          .map((item) => String(item.entryId))
      );
      const pendingUpserts = pendingItems
        .filter((item) => item.operation === "upsert" && item.entry)
        .map((item) => item.entry);
      const mergedEntries = mergeNutritionEntryCollections(
        savedEntries,
        legacyEntries,
        latestNutritionEntriesRef.current,
        pendingUpserts
      ).filter((entry) => !pendingDeleteIds.has(String(entry.id)));

      if (cancelled) return;

      latestNutritionEntriesRef.current = mergedEntries;
      setEntries(mergedEntries);
      saveNutritionEntries(mergedEntries, nutritionStorageKey);
      await persistNutritionEntries(signedInUserId, mergedEntries);
    }

    hydrateNutrition().catch((error) => {
      console.error("Failed to hydrate nutrition data:", error);
    });

    return () => {
      cancelled = true;
    };
  }, [nutritionStorageKey, signedInUserId]);

  useEffect(() => {
    const scopedGoal = readDailyCalorieGoal(dailyCalorieGoalStorageKey);
    const scopedHistory = readDailyCalorieGoalHistory(
      scopedGoal,
      dailyCalorieGoalHistoryStorageKey
    );
    const legacyGoal =
      signedInUserId && !scopedGoal
        ? readDailyCalorieGoal(DAILY_CALORIE_GOAL_KEY)
        : "";
    const legacyHistory =
      signedInUserId && scopedHistory.length === 0
        ? readDailyCalorieGoalHistory(
            legacyGoal,
            DAILY_CALORIE_GOAL_HISTORY_KEY
          )
        : [];
    const stateGoal = Math.round(
      parseMacroValue(latestDailyCalorieGoalRef.current)
    );
    const stateHistory = latestDailyCalorieGoalHistoryRef.current || [];
    const seededGoal = scopedGoal || legacyGoal || stateGoal || "";
    const seededHistory =
      scopedHistory.length > 0
        ? scopedHistory
        : legacyHistory.length > 0
          ? legacyHistory
          : stateHistory;
    const effectiveSeededHistory =
      seededHistory.length > 0
        ? seededHistory
        : readDailyCalorieGoalHistory(seededGoal);
    const currentGoal = getGoalForDate(
      effectiveSeededHistory,
      selectedDate || getTodayKey(),
      seededGoal
    );

    setDailyCalorieGoal(currentGoal || seededGoal || "");
    saveDailyCalorieGoal(
      currentGoal || seededGoal || "",
      dailyCalorieGoalStorageKey
    );
    setDailyCalorieGoalHistory(effectiveSeededHistory);
    saveDailyCalorieGoalHistory(
      effectiveSeededHistory,
      dailyCalorieGoalHistoryStorageKey
    );

  }, [
    dailyCalorieGoalHistoryStorageKey,
    dailyCalorieGoalStorageKey,
    selectedDate,
    signedInUserId,
  ]);

  useEffect(() => {
    if (!recipeCameraOpen) {
      recipeCameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      recipeCameraStreamRef.current = null;

      if (recipeCameraVideoRef.current) {
        recipeCameraVideoRef.current.srcObject = null;
      }

      return undefined;
    }

    let cancelled = false;

    async function startRecipeCamera() {
      const video = recipeCameraVideoRef.current;

      if (!video) {
        return;
      }

      setRecipeCameraStatus("Opening camera...");

      try {
        const stream = await navigator.mediaDevices.getUserMedia(
          RECIPE_CAMERA_VIDEO_CONSTRAINTS
        );

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        recipeCameraStreamRef.current = stream;
        video.srcObject = stream;
        await video.play();
        setRecipeCameraStatus(
          "Frame the recipe name, yield, and ingredients. Keep the text sharp."
        );
      } catch (error) {
        console.error("Recipe camera failed:", error);
        setRecipeCameraStatus(
          "Camera scanning is not available. Use Choose image instead."
        );
      }
    }

    startRecipeCamera();

    return () => {
      cancelled = true;
      recipeCameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      recipeCameraStreamRef.current = null;

      if (recipeCameraVideoRef.current) {
        recipeCameraVideoRef.current.srcObject = null;
      }
    };
  }, [recipeCameraOpen]);

  useEffect(() => {
    if (!showBarcodeScanner) {
      barcodeControlsRef.current?.stop?.();
      barcodeControlsRef.current = null;
      return undefined;
    }

    let cancelled = false;
    const barcodeHints = new Map();

    barcodeHints.set(DecodeHintType.POSSIBLE_FORMATS, FOOD_BARCODE_FORMATS);

    const codeReader = new BrowserMultiFormatReader(barcodeHints);
    const handleBarcodeResult = (barcode, formatLabel = "barcode") => {
      if (!barcode || cancelled) {
        return;
      }

      barcodeControlsRef.current?.stop?.();
      barcodeControlsRef.current = null;
      setBarcodeDraft(barcode);
      setBarcodeStatus(`Scanned ${formatLabel} ${barcode}.`);
      barcodeSearchHandlerRef.current?.(barcode);
    };

    async function startNativeBarcodeScanner(detector) {
      const video = barcodeVideoRef.current;

      if (!video) {
        return false;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia(
          BARCODE_VIDEO_CONSTRAINTS
        );
        let animationFrameId = 0;
        let detecting = false;
        let stopped = false;

        video.srcObject = stream;
        await video.play();

        barcodeControlsRef.current = {
          stop() {
            stopped = true;
            window.cancelAnimationFrame(animationFrameId);
            stream.getTracks().forEach((track) => track.stop());
            if (video.srcObject === stream) {
              video.srcObject = null;
            }
          },
        };

        setBarcodeStatus(
          "Point the barcode inside the guide. Move back until it is sharp."
        );

        const detectFrame = async () => {
          if (cancelled || stopped) {
            return;
          }

          if (!detecting && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            detecting = true;

            try {
              const barcodes = await detector.detect(video);
              const barcode = barcodes.find((candidate) =>
                normalizeBarcodeSearchQuery(candidate.rawValue)
              );

              if (barcode) {
                handleBarcodeResult(
                  normalizeBarcodeSearchQuery(barcode.rawValue),
                  barcode.format || "barcode"
                );
                return;
              }
            } catch (error) {
              console.warn("Native barcode detection failed:", error);
            } finally {
              detecting = false;
            }
          }

          animationFrameId = window.requestAnimationFrame(detectFrame);
        };

        animationFrameId = window.requestAnimationFrame(detectFrame);

        return true;
      } catch (error) {
        console.warn("Native barcode scanner startup failed:", error);

        return false;
      }
    }

    async function startBarcodeScanner() {
      if (!barcodeVideoRef.current) {
        return;
      }

      setBarcodeStatus("Point the camera at a UPC/EAN barcode.");

      try {
        const detector = await createNativeBarcodeDetector();

        if (detector && (await startNativeBarcodeScanner(detector))) {
          return;
        }

        setBarcodeStatus(
          "Point the barcode inside the guide. Move back until it is sharp."
        );

        const controls = await codeReader.decodeFromConstraints(
          BARCODE_VIDEO_CONSTRAINTS,
          barcodeVideoRef.current,
          (result) => {
            if (!result || cancelled) {
              return;
            }

            const barcode = result.getText();
            const barcodeFormat = result.getBarcodeFormat?.();

            handleBarcodeResult(
              barcode,
              BarcodeFormat[barcodeFormat] || "barcode"
            );
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

	  useEffect(() => {
    if (
      foodAutocompleteSuppressed ||
      foodResultsSheetOpen ||
      foodSearchSource !== "fatsecret"
    ) {
      setFoodAutocompleteSuggestions([]);
      return undefined;
    }

    const query = foodSearchQuery.trim();

    if (query.length < 2) {
      setFoodAutocompleteSuggestions([]);
      return undefined;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      try {
        const suggestions = await autocompleteFatSecretFoods(query);

        if (!cancelled) {
          setFoodAutocompleteSuggestions(
            suggestions.filter(
              (suggestion) => suggestion.toLowerCase() !== query.toLowerCase()
            )
          );
        }
      } catch (error) {
        console.error("FatSecret autocomplete failed:", error);

        if (!cancelled) {
          setFoodAutocompleteSuggestions([]);
        }
      }
    }, 275);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    foodAutocompleteSuppressed,
    foodResultsSheetOpen,
    foodSearchQuery,
    foodSearchSource,
  ]);

  useEffect(() => {
    if (foodResultsSheetOpen) {
      setFoodAutocompleteSuggestions([]);
      document.activeElement?.blur?.();
    }
  }, [foodResultsSheetOpen]);

  useEffect(() => {
    if (recipeIngredientSearchSource !== "fatsecret") {
      setRecipeIngredientAutocompleteSuggestions([]);
      return undefined;
    }

    const query = recipeIngredientQuery.trim();

    if (query.length < 2 || normalizeBarcodeSearchQuery(query)) {
      setRecipeIngredientAutocompleteSuggestions([]);
      return undefined;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      try {
        const suggestions = await autocompleteFatSecretFoods(query);

        if (!cancelled) {
          setRecipeIngredientAutocompleteSuggestions(
            suggestions.filter(
              (suggestion) => suggestion.toLowerCase() !== query.toLowerCase()
            )
          );
        }
      } catch (error) {
        console.error("FatSecret recipe ingredient autocomplete failed:", error);

        if (!cancelled) {
          setRecipeIngredientAutocompleteSuggestions([]);
        }
      }
    }, 275);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [recipeIngredientQuery, recipeIngredientSearchSource]);

  function updateEntries(nextEntries, entriesToSync = nextEntries) {
    latestNutritionEntriesRef.current = nextEntries;
    setEntries(nextEntries);
    saveNutritionEntries(nextEntries, nutritionStorageKeyRef.current);
    queueNutritionUpserts(signedInUserId, entriesToSync, nextEntries)
      .catch((error) => {
        console.error("Failed to queue nutrition changes:", error);
        setNutritionSyncStatus(
          "Nutrition was saved to the compatibility cache, but its durable sync queue failed."
        );
      });
  }

  function openCopyFoodSheet() {
    const [firstSourceDate] = copyFoodSourceDates;

    setCopyFoodSourceDate(firstSourceDate || "");
    setCopyFoodStatus("");
    setCopyFoodSheetOpen(true);
  }

  function closeCopyFoodSheet() {
    setCopyFoodSheetOpen(false);
    setCopyFoodStatus("");
    setPendingCopySelection(null);
  }

  function openCopyDestinationDialog(sourceEntries, label = "") {
    if (!sourceEntries.length) {
      return;
    }

    const sourceMeal = normalizeMeal(sourceEntries[0]?.meal);

    setPendingCopySelection({
      entries: sourceEntries,
      label: label || sourceEntries[0]?.name || "Selected food",
      sourceMeal,
    });
    setCopyDestinationMeal(sourceMeal);
    setCopyFoodStatus("");
  }

  function closeCopyDestinationDialog() {
    setPendingCopySelection(null);
  }

  function cloneEntriesForSelectedDate(sourceEntries, meal) {
    const timestamp = Date.now();

    return sourceEntries.map((entry, index) => ({
      ...entry,
      createdAt: new Date(timestamp + index).toISOString(),
      date: selectedDate,
      id: timestamp + index,
      meal: normalizeMeal(meal),
      updatedAt: new Date(timestamp + index).toISOString(),
    }));
  }

  function copyEntriesFromAnotherDay(sourceEntries, destinationMeal) {
    if (!sourceEntries.length) {
      return;
    }

    const normalizedDestinationMeal =
      destinationMeal === ADD_SNACK_VALUE
        ? getNextSnackMeal(dayEntries)
        : normalizeMeal(destinationMeal);
    const copiedEntries = cloneEntriesForSelectedDate(
      sourceEntries,
      normalizedDestinationMeal
    );
    updateEntries([...entries, ...copiedEntries], copiedEntries);
    setExpandedMealGroups((current) => {
      const next = { ...current };

      next[normalizedDestinationMeal] = true;

      return next;
    });
    setCopyFoodStatus(
      `${copiedEntries.length} ${
        copiedEntries.length === 1 ? "food" : "foods"
      } added to ${getMealLabel(normalizedDestinationMeal)} on ${selectedDate}.`
    );
  }

  function confirmCopySelection() {
    if (!pendingCopySelection?.entries?.length) {
      return;
    }

    copyEntriesFromAnotherDay(pendingCopySelection.entries, copyDestinationMeal);
    closeCopyDestinationDialog();
  }

  function openMealCopyDialog(entry) {
    if (!entry) {
      return;
    }

    const sourceMeal = normalizeMeal(entry.meal);

    setPendingMealCopyEntry(entry);
    setMealCopyDestinationMeal(sourceMeal);
  }

  function closeMealCopyDialog() {
    setPendingMealCopyEntry(null);
  }

  function copyEntryToMeal(entry, destinationMeal) {
    if (!entry) {
      return;
    }

    const normalizedDestinationMeal =
      destinationMeal === ADD_SNACK_VALUE
        ? getNextSnackMeal(dayEntries)
        : normalizeMeal(destinationMeal);
    const timestamp = Date.now();
    const copiedEntry = {
      ...entry,
      createdAt: new Date(timestamp).toISOString(),
      date: selectedDate,
      id: timestamp,
      meal: normalizedDestinationMeal,
      updatedAt: new Date(timestamp).toISOString(),
    };

    updateEntries([...entries, copiedEntry], [copiedEntry]);
    setExpandedMealGroups((current) => ({
      ...current,
      [normalizedDestinationMeal]: true,
    }));
    setNutritionSyncStatus(
      `Copied ${entry.name} to ${getMealLabel(normalizedDestinationMeal)}.`
    );
  }

  function confirmMealCopy() {
    if (!pendingMealCopyEntry) {
      return;
    }

    copyEntryToMeal(pendingMealCopyEntry, mealCopyDestinationMeal);
    closeMealCopyDialog();
  }

  function updateBodyWeightEntries(nextEntries) {
    setBodyWeightEntries(nextEntries);
    saveBodyWeightEntries(nextEntries);
  }

  function buildEntryPayload(entryId = Date.now()) {
    const name = entryDraft.name.trim();
    const existingEntry = entries.find((entry) => entry.id === entryId);
    const now = new Date().toISOString();

    if (!name) {
      return null;
    }

    return {
      ...entryDraft,
      calories: parseMacroValue(entryDraft.calories),
      createdAt: existingEntry?.createdAt || now,
      carbs: parseMacroValue(entryDraft.carbs),
      date: selectedDate,
      fat: parseMacroValue(entryDraft.fat),
      id: entryId,
      meal: normalizeMeal(entryDraft.meal),
      name,
      protein: parseMacroValue(entryDraft.protein),
      servingAmount: selectedFood
        ? parseMacroValue(servingAmount)
        : editingServingBasis
          ? parseMacroValue(servingAmount)
          : existingEntry?.servingAmount || null,
      servingDescription: selectedFood
        ? getSelectedServingDescription(servingAmount, servingUnit)
        : editingServingBasis
          ? formatEditableServingDescription(servingAmount, editingServingBasis)
          : existingEntry?.servingDescription || null,
      source:
        selectedFood?.source ||
        (selectedFood ? "fdc" : existingEntry?.source || "manual"),
      sourceKey: selectedFood?.fdcId
        ? String(selectedFood.fdcId)
        : existingEntry?.sourceKey || null,
      recipeId: selectedFood?.recipeId || existingEntry?.recipeId || null,
      updatedAt: now,
    };
  }

  function resetEntryForm(nextMeal) {
    const resetMeal = normalizeMeal(
      nextMeal || (dayEntries.length > 0 ? preferredAddMeal : DEFAULT_MEAL)
    );

    setEntryDraft({
      ...emptyEntry,
      meal: resetMeal,
    });
    setEditingEntryId(null);
    setSelectedFood(emptySelectedFood);
    setEditingServingBasis(null);
    setServingAmount("1");
    setServingUnit("serving");
    setLibraryDraft(emptyLibraryDraft);
    setLibraryStatus("");
    clearFoodSearch();
  }

  function addOrUpdateEntry() {
    const entry = buildEntryPayload(editingEntryId || Date.now());

    if (!entry) {
      return;
    }

    if (editingEntryId) {
      updateEntries(
        entries.map((currentEntry) =>
          currentEntry.id === editingEntryId ? entry : currentEntry
        ),
        [entry]
      );
    } else {
      updateEntries([...entries, entry], [entry]);
    }

    setPreferredAddMeal(entry.meal);
    saveNutritionAddMeal(entry.meal, nutritionAddMealStorageKey);
    resetEntryForm(entry.meal);
  }

  function clearFoodSearch() {
    setFoodSearchQuery("");
    setFoodAutocompleteSuppressed(false);
    setFoodAutocompleteSuggestions([]);
    setFoodSearchResults([]);
    setFatSecretDetailsById({});
    setLibrarySearchResults([]);
    setRecipeSearchResults([]);
    setFoodSearchStatus("");
    setFoodResultsSheetOpen(false);
    setBarcodeDraft("");
    setBarcodeStatus("");
  }

  async function runFoodSearch(queryValue) {
    const query = String(queryValue || "").trim();
    const barcode = normalizeBarcodeSearchQuery(query);

    if (!query) {
      return;
    }

    if (
      barcode &&
      (foodSearchSource === "fatsecret" || foodSearchSource === "usda")
    ) {
      await searchFoodsByBarcode(barcode);
      return;
    }

    setFoodAutocompleteSuppressed(false);
    setFoodSearchLoading(true);
    setFoodAutocompleteSuggestions([]);
    setFoodSearchResults([]);
    setFatSecretDetailsById({});
    setLibrarySearchResults([]);
    setRecipeSearchResults([]);

    const sourceSearchLabel =
      foodSearchSource === "usda"
        ? "USDA"
        : foodSearchSource === "fatsecret"
          ? "FatSecret"
          : "app library";

    setFoodSearchStatus(`Searching ${sourceSearchLabel}...`);

    try {
      if (foodSearchSource === "usda" || foodSearchSource === "fatsecret") {
        if (foodSearchSource === "usda" && !FDC_API_KEY) {
          setFoodSearchStatus(
            "Add VITE_USDA_FDC_API_KEY to your local environment to search FoodData Central."
          );
          return;
        }

        const searchResult =
          foodSearchSource === "usda"
            ? await searchFoodDataCentral(query)
            : await searchFatSecretFoods(query);
        const foods = Array.isArray(searchResult.foods) ? searchResult.foods : [];

        setFoodSearchResults(foods);
        setFoodResultsSheetOpen(foods.length > 0);
        if (foodSearchSource === "fatsecret") {
          hydrateFatSecretSearchResults(foods);
        }
        setFoodSearchStatus(
          foods.length
            ? `${foods.length} ${sourceSearchLabel} foods found`
            : `No ${sourceSearchLabel} foods found`
        );
        return;
      }

      const [libraryFoods, libraryRecipes] = await Promise.all([
        searchSupplementalFoodLibrary(query),
        searchSupplementalRecipeLibrary(query),
      ]);

      setLibrarySearchResults(libraryFoods);
      setRecipeSearchResults(libraryRecipes);
      setFoodResultsSheetOpen(libraryFoods.length > 0 || libraryRecipes.length > 0);
      setFoodSearchStatus(
        libraryFoods.length || libraryRecipes.length
          ? `${libraryFoods.length} foods and ${libraryRecipes.length} recipes found`
          : "No app library foods or recipes found"
      );
    } catch (error) {
      console.error("Food search failed:", error);
      setFoodSearchStatus(error.message);
      setFoodSearchResults([]);
      setFatSecretDetailsById({});
      setLibrarySearchResults([]);
      setRecipeSearchResults([]);
    } finally {
      setFoodSearchLoading(false);
    }
  }

  async function searchFoods(event) {
    event?.preventDefault();
    await runFoodSearch(foodSearchQuery);
  }

  async function searchFoodsByBarcode(barcodeValue) {
    const barcode = String(barcodeValue || "").replace(/\D/g, "");

    if (!barcode) {
      return;
    }

    if (foodSearchSource === "usda" && !FDC_API_KEY) {
      setBarcodeStatus(
        "Add VITE_USDA_FDC_API_KEY to your local environment to search FoodData Central."
      );
      return;
    }

    setFoodSearchQuery(barcode);
    setFoodAutocompleteSuppressed(false);
    setFoodSearchLoading(true);
    setFoodSearchStatus(`Searching ${foodSearchSource === "fatsecret" ? "FatSecret" : "UPC"} ${barcode}...`);
    setBarcodeStatus(`Searching ${foodSearchSource === "fatsecret" ? "FatSecret" : "UPC"} ${barcode}...`);

    try {
      if (foodSearchSource === "fatsecret") {
        const food = await searchFatSecretFoodByBarcode(barcode);
        const foods = food ? [food] : [];
        const hydratedDetails = food ? storeHydratedFatSecretFood(food) : null;

        setFoodSearchResults(foods);
        setFatSecretDetailsById(hydratedDetails || {});
        setLibrarySearchResults([]);
        setRecipeSearchResults([]);
        setFoodResultsSheetOpen(foods.length > 0);
        setFoodSearchStatus(
          foods.length
            ? `Found 1 FatSecret food for barcode ${barcode}`
            : "No FatSecret food found for that barcode"
        );
        setBarcodeStatus(
          foods.length
            ? "Found 1 FatSecret food."
            : "No FatSecret food found for that barcode."
        );
        setShowBarcodeScanner(false);
        return;
      }

      const result = await searchFoodDataCentralByBarcode(barcode);
      const foods = Array.isArray(result.foods) ? result.foods : [];

      setFoodSearchResults(foods);
      setFatSecretDetailsById({});
      setLibrarySearchResults([]);
      setRecipeSearchResults([]);
      setFoodResultsSheetOpen(foods.length > 0);
      setFoodSearchSource("usda");
      setFoodSearchStatus(
        foods.length ? `${foods.length} foods found for UPC ${barcode}` : "No foods found for that UPC"
      );
      setBarcodeStatus(
        foods.length ? `Found ${foods.length} foods.` : "No foods found for that UPC."
      );
      setShowBarcodeScanner(false);
    } catch (error) {
      console.error("Barcode search failed:", error);
      setFoodSearchStatus(error.message);
      setBarcodeStatus(error.message);
      setFoodSearchResults([]);
      setFatSecretDetailsById({});
      setLibrarySearchResults([]);
      setRecipeSearchResults([]);
    } finally {
      setFoodSearchLoading(false);
    }
  }

  async function searchRecipeIngredientsByBarcode(barcodeValue) {
    const barcode = normalizeBarcodeSearchQuery(barcodeValue);

    if (!barcode) {
      return;
    }

    setRecipeIngredientQuery(barcode);
    setBarcodeStatus(
      `Searching ${
        recipeIngredientSearchSource === "fatsecret" ? "FatSecret" : "UPC"
      } ${barcode}...`
    );

    await runRecipeIngredientSearch(barcode);
    setShowBarcodeScanner(false);
  }

  barcodeSearchHandlerRef.current =
    barcodeScannerMode === "recipe"
      ? searchRecipeIngredientsByBarcode
      : searchFoodsByBarcode;

  function hydrateFatSecretSearchResults(foods) {
    const targets = foods
      .filter((food) => food.source === "fatsecret" && getFatSecretFoodKey(food))
      .slice(0, FATSECRET_SEARCH_DETAIL_LIMIT);

    if (targets.length === 0) {
      return;
    }

    const hydrationRun = fatSecretHydrationRunRef.current + 1;
    fatSecretHydrationRunRef.current = hydrationRun;

    setFatSecretDetailsById((current) => {
      const nextDetails = {
        ...current,
      };

      targets.forEach((food) => {
        const key = getFatSecretFoodKey(food);

        nextDetails[key] = {
          food: nextDetails[key]?.food || null,
          status: nextDetails[key]?.food ? "loaded" : "loading",
        };
      });

      return nextDetails;
    });

    targets.forEach(async (food) => {
      const key = getFatSecretFoodKey(food);

      try {
        const detailedFood = await fetchFatSecretFoodDetails(key);

        if (fatSecretHydrationRunRef.current !== hydrationRun) {
          return;
        }

        setFatSecretDetailsById((current) => ({
          ...current,
          [key]: {
            food: detailedFood || food,
            status: detailedFood ? "loaded" : "error",
          },
        }));
      } catch (error) {
        console.error("FatSecret search result hydration failed:", error);

        if (fatSecretHydrationRunRef.current !== hydrationRun) {
          return;
        }

        setFatSecretDetailsById((current) => ({
          ...current,
          [key]: {
            error: error.message,
            food: null,
            status: "error",
          },
        }));
      }
    });
  }

  async function selectFoodResult(food) {
    let selectedResult = food;

    if (food.source === "fatsecret" && food.fatsecretFoodId) {
      const hydratedFood = fatSecretDetailsById[getFatSecretFoodKey(food)]?.food;

      if (hydratedFood) {
        selectedResult = hydratedFood;
      } else {
        setFoodSearchLoading(true);
        setFoodSearchStatus("Loading FatSecret serving details...");

        try {
          selectedResult =
            (await fetchFatSecretFoodDetails(food.fatsecretFoodId)) || food;
        } catch (error) {
          console.error("FatSecret detail lookup failed:", error);
          setFoodSearchStatus(error.message);
          setFoodSearchLoading(false);
          return;
        } finally {
          setFoodSearchLoading(false);
        }
      }
    }

    const macros =
      selectedResult.source === "fatsecret"
        ? getFoodMacros(selectedResult)
        : getFoodServingMacros(selectedResult);
    const servingDescription = getServingDescription(food);
    const portionOptions =
      selectedResult.source === "fatsecret"
        ? getFatSecretPortionOptions(selectedResult)
        : getPortionOptions(selectedResult);
    const selectedOption = portionOptions[0] || null;
    const baseMacros = selectedOption?.baseMacros || macros;
    const nextSelectedFood = {
      baseMacros,
      fdcId: selectedResult.fdcId,
      portionOptions,
      servingDescription:
        selectedOption?.label ||
        getServingDescription(selectedResult) ||
        servingDescription,
      source: selectedResult.source || "fdc",
    };
    const scaledMacros = scaleMacros(baseMacros, "1");

    setEditingEntryId(null);
    setEditingServingBasis(null);
    setSelectedFood(nextSelectedFood);
    setFoodAutocompleteSuppressed(true);
    setFoodAutocompleteSuggestions([]);
    setFoodResultsSheetOpen(false);
    setServingAmount("1");
    setServingUnit(selectedOption?.key || "serving");
    setEntryDraft((current) => ({
      calories: formatDraftMacro(scaledMacros.calories),
      carbs: formatDraftMacro(scaledMacros.carbs),
      fat: formatDraftMacro(scaledMacros.fat),
      meal: normalizeMeal(current.meal),
      name: selectedResult.brandName
        ? `${selectedResult.description} (${selectedResult.brandName})`
        : selectedResult.description || "",
      protein: formatDraftMacro(scaledMacros.protein),
    }));
    focusSelectedFoodAmount();
  }

  function focusSelectedFoodAmount() {
    window.requestAnimationFrame(() => {
      const amountInput = servingAmountInputRef.current;

      amountInput?.focus();
      amountInput?.select();
      amountInput?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      // iOS resizes the visual viewport after focus. Re-center once that
      // keyboard transition has settled so the active field stays visible.
      window.setTimeout(() => {
        servingAmountInputRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 300);
    });
  }

  function selectLibraryFoodResult(food) {
    const macros = getSupplementalFoodMacros(food);
    const servingDescription = getSupplementalServingDescription(food);
    const portionOptions = getSupplementalPortionOptions(food);
    const nextSelectedFood = {
      baseMacros: macros,
      fdcId: food.id,
      portionOptions,
      servingDescription,
      source: "library",
    };

    setEditingEntryId(null);
    setEditingServingBasis(null);
    setSelectedFood(nextSelectedFood);
    setFoodAutocompleteSuppressed(true);
    setFoodAutocompleteSuggestions([]);
    setFoodResultsSheetOpen(false);
    setServingAmount(String(food.serving_size || 1));
    setServingUnit(food.serving_unit || "serving");
    setEntryDraft((current) => ({
      calories: formatDraftMacro(macros.calories),
      carbs: formatDraftMacro(macros.carbs),
      fat: formatDraftMacro(macros.fat),
      meal: normalizeMeal(current.meal),
      name: food.brand ? `${food.name} (${food.brand})` : food.name || "",
      protein: formatDraftMacro(macros.protein),
    }));
    focusSelectedFoodAmount();
  }

  function selectRecipeResult(recipe) {
    const macros = getSupplementalRecipeMacros(recipe);
    const servingDescription = getSupplementalRecipeServingDescription(recipe);
    const portionOptions = getSupplementalRecipePortionOptions(recipe);
    const nextSelectedFood = {
      baseMacros: macros,
      fdcId: recipe.id,
      portionOptions,
      recipeId: recipe.id,
      servingDescription,
      source: "recipe",
    };
    const scaledMacros = scaleMacros(macros, "1");

    setEditingEntryId(null);
    setEditingServingBasis(null);
    setSelectedFood(nextSelectedFood);
    setFoodAutocompleteSuppressed(true);
    setFoodAutocompleteSuggestions([]);
    setFoodResultsSheetOpen(false);
    setServingAmount("1");
    setServingUnit("serving");
    setEntryDraft((current) => ({
      calories: formatDraftMacro(scaledMacros.calories),
      carbs: formatDraftMacro(scaledMacros.carbs),
      fat: formatDraftMacro(scaledMacros.fat),
      meal: normalizeMeal(current.meal),
      name: recipe.name || "",
      protein: formatDraftMacro(scaledMacros.protein),
    }));
    focusSelectedFoodAmount();
  }

  function updateServingAmount(value) {
    setServingAmount(value);

    if (!selectedFood && !editingServingBasis) {
      return;
    }

    const scaledMacros = editingServingBasis
      ? scaleMacros(editingServingBasis.baseMacros, value)
      : scaleMacros(
          getSelectedPortionBaseMacros(servingUnit),
          getSelectedPortionMultiplier(value, servingUnit)
        );

    setEntryDraft((current) => ({
      ...current,
      calories: formatDraftMacro(scaledMacros.calories),
      carbs: formatDraftMacro(scaledMacros.carbs),
      fat: formatDraftMacro(scaledMacros.fat),
      protein: formatDraftMacro(scaledMacros.protein),
    }));
  }

  function getSelectedPortionMultiplier(amount, unit) {
    const selectedOption = selectedFood?.portionOptions.find(
      (option) => option.key === unit
    );

    return parseMacroValue(amount) * (selectedOption?.servingMultiplier || 1);
  }

  function getSelectedPortionBaseMacros(unit) {
    const selectedOption = selectedFood?.portionOptions.find(
      (option) => option.key === unit
    );

    return selectedOption?.baseMacros || selectedFood?.baseMacros || {
      calories: 0,
      carbs: 0,
      fat: 0,
      protein: 0,
    };
  }

  function getSelectedServingDescription(amount, unit) {
    const selectedOption = selectedFood?.portionOptions.find(
      (option) => option.key === unit
    );
    const parsedAmount = parseMacroValue(amount);

    if (!selectedOption) {
      return selectedFood?.servingDescription || null;
    }

    if (selectedOption.baseMacros && selectedOption.label) {
      return `${parsedAmount || 0} x ${selectedOption.label}`;
    }

    return `${parsedAmount || 0} ${getPortionUnitLabel(
      selectedOption.key,
      parsedAmount
    )}`;
  }

  function updateServingUnit(value) {
    setServingUnit(value);

    if (!selectedFood) {
      return;
    }

    const scaledMacros = scaleMacros(
      getSelectedPortionBaseMacros(value),
      getSelectedPortionMultiplier(servingAmount, value)
    );

    setEntryDraft((current) => ({
      ...current,
      calories: formatDraftMacro(scaledMacros.calories),
      carbs: formatDraftMacro(scaledMacros.carbs),
      fat: formatDraftMacro(scaledMacros.fat),
      protein: formatDraftMacro(scaledMacros.protein),
    }));
  }

  function openLibrarySheet() {
    setSelectedLibraryFoodId(null);
    setLibraryDraft({
      brand: "",
      calories: entryDraft.calories,
      carbs: entryDraft.carbs,
      fat: entryDraft.fat,
      name: entryDraft.name,
      protein: entryDraft.protein,
      servingAmount: selectedFood ? servingAmount : "1",
      servingUnit: selectedFood ? servingUnit : "serving",
    });
    setLibraryStatus("");
    setLibrarySheetOpen(true);
  }

  async function saveLibraryFood() {
    if (!libraryDraft.name.trim()) {
      setLibraryStatus("Food name is required.");
      return;
    }

    setLibrarySaving(true);
    setLibraryStatus(
      selectedLibraryFoodId ? "Updating food..." : "Checking for duplicates..."
    );

    try {
      if (selectedLibraryFoodId) {
        await updateSupplementalFoodInLibrary(
          selectedLibraryFoodId,
          libraryDraft,
          session
        );
        setLibraryStatus("Food updated.");
        setLibrarySheetOpen(false);
        return;
      }

      const duplicate = await findSupplementalFoodDuplicate(libraryDraft);

      if (duplicate) {
        setLibraryStatus(`A library food named "${duplicate.name}" already exists.`);
        return;
      }

      setLibraryStatus("Adding food to library...");
      await addSupplementalFoodToLibrary(libraryDraft, session);
      setLibraryStatus("Food added to library.");
      setLibrarySheetOpen(false);
    } catch (error) {
      console.error("Failed to add supplemental food:", error);
      setLibraryStatus(error.message);
    } finally {
      setLibrarySaving(false);
    }
  }

  async function deleteLibraryFood() {
    if (!selectedLibraryFoodId || librarySaving) {
      return;
    }

    const confirmed = window.confirm(`Delete "${libraryDraft.name}" from the shared library?`);

    if (!confirmed) {
      return;
    }

    setLibrarySaving(true);
    setLibraryStatus("Deleting food...");

    try {
      await deleteSupplementalFoodFromLibrary(selectedLibraryFoodId, session);
      setLibraryStatus("Food deleted.");
      setSelectedLibraryFoodId(null);
      setLibraryDraft(emptyLibraryDraft);
      setLibrarySheetOpen(false);
    } catch (error) {
      console.error("Failed to delete supplemental food:", error);
      setLibraryStatus(error.message);
    } finally {
      setLibrarySaving(false);
    }
  }

  function openLibraryManager() {
    setLibraryManagerOpen(true);
    setLibraryManagerStatus("");
  }

  async function searchLibraryManager(event) {
    event?.preventDefault();

    const query = libraryManagerQuery.trim();

    if (!query) {
      return;
    }

    setLibraryManagerLoading(true);
    setLibraryManagerStatus("Searching shared library...");

    try {
      if (libraryManagerMode === "foods") {
        const foods = await searchSupplementalFoodLibrary(query);

        setLibraryManagerFoods(foods);
        setLibraryManagerRecipes([]);
        setLibraryManagerStatus(
          foods.length ? `${foods.length} foods found` : "No foods found"
        );
      } else {
        const recipes = await searchSupplementalRecipeLibrary(query);

        setLibraryManagerRecipes(recipes);
        setLibraryManagerFoods([]);
        setLibraryManagerStatus(
          recipes.length ? `${recipes.length} recipes found` : "No recipes found"
        );
      }
    } catch (error) {
      console.error("Shared library search failed:", error);
      setLibraryManagerStatus(error.message);
      setLibraryManagerFoods([]);
      setLibraryManagerRecipes([]);
    } finally {
      setLibraryManagerLoading(false);
    }
  }

  function editLibraryFood(food) {
    setSelectedLibraryFoodId(food.id);
    setLibraryDraft({
      brand: food.brand || "",
      calories: formatDraftMacro(food.calories),
      carbs: formatDraftMacro(food.carb_grams),
      fat: formatDraftMacro(food.fat_grams),
      name: food.name || "",
      protein: formatDraftMacro(food.protein_grams),
      servingAmount: String(food.serving_size || 1),
      servingUnit: food.serving_unit || "serving",
    });
    setLibraryStatus("");
    setLibraryManagerOpen(false);
    setLibrarySheetOpen(true);
  }

  async function editLibraryRecipe(recipe) {
    setLibraryManagerLoading(true);
    setLibraryManagerStatus("Loading recipe...");

    try {
      const ingredients = await fetchSupplementalRecipeIngredients(recipe.id);

      setSelectedLibraryRecipeId(recipe.id);
      setRecipeDraft({
        description: recipe.description || "",
        name: recipe.name || "",
        servingSize: String(recipe.serving_size || 1),
        servingUnit: recipe.serving_unit || "serving",
        servingsPerRecipe: String(recipe.servings_per_recipe || 1),
      });
      setRecipeIngredients(
        ingredients.map((ingredient) =>
          createRecipeIngredientFromSavedIngredient(ingredient)
        )
      );
      setRecipeIngredientQuery("");
      setRecipeIngredientResults([]);
      setRecipeLibraryIngredientResults([]);
      setRecipeSearchStatus("");
      setRecipeImageImportRows([]);
      setRecipeImageImportRawText("");
      setRecipeImageImportRawTextOpen(false);
      setRecipeImageImportStatus("");
      setRecipeStatus("");
      setLibraryManagerOpen(false);
      setRecipeSheetOpen(true);
    } catch (error) {
      console.error("Failed to load supplemental recipe:", error);
      setLibraryManagerStatus(error.message);
    } finally {
      setLibraryManagerLoading(false);
    }
  }

  function openRecipeSheet() {
    setSelectedLibraryRecipeId(null);
    setRecipeDraft(emptyRecipeDraft);
    setRecipeIngredients([]);
    setRecipeIngredientSearchSource("fatsecret");
    setRecipeIngredientQuery("");
    setRecipeIngredientAutocompleteSuggestions([]);
    setRecipeIngredientResults([]);
    setRecipeLibraryIngredientResults([]);
    setRecipeSearchStatus("");
    setRecipeImageImportRows([]);
    setRecipeImageImportRawText("");
    setRecipeImageImportRawTextOpen(false);
    setRecipeImageImportStatus("");
    setRecipeStatus("");
    setRecipeSheetOpen(true);
  }

  function closeRecipeSheet() {
    setRecipeSheetOpen(false);
    setRecipeStatus("");
  }

  function updateRecipeImageImportRow(index, updates) {
    setRecipeImageImportRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              ...updates,
            }
          : row
      )
    );
  }

  function openRecipeCropper(imageDataUrl) {
    setRecipeCrop(DEFAULT_RECIPE_CROP);
    setRecipeCropImageDataUrl(imageDataUrl);
    setRecipeCropOpen(true);
  }

  function getRecipeCropPointerPosition(event) {
    const image = recipeCropImageRef.current;
    const bounds = image?.getBoundingClientRect();

    if (!bounds?.width || !bounds?.height) {
      return null;
    }

    return {
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
    };
  }

  function startRecipeCropInteraction(event, mode) {
    event.preventDefault();
    event.stopPropagation();

    const startPoint = getRecipeCropPointerPosition(event);

    if (!startPoint) {
      return;
    }

    const startCrop = recipeCrop;
    const target = event.currentTarget;

    target.setPointerCapture?.(event.pointerId);

    const handlePointerMove = (moveEvent) => {
      const point = getRecipeCropPointerPosition(moveEvent);

      if (!point) {
        return;
      }

      const deltaX = point.x - startPoint.x;
      const deltaY = point.y - startPoint.y;

      setRecipeCrop(() => {
        if (mode === "resize") {
          const width = Math.min(
            1 - startCrop.x,
            Math.max(0.18, startCrop.width + deltaX)
          );
          const height = Math.min(
            1 - startCrop.y,
            Math.max(0.18, startCrop.height + deltaY)
          );

          return {
            ...startCrop,
            height,
            width,
          };
        }

        if (mode === "resize-start") {
          const maxX = startCrop.x + startCrop.width - 0.18;
          const maxY = startCrop.y + startCrop.height - 0.18;
          const x = Math.min(maxX, Math.max(0, startCrop.x + deltaX));
          const y = Math.min(maxY, Math.max(0, startCrop.y + deltaY));

          return {
            ...startCrop,
            height: startCrop.y + startCrop.height - y,
            width: startCrop.x + startCrop.width - x,
            x,
            y,
          };
        }

        return {
          ...startCrop,
          x: Math.min(1 - startCrop.width, Math.max(0, startCrop.x + deltaX)),
          y: Math.min(1 - startCrop.height, Math.max(0, startCrop.y + deltaY)),
        };
      });
    };

    const stopInteraction = (upEvent) => {
      target.releasePointerCapture?.(upEvent.pointerId);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopInteraction);
      window.removeEventListener("pointercancel", stopInteraction);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopInteraction);
    window.addEventListener("pointercancel", stopInteraction);
  }

  async function matchParsedRecipeIngredients(parsedRecipe) {
    const parsedIngredients = parsedRecipe.ingredients
      .map((ingredient) => ({
        amount: String(ingredient.amount || "").trim(),
        ingredient: String(ingredient.ingredient || "").trim(),
        originalLine: String(ingredient.originalLine || "").trim(),
        status: "Pending",
        unit: String(ingredient.unit || "").trim(),
      }))
      .filter((ingredient) => ingredient.ingredient);

    if (parsedRecipe.recipeName && !recipeDraft.name.trim()) {
      setRecipeDraft((current) => ({
        ...current,
        name: parsedRecipe.recipeName,
      }));
    }

    if (parsedRecipe.servings && parseMacroValue(parsedRecipe.servings) > 0) {
      setRecipeDraft((current) => ({
        ...current,
        servingsPerRecipe: String(parseMacroValue(parsedRecipe.servings)),
      }));
    }

    setRecipeImageImportRows(parsedIngredients);

    if (parsedIngredients.length === 0) {
      setRecipeImageImportStatus("No ingredients were detected.");
      return;
    }

    setRecipeImageImportStatus(
      `Detected ${parsedIngredients.length} ingredients. Matching FatSecret foods...`
    );

    const importedIngredients = [];

    for (const [index, ingredient] of parsedIngredients.entries()) {
      updateRecipeImageImportRow(index, {
        status: "Searching FatSecret...",
      });

      try {
        const searchResult = await searchFatSecretFoods(ingredient.ingredient);
        const [match] = Array.isArray(searchResult.foods)
          ? searchResult.foods
          : [];

        if (!match) {
          updateRecipeImageImportRow(index, {
            status: "No FatSecret match",
          });
          continue;
        }

        let detailedMatch = match;

        if (match.fatsecretFoodId) {
          detailedMatch = await fetchFatSecretFoodDetails(match.fatsecretFoodId);
          setFatSecretDetailsById((current) => ({
            ...current,
            ...storeHydratedFatSecretFood(detailedMatch),
          }));
        }

        const importedIngredient = applyImportedIngredientAmount(
          createRecipeIngredientFromFatSecretFood(detailedMatch || match),
          ingredient
        );

        importedIngredients.push(importedIngredient);
        updateRecipeImageImportRow(index, {
          matchName: importedIngredient.name,
          status: importedIngredient.importUnitWarning || "Matched",
        });
      } catch (error) {
        console.error("Recipe image ingredient match failed:", error);
        updateRecipeImageImportRow(index, {
          status: error.message || "Match failed",
        });
      }
    }

    if (importedIngredients.length > 0) {
      setRecipeIngredients((current) => [...current, ...importedIngredients]);
    }

    setRecipeImageImportStatus(
      importedIngredients.length
        ? `Added ${importedIngredients.length} matched ingredients. Review amounts before saving.`
        : "No ingredients were added. Try manual search for the parsed rows."
    );
  }

  async function processRecipeImageWithOcr(imageDataUrl) {
    setRecipeImageImportLoading(true);
    setRecipeImageImportRows([]);
    setRecipeImageImportRawText("");
    setRecipeImageImportRawTextOpen(false);
    setRecipeImageImportStatus("Loading local OCR...");
    setRecipeSearchStatus("");

    const slowParseStatusId = window.setTimeout(() => {
      setRecipeImageImportStatus(
        "Still scanning text. Clear, cropped ingredient images work best."
      );
    }, 10000);

    try {
      const ocrText = await withTimeout(
        recognizeRecipeTextFromImage(imageDataUrl, setRecipeImageImportStatus),
        RECIPE_OCR_IMPORT_TIMEOUT_MS,
        "Recipe OCR timed out. Try a sharper, closer image of only the yield and ingredients."
      );
      window.clearTimeout(slowParseStatusId);
      setRecipeImageImportRawText(ocrText.trim());

      const parsedRecipe = parseRecipeFromOcrText(ocrText);

      await matchParsedRecipeIngredients(parsedRecipe);
    } catch (error) {
      window.clearTimeout(slowParseStatusId);
      console.error("Recipe OCR import failed:", error);
      setRecipeImageImportStatus(formatRecipeImageImportError(error));
    } finally {
      setRecipeImageImportLoading(false);
    }
  }

  async function handleRecipeImageSelected(event) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setRecipeImageImportStatus("Choose a recipe image.");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setRecipeImageImportStatus("Choose an image smaller than 8 MB.");
      return;
    }

    const imageDataUrl = await readFileAsDataUrl(file);

    openRecipeCropper(imageDataUrl);
  }

  async function captureRecipeCameraImage() {
    const video = recipeCameraVideoRef.current;

    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      setRecipeCameraStatus("Camera is still getting ready.");
      return;
    }

    const canvas = document.createElement("canvas");
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 960;

    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(video, 0, 0, width, height);

    const imageDataUrl = canvas.toDataURL("image/jpeg", 0.88);

    setRecipeCameraOpen(false);
    openRecipeCropper(imageDataUrl);
  }

  async function processRecipeCrop() {
    if (!recipeCropImageDataUrl) {
      return;
    }

    setRecipeCropOpen(false);
    setRecipeImageImportStatus("Cropping recipe image...");

    try {
      const croppedImageDataUrl = await cropImageDataUrl(
        recipeCropImageDataUrl,
        recipeCrop
      );

      await processRecipeImageWithOcr(croppedImageDataUrl);
    } catch (error) {
      console.error("Recipe crop failed:", error);
      setRecipeImageImportStatus(formatRecipeImageImportError(error));
    }
  }

  async function searchRecipeIngredients(event) {
    event?.preventDefault();
    await runRecipeIngredientSearch(recipeIngredientQuery);
  }

  async function runRecipeIngredientSearch(queryValue) {
    const query = String(queryValue || "").trim();
    const barcode = normalizeBarcodeSearchQuery(query);

    if (!query) {
      return;
    }

    setRecipeSearchLoading(true);
    setRecipeIngredientAutocompleteSuggestions([]);
    setRecipeIngredientResults([]);
    setRecipeLibraryIngredientResults([]);

    const sourceSearchLabel =
      recipeIngredientSearchSource === "usda"
        ? "USDA"
        : recipeIngredientSearchSource === "fatsecret"
          ? "FatSecret"
          : "app library";

    setRecipeSearchStatus(`Searching ${sourceSearchLabel} ingredients...`);

    try {
      if (recipeIngredientSearchSource === "fatsecret") {
        if (barcode) {
          const food = await searchFatSecretFoodByBarcode(barcode);
          const foods = food ? [food] : [];
          const hydratedDetails = food ? storeHydratedFatSecretFood(food) : null;

          setRecipeIngredientResults(foods);
          setFatSecretDetailsById((current) => ({
            ...current,
            ...(hydratedDetails || {}),
          }));
          setRecipeSearchStatus(
            foods.length
              ? `Found 1 FatSecret ingredient for barcode ${barcode}`
              : "No FatSecret ingredient found for that barcode"
          );
          return;
        }

        const searchResult = await searchFatSecretFoods(query);
        const foods = Array.isArray(searchResult.foods) ? searchResult.foods : [];

        setRecipeIngredientResults(foods);
        hydrateFatSecretSearchResults(foods);
        setRecipeSearchStatus(
          foods.length
            ? `${foods.length} FatSecret ingredients found`
            : "No FatSecret ingredients found"
        );
        return;
      }

      if (recipeIngredientSearchSource === "usda") {
        if (!FDC_API_KEY) {
          setRecipeSearchStatus(
            "Add VITE_USDA_FDC_API_KEY to your local environment to search FoodData Central."
          );
          return;
        }

        const fdcResult = barcode
          ? await searchFoodDataCentralByBarcode(barcode)
          : await searchFoodDataCentral(query);
        const foods = Array.isArray(fdcResult.foods) ? fdcResult.foods : [];

        setRecipeIngredientResults(foods);
        setRecipeSearchStatus(
          foods.length
            ? `${foods.length} USDA ingredients found`
            : "No USDA ingredients found"
        );
        return;
      }

      const libraryFoods = await searchSupplementalFoodLibrary(query);

      setRecipeIngredientResults([]);
      setRecipeLibraryIngredientResults(libraryFoods);
      setRecipeSearchStatus(
        libraryFoods.length
          ? `${libraryFoods.length} library ingredients found`
          : "No app library ingredients found"
      );
    } catch (error) {
      console.error("Recipe ingredient search failed:", error);
      setRecipeSearchStatus(error.message);
      setRecipeIngredientResults([]);
      setRecipeLibraryIngredientResults([]);
      setFatSecretDetailsById({});
    } finally {
      setRecipeSearchLoading(false);
    }
  }

  function clearRecipeIngredientSearch() {
    setRecipeIngredientQuery("");
    setRecipeIngredientAutocompleteSuggestions([]);
    setRecipeIngredientResults([]);
    setRecipeLibraryIngredientResults([]);
    setRecipeSearchStatus("");
  }

  function addRecipeIngredient(ingredient) {
    setRecipeIngredients((current) => [...current, ingredient]);
    setRecipeStatus("");
  }

  async function addRecipeIngredientFromSearchFood(food) {
    if (food.source !== "fatsecret") {
      addRecipeIngredient(createRecipeIngredientFromFdcFood(food));
      return;
    }

    let selectedResult = fatSecretDetailsById[getFatSecretFoodKey(food)]?.food;

    if (!selectedResult && food.fatsecretFoodId) {
      setRecipeSearchLoading(true);
      setRecipeSearchStatus("Loading FatSecret serving details...");

      try {
        selectedResult = await fetchFatSecretFoodDetails(food.fatsecretFoodId);
        setFatSecretDetailsById((current) => ({
          ...current,
          ...storeHydratedFatSecretFood(selectedResult),
        }));
      } catch (error) {
        console.error("FatSecret recipe ingredient detail lookup failed:", error);
        setRecipeSearchStatus(error.message);
        return;
      } finally {
        setRecipeSearchLoading(false);
      }
    }

    addRecipeIngredient(createRecipeIngredientFromFatSecretFood(selectedResult || food));
    setRecipeSearchStatus("");
  }

  function removeRecipeIngredient(ingredientId) {
    setRecipeIngredients((current) =>
      current.filter((ingredient) => ingredient.id !== ingredientId)
    );
  }

  function updateRecipeIngredientAmount(ingredientId, amount) {
    setRecipeIngredients((current) =>
      current.map((ingredient) =>
        ingredient.id === ingredientId
          ? scaleRecipeIngredient(ingredient, amount, ingredient.unit)
          : ingredient
      )
    );
  }

  function updateRecipeIngredientUnit(ingredientId, unit) {
    setRecipeIngredients((current) =>
      current.map((ingredient) =>
        ingredient.id === ingredientId
          ? scaleRecipeIngredient(ingredient, ingredient.amount, unit)
          : ingredient
      )
    );
  }

  async function saveRecipe() {
    if (!recipeDraft.name.trim()) {
      setRecipeStatus("Recipe name is required.");
      return;
    }

    if (recipeIngredients.length === 0) {
      setRecipeStatus("Add at least one ingredient.");
      return;
    }

    setRecipeSaving(true);
    setRecipeStatus(
      selectedLibraryRecipeId ? "Updating recipe..." : "Adding recipe to library..."
    );

    try {
      if (selectedLibraryRecipeId) {
        await updateSupplementalRecipeInLibrary(
          selectedLibraryRecipeId,
          recipeDraft,
          recipeIngredients,
          session
        );
        setRecipeStatus("Recipe updated.");
      } else {
        await addSupplementalRecipeToLibrary(recipeDraft, recipeIngredients, session);
        setRecipeStatus("Recipe added to library.");
      }
      setRecipeSheetOpen(false);
    } catch (error) {
      console.error("Failed to add supplemental recipe:", error);
      setRecipeStatus(error.message);
    } finally {
      setRecipeSaving(false);
    }
  }

  async function deleteRecipe() {
    if (!selectedLibraryRecipeId || recipeSaving) {
      return;
    }

    const confirmed = window.confirm(`Delete "${recipeDraft.name}" from the shared library?`);

    if (!confirmed) {
      return;
    }

    setRecipeSaving(true);
    setRecipeStatus("Deleting recipe...");

    try {
      await deleteSupplementalRecipeFromLibrary(selectedLibraryRecipeId, session);
      setRecipeStatus("Recipe deleted.");
      setSelectedLibraryRecipeId(null);
      setRecipeDraft(emptyRecipeDraft);
      setRecipeIngredients([]);
      setRecipeSheetOpen(false);
    } catch (error) {
      console.error("Failed to delete supplemental recipe:", error);
      setRecipeStatus(error.message);
    } finally {
      setRecipeSaving(false);
    }
  }

  function removeEntry(entryId) {
    const deletedEntry = entries.find((entry) => entry.id === entryId) || null;
    const nextEntries = entries.filter((entry) => entry.id !== entryId);

    latestNutritionEntriesRef.current = nextEntries;
    setEntries(nextEntries);
    saveNutritionEntries(nextEntries, nutritionStorageKeyRef.current);
    queueNutritionDelete(signedInUserId, entryId, nextEntries, deletedEntry)
      .catch((error) => {
        console.error("Failed to queue nutrition deletion:", error);
        setNutritionSyncStatus(
          "Nutrition deletion was saved locally, but its durable sync queue failed."
        );
      });

    if (editingEntryId === entryId) {
      resetEntryForm();
    }
  }

  function updateEntryMeal(entryId, meal) {
    if (meal === COPY_TO_MEAL_VALUE) {
      const entry = entries.find((currentEntry) => currentEntry.id === entryId);

      openMealCopyDialog(entry);
      return;
    }

    const normalizedMeal =
      meal === ADD_SNACK_VALUE ? getNextSnackMeal(dayEntries) : normalizeMeal(meal);
    const updatedAt = new Date().toISOString();
    let updatedEntry = null;

    updateEntries(
      entries.map((entry) => {
        if (entry.id !== entryId) {
          return entry;
        }

        updatedEntry = {
          ...entry,
          meal: normalizedMeal,
          updatedAt,
        };

        return updatedEntry;
      }),
      updatedEntry ? [updatedEntry] : []
    );

    if (editingEntryId === entryId) {
      setEntryDraft((current) => ({
        ...current,
        meal: normalizedMeal,
      }));
    }
  }

  function updateEntryDraftMeal(meal) {
    const normalizedMeal =
      meal === ADD_SNACK_VALUE ? getNextSnackMeal(dayEntries) : normalizeMeal(meal);

    setPreferredAddMeal(normalizedMeal);
    saveNutritionAddMeal(normalizedMeal, nutritionAddMealStorageKey);
    setEntryDraft((current) => ({
      ...current,
      meal: normalizedMeal,
    }));
  }

  async function toggleRecipeEntryExpanded(entry) {
    if (!entry?.id || !entry.recipeId) {
      return;
    }

    const entryId = String(entry.id);
    const recipeId = String(entry.recipeId);
    const willExpand = !expandedRecipeEntries[entryId];

    setExpandedRecipeEntries((current) => ({
      ...current,
      [entryId]: willExpand,
    }));

    if (!willExpand || recipeIngredientsByRecipeId[recipeId]) {
      return;
    }

    setRecipeIngredientLoadingByRecipeId((current) => ({
      ...current,
      [recipeId]: true,
    }));
    setRecipeIngredientErrorByRecipeId((current) => ({
      ...current,
      [recipeId]: "",
    }));

    try {
      const ingredients = await fetchSupplementalRecipeIngredients(recipeId);
      setRecipeIngredientsByRecipeId((current) => ({
        ...current,
        [recipeId]: ingredients.map((ingredient) =>
          createRecipeIngredientFromSavedIngredient(ingredient)
        ),
      }));
    } catch (error) {
      console.error("Failed to load recipe ingredients:", error);
      setRecipeIngredientErrorByRecipeId((current) => ({
        ...current,
        [recipeId]: `Ingredients unavailable: ${error.message}`,
      }));
    } finally {
      setRecipeIngredientLoadingByRecipeId((current) => ({
        ...current,
        [recipeId]: false,
      }));
    }
  }

  function editEntry(entry) {
    const savedServingAmount = parseMacroValue(entry.servingAmount);
    const hasSavedServing =
      savedServingAmount > 0 && Boolean(entry.servingDescription);

    setEditingEntryId(entry.id);
    setEntryDraft({
      calories: formatDraftMacro(entry.calories),
      carbs: formatDraftMacro(entry.carbs),
      fat: formatDraftMacro(entry.fat),
      meal: normalizeMeal(entry.meal),
      name: entry.name || "",
      protein: formatDraftMacro(entry.protein),
    });
    setSelectedFood(emptySelectedFood);
    setEditingServingBasis(
      hasSavedServing
        ? {
            baseMacros: scaleMacros(
              {
                calories: parseMacroValue(entry.calories),
                carbs: parseMacroValue(entry.carbs),
                fat: parseMacroValue(entry.fat),
                protein: parseMacroValue(entry.protein),
              },
              1 / savedServingAmount
            ),
            label: getEditableServingLabel(entry),
          }
        : null
    );
    setServingAmount(String(savedServingAmount || 1));
    setServingUnit("serving");
    clearFoodSearch();
    window.requestAnimationFrame(() => {
      entryFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      foodNameInputRef.current?.focus();
    });
  }

  async function saveBodyWeight(entryDate, weightValue) {
    const weight = parseMacroValue(weightValue);

    if (!weight) {
      return;
    }

    const existingEntry = bodyWeightEntries.find((entry) => entry.date === entryDate);
    const nextEntry = {
      date: entryDate,
      id: existingEntry?.id || Date.now(),
      unit: "lb",
      weight,
    };
    const nextEntries = [
      ...bodyWeightEntries.filter((entry) => entry.date !== entryDate),
      nextEntry,
    ].sort((a, b) => a.date.localeCompare(b.date));

    updateBodyWeightEntries(nextEntries);

    if (!session?.user?.id || !isSupabaseConfigured) {
      return;
    }

    try {
      await queueBodyWeightUpsert(session.user.id, nextEntry);
      setWeightSyncStatus("");
    } catch (error) {
      console.error("Failed to queue body weight:", error);
      setWeightSyncStatus("Body weight saved locally; sync queue failed.");
    }
  }

  async function removeBodyWeight(entryDate) {
    updateBodyWeightEntries(
      bodyWeightEntries.filter((entry) => entry.date !== entryDate)
    );

    if (!session?.user?.id || !isSupabaseConfigured) {
      return;
    }

    try {
      await queueBodyWeightDelete(session.user.id, entryDate);
      setWeightSyncStatus("");
    } catch (error) {
      console.error("Failed to queue body-weight deletion:", error);
      setWeightSyncStatus("Body weight deleted locally; sync queue failed.");
    }
  }

  function toggleDailyCreatine() {
    if (creatineAutoDetected) {
      return;
    }

    const targetDate = selectedDate || getTodayKey();
    const nextLog = {
      ...dailyCreatineLog,
    };

    if (nextLog[targetDate]) {
      delete nextLog[targetDate];
    } else {
      nextLog[targetDate] = true;
    }

    setDailyCreatineLog(nextLog);
    saveDailyCreatineLog(nextLog, dailyCreatineLogStorageKeyRef.current);
  }

  async function toggleDailyCreatineReminder() {
    const nextValue = !dailyCreatineReminderEnabled;

    if (nextValue && canUseNativeCreatineNotifications()) {
      const result = await scheduleNativeCreatineNotifications({
        requestPermission: true,
        skippedDates: creatineReminderSkippedDates,
        time: dailyCreatineReminderTime,
      });

      if (result.status !== "scheduled") {
        setCreatineReminderStatus(
          result.status === "denied"
            ? "Notifications are disabled. Enable them for this app in iPhone Settings."
            : "The creatine reminder could not be scheduled."
        );
        return;
      }
    } else if (!nextValue) {
      await cancelNativeCreatineNotifications();
    }

    setDailyCreatineReminderEnabled(nextValue);
    saveDailyCreatineReminderEnabled(
      nextValue,
      dailyCreatineReminderStorageKeyRef.current
    );
    setCreatineReminderTick(Date.now());
    setCreatineReminderStatus("");
  }

  function updateDailyCreatineReminderTime(value) {
    const nextTime = normalizeTimeValue(value);

    setDailyCreatineReminderTime(nextTime);
    saveDailyCreatineReminderTime(
      nextTime,
      dailyCreatineReminderTimeStorageKeyRef.current
    );
    setCreatineReminderTick(Date.now());
  }

  function updateDailyCreatineReminderTimePart(part, value) {
    const nextHours = part === "hours" ? value : creatineReminderHours;
    const nextMinutes = part === "minutes" ? value : creatineReminderMinutes;

    updateDailyCreatineReminderTime(
      `${String(nextHours).padStart(2, "0")}:${String(nextMinutes).padStart(
        2,
        "0"
      )}`
    );
  }

  function updateDailyCalorieGoal(value) {
    const goal = Math.round(parseMacroValue(value));

    if (!goal) {
      return;
    }

    const targetDate = selectedDate || getTodayKey();

    setDailyCalorieGoal(goal);
    saveDailyCalorieGoal(goal, dailyCalorieGoalStorageKeyRef.current);
    setDailyCalorieGoalHistory((currentHistory) => {
      const nextHistory = upsertDailyCalorieGoalHistory(
        currentHistory,
        targetDate,
        goal
      );

      saveDailyCalorieGoalHistory(
        nextHistory,
        dailyCalorieGoalHistoryStorageKeyRef.current
      );

      return nextHistory;
    });

    if (session?.user?.id && isSupabaseConfigured) {
      queueNutritionTargetUpsert(
        session.user.id,
        {
          date: targetDate,
          goal,
          updatedAt: new Date().toISOString(),
        }
      )
        .then(() => {
          setCalorieTargetSyncStatus("");
        })
        .catch((error) => {
          console.error("Failed to queue daily calorie target:", error);
          setCalorieTargetSyncStatus(
            "Calorie goal saved locally; sync queue failed."
          );
        });
    }
  }

  const macroCards = [
    [
	      "Calories",
	      formatMacro(totals.calories, "cal"),
	      MACRO_COLORS.calories,
	      `color-mix(in srgb, ${MACRO_COLORS.calories} 14%, var(--surface))`,
    ],
    [
	      "Protein",
	      formatMacro(totals.protein),
	      MACRO_COLORS.protein,
	      `color-mix(in srgb, ${MACRO_COLORS.protein} 16%, var(--surface))`,
    ],
    [
	      "Carbs",
	      formatMacro(totals.carbs),
	      MACRO_COLORS.carbs,
	      `color-mix(in srgb, ${MACRO_COLORS.carbs} 16%, var(--surface))`,
    ],
    [
	      "Fat",
	      formatMacro(totals.fat),
	      MACRO_COLORS.fat,
	      `color-mix(in srgb, ${MACRO_COLORS.fat} 16%, var(--surface))`,
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
        <Utensils size={26} />
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

      <section
        aria-label="Body weight"
        onClick={() => {
          setWeightSheetInitialAdding(false);
          setWeightSheetOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setWeightSheetInitialAdding(false);
            setWeightSheetOpen(true);
          }
        }}
        role="button"
        style={{
          alignItems: "center",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          display: "grid",
          gap: "10px",
          gridTemplateColumns: "auto auto minmax(0, 1fr) auto",
          marginBottom: "14px",
          padding: "10px 12px",
          cursor: "pointer",
        }}
        tabIndex={0}
      >
        <Scale size={20} color="#ef6c00" />
        <strong>Body weight</strong>
        <span
          style={{
            color: latestBodyWeight ? "var(--text-h)" : "var(--text-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {latestBodyWeight
            ? `${latestBodyWeight.weight} ${latestBodyWeight.unit || "lb"}`
            : "No weight logged"}
        </span>
        <button
          aria-label="Add body weight"
          onClick={(event) => {
            event.stopPropagation();

            if (latestBodyWeight) {
              setWeightPickerOpen(true);
              return;
            }

            setWeightSheetInitialAdding(true);
            setWeightSheetOpen(true);
          }}
          style={{
            alignItems: "center",
            display: "inline-flex",
            justifyContent: "center",
            minHeight: "34px",
            minWidth: "34px",
            padding: 0,
          }}
          type="button"
        >
          <Plus size={18} />
        </button>
      </section>

	      <section
	        aria-label="Daily calorie goal"
	        onClick={() => setCalorieHistorySheetOpen(true)}
	        onKeyDown={(event) => {
	          if (event.key === "Enter" || event.key === " ") {
	            event.preventDefault();
	            setCalorieHistorySheetOpen(true);
	          }
	        }}
        role="button"
        style={{
          alignItems: "center",
          border: "1px solid var(--border)",
          borderRadius: "8px",
          cursor: "pointer",
          display: "grid",
          gap: "10px",
          gridTemplateColumns: "auto auto minmax(0, 1fr) auto",
          marginBottom: "14px",
          padding: "10px 12px",
        }}
        tabIndex={0}
      >
        <Target size={20} color="#1769aa" />
        <strong>Daily goal</strong>
        <span
          style={{
            color: calorieGoalValue ? "var(--text-h)" : "var(--text-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {calorieGoalValue
            ? `${formatMacro(calorieGoalValue, "cal")} calories`
            : "No calorie goal set"}
        </span>
        <button
          aria-label="Set daily calorie goal"
          onClick={(event) => {
            event.stopPropagation();
            setCalorieGoalPickerOpen(true);
          }}
          style={{
            alignItems: "center",
            display: "inline-flex",
            justifyContent: "center",
            minHeight: "34px",
            minWidth: "34px",
            padding: 0,
          }}
          type="button"
        >
          <Plus size={18} />
        </button>
	      </section>

      <section
        aria-label="Daily creatine"
        style={{
          alignItems: "center",
          background: creatineReminderDue ? "#fde8e8" : "transparent",
          border: creatineReminderDue
            ? "1px solid #8a1f11"
            : "1px solid var(--border)",
          borderRadius: "8px",
          display: "grid",
          gap: "8px",
          gridTemplateColumns: "auto minmax(0, 1fr) auto auto auto",
          marginBottom: "14px",
          padding: "10px 12px",
          WebkitTouchCallout: "none",
          WebkitUserSelect: "none",
          userSelect: "none",
        }}
      >
        <BicepsFlexed size={20} color="#6d4c41" />
        <strong>Creatine</strong>
        <button
          aria-label={`Set creatine reminder time. Currently ${creatineReminderTimeLabel}.`}
          onClick={() => setCreatineReminderTimePickerOpen(true)}
          style={{
            alignItems: "center",
            background: "#f7fbf7",
            border: "1px solid #b7d7bf",
            borderRadius: "8px",
            color: "#5f7f68",
            display: "inline-flex",
            gap: "5px",
            height: "34px",
            justifyContent: "center",
            padding: "0 8px",
            whiteSpace: "nowrap",
          }}
          title={`Set reminder time (currently ${creatineReminderTimeLabel})`}
          type="button"
        >
          <Clock3 size={17} />
          <span style={{ fontSize: "12px", fontWeight: 600 }}>
            {creatineReminderTimeLabel}
          </span>
        </button>
        <button
          aria-label={
            dailyCreatineReminderEnabled
              ? "Turn creatine reminder off"
              : "Turn creatine reminder on"
          }
          aria-pressed={dailyCreatineReminderEnabled}
          onClick={() => void toggleDailyCreatineReminder()}
          style={{
            alignItems: "center",
            background: dailyCreatineReminderEnabled ? "#e6f4ea" : "#f7fbf7",
            border: dailyCreatineReminderEnabled
              ? "1px solid #137333"
              : "1px solid #b7d7bf",
            borderRadius: "8px",
            color: creatineReminderDue
              ? "#8a1f11"
              : dailyCreatineReminderEnabled
                ? "#137333"
                : "#5f7f68",
            display: "inline-flex",
            height: "34px",
            justifyContent: "center",
            padding: 0,
            touchAction: "manipulation",
            WebkitTouchCallout: "none",
            WebkitUserSelect: "none",
            userSelect: "none",
            width: "34px",
          }}
          title={
            dailyCreatineReminderEnabled
              ? `Creatine reminder is on at ${creatineReminderTimeLabel}.`
              : `Creatine reminder is off. Alert time is ${creatineReminderTimeLabel}.`
          }
          type="button"
        >
          {dailyCreatineReminderEnabled ? (
            <Bell size={17} />
          ) : (
            <BellOff size={17} />
          )}
        </button>
        <input
          aria-label={
            creatineAutoDetected
              ? "Creatine logged from food or recipe"
              : "Mark daily creatine taken"
          }
          checked={creatineTaken}
          disabled={creatineAutoDetected}
          onChange={toggleDailyCreatine}
          style={{
            accentColor: "#6d4c41",
            height: "22px",
            justifySelf: "center",
            margin: 0,
            width: "22px",
          }}
          title={
            creatineAutoDetected
              ? "Creatine was detected in today's food log."
              : "Mark creatine taken for this day."
          }
          type="checkbox"
        />
      </section>

      {creatineReminderStatus && (
        <p
          aria-live="polite"
          style={{
            color: "#8a1f11",
            fontSize: "12px",
            margin: "-8px 0 14px",
          }}
          role="status"
        >
          {creatineReminderStatus}
        </p>
      )}

      {creatineReminderTimePickerOpen && (
        <div
          aria-label="Creatine reminder time"
          aria-modal="true"
          onClick={() => setCreatineReminderTimePickerOpen(false)}
          role="dialog"
          style={{
            alignItems: "center",
            background: "rgba(0,0,0,.48)",
            display: "flex",
            inset: 0,
            justifyContent: "center",
            padding: "18px",
            position: "fixed",
            zIndex: 2300,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              boxShadow: "0 18px 48px rgba(0,0,0,.28)",
              boxSizing: "border-box",
              display: "grid",
              gap: "12px",
              maxWidth: "340px",
              minWidth: 0,
              overflow: "hidden",
              padding: "16px",
              width: "100%",
            }}
          >
            <h3
              style={{
                fontSize: "18px",
                lineHeight: 1.15,
                margin: 0,
              }}
            >
              Creatine Reminder
            </h3>
            <div
              style={{
                display: "grid",
                gap: "10px",
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
              }}
            >
              <CreatineTimePickerColumn
                label="Hour"
                onChange={(value) =>
                  updateDailyCreatineReminderTimePart("hours", value)
                }
                options={CREATINE_REMINDER_HOUR_OPTIONS}
                value={creatineReminderHours}
              />
              <CreatineTimePickerColumn
                label="Minute"
                onChange={(value) =>
                  updateDailyCreatineReminderTimePart("minutes", value)
                }
                options={CREATINE_REMINDER_MINUTE_OPTIONS}
                value={creatineReminderMinutes}
              />
            </div>
            <button
              onClick={() => setCreatineReminderTimePickerOpen(false)}
              style={{
                minHeight: "44px",
              }}
              type="button"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {calorieTargetSyncStatus && (
        <div
          style={{
            color: calorieTargetSyncStatus.includes("failed")
              ? "#8a1f11"
              : "var(--text-muted)",
            fontSize: "12px",
            margin: "-6px 0 12px",
          }}
        >
          {calorieTargetSyncStatus}
        </div>
      )}

      {weightSyncStatus && (
        <div
          style={{
            color: weightSyncStatus.includes("failed")
              ? "var(--danger-text)"
              : "var(--text-muted)",
            fontSize: "12px",
            margin: "-6px 0 12px",
          }}
        >
          {weightSyncStatus}
        </div>
      )}

      {weightSheetOpen && (
        <BodyWeightSheet
          entries={bodyWeightEntries}
          entryDate={selectedDate}
          initialAdding={weightSheetInitialAdding}
          onClose={() => {
            setWeightSheetOpen(false);
            setWeightSheetInitialAdding(false);
          }}
          onDelete={removeBodyWeight}
          onSave={saveBodyWeight}
        />
      )}

      <WeightPickerModal
        increment={0.1}
        isOpen={weightPickerOpen}
        onClose={() => setWeightPickerOpen(false)}
        onSelect={(value) => saveBodyWeight(selectedDate, value)}
        range={50}
        title="Select body weight"
        value={latestBodyWeight?.weight || ""}
      />

	      <WeightPickerModal
	        increment={50}
	        isOpen={calorieGoalPickerOpen}
	        onClose={() => setCalorieGoalPickerOpen(false)}
	        onSelect={updateDailyCalorieGoal}
	        title="Select daily calorie goal"
	        value={calorieGoalValue || 2000}
	        values={calorieGoalOptions}
	      />

      {calorieHistorySheetOpen && (
        <CalorieHistorySheet
          calorieGoal={dailyCalorieGoal}
          entries={entries}
          goalHistory={dailyCalorieGoalHistory}
          onClose={() => setCalorieHistorySheetOpen(false)}
          onSelectDate={(date) => {
            setSelectedDate(date);
            setCalorieHistorySheetOpen(false);
          }}
        />
      )}

	      <section
        aria-label="Current day"
        style={{
          border: "1px solid var(--border)",
          borderRadius: "8px",
          display: "grid",
          gap: dayPanelOpen ? "12px" : 0,
          marginBottom: "16px",
          overflow: "hidden",
        }}
      >
        <button
          aria-expanded={dayPanelOpen}
          onClick={() => setDayPanelOpen((open) => !open)}
          style={{
            alignItems: "center",
            background: "transparent",
            border: 0,
            borderRadius: 0,
            display: "grid",
            gap: "10px",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            padding: "12px",
            textAlign: "left",
          }}
          type="button"
        >
          <span
            style={{
              display: "grid",
              gap: "8px",
              minWidth: 0,
            }}
          >
            <span
              style={{
                alignItems: "baseline",
                display: "flex",
                gap: "8px",
                justifyContent: "space-between",
              }}
            >
              <strong>Day</strong>
              <span
                style={{
                  color: "var(--text-muted)",
                  fontSize: "12px",
                }}
              >
                {selectedDate}
              </span>
            </span>
            <span
              style={{
                color: "var(--text-muted)",
                fontSize: "13px",
              }}
            >
              {formatMacro(totals.calories, "cal")} /{" "}
              {calorieGoalValue ? formatMacro(calorieGoalValue, "cal") : "--"} cal
              {calorieGoalValue
                ? caloriesRemaining >= 0
                  ? ` · ${formatMacro(caloriesRemaining, "cal")} left`
                  : ` · ${formatMacro(Math.abs(caloriesRemaining), "cal")} over`
                : " · set a goal to track remaining"}
            </span>
            <span
              aria-hidden="true"
              style={{
                background: "var(--surface-muted)",
                borderRadius: "999px",
                display: "block",
                height: "8px",
                overflow: "hidden",
              }}
            >
              <span
                style={{
                  background: caloriesRemaining < 0 ? "#c62828" : "#1769aa",
                  display: "block",
                  height: "100%",
                  width: `${calorieGoalProgress}%`,
                }}
              />
            </span>
          </span>
          {dayPanelOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>

        {dayPanelOpen && (
          <div
            style={{
              display: "grid",
              gap: "14px",
              padding: "0 12px 12px",
            }}
          >
            <NutritionDateCalendar
              bodyWeightEntries={bodyWeightEntries}
              entries={entries}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />

            <section
              aria-label="Daily macro totals"
              style={{
                alignItems: "center",
                display: "grid",
                gap: "12px",
                gridTemplateColumns: "minmax(0, 1fr) auto",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gap: "6px",
                  gridTemplateColumns: "1fr 1fr",
                }}
              >
                {macroCards.map(([label, value, color, background]) => (
                  <div
                    key={label}
                    style={{
                      background,
                      borderRadius: "8px",
                      color,
                      padding: "8px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: "bold",
                      }}
                    >
                      {label}
                    </div>
                    <div
                      style={{
                        color: "var(--text-h)",
                        fontSize: "17px",
                        fontWeight: "bold",
                        lineHeight: 1.1,
                        marginTop: "3px",
                      }}
                    >
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: "grid",
                  gap: "6px",
                  justifyItems: "center",
                }}
              >
                <MacroDonutChart
                  segments={macroSegments}
                  totalCalories={totalMacroCalories}
                />
                <div
                  style={{
                    display: "grid",
                    fontSize: "11px",
                    gap: "3px",
                    width: "112px",
                  }}
                >
                  {macroSegments.map((segment) => (
                    <span
                      key={segment.label}
                      style={{
                        alignItems: "center",
                        color: "var(--text-muted)",
                        display: "flex",
                        gap: "5px",
                        justifyContent: "space-between",
                      }}
                    >
                      <span
                        style={{
                          alignItems: "center",
                          display: "inline-flex",
                          gap: "4px",
                        }}
                      >
                        <span
                          style={{
                            background: segment.color,
                            borderRadius: "999px",
                            display: "inline-block",
                            height: "8px",
                            width: "8px",
                          }}
                        />
                        {segment.label}
                      </span>
                      <strong style={{ color: "var(--text-h)" }}>
                        {Math.round(segment.percent)}%
                      </strong>
                    </span>
                  ))}
                </div>
              </div>
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
            Search source
            <select
              aria-label="Food search source"
              value={foodSearchSource}
              onChange={(event) => {
                setFoodSearchSource(event.target.value);
                setFoodAutocompleteSuppressed(false);
                setFoodAutocompleteSuggestions([]);
                setFoodSearchResults([]);
                setFatSecretDetailsById({});
                setLibrarySearchResults([]);
                setRecipeSearchResults([]);
                setFoodSearchStatus("");
              }}
              style={{
                boxSizing: "border-box",
                font: "inherit",
                minHeight: "42px",
                padding: "7px 10px",
                width: "100%",
              }}
            >
              <option value="fatsecret">FatSecret</option>
              <option value="usda">USDA FoodData Central</option>
              <option value="app">App library</option>
            </select>
            <div
              style={{
                display: "grid",
                gap: "8px",
                gridTemplateColumns:
                  foodSearchSource === "usda" || foodSearchSource === "fatsecret"
                    ? "minmax(0, 1fr) auto auto auto"
                    : "minmax(0, 1fr) auto auto",
              }}
            >
              <div
                style={{
                  minWidth: 0,
                  position: "relative",
                }}
              >
                <input
                  aria-label="Search foods"
                  autoComplete="off"
                  placeholder={
                    foodSearchSource === "usda"
                      ? "Chicken breast, Greek yogurt, cereal..."
                      : foodSearchSource === "fatsecret"
                        ? "Restaurant foods, brands, meals..."
                      : "Search foods or recipes..."
                  }
                  value={foodSearchQuery}
                  onChange={(event) => {
                    setFoodAutocompleteSuppressed(false);
                    setFoodSearchQuery(event.target.value);
                  }}
                  style={{
                    boxSizing: "border-box",
                    font: "inherit",
                    minHeight: "42px",
                    minWidth: 0,
                    padding: "7px 10px",
                    width: "100%",
                  }}
                />
                {foodSearchSource === "fatsecret" &&
                  !foodResultsSheetOpen &&
                  foodAutocompleteSuggestions.length > 0 && (
                    <div
                      style={{
                        background: "var(--surface-raised)",
                        border: "1px solid var(--border)",
                        borderRadius: "8px",
                        boxShadow: "0 8px 18px rgba(0,0,0,.16)",
                        display: "grid",
                        left: 0,
                        overflow: "hidden",
                        position: "absolute",
                        right: 0,
                        top: "calc(100% + 4px)",
                        zIndex: 5,
                      }}
                    >
                      {foodAutocompleteSuggestions.map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => {
                            setFoodSearchQuery(suggestion);
                            setFoodAutocompleteSuppressed(false);
                            setFoodAutocompleteSuggestions([]);
                            runFoodSearch(suggestion);
                          }}
                          type="button"
                          style={{
                            background: "transparent",
                            border: 0,
                            borderBottom: "1px solid var(--border)",
                            borderRadius: 0,
                            justifyContent: "flex-start",
                            minHeight: "38px",
                            padding: "8px 10px",
                            textAlign: "left",
                          }}
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  )}
              </div>
              <button
                aria-label="Clear food search"
                disabled={
                  !foodSearchQuery &&
                  foodSearchResults.length === 0 &&
                  librarySearchResults.length === 0 &&
                  recipeSearchResults.length === 0 &&
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
              {(foodSearchSource === "usda" || foodSearchSource === "fatsecret") && (
                <button
                  aria-label="Scan barcode"
                  onClick={() => {
                    setBarcodeScannerMode("food");
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
              )}
            </div>
          </label>

          {foodSearchSource === "fatsecret" && <FatSecretAttribution />}

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

          {hasFoodSearchResults && (
            <button
              onClick={() => setFoodResultsSheetOpen(true)}
              type="button"
              style={{
                minHeight: "42px",
              }}
            >
              View results
            </button>
          )}
        </form>

        {foodResultsSheetOpen && hasFoodSearchResults && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Food search results"
            onClick={() => setFoodResultsSheetOpen(false)}
            style={{
              alignItems: "flex-end",
              background: "rgba(0,0,0,.45)",
              display: "flex",
              inset: 0,
              justifyContent: "center",
              position: "fixed",
              zIndex: 2800,
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
                maxWidth: "680px",
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
                    Search results
                  </h2>
                  <div
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "12px",
                      marginTop: "3px",
                    }}
                  >
                    {foodSearchStatus}
                  </div>
                </div>
                <button
                  aria-label="Close food search results"
                  onClick={() => setFoodResultsSheetOpen(false)}
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

              {hasFatSecretSearchResults && (
                <FatSecretAttribution justify="end" />
              )}

              {foodSearchResults.length > 0 && (
                <div
                  style={{
                    display: "grid",
                    gap: "8px",
                  }}
                >
                  {foodSearchResults.map((food) => {
                    const isFatSecretResult = food.source === "fatsecret";
                    const fatSecretDetails =
                      fatSecretDetailsById[getFatSecretFoodKey(food)];
                    const hydratedFood = fatSecretDetails?.food || null;
                    const fatSecretPortionOptions = hydratedFood
                      ? getFatSecretPortionOptions(hydratedFood)
                      : [];
                    const fatSecretPrimaryOption =
                      fatSecretPortionOptions[0] || null;
                    const macros = isFatSecretResult
                      ? fatSecretPrimaryOption?.baseMacros || null
                      : getFoodServingMacros(food);
                    const servingDescription = hydratedFood
                      ? fatSecretPrimaryOption?.label ||
                        getServingDescription(hydratedFood)
                      : getServingDescription(food);
                    const sourceLabel = [
                      food.brandName,
                      formatFoodDataType(food.dataType),
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    const isHydratingFatSecret =
                      fatSecretDetails?.status === "loading";
                    const hasHydratedFatSecret =
                      isFatSecretResult && fatSecretDetails?.status === "loaded";
                    const hasFatSecretHydrationError =
                      isFatSecretResult && fatSecretDetails?.status === "error";
                    const isFatSecretHydrationSkipped =
                      isFatSecretResult && !fatSecretDetails;
                    const macroSummary = macros
                      ? `Per serving: ${formatMacro(
                          macros.calories,
                          "cal"
                        )} cal · ${formatMacro(
                          macros.protein
                        )} protein · ${formatMacro(
                          macros.carbs
                        )} carbs · ${formatMacro(macros.fat)} fat`
                      : "";
                    const summaryText = isFatSecretResult
                      ? hasHydratedFatSecret
                        ? macroSummary
                        : isHydratingFatSecret
                          ? "Loading detailed nutrition..."
                          : hasFatSecretHydrationError
                            ? "Detailed nutrition was not loaded. Tap Use to retry."
                            : isFatSecretHydrationSkipped
                              ? "Tap Use to load serving and nutrition details."
                              : "Serving and nutrition details load when you tap Use."
                      : macroSummary;

                    return (
                      <div
                        key={food.fdcId}
                        style={{
                          background: "var(--surface-muted)",
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
                              {sourceLabel ? `${sourceLabel} · ` : ""}
                              {servingDescription}
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
                          {summaryText}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {librarySearchResults.length > 0 && (
                <div
                  style={{
                    display: "grid",
                    gap: "8px",
                  }}
                >
                  <div
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "12px",
                      fontWeight: "bold",
                    }}
                  >
                    Supplemental library
                  </div>
                  {librarySearchResults.map((food) => {
                    const macros = getSupplementalFoodMacros(food);

                    return (
                      <div
                        key={food.id}
                        style={{
                          background: "var(--surface-muted)",
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
                              {food.name}
                            </strong>
                            <span
                              style={{
                                color: "var(--text-muted)",
                                display: "block",
                                fontSize: "12px",
                                marginTop: "3px",
                              }}
                            >
                              {[food.brand, "Library", getSupplementalServingDescription(food)]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </div>
                          <button
                            onClick={() => selectLibraryFoodResult(food)}
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
                          Per serving: {formatMacro(macros.calories, "cal")} cal ·{" "}
                          {formatMacro(macros.protein)} protein ·{" "}
                          {formatMacro(macros.carbs)} carbs ·{" "}
                          {formatMacro(macros.fat)} fat
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {recipeSearchResults.length > 0 && (
                <div
                  style={{
                    display: "grid",
                    gap: "8px",
                  }}
                >
                  <div
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "12px",
                      fontWeight: "bold",
                    }}
                  >
                    Recipes
                  </div>
                  {recipeSearchResults.map((recipe) => {
                    const macros = getSupplementalRecipeMacros(recipe);

                    return (
                      <div
                        key={recipe.id}
                        style={{
                          background: "var(--surface-muted)",
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
                              {recipe.name}
                            </strong>
                            <span
                              style={{
                                color: "var(--text-muted)",
                                display: "block",
                                fontSize: "12px",
                                marginTop: "3px",
                              }}
                            >
                              {["Recipe", getSupplementalRecipeServingDescription(recipe)]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </div>
                          <button
                            onClick={() => selectRecipeResult(recipe)}
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
                          Per serving: {formatMacro(macros.calories, "cal")} cal ·{" "}
                          {formatMacro(macros.protein)} protein ·{" "}
                          {formatMacro(macros.carbs)} carbs ·{" "}
                          {formatMacro(macros.fat)} fat
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <button
                  onClick={() => setFoodResultsSheetOpen(false)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {recipeCropOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Crop recipe image"
            onClick={() => setRecipeCropOpen(false)}
            style={{
              alignItems: "flex-end",
              background: "rgba(0,0,0,.45)",
              display: "flex",
              inset: 0,
              justifyContent: "center",
              position: "fixed",
              zIndex: 2750,
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
                maxHeight: "90vh",
                maxWidth: "560px",
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
                    Crop Ingredients
                  </h2>
                  <div
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "12px",
                      marginTop: "3px",
                    }}
                  >
                    Move and resize the box around the yield and ingredients.
                  </div>
                </div>
                <button
                  aria-label="Close cropper"
                  onClick={() => setRecipeCropOpen(false)}
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

              <div
                style={{
                  background: "var(--surface-muted)",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  overflow: "hidden",
                  position: "relative",
                  touchAction: "none",
                  width: "100%",
                }}
              >
                <img
                  alt=""
                  ref={recipeCropImageRef}
                  src={recipeCropImageDataUrl}
                  style={{
                    display: "block",
                    height: "auto",
                    userSelect: "none",
                    width: "100%",
                  }}
                />
                <div
                  aria-label="Selected recipe crop"
                  onPointerDown={(event) =>
                    startRecipeCropInteraction(event, "move")
                  }
                  role="button"
                  style={{
                    border: "2px solid rgba(255,255,255,.96)",
                    borderRadius: "8px",
                    boxShadow: "0 0 0 999px rgba(0,0,0,.34)",
                    boxSizing: "border-box",
                    cursor: "move",
                    height: `${recipeCrop.height * 100}%`,
                    left: `${recipeCrop.x * 100}%`,
                    position: "absolute",
                    top: `${recipeCrop.y * 100}%`,
                    width: `${recipeCrop.width * 100}%`,
                  }}
                  tabIndex={0}
                >
                  <div
                    aria-hidden="true"
                    onPointerDown={(event) =>
                      startRecipeCropInteraction(event, "resize-start")
                    }
                    style={{
                      background: "var(--accent)",
                      border: "2px solid var(--surface-raised)",
                      borderRadius: "999px",
                      cursor: "nwse-resize",
                      height: "24px",
                      left: "-12px",
                      position: "absolute",
                      top: "-12px",
                      width: "24px",
                    }}
                  />
                  <div
                    aria-hidden="true"
                    onPointerDown={(event) =>
                      startRecipeCropInteraction(event, "resize")
                    }
                    style={{
                      background: "var(--accent)",
                      border: "2px solid var(--surface-raised)",
                      borderRadius: "999px",
                      bottom: "-12px",
                      cursor: "nwse-resize",
                      height: "24px",
                      position: "absolute",
                      right: "-12px",
                      width: "24px",
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gap: "8px",
                  gridTemplateColumns: "auto minmax(0, 1fr) auto",
                }}
              >
                <button
                  onClick={() => setRecipeCrop(DEFAULT_RECIPE_CROP)}
                  type="button"
                  style={{
                    minHeight: "42px",
                    padding: "7px 12px",
                  }}
                >
                  Reset
                </button>
                <button
                  onClick={() => setRecipeCropOpen(false)}
                  type="button"
                  style={{
                    minHeight: "42px",
                  }}
                >
                  Cancel
                </button>
                <button
                  disabled={recipeImageImportLoading}
                  onClick={processRecipeCrop}
                  type="button"
                  style={{
                    minHeight: "42px",
                    padding: "7px 12px",
                  }}
                >
                  Use crop
                </button>
              </div>
            </div>
          </div>
        )}

        {recipeCameraOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Scan recipe"
            onClick={() => setRecipeCameraOpen(false)}
            style={{
              alignItems: "flex-end",
              background: "rgba(0,0,0,.45)",
              display: "flex",
              inset: 0,
              justifyContent: "center",
              position: "fixed",
              zIndex: 2700,
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
                maxHeight: "86vh",
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
                    Scan Recipe
                  </h2>
                  <div
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "12px",
                      marginTop: "3px",
                    }}
                  >
                    Capture a sharp still image of the yield and ingredients.
                  </div>
                </div>
                <button
                  aria-label="Close recipe scanner"
                  onClick={() => setRecipeCameraOpen(false)}
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

              <div
                style={{
                  aspectRatio: "3 / 4",
                  background: "var(--surface-muted)",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  overflow: "hidden",
                  position: "relative",
                  width: "100%",
                }}
              >
                <video
                  ref={recipeCameraVideoRef}
                  muted
                  playsInline
                  style={{
                    height: "100%",
                    objectFit: "cover",
                    width: "100%",
                  }}
                />
                <div
                  aria-hidden="true"
                  style={{
                    border: "2px solid rgba(255,255,255,.92)",
                    borderRadius: "10px",
                    boxShadow: "0 0 0 999px rgba(0,0,0,.16)",
                    inset: "8%",
                    position: "absolute",
                  }}
                />
              </div>

              {recipeCameraStatus && (
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "13px",
                  }}
                >
                  {recipeCameraStatus}
                </div>
              )}

              <div
                style={{
                  display: "grid",
                  gap: "8px",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                }}
              >
                <button
                  onClick={() => setRecipeCameraOpen(false)}
                  type="button"
                  style={{
                    minHeight: "42px",
                  }}
                >
                  Cancel
                </button>
                <button
                  disabled={recipeImageImportLoading}
                  onClick={captureRecipeCameraImage}
                  type="button"
                  style={{
                    minHeight: "42px",
                    padding: "7px 12px",
                  }}
                >
                  Capture
                </button>
              </div>
            </div>
          </div>
        )}

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
              zIndex: 2700,
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
                    Scan a UPC/EAN barcode, then search{" "}
                    {barcodeScannerMode === "recipe"
                      ? recipeIngredientSearchSource === "fatsecret"
                        ? "FatSecret ingredients"
                        : "USDA ingredients"
                      : foodSearchSource === "fatsecret"
                        ? "FatSecret foods"
                        : "USDA branded foods"}
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

              <div
                style={{
                  aspectRatio: "4 / 3",
                  background: "var(--surface-muted)",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  overflow: "hidden",
                  position: "relative",
                  width: "100%",
                }}
              >
                <video
                  ref={barcodeVideoRef}
                  muted
                  playsInline
                  style={{
                    height: "100%",
                    objectFit: "cover",
                    width: "100%",
                  }}
                />
                <div
                  aria-hidden="true"
                  style={{
                    border: "2px solid rgba(255,255,255,.92)",
                    borderRadius: "10px",
                    boxShadow: "0 0 0 999px rgba(0,0,0,.22)",
                    height: "34%",
                    left: "10%",
                    position: "absolute",
                    right: "10%",
                    top: "33%",
                  }}
                />
                <div
                  aria-hidden="true"
                  style={{
                    background: "rgba(255,255,255,.88)",
                    height: "2px",
                    left: "14%",
                    position: "absolute",
                    right: "14%",
                    top: "50%",
                  }}
                />
              </div>

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
                  UPC/EAN
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
                      placeholder="Enter barcode manually"
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

          <label
            style={{
              display: "grid",
              gap: "5px",
            }}
          >
            Meal
            <MealSelect
              ariaLabel="Meal"
              options={mealSelectOptions}
              value={normalizeMeal(entryDraft.meal)}
              onChange={(event) => updateEntryDraftMeal(event.target.value)}
            />
          </label>

          {(selectedFood || editingServingBasis) && (
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
                <div
                  style={{
                    display: "grid",
                    gap: "8px",
                    gridTemplateColumns: selectedFood
                      ? "minmax(92px, 112px) minmax(0, 1fr)"
                      : "minmax(0, 1fr)",
                  }}
                >
                  <input
                    ref={servingAmountInputRef}
                    aria-label="Serving amount"
                    inputMode="decimal"
                    value={servingAmount}
                    onChange={(event) => updateServingAmount(event.target.value)}
                    style={{
                      boxSizing: "border-box",
                      font: "inherit",
                      minHeight: "42px",
                      minWidth: 0,
                      padding: "7px 10px",
                      width: "100%",
                    }}
                  />
                  {selectedFood && (
                    <select
                      aria-label="Serving unit"
                      value={servingUnit}
                      onChange={(event) => updateServingUnit(event.target.value)}
                      style={{
                        boxSizing: "border-box",
                        font: "inherit",
                        minHeight: "42px",
                        minWidth: 0,
                        overflow: "hidden",
                        padding: "7px 10px",
                        textOverflow: "ellipsis",
                        width: "100%",
                      }}
                    >
                      {selectedFood.portionOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </label>
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "12px",
                }}
              >
                Serving basis:{" "}
                {selectedFood
                  ? `1 serving = ${selectedFood.servingDescription}`
                  : editingServingBasis.label}
                .
                Values below update as the amount or unit changes.
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
            onClick={addOrUpdateEntry}
            style={{
              alignItems: "center",
              display: "inline-flex",
              gap: "6px",
              justifyContent: "center",
              minHeight: "42px",
            }}
          >
            {!editingEntryId && <Utensils size={18} />}
            {editingEntryId ? "Update Food" : "Add Food"}
          </button>

          <button
            disabled={copyFoodSourceDates.length === 0}
            onClick={openCopyFoodSheet}
            style={{
              alignItems: "center",
              display: "inline-flex",
              gap: "6px",
              justifyContent: "center",
              minHeight: "42px",
            }}
            type="button"
          >
            <CalendarPlus size={18} />
            Add Food from another day
          </button>

          <button
            disabled={!entryDraft.name.trim()}
            onClick={openLibrarySheet}
            style={{
              alignItems: "center",
              display: "inline-flex",
              gap: "6px",
              justifyContent: "center",
              minHeight: "42px",
            }}
            type="button"
          >
            <BookPlus size={18} />
            Add to library
          </button>

          <button
            onClick={openRecipeSheet}
            style={{
              alignItems: "center",
              display: "inline-flex",
              gap: "6px",
              justifyContent: "center",
              minHeight: "42px",
            }}
            type="button"
          >
            <ChefHat size={18} />
            Create recipe
          </button>

          <button
            onClick={openLibraryManager}
            style={{
              alignItems: "center",
              display: "inline-flex",
              gap: "6px",
              justifyContent: "center",
              minHeight: "42px",
            }}
            type="button"
          >
            <Library size={18} />
            Manage library
          </button>
        </div>
      </section>

      {copyFoodSheetOpen && (
        <div
          aria-label="Add food from another day"
          aria-modal="true"
          onClick={closeCopyFoodSheet}
          role="dialog"
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
              <div>
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
                  <Utensils size={18} color="#fbc02d" />
                  Add food from another day
                </h2>
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "12px",
                    marginTop: "3px",
                  }}
                >
                  Copy meals or individual foods into {selectedDate}.
                </div>
              </div>
              <button
                aria-label="Close add food from another day"
                onClick={closeCopyFoodSheet}
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

            {copyFoodSourceDates.length === 0 ? (
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
                No other logged days are available.
              </div>
            ) : (
              <>
                <label
                  style={{
                    display: "grid",
                    gap: "5px",
                  }}
                >
                  Day
                  <select
                    value={copyFoodSourceDate}
                    onChange={(event) => {
                      setCopyFoodSourceDate(event.target.value);
                      setCopyFoodStatus("");
                    }}
                    style={{
                      boxSizing: "border-box",
                      font: "inherit",
                      minHeight: "42px",
                      padding: "7px 10px",
                      width: "100%",
                    }}
                  >
                    {copyFoodSourceDates.map((date) => {
                      const count = entries.filter((entry) => entry.date === date).length;

                      return (
                        <option key={date} value={date}>
                          {date} · {count} {count === 1 ? "food" : "foods"}
                        </option>
                      );
                    })}
                  </select>
                </label>

                <div
                  style={{
                    display: "grid",
                    gap: "10px",
                  }}
                >
                  {copyFoodMealGroups.map((group) => (
                    <section
                      key={group.meal}
                      style={{
                        background: "var(--surface-muted)",
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
                            display: "grid",
                            gap: "3px",
                            minWidth: 0,
                          }}
                        >
                          <strong
                            style={{
                              alignItems: "center",
                              display: "inline-flex",
                              gap: "6px",
                            }}
                          >
                            <MealIcon meal={group.meal} />
                            {group.label}
                          </strong>
                          <span
                            style={{
                              color: "var(--text-muted)",
                              fontSize: "12px",
                            }}
                          >
                            <MealMacroSummary totals={group.totals} />
                          </span>
                        </div>
                        <button
                          onClick={() =>
                            openCopyDestinationDialog(group.entries, group.label)
                          }
                          type="button"
                        >
                          Add meal
                        </button>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gap: "6px",
                        }}
                      >
                        {group.entries.map((entry) => (
                          <div
                            key={entry.id}
                            style={{
                              alignItems: "center",
                              background: "var(--surface-raised)",
                              border: "1px solid var(--border)",
                              borderRadius: "8px",
                              display: "grid",
                              gap: "8px",
                              gridTemplateColumns: "minmax(0, 1fr) auto",
                              padding: "9px",
                            }}
                          >
                            <div
                              style={{
                                minWidth: 0,
                              }}
                            >
                              <strong
                                style={{
                                  color: "var(--text-h)",
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
                                {formatMacro(entry.carbs)} carbs ·{" "}
                                {formatMacro(entry.fat)} fat
                                {entry.servingDescription
                                  ? ` · ${entry.servingDescription}`
                                  : ""}
                              </span>
                            </div>
                            <button
                              onClick={() =>
                                openCopyDestinationDialog([entry], entry.name)
                              }
                              type="button"
                            >
                              Add
                            </button>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>

                {copyFoodStatus && (
                  <div
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "12px",
                    }}
                  >
                    {copyFoodStatus}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {pendingCopySelection && (
        <div
          aria-label="Choose destination meal"
          aria-modal="true"
          onClick={closeCopyDestinationDialog}
          role="dialog"
          style={{
            alignItems: "center",
            background: "rgba(0,0,0,.48)",
            display: "flex",
            inset: 0,
            justifyContent: "center",
            padding: "18px",
            position: "fixed",
            zIndex: 2300,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              boxShadow: "0 18px 48px rgba(0,0,0,.28)",
              boxSizing: "border-box",
              display: "grid",
              gap: "12px",
              maxWidth: "420px",
              padding: "16px",
              width: "100%",
            }}
          >
            <div
              style={{
                display: "grid",
                gap: "4px",
              }}
            >
              <h3
                style={{
                  fontSize: "18px",
                  lineHeight: 1.15,
                  margin: 0,
                }}
              >
                Add to meal
              </h3>
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "12px",
                }}
              >
                {pendingCopySelection.entries.length === 1
                  ? pendingCopySelection.label
                  : `${pendingCopySelection.entries.length} foods from ${pendingCopySelection.label}`}
              </div>
            </div>

            <label
              style={{
                display: "grid",
                gap: "5px",
              }}
            >
              Meal for {selectedDate}
              <MealSelect
                ariaLabel="Destination meal"
                options={copyDestinationMealOptions}
                value={copyDestinationMeal}
                onChange={(event) => setCopyDestinationMeal(event.target.value)}
              />
            </label>

            <div
              style={{
                display: "grid",
                gap: "8px",
                gridTemplateColumns: "1fr 1fr",
              }}
            >
              <button
                onClick={closeCopyDestinationDialog}
                style={{
                  minHeight: "46px",
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={confirmCopySelection}
                style={{
                  minHeight: "46px",
                }}
                type="button"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingMealCopyEntry && (
        <div
          aria-label="Copy food to meal"
          aria-modal="true"
          onClick={closeMealCopyDialog}
          role="dialog"
          style={{
            alignItems: "center",
            background: "rgba(0,0,0,.48)",
            display: "flex",
            inset: 0,
            justifyContent: "center",
            padding: "18px",
            position: "fixed",
            zIndex: 2300,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border)",
              borderRadius: "10px",
              boxShadow: "0 18px 48px rgba(0,0,0,.28)",
              boxSizing: "border-box",
              display: "grid",
              gap: "12px",
              maxWidth: "420px",
              padding: "16px",
              width: "100%",
            }}
          >
            <div
              style={{
                display: "grid",
                gap: "4px",
              }}
            >
              <h3
                style={{
                  fontSize: "18px",
                  lineHeight: 1.15,
                  margin: 0,
                }}
              >
                Copy to meal
              </h3>
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "12px",
                }}
              >
                {pendingMealCopyEntry.name}
              </div>
            </div>

            <label
              style={{
                display: "grid",
                gap: "5px",
              }}
            >
              Meal for {selectedDate}
              <MealSelect
                ariaLabel="Copy destination meal"
                options={mealCopyDestinationMealOptions}
                value={mealCopyDestinationMeal}
                onChange={(event) =>
                  setMealCopyDestinationMeal(event.target.value)
                }
              />
            </label>

            <div
              style={{
                display: "grid",
                gap: "8px",
                gridTemplateColumns: "1fr 1fr",
              }}
            >
              <button
                onClick={closeMealCopyDialog}
                style={{
                  minHeight: "46px",
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={confirmMealCopy}
                style={{
                  minHeight: "46px",
                }}
                type="button"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      )}

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
	              gap: "10px",
	            }}
	          >
		            {visibleMealGroups.map((group) => {
	              const hasEntries = group.entries.length > 0;

	              return (
	                <section
	                  key={group.meal}
	                  aria-label={`${group.label} foods`}
	                  style={{
	                    border: "1px solid var(--border)",
	                    borderRadius: "8px",
	                    overflow: "hidden",
	                  }}
	                >
	                  <button
	                    aria-expanded={group.expanded}
	                    disabled={!hasEntries}
	                    onClick={() =>
	                      setExpandedMealGroups((current) => ({
	                        ...current,
	                        [group.meal]: !current[group.meal],
	                      }))
	                    }
	                    style={{
	                      alignItems: "center",
	                      background: "var(--surface-muted)",
	                      border: 0,
	                      borderRadius: 0,
	                      color: hasEntries ? "var(--text-h)" : "var(--text-muted)",
	                      cursor: hasEntries ? "pointer" : "default",
	                      display: "grid",
	                      gap: "8px",
	                      gridTemplateColumns: "minmax(0, 1fr) auto",
	                      minHeight: "54px",
	                      padding: "10px",
	                      textAlign: "left",
	                      width: "100%",
	                    }}
	                    type="button"
	                  >
	                    <span
	                      style={{
	                        display: "grid",
	                        gap: "3px",
	                        minWidth: 0,
	                      }}
	                    >
		                      <strong
		                        style={{
		                          alignItems: "center",
		                          display: "inline-flex",
		                          gap: "6px",
		                        }}
		                      >
		                        <MealIcon meal={group.meal} />
		                        {group.label}
		                      </strong>
	                      <span
	                        style={{
	                          color: "var(--text-muted)",
	                          fontSize: "12px",
	                          overflow: "hidden",
	                          textOverflow: "ellipsis",
	                          whiteSpace: "nowrap",
	                        }}
	                      >
		                        {hasEntries ? (
		                          <MealMacroSummary totals={group.totals} />
		                        ) : (
		                          "No foods logged"
		                        )}
		                      </span>
	                    </span>
	                    {hasEntries ? (
	                      group.expanded ? (
	                        <ChevronUp size={18} />
	                      ) : (
	                        <ChevronDown size={18} />
	                      )
	                    ) : null}
	                  </button>

	                  {hasEntries && group.expanded && (
	                    <div
	                      style={{
	                        display: "grid",
	                        padding: "0 10px",
	                      }}
	                    >
	                      {group.entries.map((entry) => {
	                        const recipeId = entry.recipeId
	                          ? String(entry.recipeId)
	                          : "";
	                        const recipeExpanded = Boolean(
	                          expandedRecipeEntries[String(entry.id)]
	                        );
	                        const recipeIngredients =
	                          recipeIngredientsByRecipeId[recipeId] || [];
	                        const recipeIngredientsLoading = Boolean(
	                          recipeIngredientLoadingByRecipeId[recipeId]
	                        );
	                        const recipeIngredientsError =
	                          recipeIngredientErrorByRecipeId[recipeId] || "";

	                        return (
	                        <div
	                          key={entry.id}
	                          onClick={() => editEntry(entry)}
	                          onKeyDown={(event) => {
	                            if (event.key === "Enter" || event.key === " ") {
	                              event.preventDefault();
	                              editEntry(entry);
	                            }
	                          }}
	                          role="button"
	                          style={{
	                            alignItems: "center",
	                            borderTop: "1px solid var(--border)",
	                            cursor: "pointer",
		                            display: "grid",
		                            gap: "8px",
		                            gridTemplateColumns:
		                              "minmax(0, 1fr) minmax(108px, auto) auto",
		                            padding: "9px 0",
		                          }}
		                          tabIndex={0}
		                        >
		                          <div
		                            style={{
		                              alignItems: "center",
		                              display: "grid",
		                              gap: "8px",
		                              gridColumn: "1 / -1",
		                              gridTemplateColumns: entry.recipeId
		                                ? "minmax(0, 1fr) auto"
		                                : "minmax(0, 1fr)",
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
		                            {entry.recipeId && (
		                              <button
		                                aria-expanded={recipeExpanded}
		                                aria-label={`${recipeExpanded ? "Hide" : "Show"} ${entry.name} ingredients`}
		                                onClick={(event) => {
		                                  event.stopPropagation();
		                                  toggleRecipeEntryExpanded(entry);
		                                }}
		                                onKeyDown={(event) =>
		                                  event.stopPropagation()
		                                }
		                                style={{
		                                  alignItems: "center",
		                                  display: "inline-flex",
		                                  justifyContent: "center",
		                                  minHeight: "30px",
		                                  minWidth: "34px",
		                                  padding: "3px 7px",
		                                }}
		                                type="button"
		                              >
		                                {recipeExpanded ? (
		                                  <ChevronUp size={16} />
		                                ) : (
		                                  <ChevronDown size={16} />
		                                )}
		                              </button>
		                            )}
		                          </div>
		                          <span
		                            style={{
		                              color: "var(--text-muted)",
		                              fontSize: "12px",
		                              minWidth: 0,
		                              overflow: "hidden",
		                              textOverflow: "ellipsis",
		                              whiteSpace: "nowrap",
		                            }}
		                          >
		                            {formatMacro(entry.calories, "cal")} cal ·{" "}
		                            {formatMacro(entry.protein)} protein ·{" "}
		                            {formatMacro(entry.carbs)} carbs ·{" "}
		                            {formatMacro(entry.fat)} fat
		                            {entry.servingDescription
		                              ? ` · ${entry.servingDescription}`
		                              : ""}
		                          </span>

		                          <MealSelect
		                            ariaLabel={`Move ${entry.name} to meal`}
		                            onClick={(event) => event.stopPropagation()}
		                            onChange={(event) => {
		                              event.stopPropagation();
		                              updateEntryMeal(entry.id, event.target.value);
		                            }}
		                            onKeyDown={(event) => event.stopPropagation()}
		                            options={getMealMoveOptions(dayEntries, entry.meal)}
		                            value={normalizeMeal(entry.meal)}
		                            selectStyle={{
		                              minHeight: "34px",
		                              minWidth: 0,
		                              paddingBottom: "4px",
		                              paddingTop: "4px",
		                            }}
		                          />
	
		                          <button
	                            aria-label={`Remove ${entry.name}`}
	                            onClick={(event) => {
	                              event.stopPropagation();
	                              removeEntry(entry.id);
	                            }}
	                            style={{
	                              alignItems: "center",
	                              display: "inline-flex",
	                              justifyContent: "center",
	                              minHeight: "34px",
	                              minWidth: "38px",
	                              padding: "4px 8px",
	                            }}
	                            type="button"
	                          >
	                            <Trash2 size={17} />
	                          </button>
	                          {entry.recipeId && recipeExpanded && (
	                            <div
	                              style={{
	                                background: "var(--surface-muted)",
	                                border: "1px solid var(--border)",
	                                borderRadius: "8px",
	                                display: "grid",
	                                gap: "6px",
	                                gridColumn: "1 / -1",
	                                padding: "8px",
	                              }}
	                            >
	                              {recipeIngredientsLoading ? (
	                                <div
	                                  style={{
	                                    color: "var(--text-muted)",
	                                    fontSize: "12px",
	                                  }}
	                                >
	                                  Loading ingredients...
	                                </div>
	                              ) : recipeIngredientsError ? (
	                                <div
	                                  role="status"
	                                  style={{
	                                    color: "var(--danger-text)",
	                                    fontSize: "12px",
	                                  }}
	                                >
	                                  {recipeIngredientsError}
	                                </div>
	                              ) : recipeIngredients.length === 0 ? (
	                                <div
	                                  style={{
	                                    color: "var(--text-muted)",
	                                    fontSize: "12px",
	                                  }}
	                                >
	                                  No ingredients found.
	                                </div>
	                              ) : (
	                                recipeIngredients.map((ingredient) => (
	                                  <div
	                                    key={ingredient.id}
	                                    style={{
	                                      display: "grid",
	                                      gap: "2px",
	                                    }}
	                                  >
	                                    <strong
	                                      style={{
	                                        display: "block",
	                                        fontSize: "13px",
	                                        overflow: "hidden",
	                                        textOverflow: "ellipsis",
	                                        whiteSpace: "nowrap",
	                                      }}
	                                    >
	                                      {ingredient.name}
	                                    </strong>
	                                    <span
	                                      style={{
	                                        color: "var(--text-muted)",
	                                        fontSize: "12px",
	                                      }}
	                                    >
	                                      {ingredient.amount}{" "}
	                                      {getPortionUnitLabel(ingredient.unit)} ·{" "}
	                                      {formatMacro(
	                                        ingredient.calories,
	                                        "cal"
	                                      )}{" "}
	                                      cal · {formatMacro(ingredient.protein)}{" "}
	                                      protein · {formatMacro(ingredient.carbs)}{" "}
	                                      carbs · {formatMacro(ingredient.fat)} fat
	                                    </span>
	                                  </div>
	                                ))
	                              )}
	                            </div>
	                          )}
	                        </div>
	                        );
	                      })}
	                    </div>
	                  )}
	                </section>
	              );
	            })}
	          </div>
	        )}
      </section>

          </div>
        )}
      </section>

      {libraryManagerOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Manage supplemental library"
          onClick={() => setLibraryManagerOpen(false)}
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
              maxHeight: "84vh",
              maxWidth: "640px",
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
                    margin: 0,
                  }}
                >
                  Manage library
                </h2>
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "12px",
                    marginTop: "3px",
                  }}
                >
                  Search shared supplemental foods or recipes
                </div>
              </div>
              <button
                aria-label="Close library manager"
                onClick={() => setLibraryManagerOpen(false)}
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
                gridTemplateColumns: "1fr 1fr",
              }}
            >
              {[
                ["foods", "Foods"],
                ["recipes", "Recipes"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => {
                    setLibraryManagerMode(value);
                    setLibraryManagerFoods([]);
                    setLibraryManagerRecipes([]);
                    setLibraryManagerStatus("");
                  }}
                  style={{
                    background:
                      libraryManagerMode === value
                        ? "var(--accent-bg)"
                        : "var(--surface-muted)",
                    minHeight: "38px",
                  }}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>

            <form
              onSubmit={searchLibraryManager}
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
                Search {libraryManagerMode === "foods" ? "foods" : "recipes"}
                <div
                  style={{
                    display: "grid",
                    gap: "8px",
                    gridTemplateColumns: "minmax(0, 1fr) auto",
                  }}
                >
                  <input
                    value={libraryManagerQuery}
                    onChange={(event) => setLibraryManagerQuery(event.target.value)}
                    placeholder={
                      libraryManagerMode === "foods"
                        ? "Search library foods..."
                        : "Search library recipes..."
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
                  <button
                    disabled={libraryManagerLoading || !libraryManagerQuery.trim()}
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

            {libraryManagerStatus && (
              <div
                style={{
                  color: libraryManagerStatus.includes("failed")
                    ? "var(--danger-text)"
                    : "var(--text-muted)",
                  fontSize: "12px",
                }}
              >
                {libraryManagerStatus}
              </div>
            )}

            {libraryManagerMode === "foods" && libraryManagerFoods.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gap: "8px",
                }}
              >
                {libraryManagerFoods.map((food) => {
                  const macros = getSupplementalFoodMacros(food);

                  return (
                    <div
                      key={food.id}
                      style={{
                        background: "var(--surface-muted)",
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
                            {food.name}
                          </strong>
                          <span
                            style={{
                              color: "var(--text-muted)",
                              display: "block",
                              fontSize: "12px",
                              marginTop: "3px",
                            }}
                          >
                            {[food.brand, getSupplementalServingDescription(food)]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        </div>
                        <button
                          onClick={() => editLibraryFood(food)}
                          type="button"
                        >
                          Edit
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
                        {formatMacro(macros.carbs)} carbs · {formatMacro(macros.fat)} fat
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {libraryManagerMode === "recipes" && libraryManagerRecipes.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gap: "8px",
                }}
              >
                {libraryManagerRecipes.map((recipe) => {
                  const macros = getSupplementalRecipeMacros(recipe);

                  return (
                    <div
                      key={recipe.id}
                      style={{
                        background: "var(--surface-muted)",
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
                            {recipe.name}
                          </strong>
                          <span
                            style={{
                              color: "var(--text-muted)",
                              display: "block",
                              fontSize: "12px",
                              marginTop: "3px",
                            }}
                          >
                            {getSupplementalRecipeServingDescription(recipe)}
                          </span>
                        </div>
                        <button
                          disabled={libraryManagerLoading}
                          onClick={() => editLibraryRecipe(recipe)}
                          type="button"
                        >
                          Edit
                        </button>
                      </div>
                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "12px",
                        }}
                      >
                        Per serving: {formatMacro(macros.calories, "cal")} cal ·{" "}
                        {formatMacro(macros.protein)} protein ·{" "}
                        {formatMacro(macros.carbs)} carbs · {formatMacro(macros.fat)} fat
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => setLibraryManagerOpen(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {librarySheetOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add food to library"
          onClick={() => setLibrarySheetOpen(false)}
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
              <h2
                style={{
                  fontSize: "18px",
                  margin: 0,
                }}
              >
                {selectedLibraryFoodId ? "Edit library food" : "Add to food library"}
              </h2>
              <button
                aria-label="Close add to library"
                onClick={() => setLibrarySheetOpen(false)}
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  justifyContent: "center",
                  minHeight: "34px",
                  minWidth: "38px",
                  padding: "4px 8px",
                }}
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            {[
              ["name", "Food name"],
              ["brand", "Brand"],
            ].map(([field, label]) => (
              <label
                key={field}
                style={{
                  display: "grid",
                  gap: "5px",
                }}
              >
                {label}
                <input
                  value={libraryDraft[field]}
                  onChange={(event) =>
                    setLibraryDraft({
                      ...libraryDraft,
                      [field]: event.target.value,
                    })
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
            ))}

            <div
              style={{
                display: "grid",
                gap: "8px",
                gridTemplateColumns: "minmax(0, 1fr) minmax(130px, auto)",
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
                  inputMode="decimal"
                  value={libraryDraft.servingAmount}
                  onChange={(event) =>
                    setLibraryDraft({
                      ...libraryDraft,
                      servingAmount: event.target.value,
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
              <label
                style={{
                  display: "grid",
                  gap: "5px",
                }}
              >
                Unit
                <select
                  value={libraryDraft.servingUnit}
                  onChange={(event) =>
                    setLibraryDraft({
                      ...libraryDraft,
                      servingUnit: event.target.value,
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
                >
                  {PORTION_UNIT_OPTIONS.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

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
                    inputMode="decimal"
                    value={libraryDraft[field]}
                    onChange={(event) =>
                      setLibraryDraft({
                        ...libraryDraft,
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

            {libraryStatus && (
              <div
                style={{
                  color:
                    libraryStatus.includes("already") ||
                    libraryStatus.includes("required") ||
                    libraryStatus.includes("Sign in")
                      ? "var(--danger-text)"
                      : "var(--text-muted)",
                  fontSize: "12px",
                }}
              >
                {libraryStatus}
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: "8px",
                justifyContent: selectedLibraryFoodId ? "space-between" : "flex-end",
              }}
            >
              {selectedLibraryFoodId && (
                <button
                  disabled={librarySaving}
                  onClick={deleteLibraryFood}
                  type="button"
                >
                  Delete
                </button>
              )}
              <button
                onClick={() => setLibrarySheetOpen(false)}
                type="button"
              >
                Cancel
              </button>
              <button
                disabled={librarySaving}
                onClick={saveLibraryFood}
                type="button"
              >
                {librarySaving
                  ? selectedLibraryFoodId
                    ? "Updating..."
                    : "Adding..."
                  : selectedLibraryFoodId
                    ? "Update"
                    : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {recipeSheetOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Create recipe"
          onClick={closeRecipeSheet}
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
              maxHeight: "88vh",
              maxWidth: "680px",
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
                    margin: 0,
                  }}
                >
                  {selectedLibraryRecipeId ? "Edit recipe" : "Create recipe"}
                </h2>
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "12px",
                    marginTop: "3px",
                  }}
                >
                {selectedLibraryRecipeId
                  ? "Update a shared library recipe"
                  : "Build from USDA and supplemental library ingredients"}
                </div>
              </div>
              <button
                aria-label="Close create recipe"
                onClick={closeRecipeSheet}
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  justifyContent: "center",
                  minHeight: "34px",
                  minWidth: "38px",
                  padding: "4px 8px",
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
              <label
                style={{
                  display: "grid",
                  gap: "5px",
                }}
              >
                Recipe name
                <input
                  value={recipeDraft.name}
                  onChange={(event) =>
                    setRecipeDraft({
                      ...recipeDraft,
                      name: event.target.value,
                    })
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

              <label
                style={{
                  display: "grid",
                  gap: "5px",
                }}
              >
                Description
                <textarea
                  rows={2}
                  value={recipeDraft.description}
                  onChange={(event) =>
                    setRecipeDraft({
                      ...recipeDraft,
                      description: event.target.value,
                    })
                  }
                  style={{
                    boxSizing: "border-box",
                    font: "inherit",
                    minHeight: "64px",
                    padding: "7px 10px",
                    resize: "vertical",
                    width: "100%",
                  }}
                />
              </label>

              <div
                style={{
                  display: "grid",
                  gap: "8px",
                  gridTemplateColumns: "minmax(0, 1fr) minmax(120px, auto) minmax(0, 1fr)",
                }}
              >
                <label
                  style={{
                    display: "grid",
                    gap: "5px",
                    minWidth: 0,
                  }}
                >
                  Serving size
                  <input
                    inputMode="decimal"
                    value={recipeDraft.servingSize}
                    onChange={(event) =>
                      setRecipeDraft({
                        ...recipeDraft,
                        servingSize: event.target.value,
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
                <label
                  style={{
                    display: "grid",
                    gap: "5px",
                    minWidth: 0,
                  }}
                >
                  Unit
                  <select
                    value={recipeDraft.servingUnit}
                    onChange={(event) =>
                      setRecipeDraft({
                        ...recipeDraft,
                        servingUnit: event.target.value,
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
                  >
                    {PORTION_UNIT_OPTIONS.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label
                  style={{
                    display: "grid",
                    gap: "5px",
                    minWidth: 0,
                  }}
                >
                  Servings per recipe
                  <input
                    inputMode="decimal"
                    value={recipeDraft.servingsPerRecipe}
                    onChange={(event) =>
                      setRecipeDraft({
                        ...recipeDraft,
                        servingsPerRecipe: event.target.value,
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
              </div>
            </div>

            <form
              onSubmit={searchRecipeIngredients}
              style={{
                background: "var(--surface-muted)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                display: "grid",
                gap: "8px",
                padding: "10px",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gap: "8px",
                }}
              >
                <div
                  style={{
                    alignItems: "center",
                    display: "flex",
                    justifyContent: "flex-start",
                  }}
                >
                  <button
                    disabled={recipeImageImportLoading}
                    onClick={() => {
                      setRecipeCameraStatus("");
                      setRecipeCameraOpen(true);
                    }}
                    type="button"
                    style={{
                      alignItems: "center",
                      display: "inline-flex",
                      gap: "6px",
                      minHeight: "40px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <Camera size={16} />
                    {recipeImageImportLoading ? "Importing..." : "Scan recipe"}
                  </button>
                </div>
                <input
                  accept="image/*"
                  onChange={handleRecipeImageSelected}
                  ref={recipeImageInputRef}
                  style={{ display: "none" }}
                  type="file"
                />
                {recipeImageImportStatus && (
                  <div
                    style={{
                      color: recipeImageImportStatus.includes("failed")
                        ? "var(--danger-text)"
                        : "var(--text-muted)",
                      fontSize: "12px",
                    }}
                  >
                    {recipeImageImportStatus}
                  </div>
                )}
                {recipeImageImportRawText && (
                  <div
                    style={{
                      display: "grid",
                      gap: "6px",
                    }}
                  >
                    <button
                      onClick={() =>
                        setRecipeImageImportRawTextOpen((current) => !current)
                      }
                      type="button"
                      style={{
                        minHeight: "34px",
                        padding: "5px 8px",
                        textAlign: "left",
                      }}
                    >
                      {recipeImageImportRawTextOpen ? "Hide" : "Show"} OCR text
                    </button>
                    {recipeImageImportRawTextOpen && (
                      <pre
                        style={{
                          background: "var(--surface-raised)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          color: "var(--text-muted)",
                          font: "12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace",
                          margin: 0,
                          maxHeight: "180px",
                          overflow: "auto",
                          padding: "8px",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {recipeImageImportRawText}
                      </pre>
                    )}
                  </div>
                )}
                {recipeImageImportRows.length > 0 && (
                  <div
                    style={{
                      display: "grid",
                      gap: "6px",
                      maxHeight: "220px",
                      overflowY: "auto",
                    }}
                  >
                    {recipeImageImportRows.map((row, index) => (
                      <div
                        key={`${row.originalLine || row.ingredient}-${index}`}
                        style={{
                          background: "var(--surface-raised)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          display: "grid",
                          gap: "4px",
                          padding: "8px",
                        }}
                      >
                        <strong>{row.originalLine || row.ingredient}</strong>
                        <span
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "12px",
                          }}
                        >
                          {[row.amount, row.unit, row.ingredient]
                            .filter(Boolean)
                            .join(" ")}
                        </span>
                        <span
                          style={{
                            color: row.status?.includes("No ")
                              ? "var(--danger-text)"
                              : "var(--text-muted)",
                            fontSize: "12px",
                          }}
                        >
                          {row.matchName ? `${row.matchName} · ` : ""}
                          {row.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <label
                style={{
                  display: "grid",
                  gap: "5px",
                }}
              >
                Search source
                <select
                  aria-label="Recipe ingredient search source"
                  value={recipeIngredientSearchSource}
                  onChange={(event) => {
                    setRecipeIngredientSearchSource(event.target.value);
                    setRecipeIngredientAutocompleteSuggestions([]);
                    setRecipeIngredientResults([]);
                    setRecipeLibraryIngredientResults([]);
                    setRecipeSearchStatus("");
                  }}
                  style={{
                    boxSizing: "border-box",
                    font: "inherit",
                    minHeight: "42px",
                    padding: "7px 10px",
                    width: "100%",
                  }}
                >
                  <option value="fatsecret">FatSecret</option>
                  <option value="usda">USDA FoodData Central</option>
                  <option value="app">App library</option>
                </select>
              </label>

              <label
                style={{
                  display: "grid",
                  gap: "5px",
                }}
              >
                Find ingredient
                <div
                  style={{
                    display: "grid",
                    gap: "8px",
                    gridTemplateColumns:
                      recipeIngredientSearchSource === "fatsecret" ||
                      recipeIngredientSearchSource === "usda"
                        ? "minmax(0, 1fr) auto auto auto"
                        : "minmax(0, 1fr) auto auto",
                  }}
                >
                  <div
                    style={{
                      minWidth: 0,
                      position: "relative",
                    }}
                  >
                    <input
                      autoComplete="off"
                      placeholder={
                        recipeIngredientSearchSource === "fatsecret"
                          ? "Search foods or enter UPC..."
                          : recipeIngredientSearchSource === "usda"
                            ? "Search USDA or enter UPC..."
                            : "Search library foods..."
                      }
                      value={recipeIngredientQuery}
                      onChange={(event) =>
                        setRecipeIngredientQuery(event.target.value)
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
                    {recipeIngredientSearchSource === "fatsecret" &&
                      recipeIngredientAutocompleteSuggestions.length > 0 && (
                        <div
                          style={{
                            background: "var(--surface-raised)",
                            border: "1px solid var(--border)",
                            borderRadius: "8px",
                            boxShadow: "0 8px 18px rgba(0,0,0,.16)",
                            display: "grid",
                            left: 0,
                            overflow: "hidden",
                            position: "absolute",
                            right: 0,
                            top: "calc(100% + 4px)",
                            zIndex: 5,
                          }}
                        >
                          {recipeIngredientAutocompleteSuggestions.map((suggestion) => (
                            <button
                              key={suggestion}
                              onClick={() => {
                                setRecipeIngredientQuery(suggestion);
                                setRecipeIngredientAutocompleteSuggestions([]);
                                runRecipeIngredientSearch(suggestion);
                              }}
                              type="button"
                              style={{
                                background: "transparent",
                                border: 0,
                                borderBottom: "1px solid var(--border)",
                                borderRadius: 0,
                                justifyContent: "flex-start",
                                minHeight: "38px",
                                padding: "8px 10px",
                                textAlign: "left",
                              }}
                            >
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      )}
                  </div>
                  <button
                    aria-label="Clear ingredient search"
                    disabled={
                      !recipeIngredientQuery &&
                      recipeIngredientResults.length === 0 &&
                      recipeLibraryIngredientResults.length === 0 &&
                      !recipeSearchStatus
                    }
                    onClick={clearRecipeIngredientSearch}
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
                    disabled={recipeSearchLoading || !recipeIngredientQuery.trim()}
                    type="submit"
                    style={{
                      alignItems: "center",
                      display: "inline-flex",
                      gap: "6px",
                      justifyContent: "center",
                      minHeight: "42px",
                      padding: "7px 12px",
                    }}
                  >
                    <Search size={17} />
                    Search
                  </button>
                  {(recipeIngredientSearchSource === "fatsecret" ||
                    recipeIngredientSearchSource === "usda") && (
                    <button
                      aria-label="Scan ingredient barcode"
                      onClick={() => {
                        setBarcodeScannerMode("recipe");
                        setBarcodeStatus("");
                        setShowBarcodeScanner(true);
                      }}
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
                      <ScanBarcode size={18} />
                    </button>
                  )}
                </div>
              </label>

              {recipeIngredientSearchSource === "fatsecret" && (
                <FatSecretAttribution />
              )}

              {recipeSearchStatus && (
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "12px",
                  }}
                >
                  {recipeSearchStatus}
                </div>
              )}

              {(recipeIngredientResults.length > 0 ||
                recipeLibraryIngredientResults.length > 0) && (
                <div
                  style={{
                    display: "grid",
                    gap: "8px",
                    maxHeight: "280px",
                    overflowY: "auto",
                  }}
                >
                  {recipeIngredientResults.map((food) => {
                    const isFatSecretResult = food.source === "fatsecret";
                    const fatSecretDetails =
                      fatSecretDetailsById[getFatSecretFoodKey(food)];
                    const hydratedFood = fatSecretDetails?.food || null;
                    const fatSecretPortionOptions = hydratedFood
                      ? getFatSecretPortionOptions(hydratedFood)
                      : [];
                    const fatSecretPrimaryOption =
                      fatSecretPortionOptions[0] || null;
                    const macros = isFatSecretResult
                      ? fatSecretPrimaryOption?.baseMacros || null
                      : getFoodServingMacros(food);
                    const servingDescription = hydratedFood
                      ? fatSecretPrimaryOption?.label ||
                        getServingDescription(hydratedFood)
                      : getServingDescription(food);
                    const sourceLabel = isFatSecretResult
                      ? [
                          food.brandName,
                          "FatSecret",
                          servingDescription,
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : [food.brandName, "USDA", servingDescription]
                          .filter(Boolean)
                          .join(" · ");
                    const isHydratingFatSecret =
                      fatSecretDetails?.status === "loading";
                    const hasHydratedFatSecret =
                      isFatSecretResult && fatSecretDetails?.status === "loaded";
                    const hasFatSecretHydrationError =
                      isFatSecretResult && fatSecretDetails?.status === "error";
                    const isFatSecretHydrationSkipped =
                      isFatSecretResult && !fatSecretDetails;
                    const macroSummary = macros
                      ? `Per serving: ${formatMacro(
                          macros.calories,
                          "cal"
                        )} cal · ${formatMacro(
                          macros.protein
                        )} protein · ${formatMacro(
                          macros.carbs
                        )} carbs · ${formatMacro(macros.fat)} fat`
                      : "";
                    const summaryText = isFatSecretResult
                      ? hasHydratedFatSecret
                        ? macroSummary
                        : isHydratingFatSecret
                          ? "Loading detailed nutrition..."
                          : hasFatSecretHydrationError
                            ? "Detailed nutrition was not loaded. Tap Add to retry."
                            : isFatSecretHydrationSkipped
                              ? "Tap Add to load serving and nutrition details."
                              : "Serving and nutrition details load when you tap Add."
                      : macroSummary;

                    return (
                      <div
                        key={`recipe-${food.source || "fdc"}-${food.fdcId}`}
                        style={{
                          background: "var(--surface-raised)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          display: "grid",
                          gap: "6px",
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
                              {sourceLabel}
                            </span>
                          </div>
                          <button
                            onClick={() =>
                              addRecipeIngredientFromSearchFood(food)
                            }
                            type="button"
                          >
                            Add
                          </button>
                        </div>
                        <div
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "12px",
                          }}
                        >
                          {summaryText}
                        </div>
                      </div>
                    );
                  })}

                  {recipeLibraryIngredientResults.length > 0 && (
                    <div
                      style={{
                        color: "var(--text-muted)",
                        fontSize: "12px",
                        fontWeight: "bold",
                      }}
                    >
                      Supplemental library
                    </div>
                  )}

                  {recipeLibraryIngredientResults.map((food) => {
                    const macros = getSupplementalFoodMacros(food);

                    return (
                      <div
                        key={`recipe-library-${food.id}`}
                        style={{
                          background: "var(--surface-raised)",
                          border: "1px solid var(--border)",
                          borderRadius: "8px",
                          display: "grid",
                          gap: "6px",
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
                              {food.name}
                            </strong>
                            <span
                              style={{
                                color: "var(--text-muted)",
                                display: "block",
                                fontSize: "12px",
                                marginTop: "3px",
                              }}
                            >
                              {[food.brand, "Library", getSupplementalServingDescription(food)]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </div>
                          <button
                            onClick={() =>
                              addRecipeIngredient(
                                createRecipeIngredientFromLibraryFood(food)
                              )
                            }
                            type="button"
                          >
                            Add
                          </button>
                        </div>
                        <div
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "12px",
                          }}
                        >
                          Per serving: {formatMacro(macros.calories, "cal")} cal ·{" "}
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

            <section
              style={{
                display: "grid",
                gap: "8px",
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
                    fontSize: "15px",
                    margin: 0,
                  }}
                >
                  Ingredients
                </h3>
                <span
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "12px",
                  }}
                >
                  {recipeIngredients.length} added
                </span>
              </div>

              {recipeIngredients.length === 0 ? (
                <div
                  style={{
                    background: "var(--surface-muted)",
                    borderRadius: "8px",
                    color: "var(--text-muted)",
                    fontSize: "13px",
                    padding: "10px",
                    textAlign: "center",
                  }}
                >
                  No ingredients added.
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gap: "8px",
                  }}
                >
                  {recipeIngredients.map((ingredient) => (
                    <div
                      key={ingredient.id}
                      style={{
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
                            {ingredient.name}
                          </strong>
                          <span
                            style={{
                              color: "var(--text-muted)",
                              fontSize: "12px",
                            }}
                          >
                            {ingredient.sourceLabel} · 1 serving ={" "}
                            {ingredient.servingDescription}
                          </span>
                        </div>
                        <button
                          aria-label={`Remove ${ingredient.name}`}
                          onClick={() => removeRecipeIngredient(ingredient.id)}
                          style={{
                            alignItems: "center",
                            display: "inline-flex",
                            justifyContent: "center",
                            minHeight: "34px",
                            minWidth: "38px",
                            padding: "4px 8px",
                          }}
                          type="button"
                        >
                          <Trash2 size={17} />
                        </button>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gap: "8px",
                          gridTemplateColumns: "minmax(0, 1fr) minmax(120px, auto)",
                        }}
                      >
                        <input
                          aria-label={`${ingredient.name} amount`}
                          inputMode="decimal"
                          value={ingredient.amount}
                          onChange={(event) =>
                            updateRecipeIngredientAmount(
                              ingredient.id,
                              event.target.value
                            )
                          }
                          style={{
                            boxSizing: "border-box",
                            font: "inherit",
                            minHeight: "38px",
                            minWidth: 0,
                            padding: "7px 10px",
                            width: "100%",
                          }}
                        />
                        <select
                          aria-label={`${ingredient.name} unit`}
                          value={ingredient.unit}
                          onChange={(event) =>
                            updateRecipeIngredientUnit(
                              ingredient.id,
                              event.target.value
                            )
                          }
                          style={{
                            boxSizing: "border-box",
                            font: "inherit",
                            minHeight: "38px",
                            minWidth: 0,
                            padding: "7px 10px",
                            width: "100%",
                          }}
                        >
                          {ingredient.portionOptions.map((option) => (
                            <option key={option.key} value={option.key}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div
                        style={{
                          color: "var(--text-muted)",
                          fontSize: "12px",
                        }}
                      >
                        {formatMacro(ingredient.calories, "cal")} cal ·{" "}
                        {formatMacro(ingredient.protein)} protein ·{" "}
                        {formatMacro(ingredient.carbs)} carbs ·{" "}
                        {formatMacro(ingredient.fat)} fat
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div
              style={{
                background: "var(--accent-bg)",
                borderRadius: "8px",
                color: "var(--text-h)",
                display: "grid",
                gap: "4px",
                padding: "10px",
              }}
            >
              <strong>Recipe total</strong>
              <span
                style={{
                  color: "var(--text-muted)",
                  fontSize: "13px",
                }}
              >
                {formatMacro(recipeTotals.calories, "cal")} cal ·{" "}
                {formatMacro(recipeTotals.protein)} protein ·{" "}
                {formatMacro(recipeTotals.carbs)} carbs ·{" "}
                {formatMacro(recipeTotals.fat)} fat
              </span>
            </div>

            {recipeStatus && (
              <div
                style={{
                  color:
                    recipeStatus.includes("required") ||
                    recipeStatus.includes("Sign in") ||
                    recipeStatus.includes("matching") ||
                    recipeStatus.includes("ingredient")
                      ? "var(--danger-text)"
                      : "var(--text-muted)",
                  fontSize: "12px",
                }}
              >
                {recipeStatus}
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: "8px",
                justifyContent: selectedLibraryRecipeId ? "space-between" : "flex-end",
              }}
            >
              {selectedLibraryRecipeId && (
                <button
                  disabled={recipeSaving}
                  onClick={deleteRecipe}
                  type="button"
                >
                  Delete
                </button>
              )}
              <button onClick={closeRecipeSheet} type="button">
                Cancel
              </button>
              <button
                disabled={recipeSaving}
                onClick={saveRecipe}
                type="button"
              >
                {recipeSaving
                  ? selectedLibraryRecipeId
                    ? "Updating..."
                    : "Adding..."
                  : selectedLibraryRecipeId
                    ? "Update"
                    : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
