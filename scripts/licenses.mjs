// Mapline Copyright (C) 2026 Albane Minart
// SPDX-License-Identifier: GPL-3.0-or-later

// Lists the npm packages bundled in the app (the production dependencies and
// theirs) with their licence, for the About dialog: `node scripts/licenses.mjs`.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';

const root = resolvePath(new URL('..', import.meta.url).pathname);
const read = (dir) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));

/** Resolves `name` from `dir` the way Node does, walking up node_modules folders. */
function resolve(name, dir) {
  for (let d = dir; d.startsWith(root); d = join(d, '..')) {
    const candidate = join(d, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
  }
  return null;
}

const seen = new Map();
const queue = Object.keys(read(root).dependencies).map((name) => [name, root]);
while (queue.length) {
  const [name, from] = queue.shift();
  const dir = resolve(name, from);
  if (!dir) continue;
  const pkg = read(dir);
  const id = `${pkg.name}@${pkg.version}`;
  if (seen.has(id)) continue;
  const license = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? 'UNKNOWN';
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  seen.set(id, { name: pkg.name, version: pkg.version, license, url: pkg.homepage ?? repo ?? '' });
  // Optional ones too: when installed, the bundler includes them.
  for (const dep of Object.keys({ ...pkg.dependencies, ...pkg.optionalDependencies })) queue.push([dep, dir]);
}

const list = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(join(root, 'src/licenses.json'), JSON.stringify(list, null, 2) + '\n');
console.log(`${list.length} packages`);
