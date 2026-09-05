# UI and UX Review

## Purpose and product direction

The native phone app is the primary experience, while the PWA must remain consistently available, reliable, and functionally on par. All meaningful features must remain accessible and usable in both environments. Native-only capabilities should enhance convenience and polish without becoming prerequisites for core workflows.

All existing features and functionality should remain intact and easy to use. Improvements should focus on presentation, interaction design, information hierarchy, accessibility, and platform-appropriate enhancements without functional degradation.

## Review basis

This review was completed without changing application files or behavior. The findings are based on the rendered component structure, responsive CSS, navigation, dialogs, and existing Capacitor integrations.

A live visual walkthrough was not possible during the initial review because the available environment could not open a browser or bind the local Vite server. The recommendations should therefore be validated on an actual iPhone and in the PWA before implementation.

## Overall assessment

The app is functionally rich, but its presentation appears to have grown feature by feature. The main modernization opportunity is not a dramatic redesign; it is establishing a consistent visual system and clearer information hierarchy.

The safest direction is:

- Keep one shared React feature layer for native and PWA.
- Treat native capabilities as progressive enhancements, never prerequisites.
- Preserve the five primary destinations: Home, Exercises, Plans, Nutrition, and Settings.
- Modernize gradually through shared tokens and reusable components.
- Optimize the workout session more aggressively for native use because it is the most time-sensitive, one-handed workflow.

## Page-by-page review

### Sign-in and access

- Replace the sparse form with a compact branded sign-in card.
- Use persistent field labels rather than placeholders alone.
- Make **Sign In** the unmistakable primary action; visually demote **Create Account**.
- Explain pending approval in plain language and distinguish pending, denied, offline, and server-error states.
- Native enhancement: support Face ID or Touch ID to unlock securely stored credentials or a refresh session. Retain normal email/password sign-in in the PWA.

### Home and calendar

Current content combines branding, synchronization status, calendar, plans, workouts, history access, sorting, and management controls.

#### Progress

Initial Home/Today hierarchy implemented for native and PWA validation.

- [x] Add a compact shared page-header, section-card, section-heading, status-pill, and action baseline.
- [x] Reduce the visual prominence of the app icon and Workout Log branding on Home.
- [x] Add a prominent Today card with active plan/week progress and the next incomplete workout.
- [x] Add a primary Today action that genuinely starts the next workout through the same validated Template View workflow.
- [x] Surface the most recent completed workout with direct access to its details.
- [x] Keep the existing compact calendar and all plan/workout management workflows intact.
- [x] Restyle Plans and standalone Workouts with the shared card hierarchy and 44px controls.
- [x] Separate the active plan from other saved plans on Home.
- [x] Rename New Template to New Workout and move duplicate/delete actions into a contextual menu.
- [x] Align the compact calendar with the shared card radius, spacing, surface, and elevation.
- [x] Remove the redundant calendar-to-Plans divider and default detailed plan cards to collapsed.
- [x] Add a subtle empty state when no standalone workouts exist.
- [x] Add explicit Edit and Delete actions to completed workouts opened from Calendar or History.
- [x] Keep historical weight, reps, and RIR edits in a sheet-level draft until Save; Cancel discards the entire draft.
- [x] Require timestamped confirmation before deleting a completed workout and retain the underlying sheet when deletion is canceled.
- [ ] Validate the Today hierarchy, long names, no-active-plan state, completed-week state, calendar expansion, and PWA layout in real use.
- [ ] Apply the shared Home primitives to Template View after Home validation.

- Turn the top of Home into a useful **Today** area: current plan and week, next workout, recent completion, and one prominent **Start Workout** action.
- Reduce the visual prominence of the app icon and **Workout Log** title after onboarding; valuable workout information should occupy the top of the screen.
- Keep the calendar, but allow a compact default state with an obvious expansion gesture.
- Separate **Active plan** from archived or draft plans. A count such as “3 plans” is less useful than the next scheduled action.
- Move duplicate, delete, and history controls behind a contextual menu or swipe actions. The current cluster of small icon buttons creates density and increases accidental-tap risk.
- Rename **New Template** to **New Workout** in the interface unless the distinction is important to users.
- Use card styling consistently: status badge, title, secondary metadata, and primary action.
- Keep sync visible but quiet: a small cloud state near the header is enough when healthy; display a banner only for unresolved errors or unsynced changes.
- Native enhancement: home-screen quick actions for **Start next workout**, **Log food**, and **Log body weight**.

### Workout template and detail

#### Progress

Initial Template View presentation checkpoint implemented for native and PWA validation.

