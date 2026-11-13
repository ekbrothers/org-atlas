#!/usr/bin/env node
// `npm run schema`: writes schema/atlas.schema.json from the vocabulary files.
// The build also publishes it at <site>/schema/atlas.schema.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../lib/config.mjs';
import { buildSchema } from '../lib/schema.mjs';

const dir = join(ROOT, 'schema');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'atlas.schema.json'), JSON.stringify(buildSchema(), null, 2) + '\n');
console.log('Wrote schema/atlas.schema.json');
