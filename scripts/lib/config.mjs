// scripts/lib/config.mjs
import fs from 'node:fs';
import path from 'node:path';

export const CONFIG_FILENAME = 'playwright-agents.config.json';

export const DEFAULTS = {
  testCommand: 'npx playwright test',
  testDir: 'tests',
  auth: { mode: 'storageState', setupPath: 'tests/auth.setup.ts' },
  healRetries: 1,
  agents: {
    planner: { model: 'sonnet', effort: 'high' },
    generator: { model: 'sonnet', effort: 'high' },
    healer: { model: 'sonnet', effort: 'high' },
  },
  houseRules: [],
};

function isPlainObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function deepMerge(base, override) {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return Array.isArray(override) ? override.slice() : override;
  }
  const out = { ...base };
  for (const key of Object.keys(override)) {
    const ov = override[key];
    out[key] = isPlainObject(base[key]) && isPlainObject(ov)
      ? deepMerge(base[key], ov)
      : Array.isArray(ov) ? ov.slice() : ov;
  }
  return out;
}

export function loadConfig(repoRoot, { fs: fsmod = fs } = {}) {
  const file = path.join(repoRoot, CONFIG_FILENAME);
  let userConfig = {};
  try {
    const raw = fsmod.readFileSync(file, 'utf8');
    userConfig = JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return structuredClone(DEFAULTS);
    throw new Error(`Invalid ${CONFIG_FILENAME}: ${e.message}`);
  }
  return deepMerge(DEFAULTS, userConfig);
}

/**
 * Monorepo verify gate: the default `npx playwright test` runs from the launch dir and
 * can't resolve playwright in a non-hoisted pnpm monorepo — the same problem the MCP
 * binPath fallback in mcp.mjs solves. Persist a resolved `testCommand` into the launch
 * dir's config so pw-verify uses the e2e package's binary and config, unless the user
 * already set one. No-op for a single-package repo (relE2e === '.').
 * Returns `{ file, testCommand }` when written, or `null` when skipped.
 */
export function persistTestCommand({ launchDir, relE2e, binPath = null, fs: fsmod = fs }) {
  if (relE2e === '.') return null;
  const file = path.join(launchDir, CONFIG_FILENAME);
  let userConfig = {};
  try {
    userConfig = JSON.parse(fsmod.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  if (userConfig.testCommand !== undefined) return null;
  const testCommand = `${binPath ?? 'npx playwright'} test -c ${relE2e}`;
  fsmod.writeFileSync(file, JSON.stringify({ ...userConfig, testCommand }, null, 2) + '\n');
  return { file, testCommand };
}
