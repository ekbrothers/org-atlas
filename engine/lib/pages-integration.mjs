// Astro integration that writes the small files GitHub Pages cares about
// into the build output once the build is done.
//   .nojekyll   always (harmless under Actions deploys, required for branch deploys)
//   CNAME       when site.domain is set in atlas.config.yaml
//   robots.txt  "Disallow: /" when site.noindex is true, otherwise allow all

import { mkdirSync, writeFileSync } from 'node:fs';
import { buildSchema } from './schema.mjs';
import { buildAgent } from './agent.mjs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export default function pagesIntegration(config) {
  return {
    name: 'org-atlas:pages',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        const out = fileURLToPath(dir);
        writeFileSync(join(out, '.nojekyll'), '');

        // Publish the JSON Schema so editors and LLMs can fetch it from the site.
        mkdirSync(join(out, 'schema'), { recursive: true });
        writeFileSync(join(out, 'schema', 'atlas.schema.json'), JSON.stringify(buildSchema(), null, 2) + '\n');

        // Publish the authoring agent so any LLM can be pointed at it by URL.
        const agent = buildAgent();
        mkdirSync(join(out, 'agent'), { recursive: true });
        writeFileSync(join(out, 'agent', 'org-atlas-agent.md'), agent.body);
        writeFileSync(join(out, 'agent', 'tool.json'), JSON.stringify(agent.tool, null, 2) + '\n');

        if (config.site.domain) {
          const domain = config.site.domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
          writeFileSync(join(out, 'CNAME'), `${domain}\n`);
          logger.info(`Wrote CNAME for ${domain}`);
        }

        const robots = config.site.noindex
          ? 'User-agent: *\nDisallow: /\n'
          : 'User-agent: *\nAllow: /\n';
        writeFileSync(join(out, 'robots.txt'), robots);
        if (config.site.noindex) logger.info('Search engine indexing disabled (site.noindex)');
      },
    },
  };
}
