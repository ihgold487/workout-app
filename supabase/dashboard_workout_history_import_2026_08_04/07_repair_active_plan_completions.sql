-- Repair active-plan completion metadata after the 2026-08-04 workout-history import.
--
-- Default mode is DRY RUN. It previews the completion entries that would be
-- stored in training_plans.plan_config.completions for the target user.
--
-- To apply:
--   1. Run with dry_run = true and confirm every desired row matched one
--      existing workout_sessions.source_key.
--   2. Change dry_run to false.
--   3. Run again.
--
-- Scope:
--   - Exactly one active local_app training plan for the target email below.
--   - Weeks 1 and 2: every workout in the active plan.
--   - Week 3: plan days 1 and 2 only.
--   - Updates only training_plans.plan_config completions/currentWeek.

begin;

do $$
declare
  dry_run boolean := true;
  target_email text := 'ihgold@comcast.net';
  target_user_id uuid;
  target_user_count integer;
  active_plan_count integer;
  target_plan record;
  next_completions jsonb;
  missing_count integer;
begin
  select count(*)
  into target_user_count
  from auth.users
  where lower(email) = lower(target_email);

  if target_user_count <> 1 then
    raise exception 'Expected exactly one auth.users row for %, found %.', target_email, target_user_count;
  end if;

  select id
  into target_user_id
  from auth.users
  where lower(email) = lower(target_email)
  limit 1;

  select count(*)
  into active_plan_count
  from public.training_plans plan
  where plan.user_id = target_user_id
    and plan.source = 'local_app'
    and plan.status = 'active'
    and plan.deleted_at is null;

  if active_plan_count <> 1 then
    raise exception 'Expected exactly one active local_app plan, found %.', active_plan_count;
  end if;

  select plan.*
  into target_plan
  from public.training_plans plan
  where plan.user_id = target_user_id
    and plan.source = 'local_app'
    and plan.status = 'active'
    and plan.deleted_at is null
  limit 1;

  create temp table _desired_plan_completions on commit drop as
  with desired_weeks as (
    select 1 as week_number
    union all
    select 2
    union all
    select 3
  ),
  desired_workouts as (
    select
      desired_weeks.week_number,
      plan_workouts.day_number,
      plan_workouts.position,
      plan_workouts.name,
      coalesce(
        plan_workouts.workout_rules->>'planWorkoutId',
        target_plan.source_key || ':workout-' || plan_workouts.position::text
      ) as plan_workout_id
    from desired_weeks
    join public.training_plan_workouts plan_workouts
      on plan_workouts.training_plan_id = target_plan.id
     and plan_workouts.user_id = target_user_id
     and plan_workouts.deleted_at is null
    where desired_weeks.week_number in (1, 2)
       or (
         desired_weeks.week_number = 3
         and coalesce(plan_workouts.day_number, plan_workouts.position) <= 2
       )
  ),
  matched_sessions as (
    select
      desired_workouts.*,
      coalesce(existing_completion.session_id, session_match.source_key) as session_id,
      coalesce(existing_completion.completed_at, session_match.completed_at) as completed_at,
      coalesce(existing_completion.workout_name, session_match.workout_name) as workout_name
    from desired_workouts
    left join lateral (
      select
        completion->>'sessionId' as session_id,
        session.completed_at,
        session.workout_name
      from jsonb_array_elements(coalesce(target_plan.plan_config->'completions', '[]'::jsonb)) completion
      join public.workout_sessions session
        on session.user_id = target_user_id
       and session.source = 'local_app'
       and session.deleted_at is null
       and session.source_key = completion->>'sessionId'
      where completion->>'planWorkoutId' = desired_workouts.plan_workout_id
        and nullif(completion->>'sessionId', '') is not null
        and nullif(completion->>'weekNumber', '')::integer = desired_workouts.week_number
      limit 1
    ) existing_completion on true
    left join lateral (
      select session.source_key, session.completed_at, session.workout_name
      from public.workout_sessions session
      where session.user_id = target_user_id
        and session.source = 'local_app'
        and session.deleted_at is null
        and session.source_key is not null
        and session.workout_name ~* (
          '(^|[^a-z0-9])day[[:space:]]*' ||
          desired_workouts.day_number::text ||
          '([^a-z0-9]|$)'
        )
        and session.workout_name ~* (
          '(^|[^a-z0-9])week[[:space:]]*' ||
          desired_workouts.week_number::text ||
          '([^a-z0-9]|$)'
        )
      order by session.completed_at desc
      limit 1
    ) session_match on true
  )
  select
    week_number,
    day_number,
    position,
    name,
    plan_workout_id,
    session_id,
    completed_at,
    workout_name,
    case when session_id is null then 'missing_history' else 'matched' end as status
  from matched_sessions
  order by week_number, coalesce(day_number, position);

  select count(*)
  into missing_count
  from _desired_plan_completions
  where session_id is null;

  raise notice 'Plan: % (%)', target_plan.name, target_plan.source_key;
  raise notice 'Dry run: %', dry_run;
  raise notice 'Missing desired history matches: %', missing_count;

  if missing_count > 0 and not dry_run then
    raise exception 'Refusing to patch: % desired completion rows did not match history.', missing_count;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'completedAt',
      to_char(completed_at at time zone 'America/Detroit', 'FMMM/FMDD/YYYY'),
      'planWorkoutId',
      plan_workout_id,
      'sessionId',
      session_id,
      'weekNumber',
      week_number
    )
    order by week_number, coalesce(day_number, position)
  )
  into next_completions
  from _desired_plan_completions;

  if dry_run then
    raise notice 'Dry run complete. Review the result set, including any missing_history rows, then set dry_run := false only when every row is matched.';
  else
    update public.training_plans plan
    set
      plan_config =
        jsonb_set(
          jsonb_set(
            coalesce(plan.plan_config, '{}'::jsonb),
            '{completions}',
            coalesce(next_completions, '[]'::jsonb),
            true
          ),
          '{currentWeek}',
          '3'::jsonb,
          true
        ),
      updated_at = now()
    where plan.id = target_plan.id
      and plan.user_id = target_user_id
      and plan.status = 'active'
      and plan.deleted_at is null;

    raise notice 'Applied % completion rows to plan %.', jsonb_array_length(next_completions), target_plan.name;
  end if;
end $$;

select *
from _desired_plan_completions
order by week_number, coalesce(day_number, position);

commit;
