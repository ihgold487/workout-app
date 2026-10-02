-- Run this once against an existing Supabase project before syncing target
-- selection snapshots from the app.
alter table public.session_sets
add column if not exists suggested_target_weight_value numeric,
add column if not exists suggested_target_weight_label text,
add column if not exists suggested_target_reps integer,
add column if not exists suggested_target_rir integer,
add column if not exists suggested_target_rir_label text,
add column if not exists suggested_target_e1rm numeric,
add column if not exists selected_target_weight_value numeric,
add column if not exists selected_target_weight_label text,
add column if not exists selected_target_reps integer,
add column if not exists selected_target_rir integer,
add column if not exists selected_target_rir_label text,
add column if not exists selected_target_e1rm numeric,
add column if not exists target_selection_source text,
add column if not exists selected_vs_suggested_e1rm_pct numeric;

comment on column public.session_sets.target_selection_source is
  'Explicit target choice source: suggested or alternative. Null means no explicit choice was recorded.';
