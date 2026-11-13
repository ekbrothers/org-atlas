#!/usr/bin/env node
// `npm run export`                    print the whole dataset as one JSON bundle
// `npm run export -- --out file.json` write it to a file
// `npm run export -- --pack`          a context pack: instructions, schema, vocabulary
//                                     AND the data, in one JSON to hand to any LLM
// `npm run export -- --slim`          the same pack without the schema, minified (smaller)
//
// The bundle is the easiest format to hand to an LLM: it contains every entity
// and every relationship (inline shorthands are expanded into explicit
// relationship entries), and can be dropped back into data/ as-is.

import { writeFileSync } from 'node:fs';
import { loadConfig } from '../lib/config.mjs';
import { loadData } from '../lib/data.mjs';
import { buildModel, loadVocab, ENTITY_KINDS, KIND_ALIASES } from '../lib/model.mjs';
import { buildSchema } from '../lib/schema.mjs';
import { buildAgent } from '../lib/agent.mjs';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const pack = args.includes('--pack') || args.includes('--slim');
// --slim: a smaller pack for limited LLM context windows (no JSON Schema, no indentation).
const slim = args.includes('--slim');
const out = outIdx >= 0 ? args[outIdx + 1] : null;

const config = loadConfig();
const vocab = loadVocab({ overridesDir: config.vocabDir });
const { files, errors } = loadData(config.dataDir);
if (errors.length) {
  console.error('Fix parse errors first (npm run validate).');
  process.exit(1);
}
const raw = structuredClone(files);
const model = buildModel(files, vocab, { iconsDir: config.iconsDir });
if (model.errors.length) {
  console.error('Fix validation errors first (npm run validate).');
  process.exit(1);
}

// Inline relationship fields to strip, since every relationship is exported explicitly.
const inlineFields = new Set(vocab.relTypes.flatMap((t) => [t.inline, t['inline-on-source']]).filter(Boolean));
const entities = [];
for (const { doc } of raw) {
  if (!doc || typeof doc !== 'object') continue;
  const push = (item, kind) => {
    kind = KIND_ALIASES[kind] ?? kind;
    if (!ENTITY_KINDS.includes(kind)) return;
    const clean = { kind };
    for (const [k, v] of Object.entries(item)) if (k !== 'kind' && !inlineFields.has(k)) clean[k] = v;
    entities.push(clean);
  };
  if (Array.isArray(doc.entities)) for (const e of doc.entities) push(e, e.kind);
  else if (Array.isArray(doc.items)) for (const e of doc.items) push(e, doc.kind);
  else if (doc.kind) push(doc, doc.kind);
}
const order = Object.fromEntries(ENTITY_KINDS.map((k, i) => [k, i]));
entities.sort((a, b) => order[a.kind] - order[b.kind]);

const relationships = model.edges.map((e) => {
  const r = { from: `${e.from.kind}:${e.from.id}`, type: e.type, to: `${e.to.kind}:${e.to.id}` };
  for (const a of e.rel.attributes ?? []) if (e[a] != null) r[a] = e[a];
  return r;
});

const bundle = { atlas: 1, entities, relationships };

// The context pack: everything an LLM needs to understand and change the chart.
const output = pack
  ? {
      'org-atlas-pack': 1,
      generated: new Date().toISOString().slice(0, 10),
      howToUse:
        'You are given an Org Atlas chart. "instructions" explains the format and rules, "schema" is the JSON Schema for data, "vocabulary" lists every allowed value, and "data" is the current chart as a bundle. To make changes, return the complete updated "data" bundle (same shape: { atlas, entities, relationships }), keeping existing ids stable.',
      instructions: buildAgent(vocab).body,
      vocabulary: {
        tiers: vocab.tiers,
        disciplines: vocab.disciplines,
        employment: vocab.employment,
        teamTypes: vocab.teamTypes,
        committeeTypes: vocab.committeeTypes,
        seatRoles: vocab.seatRoles,
        technologies: vocab.technologies.map(({ id, label, category, aliases }) => ({ id, label, category, aliases })),
        relationshipTypes: vocab.relTypes.map((t) => ({
          id: t.id, label: t.label, inverse: t.inverse, category: t.category, description: t.description,
          from: t.from, to: t.to, attributes: t.attributes ?? [], structural: !!t.structural, aliases: t.aliases ?? [],
        })),
      },
      ...(slim ? {} : { schema: buildSchema(vocab) }),
      data: bundle,
    }
  : bundle;
const json = JSON.stringify(output, null, slim ? 0 : 2) + '\n';
if (out) {
  writeFileSync(out, json);
  console.error(`Wrote ${out}${pack ? ' (context pack)' : ''}: ${entities.length} entities, ${relationships.length} relationships`);
} else process.stdout.write(json);
