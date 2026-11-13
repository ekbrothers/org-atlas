// Loads atlas.config.yaml and works out where the site will be served.
//
// Config resolution order:
//   1. ATLAS_CONFIG env var (path to a config file)
//   2. ./atlas.config.yaml (created by `npm run init`)
//   3. examples/meridian/atlas.config.yaml (demo mode, used by the upstream repo
//      and by fresh clones that have not run `npm run init` yet)
//
// Data paths inside a config are resolved relative to that config file.

import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { parse } from 'yaml';

// The repo root. npm scripts always run from it; ATLAS_ROOT overrides. (Not derived
// from import.meta.url because Astro bundles this module into dist/ at build time.)
export const ROOT = resolve(process.env.ATLAS_ROOT ?? process.cwd());
export const USER_CONFIG = resolve(ROOT, 'atlas.config.yaml');
export const DEMO_CONFIG = resolve(ROOT, 'examples/meridian/atlas.config.yaml');

export function findConfigPath() {
  if (process.env.ATLAS_CONFIG) return resolve(ROOT, process.env.ATLAS_CONFIG);
  if (existsSync(USER_CONFIG)) return USER_CONFIG;
  return DEMO_CONFIG;
}

export function loadConfig() {
  const path = findConfigPath();
  if (!existsSync(path)) {
    throw new Error(`Config not found: ${path}. Run \`npm run init\` to create one.`);
  }
  let raw;
  try {
    raw = parse(readFileSync(path, 'utf8')) ?? {};
  } catch (err) {
    throw new Error(`Could not parse ${path}: ${err.message}`);
  }
  const configDir = dirname(path);
  return {
    path,
    demo: path === DEMO_CONFIG,
    schemaVersion: raw.schemaVersion ?? 1,
    organization: { name: 'Untitled Organization', ...raw.organization },
    site: {
      title: raw.site?.title ?? raw.organization?.name ?? 'Org Atlas',
      domain: raw.site?.domain ?? null,
      noindex: raw.site?.noindex ?? false,
    },
    dataDir: resolve(configDir, raw.data?.dir ?? 'data'),
  };
}

// Returns "owner/repo" from GITHUB_REPOSITORY (set in Actions) or the git remote.
export function detectRepository() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  try {
    const url = execSync('git remote get-url origin', {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    const match = url.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
    return match ? `${match[1]}/${match[2]}` : null;
  } catch {
    return null;
  }
}

// Works out the public URL and base path, matching how GitHub Pages serves the repo.
//   - ATLAS_BASE / ATLAS_SITE env vars override everything
//   - custom domain           -> https://<domain>/          base "/"
//   - <owner>.github.io repo  -> https://<owner>.github.io/ base "/"
//   - any other repo          -> https://<owner>.github.io/<repo>/
//   - no GitHub remote        -> base "/"
export function resolveSite(config) {
  let site;
  let base = '/';

  if (config.site.domain) {
    site = `https://${config.site.domain.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  } else {
    const repo = detectRepository();
    if (repo) {
      const [owner, name] = repo.split('/');
      site = `https://${owner.toLowerCase()}.github.io`;
      if (name.toLowerCase() !== `${owner.toLowerCase()}.github.io`) base = `/${name}`;
    }
  }

  if (process.env.ATLAS_SITE) site = process.env.ATLAS_SITE;
  if (process.env.ATLAS_BASE !== undefined) base = process.env.ATLAS_BASE || '/';

  return { site, base };
}
