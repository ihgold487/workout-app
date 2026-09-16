import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Dumbbell,
  Filter,
  RotateCcw,
  Search,
  Timer,
} from "lucide-react";
import {
  AppPageHeader,
  AppSectionCard,
  AppSectionHeading,
  AppStatusPill,
} from "./ui/AppSurface";

function getWorkoutName(workout) {
  return workout?.templateName || workout?.workoutName || workout?.workout_name || workout?.name || "Workout";
}

function getWorkoutTime(workout) {
  const parsed = new Date(
    workout?.completedAtIso || workout?.completed_at || workout?.completedAt || 0
  );
  return Number.isFinite(parsed.getTime()) ? parsed.getTime() : 0;
}

function formatWorkoutDate(workout) {
  const timestamp = getWorkoutTime(workout);
  return timestamp
    ? new Date(timestamp).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : workout?.completedAt || "Unknown date";
}

function formatDuration(workout) {
  const totalSeconds = Number(workout?.durationSeconds ?? workout?.duration_seconds);
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return null;
  const roundedSeconds = Math.round(totalSeconds);
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  return hours > 0
    ? `${hours} hr ${minutes ? `${minutes} min` : ""}`.trim()
    : `${Math.max(1, minutes)} min`;
}

function getPlanId(workout) {
  return String(workout?.planId || workout?.plan_id || "");
}

function getExerciseNames(workout) {
  return (workout?.exercises || [])
    .map((exercise) => exercise?.name || exercise?.exerciseName)
    .filter(Boolean);
}

function getSetCount(workout) {
  return (workout?.exercises || []).reduce(
    (total, exercise) => total + (exercise?.sets || []).length,
    0
  );
}

