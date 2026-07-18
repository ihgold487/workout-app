begin;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.app_user_approvals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  status text not null default 'pending',
  approved_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null,
  denied_at timestamptz,
  denied_by uuid references auth.users (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_user_approvals_status_check
    check (status in ('pending', 'approved', 'denied'))
);

drop trigger if exists app_user_approvals_set_updated_at on public.app_user_approvals;
create trigger app_user_approvals_set_updated_at
before update on public.app_user_approvals
for each row
execute function public.set_updated_at();

create or replace function public.is_app_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users au
    where au.id = auth.uid()
      and lower(au.email) = 'ihgold@comcast.net'
  );
$$;

create or replace function public.is_app_user_approved(
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users au
    left join public.app_user_approvals aua
      on aua.user_id = au.id
    where au.id = target_user_id
      and (
        lower(au.email) = 'ihgold@comcast.net'
        or aua.status = 'approved'
      )
  );
$$;

alter table public.app_user_approvals enable row level security;

drop policy if exists "Users can read their approval status" on public.app_user_approvals;
create policy "Users can read their approval status"
on public.app_user_approvals
for select
using (auth.uid() = user_id);

drop policy if exists "App owner can manage user approvals" on public.app_user_approvals;
create policy "App owner can manage user approvals"
on public.app_user_approvals
for all
using (public.is_app_owner())
with check (public.is_app_owner());

create or replace function public.get_my_app_approval_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  current_status text;
begin
  if current_user_id is null then
    raise exception 'Not signed in.';
  end if;

  select au.email
  into current_email
  from auth.users au
  where au.id = current_user_id;

  if lower(coalesce(current_email, '')) = 'ihgold@comcast.net' then
    current_status := 'approved';
  else
    select aua.status
    into current_status
    from public.app_user_approvals aua
    where aua.user_id = current_user_id;
  end if;

  return jsonb_build_object(
    'user_id', current_user_id,
    'email', current_email,
    'status', coalesce(current_status, 'pending')
  );
end;
$$;

