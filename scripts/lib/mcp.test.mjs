// scripts/lib/mcp.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeServerIntoMcpJson, wireMcp, buildServerSpec, SERVER_KEY } from './mcp.mjs';

const serverSpec = { command: 'playwright', args: ['run-test-mcp-server', '--headless', '-c', 'apps/e2e'] };

// The real entry init-agents generates (confirmed against @playwright/test 1.60).
const GENERATED = { mcpServers: { 'playwright-test': { command: 'npx', args: ['playwright', 'run-test-mcp-server'] } } };

test('buildServerSpec reuses the generated command, adds --headless for single-package', () => {
  const spec = buildServerSpec({ generatedDoc: GENERATED, relE2e: '.' });
  assert.equal(spec.command, 'npx');
  assert.deepEqual(spec.args, ['playwright', 'run-test-mcp-server', '--headless']); // no -c for single-package
});

test('buildServerSpec adds -c <relE2e> for a monorepo (hoisted to launch dir)', () => {
  const spec = buildServerSpec({ generatedDoc: GENERATED, relE2e: 'apps/e2e' });
  assert.deepEqual(spec.args, ['playwright', 'run-test-mcp-server', '--headless', '-c', 'apps/e2e']);
});

test('buildServerSpec falls back when no generated doc is present', () => {
  const spec = buildServerSpec({ generatedDoc: null, relE2e: '.' });
  assert.equal(spec.command, 'npx');
  assert.deepEqual(spec.args, ['playwright', 'run-test-mcp-server', '--headless']);
});

test('buildServerSpec never duplicates flags already present', () => {
  const doc = { mcpServers: { 'playwright-test': { command: 'npx', args: ['playwright', 'run-test-mcp-server', '--headless', '-c', 'apps/e2e'] } } };
  const spec = buildServerSpec({ generatedDoc: doc, relE2e: 'apps/e2e' });
  assert.equal((spec.args.filter((a) => a === '--headless')).length, 1);
  assert.equal((spec.args.filter((a) => a === '-c')).length, 1);
});

test('buildServerSpec headless:false omits the flag', () => {
  const spec = buildServerSpec({ generatedDoc: GENERATED, relE2e: '.', headless: false });
  assert.deepEqual(spec.args, ['playwright', 'run-test-mcp-server']);
});

test('buildServerSpec uses binPath directly when given (single-package)', () => {
  const spec = buildServerSpec({ binPath: 'node_modules/.bin/playwright', relE2e: '.' });
  assert.equal(spec.command, 'node_modules/.bin/playwright');
  assert.deepEqual(spec.args, ['run-test-mcp-server', '--headless']);
});

test('buildServerSpec binPath + monorepo adds -c (non-hoisted pnpm case)', () => {
  const spec = buildServerSpec({ binPath: 'acme-app/apps/e2e/node_modules/.bin/playwright', relE2e: 'acme-app/apps/e2e' });
  assert.equal(spec.command, 'acme-app/apps/e2e/node_modules/.bin/playwright');
  assert.deepEqual(spec.args, ['run-test-mcp-server', '--headless', '-c', 'acme-app/apps/e2e']);
});

test('buildServerSpec binPath takes precedence over generatedDoc', () => {
  const spec = buildServerSpec({ generatedDoc: GENERATED, binPath: 'x/node_modules/.bin/playwright', relE2e: 'x' });
  assert.equal(spec.command, 'x/node_modules/.bin/playwright'); // not 'npx'
});

test('mergeServerIntoMcpJson adds the server, preserving others', () => {
  const existing = { mcpServers: { other: { command: 'x' } } };
  const merged = mergeServerIntoMcpJson(existing, SERVER_KEY, serverSpec);
  assert.deepEqual(merged.mcpServers.other, { command: 'x' });
  assert.deepEqual(merged.mcpServers[SERVER_KEY], serverSpec);
});

test('mergeServerIntoMcpJson initializes an empty doc', () => {
  const merged = mergeServerIntoMcpJson({}, SERVER_KEY, serverSpec);
  assert.deepEqual(merged.mcpServers[SERVER_KEY], serverSpec);
});

test('wireMcp creates the launch-dir .mcp.json when absent', () => {
  const writes = {};
  const fakeFs = {
    readFileSync() { const e = new Error('nope'); e.code = 'ENOENT'; throw e; },
    writeFileSync(p, data) { writes[p] = data; },
  };
  const out = wireMcp({ launchDir: '/repo', serverSpec, fs: fakeFs });
  assert.equal(out.file, '/repo/.mcp.json');
  const written = JSON.parse(writes['/repo/.mcp.json']);
  assert.deepEqual(written.mcpServers[SERVER_KEY], serverSpec);
});

test('wireMcp merges into an existing .mcp.json, preserving other servers', () => {
  const writes = {};
  const fakeFs = {
    readFileSync() { return JSON.stringify({ mcpServers: { other: { command: 'x' } } }); },
    writeFileSync(p, data) { writes[p] = data; },
  };
  wireMcp({ launchDir: '/repo', serverSpec, fs: fakeFs });
  const written = JSON.parse(writes['/repo/.mcp.json']);
  assert.deepEqual(written.mcpServers.other, { command: 'x' });
  assert.deepEqual(written.mcpServers[SERVER_KEY], serverSpec);
});
