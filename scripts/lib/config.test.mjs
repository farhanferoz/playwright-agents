// scripts/lib/config.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, persistTestCommand, DEFAULTS, CONFIG_FILENAME } from './config.mjs';

function fakeFs(fileContents) {
  return {
    readFileSync(p, _enc) {
      if (p.endsWith(CONFIG_FILENAME) && fileContents !== null) return fileContents;
      const e = new Error('not found'); e.code = 'ENOENT'; throw e;
    },
  };
}

function writableFakeFs(fileContents) {
  const writes = {};
  const fs = {
    readFileSync(p, _enc) {
      if (p.endsWith(CONFIG_FILENAME) && fileContents !== null) return fileContents;
      const e = new Error('not found'); e.code = 'ENOENT'; throw e;
    },
    writeFileSync(p, data) { writes[p] = data; },
  };
  return { fs, writes };
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

test('persistTestCommand writes the binPath-based command when no config exists', () => {
  const { fs, writes } = writableFakeFs(null);
  const out = persistTestCommand({ launchDir: '/repo', relE2e: 'apps/e2e', binPath: 'apps/e2e/node_modules/.bin/playwright', fs });
  assert.deepEqual(out, { file: '/repo/playwright-agents.config.json', testCommand: 'apps/e2e/node_modules/.bin/playwright test -c apps/e2e' });
  const written = JSON.parse(writes['/repo/playwright-agents.config.json']);
  assert.equal(written.testCommand, 'apps/e2e/node_modules/.bin/playwright test -c apps/e2e');
});

test('persistTestCommand respects an existing user testCommand (no overwrite)', () => {
  const { fs, writes } = writableFakeFs(JSON.stringify({ testCommand: 'pnpm --filter e2e test' }));
  const out = persistTestCommand({ launchDir: '/repo', relE2e: 'apps/e2e', binPath: null, fs });
  assert.equal(out, null);
  assert.deepEqual(writes, {});
});

test('persistTestCommand preserves other keys in an existing config', () => {
  const { fs, writes } = writableFakeFs(JSON.stringify({ testDir: 'e2e-tests', healRetries: 2 }));
  persistTestCommand({ launchDir: '/repo', relE2e: 'apps/e2e', binPath: null, fs });
  const written = JSON.parse(writes['/repo/playwright-agents.config.json']);
  assert.equal(written.testDir, 'e2e-tests');
  assert.equal(written.healRetries, 2);
  assert.equal(written.testCommand, 'npx playwright test -c apps/e2e');
});

test('persistTestCommand is a no-op when relE2e is "."', () => {
  const { fs, writes } = writableFakeFs(null);
  const out = persistTestCommand({ launchDir: '/repo', relE2e: '.', binPath: null, fs });
  assert.equal(out, null);
  assert.deepEqual(writes, {});
});

test('persistTestCommand falls back to `npx playwright` when binPath is null', () => {
  const { fs, writes } = writableFakeFs(null);
  const out = persistTestCommand({ launchDir: '/repo', relE2e: 'apps/e2e', binPath: null, fs });
  assert.equal(out.testCommand, 'npx playwright test -c apps/e2e');
  const written = JSON.parse(writes['/repo/playwright-agents.config.json']);
  assert.equal(written.testCommand, 'npx playwright test -c apps/e2e');
});
