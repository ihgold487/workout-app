-- Import staged 2026_08_04 workout history into completed workout history.
-- This deletes/replaces completed workout history for ihgold@comcast.net only.
-- It does not modify workout templates or training plans.

begin;

set local timezone to 'America/Detroit';

create temp table _history_import_target_user (user_id uuid primary key) on commit drop;

insert into _history_import_target_user (user_id)
select id from auth.users where lower(email) = lower('ihgold@comcast.net');

do $$
begin
  if (select count(*) from _history_import_target_user) <> 1 then
    raise exception 'Expected exactly one auth.users row for %, found %', 'ihgold@comcast.net', (select count(*) from _history_import_target_user);
  end if;
  if to_regclass('public.workout_sessions_backup_20260804_workout_history_import') is not null
    or to_regclass('public.session_exercises_backup_20260804_workout_history_import') is not null
    or to_regclass('public.session_sets_backup_20260804_workout_history_import') is not null then
    raise exception 'Backup table(s) for 20260804_workout_history_import already exist. Stop to avoid overwriting rollback data.';
  end if;
  if (select count(*) from public.history_import_20260804_workouts) <> 367
    or (select count(*) from public.history_import_20260804_exercises) <> 2490
    or (select count(*) from public.history_import_20260804_sets) <> 8014 then
    raise exception 'Staging count mismatch. Expected 367/2490/8014 workouts/exercises/sets, got %/%/%',
      (select count(*) from public.history_import_20260804_workouts),
      (select count(*) from public.history_import_20260804_exercises),
      (select count(*) from public.history_import_20260804_sets);
  end if;
end $$;

insert into public.exercises (
  user_id,
  name,
  description,
  image_url,
  image_storage_path,
  image_alt,
  equipment,
  primary_muscle,
  secondary_muscles,
  is_builtin,
  source,
  source_key
)
values
  (null, 'Curls', 'Catalog backfill required by 2026-08-04 workout history import.', null, null, 'Curls EZ Curl Bar exercise', 'EZ Curl Bar', 'Biceps', array['Forearms'], true, 'workout_history_import_2026_08_04', 'workout-history-import-2026-08-04:curls-ez-curl-bar'),
  (null, 'Front Foot Elevated Split Squat', 'Catalog backfill required by 2026-08-04 workout history import.', null, null, 'Front Foot Elevated Split Squat Barbell exercise', 'Barbell', 'Glutes', array['Quads', 'Hamstrings', 'Abductors', 'Adductors', 'Calves', 'Lower Back', 'Abs'], true, 'workout_history_import_2026_08_04', 'workout-history-import-2026-08-04:front-foot-elevated-split-squat-barbell'),
  (null, 'Split Squats', 'Catalog backfill required by 2026-08-04 workout history import.', null, null, 'Split Squats Barbell exercise', 'Barbell', 'Glutes', array['Quads', 'Hamstrings', 'Abductors', 'Adductors', 'Calves', 'Lower Back', 'Abs'], true, 'workout_history_import_2026_08_04', 'workout-history-import-2026-08-04:split-squats-barbell'),
  (null, 'Standing Calf Raise', 'Catalog backfill required by 2026-08-04 workout history import.', null, null, 'Standing Calf Raise Barbell exercise', 'Barbell', 'Calves', '{}', true, 'workout_history_import_2026_08_04', 'workout-history-import-2026-08-04:standing-calf-raise-barbell'),
  (null, 'T-Bar Reverse Lunges', 'Catalog backfill required by 2026-08-04 workout history import.', 'exercise-media/history-csv-2026-06-07-t-bar-reverse-lunges-barbell.webp', null, 'T-Bar Reverse Lunges Landmine exercise demonstration', 'Landmine', 'Glutes', array['Quads', 'Hamstrings', 'Abductors', 'Adductors', 'Calves', 'Lower Back', 'Abs'], true, 'workout_history_import_2026_08_04', 'workout-history-import-2026-08-04:t-bar-reverse-lunges-landmine')
