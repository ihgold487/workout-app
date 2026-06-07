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
