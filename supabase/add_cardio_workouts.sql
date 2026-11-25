-- Standalone cardio workout templates and completed logs.
-- These tables deliberately do not reference the strength workout, plan,
-- session, exercise-set, or history tables.

create table if not exists public.cardio_workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null,
  source_key text not null,
  name text not null,
  workout_format text not null check (workout_format in ('steady', 'hiit')),
  exercise_snapshot jsonb not null default '{}'::jsonb,
  prescription jsonb not null default '{}'::jsonb,
  last_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, source, source_key)
);

create index if not exists cardio_workout_templates_user_updated_idx
  on public.cardio_workout_templates (user_id, updated_at desc)
  where deleted_at is null;

create table if not exists public.cardio_workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null,
  source_key text not null,
  template_source_key text,
  template_name text,
  workout_format text not null check (workout_format in ('steady', 'hiit')),
  exercise_snapshot jsonb not null default '{}'::jsonb,
  prescription jsonb not null default '{}'::jsonb,
  results jsonb not null default '{}'::jsonb,
  notes text,
  started_at timestamptz,
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (user_id, source, source_key)
);

create index if not exists cardio_workout_logs_user_completed_idx
  on public.cardio_workout_logs (user_id, completed_at desc)
  where deleted_at is null;

drop trigger if exists cardio_workout_templates_set_updated_at
  on public.cardio_workout_templates;
create trigger cardio_workout_templates_set_updated_at
before update on public.cardio_workout_templates
for each row execute function public.set_updated_at();

drop trigger if exists cardio_workout_logs_set_updated_at
  on public.cardio_workout_logs;
create trigger cardio_workout_logs_set_updated_at
before update on public.cardio_workout_logs
for each row execute function public.set_updated_at();

alter table public.cardio_workout_templates enable row level security;
alter table public.cardio_workout_logs enable row level security;

drop policy if exists "Users can manage their cardio workout templates"
  on public.cardio_workout_templates;
create policy "Users can manage their cardio workout templates"
on public.cardio_workout_templates
for all
using (auth.uid() = user_id and public.is_app_user_approved())
with check (auth.uid() = user_id and public.is_app_user_approved());

drop policy if exists "Users can manage their cardio workout logs"
  on public.cardio_workout_logs;
create policy "Users can manage their cardio workout logs"
on public.cardio_workout_logs
for all
using (auth.uid() = user_id and public.is_app_user_approved())
with check (auth.uid() = user_id and public.is_app_user_approved());
