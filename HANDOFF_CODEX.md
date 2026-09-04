# HANDOFF — studio-web, deploy leg

**For:** whoever picks this up next (a Codex agent, a fresh Claude session, or Akram).
**Written:** 2026-09-04 · **Repo:** `C:\3D-Studio\02_projects\studio-web` · **HEAD:** `4ba3d06`, working tree clean.

Read this file alone and you have enough to finish. Nothing else is required.

---

## 1. State in one paragraph

The build is **done, tested and committed**. 12 commits. 40/40 Playwright tests pass
*per-file*, `tsc --noEmit` is clean, and `npm run build` produces `dist/` at **2,321 files /
80 MB** with **0 secrets**. The app boots and works with **zero environment variables**.
The only remaining task is the **Cloudflare Pages deploy**, and it is blocked on
**authentication, not on code**.

Full context: [`REPORT.md`](REPORT.md) (what shipped, measured numbers, cut list),
[`DECISIONS.md`](DECISIONS.md) (21 numbered decisions), [`SCOPE.md`](SCOPE.md) (frozen
interfaces, definition of done), [`status/final_qa.md`](status/final_qa.md) (85 measured rows).

## 2. The blocker, stated exactly

Verified on this machine, 2026-09-04:

- `CLOUDFLARE_API_TOKEN` — **not set**. `CLOUDFLARE_ACCOUNT_ID` — **not set**.
- `~/.wrangler` — **does not exist**, so there is no prior OAuth session.
- `wrangler` — **not installed**, not in `package.json`, not in `node_modules/.bin`.
- The Cloudflare account is signed in through **Google SSO**.
- A Cloudflare MCP server may be connected. It lists Workers, R2, D1 and KV and searches
  docs. **It has no Pages deploy tool.** Its presence does not mean you can ship.

Therefore: **someone human authenticates once.** No agent, Codex or Claude, can complete a
browser OAuth handshake or invent a token. Every other step is automatable.

## 3. The path, in order

### Step 1 — Akram, once (not an agent)

```bash
npx wrangler login
```

Opens a browser; approve with the Google account. State then persists in `~/.wrangler` and
every later step is unattended. Confirm it took:

```bash
npx wrangler whoami
```

> First run of `npx wrangler` **timed out after 3 minutes** here on a cold cache. That is a
> download, not a hang. Install it locally first to avoid repeating the wait:
> `npm install -D wrangler`

### Step 2 — the first deploy is interactive

The **first** `pages deploy` for a project that does not yet exist prompts for a project name
and a production branch. A prompt cannot be answered from a non-interactive tool call, so
either Akram runs this one, or he creates an empty `studio-web` Pages project in the
dashboard and agents deploy into it from then on.

```bash
npm run build
npx wrangler pages deploy dist --project-name=studio-web
```

### Step 3 — every deploy after that is an agent's job

See the `codex-deploy-agents` skill. The shape that works:

```bash
codex exec -s workspace-write \
  -c sandbox_workspace_write.network_access=true \
  -C /c/3D-Studio/02_projects/studio-web \
  -o /tmp/deploy.txt <<'PROMPT'
Do exactly this, in order, and STOP at the first failure rather than working around it:
1. npx wrangler whoami   — if not logged in, STOP and say AUTH_MISSING.
2. npm run build         — report dist/ file count and total size.
3. Confirm dist/ is under 20000 files and no file exceeds 25 MiB.
4. npx wrangler pages deploy dist --project-name=studio-web
Finish with exactly one line: DEPLOYED <url>, or FAILED <step> <reason>.
PROMPT
```

**`workspace-write` has no network by default** — without that `-c` flag the deploy fails in
a way that looks like a code bug and is not.

Then verify independently. `curl -sI <url>` should return 200. An agent saying "deployed" is
a claim, not evidence.

## 4. Pre-flight checks that matter

- **Pages free tier:** 20,000 files/deployment, 25 MiB/file, 500 builds/month. `dist/` at
  2,321 files / 80 MB sits inside all three. If the asset library grows past 20,000 files,
  that is the point where R2 becomes necessary — see decision #11.
- **Secret scan** — must return nothing:
  ```bash
  grep -rIl -E 'sk_[A-Za-z0-9]{20,}|service_role|sb_secret' dist
  ```
- **A deploy is publication.** Deleting the project afterwards does not un-publish it.
  Confirm Akram asked for *this* deploy, now.

## 5. Traps that already cost time — do not rediscover them

- **Run Playwright per-file.** All 41 tests in one worker exhausts WebGL contexts and flakes
  three of them. Per-file is 40/40.
- **Headless Chromium needs `--use-gl=angle --use-angle=d3d11`** or it renders at 2 fps
  instead of 60. Set per-suite, not globally — Windows-only flags, validated only under the
  WebGL-heavy suites.
- **`exportWebM()` returns `null` on this machine** by design. MediaRecorder never clears the
  frame-completeness floor here, and an honest `null` beat shipping a 110-byte "video".
- **`SCOPE.md` §2/§5 prose still says `AccountState.status` is `'loading' | 'ready'`.**
  Decision #18 replaced it with `'signed-out' | 'signed-in'`. The **code is correct**; the
  signed document was deliberately left lagging. Do not "fix" the code to match the prose.
- **The 12 HDRIs and 2,268 GLBs are gitignored.** A fresh clone must re-run `pipeline/`.

## 6. The pattern worth carrying forward

Three bugs shipped past green tests, and all three were found by **opening the app**:
`exportWebM()` returning a 110-byte Blob whose test only asserted "did not throw"; default
bloom blowing the model to solid white while a "≥0.5% of pixels moved" check measured 94.32%
and passed; and `#viewport-hint` reading "Loading studio…" forever because no test loaded the
real page shell.

One class: **a passing check over a wrong artefact.** All three now have regression tests,
and the bloom and hint tests were each proven to fail against the un-fixed code before being
accepted. Apply the same standard to the deploy — look at the live URL, do not trust the
exit code.

## 7. Optional, non-blocking

Three sign-ups, none needing a payment method. The app functions fully without them; they
unlock features rather than fix breakage.

| Service | Hands back | Env var(s) | Without it |
|---|---|---|---|
| Supabase | Project URL + anon key | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Account panel stays signed-out |
| Lemon Squeezy | Test-mode store URL | `VITE_LEMONSQUEEZY_STORE_URL` | Checkout stays a labelled SANDBOX stub |
| Cloudflare | Pages project | — | **No public deploy** |

## 8. Standing rules, still in force

- Free library is **CC0 only**; every asset records licence + source URL. Furnishow meshes
  are a private client's — test input only, never library, never public. Mixamo: link out,
  never redistribute.
- **No spending. No sign-ups by agents. No public deploy without Akram. Keys only in env
  vars** — never printed, never requested in chat, never written to a file.
- `reference/` is **never edited**.
- Out of scope for v1: mesh editing, sculpting, node editor, physics, path tracing, paid AI
  calls, anything needing Rust/MSVC, desktop packaging.
