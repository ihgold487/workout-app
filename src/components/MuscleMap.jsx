const MUSCLE_MAP_PRIMARY_COLOR = "#2563eb";
const MUSCLE_MAP_SECONDARY_COLOR = "#f59e0b";

function muscleMapAssetPath(path) {
  return `${import.meta.env.BASE_URL}${path}`;
}

function normalizeLookupValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeMuscleList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  return String(value || "").trim() ? [String(value).trim()] : [];
}

function normalizeMuscleEntries(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (Array.isArray(item)) {
          return {
            muscle: String(item[0] || "").trim(),
            weight: Number(item[1]) || 1,
          };
        }

        if (item && typeof item === "object") {
          return {
            muscle: String(item.muscle || item.name || item.label || "").trim(),
            weight:
              Number(item.weight ?? item.sets ?? item.count ?? item.value) || 1,
          };
        }

        return {
          muscle: String(item || "").trim(),
          weight: 1,
        };
      })
      .filter((entry) => entry.muscle);
  }

  return normalizeMuscleList(value).map((muscle) => ({
    muscle,
    weight: 1,
  }));
}

// wger provides 16 broad regions, so some local labels intentionally map to
// the closest available major region until we adopt a more detailed asset set.
const MUSCLE_MAP_DEFINITIONS = {
  abs: { id: 6, view: "front" },
  biceps: { id: 1, view: "front" },
  brachialis: { id: 13, view: "front" },
  calves: { id: 7, view: "back" },
  chest: { id: 4, view: "front" },
  "front delts": { id: 2, view: "front" },
  glutes: { id: 8, view: "back" },
  hamstrings: { id: 11, view: "back" },
  lats: { id: 12, view: "back" },
  "lower back": { id: 16, view: "back" },
  obliques: { id: 14, view: "front" },
  quads: { id: 10, view: "front" },
  "rear delts": { id: 9, view: "back" },
  shoulders: { id: 2, view: "front" },
  "side delts": { id: 2, view: "front" },
  traps: { id: 9, view: "back" },
  triceps: { id: 5, view: "back" },
  "upper back": { id: 9, view: "back" },
  "upper chest": { id: 4, view: "front" },
};

function getMuscleMapDefinition(muscle) {
  return MUSCLE_MAP_DEFINITIONS[normalizeLookupValue(muscle)] || null;
}

function createMuscleMapOverlay(entry, role) {
  const definition = getMuscleMapDefinition(entry.muscle);

  if (!definition) {
    return null;
  }

  const directory = role === "primary" ? "main" : "secondary";

  return {
    id: definition.id,
    muscle: entry.muscle,
    role,
    src: muscleMapAssetPath(
      `muscle-maps/wger/${directory}/muscle-${definition.id}.svg`
    ),
    view: definition.view,
    weight: Math.max(0, Number(entry.weight) || 1),
  };
}

function getScaledOpacity(weight, maxWeight, scaleIntensity) {
  if (!scaleIntensity || maxWeight <= 0) {
    return 1;
  }

  return 0.28 + 0.72 * (weight / maxWeight);
}

function buildMuscleMapViews({
  label,
  primaryMuscles,
  scaleIntensity,
  secondaryMuscles,
}) {
  const overlaysByView = {
    back: [],
    front: [],
  };
  const requestedOverlays = [
    ...normalizeMuscleEntries(primaryMuscles).map((entry) =>
      createMuscleMapOverlay(entry, "primary")
    ),
    ...normalizeMuscleEntries(secondaryMuscles).map((entry) =>
      createMuscleMapOverlay(entry, "secondary")
    ),
  ].filter(Boolean);

  requestedOverlays.forEach((overlay) => {
    const key = `${overlay.view}:${overlay.id}`;
    const existingOverlay = overlaysByView[overlay.view].find(
      (item) => `${item.view}:${item.id}` === key
    );

    if (existingOverlay) {
      if (existingOverlay.role === overlay.role) {
        existingOverlay.weight += overlay.weight;
      }

      return;
    }

    overlaysByView[overlay.view].push(overlay);
  });
  const maxWeight = Math.max(
    0,
    ...Object.values(overlaysByView)
      .flat()
      .map((overlay) => overlay.weight)
  );

  Object.values(overlaysByView).forEach((overlays) => {
    overlays.forEach((overlay) => {
      overlay.opacity = getScaledOpacity(overlay.weight, maxWeight, scaleIntensity);
    });
  });

  return [
    {
      baseSrc: muscleMapAssetPath("muscle-maps/wger/muscular-system-front.svg"),
      label: `${label} front muscle map`,
      overlays: overlaysByView.front,
      viewName: "Front",
    },
    {
      baseSrc: muscleMapAssetPath("muscle-maps/wger/muscular-system-back.svg"),
      label: `${label} back muscle map`,
      overlays: overlaysByView.back,
      viewName: "Back",
    },
  ].filter((view) => view.overlays.length > 0);
}

