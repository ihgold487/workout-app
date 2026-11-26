# Cardio and conditioning workouts: initial design notes

## Status and design boundary

Exercise modalities now distinguish `strength`, `cardio`, and `conditioning`.
Existing strength workouts, plans, templates, sessions, and set persistence are
unchanged: exercises without an explicit modality remain strength exercises,
and the current strength flows select only exercises with `strength`.

This proposal adds a new **standalone cardio-workout** path, entered from the
existing Plans-page `+ New plan` flow by choosing `Create → Cardio workout`.
The Plans page is only the current launcher for creating workouts; a cardio
workout is not a strength plan, has no plan lifecycle, and is not a change to
the current strength-workout types. It does not add nullable cardio fields to
strength sessions or strength sets.

The initial scope is deliberately narrow:

- A cardio workout has exactly one associated exercise.
- It uses an exercise with the `cardio` modality (for example, Biking,
  Jogging, or Treadmill).
- It has one format: **Steady state** or **HIIT**.
- A saved workout is a reusable template shown on Home; completing it creates
  a separate cardio-specific log with manually entered reference metadata.

There are no progression rules, goals, compliance checks, or required actual
performance values beyond identifying the completed workout. A workout may be
repeated, but each instance remains independent.

An exercise may also have `conditioning`, which keeps it eligible for future
circuit and mixed-workout features. A conditioning-only exercise should not be
forced into the initial single-exercise cardio logger; it will need a separate
circuit/reps/rest model later.

## Key terminology

Keep these concepts distinct:

| Concept | Meaning | Example |
|---|---|---|
| Exercise modality | Where an exercise is eligible to appear | Treadmill is `cardio` and `conditioning` |
| Workout format | How a cardio workout is configured | Steady state or HIIT |
| Template | A reusable saved standalone cardio workout | Bike HIIT or Treadmill 3/12/20 |
| Configuration | Optional reference details selected before it is performed | 10 rounds of 60s work / 90s recovery |
| Completed log | A completed workout plus optional observed metadata | 28:41, 3.0 miles, 5.9 mph average |
| Metric | A measurable reference value | Duration, distance, speed, power, incline |
| Context | Where/how it happened | Indoor/outdoor, terrain, device source, notes |

For example, a Treadmill exercise can be both cardio and conditioning. One
logged session might be indoor steady state; another might be interval-based.
Neither choice should require creating a separate Treadmill exercise.

## Proposed first user flow

1. On the Plans page, the user taps `+ New plan` and chooses `Create →
   Workout`.
2. The existing strength workout choices remain unchanged. A new **Cardio**
   category offers **Steady state** and **HIIT**.
3. The user chooses one active exercise with the `cardio` modality.
4. The format-specific form captures an optional structured prescription and
   saves a reusable template. It shows a live timeline or target plot while
   the workout is being edited.
5. The template appears on Home, where the user can start it any time.
6. When the workout is completed, the user may enter whatever reference
   metadata is available. Nothing is evaluated as pass/fail against the
   configuration.

The Plans page is an acceptable entry point because it already creates a
workout. The new UI should nevertheless call the result a **cardio workout**,
not a strength plan, so the user is not led to expect it to have a multi-week
plan or progression lifecycle.

## First implementation: optional configuration and logs

### Structured phases and calculated duration

Each template is edited as a compact sequence of optional phases:

```text
Warm-up → Working interval → Recovery → … → Cool-down
```

Steady state is the same model with one working interval and no recovery.
HIIT repeats one work/recovery pair. The editor calculates the total rather
than storing an independently editable total duration:

```text
warm-up + (rounds × (work + recovery)) + cool-down
```

Every HIIT round is a complete work/recovery pair, including the final round's
recovery before cool-down. All phase durations remain optional reference
values; the exercise and format are still the only inputs needed to save a
template.

### Steady state

Steady-state configuration is for reference only. A calculated duration is
useful to display while performing the workout, but it is not a goal and
completion does not require matching it. All configuration fields are optional:

| Field | Purpose | Notes |
|---|---|---|
| Planned duration | Reference working time | Optional |
| Planned distance | Reference distance | Useful for jogging/treadmill/biking, not required |
| Planned speed or pace | Reference intensity | Store one canonical representation; present speed or pace in the UI |
| Planned incline/grade | Reference treadmill setting | This is not the same as outdoor elevation gain |
| Planned resistance | Reference bike/device setting | Device-specific and not comparable across machines |

The completed log may record duration, distance, average/max speed, reported
power, incline/grade, resistance, and notes. It is fine for the first version
to record a single overall or representative value. A steady session whose
speed, incline, or resistance changes substantially can use completed-workout
notes initially; detailed time-varying data belongs in a later segment model.

### Phase instructions and targets

The phase's timer role and its visible instruction are distinct. `work` and
`recovery` determine the repeated structure; each phase may also have a free
text instruction such as `Sprint`, `Walk`, `Easy ride`, or `Hard climb`.
Suggested labels keep outdoor jogging simple and entirely subjective. A jog
workout can therefore be saved as `Walk` / `Sprint` without pace, distance,
heart-rate, or other numeric targets.

