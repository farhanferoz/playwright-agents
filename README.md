# playwright-agents

A [Claude Code](https://claude.com/claude-code) plugin that wraps Playwright's official
**planner → generator → healer** test-authoring agents and hardens them into a reliable,
low-friction workflow — ending every authoring run with a **real test execution**, not a
guess.

It does **not** reimplement the agents. Those are first-party Playwright (≥ 1.56,
`npx playwright init-agents`). This plugin sets them up, pins their model and reasoning
effort, injects a few durable house rules, wires the Playwright **Test MCP** into your
project, and closes the loop by running your actual test command against the spec the
generator wrote. If it's red, it chains the healer and re-runs — bounded.

Works in vanilla Claude Code and inside per-project sandboxes like
[ccage](#using-it-across-projects-ccage), with no environment-specific edits.

---

## Why

Playwright's agents are excellent, but driving them by hand has recurring friction:

- **The pass/fail signal is indirect.** The agents report success from the MCP's
  perspective, which isn't the same as your test suite going green. You find out later.
- **Sub-agents silently inherit the session's reasoning effort.** Spin the session up to
  `xhigh` and your generator quietly burns budget; nobody pinned it.
- **A few sharp edges repeat every time** — generator write-paths, page snapshots that
  blow the token budget, locator flakiness on complex pages, and auth that isn't injected.

This plugin turns the loop into a deterministic, repeatable command and bakes the fixes in.

## How it works

```
/pw-setup            ──►  ensure agents exist (init-agents if missing)
                          pin model + effort, inject house rules
                          wire the Test MCP into the launch-dir .mcp.json
        │
   (relaunch Claude Code so the MCP server loads)
        │
/pw-author "<flow>"  ──►  planner   → explores the running app, saves a plan
                          generator → writes one *.spec.ts
                          verify    → runs your real test command  ◄─ the only success signal
                          healer    → if red, fixes the spec, then re-verify (bounded)
                          report    → spec path + PASS/FAIL + exit code
```

The **verify gate** is the heart of it: success is a green exit code from your own test
command, nothing softer.

## Requirements

- **`@playwright/test` ≥ 1.56** in the target project (provides `init-agents` and the Test
  MCP).
- **TypeScript / JavaScript projects only** — the Playwright Test MCP is TS/JS only.
- **Node.js ≥ 20** (the plugin's own scripts; no third-party dependencies).
- **Claude Code** with plugin support.

## Install

From inside Claude Code:

```
/plugin marketplace add https://github.com/farhanferoz/playwright-agents
/plugin install playwright-agents@playwright-agents
```

This makes `/pw-setup`, `/pw-author`, and the `e2e-authoring` skill available.

## Quick start

1. **Set up the project once** (from the directory where you launch Claude Code — for a
   monorepo, pass the path to your e2e package; see [Monorepos](#monorepos)):

   ```
   /pw-setup
   ```

2. **Relaunch Claude Code** so the Playwright Test MCP server loads. After relaunch the
   `mcp__playwright-test__*` tools should be available.

3. **Start the app under test** (the planner drives a real browser against it).

4. **Author a test:**

   ```
   /pw-author "log in and see the dashboard"
   ```

   It runs the full loop autonomously and ends on a real test run. On a persistent failure
   it leaves the spec on disk with a summary instead of looping forever.

You can also trigger the same loop in natural language ("write an e2e test for the
checkout flow") via the bundled `e2e-authoring` skill.

A complete walkthrough is in [`docs/examples/USAGE.md`](docs/examples/USAGE.md).

## Commands & skills

| Trigger | What it does |
|---|---|
| `/pw-setup [path-to-e2e-dir]` | One-time setup: run `init-agents` if needed, pin model/effort + house rules, wire the Test MCP into the launch-dir `.mcp.json`. **Relaunch afterwards.** |
| `/pw-author "<flow>"` | Author a test for a described flow: plan → generate → verify → heal → re-verify, ending on a real test run. |
| `e2e-authoring` skill | Natural-language entry to the same loop. |

## Configuration

Drop an optional `playwright-agents.config.json` at the repo root to override the shipped
defaults. Values are **deep-merged**; arrays **replace**. Full example:
[`docs/examples/playwright-agents.config.json`](docs/examples/playwright-agents.config.json).

| Key | Default | Meaning |
|---|---|---|
| `testCommand` | `npx playwright test` | Command the verify gate runs against the new spec. |
| `testDir` | `tests` | Where specs live. |
| `auth` | `{ "mode": "storageState", "setupPath": "tests/auth.setup.ts" }` | How auth is provided to generated tests. |
| `healRetries` | `1` | Max healer attempts after a failing verify. |
| `agents.<role>.model` / `.effort` | `sonnet` / `high` | Pinned per role (`planner`, `generator`, `healer`). |
| `houseRules` | `[]` | Extra rules appended to every agent's managed house-rules block. |

The default policy is uniform **Sonnet / high** for all three roles. The point isn't the
specific value — it's that effort is **explicit and pinned**, so a sub-agent never rides
the session effort up to `xhigh`/`max`. The rationale for each setting is in the
[design spec](docs/specs/2026-06-10-playwright-agents-design.md).

## Monorepos

`init-agents` and the Test MCP belong to your **e2e package**, but Claude Code discovers
`.mcp.json` and agents only at the directory you launch in (and your home dir) — never in
subdirectories. So setup writes the `.mcp.json` at your **launch directory** and points
the Test MCP at the e2e package explicitly:

```
/pw-setup apps/e2e
```

For package managers that **don't hoist** (e.g. pnpm), `playwright` lives only inside the
e2e package's `node_modules`. Setup handles this: it wires the MCP server to the e2e
package's own `playwright` binary (with `-c <e2e-dir>`), so the server resolves correctly
even when Claude Code is launched from the repo root.

## Using it across projects (ccage)

Under ccage (per-project Claude Code sandboxing) the plugin behaves identically — there
are no environment-specific steps. Two ccage features make it ergonomic:

- **Share the plugin across every cage** without a per-project install by pointing
  `CCAGE_PLUGINS_FROM` at a folder containing the plugin directory; ccage passes
  `--plugin-dir` on each launch. The plugin ships no MCP server of its own, so loading it
  everywhere starts nothing — the commands and skill are inert until invoked.
- **Keep the Test MCP opt-in / on-demand** with `ccage enable-mcp <name> -- <command>`
  (and `ccage disable-mcp <name>` to turn it off). This is equivalent to the `.mcp.json`
  that `/pw-setup` writes, but lets you switch the browser MCP on only when you're
  authoring.

## The friction points it fixes

| # | Friction | Fix |
|---|---|---|
| 1 | Generator write-path must be workspace-prefixed | House-rule in the overlay states the path convention (generator only). |
| 2 | Full page snapshots blow the token budget | House-rule: prefer `browser_evaluate` on dense pages. |
| 3 | Pass/fail signal is indirect | Verify step runs your real test command — the only success signal. |
| 4 | Locator retries on complex pages | Auto-chain the healer when the spec fails (bounded by `healRetries`). |
| 5 | Auth not auto-injected | Setup wires `storageState`/seed per config. |
| + | Effort silently inherited from the session | Pin `effort:` in agent frontmatter. |

## Troubleshooting

- **`mcp__playwright-test__*` tools don't appear after `/pw-setup`.** You must **relaunch**
  Claude Code — the MCP server loads at session start. Confirm the `.mcp.json` is at your
  launch directory (not a subfolder). In a monorepo, make sure the e2e package's
  dependencies are installed (`playwright` must resolve).
- **The verify gate runs the wrong command.** Set `testCommand` in
  `playwright-agents.config.json` (e.g. a workspace-filtered command), plus `testDir` to
  point at where specs live.
- **The planner can't get past a login wall.** The planner drives a fresh browser that
  isn't logged in. Point `auth.setupPath` at your `storageState` setup, or author a flow
  that's reachable without auth first.
- **`/pw-author` succeeds but the suite is red later.** It shouldn't — success is defined
  as a green verify. If it happens, your `testCommand` isn't exercising the new spec; fix
  the config.

## How it's built

A thin wrapper. The plugin ships **no agent prompts** — it sets up and hardens the
first-party Playwright agents in your repo. Small, dependency-free Node.js modules
(config, an idempotent agent-file overlay, MCP wiring, a verify runner) live under
`scripts/lib/` with `node:test` unit tests, orchestrated by the two commands and the
skill. Setup is **idempotent**: re-running yields byte-identical agent files.

```
.claude-plugin/plugin.json     # plugin manifest
commands/{pw-setup,pw-author}.md
skills/e2e-authoring/SKILL.md
scripts/
  pw-setup.mjs   pw-verify.mjs  # orchestrators
  lib/{config,overlay,mcp,verify}.mjs (+ *.test.mjs)
docs/                          # design spec, plan, usage, example config
```

## Development

```
npm test    # node --test over scripts/lib  (28 unit tests)
```

## License

[MIT](LICENSE) © Farhan Feroz
