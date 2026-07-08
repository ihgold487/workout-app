import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarcodeFormat,
  BrowserMultiFormatReader,
} from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";
import {
  ChevronDown,
  ChevronUp,
  Plus,
  ScanBarcode,
  Scale,
  Search,
  Target,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import BodyWeightSheet from "./BodyWeightSheet";
import WeightPickerModal from "./WeightPickerModal";
import {
  deleteBodyWeightEntry,
  downloadBodyWeightEntries,
  uploadBodyWeightEntries,
  upsertBodyWeightEntry,
} from "../sync/bodyMeasurementCloudSync";
import { isSupabaseConfigured, supabase } from "../sync/supabaseClient";

const NUTRITION_LOG_KEY = "nutritionLogEntries";
const BODY_WEIGHT_LOG_KEY = "bodyWeightLogEntries";
const DAILY_CALORIE_GOAL_KEY = "dailyCalorieGoal";
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

const emptyEntry = {
  calories: "",
  carbs: "",
  fat: "",
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

function readDailyCalorieGoal() {
  try {
    const parsed = Number(localStorage.getItem(DAILY_CALORIE_GOAL_KEY));

    return Number.isFinite(parsed) && parsed > 0 ? parsed : "";
  } catch (error) {
    console.error("Failed to load daily calorie goal:", error);

    return "";
  }
}

function saveDailyCalorieGoal(goal) {
  if (!goal) {
    localStorage.removeItem(DAILY_CALORIE_GOAL_KEY);
    return;
  }

  localStorage.setItem(DAILY_CALORIE_GOAL_KEY, String(goal));
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

export default function NutritionView({ session = null }) {
  const [entries, setEntries] = useState(readNutritionEntries);
  const [bodyWeightEntries, setBodyWeightEntries] = useState(
    readBodyWeightEntries
  );
  const [dailyCalorieGoal, setDailyCalorieGoal] = useState(readDailyCalorieGoal);
  const [entryDraft, setEntryDraft] = useState(emptyEntry);
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [selectedDate, setSelectedDate] = useState(getTodayKey);
  const [dayPanelOpen, setDayPanelOpen] = useState(true);
  const [calorieGoalPickerOpen, setCalorieGoalPickerOpen] = useState(false);
  const [weightSheetInitialAdding, setWeightSheetInitialAdding] =
    useState(false);
  const [weightSyncStatus, setWeightSyncStatus] = useState("");
  const [weightSheetOpen, setWeightSheetOpen] = useState(false);
  const [weightPickerOpen, setWeightPickerOpen] = useState(false);
  const [foodSearchQuery, setFoodSearchQuery] = useState("");
  const [foodSearchSource, setFoodSearchSource] = useState("fatsecret");
  const [foodAutocompleteSuggestions, setFoodAutocompleteSuggestions] = useState([]);
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
  const [recipeStatus, setRecipeStatus] = useState("");
  const [recipeSaving, setRecipeSaving] = useState(false);
  const entryFormRef = useRef(null);
  const foodNameInputRef = useRef(null);
  const barcodeVideoRef = useRef(null);
  const barcodeControlsRef = useRef(null);
  const barcodeSearchHandlerRef = useRef(null);
  const fatSecretHydrationRunRef = useRef(0);

  const dayEntries = useMemo(
    () => entries.filter((entry) => entry.date === selectedDate),
    [entries, selectedDate]
  );
  const latestBodyWeight = useMemo(
    () =>
      [...bodyWeightEntries].sort((a, b) => b.date.localeCompare(a.date))[0] ||
      null,
    [bodyWeightEntries]
  );
  const totals = useMemo(() => totalEntries(dayEntries), [dayEntries]);
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
      color: "#137333",
      label: "Protein",
      percent: totalMacroCalories
        ? (macroCalories.protein / totalMacroCalories) * 100
        : 0,
      value: formatMacro(totals.protein),
    },
    {
      calories: macroCalories.carbs,
      color: "#b06000",
      label: "Carbs",
      percent: totalMacroCalories
        ? (macroCalories.carbs / totalMacroCalories) * 100
        : 0,
      value: formatMacro(totals.carbs),
    },
    {
      calories: macroCalories.fat,
      color: "#7b3fc7",
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
    if (!session?.user?.id || !isSupabaseConfigured) {
      return undefined;
    }

    let cancelled = false;

    async function syncBodyWeights() {
      setWeightSyncStatus("Syncing body weight...");

      try {
        const localEntries = readBodyWeightEntries();

        if (localEntries.length > 0) {
          await uploadBodyWeightEntries(localEntries, session);
        }

        const cloudEntries = await downloadBodyWeightEntries(session);

        if (cancelled) {
          return;
        }

        setBodyWeightEntries(cloudEntries);
        saveBodyWeightEntries(cloudEntries);
        setWeightSyncStatus("");
      } catch (error) {
        console.error("Failed to sync body weight entries:", error);

        if (!cancelled) {
          setWeightSyncStatus("Body weight sync failed. Local changes were kept.");
        }
      }
    }

    syncBodyWeights();

    return () => {
      cancelled = true;
    };
  }, [session]);

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
    if (foodSearchSource !== "fatsecret") {
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
  }, [foodSearchQuery, foodSearchSource]);

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

  function updateEntries(nextEntries) {
    setEntries(nextEntries);
    saveNutritionEntries(nextEntries);
  }

  function updateBodyWeightEntries(nextEntries) {
    setBodyWeightEntries(nextEntries);
    saveBodyWeightEntries(nextEntries);
  }

  function buildEntryPayload(entryId = Date.now()) {
    const name = entryDraft.name.trim();
    const existingEntry = entries.find((entry) => entry.id === entryId);

    if (!name) {
      return null;
    }

    return {
      ...entryDraft,
      calories: parseMacroValue(entryDraft.calories),
      carbs: parseMacroValue(entryDraft.carbs),
      date: selectedDate,
      fat: parseMacroValue(entryDraft.fat),
      id: entryId,
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
    };
  }

  function resetEntryForm() {
    setEntryDraft(emptyEntry);
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
        )
      );
    } else {
      updateEntries([...entries, entry]);
    }

    resetEntryForm();
  }

  function clearFoodSearch() {
    setFoodSearchQuery("");
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
    setFoodResultsSheetOpen(false);
    setServingAmount("1");
    setServingUnit(selectedOption?.key || "serving");
    setEntryDraft({
      calories: formatDraftMacro(scaledMacros.calories),
      carbs: formatDraftMacro(scaledMacros.carbs),
      fat: formatDraftMacro(scaledMacros.fat),
      name: selectedResult.brandName
        ? `${selectedResult.description} (${selectedResult.brandName})`
        : selectedResult.description || "",
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
    setFoodResultsSheetOpen(false);
    setServingAmount(String(food.serving_size || 1));
    setServingUnit(food.serving_unit || "serving");
    setEntryDraft({
      calories: formatDraftMacro(macros.calories),
      carbs: formatDraftMacro(macros.carbs),
      fat: formatDraftMacro(macros.fat),
      name: food.brand ? `${food.name} (${food.brand})` : food.name || "",
      protein: formatDraftMacro(macros.protein),
    });
    window.requestAnimationFrame(() => {
      entryFormRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      foodNameInputRef.current?.focus();
    });
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
    setFoodResultsSheetOpen(false);
    setServingAmount("1");
    setServingUnit("serving");
    setEntryDraft({
      calories: formatDraftMacro(scaledMacros.calories),
      carbs: formatDraftMacro(scaledMacros.carbs),
      fat: formatDraftMacro(scaledMacros.fat),
      name: recipe.name || "",
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
    setRecipeStatus("");
    setRecipeSheetOpen(true);
  }

  function closeRecipeSheet() {
    setRecipeSheetOpen(false);
    setRecipeStatus("");
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
    updateEntries(entries.filter((entry) => entry.id !== entryId));

    if (editingEntryId === entryId) {
      resetEntryForm();
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

    setWeightSyncStatus("Saving body weight...");

    try {
      await upsertBodyWeightEntry(nextEntry, session);
      setWeightSyncStatus("");
    } catch (error) {
      console.error("Failed to save body weight to cloud:", error);
      setWeightSyncStatus("Body weight saved locally; cloud save failed.");
    }
  }

  async function removeBodyWeight(entryDate) {
    updateBodyWeightEntries(
      bodyWeightEntries.filter((entry) => entry.date !== entryDate)
    );

    if (!session?.user?.id || !isSupabaseConfigured) {
      return;
    }

    setWeightSyncStatus("Deleting body weight...");

    try {
      await deleteBodyWeightEntry(entryDate, session);
      setWeightSyncStatus("");
    } catch (error) {
      console.error("Failed to delete body weight from cloud:", error);
      setWeightSyncStatus("Body weight deleted locally; cloud delete failed.");
    }
  }

  function updateDailyCalorieGoal(value) {
    const goal = Math.round(parseMacroValue(value));

    if (!goal) {
      return;
    }

    setDailyCalorieGoal(goal);
    saveDailyCalorieGoal(goal);
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
        onClick={() => setCalorieGoalPickerOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setCalorieGoalPickerOpen(true);
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
            <label
              style={{
                display: "grid",
                gap: "5px",
              }}
            >
              Date
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
                {foodSearchSource === "fatsecret" &&
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
                      ? "minmax(0, 1fr) minmax(120px, auto)"
                      : "minmax(0, 1fr)",
                  }}
                >
                  <input
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
                        padding: "7px 10px",
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
            {!editingEntryId && <Plus size={18} />}
            {editingEntryId ? "Update Food" : "Add Food"}
          </button>

          <button
            disabled={!entryDraft.name.trim()}
            onClick={openLibrarySheet}
            style={{
              minHeight: "42px",
            }}
            type="button"
          >
            Add to library
          </button>

          <button
            onClick={openRecipeSheet}
            style={{
              minHeight: "42px",
            }}
            type="button"
          >
            Create recipe
          </button>

          <button
            onClick={openLibraryManager}
            style={{
              minHeight: "42px",
            }}
            type="button"
          >
            Manage library
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
                  borderBottom: "1px solid var(--border)",
                  cursor: "pointer",
                  display: "grid",
                  gap: "8px",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  padding: "8px 0",
                }}
                tabIndex={0}
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
                >
                  <Trash2 size={17} />
                </button>
              </div>
            ))}
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
