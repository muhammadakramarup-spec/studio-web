// Ambient Vite env typing, scoped to the five env vars this silo reads. Referencing
// "vite/client" here pulls in `ImportMeta.env` for the whole program (tsconfig includes all of
// `src`), so other silos are unaffected either way — this file only ever narrows, never removes,
// the ambient `ImportMetaEnv` shape.
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_LEMONSQUEEZY_STORE_URL?: string;
  readonly VITE_ETHICALADS_PUBLISHER_ID?: string;
  readonly VITE_TELEMETRY_ENDPOINT?: string;
}
