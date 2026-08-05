-- Diagnose the 2026-08-04 workout-history import after app-side sync errors.
-- Read-only. This returns one result set so the Supabase dashboard export is
-- less likely to hide the history rows behind a later query result.

with imported_history as (
  select
    exercises.exercise_name,
    exercises.equipment,
    count(distinct exercises.id) as imported_history_entries,
    count(sets.id) as imported_sets,
    count(sets.id) filter (where sets.actual_reps is not null) as imported_sets_with_reps,
    count(sets.id) filter (where sets.actual_weight_label is not null or sets.actual_weight_value is not null) as imported_sets_with_weight,
    max(sessions.completed_at) as latest_completed_at,
    max(sets.updated_at) as latest_set_update
  from public.workout_sessions sessions
  join public.session_exercises exercises on exercises.session_id = sessions.id
  left join public.session_sets sets on sets.session_exercise_id = exercises.id and sets.deleted_at is null
  where sessions.source = 'local_app'
    and sessions.source_key like 'wrkt-2026-08-04:%'
    and sessions.deleted_at is null
    and exercises.deleted_at is null
    and exercises.exercise_name in (
      'Curls',
      'Front Foot Elevated Split Squat',
      'Split Squats',
      'Standing Calf Raise',
      'T-Bar Reverse Lunges'
    )
  group by exercises.exercise_name, exercises.equipment
),
catalog as (
  select
    name,
    equipment,
    primary_muscle,
    secondary_muscles,
    instruction_source_url,
    image_url,
    source,
    source_key,
    updated_at
  from public.exercises
  where is_builtin = true
    and user_id is null
    and deleted_at is null
    and (
      (name = 'Curls' and equipment = 'EZ Curl Bar')
      or (name = 'Front Foot Elevated Split Squat' and equipment = 'Barbell')
      or (name = 'Split Squats' and equipment = 'Barbell')
      or (name = 'Standing Calf Raise' and equipment = 'Barbell')
      or (name = 'T-Bar Reverse Lunges' and equipment = 'Landmine')
    )
)
select
  catalog.name,
  catalog.equipment,
  coalesce(imported_history.imported_history_entries, 0) as imported_history_entries,
  coalesce(imported_history.imported_sets, 0) as imported_sets,
  coalesce(imported_history.imported_sets_with_reps, 0) as imported_sets_with_reps,
  coalesce(imported_history.imported_sets_with_weight, 0) as imported_sets_with_weight,
  imported_history.latest_completed_at,
  imported_history.latest_set_update,
  catalog.primary_muscle,
  catalog.secondary_muscles,
  catalog.instruction_source_url,
  catalog.image_url,
  catalog.source,
  catalog.source_key,
  catalog.updated_at as catalog_updated_at
from catalog
left join imported_history
  on lower(imported_history.exercise_name) = lower(catalog.name)
  and lower(coalesce(imported_history.equipment, '')) = lower(coalesce(catalog.equipment, ''))
order by catalog.name, catalog.equipment;
