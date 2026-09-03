// S5 — Accounts, Pro, ads, telemetry. Vite serves TypeScript directly; every browser check below
// runs the real src/account/** module inside the page via dynamic import, per SCOPE.md's
// testing instructions. Run with: npx playwright test tests/s5.spec.ts --reporter=line
import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

test.describe("S5 account/pro/ads/telemetry", () => {
  test("1. zero-env boot: 0 console errors from src/account/** while mounting every export", async ({
    page,
  }) => {
    const errors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await page.goto("/");

    const result = await page.evaluate(async () => {
      const mod = await import("/src/account/index.ts");
      const account = mod.useAccount();
      const panel = mod.AccountPanel();
      document.body.appendChild(panel);
      const ad = mod.AdSlot({ size: "300x250" });
      document.body.appendChild(ad);
      return { status: account.status, isPro: account.isPro };
    });

    console.log(
      `MEASURED zero-env boot: consoleErrors=${errors.length} pageErrors=${pageErrors.length} status=${result.status} isPro=${result.isPro}`
    );
    expect(errors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(errors.length).toBe(0);
  });

  test("2. signed-out auth panel: 'Sign in' affordance + Signed out text/testid in 1/1 zero-env loads", async ({
    page,
  }) => {
    await page.goto("/");
    const result = await page.evaluate(async () => {
      const { AccountPanel } = await import("/src/account/index.ts");
      const panel = AccountPanel();
      document.body.appendChild(panel);
      const status = panel.querySelector('[data-testid="account-status"]') as HTMLElement | null;
      const signIn = panel.querySelector('[data-testid="sign-in-btn"]') as HTMLElement | null;
      return {
        statusText: status?.textContent ?? null,
        statusAttr: status?.dataset.status ?? null,
        signInText: signIn?.textContent ?? null,
      };
    });

    console.log(`MEASURED signed-out panel: statusText="${result.statusText}" statusAttr="${result.statusAttr}" signInText="${result.signInText}"`);
    expect(result.statusAttr).toBe("signed-out");
    expect(result.statusText).toBe("Signed out");
    expect(result.signInText).toBe("Sign in");
  });

  test("3. useAccount() resolves synchronously: isPro===false, status settled (never stuck loading), <=500ms", async ({
    page,
  }) => {
    await page.goto("/");
    const result = await page.evaluate(async () => {
      const t0 = performance.now();
      const { useAccount } = await import("/src/account/index.ts");
      const account = useAccount(); // no await — must already be resolved
      const elapsedMs = performance.now() - t0;
      return { status: account.status, isPro: account.isPro, user: account.user, elapsedMs };
    });

    console.log(
      `MEASURED useAccount sync resolve: status=${result.status} isPro=${result.isPro} user=${result.user} elapsedMs=${result.elapsedMs.toFixed(3)}`
    );
    expect(result.status).not.toBe("loading" as unknown as string);
    expect(result.status).toBe("signed-out");
    expect(result.isPro).toBe(false);
    expect(result.user).toBeNull();
    expect(result.elapsedMs).toBeLessThan(500);
  });

  test("4. AdSlot: house placeholder in 100% of loads, no layout shift, 0 requests to ethicalads.io", async ({
    page,
  }) => {
    let ethicalAdsRequests = 0;
    await page.route("**://*.ethicalads.io/**", async (route) => {
      ethicalAdsRequests++;
      await route.abort();
    });
    await page.route("**://ethicalads.io/**", async (route) => {
      ethicalAdsRequests++;
      await route.abort();
    });

    await page.goto("/");

    const sizes = ["300x250", "728x90", "160x600"] as const;
    const results: Record<string, { mode: string | undefined; w: number; h: number; wAfter: number; hAfter: number }> = {};

    for (const size of sizes) {
      const r = await page.evaluate(async (sz) => {
        const { AdSlot } = await import("/src/account/index.ts");
        const host = document.createElement("div");
        host.id = `ad-host-${sz}`;
        document.body.appendChild(host);
        const el = AdSlot({ size: sz as "300x250" | "728x90" | "160x600" });
        host.appendChild(el);
        const before = el.getBoundingClientRect();
        await new Promise((resolve) => requestAnimationFrame(resolve));
        await new Promise((resolve) => setTimeout(resolve, 150));
        const after = el.getBoundingClientRect();
        return {
          mode: el.dataset.adMode,
          w: before.width,
          h: before.height,
          wAfter: after.width,
          hAfter: after.height,
        };
      }, size);
      results[size] = r;
    }

    await page.waitForTimeout(200);

    console.log(
      `MEASURED AdSlot: ethicalAdsRequests=${ethicalAdsRequests} sizes=${JSON.stringify(results)}`
    );

    for (const size of sizes) {
      const [expectedW, expectedH] = size.split("x").map(Number);
      expect(results[size].mode).toBe("house");
      expect(results[size].w).toBe(expectedW);
      expect(results[size].h).toBe(expectedH);
      // No layout shift: the box is identical before and after a settle tick.
      expect(Math.abs(results[size].wAfter - results[size].w)).toBe(0);
      expect(Math.abs(results[size].hAfter - results[size].h)).toBe(0);
    }
    expect(ethicalAdsRequests).toBe(0);
  });

  test("5. checkout stub: SANDBOX/TEST MODE literal present, 0 requests to lemonsqueezy.com when unset, appendTestMode is correct", async ({
    page,
  }) => {
    let lemonSqueezyRequests = 0;
    await page.route("**://*.lemonsqueezy.com/**", async (route) => {
      lemonSqueezyRequests++;
      await route.abort();
    });
    await page.route("**://lemonsqueezy.com/**", async (route) => {
      lemonSqueezyRequests++;
      await route.abort();
    });

    await page.goto("/");

    const result = await page.evaluate(async () => {
      const { AccountPanel } = await import("/src/account/index.ts");
      const { appendTestMode } = await import("/src/account/checkout.ts");
      const panel = AccountPanel();
      document.body.appendChild(panel);
      const upgradeBtn = panel.querySelector('[data-testid="upgrade-btn"]') as HTMLButtonElement;
      upgradeBtn.click();
      const modal = panel.querySelector('[data-testid="checkout-modal"]') as HTMLElement;
      const label = panel.querySelector('[data-testid="checkout-stub-label"]') as HTMLElement;
      const linkAbsent = panel.querySelector('[data-testid="checkout-link-absent"]');
      const link = panel.querySelector('[data-testid="checkout-link"]') as HTMLAnchorElement | null;

      const withQuery = appendTestMode("https://example.lemonsqueezy.com/buy/abc?ref=x");
      const withoutQuery = appendTestMode("https://example.lemonsqueezy.com/buy/abc");

      return {
        modalHidden: modal.hidden,
        labelText: label.textContent,
        linkAbsentPresent: linkAbsent !== null,
        linkHref: link?.getAttribute("href") ?? null,
        withQuery,
        withoutQuery,
      };
    });

    await page.waitForTimeout(150);

    console.log(
      `MEASURED checkout stub: lemonSqueezyRequests=${lemonSqueezyRequests} modalHidden=${result.modalHidden} labelText="${result.labelText}"`
    );
    expect(result.modalHidden).toBe(false);
    expect(result.labelText).toMatch(/SANDBOX|TEST MODE/);
    // Zero env: no store URL configured -> no link element at all -> 0 requests possible.
    expect(result.linkAbsentPresent).toBe(true);
    expect(result.linkHref).toBeNull();
    expect(lemonSqueezyRequests).toBe(0);
    // Pure appendTestMode contract, exercised without needing a real env var.
    expect(result.withoutQuery).toBe("https://example.lemonsqueezy.com/buy/abc?test_mode=true");
    expect(result.withQuery).toBe("https://example.lemonsqueezy.com/buy/abc?ref=x&test_mode=true");
  });

  test("6. telemetry: 0 pre-consent POSTs, exactly 3 opted-in schema-valid POSTs, stays at 3 after opt-out", async ({
    page,
  }) => {
    const posts: unknown[] = [];
    await page.route("**/api/telemetry", async (route) => {
      let body: unknown = null;
      try {
        body = route.request().postDataJSON();
      } catch {
        body = null;
      }
      posts.push(body);
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });

    await page.goto("/");
    await page.evaluate(() => localStorage.clear());

    // Phase 1: pre-consent.
    await page.evaluate(async () => {
      const { track } = await import("/src/account/index.ts");
      track({ type: "tool_used", tool: "pre-0" });
      track({ type: "tool_used", tool: "pre-1" });
      track({ type: "asset_loaded", assetKind: "model", assetId: "pre-2" });
    });
    await page.waitForTimeout(250);
    const afterPreConsent = posts.length;

    // Phase 2: opt in, then send.
    await page.evaluate(async () => {
      const { track, setTelemetryOptIn, getTelemetryOptIn } = await import("/src/account/index.ts");
      setTelemetryOptIn(true);
      if (!getTelemetryOptIn()) throw new Error("opt-in did not persist");
      track({ type: "tool_used", tool: "in-0" });
      track({ type: "effect_applied", effect: "in-1" });
      track({ type: "export_completed", exportKind: "still", ms: 42 });
    });
    await page.waitForTimeout(250);
    const afterOptIn = posts.length;

    // Phase 3: opt out, then send — total must not grow.
    await page.evaluate(async () => {
      const { track, setTelemetryOptIn } = await import("/src/account/index.ts");
      setTelemetryOptIn(false);
      track({ type: "tool_used", tool: "post-0" });
      track({ type: "session_started" });
      track({ type: "pro_cta_clicked", source: "post-2" });
    });
    await page.waitForTimeout(250);
    const afterOptOut = posts.length;

    const knownTypes = [
      "asset_loaded",
      "effect_applied",
      "export_completed",
      "tool_used",
      "session_started",
      "pro_cta_clicked",
    ];
    const schemaValidCount = posts.filter((p) => {
      if (!p || typeof p !== "object") return false;
      const rec = p as Record<string, unknown>;
      return (
        typeof rec.type === "string" &&
        knownTypes.includes(rec.type) &&
        typeof rec.anonId === "string" &&
        rec.anonId.length > 0 &&
        typeof rec.ts === "number"
      );
    }).length;

    console.log(
      `MEASURED telemetry: afterPreConsent=${afterPreConsent} afterOptIn=${afterOptIn} afterOptOut=${afterOptOut} schemaValidCount=${schemaValidCount} eventTypeUnionSize=${knownTypes.length}`
    );

    expect(afterPreConsent).toBe(0);
    expect(afterOptIn).toBe(3);
    expect(afterOptOut).toBe(3);
    expect(schemaValidCount).toBe(3);
    expect(knownTypes.length).toBe(6);

    // No PII: no email/user-id/free-text fields anywhere in the sent payloads.
    const leaked = posts.some((p) => {
      const s = JSON.stringify(p ?? {});
      return /email|password|userId|user_id/i.test(s);
    });
    expect(leaked).toBe(false);
  });

  test("7. localStorage throws: useAccount() still returns the signed-out ready state and does not throw", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const throwing = {
        getItem() {
          throw new Error("storage disabled");
        },
        setItem() {
          throw new Error("storage disabled");
        },
        removeItem() {
          throw new Error("storage disabled");
        },
        clear() {
          throw new Error("storage disabled");
        },
        key() {
          throw new Error("storage disabled");
        },
        length: 0,
      };
      Object.defineProperty(window, "localStorage", {
        value: throwing,
        configurable: true,
      });
    });

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await page.goto("/");

    const result = await page.evaluate(async () => {
      let threw = false;
      let account: { status: string; isPro: boolean; user: unknown } | null = null;
      try {
        const { useAccount, getTelemetryOptIn, setTelemetryOptIn, AccountPanel } = await import(
          "/src/account/index.ts"
        );
        account = useAccount();
        // Exercise every other localStorage-touching export too — none may throw either.
        getTelemetryOptIn();
        setTelemetryOptIn(true);
        AccountPanel();
      } catch {
        threw = true;
      }
      return { threw, account };
    });

    console.log(
      `MEASURED localStorage-throws robustness: threw=${result.threw} status=${result.account?.status} isPro=${result.account?.isPro} pageErrors=${pageErrors.length}`
    );
    expect(result.threw).toBe(false);
    expect(result.account?.status).toBe("signed-out");
    expect(result.account?.isPro).toBe(false);
    expect(result.account?.user).toBeNull();
    expect(pageErrors).toEqual([]);
  });

  test("8. no secrets in the built bundle: grep for sk_/service_role/sb_secret (>20 chars) over an isolated zero-env build of src/account/index.ts", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "s5-secrets-check-"));
    const configPath = join(process.cwd(), "src", "account", `.tmp-secrets-check-${Date.now()}.vite.config.ts`);

    const configSource = `
import { defineConfig } from "vite";
import path from "node:path";
export default defineConfig({
  root: process.cwd(),
  build: {
    outDir: ${JSON.stringify(outDir)},
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022",
    lib: {
      entry: path.resolve(process.cwd(), "src/account/index.ts"),
      formats: ["es"],
      fileName: () => "account.js",
    },
  },
});
`;
    writeFileSync(configPath, configSource, "utf-8");

    let stdout = "";
    try {
      // Windows: spawning the npx.cmd shim directly (without a shell) fails with EINVAL, so a
      // shell is required here. All arguments are internally constructed (configPath is our own
      // temp path), not user/network input, so the shell-escaping caveat does not apply.
      stdout = execFileSync("npx", ["vite", "build", "--config", configPath], {
        cwd: process.cwd(),
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
        shell: true,
      });
    } finally {
      try {
        unlinkSync(configPath);
      } catch {
        // best-effort cleanup
      }
    }

    const jsFiles = readdirSync(outDir).filter((f) => f.endsWith(".js"));
    const secretPattern = /(sk_[A-Za-z0-9_-]{20,}|service_role[A-Za-z0-9_.-]{20,}|sb_secret[A-Za-z0-9_-]{20,})/g;
    let matches = 0;
    for (const file of jsFiles) {
      const content = readFileSync(join(outDir, file), "utf-8");
      const found = content.match(secretPattern);
      if (found) matches += found.length;
    }

    console.log(
      `MEASURED secrets check: builtOk=${stdout.includes("built in")} jsFiles=${jsFiles.length} secretMatches=${matches}`
    );

    try {
      rmSync(outDir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }

    expect(jsFiles.length).toBeGreaterThan(0);
    expect(matches).toBe(0);
  });
});
