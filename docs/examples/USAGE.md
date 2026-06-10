# Usage walkthrough

A start-to-finish run, from install to a green test.

## 1. Install the plugin

From inside Claude Code:

```
/plugin marketplace add https://github.com/farhanferoz/playwright-agents
/plugin install playwright-agents@playwright-agents
```

## 2. One-time setup

Run setup from your **launch directory** (where you start `claude`). For a monorepo,
pass the path to the package that holds your Playwright project:

```
/pw-setup apps/e2e
```

For a single-package repo, no argument is needed:

```
/pw-setup
```

Setup will:
- run `npx playwright init-agents --loop=claude` if the agents are not present yet,
- pin each agent's `model`/`effort` and inject the managed house-rules block,
- wire the Playwright Test MCP server into the launch-dir `.mcp.json`,
- report the configured auth mode.

**Relaunch Claude Code** afterwards so the MCP server loads.

## 3. Configure (optional)

Drop a `playwright-agents.config.json` at the repo root to override defaults. See
[`playwright-agents.config.json`](./playwright-agents.config.json) in this directory for a
full example. Absent a config file, the shipped defaults apply (Sonnet/high for all three
roles, `npx playwright test`, one heal retry).

## 4. Author a test

Start your app under test, then:

```
/pw-author "log in and see the dashboard"
```

This drives the loop autonomously: **plan → generate → verify → (heal → re-verify)**.
The verify step runs your real test command against the new spec — a green exit code is
the only success signal. On a persistent failure the spec is left on disk with a summary.

You can also trigger the same loop in natural language ("write an e2e test for the login
flow") via the bundled `e2e-authoring` skill.

## ccage

Under ccage the plugin installs per project and behaves identically — there are no
environment-specific steps and no env detection. The launch-dir `.mcp.json` write is
project-scoped and isolation-safe in both vanilla Claude Code and ccage.

## Limitation

The Playwright Test MCP is **TypeScript/JavaScript only**, so these agents author TS/JS
specs only. Other language bindings are out of scope.

## Verified on

_(dogfood results recorded here after Task 11.)_
