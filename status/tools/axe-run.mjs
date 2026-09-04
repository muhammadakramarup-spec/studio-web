// Wave 4 accessibility QA — axe-core scan, Playwright injection fallback.
//
// `npx --yes @axe-core/cli` (the primary method the task asks for) failed on this machine:
// SessionNotCreatedError — its bundled ChromeDriver could not start a Chrome session with
// --use-gl=angle --use-angle=d3d11 --ignore-gpu-blocklist --headless=new (same flags that work
// fine for every other script in this QA pass via Playwright's own Chromium). Falling back to the
// task's documented alternative: inject axe-core into the real Playwright Chromium already used
// throughout this session and call axe.run() in-page. axe-core itself was fetched as a static
// asset (axe.min.js, from the axe-core npm package's own CDN distribution, no `npm install` into
// the project) rather than run as a CLI, per the task's "no npm installs into the project (npx
// --yes <pkg> for a one-off CLI... is allowed)" ownership rule.
//
// Usage: node status/tools/axe-run.mjs <axe.min.js path> <out-empty.json> [out-loaded.json]

import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

const [, , axeScriptPath, outEmptyPath, outLoadedPath] = process.argv;
if (!axeScriptPath || !outEmptyPath) {
  console.error("Usage: node axe-run.mjs <axe.min.js path> <out-empty.json> [out-loaded.json]");
  process.exit(1);
}
const axeSource = readFileSync(axeScriptPath, "utf8");

async function runAxe(page) {
  await page.addScriptTag({ content: axeSource });
  return await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    return await axe.run(document, { resultTypes: ["violations", "incomplete", "passes"] });
  });
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=d3d11", "--ignore-gpu-blocklist"],
  });

  // Empty state
  {
    const context = await browser.newContext({ viewport: { width: 1536, height: 864 } });
    const page = await context.newPage();
    await page.goto("http://localhost:4174", { waitUntil: "load", timeout: 45000 });
    await page.waitForSelector('#viewport-hint[data-state="idle"]', { timeout: 20000 });
    await page.waitForSelector(".library-panel__tile", { timeout: 15000 }); // let the library finish rendering
    const results = await runAxe(page);
    writeFileSync(outEmptyPath, JSON.stringify(results, null, 2));
    console.log(
      `EMPTY: ${results.violations.length} violations, ${results.incomplete.length} incomplete, ${results.passes.length} passes`,
    );
    for (const v of results.violations) {
      console.log(`  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`);
    }
    for (const v of results.incomplete) {
      console.log(`  [incomplete] ${v.id}: ${v.help} (${v.nodes.length} node(s))`);
    }
    await context.close();
  }

  // Loaded state (if requested)
  if (outLoadedPath) {
    const context = await browser.newContext({ viewport: { width: 1536, height: 864 } });
    const page = await context.newPage();
    await page.goto("http://localhost:4174", { waitUntil: "load", timeout: 45000 });
    await page.waitForSelector('#viewport-hint[data-state="idle"]', { timeout: 20000 });
    await page.waitForSelector(".library-panel__tile", { timeout: 15000 });
    await page.locator(".library-panel__tile").first().click();
    await page.waitForSelector('#viewport-hint[data-state="loaded"]', { state: "attached", timeout: 15000 });
    const results = await runAxe(page);
    writeFileSync(outLoadedPath, JSON.stringify(results, null, 2));
    console.log(
      `\nLOADED: ${results.violations.length} violations, ${results.incomplete.length} incomplete, ${results.passes.length} passes`,
    );
    for (const v of results.violations) {
      console.log(`  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s))`);
    }
    for (const v of results.incomplete) {
      console.log(`  [incomplete] ${v.id}: ${v.help} (${v.nodes.length} node(s))`);
    }
    await context.close();
  }

  await browser.close();
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exitCode = 1;
});
