# playwright-agents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public Claude Code plugin that wraps Playwright's first-party planner/generator/healer agents, pins their model/effort, wires the Test MCP (auto-detecting vanilla Claude Code vs ccage), and closes the authoring loop with a real test run.

**Architecture:** A thin wrapper. The plugin ships *no* agent prompts. Small Node.js modules (env detection, config, an idempotent agent-file overlay, MCP wiring, a verify runner) are orchestrated by two slash commands (`/pw-setup`, `/pw-author`) and one skill (`e2e-authoring`). All logic is plain ESM with `node --test` unit tests — no third-party deps (Node is guaranteed in any Playwright repo).

**Tech Stack:** Node.js ≥ 20 (ESM, built-in `node:test`), Claude Code plugin format (`plugin.json` + `commands/` + `skills/`), Playwright ≥ 1.56 (`init-agents`, Test MCP) in the *target* repo.

**Design spec:** `docs/specs/2026-06-10-playwright-agents-design.md` — read it first.

---

## Conventions for the implementer

- **cwd = the target repo** (the user's Playwright project) when scripts run. The plugin's own files are reached via the `CLAUDE_PLUGIN_ROOT` env var that Claude Code sets for commands. Verify this var name with `claude-code-guide` before Task 7 if unsure.
- **Plain JSON config** — the spec's config example uses `//` comments for illustration only; the real `playwright-agents.config.json` is strict JSON (no comments). Do not add a comment-stripper.
- **No shelled-out exec.** Never use `child_process.exec`/`execSync` (a repo security hook blocks it, and it is an injection smell). Use `spawnSync(cmd, args)` (no shell) for subprocesses, or a PATH scan for "does this command exist".
- **All modules are pure where possible** and take injected dependencies (`fs`, `env`, `spawn`, `commandExists`) so unit tests need no real filesystem/process. Production callers use the defaults.
- **Run tests with:** `node --test scripts/lib` from the repo root.
- **Commit after every task.** Conventional commit messages. No AI/tool provenance in any commit.

## File structure (what each file owns)

```
playwright-agents/
  package.json                      # type:module, test script, Node engine
  .claude-plugin/plugin.json        # plugin manifest (name/version/desc)
  .claude-plugin/marketplace.json   # makes this repo its own marketplace
  LICENSE                           # MIT
  commands/
    pw-setup.md                     # /pw-setup — one-time setup (orchestrates scripts)
    pw-author.md                    # /pw-author "<flow>" — drive plan→generate→heal→verify
  skills/
    e2e-authoring/SKILL.md          # natural-language entry to the same loop
  scripts/
    pw-setup.mjs                    # setup orchestrator CLI (calls lib/*)
    pw-verify.mjs                   # verify CLI used by /pw-author
    lib/
      env.mjs       env.test.mjs        # detectEnv(): 'vanilla' | 'ccage'
      config.mjs    config.test.mjs     # loadConfig(repoRoot) + DEFAULTS
      overlay.mjs   overlay.test.mjs    # applyOverlay(): pin model/effort + house rules
      mcp.mjs       mcp.test.mjs        # wireMcp(): launch-dir .mcp.json (vanilla|ccage)
      verify.mjs    verify.test.mjs     # runVerify(): real test command → exit code
  docs/
    specs/2026-06-10-playwright-agents-design.md
    IMPLEMENTATION_PLAN.md (this file)
    examples/                       # sample config + usage walkthrough
```

---

## Task 0: Scaffold the project

**Files:**
- Create: `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `LICENSE`
- Create dirs: `commands/`, `skills/e2e-authoring/`, `scripts/lib/`, `docs/examples/`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "playwright-agents",
  "version": "0.1.0",
  "description": "Claude Code plugin wrapping Playwright's planner/generator/healer agents with pinned model/effort, MCP wiring, and a real verification run.",
  "type": "module",
  "private": false,
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "node --test scripts/lib"
  },
  "license": "MIT"
}
```

- [ ] **Step 2: Create `.claude-plugin/plugin.json`**

```json
{
  "name": "playwright-agents",
  "version": "0.1.0",
  "description": "Wrap Playwright's first-party test agents: pin model/effort, wire the Test MCP (vanilla or ccage), and verify generated specs with a real test run.",
  "author": { "name": "Farhan Feroz" },
  "homepage": "https://github.com/<owner>/playwright-agents"
}
```

> Verify the exact `plugin.json` schema (field names, whether `commands`/`skills` need explicit paths or are auto-discovered) against current Claude Code plugin docs via the `claude-code-guide` agent before finalizing. Commands in `commands/` and skills in `skills/` are auto-discovered by convention in current versions; adjust if the docs say otherwise.

- [ ] **Step 3: Create `.claude-plugin/marketplace.json`**

```json
{
  "name": "playwright-agents",
  "owner": { "name": "Farhan Feroz" },
  "plugins": [
    {
      "name": "playwright-agents",
      "source": "./",
      "description": "Wrap Playwright's test agents with pinned model/effort, MCP wiring, and a real verification run."
    }
  ]
}
```

- [ ] **Step 4: Create `LICENSE`** — standard MIT text, `Copyright (c) 2026 Farhan Feroz`. (Use the canonical MIT license body.)

- [ ] **Step 5: Create the empty dirs** so structure is visible.

Run:
```bash
mkdir -p commands skills/e2e-authoring scripts/lib docs/examples
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold plugin project structure"
```

---

## Task 1: Environment detection (`env.mjs`)

**Files:**
- Create: `scripts/lib/env.mjs`
- Test: `scripts/lib/env.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// scripts/lib/env.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import { detectEnv } from './env.mjs';

const home = os.homedir();

test('explicit override wins over detection', () => {
  assert.equal(detectEnv({ env: { PW_AGENTS_ENV: 'ccage' }, commandExists: () => false }), 'ccage');
  assert.equal(detectEnv({ env: { PW_AGENTS_ENV: 'vanilla' }, commandExists: () => true }), 'vanilla');
});

test('ccage when cage config dir AND ccage on PATH', () => {
  assert.equal(
    detectEnv({ env: { CLAUDE_CONFIG_DIR: `${home}/.claude-StratSense` }, commandExists: () => true }),
    'ccage',
  );
});

test('vanilla for the bare ~/.claude dir', () => {
  assert.equal(
    detectEnv({ env: { CLAUDE_CONFIG_DIR: `${home}/.claude` }, commandExists: () => true }),
    'vanilla',
  );
});

test('vanilla when ccage is not on PATH', () => {
  assert.equal(
    detectEnv({ env: { CLAUDE_CONFIG_DIR: `${home}/.claude-foo` }, commandExists: () => false }),
    'vanilla',
  );
});

test('vanilla when no CLAUDE_CONFIG_DIR set', () => {
  assert.equal(detectEnv({ env: {}, commandExists: () => true }), 'vanilla');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test scripts/lib/env.test.mjs`
Expected: FAIL — `Cannot find module './env.mjs'` / `detectEnv is not a function`.

- [ ] **Step 3: Write the implementation** (shell-free PATH scan; no `exec`)

```js
// scripts/lib/env.mjs
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

// Shell-free "is this command on PATH" check — no subprocess, no injection surface.
export function defaultCommandExists(cmd, { env = process.env, fsmod = fs } = {}) {
  const dirs = (env.PATH || '').split(path.delimiter).filter(Boolean);
  return dirs.some((d) => {
    try {
      fsmod.accessSync(path.join(d, cmd), fsmod.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
}

/**
 * Decide whether we are running inside a ccage cage or vanilla Claude Code.
 * ccage iff: CLAUDE_CONFIG_DIR is a per-cage dir (~/.claude-<name>, not the bare
 * ~/.claude) AND `ccage` is on PATH. `PW_AGENTS_ENV` overrides detection.
 */
export function detectEnv({ env = process.env, commandExists = defaultCommandExists } = {}) {
  const override = env.PW_AGENTS_ENV;
  if (override === 'ccage' || override === 'vanilla') return override;

  const home = os.homedir();
  const cfg = env.CLAUDE_CONFIG_DIR ?? '';
  const isCageDir = cfg.startsWith(`${home}/.claude-`) && cfg !== `${home}/.claude`;
  return isCageDir && commandExists('ccage') ? 'ccage' : 'vanilla';
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test scripts/lib/env.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/env.mjs scripts/lib/env.test.mjs
git commit -m "feat: environment detection (vanilla vs ccage)"
```

---

## Task 2: Config loader (`config.mjs`)

**Files:**
- Create: `scripts/lib/config.mjs`
- Test: `scripts/lib/config.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test scripts/lib/config.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
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
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test scripts/lib/config.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/config.mjs scripts/lib/config.test.mjs
git commit -m "feat: config loader with deep-merged defaults"
```

---

## Task 3: Overlay engine (`overlay.mjs`)

This pins `model:`/`effort:` in each agent's frontmatter and injects an idempotent house-rules block in the body. It must (a) be idempotent — re-running yields byte-identical output, (b) preserve the upstream prompt body, (c) detect role from filename/`name:` so it survives different agent file names.

**Files:**
- Create: `scripts/lib/overlay.mjs`
- Test: `scripts/lib/overlay.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test scripts/lib/overlay.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```js
// scripts/lib/overlay.mjs
import fs from 'node:fs';
import path from 'node:path';

const FM_DELIM = '---';
export const HR_START = '<!-- pw-agents:house-rules:start -->';
export const HR_END = '<!-- pw-agents:house-rules:end -->';

const ROLES = ['planner', 'generator', 'healer'];

export function classifyRole(filename, frontmatterNameLine = '') {
  const hay = `${filename} ${frontmatterNameLine}`.toLowerCase();
  return ROLES.find((r) => hay.includes(r)) ?? null;
}

export function splitFrontmatter(text) {
  const lines = text.split('\n');
  if (lines[0].trim() !== FM_DELIM) return { frontmatter: null, body: text };
  const end = lines.indexOf(FM_DELIM, 1);
  if (end === -1) return { frontmatter: null, body: text };
  return { frontmatter: lines.slice(1, end), body: lines.slice(end + 1).join('\n') };
}

function setFrontmatterKey(fmLines, key, value) {
  const idx = fmLines.findIndex((l) => new RegExp(`^${key}:`).test(l));
  const line = `${key}: ${value}`;
  if (idx === -1) return [...fmLines, line];
  const copy = fmLines.slice();
  copy[idx] = line;
  return copy;
}

function houseRulesBlock(role, extraRules = []) {
  const rules = [
    'Prefer `browser_evaluate` to read specific page state over a full `browser_snapshot` on dense pages — large snapshots blow the token budget.',
  ];
  if (role === 'generator') {
    rules.push('When calling `generator_write_test`, pass the workspace-prefixed path (e.g. `<workspace>/apps/e2e/tests/...`), not a bare path.');
  }
  for (const r of extraRules) rules.push(r);
  return [
    HR_START,
    '## House rules (managed by playwright-agents — do not edit between these markers)',
    ...rules.map((r) => `- ${r}`),
    HR_END,
  ].join('\n');
}

function upsertHouseRules(body, block) {
  const s = body.indexOf(HR_START);
  const e = body.indexOf(HR_END);
  if (s !== -1 && e !== -1 && e > s) {
    return body.slice(0, s) + block + body.slice(e + HR_END.length);
  }
  return `${body.replace(/\s+$/, '')}\n\n${block}\n`;
}

export function overlayAgentText(text, { role, model, effort, houseRules = [] }) {
  const { frontmatter, body } = splitFrontmatter(text);
  if (frontmatter === null) throw new Error('agent file has no YAML frontmatter');
  let fm = setFrontmatterKey(frontmatter, 'model', model);
  fm = setFrontmatterKey(fm, 'effort', effort);
  const newBody = upsertHouseRules(body, houseRulesBlock(role, houseRules));
  return `${[FM_DELIM, ...fm, FM_DELIM].join('\n')}\n${newBody}`.replace(/\n*$/, '\n');
}

/**
 * Apply the overlay to every recognizable agent file in agentsDir.
 * Returns [{ file, role, changed }]. Idempotent: unchanged files are not rewritten.
 */
export function applyOverlay(agentsDir, config, { fs: fsmod = fs } = {}) {
  const result = [];
  for (const f of fsmod.readdirSync(agentsDir).filter((n) => n.endsWith('.md'))) {
    const full = path.join(agentsDir, f);
    const text = fsmod.readFileSync(full, 'utf8');
    const { frontmatter } = splitFrontmatter(text);
    const nameLine = (frontmatter ?? []).find((l) => l.startsWith('name:')) ?? '';
    const role = classifyRole(f, nameLine);
    if (!role) continue;
    const a = config.agents[role];
    const out = overlayAgentText(text, { role, model: a.model, effort: a.effort, houseRules: config.houseRules });
    const changed = out !== text;
    if (changed) fsmod.writeFileSync(full, out);
    result.push({ file: f, role, changed });
  }
  return result;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test scripts/lib/overlay.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 5: Add an `applyOverlay` filesystem test**

Append to `scripts/lib/overlay.test.mjs`:

```js
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
```

Run: `node --test scripts/lib/overlay.test.mjs`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/overlay.mjs scripts/lib/overlay.test.mjs
git commit -m "feat: idempotent agent overlay (pin model/effort + house rules)"
```

---

## Task 4: Verify runner (`verify.mjs`)

**Files:**
- Create: `scripts/lib/verify.mjs`
- Test: `scripts/lib/verify.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test scripts/lib/verify.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation** (uses `spawnSync`, no shell)

```js
// scripts/lib/verify.mjs
import { spawnSync } from 'node:child_process';

export function buildVerifyArgs(testCommand, specPath) {
  const parts = testCommand.trim().split(/\s+/);
  return { cmd: parts[0], args: [...parts.slice(1), specPath] };
}

export function runVerify(testCommand, specPath, { spawn = spawnSync } = {}) {
  const { cmd, args } = buildVerifyArgs(testCommand, specPath);
  const res = spawn(cmd, args, { stdio: 'inherit' });
  const exitCode = res.status ?? 1;
  return { exitCode, ok: exitCode === 0 };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test scripts/lib/verify.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/verify.mjs scripts/lib/verify.test.mjs
git commit -m "feat: deterministic verify runner"
```

---

## Task 5: MCP wiring (`mcp.mjs`)

The Test MCP `.mcp.json` must sit at the **launch dir** (where `claude` is started), not a monorepo subdir, or it isn't discovered. Vanilla: merge the server entry into `<launchDir>/.mcp.json` directly. ccage: delegate to `ccage enable-mcp` so the write is isolation-safe.

> **Before coding, confirm the ccage interface.** `ccage enable-mcp` is the user's own tool (built but uncommitted). Run `ccage enable-mcp --help` and record the exact flags (it accepts `--dir`, a server name, and a command; supports `--dry-run`). Implement the ccage branch against that real interface. Also confirm the Playwright Test MCP server command from the generated `.mcp.json` (empirically `playwright run-test-mcp-server --headless -c <e2e-dir>`).

**Files:**
- Create: `scripts/lib/mcp.mjs`
- Test: `scripts/lib/mcp.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
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

test('wireMcp(vanilla) writes the launch-dir .mcp.json', () => {
  const writes = {};
  const fakeFs = {
    readFileSync() { const e = new Error('nope'); e.code = 'ENOENT'; throw e; },
    writeFileSync(p, data) { writes[p] = data; },
  };
  const out = wireMcp({ env: 'vanilla', launchDir: '/repo', serverSpec, fs: fakeFs });
  assert.equal(out.mode, 'vanilla');
  const written = JSON.parse(writes['/repo/.mcp.json']);
  assert.deepEqual(written.mcpServers[SERVER_KEY], serverSpec);
});

test('wireMcp(ccage) delegates to the injected runner, does not write directly', () => {
  let called = null;
  const run = (cmd, args) => { called = { cmd, args }; return { status: 0 }; };
  const fakeFs = { writeFileSync() { throw new Error('must not write directly in ccage mode'); } };
  const out = wireMcp({ env: 'ccage', launchDir: '/repo', serverSpec, fs: fakeFs, run });
  assert.equal(out.mode, 'ccage');
  assert.equal(called.cmd, 'ccage');
  assert.ok(called.args.includes('enable-mcp'));
  assert.ok(called.args.includes('/repo'));   // --dir target
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test scripts/lib/mcp.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation** (adjust the ccage arg vector to the real `--help` output from the pre-step; uses `spawnSync`, no shell)

```js
// scripts/lib/mcp.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const SERVER_KEY = 'playwright-test';

export function mergeServerIntoMcpJson(doc, key, serverSpec) {
  const out = { ...doc };
  out.mcpServers = { ...(doc.mcpServers ?? {}) };
  out.mcpServers[key] = serverSpec;
  return out;
}

function defaultRun(cmd, args) {
  return spawnSync(cmd, args, { stdio: 'inherit' });
}

/**
 * Wire the Playwright Test MCP server into the launch-dir config.
 *  - vanilla: merge into <launchDir>/.mcp.json directly.
 *  - ccage:   delegate to `ccage enable-mcp` (isolation-safe launch-dir write).
 */
export function wireMcp({ env, launchDir, serverSpec, fs: fsmod = fs, run = defaultRun }) {
  if (env === 'ccage') {
    // NOTE: confirm exact flags via `ccage enable-mcp --help`.
    const args = [
      'enable-mcp',
      '--dir', launchDir,
      '--name', SERVER_KEY,
      '--command', [serverSpec.command, ...serverSpec.args].join(' '),
    ];
    const res = run('ccage', args);
    if ((res.status ?? 1) !== 0) throw new Error('ccage enable-mcp failed');
    return { mode: 'ccage', server: SERVER_KEY };
  }

  const file = path.join(launchDir, '.mcp.json');
  let doc = {};
  try { doc = JSON.parse(fsmod.readFileSync(file, 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  const merged = mergeServerIntoMcpJson(doc, SERVER_KEY, serverSpec);
  fsmod.writeFileSync(file, JSON.stringify(merged, null, 2) + '\n');
  return { mode: 'vanilla', file, server: SERVER_KEY };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test scripts/lib/mcp.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/mcp.mjs scripts/lib/mcp.test.mjs
git commit -m "feat: MCP wiring for vanilla and ccage"
```

---

## Task 6: Setup orchestrator (`scripts/pw-setup.mjs`)

Ties the modules together. This is a thin CLI — the unit-tested logic lives in `lib/`. Keep branching minimal. Uses `spawnSync` (no shell).

**Files:**
- Create: `scripts/pw-setup.mjs`

- [ ] **Step 1: Write the orchestrator**

```js
// scripts/pw-setup.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { detectEnv } from './lib/env.mjs';
import { loadConfig } from './lib/config.mjs';
import { applyOverlay } from './lib/overlay.mjs';
import { wireMcp } from './lib/mcp.mjs';

function log(msg) { process.stdout.write(`[pw-setup] ${msg}\n`); }

function findAgentsDir(launchDir) {
  const candidates = [
    path.join(launchDir, '.claude', 'agents'),
    path.join(launchDir, 'apps', 'e2e', '.claude', 'agents'),
  ];
  return candidates.find((d) => fs.existsSync(d)) ?? null;
}

function main() {
  const launchDir = process.cwd();
  const env = detectEnv();
  const config = loadConfig(launchDir);
  log(`environment: ${env}`);

  // e2eDir defaults to launchDir; override with the first CLI arg for monorepos.
  const e2eDir = process.argv[2] ? path.resolve(process.argv[2]) : launchDir;

  // 1. Ensure agents exist (run init-agents if not).
  let agentsDir = findAgentsDir(launchDir);
  if (!agentsDir) {
    log('no agents found — running `npx playwright init-agents --loop=claude`');
    const r = spawnSync('npx', ['playwright', 'init-agents', '--loop=claude'], { cwd: e2eDir, stdio: 'inherit' });
    if ((r.status ?? 1) !== 0) { log('init-agents failed'); process.exit(1); }
    agentsDir = findAgentsDir(launchDir);
  }
  if (!agentsDir) { log('could not locate .claude/agents after init'); process.exit(1); }

  // 2. Overlay (pin model/effort + house rules).
  const touched = applyOverlay(agentsDir, config);
  log(`overlay applied to: ${touched.map((t) => `${t.role}${t.changed ? '*' : ''}`).join(', ') || '(none)'}`);

  // 3. MCP wiring. serverSpec mirrors the init-agents-generated .mcp.json entry.
  const relE2e = path.relative(launchDir, e2eDir) || '.';
  const serverSpec = {
    command: path.join(relE2e, 'node_modules', '.bin', 'playwright'),
    args: ['run-test-mcp-server', '--headless', '-c', relE2e],
  };
  const mcp = wireMcp({ env, launchDir, serverSpec });
  log(`MCP wired (${mcp.mode}) as '${mcp.server}'`);

  // 4. Auth reminder (config-driven; setup does not fabricate credentials).
  log(`auth mode: ${config.auth.mode} (${config.auth.setupPath ?? config.auth.seedPath ?? 'n/a'})`);
  log('done. Relaunch Claude Code so the MCP server loads, then run /pw-author.');
}

main();
```

- [ ] **Step 2: Confirm it parses (no syntax errors) without triggering init**

Run: `node --check scripts/pw-setup.mjs && echo OK`
Expected: `OK` (syntax check only; does not execute, so it will not call init-agents). The full run is exercised in Task 11.

- [ ] **Step 3: Commit**

```bash
git add scripts/pw-setup.mjs
git commit -m "feat: setup orchestrator"
```

---

## Task 7: `/pw-setup` command

**Files:**
- Create: `commands/pw-setup.md`

- [ ] **Step 1: Write the command file**

```markdown
---
description: One-time setup of the Playwright test agents (init, pin model/effort, wire MCP for vanilla or ccage).
argument-hint: "[path-to-e2e-dir]"
---

Run the playwright-agents setup for this repository.

1. Run the setup orchestrator (pass the e2e dir if this is a monorepo, e.g. `apps/e2e`):

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/pw-setup.mjs" $ARGUMENTS
   ```

2. Read the output. Confirm to the user:
   - which environment was detected (vanilla / ccage),
   - which agent files were overlaid (model/effort pinned + house rules),
   - that the MCP server was wired.

3. Tell the user they must **relaunch Claude Code** so the Playwright Test MCP loads,
   then they can run `/pw-author "<flow>"`.

Do not write tests or generate anything in this command — setup only.
```

> Confirm `${CLAUDE_PLUGIN_ROOT}` and `$ARGUMENTS` are the correct interpolations for the current Claude Code command format (via `claude-code-guide`). Adjust if the docs differ.

- [ ] **Step 2: Commit**

```bash
git add commands/pw-setup.md
git commit -m "feat: /pw-setup command"
```

---

## Task 8: `/pw-author` command

Drives the full loop and ends with the verify gate (INV-3, bounded heal retry per `healRetries`).

**Files:**
- Create: `commands/pw-author.md`
- Create: `scripts/pw-verify.mjs`

- [ ] **Step 1: Write the verify CLI**

```js
// scripts/pw-verify.mjs
import { loadConfig } from './lib/config.mjs';
import { runVerify } from './lib/verify.mjs';

const specPath = process.argv[2];
if (!specPath) { process.stderr.write('usage: pw-verify <spec-path>\n'); process.exit(2); }

const config = loadConfig(process.cwd());
const { exitCode, ok } = runVerify(config.testCommand, specPath, {});
process.stdout.write(`[pw-verify] ${ok ? 'PASS' : 'FAIL'} (exit ${exitCode}) — ${config.testCommand} ${specPath}\n`);
process.exit(exitCode);
```

- [ ] **Step 2: Write the command file**

```markdown
---
description: Author an e2e test for a described flow — plan, generate, heal, then verify with a real test run.
argument-hint: "<flow description>"
---

Author a Playwright end-to-end test for: **$ARGUMENTS**

Drive the official Playwright agents in order. Run autonomously; do not stop for
per-step confirmation.

1. **Plan** — invoke the `planner` agent (Task tool) to explore the running app for the
   flow "$ARGUMENTS" and save a plan into `specs/`. (The app must be running; if it
   isn't, tell the user to start it and stop.)

2. **Generate** — invoke the `generator` agent to turn that plan into a single
   `*.spec.ts`. Honour the agent's house rules (workspace-prefixed write path; prefer
   `browser_evaluate`).

3. **Verify (deterministic gate)** — run the real test command on the new spec:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/pw-verify.mjs" <path-to-the-new-spec>
   ```

4. **Heal if red** — if step 3 fails, invoke the `healer` agent on the failing spec,
   then re-run step 3. Repeat at most `healRetries` times (default 1; read it from
   `playwright-agents.config.json` if present).

5. **Report** — state the final result: spec path + PASS/FAIL + the verify exit code.
   On a persistent FAIL, leave the spec on disk and summarise the failure; do not loop
   further.
```

- [ ] **Step 3: Smoke the verify CLI**

Run: `node scripts/pw-verify.mjs 2>&1 | head -3`
Expected: prints the usage line and exits non-zero (no spec arg).

- [ ] **Step 4: Commit**

```bash
git add commands/pw-author.md scripts/pw-verify.mjs
git commit -m "feat: /pw-author command + verify gate"
```

---

## Task 9: `e2e-authoring` skill

Lets natural language ("write an e2e test for the login flow") trigger the same loop without the slash command.

**Files:**
- Create: `skills/e2e-authoring/SKILL.md`

- [ ] **Step 1: Write the skill**

```markdown
---
name: e2e-authoring
description: Use when the user asks to write, author, or generate a Playwright end-to-end (browser) test for a described flow, or to fix/heal a failing Playwright test. Drives the official planner/generator/healer agents and verifies the result with a real test run.
---

# Authoring Playwright e2e tests with the official agents

Use this when the user wants a browser end-to-end test authored or repaired.

## Preconditions
- The repo has been set up once via `/pw-setup` (agents generated + overlaid, MCP wired).
  If the `playwright-test` MCP tools are not available, tell the user to run `/pw-setup`
  and relaunch Claude Code.
- The app under test must be running.

## The loop (run autonomously)
1. **Plan** — `planner` agent explores the flow, saves a plan to `specs/`.
2. **Generate** — `generator` agent writes one `*.spec.ts` (workspace-prefixed path;
   prefer `browser_evaluate` over full snapshots).
3. **Verify** — run `node "${CLAUDE_PLUGIN_ROOT}/scripts/pw-verify.mjs" <spec>` for a
   real exit code. This is the only success signal.
4. **Heal if red** — `healer` agent on the failing spec, then re-verify. Bounded by
   `healRetries` (default 1).
5. **Report** — spec path + PASS/FAIL + exit code.

## Notes
- Never declare success on the agents' indirect signal alone — only on a green verify.
- Model/effort are pinned in the agent frontmatter by the overlay; do not change them
  here.
```

- [ ] **Step 2: Commit**

```bash
git add skills/e2e-authoring/SKILL.md
git commit -m "feat: e2e-authoring skill"
```

---

## Task 10: Docs + example config

**Files:**
- Modify: `README.md` (expand usage)
- Create: `docs/examples/playwright-agents.config.json`
- Create: `docs/examples/USAGE.md`

- [ ] **Step 1: Write an example config**

```json
{
  "testCommand": "pnpm test",
  "testDir": "apps/e2e/tests",
  "auth": { "mode": "storageState", "setupPath": "apps/e2e/tests/auth.setup.ts" },
  "healRetries": 1,
  "agents": {
    "planner": { "model": "sonnet", "effort": "high" },
    "generator": { "model": "sonnet", "effort": "high" },
    "healer": { "model": "sonnet", "effort": "high" }
  },
  "houseRules": []
}
```

- [ ] **Step 2: Write `docs/examples/USAGE.md`** — a short walkthrough: install via marketplace, run `/pw-setup [apps/e2e]`, relaunch, start the app, run `/pw-author "log in and see the dashboard"`, read the PASS/FAIL. Include the vanilla vs ccage note (no user difference) and the TS/JS-only limitation.

- [ ] **Step 3: Expand `README.md`** — install instructions (`/plugin marketplace add <git-url>` → `/plugin install playwright-agents@playwright-agents`), the command list, config reference (link to the spec), requirements, and the five-caveats table.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/examples
git commit -m "docs: usage walkthrough + example config"
```

---

## Task 11: Dogfood integration (manual)

Prove both paths end-to-end. This task has no unit tests — it is hands-on verification.

- [ ] **Step 1: ccage path — StratSense monorepo.** From the StratSense launch dir (a cage), with `dev.sh` running (frontend on :3100):
  - `node <plugin>/scripts/pw-setup.mjs apps/e2e`
  - Confirm: env detected `ccage`; overlay applied to all three agents; `ccage enable-mcp` wrote the launch-dir `.mcp.json`.
  - Relaunch Claude Code; confirm `mcp__playwright-test__*` tools load.
  - `/pw-author "open the optimisation page and confirm the default max-weight is 20%"` → confirm it plans, generates `apps/e2e/tests/...`, and the **verify gate runs `pnpm test` and reports PASS**.

- [ ] **Step 2: vanilla path — scratch repo.** In a throwaway single-package Playwright repo (not a monorepo, no ccage on PATH, or `PW_AGENTS_ENV=vanilla`):
  - `node <plugin>/scripts/pw-setup.mjs`
  - Confirm: env `vanilla`; `.mcp.json` written at repo root; overlay applied.
  - `/pw-author "<simple flow>"` → confirm verify gate runs and reports a real exit code.

- [ ] **Step 3: Record results** in `docs/examples/USAGE.md` (a short "verified on" note) and commit.

```bash
git add docs/examples/USAGE.md
git commit -m "docs: record dogfood verification results"
```

---

## Self-review checklist (run before handing off)

**Spec coverage** — every spec section maps to a task:
- §4 components → Tasks 6–9 (commands, skill) + Tasks 1–5 (overlay/env/config/mcp engines).
- §5.1 setup flow → Task 6 (init→overlay→mcp→auth) + Task 7.
- §5.2 authoring loop + verify/heal bound → Task 8 (+ skill Task 9).
- §6 five caveats → caveat 1,2 (overlay house rules, Task 3), 3 (verify, Tasks 4/8), 4 (heal retry, Task 8), 5 (auth, Tasks 6/10), effort pin (overlay, Task 3).
- §6 model/effort policy → DEFAULTS (Task 2) + overlay (Task 3).
- §7 ccage detection → Task 1; ccage MCP wiring → Task 5.
- §8 config → Task 2 + example (Task 10).
- §9 repo layout → Task 0.
- §10 testing → unit tests in Tasks 1–5; dogfood in Task 11.

**Placeholder scan** — the only deliberately deferred items are the external-interface confirmations (plugin.json schema, `${CLAUDE_PLUGIN_ROOT}`/`$ARGUMENTS` interpolation, `ccage enable-mcp` flags, the verbatim MCP server command). Each has an explicit confirm-first step, not a code placeholder.

**Type/name consistency** — `SERVER_KEY = 'playwright-test'`, `CONFIG_FILENAME = 'playwright-agents.config.json'`, `HR_START`/`HR_END`, role keys `planner|generator|healer`, and config keys (`testCommand`, `testDir`, `auth`, `healRetries`, `agents`, `houseRules`) are used identically across Tasks 1–10.

## Open items the implementer must confirm (external interfaces, not blocking design)
1. `plugin.json` schema + whether `commands/`/`skills/` auto-discover (Task 0/7) — via `claude-code-guide`.
2. `${CLAUDE_PLUGIN_ROOT}` + `$ARGUMENTS` command interpolation (Tasks 7/8) — via `claude-code-guide`.
3. `ccage enable-mcp` exact flags (Task 5) — via `ccage enable-mcp --help`.
4. Playwright Test MCP server command verbatim (Task 5/6) — from the generated `.mcp.json` after `init-agents`.
5. Whether plugins install per-cage or symlink from master `~/.claude` under ccage (affects install-once-global vs per-cage; does not change the "no modifications" promise).
