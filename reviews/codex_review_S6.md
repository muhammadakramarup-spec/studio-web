**Q1.** The RPM iframe/VRM fallback target ([src/ai/SPEC.md:27](/C:/3D-Studio/02_projects/studio-web/src/ai/SPEC.md:27)). It combines cross-origin automation, unreliable `postMessage`, a new VRM loader, and asset integration even though the demo origin cannot ship publicly. Its three-attempt branch can consume the build box; replace it with one manifest-listed local CC0 GLB avatar tile that calls `onAvatarReady()` and loads through S1.

**Q2.** The generation panel lacks the model-ready handoff that S1 needs ([src/ai/SPEC.md:13](/C:/3D-Studio/02_projects/studio-web/src/ai/SPEC.md:13)); only `AvatarPanel` exposes one ([src/ai/SPEC.md:83](/C:/3D-Studio/02_projects/studio-web/src/ai/SPEC.md:83)). Add:

```ts
export interface GenerationPanelProps {
  onModelReady: (glbUrl: string) => void;
}
export declare function GenerationPanel(props: GenerationPanelProps): unknown;
```

**Q3.** Yes. “Renders one frame in <2000 ms” can pass with an empty canvas ([src/ai/SPEC.md:34](/C:/3D-Studio/02_projects/studio-web/src/ai/SPEC.md:34)). Replace it with: within 2000 ms, the canvas scene contains at least one visible avatar mesh and a 256×256 canvas capture differs from the empty-scene baseline by at least 1,000 pixels.

Further findings, ranked:

1. Rename both `studio.load(...)` references to S1’s actual `studio.loadModel(...)` contract ([src/ai/SPEC.md:85](/C:/3D-Studio/02_projects/studio-web/src/ai/SPEC.md:85), [src/viewer/SPEC.md:140](/C:/3D-Studio/02_projects/studio-web/src/viewer/SPEC.md:140)).

2. Make `GenerationRequest.userId` optional because S5’s zero-environment account state permits `user:null` ([src/ai/SPEC.md:66](/C:/3D-Studio/02_projects/studio-web/src/ai/SPEC.md:66), [src/account/SPEC.md:69](/C:/3D-Studio/02_projects/studio-web/src/account/SPEC.md:69)).

3. Require the bundled avatar placeholder to have an S3 manifest entry containing literal `licence:"CC0"` and `sourceUrl`; “self-authored” alone does not satisfy the asset evidence rule ([src/ai/SPEC.md:33](/C:/3D-Studio/02_projects/studio-web/src/ai/SPEC.md:33)).