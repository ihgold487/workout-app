# AI Plan Planning Guidance

Status: Discussion draft  
Purpose: Living design notes for making Plan Type AI configurable while preserving the existing AI context and import workflow.

## Current direction

The AI plan feature can be made flexible without weakening the context that has already been developed. The safest design is to preserve the current context builder and add a clearly separated `planningRequest` layer containing the user's choices for a particular draft.

The current context already has a strong structure:

- Historical evidence and derived performance metrics
- Current-plan prescriptions and recent exercise exposure
- Previous AI-plan rationale and watch items
- Body-weight and nutrition trends
- A training profile containing goals, hard rules, soft preferences, and planning freedom
- A strict JSON import contract

These existing layers should remain intact.

## Proposed context model

Separate the exported information into three conceptual categories.

### 1. Evidence: what has happened

This includes performance history, adherence, nutrition trends, body-weight trends, the current plan, and prior AI analysis.

### 2. Athlete profile: durable preferences and requirements

This includes long-term goals, benchmark exercises, available equipment, injuries, exercise restrictions, and general priorities. These preferences normally persist across multiple plan generations.

### 3. Planning request: what the user wants for this generation

This includes current priorities, any requested block emphasis, duration, workout length, set limits, rest flexibility, nutrition guidance, and user notes. The proposed Plan Type AI controls would primarily populate this category.

Long-term goals and current emphasis must remain distinct. Strength and hypertrophy can both be durable goals while the emphasis of a particular block changes in response to performance, fatigue, prior block outcomes, and the user's current priorities.

An illustrative export shape is:

```json
"planningRequest": {
  "currentPriorities": [
    { "scope": "muscle", "target": "chest", "goal": "hypertrophy", "priority": "high" },
    { "scope": "exercise", "target": "Bench Press", "goal": "strength", "priority": "high" },
    { "scope": "global", "goal": "hypertrophy", "priority": "high" },
    { "scope": "global", "goal": "strength", "priority": "moderate" }
  ],
  "blockEmphasis": "aiDecides",
  "allowMixedPurposePlan": true,
  "timeHorizon": {
    "currentBlockWeeks": { "min": 4, "max": 6 }
  },
  "workoutDurationMinutes": {
    "min": 45,
    "target": 60,
    "max": 75
  },
  "setConstraints": {
    "workingSetsPerExercise": { "min": 2, "max": 5 }
  },
  "restConstraints": {
    "allowAiSelection": true,
    "maximumSeconds": 240
  },
  "nutrition": {
    "allowRecommendations": true
  },
  "userNotes": ""
}
```

This should be additive. Existing fields do not need to be removed or rewritten.

The persistent athlete profile could separately contain:

```json
"longTermGoals": ["hypertrophy", "strength"]
```

This prevents a temporary block emphasis from being mistaken for a change in the athlete's underlying goals.

## Proposed precedence

The context should explicitly tell the model how to resolve conflicts:

1. Safety and hard rules
2. Explicit current planning request
3. Athlete profile and current priorities
4. Soft preferences
5. Current-plan structure

For example, the existing five-day split and five training weeks are currently soft preferences. If the user requests three days and 8–10 weeks, the request should win. Benchmark coverage remains a hard rule unless the UI eventually provides a deliberate override mechanism.

Individual inputs should ideally distinguish among these meanings:

- `required`: must be honored
- `preferred`: honor unless the evidence supports a better choice
- `aiDecides`: the model has discretion
- `notSpecified`: use the existing context and judgment

This is more expressive than checkboxes alone. An unchecked checkbox is ambiguous: it could mean either “do not do this” or “I do not care.”

## Review of proposed inputs

### Goals

Strength and hypertrophy are related but not interchangeable. Much of the same training can support both, but the optimization target changes the prescription.

A strength emphasis generally increases the importance of movement specificity, repeated benchmark exposure, lower or moderate rep work, longer rests, and managing fatigue before benchmark lifts. A hypertrophy emphasis generally increases the importance of muscle-level weekly stimulus, exercise stability, useful ranges of motion, fatigue-to-stimulus ratio, proximity to failure, and flexibility in exercise selection.

Therefore, goals should be represented independently rather than collapsed into a single label such as `"Strength gain and hypertrophy"`. Priority labels or weights can be useful, but they should exist at several scopes:

