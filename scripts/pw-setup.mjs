// scripts/pw-setup.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig } from './lib/config.mjs';
import { applyOverlay } from './lib/overlay.mjs';
import { wireMcp } from './lib/mcp.mjs';

function log(msg) { process.stdout.write(`[pw-setup] ${msg}\n`); }

function findAgentsDir(launchDir) {
  const candidates = [
    path.join(launchDir, '.claude', 'agents'),
    path.join(launchDir, 'apps', 'e2e', '.claude', 'agents'),
  ];
  return candidates.find((d) => fs.existsSync(d)) ?? null;
}

function main() {
  const launchDir = process.cwd();
  const config = loadConfig(launchDir);

  // e2eDir defaults to launchDir; override with the first CLI arg for monorepos.
  const e2eDir = process.argv[2] ? path.resolve(process.argv[2]) : launchDir;

  // 1. Ensure agents exist (run init-agents if not).
  let agentsDir = findAgentsDir(launchDir);
  if (!agentsDir) {
    log('no agents found — running `npx playwright init-agents --loop=claude`');
    const r = spawnSync('npx', ['playwright', 'init-agents', '--loop=claude'], { cwd: e2eDir, stdio: 'inherit' });
    if ((r.status ?? 1) !== 0) { log('init-agents failed'); process.exit(1); }
    agentsDir = findAgentsDir(launchDir);
  }
  if (!agentsDir) { log('could not locate .claude/agents after init'); process.exit(1); }

  // 2. Overlay (pin model/effort + house rules).
  const touched = applyOverlay(agentsDir, config);
  log(`overlay applied to: ${touched.map((t) => `${t.role}${t.changed ? '*' : ''}`).join(', ') || '(none)'}`);

  // 3. MCP wiring. serverSpec mirrors the init-agents-generated .mcp.json entry.
  const relE2e = path.relative(launchDir, e2eDir) || '.';
  const serverSpec = {
    command: path.join(relE2e, 'node_modules', '.bin', 'playwright'),
    args: ['run-test-mcp-server', '--headless', '-c', relE2e],
  };
  const mcp = wireMcp({ launchDir, serverSpec });
  log(`MCP wired → ${mcp.file} as '${mcp.server}'`);

  // 4. Auth reminder (config-driven; setup does not fabricate credentials).
  log(`auth mode: ${config.auth.mode} (${config.auth.setupPath ?? config.auth.seedPath ?? 'n/a'})`);
  log('done. Relaunch Claude Code so the MCP server loads, then run /pw-author.');
}

main();
