-- Roll back completed workout history import from 2026_08_04 Workouts.csv.
-- Run only after supabase/import_workout_history_2026_08_04.sql has succeeded.
-- Restores completed workout history from backup tables created by that import.
-- Does not modify plans or workout templates.

begin;

create temp table _history_import_target_user (user_id uuid primary key) on commit drop;
insert into _history_import_target_user (user_id)
select id from auth.users where lower(email) = lower('ihgold@comcast.net');

do $$
begin
  if (select count(*) from _history_import_target_user) <> 1 then
    raise exception 'Expected exactly one auth.users row for %, found %', 'ihgold@comcast.net', (select count(*) from _history_import_target_user);
  end if;
  if to_regclass('public.workout_sessions_backup_20260804_workout_history_import') is null
    or to_regclass('public.session_exercises_backup_20260804_workout_history_import') is null
    or to_regclass('public.session_sets_backup_20260804_workout_history_import') is null then
    raise exception 'Expected backup table(s) for 20260804_workout_history_import, but at least one is missing.';
  end if;
end $$;

delete from public.workout_sessions sessions using _history_import_target_user target_user where sessions.user_id = target_user.user_id;
insert into public.workout_sessions select * from public.workout_sessions_backup_20260804_workout_history_import;
insert into public.session_exercises select * from public.session_exercises_backup_20260804_workout_history_import;
insert into public.session_sets select * from public.session_sets_backup_20260804_workout_history_import;
delete from public.import_batches batches using _history_import_target_user target_user where batches.user_id = target_user.user_id and batches.source = 'wrkout_csv' and batches.file_name = '2026_08_04 Workouts.csv' and batches.metadata->>'csv_file' = '2026_08_04 Workouts.csv';
commit;
