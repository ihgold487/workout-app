# Persistence Roadmap

This document is the working contract for moving the app from local-first/manual
sync to durable per-user cloud persistence.

## Current State

- IndexedDB `appData` is the daily local source of truth for workout data.
- Manual JSON export/import is the safest complete user-controlled backup.
- Manual cloud snapshot upload/download stores the same full app data in
  `public.workout_data_snapshots`.
- Normalized Supabase upload exists for parts of the workout model:
  custom exercises, planned workouts, and workout history.
- Normalized Supabase download/hydration is not yet the normal app path.
- Nutrition and body weight UI currently persist locally with `localStorage`,
  even though normalized Supabase tables already exist for nutrition entries,
  foods, daily targets, and body measurements.

## Target State

- Supabase normalized tables are the durable per-user source of truth.
- IndexedDB remains the fast offline cache used by the app while training.
- The app can hydrate from Supabase whenever a valid user session is available:
  after first sign-in, on app open, after a hard quit/reopen, and on resume.
- Local edits are saved immediately, then synced to Supabase automatically when
  signed in and online.
- Snapshot backup remains as a temporary recovery mechanism during migration,
  not the main sync path.
- Global JSON export/import is temporary migration safety tooling. The long-term
  product should rely on automatic local saves plus automatic database sync.
- Future export features, if needed, should be record/report exports such as
  workout history, exercise history, nutrition logs, or chart data. They should
  not require a matching global import path.

## Data Contract

Every persisted domain must have:

- local IndexedDB representation
- normalized Supabase representation
- upload mapping
- download mapping
- soft-delete behavior where applicable
- round-trip verification
- backup/export coverage

### Domains

| Domain | Local state today | Cloud schema today | Status |
| --- | --- | --- | --- |
| Built-in exercise library | Seed file plus merged local status | `exercises` with `user_id is null` | Needs seeded-library update path |
| User exercise preferences | Embedded in local exercise objects | `user_exercise_preferences` | Needs full mapping |
| Custom exercises | `exerciseLibrary` | `exercises` | Upload exists; download needed |
| Workout templates | `templates` | `workouts`, `workout_exercises`, `workout_exercise_sets` | Upload exists; download needed |
| Active workout sessions | `sessions` | Not fully modeled as in-progress sessions | Needs decision |
| Completed workout history | `history` | `workout_sessions`, `session_exercises`, `session_sets` | Upload exists; download needed |
| Training plans | `plans` | `training_plans`, `training_plan_workouts` | High-priority gap |
| Plan progress | `plans[].status/currentWeek/completions` | Partly possible via `training_plans.plan_config` or new columns | Needs mapping |
| Nutrition entries | `localStorage` | `nutrition_entries` | Needs migration |
| Nutrition foods | USDA search/form state, not durable library yet | `nutrition_foods` | Needs mapping |
| Nutrition daily targets | Not fully built | `nutrition_daily_targets` | Future |
| Body weight | `localStorage` | `body_measurements` | Needs migration |
| App settings/preferences | Mixed local state | no dedicated table | Needs inventory |

## Implementation Phases

### Phase 1: Audit And Safety Net

- Keep IndexedDB snapshot persistence unchanged.
- Keep manual JSON export/import.
- Keep cloud snapshot upload/download.
- Add or maintain a data audit checklist that compares local data categories
  with normalized cloud categories.

Test:

- Export JSON backup before each persistence change.
- Import that backup into the same device and verify counts.
- Upload/download snapshot and verify templates, plans, history, exercises, and
  active exercise status survive.

### Phase 2: Exercise Library And Preferences

- Treat built-in exercises as seed/global data.
- Treat user active/inactive state as per-user preferences.
- Add newly seeded exercises without overwriting user choices.
- Download normalized custom exercises and preferences into IndexedDB.

Initial implementation checkpoint:

- Manual upload exists for custom exercise rows.
- Manual upload exists for user exercise preferences, mapping local
  active/inactive state to `include_in_plans` and `exclude_from_plans`.
- Manual download exists for exercise library metadata and user exercise
  preferences, preserving local exercise ids while applying cloud active/inactive
  status and adding missing custom exercises.
