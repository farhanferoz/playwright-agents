// scripts/pw-verify.mjs
import { loadConfig } from './lib/config.mjs';
import { runVerify } from './lib/verify.mjs';

const specPath = process.argv[2];
if (!specPath) { process.stderr.write('usage: pw-verify <spec-path>\n'); process.exit(2); }

const config = loadConfig(process.cwd());
const { exitCode, ok } = runVerify(config.testCommand, specPath, {});
process.stdout.write(`[pw-verify] ${ok ? 'PASS' : 'FAIL'} (exit ${exitCode}) — ${config.testCommand} ${specPath}\n`);
process.exit(exitCode);
