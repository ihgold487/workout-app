const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const OPENAI_TIMEOUT_MS = 45000;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
    status,
  });
}

function extractOutputText(payload: Record<string, unknown>) {
  if (typeof payload.output_text === "string") {
    return payload.output_text;
  }

  const output = Array.isArray(payload.output) ? payload.output : [];

  for (const item of output) {
    const content = Array.isArray((item as Record<string, unknown>)?.content)
      ? ((item as Record<string, unknown>).content as Record<string, unknown>[])
      : [];

    for (const contentItem of content) {
      if (typeof contentItem.text === "string") {
        return contentItem.text;
      }
    }
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
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  try {
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    const model = Deno.env.get("OPENAI_RECIPE_IMPORT_MODEL") || "gpt-4.1-mini";

    if (!openaiApiKey) {
      return jsonResponse(
        {
          error:
            "Recipe image import is not configured. Set OPENAI_API_KEY for the recipe-image-import function.",
        },
        500
      );
    }

    const body = await request.json();
    const image = String(body?.image || "");

    if (!image.startsWith("data:image/")) {
      return jsonResponse({ error: "Upload a recipe screenshot image." }, 400);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
    const openaiResponse = await fetch(OPENAI_API_URL, {
      body: JSON.stringify({
        input: [
          {
            content: [
              {
                text:
                  "Extract only factual recipe metadata from this screenshot. Do not extract cooking directions or prose. Return the visible recipe name if present, the visible yield/servings if present, and ingredient rows with amount, unit, ingredient name, and original line. Exclude section headers, directions, notes, and garnish/serving suggestions unless they are clearly ingredients.",
                type: "input_text",
              },
              {
                image_url: image,
                type: "input_image",
              },
            ],
            role: "user",
          },
        ],
        model,
        text: {
          format: {
            name: "recipe_image_import",
            schema: {
              additionalProperties: false,
              properties: {
                ingredients: {
                  items: {
                    additionalProperties: false,
                    properties: {
                      amount: {
                        description:
                          "Numeric amount if clear, preserving fractions as decimals when possible. Empty string if absent.",
                        type: "string",
                      },
                      ingredient: {
                        description:
                          "Searchable ingredient name without preparation notes when possible.",
                        type: "string",
                      },
                      originalLine: {
                        description: "The visible ingredient line from the image.",
                        type: "string",
                      },
                      unit: {
                        description:
                          "Short unit such as g, oz, cup, tbsp, tsp, clove, can, bunch, serving. Empty string if absent.",
                        type: "string",
                      },
                    },
                    required: ["amount", "ingredient", "originalLine", "unit"],
                    type: "object",
                  },
                  type: "array",
                },
                recipeName: {
                  type: "string",
                },
                servings: {
                  description:
                    "Number of servings or yield count if visible. Empty string if absent.",
                  type: "string",
                },
              },
              required: ["recipeName", "servings", "ingredients"],
              type: "object",
            },
            strict: true,
            type: "json_schema",
          },
        },
      }),
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const payload = (await openaiResponse.json()) as Record<string, unknown>;

    if (!openaiResponse.ok) {
      const message =
        (payload.error as Record<string, unknown> | undefined)?.message ||
        "OpenAI recipe image parsing failed.";

      return jsonResponse({ error: message }, openaiResponse.status);
    }

    const outputText = extractOutputText(payload);

    if (!outputText) {
      return jsonResponse({ error: "No recipe data was extracted from the image." }, 422);
    }

    return jsonResponse(JSON.parse(outputText));
  } catch (error) {
    console.error("Recipe image import failed:", error);

    if (error instanceof DOMException && error.name === "AbortError") {
      return jsonResponse(
        {
          error:
            "Recipe image parsing timed out. Try a cropped screenshot with only the recipe name, yield, and ingredients.",
        },
        504
      );
    }

    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Recipe image import failed.",
      },
      500
    );
  }
});
