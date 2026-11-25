-- Run after add_exercise_training_modalities.sql.
--
-- Merges preferences for the superseded built-in stationary-bike exercise,
-- retains the currently active exercise, and prevents active built-ins from
-- sharing a source_key. It does not change workouts, workout exercises,
-- sessions, or session exercises.

begin;

do $$
begin
  if not exists (
    select 1
    from public.exercises
    where id = '87a3f271-193d-4f69-86ca-47a4c675531b'
      and user_id is null
      and is_builtin = true
      and source_key = 'history-csv-2026-06-07:cycling-on-stationary-bike-machine'
  ) then
    raise exception 'Expected active stationary-bike exercise was not found.';
  end if;

  if not exists (
    select 1
    from public.exercises
    where id = 'fd1b5088-49fa-464d-97bc-a48235fe25b7'
      and user_id is null
      and is_builtin = true
      and source_key = 'history-csv-2026-06-07:cycling-on-stationary-bike-machine'
  ) then
    raise exception 'Expected superseded stationary-bike exercise was not found.';
  end if;
end;
$$;

-- Move every preference to the canonical exercise. When a user already has a
-- canonical preference, retain notes/equipment, preserve all metadata keys,
-- keep favorites, and prefer the more restrictive plan-exclusion setting.
insert into public.user_exercise_preferences (
  user_id,
  exercise_id,
  is_favorite,
  include_in_plans,
  exclude_from_plans,
  notes,
  preferred_equipment,
  metadata
)
select
  preferences.user_id,
  '87a3f271-193d-4f69-86ca-47a4c675531b'::uuid,
  preferences.is_favorite,
  preferences.include_in_plans,
  preferences.exclude_from_plans,
  preferences.notes,
  preferences.preferred_equipment,
  preferences.metadata
from public.user_exercise_preferences preferences
where preferences.exercise_id = 'fd1b5088-49fa-464d-97bc-a48235fe25b7'::uuid
on conflict (user_id, exercise_id)
do update set
  is_favorite = user_exercise_preferences.is_favorite
    or excluded.is_favorite,
  include_in_plans = case
    when user_exercise_preferences.exclude_from_plans
      or excluded.exclude_from_plans then false
    else user_exercise_preferences.include_in_plans
      or excluded.include_in_plans
  end,
  exclude_from_plans = user_exercise_preferences.exclude_from_plans
    or excluded.exclude_from_plans,
  notes = coalesce(
    nullif(user_exercise_preferences.notes, ''),
    nullif(excluded.notes, '')
  ),
  preferred_equipment = coalesce(
    user_exercise_preferences.preferred_equipment,
    excluded.preferred_equipment
  ),
  metadata = coalesce(user_exercise_preferences.metadata, '{}'::jsonb)
    || coalesce(excluded.metadata, '{}'::jsonb);

delete from public.user_exercise_preferences
where exercise_id = 'fd1b5088-49fa-464d-97bc-a48235fe25b7'::uuid;

update public.exercises
set deleted_at = null
where id = '87a3f271-193d-4f69-86ca-47a4c675531b'::uuid;

create unique index if not exists exercises_active_builtin_source_key_unique_idx
on public.exercises (source_key)
where is_builtin = true
  and user_id is null
  and deleted_at is null
  and source_key is not null;

commit;
