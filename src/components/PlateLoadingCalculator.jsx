import { useDeferredValue, useEffect, useState } from "react";
import { Cable, Dumbbell, Trash2 } from "lucide-react";
import WeightPickerModal from "./WeightPickerModal";

export const LOAD_CALCULATOR_EQUIPMENT = [
  {
    categoryKey: "twoInch",
    defaultWeight: 45,
    id: "barbell",
    label: "Barbell",
    loadMode: "balanced",
    weightConsidered: true,
  },
  {
    categoryKey: "twoInch",
    defaultWeight: 0,
    id: "cable",
    label: "Cable",
    loadMode: "cable",
    weightConsidered: false,
  },
  {
    categoryKey: "oneInch",
    defaultWeight: 5,
    id: "dumbbell",
    label: "Dumbbells",
    loadMode: "balanced",
    weightConsidered: true,
  },
  {
    categoryKey: "twoInch",
    defaultWeight: 15,
    id: "ezBar",
    label: "EZ Curl Bar",
    loadMode: "balanced",
    weightConsidered: true,
  },
  {
    categoryKey: "twoInch",
    defaultWeight: 0,
    id: "landmine",
    label: "Landmine",
    loadMode: "singleEnd",
    weightConsidered: false,
  },
  {
    categoryKey: "twoInch",
    defaultWeight: 0,
    id: "machine",
    label: "Machine",
    loadMode: "stack",
    weightConsidered: false,
  },
  {
    categoryKey: "twoInch",
    defaultWeight: 0,
    id: "smithMachine",
    label: "Smith Machine",
    loadMode: "balanced",
    weightConsidered: true,
  },
  {
    categoryKey: "twoInch",
    defaultWeight: 50,
    id: "trapBar",
    label: "Trap Bar",
    loadMode: "balanced",
    weightConsidered: true,
  },
  {
    categoryKey: "twoInch",
    defaultWeight: 0,
    id: "tricepBar",
    label: "Tricep Bar",
    loadMode: "balanced",
    weightConsidered: true,
  },
];

const PLATE_WEIGHT_UNIT = 4;
const MAX_PLATE_LOADING_OPTIONS_PER_SUM = 4;
const TWO_INCH_PLATE_STYLES = {
  "55": { background: "#d32f2f", border: "#9a1b1b", color: "#fff" },
  "45": { background: "#1565c0", border: "#0d47a1", color: "#fff" },
  "35": { background: "#fdd835", border: "#c6a700", color: "#111" },
  "23.75": { background: "#2e7d32", border: "#1b5e20", color: "#fff" },
  "25": { background: "#cfd8dc", border: "#90a4ae", color: "#111" },
  "15": { background: "#ef6c00", border: "#bf4f00", color: "#fff" },
  "10": { background: "#8e8e8e", border: "#6a6a6a", color: "#fff" },
  "5": { background: "#111", border: "#000", color: "#fff" },
  "2.5": { background: "#3f3f3f", border: "#262626", color: "#fff" },
  "1.25": { background: "#fff", border: "#d0d0d0", color: "#111" },
};
const LOAD_CALCULATOR_BAR_COLUMNS = {
  barbell: "74px",
  cable: "28px",
  landmine: "74px",
  smithMachine: "74px",
  trapBar: "74px",
  tricepBar: "56px",
  ezBar: "56px",
  dumbbell: "37px",
  machine: "28px",
};

export function formatPlateNumber(value) {
  const number = Number(value);

  return Number.isInteger(number)
    ? String(number)
    : String(Number(number.toFixed(2)));
}

export function getPlateCalculatorEquipmentId(equipmentValue, fallback = "barbell") {
  const normalized = Array.isArray(equipmentValue)
    ? String(equipmentValue[0] || "")
    : String(equipmentValue || "");
  const key = normalized.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (key.includes("dumbbell")) return "dumbbell";
  if (key.includes("ez")) return "ezBar";
  if (key.includes("trap")) return "trapBar";
  if (key.includes("smith")) return "smithMachine";
  if (key.includes("landmine")) return "landmine";
  if (key.includes("tricep")) return "tricepBar";
  if (key.includes("cable")) return "cable";
  if (key.includes("machine")) return "machine";
  if (key.includes("barbell")) return "barbell";

  return fallback;
}

function comparePlateCombinations(a, b) {
  if (a.length !== b.length) {
    return a.length - b.length;
  }

  const aSorted = [...a].sort((first, second) => second - first);
  const bSorted = [...b].sort((first, second) => second - first);

  for (let index = 0; index < Math.max(aSorted.length, bSorted.length); index += 1) {
    const weightDifference = (bSorted[index] || 0) - (aSorted[index] || 0);

    if (weightDifference !== 0) {
      return weightDifference;
    }
  }

  return 0;
}

