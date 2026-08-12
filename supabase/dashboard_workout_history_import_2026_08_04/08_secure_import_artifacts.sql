-- Secure leftover public import artifacts from the 2026-08-04 workout-history import.
--
-- Default mode is DRY RUN. It previews only the known staging/backup tables
-- created for the import.
--
-- To apply the non-destructive fix:
--   1. Run with dry_run = true and confirm the listed tables are import artifacts.
--   2. Change dry_run to false and leave drop_artifacts = false.
--   3. Run again. This enables RLS with no client-access policies.
--
-- To delete the artifacts instead:
--   1. Confirm the import no longer needs rollback from these backup tables.
--   2. Change dry_run to false and drop_artifacts to true.
--   3. Run again.
--
-- Scope:
--   - Only known public staging/backup tables from the 2026-08-04 import.
--   - Does not modify app tables, app data, policies, or auth users.

begin;

do $$
declare
  dry_run boolean := true;
  drop_artifacts boolean := false;
  artifact_name text;
  artifact_table regclass;
  artifact_row_count bigint;
  artifact_rls_enabled boolean;
  artifact_names text[] := array[
    'public.history_import_20260804_sets',
    'public.history_import_20260804_exercises',
    'public.history_import_20260804_workouts',
    'public.session_sets_backup_20260804_workout_history_import',
    'public.session_exercises_backup_20260804_workout_history_import',
    'public.workout_sessions_backup_20260804_workout_history_import'
  ];
begin
  create temp table _import_artifact_security_preview (
    table_name text not null,
    table_exists boolean not null,
    rls_enabled boolean,
    row_count bigint,
    action text not null
  ) on commit drop;

  foreach artifact_name in array artifact_names loop
    artifact_table := to_regclass(artifact_name);

    if artifact_table is null then
      insert into _import_artifact_security_preview (
        table_name,
        table_exists,
        rls_enabled,
        row_count,
        action
      )
      values (
        artifact_name,
        false,
        null,
        null,
        'missing'
      );

      continue;
    end if;

    execute format('select count(*) from %s', artifact_table)
    into artifact_row_count;

    select relrowsecurity
    into artifact_rls_enabled
    from pg_class
    where oid = artifact_table;

    if dry_run then
      insert into _import_artifact_security_preview (
        table_name,
        table_exists,
        rls_enabled,
        row_count,
        action
      )
      values (
        artifact_name,
        true,
        artifact_rls_enabled,
        artifact_row_count,
        case
          when drop_artifacts then 'would_drop'
          when artifact_rls_enabled then 'already_rls_enabled'
          else 'would_enable_rls'
        end
      );
    elsif drop_artifacts then
      execute format('drop table if exists %s', artifact_table);

      insert into _import_artifact_security_preview (
        table_name,
        table_exists,
        rls_enabled,
        row_count,
        action
      )
      values (
        artifact_name,
        true,
        artifact_rls_enabled,
        artifact_row_count,
        'dropped'
      );
    else
      if not artifact_rls_enabled then
        execute format('alter table %s enable row level security', artifact_table);
      end if;

      insert into _import_artifact_security_preview (
        table_name,
        table_exists,
        rls_enabled,
        row_count,
        action
      )
      values (
        artifact_name,
        true,
        true,
        artifact_row_count,
        case
          when artifact_rls_enabled then 'already_rls_enabled'
          else 'enabled_rls'
        end
      );
    end if;
  end loop;
end $$;

select *
from _import_artifact_security_preview
order by table_name;

commit;
