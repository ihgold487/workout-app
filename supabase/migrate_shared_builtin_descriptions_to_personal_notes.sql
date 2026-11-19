-- Run this once in the Supabase SQL editor before deploying the matching app code.
-- The matching app code invokes the installed function while the trainer admin
-- is signed in. It moves every shared built-in description into that user's
-- private exercise notes, then clears the shared copies.

drop function if exists public.get_trainer_user_exercise_preferences(uuid);

create function public.get_trainer_user_exercise_preferences(target_user_id uuid)
returns table (
  exercise_id uuid,
  is_favorite boolean,
  include_in_plans boolean,
  exclude_from_plans boolean,
  preferred_equipment text,
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
    uep.metadata
  from public.user_exercise_preferences uep
  where uep.user_id = target_user_id
    and public.can_train_user(target_user_id);
$$;

create or replace function public.migrate_shared_builtin_descriptions_to_personal_notes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  migrated_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Sign in before migrating exercise notes.';
  end if;

  if not exists (
    select 1
    from public.trainer_admins ta
    where ta.trainer_user_id = auth.uid()
  ) then
    raise exception 'Not authorized to migrate shared exercise descriptions.';
  end if;

  with moved_notes as (
    insert into public.user_exercise_preferences (
      user_id,
      exercise_id,
      notes
    )
    select
      auth.uid(),
      e.id,
      trim(e.description)
    from public.exercises e
    where e.is_builtin = true
      and e.user_id is null
      and nullif(trim(e.description), '') is not null
    on conflict (user_id, exercise_id)
    do update set
      notes = case
        when nullif(trim(user_exercise_preferences.notes), '') is null
          then excluded.notes
        when user_exercise_preferences.notes = excluded.notes
          then user_exercise_preferences.notes
        else user_exercise_preferences.notes || E'\n\n' || excluded.notes
      end,
      updated_at = now()
  ), cleared_descriptions as (
    update public.exercises e
    set description = null
    where e.is_builtin = true
      and e.user_id is null
      and nullif(trim(e.description), '') is not null
    returning e.id
  )
  select count(*) into migrated_count
  from cleared_descriptions;

  return migrated_count;
end;
$$;
