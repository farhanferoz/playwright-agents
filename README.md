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

## Requirements

- `@playwright/test` ≥ 1.56 (TypeScript/JavaScript projects only — the Playwright Test
  MCP is TS/JS only).
