# playwright-agents

A Claude Code plugin that wraps Playwright's official planner → generator → healer
test-authoring agents and hardens them into a reliable, low-friction workflow.

It does not reimplement the agents — those are first-party Playwright (1.56+). It sets
them up, pins their model/effort, orchestrates the loop, and **verifies the generated
test with a real test run**. Works in vanilla Claude Code and inside ccage with no
modifications.

> Status: in development. See `docs/specs/2026-06-10-playwright-agents-design.md` for the
> design and `docs/IMPLEMENTATION_PLAN.md` for the build plan.

## What it fixes

- Deterministic pass/fail — closes the loop with a real test command, not the MCP's
  indirect signal.
- Pinned per-role model/effort — sub-agents stop silently inheriting the session effort.
- Auth, write-path, and snapshot-token house rules baked into the workflow.
- One install, zero env-specific edits: vanilla Claude Code or ccage.

## Install

From inside Claude Code:

```
/plugin marketplace add https://github.com/farhanferoz/playwright-agents
/plugin install playwright-agents@playwright-agents
```

## Commands & skills

| Trigger | What it does |
|---|---|
| `/pw-setup [path-to-e2e-dir]` | One-time setup: init agents if needed, pin model/effort + house rules, wire the Test MCP into the launch-dir `.mcp.json`. Relaunch Claude Code afterwards. |
| `/pw-author "<flow>"` | Author a test for a described flow: plan → generate → verify → heal → re-verify, ending on a real test run. |
| `e2e-authoring` skill | Natural-language entry to the same loop ("write an e2e test for the login flow"). |

See [`docs/examples/USAGE.md`](docs/examples/USAGE.md) for a full walkthrough.

## Configuration

Optional `playwright-agents.config.json` at the repo root overrides the shipped defaults
(deep-merged; arrays replace). Full example: [`docs/examples/playwright-agents.config.json`](docs/examples/playwright-agents.config.json).

| Key | Default | Meaning |
|---|---|---|
| `testCommand` | `npx playwright test` | Command the verify gate runs against the new spec. |
| `testDir` | `tests` | Where specs live. |
| `auth` | `{ mode: "storageState", setupPath: "tests/auth.setup.ts" }` | How auth is provided to tests. |
| `healRetries` | `1` | Max healer attempts after a failing verify. |
| `agents.<role>.model` / `.effort` | `sonnet` / `high` | Pinned per role (`planner`, `generator`, `healer`). |
| `houseRules` | `[]` | Extra rules appended to every agent's managed block. |

The design rationale for each setting is in the
[design spec](docs/specs/2026-06-10-playwright-agents-design.md).

## The five caveats it fixes

| # | Caveat | Fix |
|---|---|---|
| 1 | Generator write-path must be workspace-prefixed | House-rule in the overlay states the path convention (generator). |
| 2 | Full page snapshots blow the token budget | House-rule: prefer `browser_evaluate` on dense pages. |
| 3 | Pass/fail signal is indirect | Verify step runs the real test command — the only success signal. |
| 4 | Locator retries on complex pages | Auto-chain the healer when the spec fails (bounded by `healRetries`). |
| 5 | Auth not auto-injected | Setup wires `storageState`/seed per config. |
| + | Effort silently inherited from session | Pin `effort:` in agent frontmatter. |

## Requirements

- `@playwright/test` ≥ 1.56 (TypeScript/JavaScript projects only — the Playwright Test
  MCP is TS/JS only).
- Node.js ≥ 20.

## Development

```
npm test    # node --test over scripts/lib
```
