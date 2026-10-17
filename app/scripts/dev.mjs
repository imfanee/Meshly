#!/usr/bin/env node
/** `npm run dev`: Vite dev server plus the local dev relay on :8787. */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const appDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const procs = [
  spawn('node', [join(appDir, 'tools/dev-relay.mjs')], { stdio: 'inherit' }),
  spawn('npx', ['vite'], { stdio: 'inherit', cwd: appDir, shell: false }),
];
const stop = () => {
  for (const p of procs) p.kill();
  process.exit();
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
