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