function rankPlateCombinations(combinations) {
  const uniqueCombinations = new Map();

  combinations.forEach((plates) => {
    const sortedPlates = [...plates].sort((a, b) => b - a);
    const key = sortedPlates.join("|");

    if (!uniqueCombinations.has(key)) {
      uniqueCombinations.set(key, sortedPlates);
    }
  });

  return Array.from(uniqueCombinations.values())
    .sort(comparePlateCombinations)
    .slice(0, MAX_PLATE_LOADING_OPTIONS_PER_SUM);
}

function getLoadCalculatorEquipment(equipmentId, inventory) {
  const baseEquipment =
    LOAD_CALCULATOR_EQUIPMENT.find((option) => option.id === equipmentId) ||
    LOAD_CALCULATOR_EQUIPMENT[0];
  const configuredWeight = Number(inventory?.equipmentWeights?.[baseEquipment.id]);
  const equipmentWeight = Number.isFinite(configuredWeight)
    ? Math.max(0, configuredWeight)
    : baseEquipment.defaultWeight;

  return {
    ...baseEquipment,
    configuredWeight: equipmentWeight,
    weight: baseEquipment.weightConsidered ? equipmentWeight : 0,
  };
}

export function calculatePlateLoading(
  totalWeight,
  equipmentId,
  inventory,
  cablePulleyCount = 1,
  dumbbellCount = 1
) {
  const equipment = getLoadCalculatorEquipment(equipmentId, inventory);
  const enteredWeight = Number(totalWeight);
  const isDumbbellLoad = equipment.id === "dumbbell";
  const requestedWeight =
    isDumbbellLoad && Number(dumbbellCount) === 2
      ? enteredWeight / 2
      : enteredWeight;

  if (!Number.isFinite(requestedWeight) || requestedWeight <= 0) {
    return {
      equipment,
      status: "empty",
    };
  }

  const isBalancedLoad = equipment.loadMode === "balanced";
  const isCableLoad = equipment.loadMode === "cable";
  const requiresPairedPlates = isBalancedLoad || isCableLoad;
  const cableLoadMultiplier = Number(cablePulleyCount) === 2 ? 1 : 2;
  const loadedWeight = isBalancedLoad
    ? requestedWeight - equipment.weight
    : requestedWeight;

  if (loadedWeight < 0) {
    return {
      equipment,
      requestedWeight,
      status: "underBar",
    };
  }

  const targetLoad = isBalancedLoad
    ? loadedWeight / 2
    : isCableLoad
      ? loadedWeight / cableLoadMultiplier
      : loadedWeight;
  const targetLoadUnits = Math.round(targetLoad * PLATE_WEIGHT_UNIT);
  const availablePlates = (inventory?.[equipment.categoryKey] || [])
    .filter((plate) =>
      Number(plate.weight) !== 55 ||
      equipment.id === "barbell" ||
      equipment.id === "trapBar"
    )
    .filter((plate) =>
      requiresPairedPlates
        ? Number(plate.count) >= 2 && Number(plate.weight) > 0
        : Number(plate.count) >= 1 && Number(plate.weight) > 0
    )
    .sort((a, b) => b.weight - a.weight);
  const sums = new Map([[0, [[]]]]);

  availablePlates.forEach((plate) => {
    const plateUnits = Math.round(Number(plate.weight) * PLATE_WEIGHT_UNIT);
    const availableCount = requiresPairedPlates
      ? Math.floor(Number(plate.count) / 2)
      : Number(plate.count);

    for (let plateIndex = 0; plateIndex < availableCount; plateIndex += 1) {
      Array.from(sums.entries()).forEach(([sum, combinations]) => {
        const nextSum = sum + plateUnits;

        if (nextSum <= targetLoadUnits) {
          const nextCombinations = sums.get(nextSum) || [];

          sums.set(
            nextSum,
            rankPlateCombinations([
              ...nextCombinations,
              ...combinations.map((plates) => [
                ...plates,
                Number(plate.weight),
              ]),
            ])
          );
        }
      });
    }
  });

  const bestSumUnits = Math.max(...sums.keys());
  const loadingOptions = rankPlateCombinations(sums.get(bestSumUnits) || [[]]);
  const platesPerSide = loadingOptions[0] || [];
  const achievedPlateLoad = bestSumUnits / PLATE_WEIGHT_UNIT;
  const achievedTotal = isBalancedLoad
    ? equipment.weight + achievedPlateLoad * 2
    : isCableLoad
      ? achievedPlateLoad * cableLoadMultiplier
      : achievedPlateLoad;
  const leftPlates =
    equipment.loadMode === "balanced" || equipment.loadMode === "cable"
      ? platesPerSide
      : [];
  const rightPlates =
    equipment.loadMode === "balanced" ||
    equipment.loadMode === "singleEnd" ||
    equipment.loadMode === "cable"
      ? platesPerSide
      : [];
  const machinePlates = equipment.loadMode === "stack" ? platesPerSide : [];

  return {
    achievedTotal,
    difference: requestedWeight - achievedTotal,
    equipment,
    exact: bestSumUnits === targetLoadUnits,
    leftPlates,
    loadedWeight,
    loadingOptions,
    cablePulleyCount: Number(cablePulleyCount) === 2 ? 2 : 1,
    dumbbellCount: Number(dumbbellCount) === 2 ? 2 : 1,
    enteredWeight,
    machinePlates,
    platesPerSide,
    rightPlates,
    requestedWeight,
    status: "ready",
    targetLoad,
  };
}

