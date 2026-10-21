#!/usr/bin/env node
// Creative Flo. Created by Byram Smith Jr., a DigitalFlo product. MIT licensed, see LICENSE and NOTICE.
import { spawnSync } from 'node:child_process';
import { existsSync, copyFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
console.log('Creative Flo, created by Byram Smith Jr. A DigitalFlo product. https://mydigitalflo.io');
let missing = false;
for (const [command, args] of [['node', ['--version']], ['ffmpeg', ['-version']], ['ffprobe', ['-version']]]) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true });
  if (result.error || result.status !== 0) { console.error(`${command}: missing from PATH`); missing = true; }
  else console.log((result.stdout || result.stderr).split(/\r?\n/)[0]);
}
if (Number(process.versions.node.split('.')[0]) < 22) { console.error('Node 22+ required.'); missing = true; }
if (!existsSync(join(root, '.env'))) { copyFileSync(join(root, '.env.example'), join(root, '.env')); console.log('Created local .env. Fill only the keys your chosen services need.'); }
else console.log('Existing .env preserved.');
console.log('Service setup and alternatives: docs/TOOLS-AND-API-KEYS.md');
console.log('Next: npx hyperframes doctor (Chrome diagnostics), then npm run demo.');
process.exitCode = missing ? 1 : 0;
