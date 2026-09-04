import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// Ownership: F3 (status/warden-log.md Decision W-2) — `define` for the app version only.
// Read via JSON.parse(readFileSync(...)) rather than a JSON import so this file stays plain
// ESM with no bundler-specific import-attribute syntax; package.json is read once at config
// eval time (build/dev/preview all re-run this module), never bundled into client code.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as {
  version: string;
};

export default defineConfig({
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
  build: { target: "es2022", sourcemap: false },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
});
