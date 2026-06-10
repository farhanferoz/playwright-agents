# playwright-agents — Design Spec

**Date:** 2026-06-10
**Status:** Approved design (pre-implementation)
**Author:** Farhan Feroz

---

## 1. Summary

`playwright-agents` is a public Claude Code **plugin** that wraps Playwright's official
planner → generator → healer test-authoring agents (shipped first-party in Playwright
1.56+) and *hardens* them into a reliable, low-friction workflow.

The plugin does **not** contain the agents or the MCP server — those are first-party
Playwright. It **sets them up, pins their model/effort, orchestrates the loop, and
verifies their output with a real test run.** It is a thin, value-adding wrapper, so
Playwright's own upgrades to the agents flow through automatically.

### Why this exists (the gap)

The planner/generator/healer loop is already first-party (`npx playwright init-agents`),
and the Playwright Test MCP ships inside `@playwright/test`. What no existing tool
(official, Anthropic's `webapp-testing` skill, or community plugins like
`yusuftayman/playwright-cli-agents`) provides is the **hardening + packaging layer**:

1. **Deterministic verification** — every existing tool ends on the MCP's indirect
   pass/fail signal; none close the loop with a real `<test command> <file>` exit code.
2. **Per-role effort pinning** — agents otherwise silently inherit the *session* effort
   (e.g. an Opus xhigh session makes a Sonnet sub-agent run at xhigh — wasteful). No
   existing tool pins effort.
3. **Auth-seed reuse, repo conventions, the write-path rule** baked into the workflow.
4. **Isolation-safe cross-project distribution** that works in vanilla Claude Code *and*
   in ccage with no modifications.

## 2. Goals / Non-Goals

### Goals
- One installable, versioned, public plugin (single-plugin marketplace repo).
- Same artifact, same commands, **zero modifications** for vanilla Claude Code users
  and ccage users alike — environment differences are handled by auto-detection.
- Fix all five known friction points (the "caveats", §6).
- Stay a genuine wrapper: never vendor or fork the agent prompts.

### Non-Goals (YAGNI for v1)
- Non-Playwright frameworks (Cypress, etc.).
- Non-TypeScript/JavaScript targets — the Playwright Test MCP is TS/JS only; this is a
  *documented* limitation, not a feature gap to close.
- CI / GitHub-Actions integration.
- Page-Object-Model scaffolding or data-mock generators.
- Watch mode / auto-run on file change.

## 3. Core invariants

- **INV-1 — Wrap, don't vendor.** The plugin ships *no* copies of the planner/generator/
  healer prompts. It applies a small, idempotent **overlay** to whatever
  `init-agents` generated.
- **INV-2 — One artifact, zero env-specific edits.** A vanilla user and a ccage user
  install the same plugin and run the same commands. The only difference is what
  `/pw-setup` does internally, decided by auto-detection. ccage is a *detected code
  path*, never a separate mode or a fork, and never a hard dependency.
- **INV-3 — The loop always ends in a real test run.** Authoring is not "done" until the
  configured test command has run the new spec and reported an exit code.
- **INV-4 — Effort is pinned, never inherited.** Agent frontmatter carries an explicit
  `effort` so sub-agents never ride the session's effort level.

## 4. Components

| Component | Type | Responsibility |
|---|---|---|
| `/pw-setup` | slash command | One-time, idempotent: ensure agents exist (run `init-agents` if needed), apply the overlay, wire the MCP (env-aware), wire auth. |
| `/pw-author "<flow>"` | slash command | Drive the full loop for one flow: plan → generate → heal → **verify**. |
| `e2e-authoring` | skill | The how-to + house rules; lets natural language ("write an e2e test for X") trigger the same loop. |
| overlay engine | script | Inject `model:`/`effort:` frontmatter + a house-rules block into the generated agent files. Idempotent; preserves the upstream prompt body. |
| env detector | script | Decide vanilla vs ccage (see §7). |
| `playwright-agents.config.json` | config | Per-repo knobs (§8). All optional with sensible defaults. |
| docs | README + examples | Public-quality usage, the five caveats, ccage notes, the TS/JS-only limitation. |

