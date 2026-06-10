---
description: One-time setup of the Playwright test agents — init, pin model/effort, and wire the Test MCP into the launch-dir .mcp.json.
argument-hint: "[path-to-e2e-dir]"
---

Run the playwright-agents setup for this repository.

1. Run the setup orchestrator (pass the e2e dir if this is a monorepo, e.g. `apps/e2e`):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/pw-setup.mjs" $ARGUMENTS
   ```

2. Read the output. Confirm to the user:
   - which agent files were overlaid (model/effort pinned + house rules),
   - that the Test MCP server was wired into the launch-dir `.mcp.json`,
   - the configured auth mode.

3. Tell the user they must **relaunch Claude Code** so the Playwright Test MCP loads,
   then they can run `/pw-author "<flow>"`.

Do not write tests or generate anything in this command — setup only.
