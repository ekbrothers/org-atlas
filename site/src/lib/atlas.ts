// Build-time access to the config and model, shared by all pages.
import { loadConfig, resolveSite } from '../../../engine/lib/config.mjs';
import { loadData } from '../../../engine/lib/data.mjs';
import { buildModel, loadVocab } from '../../../engine/lib/model.mjs';

let cache: any;

export function atlas() {
  if (cache) return cache;
  const config = loadConfig();
  const vocab = loadVocab();
  const { files } = loadData(config.dataDir);
  const model = buildModel(files, vocab, { iconsDir: config.iconsDir });
  cache = { config, vocab, model, site: resolveSite(config) };
  return cache;
}

export const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
export const href = (path = '') => base + path.replace(/^\//, '');
