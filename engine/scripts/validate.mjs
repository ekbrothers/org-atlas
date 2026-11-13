#!/usr/bin/env node
// `npm run validate`
// Phase 0: checks that the config loads and every data file is valid YAML.
// Phase 1 adds JSON Schema validation, reference checks and business rules.

import { relative } from 'node:path';
import { loadConfig, resolveSite, ROOT } from '../lib/config.mjs';
import { loadData, countKinds } from '../lib/data.mjs';

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(`✖ ${err.message}`);
  process.exit(1);
}

const { site, base } = resolveSite(config);
console.log(`Config:   ${relative(ROOT, config.path)}${config.demo ? '  (demo mode: run `npm run init` to use your own data)' : ''}`);
console.log(`Data:     ${relative(ROOT, config.dataDir)}`);
console.log(`Site URL: ${site ? site + (base === '/' ? '/' : base + '/') : '(no GitHub remote detected, base "/")'}`);

const { files, errors } = loadData(config.dataDir);

if (errors.length) {
  console.error(`\n✖ ${errors.length} problem(s) found:`);
  for (const e of errors) console.error(`  ${e.rel}${e.line ? ':' + e.line : ''}  ${e.message}`);
  process.exit(1);
}

const kinds = Object.entries(countKinds(files))
  .map(([k, n]) => `${k}: ${n}`)
  .join(', ');
console.log(`\n✔ ${files.length} data file(s) OK${kinds ? `  (${kinds})` : ''}`);
