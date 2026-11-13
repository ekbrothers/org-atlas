#!/usr/bin/env node
// `npm run validate`
// Checks that the config loads, every data file is valid YAML, and that
// business units, teams and people reference each other correctly.
// Full JSON Schema validation and business rules arrive with the rest of Phase 1.

import { relative } from 'node:path';
import { loadConfig, resolveSite, ROOT } from '../lib/config.mjs';
import { loadData } from '../lib/data.mjs';
import { buildModel } from '../lib/model.mjs';

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

const model = buildModel(files);

for (const w of model.warnings) console.warn(`  warning  ${w.rel}  ${w.message}`);

if (model.errors.length) {
  console.error(`\n\u2716 ${model.errors.length} problem(s) found:`);
  for (const e of model.errors) console.error(`  ${e.rel}  ${e.message}`);
  process.exit(1);
}

console.log(
  `\n\u2714 ${files.length} data file(s) OK: ${model.units.length} business unit(s), ` +
    `${model.teams.length} team(s), ${model.people.length} people` +
    (model.warnings.length ? `, ${model.warnings.length} warning(s)` : ''),
);