## 5. Architecture & data flow

### 5.1 Setup flow (`/pw-setup`) — environment-aware

1. **Detect Playwright.** If `@playwright/test` ≥ 1.56 is present but agents are not yet
   generated, run `npx playwright init-agents --loop=claude` (writes
   `.claude/agents/*.md`, an MCP config, `specs/`, `tests/seed.spec.ts`).
2. **Apply the overlay** to each generated agent file:
   - Add/replace `model:` and `effort:` frontmatter per role (defaults in §6).
   - Append a delimited, idempotent house-rules block (prefer `browser_evaluate` over
     full snapshots on dense pages; the workspace-prefixed write-path rule).
   - Re-running the overlay never duplicates (keyed by a sentinel marker).
3. **Wire the MCP — the env branch (INV-2):**
   - *Vanilla Claude Code:* validate / keep the `.mcp.json` `init-agents` wrote (or
     fall back to `claude mcp add`).
   - *ccage detected:* wire the **launch-dir** `.mcp.json` via `ccage enable-mcp`, so the
     server is discoverable (launch-dir, not a subdir) and isolation-safe (per-cage
     `.mcp.json`, never the cage's `.claude.json`).
4. **Wire auth** per config: reuse an existing `storageState` setup, or the
   `seed.spec.ts` sign-in.

### 5.2 Authoring loop (`/pw-author "<flow>"`)

```
planner   → explores the running app, writes a plan into specs/
generator → turns the plan into a *.spec.ts, locators verified against the live page
healer    → runs the spec in debug mode, repairs failures (auto-chained on failure)
VERIFY    → plugin runs `<config.testCommand> <new spec>` and reports the real exit code
```

**Intent:** the loop runs **autonomously end-to-end** — `/pw-author` drives plan →
generate → heal → verify without per-step human prompting. If the platform cannot
dispatch sub-agents from a slash command, the command falls back to *guided* mode:
it instructs the session to invoke each agent in order. The user-visible contract is the
same either way.

**Verify ↔ heal ordering (INV-3).** The healer runs first (debug-mode, MCP-driven) and
repairs what it can. VERIFY is the plugin's own *terminal gate*: it runs
`<config.testCommand> <new spec>` for a deterministic exit code. If VERIFY is **red**, it
re-enters the healer **at most once more** (bounded retry, default 1), then VERIFY runs
again; a second red is reported as a failure (the spec is left on disk with the failure
output) rather than looped indefinitely. The retry bound is configurable
(`healRetries`, default 1). VERIFY is the only thing that declares success.

The verification step (INV-3) is the plugin's, not the MCP's — it converts the indirect
agent signal into a deterministic green/red.

## 6. The five caveats → how each is fixed

| # | Caveat | Fix | Where |
|---|---|---|---|
| 1 | Generator write-path must be workspace-prefixed | House-rule in the overlay states the path convention | overlay → generator |
| 2 | Full page snapshots blow the token budget | House-rule: prefer `browser_evaluate` on dense pages | overlay → planner+generator |
| 3 | Pass/fail signal is indirect | Verification step runs the real test command (INV-3) | `/pw-author`, skill |
| 4 | Locator retries on complex pages | Auto-chain the healer when the spec fails | `/pw-author`, skill |
| 5 | Auth not auto-injected | Setup wires `storageState`/seed per config | `/pw-setup`, config |
| + | Effort silently inherited from session | Pin `effort:` in frontmatter (INV-4) | overlay |

### Model / effort policy (shipped defaults; all overridable in config)

| Role | model | effort |
|---|---|---|
| planner | `sonnet` | `high` |
| generator | `sonnet` | `high` |
| healer | `sonnet` | `high` |

Uniform Sonnet/high. The point is not the specific value but that it is **explicit and
pinned**, so a sub-agent never rides the session effort up to xhigh/max.

## 7. ccage support (detection, not configuration)

**Detection rule:** treat the environment as ccage when **both** hold:
- `CLAUDE_CONFIG_DIR` is set and matches `~/.claude-*` (a per-cage config dir, not the
  bare `~/.claude`), **and**
- `ccage` is on `PATH`.

When ccage is detected, `/pw-setup` routes MCP wiring through `ccage enable-mcp`
(launch-dir `.mcp.json`, isolation-safe). Otherwise it uses the standard `.mcp.json`.

If detection is ambiguous, `/pw-setup` asks once or accepts an optional `--env
vanilla|ccage` override. Default is fully automatic. There is **no** ccage-specific
install step and **no** hard dependency on ccage (INV-2).

> Implementation note to verify: whether Claude Code plugins install per-cage
> (`CLAUDE_CONFIG_DIR`) or symlink from the master `~/.claude`. This affects whether the
> plugin is installed once globally or once per cage. It does **not** change the
> "no modifications" promise — the install command is identical either way.

## 8. Configuration — `playwright-agents.config.json` (repo root)

All keys optional; an empty/absent file uses defaults.

```jsonc
{
  "testCommand": "pnpm test",          // deterministic verification run
  "testDir": "tests",                  // where specs live

  // auth — pick ONE mode:
  "auth": { "mode": "storageState",    //   reuse an existing saved-login setup
            "setupPath": "tests/auth.setup.ts" },
  //   ... or sign in via the generated seed:
  // "auth": { "mode": "seed", "seedPath": "tests/seed.spec.ts" },

  "healRetries": 1,                    // VERIFY-red → re-heal at most N more times
  "agents": {                          // per-role model/effort overrides
    "planner":   { "model": "sonnet", "effort": "high" },
    "generator": { "model": "sonnet", "effort": "high" },
    "healer":    { "model": "sonnet", "effort": "high" }
  },
  "houseRules": [ "optional extra guidance appended to agents" ]
}
```

## 9. Repo layout (single-plugin marketplace)

```
playwright-agents/
  .claude-plugin/plugin.json        # plugin manifest
  .claude-plugin/marketplace.json   # repo is its own marketplace
  commands/        pw-setup.md, pw-author.md
  skills/          e2e-authoring/SKILL.md
  scripts/         overlay + env-detection (+ bats tests)
  docs/            README, specs/, examples
  LICENSE          # MIT
```

Install path for consumers:
`/plugin marketplace add <git-url>` → `/plugin install playwright-agents@playwright-agents`.

## 10. Testing strategy

- **Unit (bats, mirroring `ccage enable-mcp` test style):**
  - overlay idempotency (re-run = no duplication), correct frontmatter injection,
    upstream prompt body preserved.
  - env detection: vanilla vs ccage with mocked `CLAUDE_CONFIG_DIR` / `PATH`.
  - config parsing + defaults.
- **Dogfood integration:**
  - run `/pw-setup` + `/pw-author` against StratSense `apps/e2e` (real Playwright repo)
    and confirm a generated spec **passes via the verification step**.
  - repeat against a vanilla scratch repo to prove the non-ccage path.
- **ccage path:** dogfood inside a StratSense cage to prove `enable-mcp` wiring +
  agent discovery with no edits.

## 11. Open implementation questions (resolve during planning, not blocking)

- Exact overlay mechanism for idempotent frontmatter edits (sentinel-delimited block vs
  structured YAML rewrite). Must survive `init-agents` re-runs.
- Plugin install location under ccage (per-cage vs symlinked master) — verify empirically.
- Whether `/pw-author` invokes the planner+generator+healer agents directly or guides the
  user through them (depends on how plugin commands can dispatch sub-agents).