export default function WorkoutHistoryView({ history = [], onBack, onOpenWorkout, plans = [] }) {
  const [openedAt] = useState(() => Date.now());
  const [dateRange, setDateRange] = useState("all");
  const [exerciseFilter, setExerciseFilter] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [planFilter, setPlanFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [workoutFilter, setWorkoutFilter] = useState("all");

  const sortedHistory = useMemo(
    () => [...history].sort((left, right) => getWorkoutTime(right) - getWorkoutTime(left)),
    [history]
  );
  const planNames = useMemo(
    () => new Map(plans.map((plan) => [String(plan.id), plan.name])),
    [plans]
  );
  const workoutNames = useMemo(
    () => [...new Set(sortedHistory.map(getWorkoutName))].sort(),
    [sortedHistory]
  );
  const exerciseNames = useMemo(
    () => [...new Set(sortedHistory.flatMap(getExerciseNames))].sort(),
    [sortedHistory]
  );
  const availablePlans = useMemo(
    () => [...new Set(sortedHistory.map(getPlanId).filter(Boolean))]
      .map((id) => ({ id, name: planNames.get(id) || "Saved plan" }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    [planNames, sortedHistory]
  );

  const filteredHistory = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const rangeDays = dateRange === "all" ? null : Number(dateRange);
    const earliestTime = rangeDays ? openedAt - rangeDays * 86400000 : null;

    return sortedHistory.filter((workout) => {
      const workoutName = getWorkoutName(workout);
      const exercises = getExerciseNames(workout);
      return (
        (!normalizedQuery || workoutName.toLowerCase().includes(normalizedQuery) ||
          exercises.some((name) => name.toLowerCase().includes(normalizedQuery))) &&
        (!earliestTime || getWorkoutTime(workout) >= earliestTime) &&
        (planFilter === "all" || getPlanId(workout) === planFilter) &&
        (workoutFilter === "all" || workoutName === workoutFilter) &&
        (exerciseFilter === "all" || exercises.includes(exerciseFilter))
      );
    });
  }, [dateRange, exerciseFilter, openedAt, planFilter, query, sortedHistory, workoutFilter]);

  const filtersActive = dateRange !== "all" || exerciseFilter !== "all" ||
    planFilter !== "all" || workoutFilter !== "all";
  const clearFilters = () => {
    setDateRange("all");
    setExerciseFilter("all");
    setPlanFilter("all");
    setQuery("");
    setWorkoutFilter("all");
  };

  return (
    <div className="workout-history-view">
      <AppPageHeader
        action={
          <button aria-label="Return to Home" className="workout-history-view__back" onClick={onBack} type="button">
            <ArrowLeft size={18} /><span>Home</span>
          </button>
        }
        icon={<CalendarDays aria-hidden="true" size={24} />}
        subtitle="Review completed training and open full workout details"
        title="Workout History"
      />

      <AppSectionCard className="workout-history-view__controls" tone="accent">
        <AppSectionHeading
          action={<AppStatusPill tone="accent">{history.length} total</AppStatusPill>}
          eyebrow="Completed training"
          subtitle="Search by workout or exercise, or narrow the history with filters."
          title="Find a workout"
        />
        <label className="workout-history-view__search">
          <Search aria-hidden="true" size={17} />
          <input aria-label="Search workout history" onChange={(event) => setQuery(event.target.value)}
            placeholder="Search workouts or exercises" type="search" value={query} />
        </label>
        <div className="workout-history-view__filter-actions">
          <button aria-expanded={filtersOpen} className="app-secondary-action"
            onClick={() => setFiltersOpen((open) => !open)} type="button">
            <Filter size={16} /> Filters{filtersActive ? " · On" : ""}
          </button>
          {(filtersActive || query) && <button onClick={clearFilters} type="button"><RotateCcw size={15} /> Clear</button>}
        </div>
        {filtersOpen && (
          <div className="workout-history-view__filters">
            <label><span>Date</span><select value={dateRange} onChange={(event) => setDateRange(event.target.value)}>
              <option value="all">All time</option><option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option><option value="365">Last year</option>
            </select></label>
            <label><span>Plan</span><select value={planFilter} onChange={(event) => setPlanFilter(event.target.value)}>
              <option value="all">All plans</option>{availablePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
            </select></label>
            <label><span>Workout</span><select value={workoutFilter} onChange={(event) => setWorkoutFilter(event.target.value)}>
              <option value="all">All workouts</option>{workoutNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </select></label>
            <label><span>Exercise</span><select value={exerciseFilter} onChange={(event) => setExerciseFilter(event.target.value)}>
              <option value="all">All exercises</option>{exerciseNames.map((name) => <option key={name} value={name}>{name}</option>)}
            </select></label>
          </div>
        )}
      </AppSectionCard>

      <div className="workout-history-view__result-heading"><strong>{filteredHistory.length} completed</strong><span>Newest first</span></div>
      {filteredHistory.length > 0 ? (
        <div className="workout-history-view__list">
          {filteredHistory.map((workout) => {
            const exercises = getExerciseNames(workout);
            const duration = formatDuration(workout);
            const planName =
              planNames.get(getPlanId(workout)) ||
              workout?.planName ||
              workout?.plan_name;
            const planWeek = workout?.planWeek || workout?.plan_week;
            return (
              <button className="workout-history-card" key={workout.id} onClick={() => onOpenWorkout(workout)} type="button">
                <span className="workout-history-card__copy">
                  <strong>{getWorkoutName(workout)}</strong>
                  <span className="workout-history-card__date">{formatWorkoutDate(workout)}</span>
                  {(planName || planWeek) && <span className="workout-history-card__plan">
                    {planName || "Plan workout"}{planWeek ? ` · Week ${planWeek}` : ""}
                  </span>}
                  <span className="workout-history-card__metrics">
                    {duration && <span><Timer size={14} /> {duration}</span>}
                    <span><Dumbbell size={14} /> {exercises.length} exercises</span>
                    <span>{getSetCount(workout)} sets</span>
                  </span>
                </span>
                <ChevronRight aria-hidden="true" size={20} />
              </button>
            );
          })}
        </div>
      ) : (
        <AppSectionCard className="workout-history-view__empty">
          <CalendarDays aria-hidden="true" size={28} />
          <strong>{history.length ? "No workouts match" : "No completed workouts yet"}</strong>
          <span>{history.length ? "Try clearing a filter or searching for another workout." : "Completed workouts will appear here automatically."}</span>
        </AppSectionCard>
      )}
    </div>
  );
}
