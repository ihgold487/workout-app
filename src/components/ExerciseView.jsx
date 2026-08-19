import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Dumbbell, ImagePlus, X } from "lucide-react";

import { equipmentOptions } from "../data/seedEquipment";
import {
  EXERCISE_STATUS,
  getExerciseStatus,
  isExerciseActive,
} from "../utils/exerciseStatus";
import {
  promoteCustomExerciseToBuiltIn,
  updateBuiltInExercise,
} from "../sync/exerciseCloudSync";
import { isSupabaseConfigured, supabase } from "../sync/supabaseClient";
import { isExerciseBenchmark } from "../utils/exerciseBenchmark";
import ExerciseDetailDialog from "./ExerciseDetailDialog";
import ExerciseThumbnail from "./ExerciseThumbnail";

const muscleGroups = [
  "Abs",
  "Obliques",
  "Biceps",
  "Calves",
  "Chest",
  "Forearms",
  "Front Delts",
  "Full Body",
  "Glutes",
  "Hamstrings",
  "Lats",
  "Quads",
  "Rear Delts",
  "Side Delts",
  "Triceps",
  "Upper Back",
  "Other",
];

const emptyDraft = {
  benchmark: "no",
  bodyweightLoadPercent: "",
  description: "",
  equipment: "",
  imageUrl: "",
  name: "",
  primaryMuscle: "Other",
  secondaryMuscles: [],
};

