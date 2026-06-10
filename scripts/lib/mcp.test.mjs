// scripts/lib/mcp.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeServerIntoMcpJson, wireMcp, SERVER_KEY } from './mcp.mjs';

const serverSpec = { command: 'playwright', args: ['run-test-mcp-server', '--headless', '-c', 'apps/e2e'] };

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
