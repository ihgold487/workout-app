-- Verify CSV uploads before running the destructive import.
select 'workouts' as table_name, count(*) as row_count, 367 as expected from public.history_import_20260804_workouts
union all
select 'exercises', count(*), 2490 from public.history_import_20260804_exercises
union all
select 'sets', count(*), 8014 from public.history_import_20260804_sets;
