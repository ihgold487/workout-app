-- Cloud persistence starts as one versioned app-data snapshot per user.
-- This keeps the first sync step small while local IndexedDB remains the
-- offline source. We can later normalize this into templates, sessions,
-- exercises, programs, and program workout slots as the model matures.

create table if not exists public.workout_data_snapshots (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  schema_version integer not null,
  storage_version integer not null,
  updated_at timestamptz not null default now()
);

alter table public.workout_data_snapshots enable row level security;

drop policy if exists "Users can read their workout snapshot" on public.workout_data_snapshots;
create policy "Users can read their workout snapshot"
on public.workout_data_snapshots
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their workout snapshot" on public.workout_data_snapshots;
create policy "Users can insert their workout snapshot"
on public.workout_data_snapshots
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their workout snapshot" on public.workout_data_snapshots;
create policy "Users can update their workout snapshot"
on public.workout_data_snapshots
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their workout snapshot" on public.workout_data_snapshots;
create policy "Users can delete their workout snapshot"
on public.workout_data_snapshots
for delete
using (auth.uid() = user_id);

-- Normalized workout model.
--
-- The snapshot table above remains useful as an emergency backup while this
-- model evolves. These tables are the long-term shape: exercises, planned
-- workouts, performed workout sessions, and higher-level training plans.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;

drop policy if exists "Users can read their profile" on public.profiles;
create policy "Users can read their profile"
on public.profiles
for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert their profile" on public.profiles;
create policy "Users can insert their profile"
on public.profiles
for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update their profile" on public.profiles;
create policy "Users can update their profile"
on public.profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  description text,
  image_url text,
  equipment text,
  primary_muscle text,
  secondary_muscles text[] not null default '{}',
  is_builtin boolean not null default false,
  source text not null default 'user',
  source_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint exercises_builtin_owner_check check (
    (is_builtin = true and user_id is null)
    or (is_builtin = false and user_id is not null)
  )
);

create index if not exists exercises_user_id_idx on public.exercises (user_id);
create index if not exists exercises_name_idx on public.exercises (lower(name));
create unique index if not exists exercises_user_source_key_idx
on public.exercises (user_id, source, source_key);

drop trigger if exists exercises_set_updated_at on public.exercises;
create trigger exercises_set_updated_at
before update on public.exercises
for each row
execute function public.set_updated_at();

alter table public.exercises enable row level security;

drop policy if exists "Users can read built-in and own exercises" on public.exercises;
create policy "Users can read built-in and own exercises"
on public.exercises
for select
using (user_id is null or auth.uid() = user_id);

drop policy if exists "Users can insert custom exercises" on public.exercises;
create policy "Users can insert custom exercises"
on public.exercises
for insert
with check (auth.uid() = user_id and is_builtin = false);

drop policy if exists "Users can update custom exercises" on public.exercises;
create policy "Users can update custom exercises"
on public.exercises
for update
using (auth.uid() = user_id and is_builtin = false)
with check (auth.uid() = user_id and is_builtin = false);

drop policy if exists "Users can delete custom exercises" on public.exercises;
create policy "Users can delete custom exercises"
on public.exercises
for delete
using (auth.uid() = user_id and is_builtin = false);

