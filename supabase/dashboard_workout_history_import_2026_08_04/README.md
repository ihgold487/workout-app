# Dashboard Workout History Import - 2026-08-04

Use this folder when the full import SQL is too large for the Supabase SQL Editor.

Generated files:
- `01_create_staging_tables.sql`
- `workouts.csv` (367 rows)
- `exercises.csv` (2490 rows)
- `sets.csv` (8014 rows)
- `02_verify_staging_counts.sql`
- `03_run_import_from_staging.sql`
- `04_post_import_verification.sql`
- `05_cleanup_staging_after_success.sql`

Keep `supabase/rollback_workout_history_import_2026_08_04.sql` available until you are satisfied with the import.