function MuscleMapFigure({
  baseSrc,
  compact = false,
  label,
  overlays,
  showViewLabel = true,
  viewName,
}) {
  return (
    <div
      aria-label={label}
      role="img"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: compact ? "4px" : "6px",
        minHeight: 0,
        overflow: "hidden",
        padding: compact ? "2px" : "8px",
      }}
    >
      {showViewLabel ? (
        <div
          style={{
            color: "var(--text-muted)",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.04em",
            marginBottom: "6px",
            textAlign: "center",
            textTransform: "uppercase",
          }}
        >
          {viewName}
        </div>
      ) : null}
      <div
        style={{
          aspectRatio: "200 / 369",
          margin: "0 auto",
          maxWidth: compact ? "28px" : "124px",
          position: "relative",
          width: "100%",
        }}
      >
        <img
          alt=""
          aria-hidden="true"
          src={baseSrc}
          style={{
            filter: "grayscale(1) contrast(0.82) brightness(1.28)",
            height: "100%",
            inset: 0,
            objectFit: "contain",
            opacity: 0.42,
            position: "absolute",
            width: "100%",
          }}
        />
        {overlays.map((overlay) => (
          <img
            alt=""
            aria-hidden="true"
            key={`${overlay.role}-${overlay.src}`}
            src={overlay.src}
            style={{
              height: "100%",
              inset: 0,
              objectFit: "contain",
              opacity: overlay.opacity,
              position: "absolute",
              width: "100%",
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default function MuscleMap({
  compact = false,
  label = "Exercise",
  primaryMuscles = [],
  scaleIntensity = false,
  secondaryMuscles = [],
  showLegend = true,
  showViewLabels = true,
}) {
  const mapViews = buildMuscleMapViews({
    label,
    primaryMuscles,
    scaleIntensity,
    secondaryMuscles,
  });

  if (mapViews.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        display: "grid",
        gap: compact ? "3px" : "8px",
      }}
    >
      <div
        style={{
          display: "grid",
          gap: compact ? "3px" : "8px",
          gridTemplateColumns:
            mapViews.length > 1 ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)",
        }}
      >
        {mapViews.map((view) => (
          <MuscleMapFigure
            baseSrc={view.baseSrc}
            compact={compact}
            key={view.viewName}
            label={view.label}
            overlays={view.overlays}
            showViewLabel={showViewLabels}
            viewName={view.viewName}
          />
        ))}
      </div>
      {showLegend ? (
        <div
          style={{
            alignItems: "center",
            color: "var(--text-muted)",
            display: "flex",
            flexWrap: "wrap",
            fontSize: "12px",
            gap: "10px",
          }}
        >
          <span style={{ alignItems: "center", display: "inline-flex", gap: "5px" }}>
            <span
              aria-hidden="true"
              style={{
                background: MUSCLE_MAP_PRIMARY_COLOR,
                borderRadius: "999px",
                display: "inline-block",
                height: "9px",
                opacity: 1,
                width: "9px",
              }}
            />
            Primary
          </span>
          <span style={{ alignItems: "center", display: "inline-flex", gap: "5px" }}>
            <span
              aria-hidden="true"
              style={{
                background: MUSCLE_MAP_SECONDARY_COLOR,
                borderRadius: "999px",
                display: "inline-block",
                height: "9px",
                opacity: 1,
                width: "9px",
              }}
            />
            Secondary
          </span>
        </div>
      ) : null}
    </div>
  );
}
