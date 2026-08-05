-- Optional cleanup after you have verified the import in the app.
-- Keep the three backup tables until you are comfortable you do not need rollback.

drop table if exists public.history_import_20260804_sets;
drop table if exists public.history_import_20260804_exercises;
drop table if exists public.history_import_20260804_workouts;
