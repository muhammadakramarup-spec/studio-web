Q1. The real Supabase-session plus paid-entitlement resolution is the likeliest overrun ([src/account/SPEC.md:116](C:/3D-Studio/02_projects/studio-web/src/account/SPEC.md:116)). It contradicts the cuts and requires backend/schema/session work; replace it with a Wave-1 `useAccount()` that always returns the documented synchronous signed-out state regardless of env vars.

Q2. The required account panel ([src/account/SPEC.md:26](C:/3D-Studio/02_projects/studio-web/src/account/SPEC.md:26)) is absent from the exported surfaces ([src/account/SPEC.md:57](C:/3D-Studio/02_projects/studio-web/src/account/SPEC.md:57)); S2 editor needs it for the application chrome. Add exactly:
```ts
export declare function AccountPanel(): JSX.Element;
```

Q3. Yes—Target #6 ([src/account/SPEC.md:42](C:/3D-Studio/02_projects/studio-web/src/account/SPEC.md:42)) is trivially passed by a permanently no-op `track()`: it tests zero requests before/after consent but never requires delivery while opted in. Replace it with a routed local endpoint test: 3 pre-consent events produce 0 POSTs, 3 opted-in events produce exactly 3 schema-valid POSTs, and 3 post-opt-out events leave the total at exactly 3.

Further findings, ranked:

1. Remove the configured EthicalAds execution path from `AdSlot`; live serving is simultaneously declared and cut outright ([src/account/SPEC.md:87](C:/3D-Studio/02_projects/studio-web/src/account/SPEC.md:87), [src/account/SPEC.md:146](C:/3D-Studio/02_projects/studio-web/src/account/SPEC.md:146)).

2. Remove caller-supplied `anonId` from `session_started` and have `track()` attach its internally generated UUID ([src/account/SPEC.md:108](C:/3D-Studio/02_projects/studio-web/src/account/SPEC.md:108), [src/account/SPEC.md:126](C:/3D-Studio/02_projects/studio-web/src/account/SPEC.md:126)).

3. Add a test where `localStorage` throws and require the signed-out ready fallback, because the “never throws” contract currently lacks that failure check ([src/account/SPEC.md:64](C:/3D-Studio/02_projects/studio-web/src/account/SPEC.md:64), [src/account/SPEC.md:83](C:/3D-Studio/02_projects/studio-web/src/account/SPEC.md:83)).