Machine-oriented exercises selectively expose useful numeric reference targets
on each phase:

| Exercise | Optional phase targets |
|---|---|
| Treadmill | Speed and incline/grade |
| Biking / stationary bike | Resistance, cadence, and reported power |
| Jogging | Optional instruction label only in the initial editor |

Phase durations use paired minute/second pickers instead of a raw seconds
keypad. Treadmill speed is a constrained picker from 3.0 to 10.0 mph in 0.1
mph increments, and incline is a constrained picker from 0.0% to 15.0% in
0.1% increments. These are initial presentation limits, not a limitation of
the persisted numeric model.

The preview is intentionally honest about its data: it draws a numeric plot
only where an applicable target exists (such as treadmill incline over time).
Otherwise, it shows a labeled phase timeline rather than inventing an
objective intensity curve for subjective instructions. For treadmill it shows
separate speed and incline charts over the same phase timeline, followed by a
compact phase table. The colored work/recovery blocks are deliberately high
contrast, and tapping either chart opens an enlarged, scrollable preview.

### Exercise and equipment-specific metrics

Do not create an equipment value for every machine model. `Machine` remains a
useful broad equipment category; the exercise name identifies Biking,
Treadmill, Rower, Elliptical, and similar activities.

The user interface can offer relevant fields by activity type, but this is
presentation configuration—not user-entered metadata on the exercise record.
The persistence model should allow every optional metric to be absent. For the
three current examples:

| Exercise | Core results | Useful optional settings/context |
|---|---|---|
| Biking | Duration; optional distance, average/max speed | Resistance, cadence, reported power; indoor/outdoor |
| Jogging | Duration; optional distance and average/max speed | Pace/speed; outdoor terrain or surface; future splits/elevation |
| Treadmill | Duration; optional distance and average/max speed | Incline/grade; reported power where available |

Speed and pace are two presentations of the same measurement. Store canonical
values (for example, meters/second) and derive the displayed pace. Store
duration in seconds, distance in meters, power in watts, grade in percent, and
energy in kilocalories. Do not store only display strings such as `3.1 mi` or
`8:30/mi`.

For metrics that may eventually support a plot—duration, distance, average/max
speed, average/max reported power, cadence, elevation gain, and heart rate—use
optional typed fields on the completed workout instance. They remain manually
entered and reference-only initially, but typed values make later historical
plots possible. Completed-workout notes capture anything else that is useful
but not yet worth a dedicated field; notes do not belong on the exercise
record.

Treadmill **incline/grade** must remain separate from outdoor **elevation gain**.
Bike resistance should be clearly labeled as a device setting, not a
cross-machine training-load measure. Calories and heart rate are optional
results; calories should retain provenance (manual, device-reported, or
estimated) if added. A manual log should never require a device metric that
the user does not have. Future jogging splits should be separate ordered
session records (distance marker plus elapsed/split time), rather than a
single note or exercise-level value.

## Interval/HIIT design

The initial editor supports a repeated work/recovery pattern rather than a
general-purpose interval-programming language. It now includes optional
warm-up and cool-down phases:

| Field | Purpose |
|---|---|
| Rounds | Number of repetitions |
| Warm-up duration and instruction | Optional pre-work reference block |
| Work duration | High-intensity interval length |
| Recovery duration | Low-intensity interval length |
| Cool-down duration and instruction | Optional post-work reference block |
| Work configuration | Optional speed/pace, incline, resistance, power, or notes |
| Recovery configuration | The same optional fields, where relevant |

The phase structure is useful persistent reference configuration. The
completion flow can initially capture any optional total metadata and
completed-workout notes. Recording actual values for every work/recovery
interval is valuable, but should be a follow-up once the basic
create/complete/history loop is reliable.

Internally, even the repeated-pattern UI should be representable as ordered
work/recovery blocks. That lets the model grow later to unequal intervals—or
optional warm-up/cool-down blocks—without a data migration.

## Persistence direction

Prefer new cardio-oriented records rather than adding nullable columns to the
strength `workout_sessions` → `session_exercises` → `session_sets` chain.
Weight/reps/RIR sets cannot accurately describe a treadmill or bike workout,
and this separation protects current persistence and history.

A simpler first-release shape (names are intentionally provisional):

```text
cardio_workout_templates                -- reusable, standalone saved workouts:
                                        -- exercise snapshot, format, and optional prescription
  └─ cardio_workout_logs                -- independent completed occurrences:
                                        -- template + exercise snapshot, completed timestamp,
                                        -- optional reference metadata and notes
      └─ cardio_workout_splits           -- later: ordered jogging/biking splits
      └─ cardio_workout_interval_results -- later: actual per-block results
```

The names are provisional. The important boundaries are:

- A template represents a saved, repeatable workout; it has no schedule,
  progression, goals, or compliance lifecycle.
- Each completed log is independent and snapshots both the template
  prescription and exercise display fields, so later edits do not rewrite
  history.
- Configuration and completion metadata have no target/compliance
  relationship.
- No existing strength session, set, plan, template, or history row is
  migrated or reinterpreted.