- Persistence Audit shows normalized `user_exercise_preferences` row counts.
- Automatic startup/resume sync remains pending.

Test:

- Add a new built-in exercise and verify it appears for a signed-in user.
- Mark an exercise inactive, sync, sign in on another device, verify inactive.
- Add a custom exercise, sync, download on another device, verify it appears.

### Phase 3: Workout Templates

- Complete normalized download for `workouts`, `workout_exercises`, and
  `workout_exercise_sets`.
- Preserve exercise snapshots on workout exercises.
- Preserve superset groups, exercise order, target values, and deleted rows.

Initial implementation checkpoint:

- Manual upload exists for workouts, workout exercises, and workout exercise
  sets.
- Manual download exists for workouts, workout exercises, and workout exercise
  sets.
- Manual download preserves existing local-only template fields when a local
  template with the same source key exists.
- Manual download keeps local-only workouts during this testing phase instead of
  deleting them.
- Automatic startup/resume sync and conflict handling remain pending.

Test:

- Create/edit/delete a workout on device A.
- Sync and hydrate device B.
- Verify names, order, supersets, sets, targets, and deleted workouts.

### Phase 4: Completed Workout History

- Complete normalized download for completed sessions and sets.
- Preserve actual weight, reps, RIR, e1RM, completed dates, and exercise
  snapshots.
- Keep history append-friendly and soft-delete-aware.

Initial implementation checkpoint:

- Manual upload exists for completed workout sessions, session exercises, and
  session sets.
- Manual download exists for completed workout sessions, session exercises, and
  session sets.
- Manual download preserves actual values, target values, completed set state,
  exercise snapshots, and planned workout links where the source workout still
  exists locally.
- Manual download keeps local-only completed workouts during this testing phase
  instead of deleting them.
- Automatic startup/resume sync and conflict handling remain pending.

Test:

- Complete a workout on device A.
- Sync and hydrate device B.
- Verify exercise history, e1RM charts, and target recommendations use it.

### Phase 5: Training Plans

- Map `plans` to `training_plans`.
- Map plan workout membership to `training_plan_workouts`.
- Preserve active/inactive/completed status, current week, duration, days per
  week, goal, plan config, completions, and linked workout/template ids.

Initial implementation checkpoint:

- Manual upload exists for training plans and ordered plan workout membership.
- Manual upload refreshes normalized workout rows first so plan workouts can
  link to their generated workout templates.
- Manual download exists for training plans and plan workouts.
- Plan generator metadata, goal, current week, completions, and user-facing
  status are stored in `training_plans.plan_config` or first-class plan
  columns.
- Manual download keeps local-only plans during this testing phase instead of
  deleting them.
- Automatic startup/resume sync and conflict handling remain pending.

Test:

- Create a plan, make it active, complete one workout, sync.
- Hydrate another device and verify current week, completed workout indicator,
  plan status, and child workouts.
- Complete final week and verify completed plan state survives sync.

### Phase 6: Nutrition And Body Weight

- Move nutrition entries and body weight out of `localStorage`.
- Store food entries in `nutrition_entries`.
- Store body weight in `body_measurements`.
- Optionally save reusable foods or USDA-backed foods in `nutrition_foods`.

Test:

- Add food and weight on device A.
- Sync and hydrate device B.
- Verify daily totals, macros, weight history, and future charts.

### Phase 7: Automatic Sync

- On first sign-in: hydrate IndexedDB from normalized Supabase.
- On app open, hard quit/reopen, and resume with an existing session: pull latest
  changes.
- On meaningful edits: debounce and push.
- On workout completion: push immediately if online.
- If offline: queue changes and sync later.

Test:

- Make edits offline, close app, reopen, verify local data remains.
- Reconnect and verify cloud receives changes.
- Sign in on another device and verify changes appear.

## Settings UX End State

Settings should eventually show:

- signed-in user
- last normalized sync time
- sync status
- sync now
- optional export tools for specific records or history reports

Manual "upload to cloud", "download from cloud", global JSON export/import, and
snapshot restore should be removed or hidden once normalized automatic sync is
proven. During migration, they remain useful as safety rails.