const cropPreviewSize = 260;
const draftImageExerciseId = "__draft_custom_exercise__";
const savedImageSize = 512;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function bytesIncludeAscii(bytes, text) {
  const codes = Array.from(text).map((character) => character.charCodeAt(0));

  return bytes.some((_, index) =>
    codes.every((code, codeIndex) => bytes[index + codeIndex] === code)
  );
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function isAnimatedImageFile(file) {
  const fileType = file.type.toLowerCase();

  if (fileType === "image/gif") {
    return true;
  }

  if (fileType !== "image/webp" && fileType !== "image/png") {
    return false;
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  return fileType === "image/webp"
    ? bytesIncludeAscii(bytes, "ANIM")
    : bytesIncludeAscii(bytes, "acTL");
}

function getExerciseDraft(exercise = {}) {
  const muscles = Array.isArray(exercise.muscles) ? exercise.muscles : [];
  const bodyweightLoadPercent =
    exercise.bodyweightLoadPercent ?? exercise.bodyweight_load_percent ?? "";

  return {
    benchmark: isExerciseBenchmark(exercise) ? "yes" : "no",
    bodyweightLoadPercent:
      bodyweightLoadPercent == null || bodyweightLoadPercent === ""
        ? ""
        : String(bodyweightLoadPercent),
    description: exercise.description || exercise.note || "",
    equipment: exercise.equipment?.[0] || "",
    imageUrl: exercise.imageUrl || exercise.image_url || "",
    name: exercise.name || "",
    primaryMuscle: muscles[0] || "Other",
    secondaryMuscles: muscles.slice(1),
  };
}

function exerciseFromDraft(draft, existing = {}) {
  const muscles = [
    draft.primaryMuscle || "Other",
    ...draft.secondaryMuscles.filter(
      (muscle) => muscle && muscle !== draft.primaryMuscle
    ),
  ];

  return {
    ...existing,
    benchmark: draft.benchmark === "yes",
    bodyweightLoadPercent:
      draft.bodyweightLoadPercent === ""
        ? null
        : clamp(Number(draft.bodyweightLoadPercent) || 0, 0, 100),
    description: draft.description.trim(),
    equipment: draft.equipment ? [draft.equipment] : [],
    imageUrl: draft.imageUrl.trim(),
    muscles,
    name: draft.name.trim(),
    note: draft.description.trim(),
  };
}

function toggleMuscle(muscles, muscle) {
  return muscles.includes(muscle)
    ? muscles.filter((item) => item !== muscle)
    : [...muscles, muscle];
}

function getExerciseStatusButtonStyle(active) {
  return {
    background: active ? "var(--success-bg)" : "var(--danger-bg)",
    border: `1px solid ${
      active ? "var(--success-text)" : "var(--danger-text)"
    }`,
    color: active ? "var(--success-text)" : "var(--danger-text)",
    fontWeight: "bold",
  };
}

function getFirstEquipmentValue(exercise) {
  return Array.isArray(exercise?.equipment)
    ? exercise.equipment[0] || ""
    : exercise?.equipment || "";
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

function getExercisePreferenceKeys(exercise) {
  return [
    exercise?.exerciseId,
    exercise?.id,
    exercise?.sourceKey,
    exercise?.source_key,
  ]
    .filter((value) => value !== "" && value != null)
    .map(String);
}

function getPreferenceExerciseKeys(preference) {
  return [
    preference?.exercise_id,
    preference?.metadata?.localExerciseId,
    preference?.metadata?.localExerciseID,
  ]
    .filter((value) => value !== "" && value != null)
    .map(String);
}

export default function ExerciseView({
  bodyWeightEntries = [],
  exerciseLibrary,
  history = [],
  onUpdateHistoryWorkoutSet,
  session = null,
  setExerciseLibrary,
}) {
  const addExerciseSectionRef = useRef(null);
  const cropDragRef = useRef(null);
  const cropOffsetRef = useRef({
    x: 0,
    y: 0,
  });
  const cropPinchRef = useRef(null);
  const cropPointersRef = useRef(new Map());
  const cropZoomRef = useRef(1);
  const photoInputRef = useRef(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [detailExercise, setDetailExercise] = useState(null);
  const [editingExercise, setEditingExercise] = useState(null);
  const [editingDraft, setEditingDraft] = useState(emptyDraft);
  const [editingSaveStatus, setEditingSaveStatus] = useState("");
  const [imageExercise, setImageExercise] = useState(null);
  const [imageSaveStatus, setImageSaveStatus] = useState("");
  const [copyImageExerciseId, setCopyImageExerciseId] = useState("");
  const [copyImageSearch, setCopyImageSearch] = useState("");
  const [cropImage, setCropImage] = useState(null);
  const [cropOffset, setCropOffset] = useState({
    x: 0,
    y: 0,
  });
  const [cropZoom, setCropZoom] = useState(1);
  const [exerciseType, setExerciseType] = useState("");
  const [promoteExerciseStatus, setPromoteExerciseStatus] = useState("");
  const [promotingExerciseId, setPromotingExerciseId] = useState(null);
  const [trainerCanAddBuiltIns, setTrainerCanAddBuiltIns] = useState(false);
  const [trainerPreferences, setTrainerPreferences] = useState([]);
  const [trainerStatus, setTrainerStatus] = useState("");
  const [trainerUsers, setTrainerUsers] = useState([]);
  const [selectedTrainerUserId, setSelectedTrainerUserId] = useState("");
  const [savingPreferenceExerciseId, setSavingPreferenceExerciseId] =
    useState(null);
  const [exerciseStatus, setExerciseStatus] = useState("");
  const [selectedEquipment, setSelectedEquipment] = useState("");
  const [selectedMuscle, setSelectedMuscle] = useState("");
  const [search, setSearch] = useState("");

  const selectedTrainerUser =
    trainerUsers.find((user) => user.user_id === selectedTrainerUserId) ||
    trainerUsers.find((user) => user.is_self) ||
    trainerUsers[0] ||
    null;
  const isTrainerTargetSelf = !selectedTrainerUser || selectedTrainerUser.is_self;
  const canManageSelectedUserPreferences =
    !isTrainerTargetSelf && Boolean(selectedTrainerUserId);

  const displayedExerciseLibrary = useMemo(() => {
    if (isTrainerTargetSelf) {
      return exerciseLibrary;
    }

    const preferenceByKey = new Map();
    trainerPreferences.forEach((preference) => {
      getPreferenceExerciseKeys(preference).forEach((key) => {
        preferenceByKey.set(key, preference);
      });
    });

    return exerciseLibrary
      .filter((exercise) => exercise.builtin)
      .map((exercise) => {
        const preference = getExercisePreferenceKeys(exercise)
          .map((key) => preferenceByKey.get(key))
          .find(Boolean);

        return {
          ...exercise,
          active: preference?.exclude_from_plans
            ? EXERCISE_STATUS.inactive
            : EXERCISE_STATUS.active,
        };
      });
  }, [exerciseLibrary, isTrainerTargetSelf, trainerPreferences]);

  const customExerciseCount = displayedExerciseLibrary.filter(
    (exercise) => !exercise.builtin
  ).length;

  useEffect(
    () => () => {
      if (cropImage?.url) {
        URL.revokeObjectURL(cropImage.url);
      }
    },
    [cropImage?.url]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadTrainerPermission() {
      setTrainerCanAddBuiltIns(false);

      if (!session?.user?.id || !isSupabaseConfigured || !supabase) {
        return;
      }

      const { data, error } = await supabase
        .from("trainer_admins")
        .select("trainer_user_id")
        .eq("trainer_user_id", session.user.id)
        .maybeSingle();

      if (cancelled) {
        return;
      }

      if (error) {
        console.error("Unable to load trainer permission:", error);
        return;
      }

      setTrainerCanAddBuiltIns(Boolean(data));
    }

    loadTrainerPermission();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    let cancelled = false;

    async function loadTrainerUsers() {
      setTrainerUsers([]);
      setSelectedTrainerUserId("");
      setTrainerStatus("");

      if (!session?.user?.id || !isSupabaseConfigured || !supabase) {
        return;
      }

      const { data, error } = await supabase.rpc("list_trainer_users");

      if (cancelled) {
        return;
      }

      if (error) {
        setTrainerStatus(`Unable to load trainer users: ${error.message}`);
        return;
      }

      const users = Array.isArray(data) ? data : [];
      setTrainerUsers(users);

      const selfUser = users.find((user) => user.is_self) || users[0];
      setSelectedTrainerUserId(selfUser?.user_id || "");
    }

    loadTrainerUsers();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    let cancelled = false;

    async function loadTrainerPreferences() {
      setTrainerPreferences([]);

      if (
        !selectedTrainerUserId ||
        isTrainerTargetSelf ||
        !isSupabaseConfigured ||
        !supabase
      ) {
        return;
      }

      const { data, error } = await supabase.rpc(
        "get_trainer_user_exercise_preferences",
        {
          target_user_id: selectedTrainerUserId,
        }
      );

      if (cancelled) {
        return;
      }

      if (error) {
        setTrainerStatus(`Unable to load exercise preferences: ${error.message}`);
        setTrainerPreferences([]);
        return;
      }

      setTrainerPreferences(Array.isArray(data) ? data : []);
      setTrainerStatus("");
    }

    loadTrainerPreferences();

    return () => {
      cancelled = true;
    };
  }, [isTrainerTargetSelf, selectedTrainerUserId]);

  function setNextCropOffset(nextOffset) {
    cropOffsetRef.current = nextOffset;
    setCropOffset(nextOffset);
  }

  function setNextCropZoom(nextZoom) {
    cropZoomRef.current = nextZoom;
    setCropZoom(nextZoom);
  }

  function resetCropGestures() {
    cropDragRef.current = null;
    cropPinchRef.current = null;
    cropPointersRef.current.clear();
  }

  function resetCropAdjustment() {
    resetCropGestures();
    setNextCropOffset({
      x: 0,
      y: 0,
    });
    setNextCropZoom(1);
  }

  const filteredExercises = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return [...displayedExerciseLibrary]
      .filter((exercise) => {
        const primaryMuscle = exercise.muscles?.[0] || "";
        const equipment = exercise.equipment?.[0] || "";
        const matchesSearch =
          !normalizedSearch ||
          exercise.name.toLowerCase().includes(normalizedSearch);
        const matchesMuscle = !selectedMuscle || primaryMuscle === selectedMuscle;
        const matchesEquipment =
          !selectedEquipment || equipment === selectedEquipment;
        const matchesType =
          !exerciseType ||
          (exerciseType === "builtin" && exercise.builtin) ||
          (exerciseType === "custom" && !exercise.builtin);
        const matchesStatus =
          !exerciseStatus || getExerciseStatus(exercise) === exerciseStatus;

        return (
          matchesSearch &&
          matchesMuscle &&
          matchesEquipment &&
          matchesType &&
          matchesStatus
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [
    displayedExerciseLibrary,
    exerciseStatus,
    exerciseType,
    search,
    selectedEquipment,
    selectedMuscle,
  ]);

  const copyImageExercises = useMemo(() => {
    if (!imageExercise) {
      return [];
    }

    const normalizedSearch = copyImageSearch.trim().toLowerCase();

    return exerciseLibrary
      .filter((exercise) => {
        if (!exercise.imageUrl || exercise.id === imageExercise.id) {
          return false;
        }

        const searchableText = [
          exercise.name,
          exercise.equipment?.[0],
          exercise.muscles?.[0],
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return !normalizedSearch || searchableText.includes(normalizedSearch);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [copyImageSearch, exerciseLibrary, imageExercise]);

  function addExercise() {
    const missingFields = [
      !draft.name.trim() ? "exercise name" : null,
      !draft.equipment ? "equipment" : null,
      !draft.primaryMuscle ? "primary muscle" : null,
    ].filter(Boolean);

    if (missingFields.length > 0) {
      alert(`Missing: ${missingFields.join(", ")}`);
      return;
    }

    setExerciseLibrary([
      ...exerciseLibrary,
      exerciseFromDraft(draft, {
        builtin: false,
        active: EXERCISE_STATUS.active,
        id: Date.now(),
      }),
    ]);
    setDraft(emptyDraft);
  }

  function startEdit(exercise) {
    setEditingExercise(exercise);
    setEditingDraft(getExerciseDraft(exercise));
    setEditingSaveStatus("");
  }

  async function saveEdit() {
    if (!editingDraft.name.trim()) {
      alert("Exercise name required");
      return;
    }

    const updatedExercise = exerciseFromDraft(editingDraft, editingExercise);

    if (editingExercise.builtin) {
      if (!trainerCanAddBuiltIns) {
        setEditingSaveStatus("Only trainer admins can edit built-in exercises.");
        return;
      }

      setEditingSaveStatus("Saving built-in exercise...");

      try {
        const updatedExerciseId = await updateBuiltInExercise(
          updatedExercise,
          session,
          editingExercise
        );

        setExerciseLibrary(
          exerciseLibrary.map((exercise) =>
            exercise.id === editingExercise.id
              ? {
                  ...updatedExercise,
                  exerciseId: updatedExerciseId || updatedExercise.exerciseId,
                }
              : exercise
          )
        );
        setEditingExercise(null);
        setEditingDraft(emptyDraft);
        setEditingSaveStatus("");
      } catch (error) {
        console.error("Failed to update built-in exercise:", error);
        setEditingSaveStatus(`Unable to save built-in exercise: ${error.message}`);
      }

      return;
    }

    setExerciseLibrary(
      exerciseLibrary.map((exercise) =>
        exercise.id === editingExercise.id ? updatedExercise : exercise
      )
    );
    setEditingExercise(null);
    setEditingDraft(emptyDraft);
    setEditingSaveStatus("");
  }

  async function toggleExerciseStatus(exerciseToToggle) {
    const nextStatus = isExerciseActive(exerciseToToggle)
      ? EXERCISE_STATUS.inactive
      : EXERCISE_STATUS.active;

    if (canManageSelectedUserPreferences) {
      const previousPreferences = trainerPreferences;
      const nextExcludeFromPlans = nextStatus === EXERCISE_STATUS.inactive;
      const exercisePreferenceKeys = getExercisePreferenceKeys(exerciseToToggle);
      const existingPreference = trainerPreferences.find((preference) =>
        getPreferenceExerciseKeys(preference).some((key) =>
          exercisePreferenceKeys.includes(key)
        )
      );
      const optimisticPreference = {
        ...(existingPreference || {}),
        exercise_id:
          existingPreference?.exercise_id ||
          exerciseToToggle.exerciseId ||
          (isUuid(exerciseToToggle.id) ? exerciseToToggle.id : null),
        exclude_from_plans: nextExcludeFromPlans,
        include_in_plans: !nextExcludeFromPlans,
        metadata: {
          ...(existingPreference?.metadata || {}),
          localActiveStatus:
            nextStatus === EXERCISE_STATUS.inactive ? "inactive" : "active",
          localExerciseId: exerciseToToggle.id,
        },
      };

      setTrainerPreferences([
        ...trainerPreferences.filter((preference) => preference !== existingPreference),
        optimisticPreference,
      ]);
      setSavingPreferenceExerciseId(exerciseToToggle.id);
      setTrainerStatus("");

      try {
        const exerciseId =
          exerciseToToggle.exerciseId ||
          (isUuid(exerciseToToggle.id) ? exerciseToToggle.id : null);

        const { error } = await supabase.rpc(
          "set_trainer_user_exercise_plan_status",
          {
            exclude_from_plans: nextExcludeFromPlans,
            exercise_equipment: getFirstEquipmentValue(exerciseToToggle),
            exercise_name: exerciseToToggle.name,
            target_exercise_id: exerciseId,
            target_user_id: selectedTrainerUserId,
          }
        );

        if (error) {
          throw error;
        }

        setTrainerStatus(
          `${exerciseToToggle.name} set ${nextStatus} for ${selectedTrainerUser.display_name}.`
        );
      } catch (error) {
        console.error("Failed to update trainer exercise preference:", error);
        setTrainerPreferences(previousPreferences);
        setTrainerStatus(`Unable to update exercise status: ${error.message}`);
      } finally {
        setSavingPreferenceExerciseId(null);
      }

      return;
    }

    setExerciseLibrary(
      exerciseLibrary.map((exercise) =>
        exercise.id === exerciseToToggle.id
          ? {
              ...exercise,
              active: nextStatus,
            }
          : exercise
      )
    );
  }

  function duplicateExercise(event, exercise) {
    event.stopPropagation();
    setDraft({
      ...getExerciseDraft(exercise),
      name: `${exercise.name} - copy`,
    });
    requestAnimationFrame(() => {
      addExerciseSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  async function addCustomExerciseAsBuiltIn(event, exercise) {
    event.stopPropagation();

    if (!trainerCanAddBuiltIns) {
      setPromoteExerciseStatus("Only trainer admins can add built-in exercises.");
      return;
    }

    setPromotingExerciseId(exercise.id);
    setPromoteExerciseStatus(`Adding ${exercise.name} as built-in...`);

    try {
      const promotedExerciseId = await promoteCustomExerciseToBuiltIn(
        exercise,
        session
      );

      setExerciseLibrary(
        exerciseLibrary.map((item) =>
          item.id === exercise.id
            ? {
                ...item,
                builtin: true,
                exerciseId: promotedExerciseId || item.exerciseId,
                source: "trainer_promoted",
                sourceKey:
                  item.sourceKey ||
                  ["trainer-promoted", session.user.id, String(item.id)].join(
                    ":"
                  ),
              }
            : item
        )
      );
      setPromoteExerciseStatus(`${exercise.name} is now a built-in exercise.`);
    } catch (error) {
      console.error("Failed to add exercise as built-in:", error);
      setPromoteExerciseStatus(
        `Unable to add ${exercise.name} as built-in: ${error.message}`
      );
    } finally {
      setPromotingExerciseId(null);
    }
  }

  function openDraftImageSheet(event) {
    event.stopPropagation();
    setImageExercise({
      id: draftImageExerciseId,
      imageUrl: draft.imageUrl,
      name: draft.name.trim() || "New custom exercise",
    });
    setCopyImageExerciseId("");
    setCopyImageSearch("");
    setCropImage(null);
    setImageSaveStatus("");
    resetCropAdjustment();
  }

  function openImageSheet(event, exercise) {
    event.stopPropagation();
    setImageExercise(exercise);
    setCopyImageExerciseId("");
    setCopyImageSearch("");
    setCropImage(null);
    setImageSaveStatus("");
    resetCropAdjustment();
  }

  function closeImageSheet() {
    setImageExercise(null);
    setImageSaveStatus("");
    setCopyImageExerciseId("");
    setCopyImageSearch("");
    setCropImage(null);
    resetCropAdjustment();
  }

  async function updateExerciseImage(exerciseId, imageUrl) {
    if (!String(imageUrl || "").trim()) {
      setImageSaveStatus("Choose an image before saving.");
      return false;
    }

    if (exerciseId === draftImageExerciseId) {
      setDraft((currentDraft) => ({
        ...currentDraft,
        imageUrl,
      }));
      setImageExercise((exercise) =>
        exercise?.id === draftImageExerciseId
          ? {
              ...exercise,
              imageUrl,
            }
          : exercise
      );
      return true;
    }

    const existingExercise =
      exerciseLibrary.find((exercise) => exercise.id === exerciseId) ||
      imageExercise;

    if (!existingExercise) {
      setImageSaveStatus("Unable to find this exercise.");
      return false;
    }

    const updatedExercise = {
      ...existingExercise,
      imageUrl,
    };

    if (existingExercise.builtin) {
      if (!trainerCanAddBuiltIns) {
        setImageSaveStatus("Only trainer admins can edit built-in images.");
        return false;
      }

      setImageSaveStatus("Saving built-in image...");

      try {
        const updatedExerciseId = await updateBuiltInExercise(
          updatedExercise,
          session,
          existingExercise
        );

        updatedExercise.exerciseId =
          updatedExerciseId || updatedExercise.exerciseId;
      } catch (error) {
        console.error("Failed to update built-in exercise image:", error);
        setImageSaveStatus(`Unable to save built-in image: ${error.message}`);
        return false;
      }
    }

    setExerciseLibrary(
      exerciseLibrary.map((exercise) =>
        exercise.id === exerciseId
          ? {
              ...exercise,
              ...updatedExercise,
            }
          : exercise
      )
    );
    setImageExercise((exercise) =>
      exercise && exercise.id === exerciseId
        ? {
            ...exercise,
            ...updatedExercise,
          }
        : exercise
    );
    setImageSaveStatus("");
    return true;
  }

  async function copyExerciseImage() {
    if (!imageExercise || !copyImageExerciseId) {
      return;
    }

    const sourceExercise = exerciseLibrary.find(
      (exercise) => String(exercise.id) === String(copyImageExerciseId)
    );

    if (!sourceExercise?.imageUrl) {
      return;
    }

    if (await updateExerciseImage(imageExercise.id, sourceExercise.imageUrl)) {
      closeImageSheet();
    }
  }

  async function handleImageFile(file) {
    if (!file || !imageExercise) {
      return;
    }

    try {
      if (await isAnimatedImageFile(file)) {
        const imageUrl = await readFileAsDataUrl(file);

        if (await updateExerciseImage(imageExercise.id, imageUrl)) {
          closeImageSheet();
        }
        return;
      }
    } catch (error) {
      console.error("Unable to preserve animated image:", error);
      alert("Unable to load this image.");
      return;
    }

    setCropImage({
      name: file.name,
      url: URL.createObjectURL(file),
    });
    resetCropAdjustment();
  }

  function getCropPointerCenter(points, element) {
    const bounds = element.getBoundingClientRect();
    const averageX =
      points.reduce((total, point) => total + point.x, 0) / points.length;
    const averageY =
      points.reduce((total, point) => total + point.y, 0) / points.length;

    return {
      x: averageX - bounds.left - cropPreviewSize / 2,
      y: averageY - bounds.top - cropPreviewSize / 2,
    };
  }

  function getCropPointerDistance(points) {
    const [first, second] = points;
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  function getActiveCropPointers() {
    return Array.from(cropPointersRef.current.values()).slice(0, 2);
  }

  function startCropGesture(event) {
    cropPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    event.currentTarget.setPointerCapture?.(event.pointerId);

    if (cropPointersRef.current.size === 1) {
      cropDragRef.current = {
        pointerId: event.pointerId,
        startOffset: cropOffsetRef.current,
        x: event.clientX,
        y: event.clientY,
      };
      cropPinchRef.current = null;
      return;
    }

    const points = getActiveCropPointers();
    cropDragRef.current = null;
    cropPinchRef.current = {
      center: getCropPointerCenter(points, event.currentTarget),
      distance: Math.max(getCropPointerDistance(points), 1),
      startOffset: cropOffsetRef.current,
      startZoom: cropZoomRef.current,
    };
  }

  function moveCropGesture(event) {
    if (!cropPointersRef.current.has(event.pointerId)) {
      return;
    }

    cropPointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (cropPointersRef.current.size >= 2 && cropPinchRef.current) {
      const points = getActiveCropPointers();
      const pinch = cropPinchRef.current;
      const distance = getCropPointerDistance(points);
      const currentCenter = getCropPointerCenter(points, event.currentTarget);
      const nextZoom = clamp(
        pinch.startZoom * (distance / pinch.distance),
        1,
        3
      );
      const zoomRatio = nextZoom / pinch.startZoom;

      setNextCropZoom(nextZoom);
      setNextCropOffset({
        x: clamp(
          currentCenter.x - (pinch.center.x - pinch.startOffset.x) * zoomRatio,
          -160,
          160
        ),
        y: clamp(
          currentCenter.y - (pinch.center.y - pinch.startOffset.y) * zoomRatio,
          -160,
          160
        ),
      });
      return;
    }

    if (!cropDragRef.current) {
      cropDragRef.current = {
        pointerId: event.pointerId,
        startOffset: cropOffsetRef.current,
        x: event.clientX,
        y: event.clientY,
      };
    }
    const drag = cropDragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    setNextCropOffset({
      x: clamp(drag.startOffset.x + event.clientX - drag.x, -160, 160),
      y: clamp(drag.startOffset.y + event.clientY - drag.y, -160, 160),
    });
  }

  function endCropGesture(event) {
    cropPointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }

    if (cropDragRef.current?.pointerId === event.pointerId) {
      cropDragRef.current = null;
    }

    if (cropPointersRef.current.size === 1) {
      const [[pointerId, point]] = cropPointersRef.current.entries();
      cropDragRef.current = {
        pointerId,
        startOffset: cropOffsetRef.current,
        x: point.x,
        y: point.y,
      };
      cropPinchRef.current = null;
      return;
    }

    if (cropPointersRef.current.size === 0) {
      cropPinchRef.current = null;
    }
  }

  function cancelCropImage() {
    setCropImage(null);
    resetCropAdjustment();
  }

  function saveCroppedImage() {
    if (!cropImage || !imageExercise) {
      return;
    }

    const image = new Image();

    image.onload = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = savedImageSize;
      canvas.height = savedImageSize;
      const context = canvas.getContext("2d");

      if (!context) {
        alert("Unable to crop this image.");
        return;
      }

      const naturalWidth = image.naturalWidth || image.width;
      const naturalHeight = image.naturalHeight || image.height;
      const baseScale = Math.max(
        cropPreviewSize / naturalWidth,
        cropPreviewSize / naturalHeight
      );
      const displayedWidth = naturalWidth * baseScale * cropZoom;
      const displayedHeight = naturalHeight * baseScale * cropZoom;
      const outputScale = savedImageSize / cropPreviewSize;

      context.fillStyle = "#fff";
      context.fillRect(0, 0, savedImageSize, savedImageSize);
      context.drawImage(
        image,
        (cropPreviewSize / 2 + cropOffset.x - displayedWidth / 2) *
          outputScale,
        (cropPreviewSize / 2 + cropOffset.y - displayedHeight / 2) *
          outputScale,
        displayedWidth * outputScale,
        displayedHeight * outputScale
      );

      if (
        await updateExerciseImage(
          imageExercise.id,
          canvas.toDataURL("image/webp", 0.86)
        )
      ) {
        closeImageSheet();
      }
    };

    image.onerror = () => {
      alert("Unable to load this image.");
    };
    image.src = cropImage.url;
  }

  function renderExerciseForm(
    formDraft,
    setFormDraft,
    { compact = false, draftImagePicker = false } = {}
  ) {
    const availableSecondaryMuscles = muscleGroups.filter(
      (muscle) => muscle !== formDraft.primaryMuscle
    );
    const isImageLayout = draftImagePicker && !compact;
    const bodyweightValue =
      formDraft.bodyweightLoadPercent === "" || formDraft.bodyweightLoadPercent == null
        ? "0"
        : String(formDraft.bodyweightLoadPercent);
    const nameInput = (
      <input
        value={formDraft.name}
        onChange={(event) =>
          setFormDraft({
            ...formDraft,
            name: event.target.value,
          })
        }
        placeholder="Exercise name"
        style={{
          boxSizing: "border-box",
          minWidth: 0,
          width: "100%",
        }}
      />
    );
    const equipmentSelect = (
      <select
        style={{
          boxSizing: "border-box",
          width: "100%",
        }}
        value={formDraft.equipment}
        onChange={(event) =>
          setFormDraft({
            ...formDraft,
            equipment: event.target.value,
          })
        }
      >
        <option value="">Equipment</option>
        {equipmentOptions.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    );
    const descriptionInput = (
      <textarea
        value={formDraft.description}
        onChange={(event) =>
          setFormDraft({
            ...formDraft,
            description: event.target.value,
          })
        }
        placeholder="Description or notes"
        rows={2}
        style={{
          boxSizing: "border-box",
          minHeight: isImageLayout ? "72px" : undefined,
          resize: "vertical",
          width: "100%",
        }}
      />
    );
    const imageButton = draftImagePicker ? (
      <button
        aria-label="Select image for new custom exercise"
        onClick={openDraftImageSheet}
        style={{
          alignItems: "center",
          alignSelf: "start",
          background: "transparent",
          border: "none",
          display: "flex",
          justifyContent: "center",
          padding: 0,
        }}
        type="button"
      >
        {formDraft.imageUrl ? (
          <ExerciseThumbnail
            alt={`${formDraft.name || "Custom exercise"} image`}
            imageUrl={formDraft.imageUrl}
            size={104}
          />
        ) : (
          <span
            style={{
              alignItems: "center",
              background: "var(--surface-muted)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              color: "var(--text-muted)",
              display: "flex",
              height: "104px",
              justifyContent: "center",
              width: "104px",
            }}
          >
            <ImagePlus size={30} />
          </span>
        )}
      </button>
    ) : null;
    const primaryMuscleSelect = (
      <label
        style={{
          alignItems: isImageLayout ? "center" : undefined,
          display: "grid",
          gap: "4px",
          gridTemplateColumns: isImageLayout ? "auto minmax(0, 1fr)" : undefined,
        }}
      >
        <span
          style={{
            fontSize: "12px",
            fontWeight: "bold",
            whiteSpace: isImageLayout ? "nowrap" : undefined,
          }}
        >
          Primary muscle
        </span>
        <select
          style={{
            boxSizing: "border-box",
            width: "100%",
          }}
          value={formDraft.primaryMuscle}
          onChange={(event) =>
            setFormDraft({
              ...formDraft,
              primaryMuscle: event.target.value,
              secondaryMuscles: formDraft.secondaryMuscles.filter(
                (muscle) => muscle !== event.target.value
              ),
            })
          }
        >
          {muscleGroups.map((muscle) => (
            <option key={muscle} value={muscle}>
              {muscle}
            </option>
          ))}
        </select>
      </label>
    );
    const bodyweightSelect = (
      <label
        style={{
          display: "grid",
          gap: "4px",
          maxWidth: isImageLayout ? "180px" : undefined,
        }}
      >
        <span
          style={{
            color: "var(--text-muted)",
            fontSize: "12px",
            fontWeight: "bold",
          }}
        >
          Bodyweight e1RM %
        </span>
        <select
          style={{
            boxSizing: "border-box",
            width: "100%",
          }}
          onChange={(event) =>
            setFormDraft({
              ...formDraft,
              bodyweightLoadPercent: event.target.value,
            })
          }
          value={bodyweightValue}
        >
          {[0, 25, 50, 100].map((value) => (
            <option key={value} value={String(value)}>
              {value}
            </option>
          ))}
        </select>
      </label>
    );
    const benchmarkSelect = (
      <label
        style={{
          display: "grid",
          gap: "4px",
          maxWidth: isImageLayout ? "180px" : undefined,
        }}
      >
        <span
          style={{
            color: "var(--text-muted)",
            fontSize: "12px",
            fontWeight: "bold",
          }}
        >
          Benchmark
        </span>
        <select
          style={{
            boxSizing: "border-box",
            width: "100%",
          }}
          onChange={(event) =>
            setFormDraft({
              ...formDraft,
              benchmark: event.target.value,
            })
          }
          value={formDraft.benchmark || "no"}
        >
          <option value="no">No</option>
          <option value="yes">Yes</option>
        </select>
      </label>
    );

    return (
      <div
        style={{
          display: "grid",
          gap: "8px",
          gridTemplateColumns: isImageLayout
            ? "112px minmax(0, calc(100% - 112px))"
            : compact
              ? "1fr"
              : "minmax(0, 1fr) 140px 120px 120px",
        }}
      >
        {isImageLayout ? (
          <>
            <div
              style={{
                gridColumn: "1",
                gridRow: "1 / span 3",
              }}
            >
              {imageButton}
            </div>
            <div
              style={{
                gridColumn: "2",
              }}
            >
              {nameInput}
            </div>
            <div
              style={{
                gridColumn: "2",
              }}
            >
              {descriptionInput}
            </div>
            <div
              style={{
                gridColumn: "2",
              }}
            >
              {equipmentSelect}
            </div>
            <div
              style={{
                gridColumn: "1 / -1",
              }}
            >
              {primaryMuscleSelect}
            </div>
            <div
              style={{
                gridColumn: "1 / -1",
              }}
            >
              {benchmarkSelect}
            </div>
          </>
        ) : (
          <>
            {nameInput}
            {equipmentSelect}
            {benchmarkSelect}
            {bodyweightSelect}
            <div
              style={{
                gridColumn: compact ? "auto" : "1 / -1",
              }}
            >
              {descriptionInput}
            </div>
            {primaryMuscleSelect}
          </>
        )}

        <div
          style={{
            gridColumn: compact ? "auto" : "1 / -1",
          }}
        >
          <div
            style={{
              fontSize: "12px",
              fontWeight: "bold",
              marginBottom: "4px",
              textAlign: "left",
            }}
          >
            Secondary muscles
          </div>
          <div
            style={{
              display: "grid",
              gap: "4px",
              gridTemplateColumns: "repeat(auto-fit, minmax(112px, 1fr))",
            }}
          >
            {availableSecondaryMuscles.map((muscle) => (
              <label
                key={muscle}
                style={{
                  alignItems: "center",
                  display: "flex",
                  fontSize: "12px",
                  gap: "4px",
                }}
              >
                <input
                  checked={formDraft.secondaryMuscles.includes(muscle)}
                  onChange={() =>
                    setFormDraft({
                      ...formDraft,
                      secondaryMuscles: toggleMuscle(
                        formDraft.secondaryMuscles,
                        muscle
                      ),
                    })
                  }
                  type="checkbox"
                />
                {muscle}
              </label>
            ))}
          </div>
        </div>

        {isImageLayout && (
          <div
            style={{
              gridColumn: "1 / -1",
              minWidth: "150px",
              width: isImageLayout ? "25%" : undefined,
            }}
          >
            {bodyweightSelect}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        margin: "0 auto",
        maxWidth: "760px",
        padding: "16px",
        textAlign: "left",
      }}
    >
      <div
        style={{
          alignItems: "center",
          display: "grid",
          gap: "10px",
          gridTemplateColumns: "auto minmax(0, 1fr) auto",
          marginBottom: "12px",
        }}
      >
        <Dumbbell size={26} />
        <h1
          style={{
            fontSize: "1.6rem",
            margin: 0,
          }}
        >
          Exercises
        </h1>
        <div
          style={{
            color: "var(--text-muted)",
            fontSize: "12px",
            textAlign: "right",
            whiteSpace: "nowrap",
          }}
        >
          {displayedExerciseLibrary.length} exercises · {customExerciseCount} custom
        </div>
      </div>

      {trainerUsers.length > 1 && (
        <label
          style={{
            display: "grid",
            gap: "4px",
            marginBottom: "12px",
          }}
        >
          User name
          <select
            value={selectedTrainerUserId}
            onChange={(event) => {
              setSelectedTrainerUserId(event.target.value);
              setTrainerStatus("");
            }}
            style={{
              boxSizing: "border-box",
              font: "inherit",
              minHeight: "40px",
              padding: "6px 10px",
              width: "100%",
            }}
          >
            {trainerUsers.map((user) => (
              <option key={user.user_id} value={user.user_id}>
                {user.display_name}
                {user.is_self ? " (you)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      {trainerStatus && (
        <div
          role="status"
          style={{
            color: "var(--text-muted)",
            fontSize: "13px",
            marginBottom: "12px",
          }}
        >
          {trainerStatus}
        </div>
      )}

      {isTrainerTargetSelf && (
        <section
          ref={addExerciseSectionRef}
          style={{
            border: "1px solid var(--border)",
            borderRadius: "6px",
            marginBottom: "14px",
            padding: "12px",
          }}
        >
          <div
            style={{
              alignItems: "center",
              display: "flex",
              gap: "8px",
              justifyContent: "space-between",
              marginBottom: "10px",
            }}
          >
            <h2
              style={{
                fontSize: "1rem",
                margin: 0,
              }}
            >
              Add Custom Exercise
            </h2>
            <button onClick={() => setDraft(emptyDraft)} type="button">
              Clear
            </button>
          </div>

          {renderExerciseForm(draft, setDraft, {
            draftImagePicker: true,
          })}

          <div
            style={{
              alignItems: "flex-end",
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
              justifyContent: "flex-end",
              marginTop: "10px",
            }}
          >
            <button onClick={addExercise}>+ Add Exercise</button>
          </div>
        </section>
      )}

      <section
        style={{
          display: "grid",
          gap: "8px",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          marginBottom: "12px",
        }}
      >
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search exercises"
          style={{
            minWidth: 0,
          }}
        />

        <select
          value={selectedMuscle}
          onChange={(event) => setSelectedMuscle(event.target.value)}
        >
          <option value="">All muscles</option>
          {muscleGroups.map((muscle) => (
            <option key={muscle} value={muscle}>
              {muscle}
            </option>
          ))}
        </select>

        <select
          value={selectedEquipment}
          onChange={(event) => setSelectedEquipment(event.target.value)}
        >
          <option value="">All equipment</option>
          {equipmentOptions.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <select
          value={exerciseType}
          onChange={(event) => setExerciseType(event.target.value)}
        >
          <option value="">All types</option>
          <option value="builtin">Built-in</option>
          <option value="custom">Custom</option>
        </select>

        <select
          value={exerciseStatus}
          onChange={(event) => setExerciseStatus(event.target.value)}
        >
          <option value="">All status</option>
          <option value={EXERCISE_STATUS.active}>Active</option>
          <option value={EXERCISE_STATUS.inactive}>Inactive</option>
        </select>
      </section>

      <div
        style={{
          display: "grid",
          gap: "8px",
        }}
      >
        {filteredExercises.map((exercise) => {
          const primaryMuscle = exercise.muscles?.[0] || "Other";
          const secondaryMuscles = exercise.muscles?.slice(1) || [];
          const active = isExerciseActive(exercise);

          return (
            <div
              key={exercise.id}
              role="button"
              tabIndex={0}
              onClick={() => setDetailExercise(exercise)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setDetailExercise(exercise);
                }
              }}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                color: "var(--text)",
                cursor: "pointer",
                padding: "10px",
                textAlign: "left",
                width: "100%",
              }}
            >
              <div
                style={{
                  alignItems: "flex-start",
                  display: "flex",
                  gap: "8px",
                  justifyContent: "space-between",
                }}
              >
                {canManageSelectedUserPreferences ||
                (exercise.builtin && !trainerCanAddBuiltIns) ? (
                  <ExerciseThumbnail
                    alt={exercise.imageAlt || `${exercise.name} demonstration`}
                    imageUrl={exercise.imageUrl}
                    size={76}
                  />
                ) : (
                  <button
                    aria-label={`Select image for ${exercise.name}`}
                    onClick={(event) => openImageSheet(event, exercise)}
                    style={{
                      background: "transparent",
                      border: "none",
                      flex: "0 0 76px",
                      height: "76px",
                      padding: 0,
                      width: "76px",
                    }}
                  >
                    {exercise.imageUrl ? (
                      <ExerciseThumbnail
                        alt={exercise.imageAlt || `${exercise.name} demonstration`}
                        imageUrl={exercise.imageUrl}
                        size={76}
                      />
                    ) : (
                      <span
                        style={{
                          alignItems: "center",
                          background: "var(--surface-muted)",
                          border: "1px solid var(--border)",
                          borderRadius: "6px",
                          color: "var(--text-muted)",
                          display: "flex",
                          height: "76px",
                          justifyContent: "center",
                          width: "76px",
                        }}
                      >
                        <ImagePlus size={24} />
                      </span>
                    )}
                  </button>
                )}

                <div
                  style={{
                    minWidth: 0,
                  }}
                >
                  <div
                    style={{
                      fontWeight: "bold",
                    }}
                  >
                    {exercise.name}
                  </div>
                  <div
                    style={{
                      color: "var(--text-muted)",
                      fontSize: "12px",
                      marginTop: "2px",
                    }}
                  >
                    {exercise.equipment?.[0] || "No equipment"} ·{" "}
                    {exercise.builtin ? "Built-in" : "Custom"}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    flexWrap: "wrap",
                    gap: "6px",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    disabled={savingPreferenceExerciseId === exercise.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleExerciseStatus(exercise);
                    }}
                    style={getExerciseStatusButtonStyle(active)}
                  >
                    {savingPreferenceExerciseId === exercise.id
                      ? "Saving..."
                      : active
                        ? "Active"
                        : "Inactive"}
                  </button>

                  {exercise.builtin && !canManageSelectedUserPreferences && (
                    <>
                      {trainerCanAddBuiltIns && (
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            startEdit(exercise);
                          }}
                          type="button"
                        >
                          Edit
                        </button>
                      )}
                      <button
                        onClick={(event) => duplicateExercise(event, exercise)}
                        type="button"
                      >
                        Duplicate
                      </button>
                    </>
                  )}

                  {!exercise.builtin && isTrainerTargetSelf && (
                    <>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          startEdit(exercise);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          setExerciseLibrary(
                            exerciseLibrary.filter(
                              (item) => item.id !== exercise.id
                            )
                          );
                        }}
                      >
                        Delete
                      </button>
                      <button
                        onClick={(event) => duplicateExercise(event, exercise)}
                        type="button"
                      >
                        Duplicate
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div
                style={{
                  color: "var(--text)",
                  fontSize: "13px",
                  marginTop: "8px",
                }}
              >
                <strong>{primaryMuscle}</strong>
                {secondaryMuscles.length > 0
                  ? ` · ${secondaryMuscles.join(", ")}`
                  : ""}
              </div>

              {(exercise.description || exercise.note) && (
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "12px",
                    marginTop: "6px",
                  }}
                >
                  {exercise.description || exercise.note}
                </div>
              )}

              {!exercise.builtin && trainerCanAddBuiltIns && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    marginTop: "8px",
                  }}
                >
                  <button
                    disabled={promotingExerciseId === exercise.id}
                    onClick={(event) =>
                      addCustomExerciseAsBuiltIn(event, exercise)
                    }
                    type="button"
                  >
                    {promotingExerciseId === exercise.id
                      ? "Adding..."
                      : "Add as Built-in"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {promoteExerciseStatus && (
        <div
          role="status"
          style={{
            color: "var(--text-muted)",
            fontSize: "13px",
            marginTop: "10px",
          }}
        >
          {promoteExerciseStatus}
        </div>
      )}

      {detailExercise && (
        <ExerciseDetailDialog
          bodyWeightEntries={bodyWeightEntries}
          exercise={detailExercise}
          exerciseLibrary={exerciseLibrary}
          history={history}
          onClose={() => setDetailExercise(null)}
          onUpdateHistoryWorkoutSet={onUpdateHistoryWorkoutSet}
        />
      )}

      <input
        ref={photoInputRef}
        accept="image/*"
        onChange={(event) => {
          handleImageFile(event.target.files?.[0]);
          event.target.value = "";
        }}
        style={{ display: "none" }}
        type="file"
      />

      {imageExercise && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Select image for ${imageExercise.name}`}
          style={{
            alignItems: "center",
            background: "rgba(0,0,0,.45)",
            display: "flex",
            inset: 0,
            justifyContent: "center",
            padding: "16px",
            position: "fixed",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "var(--surface-raised)",
              borderRadius: "10px",
              boxShadow: "0 10px 28px rgba(0,0,0,.22)",
              display: "grid",
              gap: "12px",
              maxHeight: "calc(100vh - 32px)",
              maxWidth: "520px",
              overflow: "auto",
              padding: "14px",
              width: "100%",
            }}
          >
            <div
              style={{
                alignItems: "center",
                display: "grid",
                gap: "8px",
                gridTemplateColumns: "minmax(0, 1fr) auto",
              }}
            >
              <h2
                style={{
                  fontSize: "1rem",
                  margin: 0,
                }}
              >
                Exercise Image
              </h2>
              <button
                aria-label="Close image options"
                onClick={closeImageSheet}
                style={{
                  alignItems: "center",
                  display: "inline-flex",
                  height: "34px",
                  justifyContent: "center",
                  width: "34px",
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                color: "var(--text-muted)",
                fontSize: "13px",
              }}
            >
              {imageExercise.name}
            </div>

            {imageSaveStatus && (
              <div
                style={{
                  color: imageSaveStatus.startsWith("Unable")
                    ? "var(--danger-text)"
                    : "var(--text-muted)",
                  fontSize: "12px",
                }}
              >
                {imageSaveStatus}
              </div>
            )}

            {cropImage ? (
              <div
                style={{
                  display: "grid",
                  gap: "12px",
                  justifyItems: "center",
                }}
              >
                <div
                  onPointerCancel={endCropGesture}
                  onPointerDown={startCropGesture}
                  onPointerMove={moveCropGesture}
                  onPointerUp={endCropGesture}
                  style={{
                    background: "var(--surface-muted)",
                    border: "2px solid var(--accent)",
                    borderRadius: "10px",
                    height: `${cropPreviewSize}px`,
                    overflow: "hidden",
                    position: "relative",
                    touchAction: "none",
                    width: `${cropPreviewSize}px`,
                  }}
                >
                  <img
                    alt="Crop preview"
                    src={cropImage.url}
                    style={{
                      display: "block",
                      height: "100%",
                      left: "50%",
                      objectFit: "cover",
                      position: "absolute",
                      top: "50%",
                      transform: `translate(calc(-50% + ${cropOffset.x}px), calc(-50% + ${cropOffset.y}px)) scale(${cropZoom})`,
                      transformOrigin: "center",
                      userSelect: "none",
                      width: "100%",
                    }}
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    justifyContent: "space-between",
                    width: "100%",
                  }}
                >
                  <button onClick={cancelCropImage} type="button">
                    Cancel
                  </button>
                  <button onClick={saveCroppedImage} type="button">
                    Use Crop
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={() => photoInputRef.current?.click()}
                  style={{
                    alignItems: "center",
                    display: "inline-flex",
                    gap: "6px",
                    justifyContent: "center",
                    minHeight: "42px",
                  }}
                >
                  <ImagePlus size={17} /> Choose Photo
                </button>

                <div
                  style={{
                    display: "grid",
                    gap: "6px",
                  }}
                >
                  <span
                    style={{
                      alignItems: "center",
                      display: "inline-flex",
                      gap: "6px",
                      fontWeight: "bold",
                    }}
                  >
                    <Copy size={16} /> Copy from exercise
                  </span>
                  <div
                    style={{
                      display: "grid",
                      gap: "8px",
                    }}
                  >
                    <input
                      aria-label="Search exercises with images"
                      placeholder="Search exercises"
                      type="search"
                      value={copyImageSearch}
                      onChange={(event) =>
                        setCopyImageSearch(event.target.value)
                      }
                      style={{
                        minWidth: 0,
                        position: "sticky",
                        top: 0,
                        zIndex: 1,
                      }}
                    />

                    <div
                      role="listbox"
                      aria-label="Exercises with images"
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: "6px",
                        display: "grid",
                        maxHeight: "250px",
                        overflowY: "auto",
                      }}
                    >
                      {copyImageExercises.length > 0 ? (
                        copyImageExercises.map((exercise) => {
                          const selected =
                            String(copyImageExerciseId) === String(exercise.id);

                          return (
                            <button
                              key={exercise.id}
                              aria-selected={selected}
                              onClick={() =>
                                setCopyImageExerciseId(String(exercise.id))
                              }
                              role="option"
                              style={{
                                alignItems: "center",
                                background: selected
                                  ? "var(--surface-muted)"
                                  : "var(--surface)",
                                border: "none",
                                borderBottom: "1px solid var(--border)",
                                borderRadius: 0,
                                color: "var(--text)",
                                display: "grid",
                                gap: "10px",
                                gridTemplateColumns: "46px minmax(0, 1fr)",
                                minHeight: "58px",
                                padding: "6px 8px",
                                textAlign: "left",
                                width: "100%",
                              }}
                              type="button"
                            >
                              <ExerciseThumbnail
                                alt={
                                  exercise.imageAlt ||
                                  `${exercise.name} demonstration`
                                }
                                imageUrl={exercise.imageUrl}
                                size={46}
                              />
                              <span
                                style={{
                                  display: "grid",
                                  gap: "2px",
                                  minWidth: 0,
                                }}
                              >
                                <span
                                  style={{
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {exercise.name}
                                </span>
                                <span
                                  style={{
                                    color: "var(--text-muted)",
                                    fontSize: "12px",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {[
                                    exercise.equipment?.[0],
                                    exercise.muscles?.[0],
                                  ]
                                    .filter(Boolean)
                                    .join(" · ") || "Exercise image"}
                                </span>
                              </span>
                            </button>
                          );
                        })
                      ) : (
                        <div
                          style={{
                            color: "var(--text-muted)",
                            fontSize: "13px",
                            padding: "12px",
                            textAlign: "center",
                          }}
                        >
                          No matching exercise images
                        </div>
                      )}
                    </div>

                    <button
                      disabled={!copyImageExerciseId}
                      onClick={copyExerciseImage}
                      type="button"
                    >
                      Use Selected
                    </button>
                  </div>
                </div>

              </>
            )}
          </div>
        </div>
      )}

      {editingExercise && (
        <div
          role="dialog"
          aria-label="Edit exercise"
          style={{
            alignItems: "center",
            background: "rgba(0,0,0,.45)",
            display: "flex",
            inset: 0,
            justifyContent: "center",
            padding: "16px",
            position: "fixed",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: "var(--surface-raised)",
              borderRadius: "8px",
              maxHeight: "calc(100vh - 32px)",
              maxWidth: "520px",
              overflow: "auto",
              padding: "14px",
              width: "100%",
            }}
          >
            <h2
              style={{
                fontSize: "1rem",
                margin: "0 0 10px",
              }}
            >
              {editingExercise.builtin
                ? "Edit Built-in Exercise"
                : "Edit Custom Exercise"}
            </h2>

            {renderExerciseForm(editingDraft, setEditingDraft, {
              compact: true,
            })}

            {editingSaveStatus && (
              <div
                style={{
                  color: editingSaveStatus.startsWith("Unable")
                    ? "var(--danger-text)"
                    : "var(--text-muted)",
                  fontSize: "12px",
                  marginTop: "10px",
                }}
              >
                {editingSaveStatus}
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: "8px",
                justifyContent: "flex-end",
                marginTop: "12px",
              }}
            >
              <button
                onClick={() => {
                  setEditingExercise(null);
                  setEditingDraft(emptyDraft);
                  setEditingSaveStatus("");
                }}
                type="button"
              >
                Cancel
              </button>
              <button onClick={saveEdit} type="button">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