- [x] Apply the shared Home page-header, section-card, status-pill, and action styling.
- [x] Establish a top hierarchy with workout name, plan/week context, exercise and set totals, estimated duration, and primary-muscle summary.
- [x] Present exercises as consistent raised cards without changing their existing detail or prescription interactions.
- [x] Add a sticky **Start Workout** action that uses the existing validation and launch workflow.
- [x] Complete initial hands-on validation of the presentation checkpoint.
- [x] Make editing an explicit mode: the default view remains focused on workout review and launch, while reordering, replacement, superset, deletion, name, and prescription controls appear in Edit Workout.
- [x] Keep workout-level Save/Cancel unavailable while any nested template edit is open, so adding, replacing, renaming, library editing, and prescription drafts must be resolved first.
- [x] Replace the heavy superset enclosure with a subtle accent rail, linked-card surface, and clear Superset label.
- [x] Place unavailable and completed-state explanations directly beside the sticky Start Workout action and give the button a state-specific label.
- [x] Add polished empty-workout, incomplete-previous-week, inactive-plan, completed-workout, and long-name treatments.
- [x] Add restrained native-only haptics for entering and saving Edit mode, successful reordering, exercise deletion, and accepted workout starts; PWA behavior remains unchanged.
- [x] Confirm before canceling Edit Workout only when the current edit snapshot contains changes that would be discarded.
- [x] Reduce muscle chips to quiet white metadata surfaces and give **Edit Workout** the lavender action emphasis.
- [x] Preview each exercise's history-aware first-set target, including weight, reps, RIR, and e1RM, beneath its prescription.
- [ ] Validate long workout names, plan and standalone workouts, supersets, disabled-start states, direct start from Home, edit Save/Cancel, and phone/PWA layouts in real use.

- Establish a clear top hierarchy: workout name, plan/week context, estimated duration, muscle summary, then exercises.
- Use a sticky bottom action for **Start Workout**. It should remain reachable regardless of template length.
- Make editing an explicit mode. Outside edit mode, hide replacement, reordering, prescription, and deletion controls.
- Collapse advanced prescription details until requested, while keeping sets, reps, and RIR immediately readable.
- Use a consistent exercise-row design across templates, plans, active sessions, and history.
- Native enhancement: drag-and-drop with haptic feedback, native share sheet, and contextual swipe actions. Provide visible buttons or menus in the PWA.

### Active workout session

This deserves the highest design priority.

#### Progress

Initial session-header increment implemented and build-validated; longer real-world testing remains in progress.

- [x] Show current exercise position and completed-set progress.
- [x] Distinguish the previewed exercise from the active workout position.
- [x] Keep long workout and exercise names clear of adjacent controls, with truncation where needed.
- [x] Increase the workout-controls touch target to 44×44px.
- [x] Cancel the rest timer, native notification, and Live Activity when a workout is ended without saving.
- [x] Add compact active-set emphasis and bounded numeric-cell overflow handling.
- [x] Clarify rest-timer states and improve compact and expanded Spotify status presentation while preserving collapsed playback controls.
- [x] Add a contextual return-to-current-set action while previewing another exercise.
- [ ] Continue real-world validation of the updated header, exercise preview behavior, timer cleanup, supersets, and workout completion.
- [ ] Review remaining active-session tap targets and set-entry ergonomics.
- [ ] Refine the expanded rest-timer experience and reduce competition among workout utilities.
- [ ] Improve incomplete-set guidance before finishing a workout.

- Make the active exercise and next incomplete set visually dominant.
- Keep weight, reps, RIR, and completion controls within thumb reach.
- Enlarge tap targets; several controls appear optimized around 34px, while approximately 44px is a safer mobile baseline.
- Use a single consistent row structure for prescribed values, actual values, completion, target feedback, and drop sets.
- Reduce simultaneous visual competition among the rest timer, Spotify, exercise navigation, workout controls, reminders, and set entry.
- Put the rest timer in a compact persistent surface that expands when tapped.
- Show progress such as **Exercise 3 of 7** and **12 of 20 sets complete**.
- Make the primary action context-sensitive: complete set, start rest, next exercise, or finish workout.
- Use restrained color semantics: accent for primary action, green for completed, amber for below/above-target attention, and red only for destructive or serious states.
- Improve error prevention before finishing: clearly list incomplete sets and allow direct navigation to each.
- Native enhancements:
  - Keep the existing Live Activity and notification behavior.
  - Add haptic confirmation when a set is completed and a distinct timer-complete pattern.
  - Consider Dynamic Island and lock-screen controls for pause, resume, and `+15 sec`.
  - Prevent sleep while actively logging, but make that state understandable.
  - Consider Apple Watch support later for completing sets and controlling rest, not for full workout editing.
- PWA fallback: in-app timer, vibration where supported, visible notification-permission status, and fully usable on-screen controls.

### Exercises

