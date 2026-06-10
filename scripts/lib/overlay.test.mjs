// scripts/lib/overlay.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overlayAgentText, classifyRole, splitFrontmatter, applyOverlay, HR_START, HR_END } from './overlay.mjs';

const SAMPLE = `---
name: playwright-test-generator
description: generates tests
tools: Glob, Grep
model: sonnet
color: blue
---
You are a Playwright Test Generator.

Do the thing.
`;

test('classifyRole matches by filename or name', () => {
  assert.equal(classifyRole('generator.md', ''), 'generator');
  assert.equal(classifyRole('foo.md', 'name: playwright-test-healer'), 'healer');
  assert.equal(classifyRole('planner.md', ''), 'planner');
  assert.equal(classifyRole('unrelated.md', 'name: whatever'), null);
});

test('splitFrontmatter separates frontmatter lines from body', () => {
  const { frontmatter, body } = splitFrontmatter(SAMPLE);
  assert.ok(frontmatter.includes('name: playwright-test-generator'));
  assert.ok(body.startsWith('You are a Playwright Test Generator.'));
});

test('overlay sets model + effort and adds a house-rules block', () => {
  const out = overlayAgentText(SAMPLE, { role: 'generator', model: 'sonnet', effort: 'high', houseRules: [] });
  assert.match(out, /^model: sonnet$/m);
  assert.match(out, /^effort: high$/m);
  assert.ok(out.includes(HR_START) && out.includes(HR_END));
  assert.match(out, /workspace-prefixed path/);  // generator gets the write-path rule
  assert.ok(out.includes('Do the thing.'));      // original body preserved
});

test('overlay is idempotent', () => {
  const once = overlayAgentText(SAMPLE, { role: 'generator', model: 'sonnet', effort: 'high', houseRules: [] });
  const twice = overlayAgentText(once, { role: 'generator', model: 'sonnet', effort: 'high', houseRules: [] });
  assert.equal(twice, once);
});

test('changing effort replaces, never duplicates the key', () => {
  const a = overlayAgentText(SAMPLE, { role: 'generator', model: 'sonnet', effort: 'high', houseRules: [] });
  const b = overlayAgentText(a, { role: 'generator', model: 'opus', effort: 'medium', houseRules: [] });
  assert.equal((b.match(/^effort:/gm) || []).length, 1);
  assert.equal((b.match(/^model:/gm) || []).length, 1);
  assert.match(b, /^model: opus$/m);
  assert.match(b, /^effort: medium$/m);
});

test('extra houseRules are appended', () => {
  const out = overlayAgentText(SAMPLE, { role: 'planner', model: 'sonnet', effort: 'high', houseRules: ['mock the network'] });
  assert.match(out, /mock the network/);
});

test('throws if no frontmatter', () => {
  assert.throws(
    () => overlayAgentText('no frontmatter here', { role: 'planner', model: 'sonnet', effort: 'high', houseRules: [] }),
    /frontmatter/,
  );
});

import os from 'node:os';
import fsreal from 'node:fs';
import pathreal from 'node:path';

test('applyOverlay edits recognised files and is idempotent on disk', () => {
  const dir = fsreal.mkdtempSync(pathreal.join(os.tmpdir(), 'pw-agents-'));
  fsreal.writeFileSync(pathreal.join(dir, 'generator.md'), SAMPLE);
  fsreal.writeFileSync(pathreal.join(dir, 'README.md'), '# not an agent\n');
  const cfg = { agents: { generator: { model: 'sonnet', effort: 'high' } }, houseRules: [] };

  const first = applyOverlay(dir, cfg);
  assert.deepEqual(first.find((r) => r.file === 'generator.md'), { file: 'generator.md', role: 'generator', changed: true });
  assert.ok(!first.some((r) => r.file === 'README.md')); // unrecognised, skipped

  const after = fsreal.readFileSync(pathreal.join(dir, 'generator.md'), 'utf8');
  const second = applyOverlay(dir, cfg);
  assert.equal(second.find((r) => r.file === 'generator.md').changed, false); // idempotent
  assert.equal(fsreal.readFileSync(pathreal.join(dir, 'generator.md'), 'utf8'), after);

  fsreal.rmSync(dir, { recursive: true, force: true });
});
