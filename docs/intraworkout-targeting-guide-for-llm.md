# Intra-workout target engine: guide for plan generation

## Scope and division of responsibility

The LLM prescribes the plan: exercises, weekly set counts, rep targets/ranges, RIR, rest, and deload structure. The app calculates and updates the numeric working-set targets while the workout is being executed.

The LLM should therefore supply stable, coherent prescriptions rather than exact working weights. It should use numeric `reps` as the upper end of a rep range and provide `minimumReps` when the intended lower end is more than two reps below that upper end. For example, prescribe `reps: 12, minimumReps: 8, rir: 3` for an 8–12 @ 3 RIR range.

The app may subsequently adjust the displayed target weight and, during the workout, the target reps. These are execution suggestions; they do not automatically rewrite the LLM's plan prescription.

## e1RM model

The app estimates e1RM from actual values when available, otherwise target values:

```text
e1RM = weight × (1 + (reps + RIR) / 30)
```

For a bodyweight-assisted or bodyweight-loaded exercise, the applicable bodyweight load is included before applying the factor and removed afterward. The inverse formula is used to estimate a target weight for a chosen e1RM, reps, and RIR.

Consequences for planning:

- RIR is part of the e1RM estimate, not just a display field. The same load and reps at RIR 3 imply a higher e1RM than at RIR 1.
- Changing either prescribed reps or RIR changes the calculated target load even if the desired e1RM is unchanged.
- e1RM is a practical targeting and comparison estimate, not a literal tested one-rep maximum.

## How the app selects relevant history

The app searches for the latest matching exercise performance, excluding the currently open session. It gives preference to the same plan workout/template and comparable prescription when that context exists. It distinguishes normal training from deload work, but will fall back when an equivalent result is unavailable.

For a deload, the most useful reference is the immediately preceding occurrence of the same plan workout—normally the prior training week—before considering an older deload. This avoids basing the deload on stale data simply because it is also a deload.

Within the selected historical workout, the app can use either:

- the best e1RM across its working sets, primarily for a progressive first-set target; or
- the matching set position (set 1, set 2, etc.), primarily for a later-set baseline or a maintenance target.

If a matching set position is absent, the fallback is the best set from that workout or a broader matching history result.

## Prescribed reps, minimum reps, and RIR

`reps` is the normal upper target. If `minimumReps` is omitted, the app treats `reps - 2` as the lowest acceptable result. The live candidate generators generally explore a compact window around the target (normally ±2 reps), then favor prescriptions closest to the requested reps, RIR, and e1RM.

The prescribed RIR is preserved as the intended RIR for the next working set. A lower actual RIR means the athlete worked harder than prescribed and is treated as a performance/effort miss. A higher actual RIR is not automatically converted into a more aggressive target during the same set transition.

## First set versus later sets

### First set of a normal progressive workout

For a plan in progress mode, the first set starts from the best e1RM in the latest matching workout and targets a small 0.5% e1RM increase. The app converts that e1RM into feasible weight/reps/RIR candidates and uses the best supported weight increment.

For maintenance goals, the app instead uses the corresponding historical set baseline without a fixed positive progression percentage.

### Later sets before they are performed

For normal training, later-set starting targets use their own historical set-position baseline rather than simply copying the first set. Once a set is completed, live data becomes more important than the static starting target.

### Later sets after a set is completed

The app calculates the completed set's actual e1RM and considers both live and historical fatigue:

- **Live fatigue:** if two comparable completed sets used the same weight and RIR, an observed rep drop projects a further rep drop for the next set.
- **Historical adjacent fatigue:** the app compares e1RM from adjacent set positions in the latest matching workout.
- **Historical fatigue curve:** when an adjacent comparison is not available, it uses the set's place in the latest workout's e1RM curve. This curve is deliberately blended 50% toward flat so a single historical drop is not copied at full strength.

For normal progressive workouts, the app combines a set-position progression target (+0.5%) with a fatigue target. A clear historical fatigue drop causes a conservative ceiling: the next target should not exceed the just-completed set's actual e1RM. Otherwise, the app can select the stronger of the progression and fatigue baselines. This is why later-set targets can differ from both the plan's original weight and the first set's target.

## Deload behavior

Deloads are intentionally handled separately from normal progress mode.

- The first-set deload target is based on the latest matching workout's best e1RM, reduced by 1%.
- Initial deload targets for later sets apply the historical within-workout fatigue curve.
- After a deload set is completed, the next target is based on the actual e1RM multiplied by the historical adjacent-set fatigue ratio.
- When that fatigue ratio indicates a decline and the rep range permits it, the primary recommendation keeps the completed-set weight and lowers reps. This avoids an unnecessary plate or machine-stack change.
- A reduced-weight/same-reps option remains available as an alternative. If lowering reps would go below `minimumReps`, the app keeps the safer weight-reduction recommendation instead.
- A stronger live rep-drop signal still takes priority over the ordinary historical deload adjustment.

## What happens when actual performance differs from the target

The following is evaluated after a working set is marked complete:

| Observed result | Next-set behavior |
| --- | --- |
| Same weight/RIR, with a live rep drop that still stays in range | Keep weight and proactively reduce target reps. |
| Projected live rep drop would fall below the allowed range | Estimate a lower e1RM, blend the live fatigue signal with 25% of the historical fatigue ratio, and lower weight if needed. |
| Actual reps are below the upper target but still in range, at the intended RIR | Carry the achieved rep count forward at the same weight. |
| Actual RIR is lower than prescribed, or reps are below the minimum | First try a same-weight, lower-rep target that does not exceed the achieved e1RM; otherwise reduce weight for the prescribed reps/RIR. |
| Target is met or exceeded at the intended effort | Normal progressive logic may apply for a normal progress workout; a deload does not add a progression increase. |