- Introduce clear browse modes: **All**, **Favorites**, **Recently Used**, **Benchmarks**, and **Custom**.
- Keep search persistently available below the page title.
- Use filter chips for muscle, equipment, and status instead of exposing many simultaneous controls.
- Make each result row primarily informational: thumbnail, name, equipment, primary muscles, and recent performance.
- Use the approved simplified arm-and-dumbbell mark for the Exercises page and navigation, with a larger full-color header treatment and a compact navigation treatment.
- Put administrative editing and image-management controls behind a contextual menu.
- Distinguish custom exercises visually without making them feel second-class.
- Exercise detail should lead with image and instructions, then personal performance, muscle map, history, and administrative metadata.
- Native enhancement: camera-based custom exercise imagery and voice search. Preserve file upload and text search in the PWA.

### Plans

This is the most complex management surface and should use progressive disclosure.

#### Progress

Initial Plans library checkpoint implemented for native and PWA validation.

- [x] Make the Plans tab a management and reference library instead of opening directly into plan creation.
- [x] Separate saved plans into **Active**, **Drafts & inactive**, and **Past plans** sections.
- [x] Keep the active plan contextual and secondary to Home, where the next workout and primary Start Workout action remain.
- [x] Preserve the existing plan editor and generator behind explicit **New Plan** and **Edit** actions.
- [x] Reuse existing activation, duplication, deletion, completion, extension, week-selection, AI-notes, and comparison behavior without changing plan persistence.
- [x] Keep Home focused on the active plan and move inactive and completed-plan management into Plans.
- [x] Treat completed plans as historical references: show completion as status, expose Restart/Extend/Duplicate, and require duplication before editing.
- [x] Provide an explicit, guarded return from plan creation and editing rather than relying on bottom navigation.
- [x] Separate plan status badges from consistently ordered action rows, with Delete last.
- [x] Confirm before replacing an unfinished active plan or restarting a completed plan.
- [ ] Validate empty, active-only, draft-heavy, and completed-plan libraries; duplication and deletion; editor cancel/save; comparison; and PWA layout.

- Separate the landing page into **Active**, **Drafts**, and **Completed**.
- Provide a plan summary card before exposing its full editor: duration, week, training days, focus, adherence, and next workout.
- Turn plan creation into a short staged flow: basics, schedule, workouts, progression, and review.
- Keep advanced AI import/export and schema-oriented tools in a clearly labeled advanced section.
- Replace dense inline numeric editors with consistent mobile sheets, while retaining standard inputs on desktop and PWA.
- Make activation, duplication, completion, extension, and deletion visually distinct. Only one should look primary at a time.
- Show unsaved or draft status persistently.
- Use the approved brain-and-checklist mark for the Plans page and navigation, preserving the app icon's brain perimeter in a simplified planning symbol.
- Plan comparison should emphasize differences and trends, not only raw set totals.
- Native enhancement: share and import through the native share sheet and Files document picker. The PWA retains paste, upload, copy, and download.
- Longer term: AI planning would feel more native as a guided handoff or embedded conversation, but the existing JSON import must remain available as the reliable universal path.

### Nutrition

The feature set is extensive enough that a single long page risks becoming overwhelming.

#### Progress

Initial presentation-only Nutrition checkpoint implemented for native and PWA validation.

- [x] Apply the shared page-header and raised-card visual language without changing nutrition persistence or mutation workflows.
- [x] Establish a visible Today sequence of date, calorie/macro progress, meal log, and add-food tools.
- [x] Add one prominent **Add Food** action while retaining every existing search, scan, copy, recipe, library, and manual-entry control.
- [x] Present body weight, daily goal, and creatine as consistent secondary utility cards.
- [x] Modernize meal-group surfaces while preserving expansion, editing, moving, recipe detail, and deletion behavior.
- [x] Use consistent icon-only disclosures for Today and meal sections, with a left chevron when collapsed and a down chevron when expanded.
- [x] Separate secondary utilities under **Tracking** and keep the prominent **Add Food** action directly beneath the daily summary in both disclosure states.
- [x] Separate nutrition visualization colors from the purple brand palette with consistent blue calories, teal protein, amber carbohydrates, and coral fat across cards, donut charts, legends, and calorie-history charts.
- [x] Carry the app identity into Nutrition with a simplified food-bowl navigation icon and a coordinated detailed page-header version.
- [ ] Validate dense meal logs, empty days, historical dates, Add Food from Another Day, serving edits, barcode/search flows, and PWA layout in real use.

