// scripts/lib/verify.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildVerifyArgs, runVerify } from './verify.mjs';

test('buildVerifyArgs splits the command and appends the spec', () => {
  assert.deepEqual(buildVerifyArgs('pnpm test', 'tests/foo.spec.ts'), { cmd: 'pnpm', args: ['test', 'tests/foo.spec.ts'] });
  assert.deepEqual(buildVerifyArgs('npx playwright test', 'a.spec.ts'), { cmd: 'npx', args: ['playwright', 'test', 'a.spec.ts'] });
});

test('runVerify reports ok on exit 0', () => {
  const spawn = () => ({ status: 0 });
  assert.deepEqual(runVerify('pnpm test', 'a.spec.ts', { spawn }), { exitCode: 0, ok: true });
});

test('runVerify reports failure on non-zero', () => {
  const spawn = () => ({ status: 1 });
  assert.deepEqual(runVerify('pnpm test', 'a.spec.ts', { spawn }), { exitCode: 1, ok: false });
});

test('runVerify treats a null status (signal/crash) as failure', () => {
  const spawn = () => ({ status: null });
  assert.deepEqual(runVerify('pnpm test', 'a.spec.ts', { spawn }), { exitCode: 1, ok: false });
});
