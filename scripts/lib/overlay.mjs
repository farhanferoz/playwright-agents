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
