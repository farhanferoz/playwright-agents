// scripts/lib/mcp.mjs
import fs from 'node:fs';
import path from 'node:path';

export const SERVER_KEY = 'playwright-test';

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
