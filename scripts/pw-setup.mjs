// scripts/pw-setup.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig, persistTestCommand } from './lib/config.mjs';
import { applyOverlay } from './lib/overlay.mjs';
import { wireMcp, buildServerSpec } from './lib/mcp.mjs';

function log(msg) { process.stdout.write(`[pw-setup] ${msg}\n`); }

function findAgentsDir(e2eDir) {
  // Agents always live under the e2e package that init-agents ran in.
  const d = path.join(e2eDir, '.claude', 'agents');
  return fs.existsSync(d) ? d : null;
}

function main() {
  const launchDir = process.cwd();
  const config = loadConfig(launchDir);

  // e2eDir defaults to launchDir; override with the first CLI arg for monorepos.
  const e2eDir = process.argv[2] ? path.resolve(process.argv[2]) : launchDir;

  // 1. Ensure agents exist (run init-agents if not).
  let agentsDir = findAgentsDir(e2eDir);
  if (!agentsDir) {
    log('no agents found — running `npx playwright init-agents --loop=claude`');
    const r = spawnSync('npx', ['playwright', 'init-agents', '--loop=claude'], { cwd: e2eDir, stdio: 'inherit' });
    if ((r.status ?? 1) !== 0) { log('init-agents failed'); process.exit(1); }
    // init-agents ran in e2eDir, so that's where the agents were just created —
    // re-looking-up from launchDir would miss them on a fresh monorepo setup.
    agentsDir = findAgentsDir(e2eDir);
  }
  if (!agentsDir) { log('could not locate .claude/agents after init'); process.exit(1); }

  // 2. Overlay (pin model/effort + house rules).
  const touched = applyOverlay(agentsDir, config);
  log(`overlay applied to: ${touched.map((t) => `${t.role}${t.changed ? '*' : ''}`).join(', ') || '(none)'}`);

  // 3. MCP wiring. Reuse the entry init-agents actually generated in the e2e dir as the
  //    source of truth, adapting it for the launch dir (headless + monorepo -c). This
  //    self-corrects if Playwright changes the base command in a future release.
  const relE2e = path.relative(launchDir, e2eDir) || '.';
  let generatedDoc = null;
  try { generatedDoc = JSON.parse(fs.readFileSync(path.join(e2eDir, '.mcp.json'), 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  // Prefer the e2e's own playwright binary (launch-dir-relative) so the MCP server
  // resolves even when launched from a parent dir in a non-hoisted pnpm monorepo.
  const binRel = path.join(relE2e, 'node_modules', '.bin', 'playwright');
  const binPath = fs.existsSync(path.join(launchDir, binRel)) ? binRel : null;
  const serverSpec = buildServerSpec({ generatedDoc, relE2e, binPath });
  const mcp = wireMcp({ launchDir, serverSpec });
  log(`MCP wired → ${mcp.file} as '${mcp.server}'`);

  // 3b. Monorepo verify gate: the default `npx playwright test` runs from the
  // launch dir and can't resolve playwright in a non-hoisted pnpm monorepo —
  // the same problem the MCP binPath fallback above solves. Persist a resolved
  // testCommand so pw-verify uses the e2e package's binary and config, unless
  // the user already set one.
  const persisted = persistTestCommand({ launchDir, relE2e, binPath });
  if (persisted) log(`persisted monorepo testCommand → ${persisted.file}: ${persisted.testCommand}`);

  // 4. Auth reminder (config-driven; setup does not fabricate credentials).
  log(`auth mode: ${config.auth.mode} (${config.auth.setupPath ?? config.auth.seedPath ?? 'n/a'})`);
  log('done. Relaunch Claude Code so the MCP server loads, then run /pw-author.');
}

main();
