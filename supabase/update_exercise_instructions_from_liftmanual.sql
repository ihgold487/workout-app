-- Updates built-in exercise instructions from Lift Manual URLs.
-- Generated 2026-07-06T21:53:15.613Z.
-- Review before running in Supabase SQL editor.

begin;

-- Arnold Press (Dumbbells)
update public.exercises
set
  instruction_steps = array['Sit on a bench set upright with back support, or stand. Hold a dumbbell in each hand at shoulder level with palms facing your body (like the top of a bicep curl).', 'Your elbows should be in front of your body and the dumbbells held close to your shoulders.', 'Tighten your core and pull your shoulders back.', 'Begin pressing the dumbbells overhead. As you press, rotate your wrists outward so that at lockout, your palms face forward.', 'At the top, your arms should be fully extended overhead with palms facing forward - the same finish position as a standard shoulder press.', 'Reverse the movement by lowering the dumbbells while rotating your palms back toward your body.', 'Finish the descent with palms facing your body and elbows in front of your torso.', 'The rotation should be smooth and continuous throughout the press, not abrupt at the top or bottom.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-arnold-press/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:arnold-press-dumbbells';

-- Behind-the-Back Curls (Cable)
update public.exercises
set
  instruction_steps = array['Set a cable to the lowest pulley position with a single D-handle.', 'Stand facing the cable station with feet shoulder-width apart.', 'Grip the handle in your right hand with an underhand grip.', 'Step back slightly to create cable tension with arm extended.', 'Tighten your core and pin your right elbow against your side.', 'Curl the handle up by bending only at the elbow.', 'Squeeze your bicep hard at the top.', 'Lower the handle back down with control to full extension. Complete reps, then switch arms.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/cable-unilateral-bicep-curl/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:behind-the-back-curls-cable';

-- Bench Press (Barbell)
update public.exercises
set
  instruction_steps = array['Lie back on a flat bench with your eyes directly under the bar. Plant both feet securely on the floor and create a slight natural arch in your lower back.', 'Pull your shoulder blades down and back, pinning them to the bench. Maintain this tightness throughout every rep.', 'Grip the bar with hands slightly wider than shoulder-width. Wrap your thumbs around the bar (do not use a thumbless grip) and stack your wrists over your elbows.', 'Unrack the bar with straight arms and bring it over your chest. Take a deep breath into your belly and tighten your core.', 'Lower the bar under control to the lower portion of your chest, allowing your elbows to flare to roughly 45 to 75 degrees from your torso, not pinned to your sides and not at 90 degrees.', 'Press the bar back up and slightly toward your face, finishing with your arms straight over your shoulders. Breathe out at the top.', 'Continue for the planned reps, then rack the bar safely with the help of a spotter when working near maximum loads.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/barbell-bench-press/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:bench-press-barbell';

-- Bench Press (Dumbbells)
update public.exercises
set
  instruction_steps = array['Sit on the end of a flat bench with a dumbbell standing on each thigh.', 'Lie back while using your thighs to “kick” the dumbbells up to chest level. End with the dumbbells held just outside your shoulders, palms facing forward.', 'Plant both feet securely on the floor. Pull your shoulder blades down and back, pinning them to the bench.', 'Press both dumbbells straight up over your chest, ending with arms extended and dumbbells slightly inside your shoulders.', 'Lower the dumbbells under control to chest level. Allow your elbows to flare to roughly 45 to 75 degrees from your torso.', 'At the bottom, the dumbbells should be roughly level with your mid-chest. Stop when you feel a stretch - the longer ROM is one of the main benefits.', 'Press the dumbbells back up to lockout, exhaling as you press. The dumbbells move in a slight arc, ending closer together at the top.', 'Continue for the planned reps. To finish, return the dumbbells to your thighs and sit up safely.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-bench-press/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:bench-press-dumbbells';

-- Bench Press with Close Grip (Barbell)
update public.exercises
set
  instruction_steps = array['Lie on a flat bench. Grip the barbell with hands roughly shoulder-width apart (or slightly narrower - but not so narrow that wrists strain).', 'Unrack the bar.', 'Lower the bar to your lower chest, keeping your elbows close to your body.', 'Press the bar up to lockout, focusing on extending at the elbows.', 'Squeeze your triceps at the top.', 'Maintain your elbows tucked at about 30 degrees from your torso.', 'Use moderate weight. Aim for 6 to 10 reps per set.', 'Avoid extremely narrow grips that strain the wrists.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/barbell-close-grip-bench-press/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:bench-press-with-close-grip-barbell';

-- Bent-Over Lateral Raises (Dumbbells)
update public.exercises
set
  instruction_steps = array['Stand with feet hip-width apart, holding a dumbbell in each hand at your sides with palms facing your body.', 'Hinge forward at the hips with a slight knee bend until your torso is roughly parallel to the floor.', 'Let the dumbbells hang straight down with palms facing each other (neutral grip).', 'Tighten your core and lock in your back angle. Maintain your back flat throughout.', 'Set a slight bend in your elbows and maintain it. Pull your shoulder blades back as you lift.', 'Lift both dumbbells out to your sides by squeezing your rear delts. Lead with your elbows.', 'Continue until your upper arms are roughly parallel to the floor. Your hands should be at shoulder level.', 'Pause briefly at the top, then lower under control back to the hanging start position. Use light weight - strict form is critical.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-rear-lateral-raise/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:bent-over-lateral-raises-dumbbells';

-- Bent-Over One-Arm Rows (Landmine)
update public.exercises
set
  instruction_steps = array['Position a barbell in front of you. Stand with feet hip-width apart in a slight stagger.', 'Hinge forward at the hips. Grip the barbell at its center with your right hand.', 'Place your left hand on a bench or your left thigh for support.', 'Let the bar hang at arm’s length. Tighten your core hard against rotation.', 'Row the bar up to your right hip by driving your right elbow back.', 'Squeeze your right lat at the top. Pause briefly.', 'Lower under control. Maintain bar balance throughout.', 'Complete all reps on the right, then switch sides.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/barbell-one-arm-bent-over-row/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:bent-over-one-arm-rows-barbell';

-- Bent-Over Rows (Barbell)
update public.exercises
set
  instruction_steps = array['Stand with feet hip-width apart in front of a loaded barbell on the floor.', 'Hinge at the hips and bend your knees slightly to grip the bar with hands just outside your knees, using a double-overhand grip.', 'Stand up with the bar, then hinge forward at the hips again until your torso is roughly 45 degrees from horizontal - not parallel to the floor (that puts more strain on the lower back).', 'Let the bar hang at arm’s length just below your knees. Tighten your core, pull your shoulders down and back, and lock in your back angle.', 'Pull the bar to your lower chest or upper abdomen by driving your elbows up and back. Squeeze your shoulder blades together at the top.', 'Pause briefly with the bar against your body, then lower it under control back to the start position.', 'Maintain the same torso angle throughout the entire set - do not rock or use momentum.', 'Continue for the planned reps, then lower the bar to the floor between sets if needed.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/barbell-bent-over-row/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:bent-over-rows-barbell';

-- Bent-Over Rows (Dumbbells)
update public.exercises
set
  instruction_steps = array['Stand with feet hip-width apart and a dumbbell in each hand at your sides, palms facing your body.', 'Hinge forward at the hips with a slight knee bend until your torso is roughly 45 degrees from horizontal.', 'Let the dumbbells hang straight down at arm’s length. Tighten your core, pull your shoulders down and back, and lock in your back angle.', 'Row both dumbbells up toward your hips by driving your elbows up and back. Maintain your elbows tracking close to your body.', 'Squeeze your shoulder blades together at the top of the row.', 'Pause briefly, then lower the dumbbells under control back to the starting hang position. Feel a stretch in your lats at the bottom.', 'Maintain the same torso angle throughout the set - do not stand up between reps.', 'Continue for the planned reps. Stand up and rest the dumbbells between sets.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-bent-over-row/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:bent-over-rows-dumbbells';

-- Bent-Over Rows with Reverse Grip (Barbell)
update public.exercises
set
  instruction_steps = array['Stand with feet hip-width apart in front of a loaded barbell on the floor.', 'Hinge at the hips and grip the bar with an underhand (supinated) grip, hands roughly shoulder-width apart.', 'Stand up with the bar, then hinge forward at the hips until your torso is at roughly 60 to 70 degrees from horizontal - more upright than a standard bent over row.', 'Let the bar hang at arm’s length. Tighten your core and lock in your back angle.', 'Row the bar to your lower abdomen by driving your elbows back along your sides. Maintain elbows close to your body.', 'Squeeze your lats and lower traps at the top. Pause briefly.', 'Lower the bar under control. Maintain the same torso angle throughout.', 'Continue for the planned reps.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/barbell-reverse-grip-bent-over-row/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:bent-over-rows-with-reverse-grip-barbell';

-- Bent-Over Rows with Reverse Grip (Dumbbells)
update public.exercises
set
  instruction_steps = array['Stand with feet hip-width apart holding dumbbells with an underhand grip (palms forward).', 'Hinge at the hips to roughly 45 degrees. Back flat.', 'Let the dumbbells hang with arms extended.', 'Row both dumbbells toward your hips, driving your elbows back along your sides.', 'Squeeze your lats at the top.', 'Lower under control.', 'The underhand grip recruits the biceps and lower lats.', 'Use moderate weight. Aim for 10 to 12 reps.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-bent-over-reverse-row/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:bent-over-rows-with-reverse-grip-dumbbells';

-- Bent-Over Rows with Wide Grip (Barbell)
update public.exercises
set
  instruction_steps = array['Stand with feet hip-width apart. Grip a barbell with a wide overhand grip (1.5 to 2 times shoulder-width).', 'Hinge at the hips until your torso is roughly 45 degrees to the floor.', 'Let the bar hang with arms extended.', 'Row the bar toward your upper chest with elbows flared wide - elbows point to the sides.', 'Squeeze your upper back and rear delts at the top.', 'Lower under control.', 'The wide grip and high touch point targets the upper back more than the lats.', 'Use moderate weight. Aim for 10 to 12 reps.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/barbell-bent-over-wide-grip-row/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:bent-over-rows-with-wide-grip-barbell';

-- Bulgarian Split Squats (Barbell)
update public.exercises
set
  instruction_steps = array['Set a barbell across your upper traps. Unrack and step back.', 'Step your right foot back into a split stance two to three feet behind you.', 'This is your fixed position for the set.', 'Lower your right knee toward the floor by bending both knees.', 'Descend until your right knee is just above the floor.', 'Drive through your front (left) foot to return to the top of the split stance.', 'Complete reps, then switch which foot is forward.', 'Use moderate weight. Aim for 8 to 10 reps per leg.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/barbell-single-leg-split-squat/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:bulgarian-split-squats-barbell';

-- Bulgarian Split Squats (Dumbbells)
update public.exercises
set
  instruction_steps = array['Stand roughly two to three feet in front of a flat bench with a dumbbell in each hand at your sides.', 'Place the top of your right foot (laces down) on the bench behind you. Your left foot is planted flat on the floor, far enough forward that when you lunge down, your left shin stays close to vertical.', 'Stand tall with chest up and core braced. Pull your shoulders back.', 'Lower your body straight down by bending the front (left) knee. Your back (right) knee should travel down toward the floor.', 'Descend until your front thigh is roughly parallel to the floor. Your back knee should approach the floor without slamming into it.', 'Drive through your front foot to push back up to the starting position.', 'Complete all reps on the left leg, then switch and elevate your left foot to work the right leg.', 'Maintain your torso mostly upright. A slight forward lean is acceptable but avoid hunching.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-bulgarian-split-squat/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:bulgarian-split-squats-dumbbells';

-- Chin-Ups (Bodyweight)
update public.exercises
set
  instruction_steps = array['Attach a weight plate to a dip belt and clip the belt around your waist. Alternatively, wear a weighted vest.', 'Reach up and grip a sturdy pull-up bar with an underhand (supinated) grip, hands roughly shoulder-width apart.', 'Hang with arms fully extended, feet off the floor. Cross your ankles behind you so the weight stays steady.', 'Pull your shoulder blades down and back. Tighten your core hard.', 'Pull your body up by driving your elbows down toward your ribs. Lead with your chest.', 'Continue until your chin clears the bar. Squeeze your lats and biceps hard at the top.', 'Lower yourself with control under control to a full hang with arms completely straight.', 'Add weight in small increments (2.5 to 10 lbs). Aim for 3 to 8 reps per set with weight.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/weighted-chin-up/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:chin-ups-bodyweight';

-- Concentration Curls (Dumbbells)
update public.exercises
set
  instruction_steps = array['Sit on the end of a flat bench with your feet wide apart and a dumbbell on the floor between your legs.', 'Pick up the dumbbell with your right hand and lean forward slightly. Tighten the back of your right upper arm against the inside of your right thigh, just above the knee.', 'Let the dumbbell hang straight down. Place your left hand on your left knee for stability.', 'Curl the dumbbell up by bending only at the elbow. Maintain your upper arm completely still - only your forearm moves.', 'Continue until the dumbbell reaches shoulder height or just under your chin. Squeeze your bicep hard for one to two seconds at the top.', 'Lower the dumbbell under control over a count of two to three seconds. Fully extend your arm at the bottom.', 'Complete all reps on the right side, then switch to the left.', 'Maintain your back flat - do not round excessively.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-concentration-curl/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:concentration-curls-dumbbells';

-- Crunches (Bodyweight)
update public.exercises
set
  instruction_steps = array['Lie on your back with knees bent, feet flat. Hold one dumbbell with both hands.', 'Extend your arms straight above your chest, locked out.', 'Tighten your core. Press your lower back into the floor.', 'Crunch up by flexing your spine. The dumbbell remains directly above your chest - arms stay straight.', 'Lift your shoulders off the floor.', 'Squeeze your abs at the top.', 'Lower under control.', 'Use moderate weight. Aim for 12 to 15 reps.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-straight-arm-crunch/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:crunches-bodyweight';

-- Curls (Barbell)
update public.exercises
set
  instruction_steps = array['Stand tall with feet hip-width apart, holding a barbell with an underhand (supinated) grip just outside shoulder-width. Wrap your thumbs around the bar.', 'Let the bar hang at arm’s length in front of your thighs. Pull your shoulders back and tighten your core.', 'Pin your elbows against your sides. They should not move forward or backward during the lift.', 'Curl the bar up by bending only at the elbows, contracting your biceps hard. Maintain your wrists straight (not bent back).', 'Continue until the bar reaches shoulder height. Squeeze your biceps for one second at the top.', 'Lower the bar under control back to the start position over a count of two seconds. Fully extend your arms at the bottom.', 'Do not swing your torso, lean back, or use momentum. Strict form is what builds bicep size.', 'Continue for the planned reps. Use an EZ bar instead if a straight barbell bothers your wrists.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/barbell-curl/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:curls-barbell';

-- Curls (Cable)
update public.exercises
set
  instruction_steps = array['Attach a straight bar, EZ bar, or rope handle to a low cable pulley.', 'Stand facing the cable machine with feet hip-width apart. Grip the bar with an underhand (supinated) grip, hands shoulder-width apart.', 'Step back slightly so the cable is under tension with your arms fully extended. Stand tall.', 'Pull your shoulders back, tighten your core, and pin your elbows against your sides.', 'Curl the bar up by bending only at the elbows. Maintain your elbows pinned to your sides.', 'Continue until the bar reaches shoulder height. Squeeze your biceps hard for one second.', 'Lower the bar under control over two seconds. Maintain constant cable tension - do not let the weight stack touch down.', 'Continue for the planned reps.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/cable-curl/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:curls-cable';

-- Curls (Dumbbells)
update public.exercises
set
  instruction_steps = array['Stand tall with feet hip-width apart, holding a dumbbell in each hand at your sides with palms facing your body.', 'Pull your shoulders back and tighten your core. Pin your elbows against your sides.', 'Curl both dumbbells up by bending at the elbows. As you curl, rotate your wrists outward so your palms face your shoulders at the top.', 'Continue until the dumbbells reach shoulder height with palms facing fully forward. Squeeze your biceps for one second at the top.', 'Lower the dumbbells under control over a count of two seconds, rotating your wrists back to neutral as you descend.', 'Fully extend your arms at the bottom before the next rep. Do not stop short of lockout.', 'Maintain your elbows pinned to your sides the entire time. Do not swing or use momentum.', 'Continue for the planned reps.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-biceps-curl/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:curls-dumbbells';

-- Curls (one arm) (Cable)
update public.exercises
set
  instruction_steps = array['Set a cable to the lowest pulley position with a single D-handle.', 'Stand facing the cable station with feet shoulder-width apart.', 'Grip the handle in your right hand with an underhand grip.', 'Step back slightly to create cable tension with arm extended.', 'Tighten your core and pin your right elbow against your side.', 'Curl the handle up by bending only at the elbow.', 'Squeeze your bicep hard at the top.', 'Lower the handle back down with control to full extension. Complete reps, then switch arms.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/cable-unilateral-bicep-curl/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:curls-one-arm-cable';

-- Cross body curls (Dumbbells)
update public.exercises
set
  instruction_steps = array['Stand tall with feet hip-width apart, holding a dumbbell in each hand at your sides with palms facing your body.', 'Pull your shoulders back, brace your core, and pin your elbows against your sides.', 'Curl the dumbbell in your right hand up and across your body toward your left shoulder while keeping a neutral grip.', 'Finish with the dumbbell at or just below the opposite shoulder and squeeze hard for one second.', 'Lower the dumbbell under control along the same diagonal path back to the starting position.', 'After the right arm is fully extended, repeat with the left dumbbell, curling across toward your right shoulder.', 'Continue alternating sides until you complete the planned reps.', 'Keep both elbows pinned to your sides throughout. Only your forearms should move.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-cross-body-hammer-curl/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:cross-body-curls-dumbbells';

-- Deadlifts (Barbell)
update public.exercises
set
  instruction_steps = array['Load the barbell on the floor and stand with your mid-foot directly under the bar, feet roughly hip-width apart with toes slightly turned out.', 'Hinge at the hips and bend the knees to grip the bar just outside your shins. Use a double-overhand grip or a mixed grip for heavier loads.', 'Drop your hips so your shins touch the bar, lift your chest, and pull the slack out of the bar. Your shoulders should be slightly in front of the bar and your back flat.', 'Take a deep breath, tighten your core, and drive your feet through the floor. Maintain the bar in contact with your legs as it rises.', 'Lock out by standing tall with hips and knees fully extended. Do not lean back or hyperextend the lower back.', 'Reverse the movement by hinging at the hips first, then bending the knees once the bar passes them. Lower the bar under control to the floor and reset before the next rep.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/barbell-deadlift/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:deadlifts-barbell';

-- Deadlifts (Trap Bar)
update public.exercises
set
  instruction_steps = array['Step inside the trap bar and stand with feet hip-width apart, centered between the handles.', 'Hinge at the hips and bend your knees to grip the handles. Use a neutral grip (palms facing your body).', 'Most trap bars have a high-handle and low-handle position. High handles reduce range of motion and are easier on lower back; low handles add range and challenge.', 'Lift your chest, pull your shoulders down and back, and tighten your core hard. Take a deep breath in.', 'Drive your feet through the floor and stand up, keeping the bar in line with your body and your back flat throughout.', 'Lock out by standing tall with hips and knees fully extended. Squeeze your glutes - do not lean back.', 'Reverse the movement by pushing your hips back first, then bending your knees once the bar passes them.', 'Lower the bar under control to the floor and reset before the next rep.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/trap-bar-deadlift/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:deadlifts-trap-bar';

-- Decline Bench Press (Barbell)
update public.exercises
set
  instruction_steps = array['Set up on a fixed decline bench or set an adjustable bench to a decline of roughly 15 to 30 degrees. Lock your feet under the leg pads.', 'Lie back with your eyes roughly under the bar. Grip the bar slightly wider than shoulder-width with thumbs wrapped.', 'Have a spotter help you unrack - the angle makes self-unracking trickier than flat bench.', 'Pull your shoulder blades down and back into the bench, tighten your core, and lift your chest.', 'Lower the bar under control to your lower chest, allowing your elbows to flare to roughly 45 to 70 degrees.', 'Press the bar back up and slightly toward your face, finishing with arms locked out over your lower chest. Breathe out as you press.', 'For each rep, control the descent - the decline angle makes the bar drop fast if you let it.', 'Have a spotter help re-rack the bar at the end of the set.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/barbell-decline-bench-press/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:decline-bench-press-barbell';

-- Decline Bench Press (Dumbbells)
update public.exercises
set
  instruction_steps = array['Set an adjustable bench to a decline of roughly 15 to 30 degrees. Lock your feet under the bench’s leg pads.', 'Have a partner hand you the dumbbells, or carefully kick them up from your thighs as you lie back.', 'Start with the dumbbells held just outside your shoulders, palms facing forward.', 'Pull your shoulder blades down and back, plant yourself securely against the bench, and tighten your core.', 'Press both dumbbells up and slightly together, ending with arms extended directly above your lower chest.', 'Lower the dumbbells under control until they are level with your lower chest, allowing your elbows to flare to roughly 45 to 70 degrees.', 'Pause briefly at the bottom, then press back up to lockout, exhaling as you press.', 'To finish, have a partner take the dumbbells or carefully roll them off your chest one at a time, then sit up.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-decline-bench-press/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:decline-bench-press-dumbbells';

-- Decline Crunches (Bodyweight)
update public.exercises
set
  instruction_steps = array['Set a decline bench to 30 to 45 degrees. Hook feet under pads.', 'Lie back on the decline. Hands behind head or across chest.', 'Crunch up - lift shoulders off the bench. Do not sit all the way up.', 'Squeeze abs at the top.', 'Lower under control.', 'Maintain constant tension - do not fully relax between reps.', 'Aim for 15 to 25 reps.', 'Less hip flexor involvement than full decline sit-ups.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/decline-crunch/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:decline-crunches-bodyweight';

-- Decline Side Crunches (Bodyweight)
update public.exercises
set
  instruction_steps = array['Lie on your back on the floor.', 'Drop both knees together to your right side, keeping shoulders flat.', 'Position your hands behind your head with elbows wide.', 'Tighten your abs hard.', 'Crunch your left obliques by lifting your shoulders off the floor.', 'Lift the left shoulder higher than the right toward the ceiling.', 'Squeeze the obliques at the top.', 'Lower back down with control. Complete reps, then switch knee position to the other side.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/oblique-crunches-floor/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:decline-side-crunches-bodyweight';

-- Decline Side Sit-Ups (Bodyweight)
update public.exercises
set
  instruction_steps = array['Set a decline bench to roughly 30 to 45 degrees. Lock your feet under the leg pads.', 'Lie back on the bench. Place your hands behind your head, fingers lightly touching.', 'Tighten your core. Lift your torso up toward your knees in a controlled sit-up motion.', 'As you reach the top, rotate your torso to the right, bringing your left elbow toward your right knee.', 'Squeeze your obliques and abs hard at the top.', 'Lower under control back to the bench.', 'On the next rep, rotate to the left, bringing your right elbow toward your left knee.', 'Continue alternating for the desired total reps.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/decline-twisting-sit-up/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:decline-side-sit-ups-bodyweight';

-- Decline Sit-Ups (Bodyweight)
update public.exercises
set
  instruction_steps = array['Set a decline bench to 30 to 45 degrees. Hook your feet under the pads.', 'Hold a dumbbell at your chest (easier) or behind your head (harder).', 'Lie back on the decline bench.', 'Sit up by flexing your spine. Drive your chest toward your knees.', 'Squeeze your abs at the top.', 'Lower under control back to the decline position.', 'Use moderate weight. Aim for 10 to 15 reps.', 'Control every rep - no momentum.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-decline-sit-up/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:decline-sit-ups-bodyweight';

-- Deficit Deadlifts (Trap Bar)
update public.exercises
set
  instruction_steps = array['Set a low platform or plates and stand on them.', 'Position a loaded trap bar around you.', 'Squat down inside the trap bar and grip the handles.', 'Tighten your core and set a flat back.', 'Drive through the legs to lift the bar off the floor.', 'Stand up tall locking out the hips.', 'Squeeze the glutes hard at the top.', 'Lower the bar back to the floor with control.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/trap-bar-deadlift-from-deficit/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:deficit-deadlifts-trap-bar';

-- Dips (Bodyweight)
update public.exercises
set
  instruction_steps = array['Attach a weight plate to a dip belt and clip the belt around your waist. Alternatively, hold a dumbbell between your feet or wear a weighted vest.', 'Mount the parallel dip bars with arms locked out, supporting your full weight plus the external load.', 'Cross your ankles behind you (or below if holding a dumbbell). Tighten your core.', 'Maintain your torso upright for tricep emphasis. Tuck your elbows close to your sides.', 'Lower your body by bending at the elbows. Descend until your upper arms are roughly parallel to the floor.', 'Press back up by extending at the elbows. Drive your hands into the bars.', 'Lock out at the top. Continue for the planned reps.', 'Add weight in small increments (5 to 10 lbs) as you get stronger. Aim for 5 to 10 reps per set.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/weighted-tricep-dips/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:dips-bodyweight';

-- Drag Curls (Barbell)
update public.exercises
set
  instruction_steps = array['Stand tall holding a barbell with an underhand grip at your thighs.', 'Pull your elbows back so the bar can drag along your body.', 'Curl the bar up by bending at the elbows, keeping the bar in contact with your torso.', 'The bar travels straight up along your body - not in an arc.', 'Continue until the bar reaches your lower chest. Your elbows pull back further as you rise.', 'Squeeze your biceps at the top.', 'Lower the bar back down along your body.', 'Use moderate weight. Aim for 10 to 12 reps.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/barbell-drag-curl/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:drag-curls-barbell';

-- Face Pulls with Rope (Cable)
update public.exercises
set
  instruction_steps = array['Anchor a resistance band at roughly face height to a sturdy pole, door frame, or squat rack.', 'Grip both ends of the band with an overhand grip. Step back until the band is under tension with arms extended.', 'Stand tall with feet shoulder-width apart. Tighten your core.', 'Pull the band back toward your face by driving your elbows up and out to the sides.', 'At the end, your hands should be wide of your ears with thumbs pointing back.', 'Squeeze your shoulder blades together hard. Hold for one second.', 'With control extend your arms forward under control. Maintain band tension throughout.', 'Continue for the planned reps. Aim for 15 to 25 reps - this is a high-rep exercise.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/band-face-pull/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:face-pulls-with-rope-cable';

-- Flys (Cable)
update public.exercises
set
  instruction_steps = array['Set two cable pulleys at chest height. Attach D-handles to each.', 'Stand between the cables. Grip both handles.', 'Step forward into a staggered stance for stability.', 'Start with arms extended to the sides at chest height, slight elbow bend.', 'Pull both handles together in front of your chest in a wide arc.', 'Squeeze your chest hard when your hands meet in front.', 'With control let the handles return to the sides under control.', 'Maintain constant tension on the cables throughout.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/cable-middle-fly/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:flys-cable';

-- Flys (Dumbbells)
update public.exercises
set
  instruction_steps = array['Lie flat on a bench with a dumbbell in each hand. Plant your feet securely on the floor and pull your shoulder blades down and back into the bench.', 'Press the dumbbells up over your chest with your palms facing each other and a soft bend in your elbows.', 'Lock that elbow bend in place. It should not change throughout the set; if your elbows straighten and bend, you are doing a press, not a fly.', 'With control lower the dumbbells out to the sides in a wide arc, leading with your elbows. Stop when your upper arms are roughly parallel to the floor or you feel a strong stretch across your chest.', 'Reverse the motion by squeezing your chest to bring the dumbbells back together over your chest. Imagine hugging a large barrel.', 'Pause briefly at the top with your pecs flexed, then continue for the planned reps.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-fly/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:flys-dumbbells';

-- Forward Lunges (Dumbbells)
update public.exercises
set
  instruction_steps = array['Stand tall with feet hip-width apart, holding a dumbbell in each hand at your sides with palms facing your body.', 'Pull your shoulders back and tighten your core. Maintain your chest tall throughout.', 'Step your right foot forward roughly two to three feet - far enough that when you lunge down, your front shin stays close to vertical.', 'Lower your back (left) knee straight down toward the floor by bending both knees together.', 'Descend until your back knee is roughly an inch above the floor. Your front thigh should be parallel to the floor.', 'Drive through your front foot to push back up to the starting position. Step your right foot back to your starting stance.', 'Repeat with the left leg stepping forward. Continue alternating until you complete the desired total reps per leg.', 'Maintain your torso upright the entire time. Do not lean forward.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-lunge/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:forward-lunges-dumbbells';

-- Front Raises (Barbell)
update public.exercises
set
  instruction_steps = array['Stand tall with feet hip-width apart. Hold a barbell across your thighs with an overhand grip, hands shoulder-width apart.', 'Tighten your core.', 'Raise the bar straight up in front of you to shoulder height.', 'Maintain arms straight (slight elbow bend).', 'Pause briefly at shoulder height.', 'Lower under control back to your thighs.', 'Do not use body english - maintain your torso still.', 'Use moderate weight. Aim for 10 to 12 reps.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/barbell-front-raise/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'manual-2026-06-09:front-raises-barbell';

-- Front Raises (Dumbbells)
update public.exercises
set
  instruction_steps = array['Stand with feet hip-width apart. Hold a dumbbell in each hand at your sides, palms facing your thighs.', 'Tighten your core. Stand tall.', 'Raise one or both dumbbells straight forward to shoulder height.', 'Maintain arms straight with a slight elbow bend.', 'Pause at shoulder height.', 'Lower under control.', 'Alternate arms or raise both simultaneously.', 'Use light to moderate weight. Aim for 10 to 12 reps.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-front-raise/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'manual-2026-06-09:front-raises-dumbbells';

-- Front Raises (EZ Curl Bar)
update public.exercises
set
  instruction_steps = array['Stand tall with feet hip-width apart. Hold a barbell across your thighs with an overhand grip, hands shoulder-width apart.', 'Tighten your core.', 'Raise the bar straight up in front of you to shoulder height.', 'Maintain arms straight (slight elbow bend).', 'Pause briefly at shoulder height.', 'Lower under control back to your thighs.', 'Do not use body english - maintain your torso still.', 'Use moderate weight. Aim for 10 to 12 reps.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/barbell-front-raise/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'manual-2026-06-09:front-raises-ez-curl-bar';

-- Front Squats (Barbell)
update public.exercises
set
  instruction_steps = array['Set the barbell in a power rack at roughly upper-chest height. Step under the bar and rest it across the front of your shoulders, in the groove just above your collarbones.', 'Cross your arms in front of the bar (bodybuilding grip) or use a clean grip with fingertips under the bar and elbows pointing straight forward.', 'Drive your elbows up so your upper arms are roughly parallel to the floor. This is what keeps the bar from rolling forward.', 'Unrack the bar, take two steps back, and set your feet shoulder-width apart with toes slightly turned out.', 'Tighten your core hard and breathe in. Maintain your elbows up and your chest tall throughout the entire lift.', 'Sit straight down by bending at the knees and hips simultaneously. Your torso should stay much more upright than in a back squat.', 'Descend until your hip crease drops below the top of your knee (parallel or deeper). Drive through your full foot to stand back up, keeping the elbows up the whole way.', 'Continue for the planned reps, then carefully rack the bar.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/barbell-front-squat/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:front-squats-barbell';

-- Goblet Split Squat (Dumbbells)
update public.exercises
set
  instruction_steps = array['Hold a dumbbell vertically at your chest (goblet position).', 'Step one foot forward into a split stance.', 'This is your fixed position.', 'Lower your back knee toward the floor by bending both knees.', 'Descend until your back knee is just above the floor.', 'Drive through your front foot to stand back up.', 'Complete reps, then switch feet.', 'Maintain torso upright throughout.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-goblet-split-squat/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'manual-2026-06-17:goblet-split-squat-dumbbells';

-- Goblet Squat 2 Sec Hold (Dumbbells)
update public.exercises
set
  instruction_steps = array['Hold a dumbbell vertically at your chest with both hands cupping the top end.', 'Stand with feet shoulder-width apart.', 'Tighten your core hard.', 'Squat down by sitting back and bending the knees deeply.', 'Continue down until your thighs are parallel to the floor or deeper.', 'Hold the bottom position for a full two seconds with tight bracing.', 'Maintain an upright torso and tight core throughout the pause.', 'Drive up explosively from the dead-stop bottom position.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-goblet-2-sec-hold-squat/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'manual-2026-06-17:goblet-squat-2-sec-hold-dumbbells';

-- Goblet Squat Jump (Dumbbells)
update public.exercises
set
  instruction_steps = array['Hold a kettlebell at your chest by the horns with both hands.', 'Stand with feet shoulder-width apart.', 'Tighten your core and pull your elbows down to maintain the kettlebell tight.', 'Squat down by bending your knees and pushing your hips back.', 'Continue down until your thighs are parallel to the floor.', 'Drive up explosively, jumping off the floor with the kettlebell still at your chest.', 'Land softly on the balls of your feet with knees slightly bent.', 'Immediately lower into the next squat. Continue for the duration of the set.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/kettlebell-goblet-squat-jump/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'manual-2026-06-17:goblet-squat-jump-dumbbells';

-- Goblet Squats (Dumbbells)
update public.exercises
set
  instruction_steps = array['Hold a dumbbell vertically against your chest with both hands cupping the underside of the top dumbbell head, like holding a goblet.', 'Stand with feet just outside shoulder-width and toes slightly turned out. Pin your elbows down toward your ribs.', 'Tighten your core hard and take a deep breath. Maintain the dumbbell pressed securely against your chest throughout.', 'Initiate the squat by sitting your hips down and back. Push your knees out toward your toes as you descend.', 'Squat down until your elbows touch the inside of your knees, or until your hip crease drops below the top of your knee.', 'Pause briefly at the bottom, then drive through your full foot to stand back up.', 'Squeeze your glutes at the top and reset your breath before the next rep.', 'Maintain your chest tall and the dumbbell tight against your body the entire time.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-goblet-squat/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:goblet-squats-dumbbells';

-- Good Mornings (Barbell)
update public.exercises
set
  instruction_steps = array['Set the barbell in a power rack at upper-chest height. Step under the bar and rack it across your upper back, in the same position as a low-bar back squat.', 'Unrack the bar with a slight knee bend, take two to three small steps back, and set your feet hip-width apart.', 'Soft-bend your knees and lock that knee angle for the entire lift. The knees should not change angle as you hinge.', 'Tighten your core hard, lift your chest, and pull your shoulders back. Take a deep breath.', 'Hinge forward at the hips by pushing your butt back. Let your torso angle forward while keeping the bar in solid contact with your back and your back flat.', 'Lower until your torso is roughly parallel to the floor or until you feel a strong stretch in your hamstrings - whichever comes first. Do not round the lower back.', 'Drive your hips forward to stand back up, contracting your glutes and hamstrings. Lock out tall.', 'Continue for the planned reps. Use much lighter weights than you would for squats - this lift is harder than it looks.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/barbell-good-morning/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:good-mornings-barbell';

-- Hammer Curls (Dumbbells)
update public.exercises
set
  instruction_steps = array['Stand tall with feet hip-width apart, holding a dumbbell in each hand at your sides with palms facing your body (neutral grip).', 'Pull your shoulders back, tighten your core, and pin your elbows against your sides.', 'Curl both dumbbells up by bending only at the elbows. Maintain your wrists in the neutral position throughout - palms face each other the entire time.', 'Continue until the dumbbells reach shoulder height. Squeeze hard for one second at the top.', 'Lower the dumbbells under control over two seconds, maintaining the neutral wrist position.', 'Fully extend your arms at the bottom before the next rep.', 'Maintain elbows pinned and torso upright the entire time. Do not swing.', 'Continue for the planned reps.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-hammer-curl/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:hammer-curls-dumbbells';

-- Hammer Curls (Tri bar) (EZ Curl Bar)
update public.exercises
set
  instruction_steps = array['Stand tall with feet hip-width apart.', 'Grab an Olympic bar at the inside of the bar with palms facing each other.', 'Hold the bar in front of your thighs with arms extended.', 'Tighten your core and maintain your chest up.', 'Pin your elbows at your sides.', 'Curl the bar up toward your shoulders.', 'Squeeze the brachialis and biceps at the top.', 'Lower the bar with control back to the start.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/olympic-barbell-hammer-curl/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:hammer-curls-tri-bar-ez-curl-bar';

-- Hanging Leg Raises (Bodyweight)
update public.exercises
set
  instruction_steps = array['Hang from a pull-up bar with arms extended. Overhand grip.', 'Raise your legs in front of you - bent knees (easier) or straight legs (harder).', 'Lift to at least horizontal.', 'Lower under control. Do not swing.', 'Add a hip curl at the top for maximum lower ab activation.', 'If swinging occurs, use shorter range or bent knees.', 'Aim for 10 to 15 reps.', 'Builds grip alongside ab strength.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/hanging-leg-raise/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:hanging-leg-raises-bodyweight';

-- Hanging Leg Raises with Twist (Bodyweight)
update public.exercises
set
  instruction_steps = array['Hang from a pull-up bar with a shoulder width grip.', 'Allow the body to hang in a straight line.', 'Tighten the core and maintain the legs together.', 'Lift the straight legs up and across to one side.', 'Continue lifting until the toes pass the opposite hip.', 'Squeeze the obliques hard at the top.', 'Lower with control to the start.', 'Alternate sides each rep or work one side at a time.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/hanging-straight-twisting-leg-hip-raise/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:hanging-leg-raises-with-twist-bodyweight';

-- High Cable Flys (Cable)
update public.exercises
set
  instruction_steps = array['Set both cable pulleys to roughly chest height (or slightly higher for a high-cable fly biased toward the lower chest).', 'Attach a single-handle (D-handle) to each pulley. Grip one handle in each hand and step forward to the center of the cable station.', 'Stagger your stance for stability - one foot slightly forward. Lean your torso forward slightly.', 'Start with arms out to the sides at chest height, elbows slightly bent. The cables should be under tension at the start.', 'Tighten your core and pull your shoulders down and back.', 'Pull both handles together in a wide arc in front of your body. Maintain the slight elbow bend fixed throughout - do not press.', 'Bring the handles together in front of your chest. Squeeze your chest hard for one second.', 'With control let the handles travel back out under control to the starting position. Feel the stretch in your chest at the end of each rep.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/cable-standing-fly/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:high-cable-flys-cable';

-- Hip Thrusts (Barbell)
update public.exercises
set
  instruction_steps = array['Sit on the floor with your upper back against the long edge of a bench. The bench should hit just below your shoulder blades.', 'Roll a loaded barbell over your legs until it sits in the crease of your hips. Use a barbell pad or folded towel for comfort.', 'Plant your feet flat on the floor about hip-width apart, with your shins close to vertical when your hips are at the top of the lift. Adjust your foot position so this is the case.', 'Tighten your core and tuck your chin slightly. Drive through your heels and push your hips straight up.', 'At the top, your torso and thighs should form a straight line parallel to the floor. Squeeze your glutes hard for one second.', 'Lower your hips under control until they are just above the floor, then drive back up. Do not let the bar rest on the floor between reps.', 'Continue for the planned reps, then carefully roll the bar off your hips.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/barbell-hip-thrust/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:hip-thrusts-barbell';

-- Hyperextensions on Roman Chair (Bodyweight)
update public.exercises
set
  instruction_steps = array['Set up on a 45-degree hyperextension bench. Adjust the pad so it sits just below your hip bones, with your feet locked under the foot pads.', 'Hold a weight plate or dumbbell against your chest with both arms crossed over it.', 'Tighten your core hard and lock in your back angle.', 'Start with your torso angled up so your body forms a roughly straight line from heels to head.', 'Hinge forward at the hips by lowering your torso toward the floor. Maintain your back flat - do not round.', 'Lower until your torso is roughly perpendicular to the floor or until you feel a strong stretch in your hamstrings.', 'Reverse the movement by squeezing your glutes and hamstrings to bring your torso back up to the straight-line position.', 'Do not hyperextend (overarch) the lower back at the top. Continue for the planned reps. Increase load progressively over time.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/weighted-hyperextension/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:hyperextensions-on-roman-chair-bodyweight';

-- Incline Bench Hex Press (Dumbbells)
update public.exercises
set
  instruction_steps = array['Set an incline bench to 30 to 45 degrees. Lie back with a dumbbell in each hand.', 'Press the dumbbells together at your chest. Maintain firm inward pressure.', 'Press both dumbbells up together to lockout, keeping them in contact the entire time.', 'Squeeze hard at the top - both the press and the inward squeeze.', 'Lower under control. Maintain squeezing.', 'Do not let the dumbbells separate at any point.', 'Use lighter weight than standard incline press due to the squeeze demand.', 'Aim for 10 to 12 reps per set.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-incline-squeeze-press/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:incline-bench-hex-press-dumbbells';

-- Incline Bench Press (Barbell)
update public.exercises
set
  instruction_steps = array['Set an adjustable bench or use a fixed incline bench at roughly 30 to 45 degrees. 30 degrees biases the chest most; steeper angles bias the shoulders.', 'Lie back on the bench with your eyes directly under the bar. Plant both feet securely on the floor.', 'Grip the bar with hands slightly wider than shoulder-width. Wrap your thumbs around the bar.', 'Pull your shoulder blades down and back into the bench, lift your chest, and tighten your core.', 'Unrack the bar with straight arms and bring it over your upper chest. Take a deep breath in.', 'Lower the bar under control to your upper chest, allowing your elbows to flare to roughly 45 to 75 degrees from your torso.', 'Press the bar back up and slightly toward your face, finishing with arms locked out over your upper chest. Breathe out as you press.', 'Rack the bar safely with the help of a spotter when working near maximum loads.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/barbell-incline-bench-press/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:incline-bench-press-barbell';

-- Incline Bench Press (Dumbbells)
update public.exercises
set
  instruction_steps = array['Set an adjustable bench to roughly 30 to 45 degrees. Lower angles (30 degrees ) bias the chest more; steeper angles (45 degrees +) bias the shoulders more.', 'Sit on the bench with a dumbbell on each thigh. Lean back while kicking the dumbbells up to your shoulders.', 'Plant your feet flat on the floor, pull your shoulder blades down and back into the bench, and lift your chest.', 'Start with the dumbbells just outside your shoulders, palms facing forward.', 'Press both dumbbells up and slightly together, ending with arms extended directly above your upper chest.', 'Lower the dumbbells under control until they are roughly level with your upper chest, allowing your elbows to flare to about 45 to 70 degrees.', 'Pause briefly at the bottom to feel the stretch, then press back up to lockout, exhaling as you press.', 'Continue for the planned reps. To finish, bring the dumbbells to your thighs and sit up safely.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-incline-bench-press/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:incline-bench-press-dumbbells';

-- Incline Bench Press 20° (Dumbbells)
update public.exercises
set
  instruction_steps = array['Set an adjustable bench to 20 degrees. This lower incline keeps more emphasis on the upper chest than a steep incline.', 'Sit on the bench with a dumbbell on each thigh. Lean back while kicking the dumbbells up to your shoulders.', 'Plant your feet flat on the floor, pull your shoulder blades down and back into the bench, and lift your chest.', 'Start with the dumbbells just outside your shoulders, palms facing forward.', 'Press both dumbbells up and slightly together, ending with arms extended directly above your upper chest.', 'Lower the dumbbells under control until they are roughly level with your upper chest, allowing your elbows to flare to about 45 to 70 degrees.', 'Pause briefly at the bottom to feel the stretch, then press back up to lockout, exhaling as you press.', 'Continue for the planned reps. To finish, bring the dumbbells to your thighs and sit up safely.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-incline-bench-press/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:incline-bench-press-20-dumbbells';

-- Incline Bench Press 60° (Dumbbells)
update public.exercises
set
  instruction_steps = array['Set an adjustable bench to 60 degrees. This steeper incline shifts more work toward the front delts while still training the upper chest.', 'Sit on the bench with a dumbbell on each thigh. Lean back while kicking the dumbbells up to your shoulders.', 'Plant your feet flat on the floor, pull your shoulder blades down and back into the bench, and lift your chest.', 'Start with the dumbbells just outside your shoulders, palms facing forward.', 'Press both dumbbells up and slightly together, ending with arms extended above your upper chest and shoulders.', 'Lower the dumbbells under control until they are roughly level with your upper chest, allowing your elbows to flare to about 45 to 70 degrees.', 'Pause briefly at the bottom to feel the stretch, then press back up to lockout, exhaling as you press.', 'Continue for the planned reps. To finish, bring the dumbbells to your thighs and sit up safely.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-incline-bench-press/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:incline-bench-press-60-dumbbells';

-- Incline Curls (Dumbbells)
update public.exercises
set
  instruction_steps = array['Set an adjustable bench to roughly 45 to 60 degrees. Sit back with a dumbbell in each hand.', 'Let your arms hang straight down at your sides, with palms facing forward (supinated grip).', 'Pull your shoulders back into the bench. Pin your elbows against your sides - they should not drift forward during the curl.', 'Curl both dumbbells up by bending only at the elbows. Maintain your shoulders pinned to the bench.', 'Continue until the dumbbells reach shoulder height. Squeeze your biceps for one second at the top.', 'Lower the dumbbells under control over a count of two to three seconds. Allow your arms to fully extend.', 'Feel the deep stretch in your biceps at the bottom - this is the key benefit of the incline angle.', 'Continue for the planned reps. Use moderate weight; form and stretch are the priorities.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-incline-curl/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:incline-curls-dumbbells';

-- Incline Flys (Dumbbells)
update public.exercises
set
  instruction_steps = array['Set an adjustable bench to roughly 30 to 45 degrees. Sit with a dumbbell in each hand and lie back.', 'Press the dumbbells up over your upper chest with arms fully extended, palms facing each other.', 'Plant your feet flat on the floor. Pull your shoulders down and back into the bench. Lift your chest.', 'Set a slight bend in your elbows and lock that angle in throughout the movement.', 'Lower both dumbbells out to your sides in a wide arc. Maintain the slight elbow bend fixed.', 'Continue lowering until you feel a deep stretch in your upper chest. Your arms should be roughly level with or slightly below the bench.', 'Reverse the arc by squeezing your chest to bring the dumbbells back together over your upper chest.', 'Squeeze your chest hard at the top. Continue for the planned reps. Use moderate weight - stretch and contraction quality are the priorities.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-incline-fly/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:incline-flys-dumbbells';

-- Incline Flys 20-deg (Dumbbells)
update public.exercises
set
  instruction_steps = array['Set an adjustable bench to 20 degrees. This low incline keeps the fly focused on the upper chest without turning it into a shoulder-dominant movement.', 'Sit with a dumbbell in each hand and lie back.', 'Press the dumbbells up over your upper chest with arms fully extended, palms facing each other.', 'Plant your feet flat on the floor. Pull your shoulders down and back into the bench. Lift your chest.', 'Set a slight bend in your elbows and lock that angle in throughout the movement.', 'Lower both dumbbells out to your sides in a wide arc. Maintain the slight elbow bend fixed.', 'Continue lowering until you feel a deep stretch in your upper chest. Your arms should be roughly level with or slightly below the bench.', 'Reverse the arc by squeezing your chest to bring the dumbbells back together over your upper chest.', 'Squeeze your chest hard at the top. Continue for the planned reps. Use moderate weight - stretch and contraction quality are the priorities.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-incline-fly/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:incline-flys-20-deg-dumbbells';

-- Incline Hammer Curls (Dumbbells)
update public.exercises
set
  instruction_steps = array['Set an adjustable bench to roughly 45 to 60 degrees. Sit back with a dumbbell in each hand.', 'Let your arms hang straight down at your sides with palms facing each other (neutral/hammer grip).', 'Pull your shoulders back into the bench. Pin your elbows against your sides.', 'Curl both dumbbells up by bending only at the elbows. Maintain your wrists in the neutral position the entire time.', 'Continue until the dumbbells reach shoulder height. Squeeze hard for one second at the top.', 'Lower the dumbbells under control over two to three seconds, maintaining the neutral grip.', 'Allow your arms to fully extend at the bottom - feel the deep stretch in your brachialis and outer biceps.', 'Continue for the planned reps.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-incline-hammer-curl/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:incline-hammer-curls-dumbbells';

-- Incline Lateral Raises (Dumbbells)
update public.exercises
set
  instruction_steps = array['Set a bench to a 30 to 45 degree incline.', 'Lie on your side on the bench with your bottom arm bent under your head.', 'Hold a dumbbell in your top hand with palm facing down toward your hip.', 'Tighten your core and pull your shoulder back.', 'Maintain a slight bend in the elbow.', 'Raise the dumbbell out to the side in a controlled arc.', 'Continue until your arm is roughly perpendicular to the floor.', 'Squeeze the side delt at the top, then lower with control to the starting position. Switch sides.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-incline-one-arm-lateral-raise/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:incline-lateral-raises-dumbbells';

-- Incline Reverse Flys (Dumbbells)
update public.exercises
set
  instruction_steps = array['Set an adjustable bench to roughly 30 to 45 degrees.', 'Lie face down on the bench with your chest pressed against the pad. Your chin should clear the top of the bench.', 'Hold a dumbbell in each hand with arms hanging straight down, palms facing each other.', 'Plant your toes on the floor for stability. Tighten your core.', 'Set a slight bend in your elbows and lock it in throughout.', 'Lift both dumbbells out to your sides by squeezing your rear delts. Lead with your elbows.', 'Continue lifting until your upper arms are roughly parallel to the floor. Squeeze your rear delts hard.', 'Lower the dumbbells under control back to the hanging position. Use light weight - quality contraction matters most.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-incline-rear-fly/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:incline-reverse-flys-dumbbells';

-- Incline Rows (Dumbbells)
update public.exercises
set
  instruction_steps = array['Set an incline bench to about 30 to 45 degrees.', 'Grab two dumbbells and lie chest down on the bench.', 'Hold the dumbbells with a neutral hammer grip and arms hanging.', 'Tighten the core and maintain the chest pressed into the pad.', 'Pull both dumbbells up by driving the elbows back and up.', 'Squeeze the shoulder blades together at the top of the row.', 'Lower the dumbbells with control back to a full arm hang.', 'Continue for the desired number of repetitions.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-hammer-grip-incline-bench-two-arm-row/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:incline-rows-dumbbells';

-- Incline Shrugs (Dumbbells)
update public.exercises
set
  instruction_steps = array['Set a bench to a decline angle.', 'Lie face down on the bench with your chest supported and head off the end.', 'Hold a dumbbell in each hand, arms hanging down toward the floor.', 'Pull your shoulders back and engage your lats slightly.', 'Shrug your shoulder blades back and together as if pinning them to your spine.', 'Hold the squeeze for one count at the top.', 'Lower the dumbbells back down with control to a full stretch.', 'Avoid using your arms to row. Move only at the shoulder blades.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-decline-shrug/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:incline-shrugs-dumbbells';

-- Incline Skull Crushers (EZ Curl Bar)
update public.exercises
set
  instruction_steps = array['Set an incline bench to about 45 degrees.', 'Lie back on the bench with feet flat on the floor.', 'Have a spotter pass you a barbell or pick it up off the floor.', 'Hold the bar with a shoulder-width grip with arms extended overhead.', 'Tighten your core and maintain your back against the bench.', 'Bend at the elbows to lower the bar behind your head.', 'Maintain your upper arms still and only the elbows moving.', 'Extend the elbows to return to the start position.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/barbell-incline-triceps-extension-skull-crusher/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:incline-skull-crushers-ez-curl-bar';

-- Incline Twist Curls (Dumbbells)
update public.exercises
set
  instruction_steps = array['Set an incline bench to 45 to 60 degrees. Sit back with a dumbbell in each hand, arms hanging straight down.', 'Palms facing forward (supinated grip).', 'Your arms should hang back behind your body at the bottom - biceps fully stretched.', 'Curl both dumbbells up to shoulder height.', 'Squeeze your biceps at the top.', 'Lower under control, returning to the full stretch at the bottom.', 'Do not rush - emphasize the stretch and controlled tempo.', 'Aim for 10 to 12 reps per set.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-incline-biceps-curl/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:incline-twist-curls-dumbbells';

-- JM Press (Barbell)
update public.exercises
set
  instruction_steps = array['Lie on a flat bench with feet planted on the floor. Grip the barbell about shoulder-width.', 'Unrack the bar and hold it over your chest with arms extended.', 'Lower the bar with control toward the top of your chest while letting your elbows travel forward.', 'The bar path should look like a hybrid of a skull crusher and a close-grip press - elbows tuck and forearms angle slightly back.', 'Stop when the bar is just above your upper chest with elbows pointed forward.', 'Drive the bar back up by extending your elbows powerfully.', 'Lock out at the top with arms straight over the chest.', 'Aim for 6 to 10 reps. Use a spotter - the bar path is unforgiving with heavy loads.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/barbell-jm-bench-press/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:jm-press-barbell';

-- JM Press (EZ Curl Bar)
update public.exercises
set
  instruction_steps = array['Lie on a flat bench with eyes under the bar.', 'Grip an EZ curl bar with hands close together at the angled grips.', 'Pull your shoulder blades back and tighten your core.', 'Unrack the bar and hold it over your chest with arms extended.', 'Lower the bar toward your upper chest with elbows tucked tight.', 'Allow the bar to descend with control toward the upper chest area.', 'Press the bar back up by extending the elbows and slightly engaging the chest.', 'Lock out at the top with the bar over the shoulders.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/ez-barbell-jm-bench-press/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:jm-press-ez-curl-bar';

-- Kneeling Crunches (Cable)
update public.exercises
set
  instruction_steps = array['Set a cable to a high position. Attach a rope handle.', 'Kneel facing away from the cable. Hold the rope behind your head near your ears.', 'Start upright (tall kneeling). Core braced.', 'Crunch downward by flexing your spine - drive your elbows toward your knees.', 'Squeeze your abs hard at the bottom.', 'With control return to the upright position.', 'The movement comes from spinal flexion, not hip flexion.', 'Use moderate to heavy weight. Aim for 12 to 15 reps.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/cable-kneeling-crunch/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:kneeling-crunches-cable';

-- Kneeling Side Crunches (Cable)
update public.exercises
set
  instruction_steps = array['Anchor a resistance band overhead to a pull up bar or anchor point.', 'Kneel below the anchor and grip the band ends with both hands.', 'Pull the band ends down to either side of your head.', 'Tighten your abs and pull your shoulders down.', 'Crunch down by curling your torso toward your hips.', 'As you crunch down, twist your torso to bring the right elbow toward the left knee.', 'Squeeze the obliques at the bottom.', 'Return to the starting position. Alternate the twist direction each rep.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/band-kneeling-twisting-crunch/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:kneeling-side-crunches-cable';

-- Landmine Front Squat (Landmine)
update public.exercises
set
  instruction_steps = array['Set up a barbell in a landmine attachment. Load the free end with weight plates.', 'Stand facing the landmine end. Hold the loaded end of the bar at your chest with both hands cupped underneath.', 'Stand with feet shoulder-width apart, toes slightly turned out.', 'Tighten your core. Lift your chest. Stand tall.', 'Sit your hips straight down with a perfectly upright torso.', 'Descend until your hip crease drops below your knees.', 'Drive straight up through your feet. Squeeze your glutes at the top.', 'The bar weight pulls you forward and down - the landmine angle keeps you upright.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/landmine-front-squat/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'manual-2026-06-17:landmine-front-squat-landmine';

-- Landmine Hack Squats (Landmine)
update public.exercises
set
  instruction_steps = array['Set a barbell in a landmine attachment. Load the free end if needed.', 'Stand facing away from the landmine. Hold the free end at your chest or on one shoulder.', 'Feet shoulder-width apart, slightly forward of the bar for balance.', 'Tighten your core. Squat down by bending at the knees and hips.', 'Descend until thighs are parallel or deeper. Maintain torso upright.', 'Drive through your full foot to stand back up. Squeeze quads at the top.', 'The angled resistance shifts emphasis to the quads and reduces back strain.', 'Continue for the planned reps.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/landmine-hack-squat/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:landmine-hack-squats-bodyweight';

-- Landmine Press (Landmine)
update public.exercises
set
  instruction_steps = array['Set up a landmine. Hold the free end of the barbell at chest height with one or both hands.', 'Stand with feet staggered, facing the landmine.', 'Press the barbell end forward and upward along its natural arc.', 'Lock out at the top.', 'Lower under control back to chest height.', 'The angled path is easier on the shoulders than vertical pressing.', 'Use moderate weight. Aim for 8 to 12 reps.', 'Single-arm pressing adds core anti-rotation demand.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/landmine-press/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'manual-2026-06-17:landmine-press-landmine';

-- Landmine Single Arm Press (Landmine)
update public.exercises
set
  instruction_steps = array['Set up a landmine. Hold the free end at shoulder height with your right hand.', 'Stand in a staggered stance, right foot slightly forward.', 'Press the barbell end upward along its arc with your right arm.', 'Lock out at the top. Core braced to prevent rotation.', 'Lower under control.', 'Complete reps, then switch arms.', 'The single-arm loading demands anti-rotation core strength.', 'Use moderate weight. Aim for 8 to 12 reps per arm.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/landmine-single-arm-press/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'manual-2026-06-17:landmine-single-arm-press-landmine';

-- Lateral Raises (Dumbbells)
update public.exercises
set
  instruction_steps = array['Stand tall with feet hip-width apart, holding a dumbbell in each hand at your sides with palms facing your body.', 'Maintain a slight bend in your elbows and maintain that angle locked throughout the entire set. Do not lock your arms straight, as this stresses the elbow joint.', 'Without using momentum, raise both dumbbells out to the sides by leading with your elbows, not your hands. Think of pouring water from a pitcher at the top.', 'Stop when your upper arms are roughly parallel to the floor. Going higher shifts the work to the upper traps.', 'Pause briefly at the top, then lower the dumbbells under control back to your sides over a count of two to three seconds.', 'Maintain your shoulders pulled down and away from your ears throughout. Continue for the planned reps.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-lateral-raise/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:lateral-raises-dumbbells';

-- One-Arm Rows (Dumbbells)
update public.exercises
set
  instruction_steps = array['Place a dumbbell on the floor next to a flat bench.', 'Tighten your right knee and right hand on the bench, with your left foot planted on the floor for balance. Your back should be roughly parallel to the floor.', 'Reach down with your left hand and grip the dumbbell with a neutral grip (palm facing the bench).', 'Tighten your core and lock your back in a flat, neutral position.', 'Row the dumbbell up by driving your elbow up and back toward your hip. Maintain your elbow tracking close to your body.', 'Pull the dumbbell until it touches your lower ribs or hip. Squeeze your shoulder blade in toward your spine at the top.', 'Lower the dumbbell under control back down until your arm is fully extended. Feel the stretch in your lat.', 'Complete all reps on the left side, then switch and repeat on the right side.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-one-arm-bent-over-row/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:one-arm-rows-dumbbells';

-- Overhead Shrugs (Barbell)
update public.exercises
set
  instruction_steps = array['Press or snatch a barbell overhead with a wide grip. Lock out fully.', 'Stand tall with the bar overhead.', 'Without bending your elbows, shrug your shoulders up toward your ears.', 'Squeeze your upper traps at the top.', 'Lower your shoulders back to neutral.', 'Continue for the desired reps.', 'Use light to moderate weight.', 'This builds the overhead shrug position used in snatch receiving.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/barbell-overhead-shrug/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:overhead-shrugs-barbell';

-- Seated Bent-Over Lateral Raises (Dumbbells)
update public.exercises
set
  instruction_steps = array['Sit on the end of a flat bench with feet flat on the floor. Hold a dumbbell in each hand.', 'Lean forward at the hips until your chest is close to your thighs.', 'Let the dumbbells hang below your legs with arms extended, palms facing each other.', 'Row the dumbbells up and out to the sides with elbows wide, leading with your elbows.', 'Squeeze your rear delts and shoulder blades together at the top.', 'Lower under control over two seconds.', 'Maintain your torso still - only your arms move.', 'Use moderate weight. Aim for 12 to 15 reps per set.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-seated-bent-over-rear-delt-row/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:seated-bent-over-lateral-raises-dumbbells';

-- Bent-Over Shrugs (Barbell)
update public.exercises
set
  instruction_steps = array['Stand tall with feet hip-width apart in front of a loaded barbell on the floor or in a rack.', 'Grip the bar with an overhand grip, hands roughly shoulder-width apart. Use straps for heavy loading if needed.', 'Stand up with the bar held at arm''s length in front of your thighs. Pull your shoulders back and brace your core.', 'Hinge at the hips and bend your torso slightly forward while keeping your back flat.', 'Keep your arms completely straight throughout the lift. Do not bend at the elbows.', 'Shrug your shoulders up and slightly back as high as you can.', 'Squeeze your traps hard at the top for one to two seconds. Do not roll your shoulders forward or backward.', 'Lower the bar under control by relaxing your traps and letting your shoulders return to neutral.', 'Repeat for the planned reps. Use heavy weight only when you can keep strict form.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/barbell-shrug/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:bent-over-shrugs-barbell';

-- Bent-Over Shrugs (Dumbbells)
update public.exercises
set
  instruction_steps = array['Stand tall with feet hip-width apart, holding a dumbbell in each hand at your sides with palms facing your body.', 'Pull your shoulders back and brace your core. Keep your arms completely straight.', 'Hinge at the hips and bend your torso slightly forward while keeping your back flat.', 'Shrug your shoulders up and slightly back as high as you can.', 'Keep your arms straight and let the dumbbells rise with your shoulders. Do not bend at the elbows.', 'Squeeze your traps hard at the top for one to two seconds. Do not roll your shoulders forward or backward.', 'Lower the dumbbells under control by relaxing your traps and letting your shoulders return to neutral.', 'Repeat for the planned reps. Use heavy weight with strict form.', 'Use straps for heavy loading if your grip starts to fail before your traps.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-shrug/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:bent-over-shrugs-dumbbells';

-- Shrugs (Barbell)
update public.exercises
set
  instruction_steps = array['Stand tall with feet hip-width apart in front of a loaded barbell on the floor or in a rack.', 'Grip the bar with an overhand grip, hands roughly shoulder-width apart. Use straps for heavy loading if needed.', 'Stand up with the bar held at arm''s length in front of your thighs. Pull your shoulders back and brace your core.', 'Keep your arms completely straight throughout the lift. Do not bend at the elbows.', 'Shrug your shoulders straight up toward your ears as high as you can.', 'Squeeze your traps hard at the top for one to two seconds. Do not roll your shoulders forward or backward.', 'Lower the bar under control by relaxing your traps and letting your shoulders return to neutral.', 'Repeat for the planned reps. Use heavy weight only when you can keep strict form.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/barbell-shrug/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:shrugs-barbell';

-- Shrugs (Dumbbells)
update public.exercises
set
  instruction_steps = array['Stand tall with feet hip-width apart, holding a dumbbell in each hand at your sides with palms facing your body.', 'Pull your shoulders back and brace your core. Keep your arms completely straight.', 'Shrug your shoulders straight up toward your ears as high as you can.', 'Keep your arms straight and let the dumbbells rise with your shoulders. Do not bend at the elbows.', 'Squeeze your traps hard at the top for one to two seconds. Do not roll your shoulders forward or backward.', 'Lower the dumbbells under control by relaxing your traps and letting your shoulders return to neutral.', 'Repeat for the planned reps. Use heavy weight with strict form.', 'Use straps for heavy loading if your grip starts to fail before your traps.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-shrug/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:shrugs-dumbbells';

-- Shrugs (Trap Bar)
update public.exercises
set
  instruction_steps = array['Stand in the middle of a loaded trap bar.', 'Squat down and grip the handles with a neutral grip.', 'Stand up tall with the bar at the sides.', 'Tighten your core and set the chest tall.', 'Maintain the arms straight and shoulders down.', 'Shrug the shoulders straight up toward the ears.', 'Squeeze the upper traps hard at the top.', 'Lower the shoulders back down with control.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/trap-bar-standing-shrug/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:shrugs-trap-bar';

-- Side Crunches (Bodyweight)
update public.exercises
set
  instruction_steps = array['Lie on your right side. Stack your legs. Anchor your feet or have a partner hold them.', 'Place your left hand behind your head.', 'Laterally flex your spine - lift your torso off the floor sideways.', 'Rise as high as possible. Squeeze your left oblique.', 'Lower under control.', 'Complete reps, then switch sides.', 'This is a direct oblique exercise through lateral flexion.', 'Aim for 10 to 15 reps per side.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/side-sit-up/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:side-crunches-bodyweight';

-- Side Sit-Ups (Bodyweight)
update public.exercises
set
  instruction_steps = array['Lie on the floor with knees bent and feet flat.', 'Hold a dumbbell with both hands and press it straight overhead.', 'Maintain your arms long and locked out throughout.', 'Tighten your core and tuck your chin slightly.', 'Sit up by curling your torso off the floor.', 'At the top, twist the torso to bring the dumbbell across to one side.', 'Twist back through center and lower with control to the start.', 'Alternate the twist side on each rep.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-straight-arm-twisting-sit-up/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:side-sit-ups-bodyweight';

-- Sit-Ups (Bodyweight)
update public.exercises
set
  instruction_steps = array['Lie on your back with knees bent at 45 degrees, feet flat on the floor.', 'Hold a dumbbell at your chest (easier) or extended overhead (harder).', 'Tighten your core.', 'Sit up by curling your torso upward, bringing your chest toward your knees.', 'Squeeze your abs hard at the top.', 'Lower under control back to the floor.', 'Anchor your feet under a heavy object if needed.', 'Use moderate weight. Aim for 10 to 15 reps.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-sit-up/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:sit-ups-bodyweight';

-- Skull Crushers (Dumbbells)
update public.exercises
set
  instruction_steps = array['Lie on your back on the floor with knees bent and feet flat.', 'Hold a dumbbell in each hand pressed straight over your chest.', 'Use a neutral grip with palms facing each other.', 'Tighten your core.', 'Lower the dumbbells toward your forehead by bending only at the elbows.', 'Maintain your upper arms vertical and elbows pointing forward.', 'Pause briefly with the dumbbells near your forehead.', 'Press the dumbbells back up by extending your elbows. Squeeze the triceps at the top.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-lying-floor-skullcrusher/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:skull-crushers-dumbbells';

-- Skull Crushers (EZ Curl Bar)
update public.exercises
set
  instruction_steps = array['Lie on a flat bench with feet flat on the floor.', 'Hold a barbell or EZ bar with a shoulder-width grip.', 'Position the bar over your chest with arms extended.', 'Tighten your core and maintain your back flat against the bench.', 'Bend at the elbows to lower the bar toward your forehead.', 'Maintain your upper arms vertical and only the elbows moving.', 'Stop just before the bar reaches your forehead.', 'Extend the elbows to return to the start position.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/barbell-lying-triceps-extension-skull-crusher/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:skull-crushers-ez-curl-bar';

-- Split Squats (Dumbbells)
update public.exercises
set
  instruction_steps = array['Hold a dumbbell in each hand at your sides. Step into a split stance - right foot forward, left foot back.', 'Stand tall with chest up and core braced.', 'Lower your back (left) knee straight down toward the floor by bending both knees.', 'Descend until your back knee is just above the floor and your front thigh is parallel.', 'Drive through your front foot to stand back up. Maintain torso upright throughout.', 'Continue for the planned reps on the right side, then switch.', 'Maintain the dumbbells at your sides - do not let them swing forward.', 'Increase load progressively as you get stronger.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/dumbbell-split-squat/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:split-squats-dumbbells';

-- T-Bar Reverse Lunges (Landmine)
update public.exercises
set
  instruction_steps = array['Set up a barbell in a landmine attachment or wedged in a corner.', 'Load the free end with weight plates.', 'Pick up the free end and bring it to chest level with both hands.', 'Stand tall with feet hip-width apart.', 'Tighten your core and pull your shoulders back.', 'Step back with your right leg into a reverse lunge.', 'Lower until your back knee almost touches the floor.', 'Push through the front foot to drive back to standing. Alternate legs.']::text[],
  instruction_source = 'Lift Manual',
  instruction_source_url = 'https://liftmanual.com/landmine-rear-lunge/',
  updated_at = now()
where user_id is null
  and is_builtin = true
  and source = 'curated_exercise_library_v1'
  and source_key = 'history-csv-2026-06-07:t-bar-reverse-lunges-barbell';

commit;