export function getClosestLoadableWeight(
  totalWeight,
  equipmentId,
  inventory,
  { cablePulleyCount = 1, dumbbellCount = 1, searchRadius = 100 } = {}
) {
  const requestedWeight = Number(totalWeight);

  if (!Number.isFinite(requestedWeight) || requestedWeight <= 0) {
    return null;
  }

  const equipment = getLoadCalculatorEquipment(equipmentId, inventory);
  const isDumbbellLoad = equipment.id === "dumbbell";
  const adjustedRequestedWeight =
    isDumbbellLoad && Number(dumbbellCount) === 2
      ? requestedWeight / 2
      : requestedWeight;
  const isBalancedLoad = equipment.loadMode === "balanced";
  const isCableLoad = equipment.loadMode === "cable";
  const requiresPairedPlates = isBalancedLoad || isCableLoad;
  const cableLoadMultiplier = Number(cablePulleyCount) === 2 ? 1 : 2;
  const maxWeight = requestedWeight + Math.max(0, Number(searchRadius) || 0);
  const adjustedMaxWeight =
    isDumbbellLoad && Number(dumbbellCount) === 2 ? maxWeight / 2 : maxWeight;
  const maxLoadedWeight = isBalancedLoad
    ? Math.max(0, adjustedMaxWeight - equipment.weight)
    : adjustedMaxWeight;
  const maxTargetLoad = isBalancedLoad
    ? maxLoadedWeight / 2
    : isCableLoad
      ? maxLoadedWeight / cableLoadMultiplier
      : maxLoadedWeight;
  const maxTargetUnits = Math.max(0, Math.round(maxTargetLoad * PLATE_WEIGHT_UNIT));
  const availablePlates = (inventory?.[equipment.categoryKey] || [])
    .filter((plate) =>
      Number(plate.weight) !== 55 ||
      equipment.id === "barbell" ||
      equipment.id === "trapBar"
    )
    .filter((plate) =>
      requiresPairedPlates
        ? Number(plate.count) >= 2 && Number(plate.weight) > 0
        : Number(plate.count) >= 1 && Number(plate.weight) > 0
    )
    .sort((a, b) => b.weight - a.weight);
  const sums = new Set([0]);

  availablePlates.forEach((plate) => {
    const plateUnits = Math.round(Number(plate.weight) * PLATE_WEIGHT_UNIT);
    const availableCount = requiresPairedPlates
      ? Math.floor(Number(plate.count) / 2)
      : Number(plate.count);

    for (let plateIndex = 0; plateIndex < availableCount; plateIndex += 1) {
      Array.from(sums).forEach((sum) => {
        const nextSum = sum + plateUnits;

        if (nextSum <= maxTargetUnits) {
          sums.add(nextSum);
        }
      });
    }
  });

  const candidates = Array.from(sums).map((sumUnits) => {
    const achievedPlateLoad = sumUnits / PLATE_WEIGHT_UNIT;
    const achievedTotal = isBalancedLoad
      ? equipment.weight + achievedPlateLoad * 2
      : isCableLoad
        ? achievedPlateLoad * cableLoadMultiplier
        : achievedPlateLoad;
    const weight =
      isDumbbellLoad && Number(dumbbellCount) === 2
        ? achievedTotal * 2
        : achievedTotal;

    return {
      weight,
    };
  });

  const closest = candidates.sort(
    (a, b) =>
      Math.abs(a.weight - requestedWeight) -
        Math.abs(b.weight - requestedWeight) ||
      a.weight - b.weight
  )[0];

  if (!closest || !Number.isFinite(closest.weight)) {
    return null;
  }

  return {
    loading: calculatePlateLoading(
      closest.weight,
      equipment.id,
      inventory,
      cablePulleyCount,
      dumbbellCount
    ),
    weight: closest.weight,
  };
}

