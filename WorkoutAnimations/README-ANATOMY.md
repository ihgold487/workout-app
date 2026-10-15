# Athlete anatomy assets

This checkpoint separates the reusable anatomy source from the rigged production mesh so the
repository does not need the much larger Blender bake workspace.

## Versioned files

- `Athlete_Anatomy_HighDetail_Source.blend` — compact appendable library containing the
  accepted high-detail anatomy source and the pipeline checkpoint notes.
- `Athlete_Anatomy_Regional_Checkpoint.blend` — rigged 13,380-vertex production mesh with the
  existing 53-bone deform rig, regional normal-map material, three confidence masks, and the
  detached `ANATOMY_DEFORMATION_CHECK` validation action.
- `textures/athlete_anatomy_normal_torso_back_2048.png` — front/side torso bake. Its posterior
  contribution is disabled pending a dedicated back bake.
- `textures/athlete_anatomy_normal_legs_2048.png` — selectively masked thigh and calf bake.
- `textures/athlete_anatomy_normal_arms_aligned_2048.png` — aligned arm bake used at a
  conservative strength.

The `.blend` checkpoint references these textures by filename. Keep them together under
`WorkoutAnimations` when moving the project between working copies.

## Source and license

The high-detail anatomy source was derived from Blend Swap asset 91879, “Human Male Base Mesh
with armature,” released under Creative Commons Zero 1.0. The downloaded license record is
preserved at `Human Male Base Mesh with armature/91879 - LICENSE.html`.

## Next production pass

1. Bake a dedicated posterior source for the trapezius, lats, spinal erectors, glutes, and
   hamstrings.
2. Author semantic masks for individual muscle groups.
3. Build the always-visible anatomy shading and bold active-muscle overlay.
4. Validate push, pull, squat, and hinge poses before exercise animation production.
