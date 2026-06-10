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