- Divide the experience into **Today**, **Trends**, and **Library** rather than placing everything in one continuous surface.
- Today should prioritize calorie progress, macro progress, meals, and **Add food**.
- Make meal sections compact and collapsible, with totals visible while collapsed.
- Use one prominent add action that opens choices for search, barcode, recent food, recipe, or copy from another day.
- Keep body weight and calorie targets accessible, but move their management away from the daily logging flow.
- Standardize modal headers and close, cancel, and save placement across food search, barcode scanning, recipes, cropper, and library management.
- Make serving amount and unit changes faster; these are frequent, low-attention actions.
- Native enhancements:
  - Keep camera barcode and recipe scanning.
  - Add haptic scan confirmation.
  - Consider HealthKit read/write for body weight and nutrition summaries, only with granular opt-in and clear source labeling.
  - Use native camera and photo pickers.
- PWA fallback: manual UPC entry, file upload, text or OCR import where supported, and identical food-editing capability.

### History and workout details

- Provide a unified History destination or a clearly labeled route from Home. History currently appears contextually through the calendar or individual workout/template flows.
- Add filters for date range, plan, workout, and exercise.
- Replace plain chronological rows with summary cards showing duration, exercise/set count, notable PRs, and plan/week.
- Make deletion secondary and visually separate from opening an entry.
- In completed workout detail, show summary first, detailed sets second, and notes last.
- Keep historical-set correction available, but make edit mode explicit and identify corrected data.
- Add an exercise-centric trend view reachable directly from a completed exercise.
- Native enhancement: share a concise workout summary card as an image or text. The PWA gets equivalent download and copy actions.

### Settings

Settings currently combines routine preferences with synchronization recovery, migration tools, equipment inventory, and exports.

- Group it into **Account**, **App**, **Workout**, **Equipment**, **Data & Sync**, and **Advanced**.
- Keep routine preferences near the top; put destructive recovery and migration controls behind **Advanced**.
- Replace multiple sync messages with a clear state model:
  - Synced
  - Changes waiting
  - Syncing
  - Offline
  - Attention required
- Explain the difference between **Sync Now** and **Pull Latest**, especially whether pulling can replace newer local state.
- Put equipment and plate inventory on a dedicated settings subpage.
- Put exports on a dedicated **Data & Export** subpage.
- Add native permission-status rows for notifications, camera, Live Activities, HealthKit if adopted, and background behavior. Each should link to iOS Settings when necessary.
- Keep PWA install and update status clearly separate from native version and update information.

## Cross-app design system

The code currently relies heavily on inline styles and a small token set. That makes gradual visual drift likely.

A modernization pass should first define:

Initial shared primitives now exist for page headers, section cards, section headings, status pills, and primary/secondary actions. They are intentionally limited to the Home modernization checkpoint and should be expanded only as subsequent pages are validated.

- A restrained semantic palette with light and dark modes.
- Consistent typography roles: page title, section heading, body, label, and metadata.
- Spacing, radius, elevation, divider, and icon-size scales.
- Standard components for page headers, cards, list rows, chips, segmented controls, banners, bottom sheets, dialogs, empty states, and sticky action bars.
- Minimum 44×44px touch targets.
- Consistent Save, Cancel, and Close placement.
- Motion rules that respect reduced-motion preferences.
- Dynamic Type-friendly layouts and WCAG-compliant contrast.

The current purple accent can remain as brand identity, but it should be applied selectively rather than competing with status colors.

## Native and PWA product rule

Every feature should fall into one of these categories:

| Capability | Native | PWA |
| --- | --- | --- |
| Core logging, plans, history, and nutrition | Full functionality | Full functionality |
| Timer and reminders | Live Activity, local notifications, and haptics | In-app timer and web notifications where supported |
| Scanning and images | Native camera and photo picker | Browser camera, file picker, and manual entry |
| Sharing and import | Native share and Files sheets | Upload, download, and copy |
| Biometrics | Secure session unlock | Normal authenticated session |
| Health integration | Optional HealthKit | Manual and cloud data |
| Watch and lock screen | Convenience controls | No equivalent required |

“No equivalent required” should apply only to convenience enhancements. It should never block access to core data or actions in the PWA.

## Recommended implementation priority

1. Active workout session and rest timer.
2. Shared design system and accessibility baseline.
3. Home/Today hierarchy and workout launch.
4. Nutrition information architecture.
5. Plans progressive disclosure.
6. Exercise library consistency.
7. History and trends.
8. Settings reorganization.
9. Additional native integrations such as biometrics, HealthKit, and Watch controls.

This sequence should deliver the largest everyday improvement while minimizing the risk of functional regression.

## Implementation guardrails

As work proceeds step by step:

- Preserve all current data and workflows.
- Make each change independently reviewable and reversible.
- Test the native app and PWA for every meaningful workflow change.
- Avoid making native-only functionality the sole route to an action or data.
- Validate changes at real phone dimensions and with keyboard, screen reader, larger text, reduced motion, offline mode, and interrupted synchronization where applicable.
- Prefer shared primitives and patterns over isolated page-specific styling.
- Distinguish visual restructuring from behavior changes so regressions are easier to identify.
