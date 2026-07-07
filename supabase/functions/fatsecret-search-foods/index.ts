const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FATSECRET_API_URL = "https://platform.fatsecret.com/rest/server.api";
const FATSECRET_BARCODE_API_URL =
  "https://platform.fatsecret.com/rest/food/barcode/find-by-id/v1";
const FATSECRET_AUTOCOMPLETE_API_URL =
  "https://platform.fatsecret.com/rest/food/autocomplete/v2";
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
    status,
  });
}

function parseMacro(description: string, label: string) {
  const match = description.match(new RegExp(`${label}:\\s*([0-9.]+)`, "i"));
  const value = Number(match?.[1]);

  return Number.isFinite(value) ? value : 0;
}

function parseServingDescription(description: string) {
  const serving = description.split(" - ")[0]?.replace(/^per\s+/i, "").trim();

  return serving || "serving";
}

function parseNumber(value: unknown) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function createFoodNutrients({
  calories,
  carbs,
  fat,
  protein,
}: {
  calories: number;
  carbs: number;
  fat: number;
  protein: number;
}) {
  return [
    {
      nutrientName: "Energy",
      value: calories,
    },
    {
      nutrientName: "Protein",
      value: protein,
    },
    {
      nutrientName: "Carbohydrate, by difference",
      value: carbs,
    },
    {
      nutrientName: "Total lipid (fat)",
      value: fat,
    },
  ];
}

function normalizeSearchFood(food: Record<string, unknown>) {
  const foodDescription = String(food.food_description || "");
  const foodId = String(food.food_id || "");
  const brandName = String(food.brand_name || "");
  const servingDescription = parseServingDescription(foodDescription);

  return {
    brandName,
    dataType: "FatSecret",
    description: String(food.food_name || ""),
    fdcId: foodId ? `fatsecret:${foodId}` : `fatsecret:${crypto.randomUUID()}`,
    fatsecretFoodId: foodId,
    foodNutrients: createFoodNutrients({
      calories: parseMacro(foodDescription, "Calories"),
      carbs: parseMacro(foodDescription, "Carbs"),
      fat: parseMacro(foodDescription, "Fat"),
      protein: parseMacro(foodDescription, "Protein"),
    }),
    foodUrl: String(food.food_url || ""),
    householdServingFullText: servingDescription,
    source: "fatsecret",
  };
}

function normalizeServing(serving: Record<string, unknown>) {
  const servingDescription = String(serving.serving_description || "serving");
  const metricAmount = parseNumber(serving.metric_serving_amount);
  const metricUnit = String(serving.metric_serving_unit || "").toLowerCase();
  const measurement = String(serving.measurement_description || "serving");
  const numberOfUnits = parseNumber(serving.number_of_units) || 1;
  const key = `fatsecret-serving:${serving.serving_id || servingDescription}`;

  return {
    key,
    label: servingDescription,
    servingId: String(serving.serving_id || ""),
    servingMultiplier: 1,
    sourceServing: {
      calories: parseNumber(serving.calories),
      carbs: parseNumber(serving.carbohydrate),
      fat: parseNumber(serving.fat),
      protein: parseNumber(serving.protein),
    },
    metricAmount,
    metricUnit,
    isDefault: String(serving.is_default || "") === "1",
    numberOfUnits,
    measurement,
  };
}

function normalizeDetailedFood(food: Record<string, unknown>) {
  const foodId = String(food.food_id || "");
  const rawServing = (food.servings as Record<string, unknown> | undefined)?.serving;
  const servings = (Array.isArray(rawServing) ? rawServing : rawServing ? [rawServing] : [])
    .map((serving) => normalizeServing(serving as Record<string, unknown>))
    .sort((left, right) => Number(right.isDefault) - Number(left.isDefault));
  const defaultServing =
    servings.find((serving) => serving.isDefault) ||
    servings.find((serving) => serving.servingId) ||
    servings[0];

  return {
    brandName: String(food.brand_name || ""),
    dataType: "FatSecret",
    description: String(food.food_name || ""),
    fatsecretFoodId: foodId,
    fdcId: foodId ? `fatsecret:${foodId}` : `fatsecret:${crypto.randomUUID()}`,
    foodNutrients: createFoodNutrients(
      defaultServing?.sourceServing || {
        calories: 0,
        carbs: 0,
        fat: 0,
        protein: 0,
      }
    ),
    foodUrl: String(food.food_url || ""),
    householdServingFullText: defaultServing?.label || "serving",
    source: "fatsecret",
    fatsecretServings: servings,
  };
}

function extractFoodList(payload: Record<string, unknown>) {
  const foods = payload.foods as Record<string, unknown> | Record<string, unknown>[] | undefined;
  const rawFood =
    Array.isArray(foods)
      ? foods
      : foods && typeof foods === "object"
        ? foods.food
        : payload.food;

  return Array.isArray(rawFood) ? rawFood : rawFood ? [rawFood] : [];
}

