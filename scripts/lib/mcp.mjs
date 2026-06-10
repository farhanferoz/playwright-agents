// scripts/lib/mcp.mjs
import fs from 'node:fs';
import path from 'node:path';

export const SERVER_KEY = 'playwright-test';

// The base entry init-agents generates when its own .mcp.json can't be read.
// Confirmed empirically against @playwright/test 1.60: `npx playwright run-test-mcp-server`.
const FALLBACK_SERVER = { command: 'npx', args: ['playwright', 'run-test-mcp-server'] };

/**
 * Build the server spec to write at the launch-dir `.mcp.json`, starting from the entry
 * init-agents actually generated (`generatedDoc`, the parsed `<e2eDir>/.mcp.json`) and
 * adapting it for the launch dir:
 *   - `--headless`: added when `headless` (the planner/generator drive a browser as
 *     autonomous sub-agents — headed would pop windows and fails on a display-less cage/CI).
 *   - `-c <relE2e>`: added only for a monorepo (relE2e !== '.'), because the generated
 *     command relies on cwd to find the Playwright config; hoisted to the launch dir the
 *     server's cwd is the repo root, so it must be pointed at the e2e project explicitly.
 * Idempotent in its inputs: never duplicates a flag already present.
 */
export function buildServerSpec({ generatedDoc = null, relE2e = '.', headless = true } = {}) {
  const base = generatedDoc?.mcpServers?.[SERVER_KEY] ?? FALLBACK_SERVER;
  const args = [...(base.args ?? [])];
  if (headless && !args.includes('--headless')) args.push('--headless');
  if (relE2e !== '.' && !args.includes('-c') && !args.includes('--config')) {
    args.push('-c', relE2e);
  }
  return { command: base.command ?? FALLBACK_SERVER.command, args };
}

export function mergeServerIntoMcpJson(doc, key, serverSpec) {
  const out = { ...doc };
  out.mcpServers = { ...(doc.mcpServers ?? {}) };
  out.mcpServers[key] = serverSpec;
  return out;
}

/**
 * Wire the Playwright Test MCP server into the launch-dir `.mcp.json`.
 * One path for every environment: a launch-dir `.mcp.json` is project-scoped and
 * isolation-safe in both vanilla Claude Code and ccage. Never use `claude mcp add`
 * (config-dir state, the only isolation-unsafe option).
 */
export function wireMcp({ launchDir, serverSpec, fs: fsmod = fs }) {
  const file = path.join(launchDir, '.mcp.json');
  let doc = {};
  try { doc = JSON.parse(fsmod.readFileSync(file, 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  const merged = mergeServerIntoMcpJson(doc, SERVER_KEY, serverSpec);
  fsmod.writeFileSync(file, JSON.stringify(merged, null, 2) + '\n');
  return { file, server: SERVER_KEY };
}
