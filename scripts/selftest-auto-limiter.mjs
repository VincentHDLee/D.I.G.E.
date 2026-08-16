/**
 * Self-test: auto limiter (k/5 model) + 2664W scenario.
 */
import { createRequire } from 'module';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsx = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['tsx', path.join(root, 'scripts/selftest-auto-limiter.ts')],
  { cwd: root, encoding: 'utf8', shell: true }
);
process.stdout.write(tsx.stdout || '');
process.stderr.write(tsx.stderr || '');
process.exit(tsx.status ?? 1);