The athlete can always edit a target or actual value and can select from alternatives. The app treats a manual actual as the performed value for subsequent calculations.

Drop sets are separate: they are AMRAP at RIR 0, initially target 80% of the preceding segment's actual weight, are rounded to the exercise increment, and are excluded from ordinary e1RM/fatigue calculations.

## Target-options sheet: the other displayed prescriptions

The target-options sheet is an execution aid, not a new plan prescription. It displays the set's current target as **Suggested** plus additional valid weight/reps/RIR combinations. Choosing one fills that set's actual values; it does not change the underlying LLM-authored weekly prescription.

### How ordinary alternatives are generated

For a standard target, the app starts with the same e1RM baseline used for the relevant historical context and explores a compact candidate space:

- rep counts normally within two reps below through two reps above the prescribed upper target;
- the calculated weight for each candidate rep count; and
- one supported increment below and above that calculated weight.

Each option is load-normalized for the exercise, deduplicated by `(weight, reps, RIR)`, and scored for closeness to the target e1RM, requested RIR, and requested reps. The primary recommendation favors the requested RIR first, then stays within the preferred rep window, then minimizes rep and e1RM deviation. For a non-progress/maintenance target, the sheet keeps up to seven of the next best ranked candidates.

For a positive e1RM progression target, alternatives deliberately include both progression-capable and maintenance-like choices. It first retains up to five candidates that reach the calculated progression target, then adds candidates at or below roughly the historical baseline (+0.5%), then fills remaining slots with the best overall options. This gives the athlete a practical choice between a more ambitious and a more conservative execution target.

### Later-set progressive alternatives

When a normal progress workout has a completed preceding set, the app uses the live progression/fatigue candidate generator instead of the generic list. It considers every rep count from the minimum through the prescribed upper target, including:

- the preceding set's actual weight at each allowed rep count;
- the e1RM-derived, increment-rounded weight at each rep count; and
- one increment below and above those calculated weights.

It ranks these candidates by e1RM closeness, fatigue constraints, rep deviation, and a modest penalty for changing weight. It intentionally reserves room for choices across the rep range and for lower, same, and higher load directions, up to eight options. A clear fatigue drop prevents options from exceeding the fatigue ceiling.

### Deload alternatives

For a later deload set with a completed preceding set and an available historical adjacent-fatigue ratio, the primary recommendation preferentially holds the preceding actual weight and lowers reps within `minimumReps`. The usual lower-weight/same-reps e1RM-matched recommendation, along with the other valid candidates, is retained in the alternatives list. If there is no permitted rep reduction, the lower-weight option remains primary.

### Display order

The sheet removes an alternative that exactly duplicates the currently displayed target, then adds the current target back with its **Suggested** label. The visible choices are sorted by displayed e1RM from highest to lowest. Therefore, **Suggested** identifies the app's active target; it does not necessarily mean that row is visually first when another alternative has a higher e1RM.

## Weight increments and loadability

Every suggested load is rounded to the exercise's supported increment, then normalized to a load the exercise can use. An exercise-specific increment override takes priority. Otherwise, the default rules include:

- Most barbells, dumbbells, Smith machines, and standard cables: 2.5 lb.
- Machines, pull-ups, and landmines: 1.25 lb.
- Cables at 25 lb or less: 1.25 lb; above 25 lb: 2.5 lb.
- A missing/unsupported increment falls back to 2.5 lb; an explicitly non-positive/unavailable increment preserves a numeric load without conventional increment rounding.

The app evaluates neighboring rounded weights, rather than assuming the exact inverse-formula load can be loaded. Therefore two exercises with identical e1RM/reps/RIR can receive different numeric targets because their equipment increments differ.

## How next-week targets are determined

The app does **not** automatically change the LLM-authored weekly prescription from completed performance. Reps, minimum reps, RIR, number of sets, and weekly structure remain the plan's prescription unless the athlete manually edits them.

When the next plan workout/week is opened, the app calculates fresh starting **weights** against the newest relevant completed history. Thus a strong or weak workout affects the next week's numerical target through its recorded actuals and e1RM, while it does not silently alter the plan's programmed rep/RIR scheme.

If the athlete manually edits a plan-linked exercise prescription during a session, the app applies that prescription edit to the current and future normal-training weeks. A deload-week prescription edit is limited to that deload week.

## Does progression vary by rep range, exercise, or recent performance?

There is no separate hard-coded percentage progression table for low-, medium-, or high-rep work. The standard normal progressive first-set e1RM increment is 0.5% regardless of rep range. However, the resulting **load** and candidate choice vary materially because:

- reps and RIR change the e1RM conversion;
- each exercise's bodyweight behavior, loadability, and increment rules differ;
- the latest matching historical e1RM and set-position performance differ;
- recent live performance and historical fatigue can override or cap a later-set progressive target; and
- maintenance and deload modes suppress normal e1RM progression (deload additionally uses the 1% reduction and fatigue logic above).

In short: the percentage rule is mostly shared, but the target is exercise- and performance-specific because the app calculates it from the actual exercise history, prescribed rep/RIR context, fatigue evidence, and available load increments.

## Recommended LLM planning posture

1. Prescribe a clear rep range and RIR that match the phase and exercise intent.
2. Include `minimumReps` whenever the desired range is wider than two reps below the upper target.
3. Keep an exercise's rep/RIR prescription reasonably stable when you want its e1RM history to be comparable.
4. Use deload RIR, set count, rest, and exercise selection to express the deload's intent; do not attempt to pre-calculate every later-set load.
5. Treat the app's live targets as execution assistance. Interpret completed actuals, not merely displayed targets, when evaluating the prior plan and designing the next one.
