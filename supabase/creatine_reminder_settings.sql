-- Run once in the Supabase SQL editor before deploying the corresponding app code.
create table if not exists public.user_creatine_reminder_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  reminder_time time not null default '16:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists user_creatine_reminder_settings_set_updated_at on public.user_creatine_reminder_settings;
create trigger user_creatine_reminder_settings_set_updated_at
before update on public.user_creatine_reminder_settings
for each row
execute function public.set_updated_at();

alter table public.user_creatine_reminder_settings enable row level security;

drop policy if exists "Users can manage their creatine reminder settings" on public.user_creatine_reminder_settings;
create policy "Users can manage their creatine reminder settings"
on public.user_creatine_reminder_settings
for all
using (auth.uid() = user_id and public.is_app_user_approved())
with check (auth.uid() = user_id and public.is_app_user_approved());