on conflict (source, source_key) where user_id is null
do update set
  name = excluded.name,
  description = excluded.description,
  image_url = excluded.image_url,
  image_storage_path = excluded.image_storage_path,
  image_alt = excluded.image_alt,
  equipment = excluded.equipment,
  primary_muscle = excluded.primary_muscle,
  secondary_muscles = excluded.secondary_muscles,
  is_builtin = true,
  deleted_at = null,
  updated_at = now();

do $$
declare missing_exercises text;
begin
  select string_agg(missing.pair, E'\n' order by missing.pair) into missing_exercises
  from (
    select distinct imported.exercise_name || ' · ' || imported.equipment as pair
    from public.history_import_20260804_exercises imported
    cross join _history_import_target_user target_user
    where not exists (
      select 1 from public.exercises exercise
      where exercise.deleted_at is null
        and (exercise.user_id = target_user.user_id or exercise.user_id is null)
        and lower(exercise.name) = lower(imported.exercise_name)
        and lower(coalesce(exercise.equipment, '')) = lower(coalesce(imported.equipment, ''))
    )
  ) missing;
  if missing_exercises is not null then
    raise exception 'Import aborted before deleting anything. Missing exercise/equipment pair(s):
%', missing_exercises;
  end if;
end $$;

create table public.workout_sessions_backup_20260804_workout_history_import as
select sessions.* from public.workout_sessions sessions join _history_import_target_user target_user on target_user.user_id = sessions.user_id;
create table public.session_exercises_backup_20260804_workout_history_import as
select exercises.* from public.session_exercises exercises join public.workout_sessions sessions on sessions.id = exercises.session_id join _history_import_target_user target_user on target_user.user_id = sessions.user_id;
create table public.session_sets_backup_20260804_workout_history_import as
select sets.* from public.session_sets sets join public.session_exercises exercises on exercises.id = sets.session_exercise_id join public.workout_sessions sessions on sessions.id = exercises.session_id join _history_import_target_user target_user on target_user.user_id = sessions.user_id;

insert into public.import_batches (user_id, source, file_name, imported_at, row_count, metadata)
select target_user.user_id, 'wrkout_csv', '2026_08_04 Workouts.csv', now(), 8014, '{"csv_file":"2026_08_04 Workouts.csv","imported_workouts":367,"imported_exercises":2490,"imported_sets":8014,"skipped":{"cyclingExercises":2,"cyclingSets":2,"resistanceExercises":6,"resistanceSets":21,"dashSets":17,"missingRirSets":12,"emptyWorkouts":0,"ignoredExerciseNoteColumns":9},"assumptions":["Skipped cycling entries","Skipped resistance-band exercises","Skipped all-dash set rows","Defaulted missing RIR to 0","Ignored exercise notes","Preserved existing plan and workout template tables","Imported dropset rows as normal sets","Mapped all source exercises to existing live DB exercises; SQL preflight fails before purge if any target pair is missing"]}'::jsonb from _history_import_target_user target_user;

delete from public.workout_sessions sessions using _history_import_target_user target_user where sessions.user_id = target_user.user_id;

insert into public.workout_sessions (id, user_id, workout_id, workout_name, started_at, completed_at, duration_seconds, source, source_key, import_batch_id, deleted_at, updated_at)
select imported.id, target_user.user_id, null, imported.workout_name, (imported.completed_at_text::timestamp - make_interval(secs => coalesce(imported.duration_seconds, 0)))::timestamptz, imported.completed_at_text::timestamptz, imported.duration_seconds, 'local_app', imported.source_key, batch.id, null, now()
from public.history_import_20260804_workouts imported cross join _history_import_target_user target_user join public.import_batches batch on batch.user_id = target_user.user_id and batch.source = 'wrkout_csv' and batch.file_name = '2026_08_04 Workouts.csv' and batch.metadata->>'csv_file' = '2026_08_04 Workouts.csv'
order by imported.completed_at_text desc;

