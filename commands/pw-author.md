---
description: Author an e2e test for a described flow — plan, generate, heal, then verify with a real test run.
argument-hint: "<flow description>"
---

Author a Playwright end-to-end test for: **$ARGUMENTS**

Drive the official Playwright agents in order. Run autonomously; do not stop for
per-step confirmation.

1. **Plan** — invoke the `planner` agent (Task tool) to explore the running app for the
   flow "$ARGUMENTS" and save a plan into `specs/`. (The app must be running; if it
   isn't, tell the user to start it and stop.)

2. **Generate** — invoke the `generator` agent to turn that plan into a single
   `*.spec.ts`. Honour the agent's house rules (workspace-prefixed write path; prefer
   `browser_evaluate`).

3. **Verify (deterministic gate)** — run the real test command on the new spec:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/pw-verify.mjs" <path-to-the-new-spec>
   ```

4. **Heal if red** — if step 3 fails, invoke the `healer` agent on the failing spec,
   then re-run step 3. Repeat at most `healRetries` times (default 1; read it from
   `playwright-agents.config.json` if present).

5. **Report** — state the final result: spec path + PASS/FAIL + the verify exit code.
   On a persistent FAIL, leave the spec on disk and summarise the failure; do not loop
   further.
