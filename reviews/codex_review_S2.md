**Q1.** **Post FX: bloom + vignette + colour grade** ([src/editor/SPEC.md:84](C:/3D-Studio/02_projects/studio-web/src/editor/SPEC.md:84)). It combines render-loop replacement, composer lifecycle, three effects, resize handling, and GPU-budget tuning, so integration debugging can consume the build box. Replace it with bloom on/off via `UnrealBloomPass` only, at fixed resolution, with one screenshot-diff check.

**Q2.** S4 Timeline is promised reusable `EditorOp`s, but `EditorHandle` exposes no way to submit an externally created command to history ([src/editor/SPEC.md:197](C:/3D-Studio/02_projects/studio-web/src/editor/SPEC.md:197)). Add this exact member to `EditorHandle`:

```ts
execute(op: EditorOp): void;
```

**Q3.** Yes—the selection check is unmeasurable for lights/cameras, occluded objects, and off-screen objects; two incorrect selection paths could also agree ([src/editor/SPEC.md:37](C:/3D-Studio/02_projects/studio-web/src/editor/SPEC.md:37)). Replace it with a fixed fixture containing three separated meshes, one light, and one camera: require the outliner UUID set to match 5/5 objects, each row to select its expected UUID 5/5, three fixed canvas coordinates to select their expected mesh UUIDs 3/3, and a fixed blank coordinate to return `null`.

Further findings, ranked:

1. Compare a canonical editor-state serialization covering hierarchy, types, visibility, transforms, materials, modifier parameters, and post-FX state; the current undo check serializes only transforms/materials and can miss broken add/remove/modifier history ([src/editor/SPEC.md:28](C:/3D-Studio/02_projects/studio-web/src/editor/SPEC.md:28)).

2. Define array `count` as the total visible instances including the source; “count linked clones” conflicts with “exactly N visible instances” ([src/editor/SPEC.md:78](C:/3D-Studio/02_projects/studio-web/src/editor/SPEC.md:78)).

3. Use one outliner inclusion predicate consistently; the row type permits `Group`, while the acceptance count excludes it ([src/editor/SPEC.md:37](C:/3D-Studio/02_projects/studio-web/src/editor/SPEC.md:37), [src/editor/SPEC.md:146](C:/3D-Studio/02_projects/studio-web/src/editor/SPEC.md:146)).

The scope fence and cut list are sound ([src/editor/SPEC.md:204](C:/3D-Studio/02_projects/studio-web/src/editor/SPEC.md:204)).