#!/usr/bin/env node
// `npm run validate`               check the configured data directory
// `npm run validate -- <path>`     check one file or folder instead, e.g. a bundle an LLM wrote
// `npm run validate -- --json`     machine-readable result (for scripts and LLM tool loops)
//
// Checks, in order:
//   1. every file parses (YAML or JSON)
//   2. every file matches the JSON Schema (schema/atlas.schema.json)
//   3. references, relationship types and vocabulary values resolve
// Warnings (e.g. a platform with no owner) do not fail validation.

import { existsSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import Ajv from 'ajv';
import { loadConfig, resolveSite, ROOT } from '../lib/config.mjs';
import { loadData } from '../lib/data.mjs';
import { buildModel, loadVocab } from '../lib/model.mjs';
import { buildSchema } from '../lib/schema.mjs';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const target = args.find((a) => !a.startsWith('--'));
const log = (...m) => !asJson && console.log(...m);

let config;
try {
  config = loadConfig();
} catch (err) {
  finish({ errors: [{ rel: 'config', message: err.message }] });
}

let dataPath = config.dataDir;
if (target) {
  dataPath = resolve(process.cwd(), target);
  if (!existsSync(dataPath)) finish({ errors: [{ rel: target, message: 'Path does not exist.' }] });
}

const { site, base } = resolveSite(config);
log(`Config:   ${relative(ROOT, config.path)}${config.demo ? '  (demo mode: run `npm run init` to use your own data)' : ''}`);
log(`Data:     ${relative(ROOT, dataPath) || '.'}`);
if (!target) log(`Site URL: ${site ? site + (base === '/' ? '/' : base + '/') : '(no GitHub remote detected, base "/")'}`);

// 1. Parse
const { files, errors: parseErrors } = statSync(dataPath).isDirectory()
  ? loadData(dataPath)
  : loadData(dirname(dataPath), { only: dataPath });
if (parseErrors.length) finish({ errors: parseErrors });

// 2. Schema
const vocab = loadVocab();
const ajv = new Ajv({ allErrors: true, strict: false });
const check = ajv.compile(buildSchema(vocab));
const schemaErrors = [];
for (const f of files) {
  if (!check(f.doc)) for (const e of tidy(check.errors)) schemaErrors.push({ rel: f.rel, message: e });
}
if (schemaErrors.length) finish({ errors: schemaErrors, files: files.length });

// 3. Model
const model = buildModel(files, vocab, { iconsDir: config.iconsDir });
finish({ errors: model.errors, warnings: model.warnings, files: files.length, model });

function finish({ errors = [], warnings = [], files = 0, model = null }) {
  const counts = model && {
    businessUnits: model.units.length,
    teams: model.teams.length,
    people: model.people.length,
    platforms: model.platforms.length,
    products: model.products.length,
    relationships: model.edges.length,
  };
  if (asJson) {
    console.log(JSON.stringify({ ok: errors.length === 0, files, counts, errors, warnings }, null, 2));
    process.exit(errors.length ? 1 : 0);
  }
  for (const w of warnings) console.warn(`  warning  ${w.rel}  ${w.message}`);
  if (errors.length) {
    console.error(`\n✖ ${errors.length} problem(s) found:`);
    for (const e of errors) console.error(`  ${e.rel}${e.line ? ':' + e.line : ''}  ${e.message}`);
    process.exit(1);
  }
  console.log(
    `\n✔ ${files} data file(s) OK: ${counts.businessUnits} business unit(s), ${counts.teams} team(s), ${counts.people} people, ` +
      `${counts.platforms} platform(s), ${counts.products} product(s), ${counts.relationships} relationship(s)` +
      (warnings.length ? `, ${warnings.length} warning(s)` : ''),
  );
  process.exit(0);
}

// Turn Ajv's errors into short readable lines, dropping the noise that
// if/then/anyOf branches produce.
function tidy(list) {
  const out = new Set();
  for (const e of list ?? []) {
    if (['if', 'anyOf', 'allOf'].includes(e.keyword)) continue;
    const at = e.instancePath ? e.instancePath.replace(/^\//, '').replace(/\//g, '.') : '(top level)';
    let msg = e.message;
    if (e.keyword === 'additionalProperties') msg = `unknown field "${e.params.additionalProperty}"`;
    if (e.keyword === 'enum') msg = `must be one of: ${e.params.allowedValues.join(', ')}`;
    out.add(`${at}: ${msg}`);
  }
  return [...out];
}
