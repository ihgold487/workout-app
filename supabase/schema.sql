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

create or replace function public.create_profile_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'display_name', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      new.email
    )
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists auth_users_create_profile on auth.users;
create trigger auth_users_create_profile
after insert on auth.users
for each row
execute function public.create_profile_for_auth_user();

insert into public.profiles (user_id, display_name)
select
  au.id,
  coalesce(
    nullif(au.raw_user_meta_data->>'display_name', ''),
    nullif(au.raw_user_meta_data->>'name', ''),
    au.email
  )
from auth.users au
on conflict (user_id) do nothing;

create table if not exists public.trainer_user_access (
  trainer_user_id uuid not null references auth.users (id) on delete cascade,
  trainee_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (trainer_user_id, trainee_user_id),
  constraint trainer_user_access_no_self_check check (trainer_user_id <> trainee_user_id)
);

comment on table public.trainer_user_access is
  'Allows approved trainer users to prepare plans for listed trainee users. Rows should be managed by a database owner/admin, not ordinary clients.';

create index if not exists trainer_user_access_trainee_user_id_idx
on public.trainer_user_access (trainee_user_id);

alter table public.trainer_user_access enable row level security;

drop policy if exists "Trainers can read their trainee access" on public.trainer_user_access;
create policy "Trainers can read their trainee access"
on public.trainer_user_access
for select
using (auth.uid() = trainer_user_id);

