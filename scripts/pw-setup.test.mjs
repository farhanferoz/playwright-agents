// scripts/pw-setup.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Importing pw-setup.mjs must NOT run main() — main is guarded behind a
// direct-execution check. If it ran on import, loadConfig(process.cwd()) would
// fire (and this import would log/throw depending on cwd). A clean import that
// exposes the functions is itself the regression test for that guard.
import { findAgentsDir, main } from './pw-setup.mjs';

test('module exports are importable without side effects', () => {
  assert.equal(typeof findAgentsDir, 'function');
  assert.equal(typeof main, 'function');
});

test('findAgentsDir returns the agents path when .claude/agents exists', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-setup-'));
  try {
    const agents = path.join(dir, '.claude', 'agents');
    fs.mkdirSync(agents, { recursive: true });
    assert.equal(findAgentsDir(dir), agents);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('findAgentsDir returns null when .claude/agents is absent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-setup-'));
  try {
    assert.equal(findAgentsDir(dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
