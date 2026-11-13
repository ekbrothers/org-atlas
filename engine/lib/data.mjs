// Reads every YAML or JSON file under the data directory.
// Phase 0: files are only parsed and counted. Schemas, entity kinds and
// relationships arrive in Phase 1.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseDocument } from 'yaml';

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ya?ml|json)$/i.test(name)) out.push(full);
  }
  return out;
}

// Returns { files: [{ path, rel, doc }], errors: [{ rel, line, message }] }
// `only` limits loading to a single file inside dataDir.
export function loadData(dataDir, { only } = {}) {
  const files = [];
  const errors = [];
  if (!existsSync(dataDir)) {
    errors.push({ rel: dataDir, line: null, message: 'Data directory does not exist.' });
    return { files, errors };
  }
  for (const path of only ? [only] : walk(dataDir)) {
    const rel = relative(process.cwd(), path);
    const parsed = parseDocument(readFileSync(path, 'utf8'), { prettyErrors: true });
    if (parsed.errors.length) {
      for (const err of parsed.errors) {
        errors.push({ rel, line: err.linePos?.[0]?.line ?? null, message: err.message.split('\n')[0].replace(/:\s*$/, '') });
      }
      continue;
    }
    files.push({ path, rel, doc: parsed.toJS() ?? {} });
  }
  return { files, errors };
}

// Counts files by their top-level `kind` field.
export function countKinds(files) {
  const counts = {};
  for (const { doc } of files) {
    const kind = doc?.kind ?? '(no kind)';
    counts[kind] = (counts[kind] ?? 0) + 1;
  }
  return counts;
}