create table if not exists public.trainer_admins (
  trainer_user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.trainer_admins is
  'Allows approved trainer users to prepare plans for all app users. Rows should be managed by a database owner/admin, not ordinary clients.';

alter table public.trainer_admins enable row level security;

drop policy if exists "Trainer admins can read their own grant" on public.trainer_admins;
create policy "Trainer admins can read their own grant"
on public.trainer_admins
for select
using (auth.uid() = trainer_user_id);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  description text,
  instruction_steps text[] not null default '{}',
  instruction_source text,
  instruction_source_url text,
  image_url text,
  image_storage_path text,
  image_alt text,
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
create unique index if not exists exercises_builtin_source_key_idx
on public.exercises (source, source_key)
where user_id is null;

alter table public.exercises
add column if not exists image_storage_path text;

alter table public.exercises
add column if not exists image_alt text;

alter table public.exercises
add column if not exists instruction_steps text[] not null default '{}';

alter table public.exercises
add column if not exists instruction_source text;

alter table public.exercises
add column if not exists instruction_source_url text;

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

create or replace function public.can_train_user(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select target_user_id = auth.uid()
    or exists (
      select 1
      from public.trainer_admins ta
      where ta.trainer_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.trainer_user_access tua
      where tua.trainer_user_id = auth.uid()
        and tua.trainee_user_id = target_user_id
    );
$$;

create or replace function public.list_trainer_users()
returns table (
  user_id uuid,
  display_name text,
  is_self boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.user_id,
    coalesce(nullif(p.display_name, ''), 'Signed-in user') as display_name,
    p.user_id = auth.uid() as is_self
  from public.profiles p
  where p.user_id = auth.uid()
     or exists (
       select 1
       from public.trainer_admins ta
       where ta.trainer_user_id = auth.uid()
     )
     or exists (
       select 1
       from public.trainer_user_access tua
       where tua.trainer_user_id = auth.uid()
         and tua.trainee_user_id = p.user_id
     )
  order by (p.user_id = auth.uid()) desc, lower(coalesce(p.display_name, ''));
$$;

create or replace function public.get_trainer_user_exercise_preferences(target_user_id uuid)
returns table (
  exercise_id uuid,
  is_favorite boolean,
  include_in_plans boolean,
  exclude_from_plans boolean,
  preferred_equipment text,
  notes text,
  metadata jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    uep.exercise_id,
    uep.is_favorite,
    uep.include_in_plans,
    uep.exclude_from_plans,
    uep.preferred_equipment,
    uep.notes,
    uep.metadata
  from public.user_exercise_preferences uep
  where uep.user_id = target_user_id
    and public.can_train_user(target_user_id);
$$;

create or replace function public.set_trainer_user_exercise_plan_status(
  target_user_id uuid,
  target_exercise_id uuid default null,
  exercise_name text default null,
  exercise_equipment text default null,
  exclude_from_plans boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_exercise_id uuid;
begin
  if not public.can_train_user(target_user_id) then
    raise exception 'Not authorized to update exercise preferences for this user.';
  end if;

  if target_exercise_id is not null then
    select e.id
    into resolved_exercise_id
    from public.exercises e
    where e.id = target_exercise_id
      and e.deleted_at is null
      and (e.user_id is null or e.user_id = target_user_id)
    limit 1;
  else
    select e.id
    into resolved_exercise_id
    from public.exercises e
    where e.is_builtin = true
      and e.user_id is null
      and e.deleted_at is null
      and lower(e.name) = lower(trim(coalesce(exercise_name, '')))
      and coalesce(lower(e.equipment), '') = coalesce(lower(trim(coalesce(exercise_equipment, ''))), '')
    order by e.name
    limit 1;
  end if;

  if resolved_exercise_id is null then
    raise exception 'Exercise not found for selected user.';
  end if;

  insert into public.user_exercise_preferences (
    user_id,
    exercise_id,
    include_in_plans,
    exclude_from_plans,
    metadata
  )
  values (
    target_user_id,
    resolved_exercise_id,
    not exclude_from_plans,
    exclude_from_plans,
    jsonb_build_object(
      'localActiveStatus',
      case when exclude_from_plans then 'inactive' else 'active' end,
      'trainerUpdatedAt',
      now(),
      'trainerUserId',
      auth.uid()
    )
  )
  on conflict (user_id, exercise_id)
  do update set
    include_in_plans = excluded.include_in_plans,
    exclude_from_plans = excluded.exclude_from_plans,
    metadata = coalesce(public.user_exercise_preferences.metadata, '{}'::jsonb)
      || excluded.metadata,
    updated_at = now();
end;
$$;

create or replace function public.get_trainer_debug_context()
returns table (
  current_user_id uuid,
  has_admin_grant boolean,
  profile_count integer,
  visible_trainer_user_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() as current_user_id,
    exists (
      select 1
      from public.trainer_admins ta
      where ta.trainer_user_id = auth.uid()
    ) as has_admin_grant,
    (select count(*)::integer from public.profiles) as profile_count,
    (select count(*)::integer from public.list_trainer_users()) as visible_trainer_user_count;
$$;

create or replace function public.promote_custom_exercise_to_builtin(
  exercise_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  promoted_exercise_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in before adding built-in exercises.';
  end if;

  if not exists (
    select 1
    from public.trainer_admins ta
    where ta.trainer_user_id = auth.uid()
  ) then
    raise exception 'Not authorized to add built-in exercises.';
  end if;

  if nullif(trim(exercise_payload->>'name'), '') is null then
    raise exception 'Exercise name is required.';
  end if;

  insert into public.exercises (
    user_id,
    name,
    description,
    instruction_steps,
    instruction_source,
    instruction_source_url,
    image_url,
    image_storage_path,
    image_alt,
    equipment,
    primary_muscle,
    secondary_muscles,
    is_builtin,
    source,
    source_key,
    deleted_at
  )
  values (
    null,
    trim(exercise_payload->>'name'),
    nullif(exercise_payload->>'description', ''),
    coalesce(
      array(
        select jsonb_array_elements_text(exercise_payload->'instruction_steps')
      ),
      '{}'::text[]
    ),
    nullif(exercise_payload->>'instruction_source', ''),
    nullif(exercise_payload->>'instruction_source_url', ''),
    nullif(exercise_payload->>'image_url', ''),
    nullif(exercise_payload->>'image_storage_path', ''),
    nullif(exercise_payload->>'image_alt', ''),
    nullif(exercise_payload->>'equipment', ''),
    nullif(exercise_payload->>'primary_muscle', ''),
    coalesce(
      array(
        select jsonb_array_elements_text(exercise_payload->'secondary_muscles')
      ),
      '{}'::text[]
    ),
    true,
    coalesce(nullif(exercise_payload->>'source', ''), 'trainer_promoted'),
    coalesce(
      nullif(exercise_payload->>'source_key', ''),
      'trainer-promoted:' || auth.uid()::text || ':' || gen_random_uuid()::text
    ),
    null
  )
  on conflict (source, source_key)
  where user_id is null
  do update set
    name = excluded.name,
    description = excluded.description,
    instruction_steps = excluded.instruction_steps,
    instruction_source = excluded.instruction_source,
    instruction_source_url = excluded.instruction_source_url,
    image_url = excluded.image_url,
    image_storage_path = excluded.image_storage_path,
    image_alt = excluded.image_alt,
    equipment = excluded.equipment,
    primary_muscle = excluded.primary_muscle,
    secondary_muscles = excluded.secondary_muscles,
    is_builtin = true,
    deleted_at = null
  returning id into promoted_exercise_id;

  return promoted_exercise_id;
end;
$$;

create or replace function public.update_builtin_exercise(
  exercise_id uuid,
  exercise_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_exercise_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in before editing built-in exercises.';
  end if;

  if not exists (
    select 1
    from public.trainer_admins ta
    where ta.trainer_user_id = auth.uid()
  ) then
    raise exception 'Not authorized to edit built-in exercises.';
  end if;

  if exercise_id is null then
    raise exception 'exercise_id is required.';
  end if;

  if nullif(trim(exercise_payload->>'name'), '') is null then
    raise exception 'Exercise name is required.';
  end if;

  update public.exercises
  set
    name = trim(exercise_payload->>'name'),
    description = nullif(exercise_payload->>'description', ''),
    instruction_steps = case
      when exercise_payload ? 'instruction_steps' then coalesce(
        array(
          select jsonb_array_elements_text(exercise_payload->'instruction_steps')
        ),
        '{}'::text[]
      )
      else instruction_steps
    end,
    instruction_source = case
      when exercise_payload ? 'instruction_source' then nullif(exercise_payload->>'instruction_source', '')
      else instruction_source
    end,
    instruction_source_url = case
      when exercise_payload ? 'instruction_source_url' then nullif(exercise_payload->>'instruction_source_url', '')
      else instruction_source_url
    end,
    image_url = nullif(exercise_payload->>'image_url', ''),
    image_storage_path = nullif(exercise_payload->>'image_storage_path', ''),
    image_alt = nullif(exercise_payload->>'image_alt', ''),
    equipment = nullif(exercise_payload->>'equipment', ''),
    primary_muscle = nullif(exercise_payload->>'primary_muscle', ''),
    secondary_muscles = coalesce(
      array(
        select jsonb_array_elements_text(exercise_payload->'secondary_muscles')
      ),
      '{}'::text[]
    ),
    is_builtin = true,
    user_id = null,
    deleted_at = null
  where id = exercise_id
    and user_id is null
    and is_builtin = true
  returning id into updated_exercise_id;

  if updated_exercise_id is null then
    raise exception 'Built-in exercise not found.';
  end if;

  return updated_exercise_id;
end;
$$;

update public.exercises
set
  instruction_steps = array[
    'Set a bench upright or stand tall, then hold the dumbbells at shoulder height with palms facing inward.',
    'Keep your elbows slightly forward and the dumbbells close to your shoulders.',
    'Brace your core and keep your shoulders pulled back before pressing.',
    'Press overhead while rotating your wrists outward until your palms face forward at the top.',
    'Finish with your arms extended overhead in a standard shoulder-press position.',
    'Lower the dumbbells under control while rotating your palms back toward your body.',
    'End the rep with palms facing inward and elbows in front of your torso.',
    'Keep the rotation smooth through the full movement instead of snapping at either end.'
  ],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-arnold-press/'
where user_id is null
  and is_builtin = true
  and lower(name) = 'arnold press'
  and lower(coalesce(equipment, '')) in ('dumbbells', 'dumbbell');

create or replace function public.create_trainer_plan_for_user(
  target_user_id uuid,
  plan_payload jsonb,
  workouts_payload jsonb
)
returns table (
  plan_source_key text,
  workout_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  cloud_plan_id uuid;
  cloud_workout_id uuid;
  current_workout jsonb;
  current_exercise jsonb;
  current_set jsonb;
  current_plan_workout jsonb;
  local_workout_id text;
  local_workout_ids text[] := '{}';
  workout_cloud_ids uuid[] := '{}';
  workout_index integer := 0;
  exercise_index integer := 0;
  set_index integer := 0;
  plan_workout_index integer := 0;
  target_rir text;
  target_reps text;
  target_weight text;
  exercise_muscles jsonb;
  inserted_workout_exercise_id uuid;
begin
  if not public.can_train_user(target_user_id) then
    raise exception 'Not authorized to create plans for this user.';
  end if;

  if target_user_id is null then
    raise exception 'target_user_id is required.';
  end if;

  if nullif(plan_payload->>'id', '') is null then
    raise exception 'plan_payload.id is required.';
  end if;

  insert into public.training_plans (
    user_id,
    name,
    description,
    duration_weeks,
    days_per_week,
    is_open_ended,
    starts_on,
    ends_on,
    status,
    plan_config,
    source,
    source_key,
    deleted_at,
    updated_at
  )
  values (
    target_user_id,
    coalesce(nullif(plan_payload->>'name', ''), 'Training Plan'),
    nullif(plan_payload->>'description', ''),
    nullif(plan_payload->>'durationWeeks', '')::integer,
    nullif(plan_payload->>'daysPerWeek', '')::integer,
    coalesce((plan_payload->>'isOpenEnded')::boolean, false),
    nullif(plan_payload->>'startsOn', '')::date,
    nullif(plan_payload->>'endsOn', '')::date,
    coalesce(nullif(plan_payload->>'status', ''), 'inactive'),
    jsonb_build_object(
      'completions', coalesce(plan_payload->'completions', '[]'::jsonb),
      'config', coalesce(plan_payload->'config', '{}'::jsonb),
      'createdAt', plan_payload->>'createdAt',
      'currentWeek', coalesce(nullif(plan_payload->>'currentWeek', '')::integer, 1),
      'goal', coalesce(nullif(plan_payload->>'goal', ''), 'maintain'),
      'planType', coalesce(nullif(plan_payload->>'planType', ''), 'type-2')
    ),
    'local_app',
    plan_payload->>'id',
    null,
    now()
  )
  on conflict (user_id, source, source_key)
  do update set
    name = excluded.name,
    description = excluded.description,
    duration_weeks = excluded.duration_weeks,
    days_per_week = excluded.days_per_week,
    is_open_ended = excluded.is_open_ended,
    starts_on = excluded.starts_on,
    ends_on = excluded.ends_on,
    status = excluded.status,
    plan_config = excluded.plan_config,
    deleted_at = null,
    updated_at = now()
  returning id into cloud_plan_id;

  for current_workout in
    select value from jsonb_array_elements(coalesce(workouts_payload, '[]'::jsonb))
  loop
    workout_index := workout_index + 1;
    local_workout_id := current_workout->>'id';

    if nullif(local_workout_id, '') is null then
      raise exception 'workout id is required.';
    end if;

    insert into public.workouts (
      user_id,
      name,
      description,
      parent_workout_id,
      source,
      source_key,
      last_completed_at,
      deleted_at,
      updated_at
    )
    values (
      target_user_id,
      coalesce(nullif(current_workout->>'name', ''), 'Workout'),
      nullif(current_workout->>'description', ''),
      null,
      'local_app',
      local_workout_id,
      null,
      null,
      now()
    )
    on conflict (user_id, source, source_key)
    do update set
      name = excluded.name,
      description = excluded.description,
      deleted_at = null,
      updated_at = now()
    returning id into cloud_workout_id;

    local_workout_ids := array_append(local_workout_ids, local_workout_id);
    workout_cloud_ids := array_append(workout_cloud_ids, cloud_workout_id);

    delete from public.workout_exercises
    where user_id = target_user_id
      and workout_id = cloud_workout_id;

    exercise_index := 0;
    for current_exercise in
      select value from jsonb_array_elements(coalesce(current_workout->'exercises', '[]'::jsonb))
    loop
      exercise_index := exercise_index + 1;
      exercise_muscles := coalesce(current_exercise->'muscles', '[]'::jsonb);

      insert into public.workout_exercises (
        user_id,
        workout_id,
        exercise_id,
        position,
        exercise_name,
        equipment,
        primary_muscle,
        secondary_muscles,
        superset_group,
        notes,
        deleted_at,
        updated_at
      )
      values (
        target_user_id,
        cloud_workout_id,
        null,
        exercise_index,
        coalesce(nullif(current_exercise->>'name', ''), 'Exercise'),
        nullif(current_exercise->'equipment'->>0, ''),
        nullif(exercise_muscles->>0, ''),
        coalesce(
          array(
            select value
            from jsonb_array_elements_text(exercise_muscles) with ordinality as muscles(value, position)
            where position > 1
          ),
          '{}'
        ),
        nullif(current_exercise->>'supersetGroup', ''),
        nullif(current_exercise->>'note', ''),
        null,
        now()
      )
      returning id into inserted_workout_exercise_id;

      set_index := 0;
      for current_set in
        select value from jsonb_array_elements(coalesce(current_exercise->'sets', '[]'::jsonb))
      loop
        set_index := set_index + 1;
        target_reps := nullif(current_set->>'targetReps', '');
        target_rir := nullif(coalesce(current_set->>'targetRir', current_set->>'rir'), '');
        target_weight := nullif(current_set->>'targetWeight', '');

        insert into public.workout_exercise_sets (
          user_id,
          workout_exercise_id,
          set_number,
          target_weight_value,
          target_weight_label,
          target_reps_min,
          target_reps_max,
          target_reps_label,
          target_rir_value,
          target_rir_label,
          is_drop_set,
          deleted_at,
          updated_at
        )
        values (
          target_user_id,
          inserted_workout_exercise_id,
          set_index,
          case
            when target_weight ~ '^\+?[0-9]+(\.[0-9]+)?$'
              then replace(target_weight, '+', '')::numeric
            else null
          end,
          target_weight,
          case when target_reps ~ '^[0-9]+$' then target_reps::integer else null end,
          case when target_reps ~ '^[0-9]+$' then target_reps::integer else null end,
          target_reps,
          case
            when target_rir = '5+' then 6
            when target_rir ~ '^[0-9]+$' then target_rir::integer
            else 0
          end,
          target_rir,
          coalesce((current_set->>'isDropSet')::boolean, false),
          null,
          now()
        );
      end loop;
    end loop;
  end loop;

  delete from public.training_plan_workouts
  where user_id = target_user_id
    and training_plan_id = cloud_plan_id;

  for current_plan_workout in
    select value from jsonb_array_elements(coalesce(plan_payload->'workouts', '[]'::jsonb))
  loop
    plan_workout_index := plan_workout_index + 1;
    local_workout_id := current_plan_workout->>'templateId';
    cloud_workout_id := null;

    if array_length(local_workout_ids, 1) is not null then
      for workout_index in 1..array_length(local_workout_ids, 1) loop
        if local_workout_ids[workout_index] = local_workout_id then
          cloud_workout_id := workout_cloud_ids[workout_index];
          exit;
        end if;
      end loop;
    end if;

    target_rir := nullif(plan_payload->'config'->>'rir', '');

    insert into public.training_plan_workouts (
      user_id,
      training_plan_id,
      workout_id,
      week_number,
      day_number,
      position,
      name,
      phase,
      target_rir_value,
      target_rir_label,
      workout_rules,
      deleted_at,
      updated_at
    )
    values (
      target_user_id,
      cloud_plan_id,
      cloud_workout_id,
      nullif(current_plan_workout->>'weekNumber', '')::integer,
      coalesce(nullif(current_plan_workout->>'dayNumber', '')::integer, plan_workout_index),
      plan_workout_index,
      coalesce(nullif(current_plan_workout->>'name', ''), 'Workout'),
      nullif(current_plan_workout->>'phase', ''),
      case
        when target_rir = '5+' then 6
        when target_rir ~ '^[0-9]+$' then target_rir::integer
        else 0
      end,
      target_rir,
      jsonb_build_object(
        'planWorkoutId', current_plan_workout->>'planWorkoutId',
        'templateId', current_plan_workout->>'templateId'
      ),
      null,
      now()
    );
  end loop;

  return query
  select plan_payload->>'id', coalesce(jsonb_array_length(workouts_payload), 0);
end;
$$;

create or replace function public.create_trainer_workout_for_user(
  target_user_id uuid,
  workout_payload jsonb
)
returns table (
  workout_source_key text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  cloud_workout_id uuid;
  current_exercise jsonb;
  current_set jsonb;
  exercise_index integer := 0;
  set_index integer := 0;
  target_rir text;
  target_reps text;
  target_weight text;
  exercise_muscles jsonb;
  inserted_workout_exercise_id uuid;
begin
  if not public.can_train_user(target_user_id) then
    raise exception 'Not authorized to create workouts for this user.';
  end if;

  if target_user_id is null then
    raise exception 'target_user_id is required.';
  end if;

  if nullif(workout_payload->>'id', '') is null then
    raise exception 'workout_payload.id is required.';
  end if;

  insert into public.workouts (
    user_id,
    name,
    description,
    parent_workout_id,
    source,
    source_key,
    last_completed_at,
    deleted_at,
    updated_at
  )
  values (
    target_user_id,
    coalesce(nullif(workout_payload->>'name', ''), 'Workout'),
    nullif(workout_payload->>'description', ''),
    null,
    'local_app',
    workout_payload->>'id',
    null,
    null,
    now()
  )
  on conflict (user_id, source, source_key)
  do update set
    name = excluded.name,
    description = excluded.description,
    deleted_at = null,
    updated_at = now()
  returning id into cloud_workout_id;

  delete from public.workout_exercises
  where user_id = target_user_id
    and workout_id = cloud_workout_id;

  for current_exercise in
    select value from jsonb_array_elements(coalesce(workout_payload->'exercises', '[]'::jsonb))
  loop
    exercise_index := exercise_index + 1;
    exercise_muscles := coalesce(current_exercise->'muscles', '[]'::jsonb);

    insert into public.workout_exercises (
      user_id,
      workout_id,
      exercise_id,
      position,
      exercise_name,
      equipment,
      primary_muscle,
      secondary_muscles,
      superset_group,
      notes,
      deleted_at,
      updated_at
    )
    values (
      target_user_id,
      cloud_workout_id,
      null,
      exercise_index,
      coalesce(nullif(current_exercise->>'name', ''), 'Exercise'),
      nullif(current_exercise->'equipment'->>0, ''),
      nullif(exercise_muscles->>0, ''),
      coalesce(
        array(
          select value
          from jsonb_array_elements_text(exercise_muscles) with ordinality as muscles(value, position)
          where position > 1
        ),
        '{}'
      ),
      nullif(current_exercise->>'supersetGroup', ''),
      nullif(current_exercise->>'note', ''),
      null,
      now()
    )
    returning id into inserted_workout_exercise_id;

    set_index := 0;
    for current_set in
      select value from jsonb_array_elements(coalesce(current_exercise->'sets', '[]'::jsonb))
    loop
      set_index := set_index + 1;
      target_reps := nullif(current_set->>'targetReps', '');
      target_rir := nullif(coalesce(current_set->>'targetRir', current_set->>'rir'), '');
      target_weight := nullif(current_set->>'targetWeight', '');

      insert into public.workout_exercise_sets (
        user_id,
        workout_exercise_id,
        set_number,
        target_weight_value,
        target_weight_label,
        target_reps_min,
        target_reps_max,
        target_reps_label,
        target_rir_value,
        target_rir_label,
        is_drop_set,
        deleted_at,
        updated_at
      )
      values (
        target_user_id,
        inserted_workout_exercise_id,
        set_index,
        case
          when target_weight ~ '^\+?[0-9]+(\.[0-9]+)?$'
            then replace(target_weight, '+', '')::numeric
          else null
        end,
        target_weight,
        case when target_reps ~ '^[0-9]+$' then target_reps::integer else null end,
        case when target_reps ~ '^[0-9]+$' then target_reps::integer else null end,
        target_reps,
        case
          when target_rir = '5+' then 6
          when target_rir ~ '^[0-9]+$' then target_rir::integer
          else 0
        end,
        target_rir,
        coalesce((current_set->>'isDropSet')::boolean, false),
        null,
        now()
      );
    end loop;
  end loop;

  return query
  select workout_payload->>'id';
end;
$$;

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
  target_rir_value integer not null default 0,
  target_rir_label text,
  is_drop_set boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (workout_exercise_id, set_number)
);

create index if not exists workout_exercise_sets_workout_exercise_id_idx
on public.workout_exercise_sets (workout_exercise_id);

update public.workout_exercise_sets
set target_rir_value = 0
where target_rir_value is null;

alter table public.workout_exercise_sets
alter column target_rir_value type integer using round(target_rir_value)::integer,
alter column target_rir_value set default 0,
alter column target_rir_value set not null;

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
  target_rir_value integer not null default 0,
  target_rir_label text,
  actual_weight_value numeric,
  actual_weight_label text,
  actual_reps integer,
  actual_rir_value integer not null default 0,
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

update public.session_sets
set target_rir_value = 0
where target_rir_value is null;

update public.session_sets
set actual_rir_value = 0
where actual_rir_value is null;

alter table public.session_sets
alter column target_rir_value type integer using round(target_rir_value)::integer,
alter column target_rir_value set default 0,
alter column target_rir_value set not null,
alter column actual_rir_value type integer using round(actual_rir_value)::integer,
alter column actual_rir_value set default 0,
alter column actual_rir_value set not null;

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
  source text not null default 'user',
  source_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on column public.training_plans.plan_config is
  'Flexible planning rules for generation: muscle targets, RIR progression, supersets, rep ranges, and exercise inclusion rules.';

create index if not exists training_plans_user_id_idx on public.training_plans (user_id);

alter table public.training_plans
add column if not exists source text not null default 'user';

alter table public.training_plans
add column if not exists source_key text;

create unique index if not exists training_plans_user_source_key_idx
on public.training_plans (user_id, source, source_key);

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
  target_rir_value integer not null default 0,
  target_rir_label text,
  workout_rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists training_plan_workouts_plan_id_idx
on public.training_plan_workouts (training_plan_id);

update public.training_plan_workouts
set target_rir_value = 0
where target_rir_value is null;

alter table public.training_plan_workouts
alter column target_rir_value type integer using round(target_rir_value)::integer,
alter column target_rir_value set default 0,
alter column target_rir_value set not null;

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

-- Nutrition model.
--
-- Start with manual daily tracking and keep the shape ready for food lookup,
-- saved foods, barcode-backed foods, recipes, and future cloud sync.

create table if not exists public.nutrition_daily_targets (
  user_id uuid not null references auth.users (id) on delete cascade,
  target_date date not null,
  calorie_target integer,
  protein_grams numeric,
  carb_grams numeric,
  fat_grams numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, target_date)
);

drop trigger if exists nutrition_daily_targets_set_updated_at on public.nutrition_daily_targets;
create trigger nutrition_daily_targets_set_updated_at
before update on public.nutrition_daily_targets
for each row
execute function public.set_updated_at();

alter table public.nutrition_daily_targets enable row level security;

drop policy if exists "Users can manage their nutrition targets" on public.nutrition_daily_targets;
create policy "Users can manage their nutrition targets"
on public.nutrition_daily_targets
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.nutrition_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  brand text,
  barcode text,
  serving_size numeric,
  serving_unit text,
  calories integer,
  protein_grams numeric,
  carb_grams numeric,
  fat_grams numeric,
  source text not null default 'user',
  source_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint nutrition_foods_owner_check check (
    (source <> 'user' and user_id is null)
    or (source = 'user' and user_id is not null)
  )
);

create index if not exists nutrition_foods_user_id_idx on public.nutrition_foods (user_id);
create index if not exists nutrition_foods_name_idx on public.nutrition_foods (lower(name));
create index if not exists nutrition_foods_barcode_idx on public.nutrition_foods (barcode);
create unique index if not exists nutrition_foods_user_source_key_idx
on public.nutrition_foods (user_id, source, source_key);
create unique index if not exists nutrition_foods_public_source_key_idx
on public.nutrition_foods (source, source_key)
where user_id is null;

create unique index if not exists nutrition_foods_supplemental_unique_idx
on public.nutrition_foods (
  lower(name),
  lower(coalesce(brand, '')),
  coalesce(serving_size, 0),
  coalesce(serving_unit, '')
)
where user_id is null
  and source = 'supplemental_library'
  and deleted_at is null;

drop trigger if exists nutrition_foods_set_updated_at on public.nutrition_foods;
create trigger nutrition_foods_set_updated_at
before update on public.nutrition_foods
for each row
execute function public.set_updated_at();

alter table public.nutrition_foods enable row level security;

drop policy if exists "Users can read public and own nutrition foods" on public.nutrition_foods;
create policy "Users can read public and own nutrition foods"
on public.nutrition_foods
for select
using (user_id is null or auth.uid() = user_id);

drop policy if exists "Users can insert custom nutrition foods" on public.nutrition_foods;
create policy "Users can insert custom nutrition foods"
on public.nutrition_foods
for insert
with check (auth.uid() = user_id and source = 'user');

drop policy if exists "Users can update custom nutrition foods" on public.nutrition_foods;
create policy "Users can update custom nutrition foods"
on public.nutrition_foods
for update
using (auth.uid() = user_id and source = 'user')
with check (auth.uid() = user_id and source = 'user');

drop policy if exists "Users can delete custom nutrition foods" on public.nutrition_foods;
create policy "Users can delete custom nutrition foods"
on public.nutrition_foods
for delete
using (auth.uid() = user_id and source = 'user');

create or replace function public.add_supplemental_nutrition_food(
  food_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_food_id uuid;
  normalized_brand text;
  normalized_name text;
  source_key_value text;
begin
  if auth.uid() is null then
    raise exception 'Sign in before adding foods to the shared library.';
  end if;

  if nullif(trim(food_payload->>'name'), '') is null then
    raise exception 'Food name is required.';
  end if;

  normalized_name := lower(trim(food_payload->>'name'));
  normalized_brand := lower(coalesce(nullif(trim(food_payload->>'brand'), ''), ''));

  if exists (
    select 1
    from public.nutrition_foods nf
    where nf.user_id is null
      and nf.source = 'supplemental_library'
      and nf.deleted_at is null
      and lower(nf.name) = normalized_name
      and lower(coalesce(nf.brand, '')) = normalized_brand
      and coalesce(nf.serving_size, 0) = coalesce(nullif(food_payload->>'serving_amount', '')::numeric, 1)
      and coalesce(nf.serving_unit, '') = coalesce(nullif(food_payload->>'serving_unit', ''), 'serving')
  ) then
    raise exception 'A matching food already exists in the shared library.';
  end if;

  source_key_value := 'supplemental:' || md5(
    normalized_name || ':' ||
    normalized_brand || ':' ||
    coalesce(nullif(food_payload->>'serving_amount', ''), '1') || ':' ||
    coalesce(nullif(food_payload->>'serving_unit', ''), 'serving')
  );

  insert into public.nutrition_foods (
    user_id,
    name,
    brand,
    barcode,
    serving_size,
    serving_unit,
    calories,
    protein_grams,
    carb_grams,
    fat_grams,
    source,
    source_key,
    metadata,
    deleted_at
  )
  values (
    null,
    trim(food_payload->>'name'),
    nullif(trim(food_payload->>'brand'), ''),
    nullif(trim(food_payload->>'barcode'), ''),
    coalesce(nullif(food_payload->>'serving_amount', '')::numeric, 1),
    coalesce(nullif(food_payload->>'serving_unit', ''), 'serving'),
    coalesce(nullif(food_payload->>'calories', '')::integer, 0),
    coalesce(nullif(food_payload->>'protein', '')::numeric, 0),
    coalesce(nullif(food_payload->>'carbs', '')::numeric, 0),
    coalesce(nullif(food_payload->>'fat', '')::numeric, 0),
    'supplemental_library',
    source_key_value,
    jsonb_build_object(
      'created_by', auth.uid(),
      'created_from', 'nutrition_view'
    ),
    null
  )
  returning id into inserted_food_id;

  return inserted_food_id;
end;
$$;

create or replace function public.update_supplemental_nutrition_food(
  target_food_id uuid,
  food_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_brand text;
  normalized_name text;
begin
  if auth.uid() is null then
    raise exception 'Sign in before updating shared library foods.';
  end if;

  if target_food_id is null then
    raise exception 'Food id is required.';
  end if;

  if nullif(trim(food_payload->>'name'), '') is null then
    raise exception 'Food name is required.';
  end if;

  if not exists (
    select 1
    from public.nutrition_foods nf
    where nf.id = target_food_id
      and nf.user_id is null
      and nf.source = 'supplemental_library'
      and nf.deleted_at is null
  ) then
    raise exception 'Shared library food was not found.';
  end if;

  normalized_name := lower(trim(food_payload->>'name'));
  normalized_brand := lower(coalesce(nullif(trim(food_payload->>'brand'), ''), ''));

  if exists (
    select 1
    from public.nutrition_foods nf
    where nf.id <> target_food_id
      and nf.user_id is null
      and nf.source = 'supplemental_library'
      and nf.deleted_at is null
      and lower(nf.name) = normalized_name
      and lower(coalesce(nf.brand, '')) = normalized_brand
      and coalesce(nf.serving_size, 0) = coalesce(nullif(food_payload->>'serving_amount', '')::numeric, 1)
      and coalesce(nf.serving_unit, '') = coalesce(nullif(food_payload->>'serving_unit', ''), 'serving')
  ) then
    raise exception 'A matching food already exists in the shared library.';
  end if;

  update public.nutrition_foods
  set
    name = trim(food_payload->>'name'),
    brand = nullif(trim(food_payload->>'brand'), ''),
    barcode = nullif(trim(food_payload->>'barcode'), ''),
    serving_size = coalesce(nullif(food_payload->>'serving_amount', '')::numeric, 1),
    serving_unit = coalesce(nullif(food_payload->>'serving_unit', ''), 'serving'),
    calories = coalesce(nullif(food_payload->>'calories', '')::integer, 0),
    protein_grams = coalesce(nullif(food_payload->>'protein', '')::numeric, 0),
    carb_grams = coalesce(nullif(food_payload->>'carbs', '')::numeric, 0),
    fat_grams = coalesce(nullif(food_payload->>'fat', '')::numeric, 0),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'updated_by', auth.uid(),
      'updated_from', 'nutrition_view'
    ),
    deleted_at = null
  where id = target_food_id
    and user_id is null
    and source = 'supplemental_library'
    and deleted_at is null;

  return target_food_id;
end;
$$;

create or replace function public.delete_supplemental_nutrition_food(
  target_food_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in before deleting shared library foods.';
  end if;

  if target_food_id is null then
    raise exception 'Food id is required.';
  end if;

  update public.nutrition_foods
  set
    deleted_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'deleted_by', auth.uid(),
      'deleted_from', 'nutrition_view'
    )
  where id = target_food_id
    and user_id is null
    and source = 'supplemental_library'
    and deleted_at is null;

  if not found then
    raise exception 'Shared library food was not found.';
  end if;

  return target_food_id;
end;
$$;

create table if not exists public.nutrition_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null,
  description text,
  serving_size numeric,
  serving_unit text,
  servings_per_recipe numeric,
  calories numeric not null default 0,
  protein_grams numeric not null default 0,
  carb_grams numeric not null default 0,
  fat_grams numeric not null default 0,
  source text not null default 'user',
  source_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint nutrition_recipes_owner_check check (
    (source <> 'user' and user_id is null)
    or (source = 'user' and user_id is not null)
  )
);

comment on table public.nutrition_recipes is
  'Saved recipes assembled from USDA foods, shared library foods, or manual ingredient snapshots.';

comment on column public.nutrition_recipes.calories is
  'Total calories for the full recipe, not per serving.';

create index if not exists nutrition_recipes_user_id_idx on public.nutrition_recipes (user_id);
create index if not exists nutrition_recipes_name_idx on public.nutrition_recipes (lower(name));
create unique index if not exists nutrition_recipes_user_source_key_idx
on public.nutrition_recipes (user_id, source, source_key);
create unique index if not exists nutrition_recipes_public_source_key_idx
on public.nutrition_recipes (source, source_key)
where user_id is null;
create unique index if not exists nutrition_recipes_supplemental_unique_idx
on public.nutrition_recipes (
  lower(name),
  coalesce(serving_size, 0),
  coalesce(serving_unit, ''),
  coalesce(servings_per_recipe, 0)
)
where user_id is null
  and source = 'supplemental_recipe_library'
  and deleted_at is null;

drop trigger if exists nutrition_recipes_set_updated_at on public.nutrition_recipes;
create trigger nutrition_recipes_set_updated_at
before update on public.nutrition_recipes
for each row
execute function public.set_updated_at();

alter table public.nutrition_recipes enable row level security;

drop policy if exists "Users can read public and own nutrition recipes" on public.nutrition_recipes;
create policy "Users can read public and own nutrition recipes"
on public.nutrition_recipes
for select
using (user_id is null or auth.uid() = user_id);

drop policy if exists "Users can insert custom nutrition recipes" on public.nutrition_recipes;
create policy "Users can insert custom nutrition recipes"
on public.nutrition_recipes
for insert
with check (auth.uid() = user_id and source = 'user');

drop policy if exists "Users can update custom nutrition recipes" on public.nutrition_recipes;
create policy "Users can update custom nutrition recipes"
on public.nutrition_recipes
for update
using (auth.uid() = user_id and source = 'user')
with check (auth.uid() = user_id and source = 'user');

drop policy if exists "Users can delete custom nutrition recipes" on public.nutrition_recipes;
create policy "Users can delete custom nutrition recipes"
on public.nutrition_recipes
for delete
using (auth.uid() = user_id and source = 'user');

create table if not exists public.nutrition_recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.nutrition_recipes (id) on delete cascade,
  food_id uuid references public.nutrition_foods (id) on delete set null,
  position integer not null,
  ingredient_name text not null,
  brand text,
  amount numeric not null default 1,
  unit text not null default 'serving',
  calories numeric not null default 0,
  protein_grams numeric not null default 0,
  carb_grams numeric not null default 0,
  fat_grams numeric not null default 0,
  external_source text,
  external_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (recipe_id, position)
);

comment on table public.nutrition_recipe_ingredients is
  'Ingredient snapshots for saved recipes. Macro values are for the amount used in the full recipe.';

create index if not exists nutrition_recipe_ingredients_recipe_id_idx
on public.nutrition_recipe_ingredients (recipe_id);
create index if not exists nutrition_recipe_ingredients_food_id_idx
on public.nutrition_recipe_ingredients (food_id);

drop trigger if exists nutrition_recipe_ingredients_set_updated_at on public.nutrition_recipe_ingredients;
create trigger nutrition_recipe_ingredients_set_updated_at
before update on public.nutrition_recipe_ingredients
for each row
execute function public.set_updated_at();

alter table public.nutrition_recipe_ingredients enable row level security;

drop policy if exists "Users can read public and own recipe ingredients" on public.nutrition_recipe_ingredients;
create policy "Users can read public and own recipe ingredients"
on public.nutrition_recipe_ingredients
for select
using (
  exists (
    select 1
    from public.nutrition_recipes nr
    where nr.id = recipe_id
      and (nr.user_id is null or auth.uid() = nr.user_id)
  )
);

drop policy if exists "Users can insert custom recipe ingredients" on public.nutrition_recipe_ingredients;
create policy "Users can insert custom recipe ingredients"
on public.nutrition_recipe_ingredients
for insert
with check (
  exists (
    select 1
    from public.nutrition_recipes nr
    where nr.id = recipe_id
      and auth.uid() = nr.user_id
      and nr.source = 'user'
  )
);

drop policy if exists "Users can update custom recipe ingredients" on public.nutrition_recipe_ingredients;
create policy "Users can update custom recipe ingredients"
on public.nutrition_recipe_ingredients
for update
using (
  exists (
    select 1
    from public.nutrition_recipes nr
    where nr.id = recipe_id
      and auth.uid() = nr.user_id
      and nr.source = 'user'
  )
)
with check (
  exists (
    select 1
    from public.nutrition_recipes nr
    where nr.id = recipe_id
      and auth.uid() = nr.user_id
      and nr.source = 'user'
  )
);

drop policy if exists "Users can delete custom recipe ingredients" on public.nutrition_recipe_ingredients;
create policy "Users can delete custom recipe ingredients"
on public.nutrition_recipe_ingredients
for delete
using (
  exists (
    select 1
    from public.nutrition_recipes nr
    where nr.id = recipe_id
      and auth.uid() = nr.user_id
      and nr.source = 'user'
  )
);

create or replace function public.add_supplemental_nutrition_recipe(
  recipe_payload jsonb,
  ingredients_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_ingredient jsonb;
  inserted_recipe_id uuid;
  ingredient_count integer;
  ingredient_position integer := 0;
  normalized_name text;
  recipe_serving_size numeric;
  recipe_serving_unit text;
  recipe_servings_per_recipe numeric;
  source_key_value text;
  total_calories numeric := 0;
  total_carbs numeric := 0;
  total_fat numeric := 0;
  total_protein numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'Sign in before adding recipes to the shared library.';
  end if;

  if nullif(trim(recipe_payload->>'name'), '') is null then
    raise exception 'Recipe name is required.';
  end if;

  if jsonb_typeof(coalesce(ingredients_payload, '[]'::jsonb)) <> 'array' then
    raise exception 'Recipe ingredients must be an array.';
  end if;

  ingredient_count := jsonb_array_length(coalesce(ingredients_payload, '[]'::jsonb));

  if ingredient_count = 0 then
    raise exception 'At least one ingredient is required.';
  end if;

  normalized_name := lower(trim(recipe_payload->>'name'));
  recipe_serving_size := coalesce(nullif(recipe_payload->>'serving_size', '')::numeric, 1);
  recipe_serving_unit := coalesce(nullif(recipe_payload->>'serving_unit', ''), 'serving');
  recipe_servings_per_recipe := coalesce(nullif(recipe_payload->>'servings_per_recipe', '')::numeric, 1);

  for current_ingredient in
    select value from jsonb_array_elements(ingredients_payload)
  loop
    if nullif(trim(current_ingredient->>'ingredient_name'), '') is null then
      raise exception 'Ingredient name is required.';
    end if;

    total_calories := total_calories + coalesce(nullif(current_ingredient->>'calories', '')::numeric, 0);
    total_protein := total_protein + coalesce(nullif(current_ingredient->>'protein', '')::numeric, 0);
    total_carbs := total_carbs + coalesce(nullif(current_ingredient->>'carbs', '')::numeric, 0);
    total_fat := total_fat + coalesce(nullif(current_ingredient->>'fat', '')::numeric, 0);
  end loop;

  if exists (
    select 1
    from public.nutrition_recipes nr
    where nr.user_id is null
      and nr.source = 'supplemental_recipe_library'
      and nr.deleted_at is null
      and lower(nr.name) = normalized_name
      and coalesce(nr.serving_size, 0) = recipe_serving_size
      and coalesce(nr.serving_unit, '') = recipe_serving_unit
      and coalesce(nr.servings_per_recipe, 0) = recipe_servings_per_recipe
  ) then
    raise exception 'A matching recipe already exists in the shared library.';
  end if;

  source_key_value := 'supplemental-recipe:' || md5(
    normalized_name || ':' ||
    recipe_serving_size::text || ':' ||
    recipe_serving_unit || ':' ||
    recipe_servings_per_recipe::text
  );

  insert into public.nutrition_recipes (
    user_id,
    name,
    description,
    serving_size,
    serving_unit,
    servings_per_recipe,
    calories,
    protein_grams,
    carb_grams,
    fat_grams,
    source,
    source_key,
    metadata,
    deleted_at
  )
  values (
    null,
    trim(recipe_payload->>'name'),
    nullif(trim(recipe_payload->>'description'), ''),
    recipe_serving_size,
    recipe_serving_unit,
    recipe_servings_per_recipe,
    total_calories,
    total_protein,
    total_carbs,
    total_fat,
    'supplemental_recipe_library',
    source_key_value,
    jsonb_build_object(
      'created_by', auth.uid(),
      'created_from', 'nutrition_view'
    ),
    null
  )
  returning id into inserted_recipe_id;

  for current_ingredient in
    select value from jsonb_array_elements(ingredients_payload)
  loop
    ingredient_position := ingredient_position + 1;

    insert into public.nutrition_recipe_ingredients (
      recipe_id,
      food_id,
      position,
      ingredient_name,
      brand,
      amount,
      unit,
      calories,
      protein_grams,
      carb_grams,
      fat_grams,
      external_source,
      external_id,
      metadata,
      deleted_at
    )
    values (
      inserted_recipe_id,
      nullif(current_ingredient->>'food_id', '')::uuid,
      coalesce(nullif(current_ingredient->>'position', '')::integer, ingredient_position),
      trim(current_ingredient->>'ingredient_name'),
      nullif(trim(current_ingredient->>'brand'), ''),
      coalesce(nullif(current_ingredient->>'amount', '')::numeric, 1),
      coalesce(nullif(current_ingredient->>'unit', ''), 'serving'),
      coalesce(nullif(current_ingredient->>'calories', '')::numeric, 0),
      coalesce(nullif(current_ingredient->>'protein', '')::numeric, 0),
      coalesce(nullif(current_ingredient->>'carbs', '')::numeric, 0),
      coalesce(nullif(current_ingredient->>'fat', '')::numeric, 0),
      nullif(current_ingredient->>'external_source', ''),
      nullif(current_ingredient->>'external_id', ''),
      coalesce(current_ingredient->'metadata', '{}'::jsonb),
      null
    );
  end loop;

  return inserted_recipe_id;
end;
$$;

create or replace function public.update_supplemental_nutrition_recipe(
  target_recipe_id uuid,
  recipe_payload jsonb,
  ingredients_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_ingredient jsonb;
  ingredient_count integer;
  ingredient_position integer := 0;
  normalized_name text;
  recipe_serving_size numeric;
  recipe_serving_unit text;
  recipe_servings_per_recipe numeric;
  total_calories numeric := 0;
  total_carbs numeric := 0;
  total_fat numeric := 0;
  total_protein numeric := 0;
begin
  if auth.uid() is null then
    raise exception 'Sign in before updating shared library recipes.';
  end if;

  if target_recipe_id is null then
    raise exception 'Recipe id is required.';
  end if;

  if nullif(trim(recipe_payload->>'name'), '') is null then
    raise exception 'Recipe name is required.';
  end if;

  if jsonb_typeof(coalesce(ingredients_payload, '[]'::jsonb)) <> 'array' then
    raise exception 'Recipe ingredients must be an array.';
  end if;

  ingredient_count := jsonb_array_length(coalesce(ingredients_payload, '[]'::jsonb));

  if ingredient_count = 0 then
    raise exception 'At least one ingredient is required.';
  end if;

  if not exists (
    select 1
    from public.nutrition_recipes nr
    where nr.id = target_recipe_id
      and nr.user_id is null
      and nr.source = 'supplemental_recipe_library'
      and nr.deleted_at is null
  ) then
    raise exception 'Shared library recipe was not found.';
  end if;

  normalized_name := lower(trim(recipe_payload->>'name'));
  recipe_serving_size := coalesce(nullif(recipe_payload->>'serving_size', '')::numeric, 1);
  recipe_serving_unit := coalesce(nullif(recipe_payload->>'serving_unit', ''), 'serving');
  recipe_servings_per_recipe := coalesce(nullif(recipe_payload->>'servings_per_recipe', '')::numeric, 1);

  for current_ingredient in
    select value from jsonb_array_elements(ingredients_payload)
  loop
    if nullif(trim(current_ingredient->>'ingredient_name'), '') is null then
      raise exception 'Ingredient name is required.';
    end if;

    total_calories := total_calories + coalesce(nullif(current_ingredient->>'calories', '')::numeric, 0);
    total_protein := total_protein + coalesce(nullif(current_ingredient->>'protein', '')::numeric, 0);
    total_carbs := total_carbs + coalesce(nullif(current_ingredient->>'carbs', '')::numeric, 0);
    total_fat := total_fat + coalesce(nullif(current_ingredient->>'fat', '')::numeric, 0);
  end loop;

  if exists (
    select 1
    from public.nutrition_recipes nr
    where nr.id <> target_recipe_id
      and nr.user_id is null
      and nr.source = 'supplemental_recipe_library'
      and nr.deleted_at is null
      and lower(nr.name) = normalized_name
      and coalesce(nr.serving_size, 0) = recipe_serving_size
      and coalesce(nr.serving_unit, '') = recipe_serving_unit
      and coalesce(nr.servings_per_recipe, 0) = recipe_servings_per_recipe
  ) then
    raise exception 'A matching recipe already exists in the shared library.';
  end if;

  update public.nutrition_recipes
  set
    name = trim(recipe_payload->>'name'),
    description = nullif(trim(recipe_payload->>'description'), ''),
    serving_size = recipe_serving_size,
    serving_unit = recipe_serving_unit,
    servings_per_recipe = recipe_servings_per_recipe,
    calories = total_calories,
    protein_grams = total_protein,
    carb_grams = total_carbs,
    fat_grams = total_fat,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'updated_by', auth.uid(),
      'updated_from', 'nutrition_view'
    ),
    deleted_at = null
  where id = target_recipe_id
    and user_id is null
    and source = 'supplemental_recipe_library'
    and deleted_at is null;

  delete from public.nutrition_recipe_ingredients
  where recipe_id = target_recipe_id;

  for current_ingredient in
    select value from jsonb_array_elements(ingredients_payload)
  loop
    ingredient_position := ingredient_position + 1;

    insert into public.nutrition_recipe_ingredients (
      recipe_id,
      food_id,
      position,
      ingredient_name,
      brand,
      amount,
      unit,
      calories,
      protein_grams,
      carb_grams,
      fat_grams,
      external_source,
      external_id,
      metadata,
      deleted_at
    )
    values (
      target_recipe_id,
      nullif(current_ingredient->>'food_id', '')::uuid,
      coalesce(nullif(current_ingredient->>'position', '')::integer, ingredient_position),
      trim(current_ingredient->>'ingredient_name'),
      nullif(trim(current_ingredient->>'brand'), ''),
      coalesce(nullif(current_ingredient->>'amount', '')::numeric, 1),
      coalesce(nullif(current_ingredient->>'unit', ''), 'serving'),
      coalesce(nullif(current_ingredient->>'calories', '')::numeric, 0),
      coalesce(nullif(current_ingredient->>'protein', '')::numeric, 0),
      coalesce(nullif(current_ingredient->>'carbs', '')::numeric, 0),
      coalesce(nullif(current_ingredient->>'fat', '')::numeric, 0),
      nullif(current_ingredient->>'external_source', ''),
      nullif(current_ingredient->>'external_id', ''),
      coalesce(current_ingredient->'metadata', '{}'::jsonb),
      null
    );
  end loop;

  return target_recipe_id;
end;
$$;

create or replace function public.delete_supplemental_nutrition_recipe(
  target_recipe_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in before deleting shared library recipes.';
  end if;

  if target_recipe_id is null then
    raise exception 'Recipe id is required.';
  end if;

  update public.nutrition_recipes
  set
    deleted_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'deleted_by', auth.uid(),
      'deleted_from', 'nutrition_view'
    )
  where id = target_recipe_id
    and user_id is null
    and source = 'supplemental_recipe_library'
    and deleted_at is null;

  if not found then
    raise exception 'Shared library recipe was not found.';
  end if;

  update public.nutrition_recipe_ingredients
  set deleted_at = now()
  where recipe_id = target_recipe_id
    and deleted_at is null;

  return target_recipe_id;
end;
$$;

create table if not exists public.nutrition_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_date date not null,
  food_id uuid references public.nutrition_foods (id) on delete set null,
  recipe_id uuid references public.nutrition_recipes (id) on delete set null,
  food_name text not null,
  meal text,
  quantity numeric,
  quantity_unit text,
  calories integer,
  protein_grams numeric,
  carb_grams numeric,
  fat_grams numeric,
  source text not null default 'user',
  source_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.nutrition_entries is
  'Daily food log entries. Manual entries can store food_name and macros even when no reusable food exists yet.';

create index if not exists nutrition_entries_user_date_idx
on public.nutrition_entries (user_id, entry_date desc);
create unique index if not exists nutrition_entries_user_source_key_idx
on public.nutrition_entries (user_id, source, source_key);

alter table public.nutrition_entries
add column if not exists recipe_id uuid references public.nutrition_recipes (id) on delete set null;

drop trigger if exists nutrition_entries_set_updated_at on public.nutrition_entries;
create trigger nutrition_entries_set_updated_at
before update on public.nutrition_entries
for each row
execute function public.set_updated_at();

alter table public.nutrition_entries enable row level security;

drop policy if exists "Users can manage their nutrition entries" on public.nutrition_entries;
create policy "Users can manage their nutrition entries"
on public.nutrition_entries
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  measured_on date not null,
  body_weight_value numeric,
  body_weight_unit text not null default 'lb',
  waist_value numeric,
  waist_unit text,
  notes text,
  source text not null default 'user',
  source_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

comment on table public.body_measurements is
  'Daily body measurements. The first UI uses body weight, with room for waist or other measurements later.';

create index if not exists body_measurements_user_measured_on_idx
on public.body_measurements (user_id, measured_on desc);
create unique index if not exists body_measurements_user_source_key_idx
on public.body_measurements (user_id, source, source_key);
create unique index if not exists body_measurements_user_day_idx
on public.body_measurements (user_id, measured_on)
where deleted_at is null;

drop trigger if exists body_measurements_set_updated_at on public.body_measurements;
create trigger body_measurements_set_updated_at
before update on public.body_measurements
for each row
execute function public.set_updated_at();

alter table public.body_measurements enable row level security;

drop policy if exists "Users can manage their body measurements" on public.body_measurements;
create policy "Users can manage their body measurements"
on public.body_measurements
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
