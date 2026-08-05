-- Create browser-import staging tables for 2026_08_04 Workouts.csv.
-- Run this in Supabase Dashboard > SQL Editor before uploading the CSV files.

begin;

drop table if exists public.history_import_20260804_sets;
drop table if exists public.history_import_20260804_exercises;
drop table if exists public.history_import_20260804_workouts;

create table public.history_import_20260804_workouts (
  id uuid primary key,
  source_key text not null unique,
  workout_name text not null,
  completed_at_text text not null,
  duration_seconds integer
);

create table public.history_import_20260804_exercises (
  exercise_import_id uuid primary key,
  workout_id uuid not null references public.history_import_20260804_workouts(id) on delete cascade,
  position integer not null,
  exercise_name text not null,
  equipment text not null,
  superset_group text
);

create table public.history_import_20260804_sets (
  exercise_import_id uuid not null references public.history_import_20260804_exercises(exercise_import_id) on delete cascade,
  set_number integer not null,
  actual_weight_value numeric,
  actual_weight_label text,
  actual_reps integer,
  actual_rir_value integer not null default 0,
  actual_rir_label text,
  actual_rir_numeric numeric not null default 0,
  is_drop_set boolean not null default false
);

commit;