export default function PlateLoadingCalculator({
  fixedWeights = null,
  fullWidth = false,
  initialEquipmentId = "barbell",
  initialWeight = "",
  inventory,
  showInputs = true,
}) {
  const [draft, setDraft] = useState({
    cablePulleyCount: 1,
    dumbbellCount: 1,
    equipmentId: initialEquipmentId || "barbell",
    weight: initialWeight ?? "",
  });
  const [optionIndexes, setOptionIndexes] = useState({});
  const [manualSelections, setManualSelections] = useState({});
  const [plateSelectorOpen, setPlateSelectorOpen] = useState(false);
  const [weightPickerOpen, setWeightPickerOpen] = useState(false);
  const deferredDraft = useDeferredValue(draft);

  useEffect(() => {
    setDraft((current) => ({
      ...current,
      equipmentId: initialEquipmentId || "barbell",
      weight: initialWeight ?? "",
    }));
    setOptionIndexes({});
  }, [initialEquipmentId, initialWeight]);

  function getManualSelectionKey() {
    return draft.equipmentId;
  }

  function getManualSelection() {
    return manualSelections[getManualSelectionKey()] || {};
  }

  function setManualPlateCount(plateWeight, count) {
    const key = getManualSelectionKey();
    const nextCount = Math.max(0, Number.parseInt(count, 10) || 0);

    setManualSelections((current) => {
      const currentSelection = current[key] || {};
      const nextSelection = {
        ...currentSelection,
        [formatPlateNumber(plateWeight)]: nextCount,
      };

      if (nextCount === 0) {
        delete nextSelection[formatPlateNumber(plateWeight)];
      }

      return {
        ...current,
        [key]: nextSelection,
      };
    });
  }

  function resetManualPlateSelection() {
    const key = getManualSelectionKey();

    setManualSelections((current) => {
      const next = { ...current };

      delete next[key];

      return next;
    });
  }

  function getDisplayLoading(weight, loadingIndex) {
    const calculatedLoading = calculatePlateLoading(
      weight,
      deferredDraft.equipmentId,
      inventory,
      deferredDraft.cablePulleyCount,
      deferredDraft.dumbbellCount
    );
    const optionCount = calculatedLoading.loadingOptions?.length || 0;
    const selectedOptionIndex = optionCount
      ? (optionIndexes[loadingIndex] || 0) % optionCount
      : 0;
    const loading =
      calculatedLoading.status === "ready"
        ? (() => {
            const selectedPlates =
              calculatedLoading.loadingOptions[selectedOptionIndex] ||
              calculatedLoading.platesPerSide;

            return {
              ...calculatedLoading,
              leftPlates:
                calculatedLoading.equipment.loadMode === "balanced" ||
                calculatedLoading.equipment.loadMode === "cable"
                  ? selectedPlates
                  : [],
              machinePlates:
                calculatedLoading.equipment.loadMode === "stack"
                  ? selectedPlates
                  : [],
              optionIndex: selectedOptionIndex,
              platesPerSide: selectedPlates,
              rightPlates:
                calculatedLoading.equipment.loadMode === "balanced" ||
                calculatedLoading.equipment.loadMode === "singleEnd" ||
                calculatedLoading.equipment.loadMode === "cable"
                  ? selectedPlates
                  : [],
            };
          })()
        : calculatedLoading;

    return {
      loading,
      optionCount,
    };
  }

  const fixedWeightList = Array.isArray(fixedWeights)
    ? fixedWeights.filter((weight) => weight !== "" && weight != null)
    : null;
  const displayLoadings =
    fixedWeightList && fixedWeightList.length
      ? fixedWeightList.map((weight, index) => getDisplayLoading(weight, index))
      : [getDisplayLoading(deferredDraft.weight, 0)];

  function renderCountToggle(currentLoading) {
    const showCableToggle = currentLoading.equipment.loadMode === "cable";
    const showDumbbellToggle = currentLoading.equipment.id === "dumbbell";

    if (!showCableToggle && !showDumbbellToggle) {
      return null;
    }

    const toggleConfig = showCableToggle
      ? {
          ariaLabel: "Cable pulleys",
          icon: <Cable size={15} />,
          stateKey: "cablePulleyCount",
        }
      : {
          ariaLabel: "Dumbbell count",
          icon: <Dumbbell size={15} />,
          stateKey: "dumbbellCount",
        };

    return (
      <div
        aria-label={toggleConfig.ariaLabel}
        onClick={(event) => event.stopPropagation()}
        style={{
          alignItems: "center",
          display: "inline-flex",
          gap: "4px",
          justifySelf: "end",
        }}
      >
        {toggleConfig.icon}
        <span
          style={{
            border: "1px solid var(--border)",
            borderRadius: "999px",
            display: "inline-grid",
            gridTemplateColumns: "1fr 1fr",
            overflow: "hidden",
          }}
        >
          {[1, 2].map((count) => {
            const active = Number(draft[toggleConfig.stateKey]) === count;

            return (
              <button
                key={count}
                aria-pressed={active}
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    [toggleConfig.stateKey]: count,
                  }))
                }
                style={{
                  background: active ? "var(--accent)" : "transparent",
                  border: "none",
                  color: active ? "var(--surface)" : "var(--text)",
                  font: "inherit",
                  fontSize: "12px",
                  fontWeight: active ? 700 : 500,
                  minHeight: "24px",
                  minWidth: "28px",
                  padding: "2px 8px",
                }}
                type="button"
              >
                {count}
              </button>
            );
          })}
        </span>
      </div>
    );
  }

  function renderPlateLoadingDiagram(
    currentLoading,
    currentOptionCount,
    loadingIndex
  ) {
    const canCycleOptions = currentOptionCount > 1;

    return renderLoadedEquipmentDiagram({
      canCycleOptions,
      currentLoading,
      currentOptionCount,
      loadingIndex,
      onCycleOption: () =>
        setOptionIndexes((current) => ({
          ...current,
          [loadingIndex]: ((current[loadingIndex] || 0) + 1) % currentOptionCount,
        })),
    });
  }

  function renderLoadedEquipmentDiagram({
    canCycleOptions = false,
    currentLoading,
    currentOptionCount = 1,
    loadingIndex = 0,
    onCycleOption = null,
  }) {
    const leftPlates = currentLoading.leftPlates || [];
    const rightPlates = currentLoading.rightPlates || [];
    const machinePlates = currentLoading.machinePlates || [];
    const allPlates = [...leftPlates, ...rightPlates, ...machinePlates];
    const maxPlateWeight = Math.max(55, ...allPlates);
    const leftTotal = leftPlates.reduce((total, plate) => total + plate, 0);
    const rightTotal = rightPlates.reduce((total, plate) => total + plate, 0);
    const machineTotal = machinePlates.reduce((total, plate) => total + plate, 0);
    const showMachineStack = currentLoading.equipment.loadMode === "stack";
    const isOneEndedLoad =
      currentLoading.equipment.loadMode === "singleEnd" || showMachineStack;
    const shownLeftPlates = showMachineStack ? [] : leftPlates;
    const shownRightPlates = showMachineStack ? machinePlates : rightPlates;
    const shownLeftTotal = showMachineStack ? 0 : leftTotal;
    const shownRightTotal = showMachineStack ? machineTotal : rightTotal;
    const barColumnWidth =
      LOAD_CALCULATOR_BAR_COLUMNS[currentLoading.equipment.id] ||
      LOAD_CALCULATOR_BAR_COLUMNS.barbell;
    const diagramColumns = isOneEndedLoad
      ? `minmax(0, .5fr) ${barColumnWidth} minmax(0, 1.5fr)`
      : `minmax(0, 1fr) ${barColumnWidth} minmax(0, 1fr)`;
    const getPlateStyle = (plate) =>
      currentLoading.equipment.categoryKey === "twoInch"
        ? TWO_INCH_PLATE_STYLES[formatPlateNumber(plate)] || {
            background: "#d7e7f5",
            border: "#7da4c3",
            color: "#17324a",
          }
        : {
            background: "#d7e7f5",
            border: "#7da4c3",
            color: "#17324a",
          };
    const renderPlate = (plate, index, side) => {
      const height = 32 + (plate / maxPlateWeight) * 36;
      const plateStyle = getPlateStyle(plate);

      return (
        <div
          key={`${side}-${plate}-${index}`}
          title={`${formatPlateNumber(plate)} lb`}
          style={{
            alignItems: "center",
            background: plateStyle.background,
            border: `1px solid ${plateStyle.border}`,
            borderRadius: "5px",
            color: plateStyle.color,
            display: "flex",
            flex: "0 0 clamp(12px, 3.4vw, 15px)",
            fontSize: "10px",
            fontWeight: 700,
            height: `${height}px`,
            justifyContent: "center",
            lineHeight: 1,
            padding: "2px",
            writingMode: "vertical-rl",
          }}
        >
          {formatPlateNumber(plate)}
        </div>
      );
    };

    return (
      <div
        aria-label="Plate loading diagram"
        aria-disabled={!canCycleOptions}
        role="button"
        tabIndex={0}
        onClick={() => {
          if (!canCycleOptions) {
            return;
          }

          onCycleOption?.();
        }}
        onKeyDown={(event) => {
          if (!canCycleOptions || (event.key !== "Enter" && event.key !== " ")) {
            return;
          }

          event.preventDefault();
          onCycleOption?.();
        }}
        style={{
          background: "transparent",
          border: "none",
          color: "inherit",
          cursor: canCycleOptions ? "pointer" : "default",
          display: "grid",
          gap: "8px",
          marginTop: "12px",
          overflow: "hidden",
          padding: 0,
          textAlign: "inherit",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "center",
            display: "grid",
            gap: "3px",
            gridTemplateColumns: diagramColumns,
            width: "100%",
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              flexDirection: "row-reverse",
              gap: "3px",
              justifyContent: "end",
              minWidth: 0,
            }}
          >
            {shownLeftPlates.map((plate, index) =>
              renderPlate(plate, index, "left")
            )}
          </div>

          <div
            style={{
              alignItems: "center",
              display: "flex",
              height: "72px",
              justifyContent: "center",
              minWidth: 0,
              width: "100%",
            }}
          >
            <div
              style={{
                background: "#67717c",
                borderRadius: "999px",
                height: "8px",
                width: "100%",
              }}
            />
          </div>

          <div
            style={{
              alignItems: "center",
              display: "flex",
              gap: "3px",
              justifyContent: "start",
              minWidth: 0,
            }}
          >
            {shownRightPlates.map((plate, index) =>
              renderPlate(plate, index, "right")
            )}
          </div>
        </div>

        <div
          style={{
            alignItems: "center",
            color: "var(--text-muted)",
            display: "grid",
            fontSize: "12px",
            gap: "3px",
            gridTemplateColumns: diagramColumns,
            textAlign: "center",
          }}
        >
          <span>
            {shownLeftTotal > 0 ? `${formatPlateNumber(shownLeftTotal)} lb` : ""}
          </span>
          <strong
            style={{
              color: "var(--text)",
              fontSize: "12px",
            }}
          >
            {formatPlateNumber(currentLoading.equipment.weight)}
          </strong>
          <span>
            {shownRightTotal > 0
              ? `${formatPlateNumber(shownRightTotal)} lb`
              : ""}
          </span>
        </div>
      </div>
    );
  }

  function getManualPlateModeLabel(equipment) {
    if (equipment.loadMode === "balanced" || equipment.loadMode === "cable") {
      return "per side";
    }

    if (equipment.loadMode === "stack") {
      return "in stack";
    }

    return "on sleeve";
  }

  function getManualAvailablePlates(equipment) {
    const requiresPairedPlates =
      equipment.loadMode === "balanced" || equipment.loadMode === "cable";

    return (inventory?.[equipment.categoryKey] || [])
      .filter((plate) =>
        Number(plate.weight) !== 55 ||
        equipment.id === "barbell" ||
        equipment.id === "trapBar"
      )
      .map((plate) => {
        const availableCount = requiresPairedPlates
          ? Math.floor(Number(plate.count) / 2)
          : Number(plate.count);

        return {
          ...plate,
          availableCount: Math.max(0, availableCount || 0),
        };
      })
      .filter((plate) => plate.availableCount > 0 && Number(plate.weight) > 0)
      .sort((a, b) => Number(b.weight) - Number(a.weight));
  }

  function getManualLoading() {
    const equipment = getLoadCalculatorEquipment(draft.equipmentId, inventory);
    const selection = getManualSelection();
    const selectedPlates = Object.entries(selection)
      .flatMap(([weight, count]) =>
        Array.from({ length: Math.max(0, Number(count) || 0) }, () =>
          Number(weight)
        )
      )
      .filter((weight) => Number.isFinite(weight) && weight > 0)
      .sort((a, b) => b - a);
    const plateTotal = selectedPlates.reduce((total, plate) => total + plate, 0);
    const cableLoadMultiplier = Number(draft.cablePulleyCount) === 2 ? 1 : 2;
    const achievedTotal =
      equipment.loadMode === "balanced"
        ? equipment.weight + plateTotal * 2
        : equipment.loadMode === "cable"
          ? plateTotal * cableLoadMultiplier
          : plateTotal;

    return {
      achievedTotal,
      equipment,
      leftPlates:
        equipment.loadMode === "balanced" || equipment.loadMode === "cable"
          ? selectedPlates
          : [],
      machinePlates: equipment.loadMode === "stack" ? selectedPlates : [],
      platesPerSide: selectedPlates,
      rightPlates:
        equipment.loadMode === "balanced" ||
        equipment.loadMode === "singleEnd" ||
        equipment.loadMode === "cable"
          ? selectedPlates
          : [],
      status: "ready",
    };
  }

  function renderManualLoadingTool() {
    const manualLoading = getManualLoading();
    const availablePlates = getManualAvailablePlates(manualLoading.equipment);
    const selectedCount = manualLoading.platesPerSide.length;
    const modeLabel = getManualPlateModeLabel(manualLoading.equipment);

    return (
      <>
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: "8px",
            display: "grid",
            gap: "10px",
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
            <div>
              <div
                style={{
                  alignItems: "baseline",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "6px",
                  justifyContent: "flex-start",
                }}
              >
                <strong>Manual loading</strong>
                <strong>
                  {formatPlateNumber(manualLoading.achievedTotal)} lb
                </strong>
              </div>
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "12px",
                  marginTop: "2px",
                  textAlign: "left",
                }}
              >
                {manualLoading.equipment.label}
              </div>
            </div>
            <button
              disabled={availablePlates.length === 0}
              onClick={() => setPlateSelectorOpen(true)}
              style={{
                minHeight: "34px",
                padding: "6px 10px",
              }}
              type="button"
            >
              Plates
            </button>
          </div>

          {renderLoadedEquipmentDiagram({
            currentLoading: manualLoading,
          })}

          <div
            style={{
              alignItems: "center",
              color: "var(--text-muted)",
              display: "flex",
              fontSize: "12px",
              justifyContent: "space-between",
            }}
          >
            <span>
              {selectedCount > 0
                ? `${selectedCount} selected ${modeLabel}`
                : `No plates selected ${modeLabel}`}
            </span>
            <button
              aria-label="Clear selected plates"
              disabled={selectedCount === 0}
              onClick={resetManualPlateSelection}
              style={{
                alignItems: "center",
                color: selectedCount > 0 ? "var(--danger-text)" : "var(--text-muted)",
                display: "inline-flex",
                gap: "4px",
                minHeight: "28px",
                padding: "4px 8px",
              }}
              type="button"
            >
              <Trash2 size={14} />
              Clear
            </button>
          </div>
        </div>

        {plateSelectorOpen && renderPlateSelectorSheet(manualLoading, availablePlates)}
      </>
    );
  }

  function renderPlateSelectorSheet(manualLoading, availablePlates) {
    const selection = getManualSelection();
    const modeLabel = getManualPlateModeLabel(manualLoading.equipment);

    return (
      <div
        aria-label="Select plates"
        aria-modal="true"
        onClick={() => setPlateSelectorOpen(false)}
        role="dialog"
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
            maxHeight: "76vh",
            maxWidth: "520px",
            overflowY: "auto",
            padding: "16px 16px calc(16px + env(safe-area-inset-bottom))",
            width: "100%",
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
            <div>
              <h3
                style={{
                  fontSize: "18px",
                  margin: 0,
                }}
              >
                Select plates
              </h3>
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "12px",
                  marginTop: "3px",
                }}
              >
                {manualLoading.equipment.label} · counts are {modeLabel}
              </div>
            </div>
            <button
              onClick={() => setPlateSelectorOpen(false)}
              style={{
                minHeight: "34px",
                padding: "6px 10px",
              }}
              type="button"
            >
              Done
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gap: "8px",
            }}
          >
            {availablePlates.length === 0 ? (
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: "13px",
                }}
              >
                No compatible plates are available for this equipment.
              </div>
            ) : (
              availablePlates.map((plate) => {
                const plateKey = formatPlateNumber(plate.weight);
                const selected = Number(selection[plateKey]) || 0;

                return (
                  <div
                    key={plate.id || plateKey}
                    style={{
                      alignItems: "center",
                      background: "var(--surface-muted)",
                      border: "1px solid var(--border)",
                      borderRadius: "8px",
                      display: "grid",
                      gap: "8px",
                      gridTemplateColumns: "minmax(0, 1fr) auto auto auto auto",
                      padding: "8px",
                    }}
                  >
                    <div
                      style={{
                        minWidth: 0,
                      }}
                    >
                      <strong>{formatPlateNumber(plate.weight)} lb</strong>
                      <span
                        style={{
                          color: "var(--text-muted)",
                          display: "block",
                          fontSize: "12px",
                          marginTop: "2px",
                        }}
                      >
                        {plate.availableCount} available {modeLabel}
                      </span>
                    </div>
                    <button
                      aria-label={`Remove one ${formatPlateNumber(plate.weight)} lb plate`}
                      disabled={selected <= 0}
                      onClick={() => setManualPlateCount(plate.weight, selected - 1)}
                      style={{
                        minHeight: "32px",
                        minWidth: "32px",
                        padding: "4px 8px",
                      }}
                      type="button"
                    >
                      -
                    </button>
                    <span
                      aria-label={`${formatPlateNumber(plate.weight)} lb plates selected`}
                      style={{
                        background: "var(--surface-raised)",
                        border: "1px solid var(--border)",
                        borderRadius: "6px",
                        minWidth: "42px",
                        padding: "6px 8px",
                        textAlign: "center",
                      }}
                    >
                      {selected}
                    </span>
                    <button
                      aria-label={`Add one ${formatPlateNumber(plate.weight)} lb plate`}
                      disabled={selected >= plate.availableCount}
                      onClick={() => setManualPlateCount(plate.weight, selected + 1)}
                      style={{
                        minHeight: "32px",
                        minWidth: "32px",
                        padding: "4px 8px",
                      }}
                      type="button"
                    >
                      +
                    </button>
                    <button
                      aria-label={`Reset ${formatPlateNumber(plate.weight)} lb plates`}
                      disabled={selected <= 0}
                      onClick={() => setManualPlateCount(plate.weight, 0)}
                      style={{
                        color: selected > 0 ? "var(--danger-text)" : "var(--text-muted)",
                        minHeight: "32px",
                        minWidth: "32px",
                        padding: "4px 8px",
                      }}
                      type="button"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <section
      style={{
        border: showInputs ? "1px solid var(--border)" : "none",
        borderRadius: "6px",
        boxSizing: "border-box",
        display: "grid",
        gap: "10px",
        margin: showInputs ? "18px auto" : 0,
        maxWidth: fullWidth ? "none" : "520px",
        padding: showInputs ? "10px" : 0,
        width: "100%",
      }}
    >
      {showInputs && (
        <div
          style={{
            display: "grid",
            gap: "8px",
            gridTemplateColumns: "minmax(0, 1fr) minmax(118px, auto)",
          }}
        >
          <button
            aria-label="Select target loaded weight"
            onClick={() => setWeightPickerOpen(true)}
            style={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border)",
              borderRadius: "4px",
              boxSizing: "border-box",
              color: draft.weight ? "var(--text)" : "var(--text-muted)",
              font: "inherit",
              minHeight: "38px",
              minWidth: 0,
              padding: "6px 10px",
              textAlign: "left",
            }}
            type="button"
          >
            {draft.weight ? `${formatPlateNumber(draft.weight)} lb` : "weight"}
          </button>
          <select
            aria-label="Equipment"
            onChange={(event) => {
              setDraft((current) => ({
                ...current,
                equipmentId: event.target.value,
              }));
              setOptionIndexes({});
            }}
            style={{
              font: "inherit",
              minHeight: "38px",
              minWidth: 0,
            }}
            value={draft.equipmentId}
          >
            {LOAD_CALCULATOR_EQUIPMENT.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {displayLoadings.map(({ loading, optionCount }, index) => (
        <div
          key={`${loading.enteredWeight ?? loading.requestedWeight ?? index}-${index}`}
          style={{
            background: "var(--surface-muted)",
            border: "1px solid var(--border)",
            borderRadius: "8px",
            display: "grid",
            gap: "8px",
            padding: "10px",
            textAlign: "left",
          }}
        >
          {loading.status === "empty" && (
            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "12px",
              }}
            >
              Enter a target weight to calculate the loading.
            </div>
          )}

          {loading.status === "underBar" && (
            <div
              style={{
                color: "var(--danger-text)",
                fontSize: "12px",
              }}
            >
              {formatPlateNumber(loading.requestedWeight)} lb is below the{" "}
              {formatPlateNumber(loading.equipment.weight)} lb{" "}
              {loading.equipment.label} weight.
            </div>
          )}

          {loading.status === "ready" && (
            <>
              <div
                style={{
                  alignItems: "center",
                  display: "flex",
                  gap: "10px",
                  justifyContent: "space-between",
                  minWidth: 0,
                }}
              >
                <strong
                  style={{
                    minWidth: 0,
                  }}
                >
                  {loading.exact ? "Load" : "Closest load"}{" "}
                  {formatPlateNumber(loading.achievedTotal)} lb
                </strong>
                {index === 0 && renderCountToggle(loading)}
              </div>

              {loading.platesPerSide.length > 0 ? (
                renderPlateLoadingDiagram(loading, optionCount, index)
              ) : (
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "12px",
                  }}
                >
                  No plates needed.
                </div>
              )}
            </>
          )}
        </div>
      ))}

      {renderManualLoadingTool()}

      <WeightPickerModal
        isOpen={weightPickerOpen}
        increment={5}
        onClose={() => setWeightPickerOpen(false)}
        onSelect={(value) => {
          setDraft((current) => ({
            ...current,
            weight: String(value),
          }));
          setOptionIndexes({});
        }}
        range={250}
        title="Select weight"
        value={draft.weight}
        zIndex={11000}
      />
    </section>
  );
}