create table if not exists public.user_exercise_preferences (
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id uuid not null references public.exercises (id) on delete cascade,
  is_favorite boolean not null default false,
  include_in_plans boolean not null default true,
  exclude_from_plans boolean not null default false,
  notes text,
  preferred_equipment text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

drop trigger if exists user_exercise_preferences_set_updated_at on public.user_exercise_preferences;
create trigger user_exercise_preferences_set_updated_at
before update on public.user_exercise_preferences
for each row
execute function public.set_updated_at();

alter table public.user_exercise_preferences enable row level security;

drop policy if exists "Users can manage their exercise preferences" on public.user_exercise_preferences;
create policy "Users can manage their exercise preferences"
on public.user_exercise_preferences
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  parent_workout_id uuid references public.workouts (id) on delete set null,
  source text not null default 'user',
  source_key text,
  last_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.workouts is
  'Planned workouts. This replaces the current local term template.';

create index if not exists workouts_user_id_idx on public.workouts (user_id);
create index if not exists workouts_user_updated_at_idx on public.workouts (user_id, updated_at desc);
create unique index if not exists workouts_user_source_key_idx
on public.workouts (user_id, source, source_key);

drop trigger if exists workouts_set_updated_at on public.workouts;
create trigger workouts_set_updated_at
before update on public.workouts
for each row
execute function public.set_updated_at();

alter table public.workouts enable row level security;

drop policy if exists "Users can manage their workouts" on public.workouts;
create policy "Users can manage their workouts"
on public.workouts
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_id uuid not null references public.workouts (id) on delete cascade,
  exercise_id uuid references public.exercises (id) on delete set null,
  position integer not null,
  exercise_name text not null,
  equipment text,
  primary_muscle text,
  secondary_muscles text[] not null default '{}',
  superset_group text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workout_id, position)
);

-- Store denormalized exercise fields so old workouts survive later exercise
-- library edits or deletions.
comment on column public.workout_exercises.exercise_name is
  'Snapshot of the planned exercise name at the time it was added.';

create index if not exists workout_exercises_workout_id_idx on public.workout_exercises (workout_id);

drop trigger if exists workout_exercises_set_updated_at on public.workout_exercises;
create trigger workout_exercises_set_updated_at
before update on public.workout_exercises
for each row
execute function public.set_updated_at();

alter table public.workout_exercises enable row level security;

drop policy if exists "Users can manage their workout exercises" on public.workout_exercises;
create policy "Users can manage their workout exercises"
on public.workout_exercises
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.workout_exercise_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_exercise_id uuid not null references public.workout_exercises (id) on delete cascade,
  set_number integer not null,
  target_weight_value numeric,
  target_weight_label text,
  target_reps_min integer,
  target_reps_max integer,
  target_reps_label text,
  target_rir_value numeric,
  target_rir_label text,
  is_drop_set boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workout_exercise_id, set_number)
);

create index if not exists workout_exercise_sets_workout_exercise_id_idx
on public.workout_exercise_sets (workout_exercise_id);

drop trigger if exists workout_exercise_sets_set_updated_at on public.workout_exercise_sets;
create trigger workout_exercise_sets_set_updated_at
before update on public.workout_exercise_sets
for each row
execute function public.set_updated_at();

alter table public.workout_exercise_sets enable row level security;

drop policy if exists "Users can manage their workout exercise sets" on public.workout_exercise_sets;
create policy "Users can manage their workout exercise sets"
on public.workout_exercise_sets
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null,
  file_name text,
  imported_at timestamptz not null default now(),
  row_count integer,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.import_batches enable row level security;

drop policy if exists "Users can manage their import batches" on public.import_batches;
create policy "Users can manage their import batches"
on public.import_batches
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  workout_id uuid references public.workouts (id) on delete set null,
  workout_name text not null,
  started_at timestamptz,
  completed_at timestamptz not null,
  duration_seconds integer,
  source text not null default 'user',
  source_key text,
  import_batch_id uuid references public.import_batches (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.workout_sessions is
  'Completed workout instances. This replaces the current local history entries.';

create index if not exists workout_sessions_user_completed_at_idx
on public.workout_sessions (user_id, completed_at desc);
create unique index if not exists workout_sessions_user_source_key_idx
on public.workout_sessions (user_id, source, source_key);

drop trigger if exists workout_sessions_set_updated_at on public.workout_sessions;
create trigger workout_sessions_set_updated_at
before update on public.workout_sessions
for each row
execute function public.set_updated_at();

alter table public.workout_sessions enable row level security;

drop policy if exists "Users can manage their workout sessions" on public.workout_sessions;
create policy "Users can manage their workout sessions"
on public.workout_sessions
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.session_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references public.workout_sessions (id) on delete cascade,
  workout_exercise_id uuid references public.workout_exercises (id) on delete set null,
  exercise_id uuid references public.exercises (id) on delete set null,
  position integer not null,
  exercise_name text not null,
  equipment text,
  primary_muscle text,
  secondary_muscles text[] not null default '{}',
  superset_group text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (session_id, position)
);

