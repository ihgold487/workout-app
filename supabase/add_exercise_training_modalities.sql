-- Adds multi-value training modalities without changing any strength workout,
-- plan, session, or set records. Run in Supabase before deploying the client
-- code that selects exercises.training_modalities.

begin;

alter table public.exercises
add column if not exists training_modalities text[] not null default array['strength']::text[];

alter table public.exercises
drop constraint if exists exercises_training_modalities_check;

alter table public.exercises
add constraint exercises_training_modalities_check check (
  cardinality(training_modalities) > 0
  and training_modalities <@ array['strength', 'cardio', 'conditioning']::text[]
);

-- The existing built-in bike remains otherwise unchanged, including its legacy
-- primary-muscle value of Cardio. Its new behavior is driven only by modality.
update public.exercises
set training_modalities = array['cardio', 'conditioning']::text[]
where user_id is null
  and is_builtin = true
  and source_key = 'history-csv-2026-06-07:cycling-on-stationary-bike-machine';

create index if not exists exercises_training_modalities_idx
on public.exercises using gin (training_modalities);

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
    user_id, name, description, instruction_steps, instruction_source,
    instruction_source_url, image_url, image_storage_path, image_alt,
    equipment, primary_muscle, secondary_muscles, training_modalities,
    bodyweight_load_percent, is_benchmark, benchmark_family_key, is_builtin,
    source, source_key, deleted_at
  )
  values (
    null,
    trim(exercise_payload->>'name'),
    nullif(exercise_payload->>'description', ''),
    coalesce(
      array(select jsonb_array_elements_text(exercise_payload->'instruction_steps')),
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
      array(select jsonb_array_elements_text(exercise_payload->'secondary_muscles')),
      '{}'::text[]
    ),
    coalesce(
      nullif(
        array(
          select value
          from jsonb_array_elements_text(
            coalesce(exercise_payload->'training_modalities', '[]'::jsonb)
          ) as modalities(value)
          where value in ('strength', 'cardio', 'conditioning')
        ),
        '{}'::text[]
      ),
      array['strength']::text[]
    ),
    nullif(exercise_payload->>'bodyweight_load_percent', '')::numeric,
    coalesce((exercise_payload->>'is_benchmark')::boolean, false),
    nullif(exercise_payload->>'benchmark_family_key', ''),
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
    training_modalities = excluded.training_modalities,
    bodyweight_load_percent = excluded.bodyweight_load_percent,
    is_benchmark = excluded.is_benchmark,
    benchmark_family_key = excluded.benchmark_family_key,
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
        array(select jsonb_array_elements_text(exercise_payload->'instruction_steps')),
        '{}'::text[]
      )
      else instruction_steps
    end,
    instruction_source = case
      when exercise_payload ? 'instruction_source'
        then nullif(exercise_payload->>'instruction_source', '')
      else instruction_source
    end,
    instruction_source_url = case
      when exercise_payload ? 'instruction_source_url'
        then nullif(exercise_payload->>'instruction_source_url', '')
      else instruction_source_url
    end,
    image_url = nullif(exercise_payload->>'image_url', ''),
    image_storage_path = nullif(exercise_payload->>'image_storage_path', ''),
    image_alt = nullif(exercise_payload->>'image_alt', ''),
    equipment = nullif(exercise_payload->>'equipment', ''),
    primary_muscle = nullif(exercise_payload->>'primary_muscle', ''),
    secondary_muscles = coalesce(
      array(select jsonb_array_elements_text(exercise_payload->'secondary_muscles')),
      '{}'::text[]
    ),
    training_modalities = case
      when exercise_payload ? 'training_modalities' then coalesce(
        nullif(
          array(
            select value
            from jsonb_array_elements_text(
              coalesce(exercise_payload->'training_modalities', '[]'::jsonb)
            ) as modalities(value)
            where value in ('strength', 'cardio', 'conditioning')
          ),
          '{}'::text[]
        ),
        array['strength']::text[]
      )
      else training_modalities
    end,
    bodyweight_load_percent = nullif(exercise_payload->>'bodyweight_load_percent', '')::numeric,
    is_benchmark = case
      when exercise_payload ? 'is_benchmark'
        then coalesce((exercise_payload->>'is_benchmark')::boolean, false)
      else is_benchmark
    end,
    benchmark_family_key = case
      when exercise_payload ? 'benchmark_family_key'
        then nullif(exercise_payload->>'benchmark_family_key', '')
      else benchmark_family_key
    end,
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

commit;
