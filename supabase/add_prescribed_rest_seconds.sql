-- Run once against an existing Supabase project before syncing per-set rest
-- prescriptions from workout templates and completed workout history.
alter table public.workout_exercise_sets
add column if not exists prescribed_rest_seconds integer;

alter table public.session_sets
add column if not exists prescribed_rest_seconds integer;

alter table public.workout_sessions
add column if not exists plan_id text,
add column if not exists plan_week integer,
add column if not exists plan_workout_id text;

comment on column public.workout_exercise_sets.prescribed_rest_seconds is
  'Prescribed rest after this template set, in seconds.';

comment on column public.session_sets.prescribed_rest_seconds is
  'Prescribed rest recorded for this completed session set, in seconds.';

comment on column public.workout_sessions.plan_week is
  'Plan week that applied when this completed workout was performed.';