create index if not exists session_exercises_session_id_idx on public.session_exercises (session_id);

drop trigger if exists session_exercises_set_updated_at on public.session_exercises;
create trigger session_exercises_set_updated_at
before update on public.session_exercises
for each row
execute function public.set_updated_at();

alter table public.session_exercises enable row level security;

drop policy if exists "Users can manage their session exercises" on public.session_exercises;
create policy "Users can manage their session exercises"
on public.session_exercises
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.session_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_exercise_id uuid not null references public.session_exercises (id) on delete cascade,
  set_number integer not null,
  target_weight_value numeric,
  target_weight_label text,
  target_reps_min integer,
  target_reps_max integer,
  target_reps_label text,
  target_rir_value numeric,
  target_rir_label text,
  actual_weight_value numeric,
  actual_weight_label text,
  actual_reps integer,
  actual_rir_value numeric,
  actual_rir_label text,
  estimated_1rm numeric,
  is_drop_set boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (session_exercise_id, set_number)
);

-- Keep raw labels for values like +55 bodyweight loading, 5+ RIR, or unknown
-- RIR from imported workout history.
comment on column public.session_sets.actual_weight_label is
  'Original displayed weight, preserved when the value is not purely numeric.';
comment on column public.session_sets.actual_rir_label is
  'Original displayed RIR, including values such as 5+ or -.';

create index if not exists session_sets_session_exercise_id_idx
on public.session_sets (session_exercise_id);

drop trigger if exists session_sets_set_updated_at on public.session_sets;
create trigger session_sets_set_updated_at
before update on public.session_sets
for each row
execute function public.set_updated_at();

alter table public.session_sets enable row level security;

drop policy if exists "Users can manage their session sets" on public.session_sets;
create policy "Users can manage their session sets"
on public.session_sets
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  duration_weeks integer,
  days_per_week integer,
  is_open_ended boolean not null default false,
  starts_on date,
  ends_on date,
  status text not null default 'draft',
  plan_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on column public.training_plans.plan_config is
  'Flexible planning rules for generation: muscle targets, RIR progression, supersets, rep ranges, and exercise inclusion rules.';

create index if not exists training_plans_user_id_idx on public.training_plans (user_id);

drop trigger if exists training_plans_set_updated_at on public.training_plans;
create trigger training_plans_set_updated_at
before update on public.training_plans
for each row
execute function public.set_updated_at();

alter table public.training_plans enable row level security;

drop policy if exists "Users can manage their training plans" on public.training_plans;
create policy "Users can manage their training plans"
on public.training_plans
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.training_plan_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  training_plan_id uuid not null references public.training_plans (id) on delete cascade,
  workout_id uuid references public.workouts (id) on delete set null,
  week_number integer,
  day_number integer,
  position integer not null default 1,
  name text not null,
  phase text,
  target_rir_value numeric,
  target_rir_label text,
  workout_rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists training_plan_workouts_plan_id_idx
on public.training_plan_workouts (training_plan_id);

drop trigger if exists training_plan_workouts_set_updated_at on public.training_plan_workouts;
create trigger training_plan_workouts_set_updated_at
before update on public.training_plan_workouts
for each row
execute function public.set_updated_at();

alter table public.training_plan_workouts enable row level security;

drop policy if exists "Users can manage their training plan workouts" on public.training_plan_workouts;
create policy "Users can manage their training plan workouts"
on public.training_plan_workouts
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
