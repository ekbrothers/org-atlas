// Engine-owned. You should not need to edit this file: configure your site
// in atlas.config.yaml instead. The base path for GitHub Pages is detected
// automatically (see engine/lib/config.mjs).

import { defineConfig } from 'astro/config';
import { loadConfig, resolveSite } from './engine/lib/config.mjs';
import pagesIntegration from './engine/lib/pages-integration.mjs';

const atlas = loadConfig();
const { site, base } = resolveSite(atlas);

export default defineConfig({
  site,
  base,
  srcDir: './site/src',
  publicDir: './site/public',
  outDir: './dist',
  trailingSlash: 'ignore',
  integrations: [pagesIntegration(atlas)],
});
