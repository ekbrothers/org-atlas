// Resolves a logo reference to SVG markup.
//
//   si:<slug>        Simple Icons brand logo (CC0; trademarks belong to their owners)
//                    https://simpleicons.org  e.g. si:snowflake, si:github, si:sonatype
//   octicon:<name>   Primer Octicon, for generic or unbranded things
//   custom:<name>    Your own SVG at <icons dir>/<name>.svg (for proprietary platforms)
//
// The icons dir is `icons.dir` in atlas.config.yaml (default: overrides/icons
// for your config, icons/ next to the config for the bundled examples).

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
let siIndex;
function simpleIcons() {
  if (!siIndex) {
    const si = require('simple-icons');
    siIndex = {};
    for (const icon of Object.values(si)) if (icon?.slug) siIndex[icon.slug] = icon;
  }
  return siIndex;
}
let octicons;
const oct = () => (octicons ??= require('@primer/octicons'));

// Relative luminance of a hex color, 0 (black) to 1 (white).
function luminance(hex) {
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Strip anything executable from a user-supplied SVG.
function sanitize(svg) {
  return svg
    .replace(/<\?xml[^>]*>/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/(href|xlink:href)\s*=\s*"javascript:[^"]*"/gi, '')
    .trim();
}

/**
 * @returns {{ ok: boolean, source: string, svg: string, color: string|null, title: string, error?: string }}
 */
export function resolveLogo(ref, { iconsDir, fallback = 'package' } = {}) {
  const fallbackLogo = (error) => ({ ...resolveLogo(`octicon:${fallback}`), ok: !error, error });
  if (!ref) return fallbackLogo();
  const [prefix, ...rest] = String(ref).split(':');
  const name = rest.join(':');

  if (prefix === 'si') {
    const icon = simpleIcons()[name];
    if (!icon) return fallbackLogo(`Simple Icons has no logo "${name}". Browse https://simpleicons.org for slugs.`);
    // Very light brand colors are unreadable on the white logo tile.
    const color = luminance(icon.hex) > 0.6 ? '#3b3b3b' : `#${icon.hex}`;
    return {
      ok: true,
      source: 'simple-icons',
      title: icon.title,
      color,
      svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="${color}" aria-hidden="true"><path d="${icon.path}"/></svg>`,
    };
  }

  if (prefix === 'octicon') {
    const icon = oct()[name];
    if (!icon) return fallbackLogo(`Unknown Octicon "${name}". Browse https://primer.style/octicons/.`);
    return { ok: true, source: 'octicon', title: name, color: null, svg: icon.toSVG({ width: 24, height: 24, 'aria-hidden': 'true' }) };
  }

  if (prefix === 'custom') {
    const file = iconsDir ? join(iconsDir, `${name}.svg`) : null;
    if (!file || !existsSync(file)) return fallbackLogo(`Custom logo "${name}" not found${file ? ` at ${file}` : ''}.`);
    return { ok: true, source: 'custom', title: name, color: null, svg: sanitize(readFileSync(file, 'utf8')) };
  }

  return fallbackLogo(`Logo "${ref}" must start with si:, octicon: or custom:.`);
}