- Global: overall strength or overall hypertrophy
- Muscle: chest hypertrophy, shoulder hypertrophy, or back maintenance
- Exercise or movement: barbell bench strength or pull-up performance
- Block: the emphasis of the next training block

This allows a mixed-purpose plan. Bench press can have a genuine strength objective while chest accessories emphasize hypertrophy, and an exercise such as a lateral raise does not need an artificial strength objective merely because strength is a long-term goal.

Potential long-term goals include:

- Strength
- Hypertrophy
- Fat loss or body composition
- Muscular endurance
- General fitness
- Technique or skill
- Maintenance
- Recovery or resensitization
- Custom goal

The current context hard-codes chest hypertrophy and bench strength priorities, making those good candidates for eventual configuration. A small priority vocabulary such as `low`, `moderate`, and `high` may be easier to interpret than numeric weights whose meaning is unclear. Numeric ordering can still be used internally if the UI benefits from it.

The context should explicitly authorize mixed-purpose plans. Otherwise, providing both goals may encourage the model to produce the same generic compromise in every block.

### Plan duration and next-block continuity

A duration range is useful for the immediate imported block:

- Current imported plan: for example, 4–8 training weeks
- Deload: specified separately, as it already is

The AI does not need to generate a speculative multi-block roadmap. The exported history, previous AI rationale and watch items, long-term goals, recent outcomes, and current priorities give it enough continuity to determine the most appropriate next block each time a plan is requested.

This still permits changing emphasis across consecutive blocks while retaining both goals. The difference is that each transition is decided when the next plan is generated from then-current evidence, rather than being committed to in advance. This avoids rigid calendar-based alternation, such as automatically switching between strength and hypertrophy every four weeks.

Recent block outcomes should determine what comes next. If low-rep benchmark work stagnates while moderate-rep performance responds well, the next plan can change emphasis rather than mechanically continuing an earlier prediction.

In this design, “thinking ahead” means choosing a block that supports the long-term goals without creating an obvious dead end, recording its rationale and `watchNext` items, and allowing the next generation to reassess. It does not mean prescribing several future plans at once.

### Programming authority

The context should state what the AI may decide. A useful default may be to allow it to determine the current block emphasis, duration, frequency, volume, exercise selection, rep ranges, RIR, rest intervals, and progression using the long-term goals and evidence.

This authority remains bounded by hard constraints supplied by the user. For example, the AI may choose four or five training days only if both are compatible with the user's available schedule. The output should explain material changes in `analysis.rationale` and identify what would cause the next block's emphasis to change in `analysis.watchNext`.

### Goal-specific interpretation of evidence

The same metric can have different meaning depending on the goal and scope. Bench e1RM is meaningful evidence for bench strength, but it is not a direct measurement of chest hypertrophy. Conversely, stable bench e1RM does not necessarily imply failed chest growth if volume, adherence, exercise performance, body-weight trends, and other hypertrophy evidence are favorable.

The context and prompt should instruct the model to associate outcome measures with the relevant objective:

- Exercise strength goals: benchmark performance, e1RM, rep-range trends, technique, and specificity
- Muscle hypertrophy goals: quality weekly volume, proximity to failure, performance across relevant exercises and rep ranges, body-weight/nutrition context, and eventually direct or subjective measurements
- General recovery: adherence, performance drop-off, RIR accuracy, fatigue signals, and user notes

This prevents benchmark metrics from unintentionally overriding muscle-growth goals merely because they are easier to quantify.

### Workout length

Workout duration is a valuable planning constraint. A target and hard maximum may communicate intent better than presets alone—for example, a 60-minute target with a 75-minute maximum.

The model can estimate duration using exercises, sets, reps, and rest intervals, although warm-ups and exercise transitions make the result approximate. The prompt could require an estimated duration for each workout, but storing or displaying that estimate may require an import-schema addition.

### Rest time

Rest guidance fits the existing feature particularly well because the draft schema already supports exercise- and set-level `restSeconds`. Possible modes are:

- Use app defaults
- AI chooses
- User supplies a range or maximum

### Set range

A set range is useful, although one global per-exercise limit may be too blunt because compound and isolation exercises can need different treatment. A simple first version could use a global range and allow the model to exceed it only with an explanation.

Possible later refinements include:

