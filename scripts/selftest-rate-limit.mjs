/**
 * §5 自测：物品准入口输入源限速
 * 以 tsx/vite-node 方式困难时，直接用已构建逻辑的动态 import 较难；
 * 此处用 node --experimental-vm-modules + 手工复现核心断言，并对 FactoryDesigner/share 做 ESM 通过 vite-node 若可用。
 */
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';
import { spawnSync } from 'child_process';
import fs from 'fs';

const root = process.cwd();

// Prefer tsx if present
function runWithTsx() {
  const tsxCli = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const runner = path.join(root, 'scripts', 'selftest-rate-limit.ts');
  if (!fs.existsSync(tsxCli)) return null;
  const r = spawnSync(process.execPath, [tsxCli, runner], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  });
  return r;
}

const r = runWithTsx();
if (r) {
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  process.exit(r.status ?? 1);
}

// Fallback: use vite-node
const viteNode = path.join(root, 'node_modules', 'vite-node', 'vite-node.mjs');
if (fs.existsSync(viteNode)) {
  const runner = path.join(root, 'scripts', 'selftest-rate-limit.ts');
  const r2 = spawnSync(process.execPath, [viteNode, runner], {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
  });
  process.stdout.write(r2.stdout || '');
  process.stderr.write(r2.stderr || '');
  process.exit(r2.status ?? 1);
}

console.error('Need tsx or vite-node to run TypeScript selftest');
process.exit(1);
