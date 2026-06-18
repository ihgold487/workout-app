-- Adds the 2026-06-17 built-in exercise additions.
-- Run after schema.sql. This is idempotent and does not remove existing rows.

begin;

insert into public.exercises (
  user_id,
  name,
  description,
  image_url,
  image_storage_path,
  image_alt,
  equipment,
  primary_muscle,
  secondary_muscles,
  is_builtin,
  source,
  source_key
)
values
  (null, 'Sumo Goblet Squats', null, 'exercise-media/manual-2026-06-17-sumo-goblet-squats-dumbbells.gif', null, 'Sumo Goblet Squats Dumbbells exercise demonstration', 'Dumbbells', 'Quads', array['Glutes', 'Hamstrings', 'Abductors', 'Adductors', 'Calves', 'Lower Back', 'Abs', 'Upper Back', 'Traps', 'Front Delts', 'Forearms'], true, 'curated_exercise_library_v1', 'manual-2026-06-17:sumo-goblet-squats-dumbbells'),
  (null, 'Goblet Squat 2 Sec Hold', null, 'exercise-media/manual-2026-06-17-goblet-squat-2-sec-hold-dumbbells.webp', null, 'Goblet Squat 2 Sec Hold Dumbbells exercise demonstration', 'Dumbbells', 'Quads', array['Glutes', 'Hamstrings', 'Abductors', 'Adductors', 'Calves', 'Lower Back', 'Abs', 'Upper Back', 'Traps', 'Front Delts', 'Forearms'], true, 'curated_exercise_library_v1', 'manual-2026-06-17:goblet-squat-2-sec-hold-dumbbells'),
  (null, 'Goblet Split Squat', null, 'exercise-media/manual-2026-06-17-goblet-split-squat-dumbbells.webp', null, 'Goblet Split Squat Dumbbells exercise demonstration', 'Dumbbells', 'Glutes', array['Quads', 'Hamstrings', 'Abductors', 'Adductors', 'Calves', 'Lower Back', 'Abs', 'Forearms'], true, 'curated_exercise_library_v1', 'manual-2026-06-17:goblet-split-squat-dumbbells'),
  (null, 'Goblet Squat Jump', null, 'exercise-media/manual-2026-06-17-goblet-squat-jump-dumbbells.webp', null, 'Goblet Squat Jump Dumbbells exercise demonstration', 'Dumbbells', 'Quads', array['Glutes', 'Hamstrings', 'Abductors', 'Adductors', 'Calves', 'Lower Back', 'Abs', 'Upper Back', 'Traps', 'Front Delts', 'Forearms'], true, 'curated_exercise_library_v1', 'manual-2026-06-17:goblet-squat-jump-dumbbells'),
  (null, 'Landmine Press', null, 'exercise-media/manual-2026-06-17-landmine-press-landmine.webp', null, 'Landmine Press Landmine exercise demonstration', 'Landmine', 'Front Delts', array['Side Delts', 'Upper Chest', 'Triceps', 'Traps', 'Abs', 'Forearms'], true, 'curated_exercise_library_v1', 'manual-2026-06-17:landmine-press-landmine'),
  (null, 'Landmine Single Arm Press', null, 'exercise-media/manual-2026-06-17-landmine-single-arm-press-landmine.webp', null, 'Landmine Single Arm Press Landmine exercise demonstration', 'Landmine', 'Front Delts', array['Side Delts', 'Upper Chest', 'Triceps', 'Traps', 'Abs', 'Forearms'], true, 'curated_exercise_library_v1', 'manual-2026-06-17:landmine-single-arm-press-landmine'),
  (null, 'Landmine Front Squat', null, 'exercise-media/manual-2026-06-17-landmine-front-squat-landmine.webp', null, 'Landmine Front Squat Landmine exercise demonstration', 'Landmine', 'Quads', array['Glutes', 'Hamstrings', 'Abductors', 'Adductors', 'Calves', 'Lower Back', 'Abs', 'Upper Back', 'Traps', 'Front Delts'], true, 'curated_exercise_library_v1', 'manual-2026-06-17:landmine-front-squat-landmine')
on conflict (source, source_key) where user_id is null
do update set
  name = excluded.name,
  description = excluded.description,
  image_url = excluded.image_url,
  image_storage_path = excluded.image_storage_path,
  image_alt = excluded.image_alt,
  equipment = excluded.equipment,
  primary_muscle = excluded.primary_muscle,
  secondary_muscles = excluded.secondary_muscles,
  is_builtin = true,
  updated_at = now(),
  deleted_at = null;

commit;
