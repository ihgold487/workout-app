-- Aligns the persistent display name with the bundled exercise seed while
-- retaining the stable history-derived source key. The production record was
-- already renamed through the app; this migration documents the change for
-- other environments.

begin;

update public.exercises
set
  name = 'Stationary Bike',
  image_alt = 'Stationary Bike exercise demonstration'
where user_id is null
  and is_builtin = true
  and deleted_at is null
  and source_key = 'history-csv-2026-06-07:cycling-on-stationary-bike-machine';

commit;