create or replace function public.list_app_user_approvals()
returns table (
  user_id uuid,
  email text,
  status text,
  approved_at timestamptz,
  denied_at timestamptz,
  notes text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_app_owner() then
    raise exception 'Not authorized to manage app approvals.';
  end if;

  return query
  select
    aua.user_id,
    aua.email,
    case
      when lower(aua.email) = 'ihgold@comcast.net' then 'approved'
      else aua.status
    end as status,
    aua.approved_at,
    aua.denied_at,
    aua.notes,
    aua.created_at,
    aua.updated_at
  from public.app_user_approvals aua
  order by
    case aua.status
      when 'pending' then 0
      when 'approved' then 1
      else 2
    end,
    aua.created_at desc;
end;
$$;

create or replace function public.update_app_user_approval(
  target_user_id uuid,
  next_status text,
  approval_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_app_owner() then
    raise exception 'Not authorized to manage app approvals.';
  end if;

  if next_status not in ('pending', 'approved', 'denied') then
    raise exception 'Invalid approval status.';
  end if;

  update public.app_user_approvals
  set
    status = next_status,
    approved_at = case when next_status = 'approved' then now() else null end,
    approved_by = case when next_status = 'approved' then auth.uid() else null end,
    denied_at = case when next_status = 'denied' then now() else null end,
    denied_by = case when next_status = 'denied' then auth.uid() else null end,
    notes = approval_notes
  where user_id = target_user_id;

  if not found then
    raise exception 'Approval row not found.';
  end if;
end;
$$;

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

  insert into public.app_user_approvals (
    user_id,
    email,
    status,
    approved_at
  )
  values (
    new.id,
    new.email,
    case when lower(coalesce(new.email, '')) = 'ihgold@comcast.net' then 'approved' else 'pending' end,
    case when lower(coalesce(new.email, '')) = 'ihgold@comcast.net' then now() else null end
  )
  on conflict (user_id) do update set
    email = excluded.email;

  return new;
end;
$$;

drop trigger if exists auth_users_create_profile on auth.users;
create trigger auth_users_create_profile
after insert on auth.users
for each row
execute function public.create_profile_for_auth_user();

insert into public.app_user_approvals (
  user_id,
  email,
  status,
  approved_at
)
select
  au.id,
  au.email,
  case when lower(coalesce(au.email, '')) = 'ihgold@comcast.net' then 'approved' else 'pending' end,
  case when lower(coalesce(au.email, '')) = 'ihgold@comcast.net' then now() else null end
from auth.users au
on conflict (user_id) do update set
  email = excluded.email;

create or replace function public.can_train_user(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_app_user_approved(auth.uid())
    and public.is_app_user_approved(target_user_id)
    and (
      target_user_id = auth.uid()
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
      )
    );
$$;

drop policy if exists "Users can read their workout snapshot" on public.workout_data_snapshots;
create policy "Users can read their workout snapshot"
on public.workout_data_snapshots
for select
using (auth.uid() = user_id and public.is_app_user_approved());

drop policy if exists "Users can insert their workout snapshot" on public.workout_data_snapshots;
create policy "Users can insert their workout snapshot"
on public.workout_data_snapshots
for insert
with check (auth.uid() = user_id and public.is_app_user_approved());

drop policy if exists "Users can update their workout snapshot" on public.workout_data_snapshots;
create policy "Users can update their workout snapshot"
on public.workout_data_snapshots
for update
using (auth.uid() = user_id and public.is_app_user_approved())
with check (auth.uid() = user_id and public.is_app_user_approved());

drop policy if exists "Users can delete their workout snapshot" on public.workout_data_snapshots;
create policy "Users can delete their workout snapshot"
on public.workout_data_snapshots
for delete
using (auth.uid() = user_id and public.is_app_user_approved());

drop policy if exists "Users can read built-in and own exercises" on public.exercises;
create policy "Users can read built-in and own exercises"
on public.exercises
for select
using (public.is_app_user_approved() and (user_id is null or auth.uid() = user_id));

drop policy if exists "Users can insert custom exercises" on public.exercises;
create policy "Users can insert custom exercises"
on public.exercises
for insert
with check (public.is_app_user_approved() and auth.uid() = user_id and is_builtin = false);

drop policy if exists "Users can update custom exercises" on public.exercises;
create policy "Users can update custom exercises"
on public.exercises
for update
using (public.is_app_user_approved() and auth.uid() = user_id and is_builtin = false)
with check (public.is_app_user_approved() and auth.uid() = user_id and is_builtin = false);

drop policy if exists "Users can delete custom exercises" on public.exercises;
create policy "Users can delete custom exercises"
on public.exercises
for delete
using (public.is_app_user_approved() and auth.uid() = user_id and is_builtin = false);

drop policy if exists "Users can manage their exercise preferences" on public.user_exercise_preferences;
create policy "Users can manage their exercise preferences"
on public.user_exercise_preferences
for all
using (auth.uid() = user_id and public.is_app_user_approved())
with check (auth.uid() = user_id and public.is_app_user_approved());

drop policy if exists "Users can manage their workouts" on public.workouts;
create policy "Users can manage their workouts"
on public.workouts
for all
using (auth.uid() = user_id and public.is_app_user_approved())
with check (auth.uid() = user_id and public.is_app_user_approved());

drop policy if exists "Users can manage their workout exercises" on public.workout_exercises;
create policy "Users can manage their workout exercises"
on public.workout_exercises
for all
using (auth.uid() = user_id and public.is_app_user_approved())
with check (auth.uid() = user_id and public.is_app_user_approved());

drop policy if exists "Users can manage their workout exercise sets" on public.workout_exercise_sets;
create policy "Users can manage their workout exercise sets"
on public.workout_exercise_sets
for all
using (auth.uid() = user_id and public.is_app_user_approved())
with check (auth.uid() = user_id and public.is_app_user_approved());

drop policy if exists "Users can manage their import batches" on public.import_batches;
create policy "Users can manage their import batches"
on public.import_batches
for all
using (auth.uid() = user_id and public.is_app_user_approved())
with check (auth.uid() = user_id and public.is_app_user_approved());

drop policy if exists "Users can manage their workout sessions" on public.workout_sessions;
create policy "Users can manage their workout sessions"
on public.workout_sessions
for all
using (auth.uid() = user_id and public.is_app_user_approved())
with check (auth.uid() = user_id and public.is_app_user_approved());

drop policy if exists "Users can manage their session exercises" on public.session_exercises;
create policy "Users can manage their session exercises"
on public.session_exercises
for all
using (auth.uid() = user_id and public.is_app_user_approved())
with check (auth.uid() = user_id and public.is_app_user_approved());

drop policy if exists "Users can manage their session sets" on public.session_sets;
create policy "Users can manage their session sets"
on public.session_sets
for all
using (auth.uid() = user_id and public.is_app_user_approved())
with check (auth.uid() = user_id and public.is_app_user_approved());

drop policy if exists "Users can manage their training plans" on public.training_plans;
create policy "Users can manage their training plans"
on public.training_plans
for all
using (auth.uid() = user_id and public.is_app_user_approved())
with check (auth.uid() = user_id and public.is_app_user_approved());

drop policy if exists "Users can manage their training plan workouts" on public.training_plan_workouts;
create policy "Users can manage their training plan workouts"
on public.training_plan_workouts
for all
using (auth.uid() = user_id and public.is_app_user_approved())
with check (auth.uid() = user_id and public.is_app_user_approved());

drop policy if exists "Users can manage their nutrition targets" on public.nutrition_daily_targets;
create policy "Users can manage their nutrition targets"
on public.nutrition_daily_targets
for all
using (auth.uid() = user_id and public.is_app_user_approved())
with check (auth.uid() = user_id and public.is_app_user_approved());

drop policy if exists "Users can read public and own nutrition foods" on public.nutrition_foods;
create policy "Users can read public and own nutrition foods"
on public.nutrition_foods
for select
using (public.is_app_user_approved() and (user_id is null or auth.uid() = user_id));

drop policy if exists "Users can insert custom nutrition foods" on public.nutrition_foods;
create policy "Users can insert custom nutrition foods"
on public.nutrition_foods
for insert
with check (public.is_app_user_approved() and auth.uid() = user_id and source = 'user');

drop policy if exists "Users can update custom nutrition foods" on public.nutrition_foods;
create policy "Users can update custom nutrition foods"
on public.nutrition_foods
for update
using (public.is_app_user_approved() and auth.uid() = user_id and source = 'user')
with check (public.is_app_user_approved() and auth.uid() = user_id and source = 'user');

drop policy if exists "Users can delete custom nutrition foods" on public.nutrition_foods;
create policy "Users can delete custom nutrition foods"
on public.nutrition_foods
for delete
using (public.is_app_user_approved() and auth.uid() = user_id and source = 'user');

drop policy if exists "Users can read public and own nutrition recipes" on public.nutrition_recipes;
create policy "Users can read public and own nutrition recipes"
on public.nutrition_recipes
for select
using (public.is_app_user_approved() and (user_id is null or auth.uid() = user_id));

drop policy if exists "Users can insert custom nutrition recipes" on public.nutrition_recipes;
create policy "Users can insert custom nutrition recipes"
on public.nutrition_recipes
for insert
with check (public.is_app_user_approved() and auth.uid() = user_id and source = 'user');

drop policy if exists "Users can update custom nutrition recipes" on public.nutrition_recipes;
create policy "Users can update custom nutrition recipes"
on public.nutrition_recipes
for update
using (public.is_app_user_approved() and auth.uid() = user_id and source = 'user')
with check (public.is_app_user_approved() and auth.uid() = user_id and source = 'user');

drop policy if exists "Users can delete custom nutrition recipes" on public.nutrition_recipes;
create policy "Users can delete custom nutrition recipes"
on public.nutrition_recipes
for delete
using (public.is_app_user_approved() and auth.uid() = user_id and source = 'user');

drop policy if exists "Users can read public and own recipe ingredients" on public.nutrition_recipe_ingredients;
create policy "Users can read public and own recipe ingredients"
on public.nutrition_recipe_ingredients
for select
using (
  public.is_app_user_approved()
  and exists (
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
  public.is_app_user_approved()
  and exists (
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
  public.is_app_user_approved()
  and exists (
    select 1
    from public.nutrition_recipes nr
    where nr.id = recipe_id
      and auth.uid() = nr.user_id
      and nr.source = 'user'
  )
)
with check (
  public.is_app_user_approved()
  and exists (
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
  public.is_app_user_approved()
  and exists (
    select 1
    from public.nutrition_recipes nr
    where nr.id = recipe_id
      and auth.uid() = nr.user_id
      and nr.source = 'user'
  )
);

drop policy if exists "Users can manage their nutrition entries" on public.nutrition_entries;
create policy "Users can manage their nutrition entries"
on public.nutrition_entries
for all
using (auth.uid() = user_id and public.is_app_user_approved())
with check (auth.uid() = user_id and public.is_app_user_approved());

drop policy if exists "Users can manage their body measurements" on public.body_measurements;
create policy "Users can manage their body measurements"
on public.body_measurements
for all
using (auth.uid() = user_id and public.is_app_user_approved())
with check (auth.uid() = user_id and public.is_app_user_approved());

commit;
