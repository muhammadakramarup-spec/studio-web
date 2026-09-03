### Q1

**Target 5: PNG/ZIP/WebM export with warm-up and tail fixes** (`src/viewer/SPEC.md:66`). It combines three export pipelines, three frame counts, browser-dependent recording, and FFmpeg verification in one unit. WebM timing is explicitly GPU/driver-sensitive and permits three tuning attempts (`src/viewer/SPEC.md:236-245`), making its duration unpredictable.

**Replace with:** ship PNG plus one verified 24-frame, 1024×1024 ZIP turntable; leave `exportWebM()` returning `null` today.

### Q2

S2 editor needs control of S1’s render pass for `EffectComposer`; exposing scene objects alone (`src/viewer/SPEC.md:91-93`) does not provide this, and the public surface ends without a render-loop seam (`src/viewer/SPEC.md:170-180`).

```ts
setRenderHook(fn: ((deltaSeconds: number) => void) | null): void;
```

S1 invokes the hook instead of its default `renderer.render(...)`; passing `null` restores the default.

### Q3

The transparent-export check (`src/viewer/SPEC.md:62-64`) can pass from antialiased model edges or arbitrary translucent pixels even when the shadow catcher is broken.

**Replacement:** require ≥20% `alpha===0`, ≥1% `alpha===255`, then compare transparent renders with shadows on/off and require ≥0.5% of pixels outside the opaque-model mask to change alpha by more than 2.

### Further findings

1. Correct the HDR PMREM path: use `pmrem.fromEquirectangular(hdrTexture)` for the timed 1k HDR check, reserving `fromScene()` for the procedural softbox (`src/viewer/SPEC.md:53-57`).

2. Replace “eyeball” calibration with a number: require foreground median-luminance ratio versus the saved reference to remain within 0.80–1.25 (`src/viewer/SPEC.md:229-234`).

3. After the third failed WebM attempt, create `BLOCKED.md` as the lock requires; do not silently substitute a disabled button (`src/viewer/SPEC.md:243-246`).