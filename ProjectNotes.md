Excercises

- persist metadata with increment info: default weight increment for target weight setting
- Default? 5 pounds for most; 10 pounds for legs?

Plans

- Plan 3
  - one note: target may need to update logic if one set fails to reach target? adjust next set accordingly??
- Consider how plans are created, which exercises are chosen, etc.
- See "Progress" note below for GPT explanation of current logic

- Plan/workout generation mode
  - Current behavior: the generator offers plan types 1 or 2, and setting days per week to 1 implicitly creates a single workout.
  - Proposed behavior: make creation mode explicit first.
    - Workout mode
      - user chooses one workout type: push, pull, upper, lower, or full body
      - generator creates one workout from that workout type template
      - duration/weeks should not drive the primary behavior
    - Plan mode
      - user chooses one plan type
      - plan types 1 and 2 continue more or less as currently implemented because they are already well-defined
      - new plan type or types can compose the workout type templates using plan-specific rules
  - Example future plan type
    - Plan Type 3: 5 days/week
    - weekly composition: 1 push day, 1 pull day, 2 lower days, 1 upper day
    - exact ordering and rotation rules still need to be defined
  - Implementation direction
    - avoid treating 1 day/week as the only signal for "single workout"
    - add a top-level generation mode such as `workout` vs `plan`
    - in workout mode, pass `workoutType` directly to the workout-template generator
    - in plan mode, pass `planType`; plan type then resolves to a sequence of workout types or the existing type 1/type 2 builders
    - keep the existing type 1/type 2 output stable while introducing the new mode, then add type 3 composition once the workout templates are reliable

- Workout type templates for generator
  - names describe exercise emphasis, not necessarily the plan name: push, pull, upper, lower, full body
  - initial defaults:
    - no supersets
    - 3 sets per exercise
    - later consideration: selectively use 4 sets for priority exercises or lower exercise-count workouts
  - Push
    - 2-3 chest exercises
      - if 3: prefer one each for upper chest, mid/flat chest, and lower/decline chest
      - if 2: prefer upper/incline and mid/flat chest
    - 2 shoulder exercises: 1 side delts, 1 rear delts
    - 1-2 triceps exercises
    - 1 abs exercise
  - Pull
    - 3 exercises mixing lats and upper back
    - 1 rear delts exercise
    - 1 side delts exercise
    - 1 traps exercise
    - 1-2 biceps exercises
  - Upper
    - 2 chest exercises
    - 1 lats exercise
    - 1 upper back exercise
    - 1 side delts exercise
    - 1 triceps exercise
    - 1 biceps exercise
  - Lower
    - 3-4 leg exercises, mixed across glutes, quads, and hamstrings
    - 1 calves exercise
    - 2 core exercises: 1 abs, 1 obliques
  - Full body
    - 2 exercises from glutes, quads, or hamstrings, but not two of the same
    - 1 chest exercise
    - 1 lats exercise
    - 1 upper back exercise
    - 1 side delts exercise
    - 1 triceps exercise
    - 1 biceps exercise
    - 1 abs exercise
  - Generator direction
    - represent workout types as structured slot templates instead of only ad hoc muscle groups
    - each slot should include target muscles, count, required/optional status, set count, variant rules, and gap reporting label
    - reuse existing exercise scoring for equipment/variant diversity, chest variant selection, pull variant selection, and active exercise filtering
    - add slot-level rules before broad plan scheduling: examples include chest upper/flat/decline coverage, leg no-duplicate-muscle rule, and pull lats/upper-back mix
    - keep exercise selection deterministic from seed so regenerating the same plan remains stable
    - after slot generation works, plan scheduling can choose sequences such as push/pull/lower, upper/lower, or repeated full-body days based on days per week and goal

- Target setting & actual field pre-population
  When in a workout
  - Target
    - consider maintenance vs progression
    - use previous time exercise was peformed
    - compare set-by-set
    - weight and rep values determined on e1RM from last time; use current plan's RIR and rep targets; determine weight to either maintain e1RM or progress
    - populate target values accordingly
    - tap target to see options (note behavior in sessionview when tapping e1RM)
  - ?? Pre-populate actual fields with values from same set last time exercise was performaned, including weight, reps, RIR ??

Workout

- tap target button:
  - check current target logic (when tapping r1RM); makes sense? change?
  - see one (or two) target combos for weight + reps
  - tapping a target will fill in weight, reps, RIR
  - currently, next set is filled in
  - base targets on same set from last time exercise was performed
    - follow 'maintain' or 'progress'; but use e1RM from past set to convert weight based on number of reps target in current plan

DB

- start using real DB automatically

Progress:

- Progress mode now works like this:

  - Keep target RIR fixed.
  - Prefer reps within the preferred window, currently ±2.
  - Require the candidate to meet or exceed the progression e1RM target when possible.
  - If no practical candidate reaches the progression target, fall back to any candidate above the previous baseline e1RM.
  - If even that is impossible, fall back to the normal ranked candidates.

  So with progress = +1%, the app now tries to choose a target that actually advances e1RM rather than merely staying close to the same reps.

Progress target changes:

- progress now targets +2% e1RM instead of +1%.
- Progress prefers a higher weight when it can keep reps no more than 2 below target.
- If it can’t find a good heavier-weight option, it falls back to increasing reps at the same weight or other valid progress candidates.

Exercise & Plan view updates

- replace "+ Add Exercise" with "Edit"
- when Edit is tapped, note state: exercises, order, number of sets
- in Edit mode
  - toggle Edit to "+Add Exercise"
  - disable or hide "+ Add to Workouts" button
  - disable or hide "start" button
  - fixed at bottom, "ok <check>" and "cancel <x>" buttons
  - if cancel, revert to previous state
  - of ok, leave Edit mode and make changes
  - if any exercises have superset value not matching another, clear it out so there are no one-exercise supersets
- if changes are made -- supersets, reordering, or deleting, explicitly enter "edit mode" and and follow rules above
