---
name: e2e-authoring
description: Use when the user asks to write, author, or generate a Playwright end-to-end (browser) test for a described flow, or to fix/heal a failing Playwright test. Drives the official planner/generator/healer agents and verifies the result with a real test run.
---

# Authoring Playwright e2e tests with the official agents

Use this when the user wants a browser end-to-end test authored or repaired.

## Preconditions
- The repo has been set up once via `/pw-setup` (agents generated + overlaid, MCP wired).
  If the `playwright-test` MCP tools are not available, tell the user to run `/pw-setup`
  and relaunch Claude Code.
- The app under test must be running.

## The loop (run autonomously)
1. **Plan** — `planner` agent explores the flow, saves a plan to `specs/`.
2. **Generate** — `generator` agent writes one `*.spec.ts` (workspace-prefixed path;
   prefer `browser_evaluate` over full snapshots).
3. **Verify** — run `node "${CLAUDE_PLUGIN_ROOT}/scripts/pw-verify.mjs" <spec>` for a
   real exit code. This is the only success signal.
4. **Heal if red** — `healer` agent on the failing spec, then re-verify. Bounded by
   `healRetries` (default 1).
5. **Report** — spec path + PASS/FAIL + exit code.

## Notes
- Never declare success on the agents' indirect signal alone — only on a green verify.
- Model/effort are pinned in the agent frontmatter by the overlay; do not change them
  here.