function getTotalResults(payload: Record<string, unknown>, fallback: number) {
  const foods = payload.foods as Record<string, unknown> | undefined;
  const totalResults =
    foods && !Array.isArray(foods) && typeof foods === "object"
      ? foods.total_results
      : payload.total_results;
  const parsed = Number(totalResults);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function extractSuggestions(payload: Record<string, unknown>) {
  const suggestions = payload.suggestions as Record<string, unknown> | undefined;
  const rawSuggestion =
    suggestions && typeof suggestions === "object"
      ? suggestions.suggestion
      : payload.suggestion;

  return (Array.isArray(rawSuggestion) ? rawSuggestion : rawSuggestion ? [rawSuggestion] : [])
    .map((suggestion) => String(suggestion || "").trim())
    .filter(Boolean);
}

function getFatSecretPayloadError(payload: Record<string, unknown>) {
  const error = payload.error;

  if (!error || typeof error !== "object") {
    return "";
  }

  const { code, message } = error as Record<string, unknown>;

  return [code ? `code ${code}` : "", message ? String(message) : ""]
    .filter(Boolean)
    .join(": ");
}

function createFatSecretError(prefix: string, payloadError: string) {
  if (payloadError.includes("code 10") && payloadError.includes("API was not resolved")) {
    return new Error(
      `${prefix}: ${payloadError}. FatSecret barcode lookup is a Premier/barcode-scope API; confirm barcode access is enabled for these credentials.`
    );
  }

  return new Error(`${prefix}: ${payloadError}`);
}

function percentEncode(value: string) {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`
    );
}

async function hmacSha1Base64(key: string, text: string) {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    {
      hash: "SHA-1",
      name: "HMAC",
    },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(text));

  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

async function buildOAuth1Url(
  params: Record<string, string>,
  apiUrl = FATSECRET_API_URL
) {
  const consumerKey =
    Deno.env.get("FATSECRET_CONSUMER_KEY") ||
    Deno.env.get("FATSECRET_CLIENT_ID");
  const consumerSecret =
    Deno.env.get("FATSECRET_CONSUMER_SECRET") ||
    Deno.env.get("FATSECRET_CLIENT_SECRET");

  if (!consumerKey || !consumerSecret) {
    throw new Error(
      "FatSecret credentials are not configured. Set FATSECRET_CONSUMER_KEY and FATSECRET_CONSUMER_SECRET."
    );
  }

  const signedParams = {
    ...params,
    oauth_consumer_key: consumerKey,
    oauth_nonce: crypto.randomUUID().replace(/-/g, ""),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: "1.0",
  };
  const encodedParams = Object.entries(signedParams).map(([key, value]) => [
    percentEncode(key),
    percentEncode(String(value)),
  ]);
  const normalizedParams = encodedParams
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      if (leftKey === rightKey) {
        return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
      }

      return leftKey < rightKey ? -1 : 1;
    })
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  const signatureBaseString = [
    "GET",
    percentEncode(apiUrl),
    percentEncode(normalizedParams),
  ].join("&");
  const signingKey = `${percentEncode(consumerSecret)}&`;
  const oauthSignature = await hmacSha1Base64(signingKey, signatureBaseString);
  const requestParams = [...encodedParams, ["oauth_signature", percentEncode(oauthSignature)]]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      if (leftKey === rightKey) {
        return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
      }

      return leftKey < rightKey ? -1 : 1;
    })
    .map(([key, value]) => `${key}=${value}`)
    .join("&");

  return `${apiUrl}?${requestParams}`;
}

function buildOAuth1SearchUrl(searchExpression: string, maxResults: number) {
  return buildOAuth1Url({
    format: "json",
    max_results: String(Math.min(Math.max(maxResults || 12, 1), 50)),
    method: "foods.search",
    page_number: "0",
    search_expression: searchExpression,
  });
}

function buildOAuth1FoodUrl(foodId: string) {
  return buildOAuth1Url({
    food_id: foodId,
    format: "json",
    method: "food.get",
  });
}

function buildOAuth1BarcodeUrl(barcode: string) {
  return buildOAuth1Url(
    {
      barcode,
      format: "json",
    },
    FATSECRET_BARCODE_API_URL
  );
}

function buildOAuth1AutocompleteUrl(expression: string, maxResults: number) {
  return buildOAuth1Url(
    {
      expression,
      format: "json",
      max_results: String(Math.min(Math.max(maxResults || 6, 1), 10)),
    },
    FATSECRET_AUTOCOMPLETE_API_URL
  );
}

function normalizeBarcodeToGtin13(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");

  if (digits.length === 8 || digits.length === 12 || digits.length === 13) {
    return digits.padStart(13, "0");
  }

  return "";
}

function extractBarcodeFoodId(payload: Record<string, unknown>) {
  const foodId = payload.food_id;

  if (typeof foodId === "string" || typeof foodId === "number") {
    return String(foodId);
  }

  if (foodId && typeof foodId === "object") {
    return String((foodId as Record<string, unknown>).value || "");
  }

  return "";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const {
      action = "search",
      barcode,
      foodId,
      query,
      maxResults = 12,
    } = await request.json();

    if (action === "getFood") {
      const targetFoodId = String(foodId || "").replace(/^fatsecret:/, "").trim();

      if (!targetFoodId) {
        return jsonResponse({ error: "foodId is required." });
      }

      const response = await fetch(await buildOAuth1FoodUrl(targetFoodId), {
        method: "GET",
      });

      if (!response.ok) {
        const errorText = await response.text();

        throw new Error(
          `FatSecret food detail failed (${response.status}): ${errorText.slice(0, 240)}`
        );
      }

      const payload = await response.json();
      const payloadError = getFatSecretPayloadError(payload);

      if (payloadError) {
        throw createFatSecretError("FatSecret food detail returned an error", payloadError);
      }

      return jsonResponse({
        food: normalizeDetailedFood(payload.food || payload),
      });
    }

    if (action === "autocomplete") {
      const expression = String(query || "").trim();

      if (!expression) {
        return jsonResponse({ suggestions: [] });
      }

      const response = await fetch(
        await buildOAuth1AutocompleteUrl(expression, Number(maxResults) || 6),
        {
          method: "GET",
        }
      );

      if (!response.ok) {
        const errorText = await response.text();

        throw new Error(
          `FatSecret autocomplete failed (${response.status}): ${errorText.slice(0, 240)}`
        );
      }

      const payload = await response.json();
      const payloadError = getFatSecretPayloadError(payload);

      if (payloadError) {
        throw createFatSecretError("FatSecret autocomplete returned an error", payloadError);
      }

      return jsonResponse({
        suggestions: extractSuggestions(payload),
      });
    }

    if (action === "barcode") {
      const targetBarcode = normalizeBarcodeToGtin13(barcode);

      if (!targetBarcode) {
        return jsonResponse({
          error:
            "Barcode must be UPC-A, EAN-13, or EAN-8. UPC-E must be converted before searching FatSecret.",
        });
      }

      const response = await fetch(await buildOAuth1BarcodeUrl(targetBarcode), {
        method: "GET",
      });

      if (!response.ok) {
        const errorText = await response.text();

        throw new Error(
          `FatSecret barcode lookup failed (${response.status}): ${errorText.slice(0, 240)}`
        );
      }

      const payload = await response.json();
      const payloadError = getFatSecretPayloadError(payload);

      if (payloadError) {
        throw createFatSecretError(
          "FatSecret barcode lookup returned an error",
          payloadError
        );
      }

      const barcodeFoodId = extractBarcodeFoodId(payload);

      if (!barcodeFoodId) {
        return jsonResponse({
          barcode: targetBarcode,
          food: null,
          foods: [],
        });
      }

      const detailResponse = await fetch(await buildOAuth1FoodUrl(barcodeFoodId), {
        method: "GET",
      });

      if (!detailResponse.ok) {
        const errorText = await detailResponse.text();

        throw new Error(
          `FatSecret food detail failed (${detailResponse.status}): ${errorText.slice(0, 240)}`
        );
      }

      const detailPayload = await detailResponse.json();
      const detailPayloadError = getFatSecretPayloadError(detailPayload);

      if (detailPayloadError) {
        throw createFatSecretError(
          "FatSecret food detail returned an error",
          detailPayloadError
        );
      }

      const food = normalizeDetailedFood(detailPayload.food || detailPayload);

      return jsonResponse({
        barcode: targetBarcode,
        food,
        foods: food.fatsecretFoodId ? [food] : [],
      });
    }

    const searchExpression = String(query || "").trim();

    if (!searchExpression) {
      return jsonResponse({ foods: [] });
    }

    const response = await fetch(
      await buildOAuth1SearchUrl(searchExpression, Number(maxResults) || 12),
      {
        method: "GET",
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error(
        `FatSecret search failed (${response.status}): ${errorText.slice(0, 240)}`
      );
    }

    const payload = await response.json();
    const payloadError = getFatSecretPayloadError(payload);

    if (payloadError) {
      throw createFatSecretError("FatSecret search returned an error", payloadError);
    }

    const foodList = extractFoodList(payload);
    const totalResults = getTotalResults(payload, foodList.length);

    return jsonResponse({
      debug: {
        foodCount: foodList.length,
        foodsType: Array.isArray(payload?.foods) ? "array" : typeof payload?.foods,
        hasFoodsFood:
          !!payload?.foods &&
          !Array.isArray(payload.foods) &&
          typeof payload.foods === "object" &&
          "food" in payload.foods,
        payloadKeys: Object.keys(payload || {}),
      },
      foods: foodList.map(normalizeSearchFood),
      totalResults,
    });
  } catch (error) {
    console.error("FatSecret search function failed:", error);

    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "FatSecret search failed.",
      }
    );
  }
});