insert into public.session_exercises (id, user_id, session_id, workout_exercise_id, exercise_id, position, exercise_name, equipment, primary_muscle, secondary_muscles, superset_group, notes, deleted_at, updated_at)
select imported.exercise_import_id, target_user.user_id, imported.workout_id, null, matched.exercise_id, imported.position, imported.exercise_name, imported.equipment, matched.primary_muscle, matched.secondary_muscles, imported.superset_group, null, null, now()
from public.history_import_20260804_exercises imported cross join _history_import_target_user target_user cross join lateral (
  select exercise.id as exercise_id, exercise.primary_muscle, exercise.secondary_muscles
  from public.exercises exercise
  where exercise.deleted_at is null and (exercise.user_id = target_user.user_id or exercise.user_id is null) and lower(exercise.name) = lower(imported.exercise_name) and lower(coalesce(exercise.equipment, '')) = lower(coalesce(imported.equipment, ''))
  order by case when exercise.user_id = target_user.user_id then 0 else 1 end, exercise.is_builtin desc, exercise.updated_at desc limit 1
) matched
order by imported.workout_id, imported.position;

insert into public.session_sets (user_id, session_exercise_id, set_number, target_weight_value, target_weight_label, target_reps_min, target_reps_max, target_reps_label, target_rir_value, target_rir_label, actual_weight_value, actual_weight_label, actual_reps, actual_rir_value, actual_rir_label, estimated_1rm, is_drop_set, completed_at, deleted_at, updated_at)
select target_user.user_id, imported.exercise_import_id, imported.set_number, null, null, null, null, null, 0, null, imported.actual_weight_value, imported.actual_weight_label, imported.actual_reps, imported.actual_rir_value, imported.actual_rir_label,
  case when imported.actual_weight_value is null or imported.actual_reps is null then null else ((imported.actual_weight_value + coalesce(bodyweight.bodyweight_load, 0)) * (1 + ((imported.actual_reps::numeric + imported.actual_rir_numeric) / 30)) - coalesce(bodyweight.bodyweight_load, 0)) end,
  imported.is_drop_set, workout.completed_at, null, now()
from public.history_import_20260804_sets imported join public.session_exercises session_exercise on session_exercise.id = imported.exercise_import_id join public.workout_sessions workout on workout.id = session_exercise.session_id cross join _history_import_target_user target_user left join public.exercises exercise on exercise.id = session_exercise.exercise_id left join lateral (
  select measurement.body_weight_value * (coalesce(exercise.bodyweight_load_percent, 0) / 100) as bodyweight_load
  from public.body_measurements measurement
  where measurement.user_id = target_user.user_id and measurement.deleted_at is null and measurement.body_weight_value is not null and measurement.measured_on <= workout.completed_at::date
  order by measurement.measured_on desc limit 1
) bodyweight on true
order by workout.completed_at desc, session_exercise.position, imported.set_number;

do $$
declare imported_sessions integer; imported_exercises integer; imported_sets integer;
begin
  select count(*) into imported_sessions from public.workout_sessions sessions join _history_import_target_user target_user on target_user.user_id = sessions.user_id where sessions.source = 'local_app' and sessions.source_key like 'wrkt-2026-08-04:%';
  select count(*) into imported_exercises from public.session_exercises exercises join public.workout_sessions sessions on sessions.id = exercises.session_id join _history_import_target_user target_user on target_user.user_id = sessions.user_id where sessions.source = 'local_app' and sessions.source_key like 'wrkt-2026-08-04:%';
  select count(*) into imported_sets from public.session_sets sets join public.session_exercises exercises on exercises.id = sets.session_exercise_id join public.workout_sessions sessions on sessions.id = exercises.session_id join _history_import_target_user target_user on target_user.user_id = sessions.user_id where sessions.source = 'local_app' and sessions.source_key like 'wrkt-2026-08-04:%';
  if imported_sessions <> 367 or imported_exercises <> 2490 or imported_sets <> 8014 then
    raise exception 'Import count mismatch. Expected %/%/% sessions/exercises/sets, got %/%/%', 367, 2490, 8014, imported_sessions, imported_exercises, imported_sets;
  end if;
end $$;

commit;
