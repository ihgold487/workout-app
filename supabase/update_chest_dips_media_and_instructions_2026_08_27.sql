-- Update the existing normalized built-in Chest Dips exercise.
-- This intentionally matches by normalized name and equipment so it updates
-- the row already created in Supabase instead of inserting another exercise.

do $$
declare
  updated_count integer;
begin
  update public.exercises
  set
    bodyweight_load_percent = 100,
    image_url = 'exercise-media/manual-2026-08-27-chest-dips-bodyweight.webp',
    image_alt = 'Chest Dips bodyweight exercise demonstration',
    instruction_steps = array[
      'Take a firm grip on parallel bars and press to a stable locked-out position.',
      'Incline your torso forward roughly 30 degrees to emphasize the chest.',
      'Cross your ankles behind you and keep a slight bend in your knees.',
      'Bend your elbows and lower under control, allowing them to travel slightly outward.',
      'Descend only as far as you can while maintaining control and feeling a comfortable chest stretch.',
      'Press through the bars to return to the top while keeping the forward torso angle.',
      'Maintain the forward lean throughout each repetition instead of becoming upright.'
    ],
    instruction_source = 'Lift Manual',
    instruction_source_url = 'https://liftmanual.com/chest-dip/',
    updated_at = now()
  where lower(trim(name)) = 'chest dips'
    and lower(trim(equipment)) = 'bodyweight';

  get diagnostics updated_count = row_count;

  if updated_count = 0 then
    raise exception 'No existing Bodyweight Chest Dips exercise was found.';
  end if;
end $$;
