-- Post-import verification. Run after 03 succeeds.
select 'imported_sessions' as check_name, count(*) as actual, 367 as expected
from public.workout_sessions
where source = 'local_app' and source_key like 'wrkt-2026-08-04:%'
union all
select 'imported_exercises', count(*), 2490
from public.session_exercises exercises
join public.workout_sessions sessions on sessions.id = exercises.session_id
where sessions.source = 'local_app' and sessions.source_key like 'wrkt-2026-08-04:%'
union all
select 'imported_sets', count(*), 8014
from public.session_sets sets
join public.session_exercises exercises on exercises.id = sets.session_exercise_id
join public.workout_sessions sessions on sessions.id = exercises.session_id
where sessions.source = 'local_app' and sessions.source_key like 'wrkt-2026-08-04:%'
union all
select 'backup_sessions', count(*), null
from public.workout_sessions_backup_20260804_workout_history_import
union all
select 'backup_exercises', count(*), null
from public.session_exercises_backup_20260804_workout_history_import
union all
select 'backup_sets', count(*), null
from public.session_sets_backup_20260804_workout_history_import;
