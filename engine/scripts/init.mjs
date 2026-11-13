#!/usr/bin/env node
// `npm run init`
// Creates your own atlas.config.yaml, data/ and overrides/ from a starter.
//
// Interactive by default. Non-interactive flags:
//   --starter <name>      starter in examples/ (default: minimal)
//   --name "<org name>"   organization name
//   --real-data yes|no    will this hold real org data? (yes turns on noindex)
//   --force               overwrite an existing config and data/
//   --yes                 accept defaults for anything not given

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { ROOT, USER_CONFIG } from '../lib/config.mjs';

const args = parseArgs(process.argv.slice(2));
const EXAMPLES = join(ROOT, 'examples');
const DATA = join(ROOT, 'data');
const OVERRIDES = join(ROOT, 'overrides');

const starters = readdirSync(EXAMPLES, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(EXAMPLES, d.name, 'starter.json')))
  .map((d) => ({ name: d.name, ...JSON.parse(readFileSync(join(EXAMPLES, d.name, 'starter.json'), 'utf8')) }));

const interactive = process.stdin.isTTY && !args.yes;
const rl = interactive ? createInterface({ input: process.stdin, output: process.stdout }) : null;

async function ask(question, fallback) {
  if (!rl) return fallback;
  const answer = (await rl.question(`${question} [${fallback}]: `)).trim();
  return answer || fallback;
}

try {
  console.log('\nOrg Atlas setup\n');

  if ((existsSync(USER_CONFIG) || existsSync(DATA)) && !args.force) {
    const overwrite = await ask('atlas.config.yaml or data/ already exists. Overwrite them? (yes/no)', 'no');
    if (!/^y/i.test(overwrite)) {
      console.log('Nothing changed. Use --force to overwrite without asking.');
      process.exit(0);
    }
  }

  console.log('Starters:');
  for (const s of starters) console.log(`  ${s.name.padEnd(10)} ${s.description}`);
  const starterName = args.starter ?? (await ask('\nWhich starter?', 'minimal'));
  const starter = starters.find((s) => s.name === starterName);
  if (!starter) throw new Error(`Unknown starter "${starterName}". Options: ${starters.map((s) => s.name).join(', ')}`);

  const orgName = args.name ?? (await ask('Organization name?', starter.defaultName ?? 'My Organization'));
  const realAnswer = args['real-data'] ?? (await ask('Will this contain real organization data? (yes/no)', 'yes'));
  const realData = /^y/i.test(realAnswer);

  // Copy starter data
  rmSync(DATA, { recursive: true, force: true });
  cpSync(join(EXAMPLES, starter.name, 'data'), DATA, { recursive: true });

  // Write config
  writeFileSync(USER_CONFIG, configTemplate({ orgName, noindex: realData }));

  // Overrides folder (kept even on --force, it may hold your customizations)
  if (!existsSync(OVERRIDES)) {
    mkdirSync(OVERRIDES, { recursive: true });
    writeFileSync(
      join(OVERRIDES, 'README.md'),
      '# Overrides\n\nYour customizations live here: extra vocabulary, theme tweaks, custom icons and\nquestions. This folder is yours; upstream updates never touch it.\n\nSupported from Phase 1 onward. See docs/PLAN.md.\n',
    );
  }

  console.log(`\n✔ Created atlas.config.yaml, data/ (from "${starter.name}") and overrides/`);

  if (realData) {
    console.log(`
Before you push real organization data, read this:
  - Do NOT fork the public toolkit. Forks of public repos are public.
    Create a new PRIVATE repo and push your clone there instead.
  - GitHub Pages on a private repo needs a paid plan (Pro, Team or Enterprise).
  - A Pages site is reachable by anyone with the URL unless you use
    GitHub Enterprise Cloud's private (access-controlled) Pages.
  - Search engine indexing is turned OFF (site.noindex: true in atlas.config.yaml).`);
  }

  console.log(`
Next:
  npm run dev        preview locally with live reload
  npm run validate   check your data
  npm run build      production build into dist/
`);
} catch (err) {
  console.error(`✖ ${err.message}`);
  process.exitCode = 1;
} finally {
  rl?.close();
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function configTemplate({ orgName, noindex }) {
  return `# Org Atlas configuration. This file is yours: upstream updates never touch it.
schemaVersion: 1

organization:
  name: ${JSON.stringify(orgName)}

site:
  # Title shown in the header and browser tab. Defaults to the organization name.
  # title: "${orgName} Atlas"

  # Custom domain for GitHub Pages (writes a CNAME file and serves from "/").
  # domain: atlas.example.com

  # true blocks search engine indexing (robots.txt + meta tag).
  noindex: ${noindex}

data:
  # Folder holding your YAML data, relative to this file.
  dir: data
`;
}