- Core fields remain typed and queryable. A constrained extension payload may
  later hold rare device-specific values, but must not replace duration,
  distance, format, or primary intensity metrics.

## Context, terrain, and device data

Indoor/outdoor can be an optional simple selector in the first release.
Terrain/surface is relevant primarily to outdoor jogging/biking; it should be
hidden for treadmill workouts and may be deferred until outdoor activity
logging is otherwise mature. Suggested future values are road, trail, track,
mixed, and other.

Manual entry is the first source. Reserve a source/provenance field for a
future device or health-platform import, but do not make device integration a
dependency of the first release. Free-form notes belong to the completed
workout instance only; they describe that occurrence and do not alter the
exercise library record.

## Explicit non-goals for the first implementation

- Multi-exercise cardio workouts.
- Combined strength/cardio workouts.
- Conditioning circuits based on reps, rounds, and rest.
- Unequal/custom HIIT sequences beyond the repeated work/recovery pattern.
- GPS routes, maps, or automatic device synchronization.
- Per-interval actual metric capture.
- A live in-app HIIT timer.

Those remain compatible future directions, not omissions from the data model.

## Planned enhancement: built-in HIIT runner

After the create, complete, and history loop is proven, add a native-backed
HIIT runner to the app. It should run the template's warm-up, repeated
work/recovery pair, and cool-down; provide reliable cues while the app is
backgrounded; and write completion and interval results directly to the cardio
log. This avoids a dependency on a third-party interval-timer API. Apple Watch
/ WorkoutKit can be evaluated as an optional later execution surface, not a
requirement for the standalone cardio model.

## Planned enhancement: MapMyRun import

MapMyRun's MapMyFitness platform has a documented OAuth 2 API for retrieving
workouts and their optional GPS, distance, elevation, speed, heart-rate,
cadence, and power time series. It is a strong future source for outdoor-run
data, but is separate from the in-app timer and from strength persistence.

Initial integration scope:

- The user explicitly connects a MapMyRun account using OAuth 2.
- A protected server-side component (not the PWA or native client) owns the
  OAuth client secret and syncs data with the MapMyFitness API.
- The first user experience is a manual **Import latest MapMyRun workouts**
  action, or an import on app open. A webhook can be evaluated later for
  near-real-time updates.
- Each imported run becomes a cardio log with provider provenance and the
  MapMyFitness workout ID retained for deduplication. The original imported
  data should remain distinct from manually entered cardio logs.
- Import the useful summary values first: started/completed time, duration,
  distance, average/max speed, calories, elevation, heart rate, cadence,
  power, and notes. Preserve route/time-series data only when maps, splits,
  or charts have a defined user interface.

The API can create a workout record, but there is no documented way to command
the native MapMyRun app to begin its live GPS recorder. Therefore, do not plan
on a "Start in MapMyRun" control unless MapMyFitness confirms a supported
deep-link or partner capability. The realistic first goal is importing runs
recorded in MapMyRun after completion.

References: [MapMyFitness Workout API](https://developer.mapmyfitness.com/docs/v71_Workout/),
[authentication requirements](https://developer.mapmyfitness.com/docs/v70_Authentication/),
and [webhooks](https://developer.mapmyfitness.com/docs/v70_Webhook/).

## Future expansion: structured and mixed workouts

Later, a programmed workout can be modeled as a protocol with ordered blocks:

- Cardio blocks with duration, distance, pace, power, or interval configuration.
- Strength blocks with the existing set prescription model.
- Rest/recovery blocks.
- Circuit/conditioning blocks with repetitions, rounds, and rest.

That broader feature should use a new protocol/block abstraction which can
reference the existing strength prescription data where appropriate. It should
not reinterpret or migrate old strength plans. The initial one-exercise cardio
workout is a useful independent foundation, but it should not force the
eventual multi-block design prematurely.

## Decisions to make before implementation

1. Should creation save an uncompleted standalone cardio workout before the
   user starts it, or should creation immediately open a completion/logging
   screen that saves it only when completed?
2. Which optional configuration fields should be visible by default for
   Steady state versus tucked into an advanced section?
3. Which typed manual metrics should v1 persist for Biking, Jogging, and
   Treadmill so later plots are useful without overbuilding the entry form?
4. Should Biking expose resistance, power, cadence, and average/max speed as
   separate optional fields from the start, or should some begin in notes?
5. Should indoor/outdoor be shown in v1, while terrain/surface waits?
6. Which completed-workout metrics deserve an initial history plot: duration,
   distance, speed/pace, power, elevation, or a small subset?
7. Where should completed cardio logs appear first: a dedicated history view,
   the existing workout history with a cardio label, or both?

## Suggested implementation sequence

1. Add isolated cardio-template and cardio-log persistence. Do not touch
   strength persistence.
2. Implement single-exercise steady-state and repeated-pattern HIIT template
   creation, Home launch, and optional total-result completion.
3. Validate saved templates and completed logs before adding a dedicated
   cardio-history or plotting surface.
4. Add the built-in HIIT runner, then optional per-interval actual results and
   richer device metrics.
5. Design conditioning circuits and mixed workouts as a separate proposal.
