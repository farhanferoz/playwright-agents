// scripts/lib/config.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, DEFAULTS, CONFIG_FILENAME } from './config.mjs';

function fakeFs(fileContents) {
  return {
    readFileSync(p, _enc) {
      if (p.endsWith(CONFIG_FILENAME) && fileContents !== null) return fileContents;
      const e = new Error('not found'); e.code = 'ENOENT'; throw e;
    },
  };
}

test('absent config returns defaults', () => {
  const cfg = loadConfig('/repo', { fs: fakeFs(null) });
  assert.deepEqual(cfg, DEFAULTS);
  assert.equal(cfg.testCommand, 'npx playwright test');
  assert.equal(cfg.agents.planner.effort, 'high');
});

test('user values override defaults, deep-merged', () => {
  const cfg = loadConfig('/repo', {
    fs: fakeFs(JSON.stringify({
      testCommand: 'pnpm test',
      agents: { planner: { model: 'opus' } },
    })),
  });
  assert.equal(cfg.testCommand, 'pnpm test');
  assert.equal(cfg.agents.planner.model, 'opus');   // overridden
  assert.equal(cfg.agents.planner.effort, 'high');  // default preserved
  assert.equal(cfg.agents.healer.model, 'sonnet');  // untouched role preserved
});

test('arrays replace, not merge', () => {
  const cfg = loadConfig('/repo', { fs: fakeFs(JSON.stringify({ houseRules: ['only this'] })) });
  assert.deepEqual(cfg.houseRules, ['only this']);
});

test('invalid JSON throws a clear error', () => {
  assert.throws(
    () => loadConfig('/repo', { fs: fakeFs('{ not json') }),
    /Invalid playwright-agents\.config\.json/,
  );
});