- Working sets per exercise
- Weekly sets per muscle
- Maximum exercises per workout
- Separate compound and isolation ranges

### Nutrition

Nutrition guidance requires a product decision. The current export provides nutrition evidence to the model, but the imported plan schema has nowhere to store calorie or macro prescriptions.

An initial implementation could allow the model to provide nutrition recommendations inside `analysis` without changing the app's actual nutrition goals. If operational nutrition targets are added later, the schema should support dated or week-specific targets, and applying them should require explicit user approval.

### User notes

A notes field is likely the highest-value, lowest-complexity addition. It should be exported verbatim, clearly identified as user-authored text, and treated as a current request rather than historical evidence. It should not override safety requirements.

## Additional inputs to consider

Potentially useful missing inputs include:

- Available training days and days per week
- Hard workout-time limits by day
- Equipment or location availability
- Injuries, pain, and movement restrictions
- Exercises to require, prefer, avoid, or rotate
- Priority and maintenance muscle groups
- Desired frequency per muscle or benchmark
- Superset permission
- Recovery constraints such as sleep, stress, other sports, or a physical job
- Progression preference: fixed progression, double progression, RIR-based, or AI decides
- Variety preference: retain familiar exercises or rotate more aggressively
- Minimum acceptable benchmark frequency
- Whether a deload is required, optional, prohibited, or AI-decided

Some of these belong in a persistent athlete profile rather than being re-entered for every draft.

## Possible UI direction

Inside Plan Type AI, add a compact “AI planning guidance” section with expandable groups:

- Goals and priorities
- Schedule and duration
- Workout constraints
- Programming freedom
- Nutrition
- Notes

Each group could default to “Use current profile” or “AI decides.” Advanced ranges would appear only when enabled.

Before exporting, show a concise summary such as:

> Long-term: strength + hypertrophy · Priorities: chest hypertrophy high, bench strength high · Block emphasis: AI decides · 5–7 weeks · 5 days/week · 45–75 minutes

This would help the user catch contradictions before sending the context.

## Architectural recommendation

Do not turn the existing rich context into a template dominated by conditional string substitutions. Keep its structured data and instructions stable. Add a versioned, structured `planningRequest` object and make the currently hard-coded personal preferences configurable over time.

The existing `trainingProfile.goals`, `trainingProfile.currentPriorities`, and `trainingProfile.softPreferences` are the most obvious fields to refine. Initially, they can remain as defaults while an explicit `planningRequest` overrides them. This provides backward compatibility and protects the work already invested in the current context.

The architectural model should support decisions at global, block, muscle, and exercise scope. It should not assume that every exercise in a plan shares the same strength-versus-hypertrophy emphasis.

## Decisions to make

The following questions remain open for discussion:

1. Which inputs belong to the persistent athlete profile versus an individual planning request?
2. Should goal priority use simple ordering, numeric weights, or labels such as low/moderate/high?
3. Which planning inputs are hard constraints, preferences, or AI-decided?
4. How explicitly should the AI record why the selected next block best advances the long-term goals?
5. Should nutrition remain advisory initially, or should the plan schema eventually store actionable nutrition targets?
6. Should estimated workout duration be returned in `analysis` or become structured plan data?
7. Which AI planning fields should persist between visits and between plan generations?
8. Should the UI expose global, muscle-level, and exercise-level priorities in the first version, or introduce those scopes progressively?
9. Should `analysis` gain an explicit structured statement of the selected block emphasis, without adding a long-range roadmap?

## Decision log

No implementation decisions have been finalized yet.

### Discussion finding: strength and hypertrophy

Strength and hypertrophy should be modeled as distinct, independently prioritized long-term goals within one programming framework. A plan may be mixed-purpose, and goals may differ by muscle and exercise. The AI should be able to change block emphasis over time based on evidence rather than following a rigid alternation schedule. This is a working direction, not yet a finalized implementation decision.

### Discussion finding: next-block planning

The AI should generate only the next plan rather than planning a series of future blocks. Long-term goals provide direction, while workout history, prior plan outcomes, prior AI rationale, and `watchNext` items tell the AI where the athlete currently stands. Each new generation can therefore select the next block's emphasis using current evidence. “Think ahead” is retained only as sensible next-block design and continuity, not as a speculative multi-plan roadmap. This is a working direction, not yet a finalized implementation decision.
