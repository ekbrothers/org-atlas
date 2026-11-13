// Builds the in-memory model from parsed data files and reports problems.
//
// Entity kinds: organization, business-unit, team, person, platform, product
// (`solution` is accepted as another name for `product`).
//
// A data file (YAML or JSON) can take any of these shapes:
//
//   1. One entity                 kind: team
//                                 id: payments-core ...
//
//   2. Several of one kind        kind: person
//                                 items: [ {id: ...}, ... ]
//
//   3. Relationship entries       kind: relationship
//                                 items: [ {from: team:x, type: owner, to: platform:y}, ... ]
//
//   4. A bundle (mixed kinds,     atlas: 1
//      ideal for LLM output)      entities: [ {kind: team, id: ...}, {kind: platform, ...} ]
//                                 relationships: [ {from: ..., type: ..., to: ...} ]
//
// Relationships can also be written inline on the entity, e.g. a platform's
// `owners: [data-platform]` or a product's `platforms: [snowflake]`.
// See engine/vocab/relationships.yaml for every type and its inline field.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parse } from 'yaml';
import { loadConfig, ROOT } from './config.mjs';
import { resolveLogo } from './logos.mjs';

export const ENTITY_KINDS = ['organization', 'business-unit', 'team', 'person', 'persona', 'platform', 'product', 'committee'];
// Other names accepted for a kind. `application` was the original name for `product`.
export const KIND_ALIASES = {
  application: 'product', app: 'product', solution: 'product', model: 'product', 'ml-model': 'product',
  bu: 'business-unit', business_unit: 'business-unit',
  board: 'committee', council: 'committee', guild: 'committee', forum: 'committee',
  audience: 'persona', 'user-group': 'persona',
};

// Vocabulary sections that can be extended or changed from overrides/vocab/*.yaml.
export const VOCAB_SECTIONS = [
  'tiers',
  'disciplines',
  'employment',
  'team-types',
  'committee-types',
  'seat-roles',
  'technologies',
  'technology-categories',
  'relationship-types',
];
const REL_CATEGORIES = ['accountability', 'audience', 'governance', 'technical', 'structural'];

function readYaml(path) {
  return parse(readFileSync(path, 'utf8')) ?? {};
}

// Merge override items into a base list by id: same id = change fields, new id = add.
function mergeList(base, overrides, section, file) {
  const out = base.map((x) => ({ ...x }));
  for (const item of overrides ?? []) {
    if (!item?.id) throw new Error(`${file}: every item in "${section}" needs an id.`);
    const i = out.findIndex((x) => x.id === item.id);
    if (i >= 0) {
      const merged = { ...out[i], ...item };
      // Lists of aliases are added to, not replaced.
      if (out[i].aliases || item.aliases) merged.aliases = [...new Set([...(out[i].aliases ?? []), ...(item.aliases ?? [])])];
      if (out[i].style && item.style) merged.style = { ...out[i].style, ...item.style };
      out[i] = merged;
    } else out.push({ ...item });
  }
  return out;
}

/**
 * Loads the vocabulary: engine defaults (engine/vocab/*.yaml) with any
 * overrides from `overridesDir` merged on top. Each override file may contain
 * any of VOCAB_SECTIONS as lists (same id changes an item, a new id adds one),
 * plus `remove: { <section>: [ids] }` to drop defaults.
 * By default the overrides folder comes from the active atlas.config.yaml.
 */
export function loadVocab({ overridesDir } = {}) {
  if (overridesDir === undefined) {
    try {
      overridesDir = loadConfig().vocabDir;
    } catch {
      overridesDir = null;
    }
  }
  const people = readYaml(resolve(ROOT, 'engine/vocab/people.yaml'));
  const rels = readYaml(resolve(ROOT, 'engine/vocab/relationships.yaml'));
  const gov = readYaml(resolve(ROOT, 'engine/vocab/governance.yaml'));
  const tech = readYaml(resolve(ROOT, 'engine/vocab/technologies.yaml'));
  const v = {
    tiers: people.tiers,
    disciplines: people.disciplines,
    employment: people.employment,
    'team-types': people['team-types'],
    'committee-types': gov['committee-types'],
    'seat-roles': gov['seat-roles'],
    technologies: tech.technologies,
    'technology-categories': tech.categories,
    'relationship-types': rels['relationship-types'],
  };

  const overrideFiles = [];
  if (overridesDir && existsSync(overridesDir)) {
    for (const name of readdirSync(overridesDir).sort()) {
      if (!/\.ya?ml$/i.test(name)) continue;
      const file = join(overridesDir, name);
      const doc = readYaml(file);
      const rel = relative(ROOT, file);
      for (const key of Object.keys(doc)) {
        if (key !== 'remove' && !VOCAB_SECTIONS.includes(key))
          throw new Error(`${rel}: unknown section "${key}". Allowed: ${VOCAB_SECTIONS.join(', ')}, remove.`);
      }
      for (const section of VOCAB_SECTIONS) if (doc[section]) v[section] = mergeList(v[section], doc[section], section, rel);
      for (const [section, ids] of Object.entries(doc.remove ?? {})) {
        if (!VOCAB_SECTIONS.includes(section)) throw new Error(`${rel}: cannot remove from unknown section "${section}".`);
        v[section] = v[section].filter((x) => !ids.includes(x.id));
      }
      overrideFiles.push(rel);
    }
  }

  for (const t of v['relationship-types']) {
    if (!REL_CATEGORIES.includes(t.category))
      throw new Error(`Relationship type "${t.id}": category must be one of ${REL_CATEGORIES.join(', ')}.`);
    if (!t.label || !t.inverse || !t.from?.length || !t.to?.length)
      throw new Error(`Relationship type "${t.id}" needs label, inverse, from and to.`);
    t.style ??= { line: 'solid', weight: 2, glyph: 'link' };
  }

  const techAlias = {};
  for (const t of v.technologies) {
    techAlias[t.id.toLowerCase()] = t;
    for (const a of t.aliases ?? []) techAlias[String(a).toLowerCase()] = t;
  }
  const index = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  const relTypes = v['relationship-types'];
  const relAlias = {};
  for (const t of relTypes) {
    relAlias[t.id] = t.id;
    for (const a of t.aliases ?? []) relAlias[String(a).toLowerCase()] = t.id;
  }
  return {
    overrideFiles,
    tiers: v.tiers,
    disciplines: v.disciplines,
    employment: v.employment,
    teamTypes: v['team-types'],
    tier: index(v.tiers),
    discipline: index(v.disciplines),
    employmentById: index(v.employment),
    teamType: index(v['team-types']),
    techCategories: v['technology-categories'],
    technologies: v.technologies,
    techCategory: index(v['technology-categories']),
    techAlias,
    committeeTypes: v['committee-types'],
    seatRoles: v['seat-roles'],
    committeeType: index(v['committee-types']),
    seatRole: index(v['seat-roles']),
    relTypes,
    relType: index(relTypes),
    relAlias,
  };
}

export const keyOf = (e) => `${e.kind}:${e.id}`;

export function buildModel(files, vocab = loadVocab(), { iconsDir } = {}) {
  const errors = [];
  const warnings = [];
  const byKind = Object.fromEntries(ENTITY_KINDS.map((k) => [k, new Map()]));
  const rawEdges = []; // { type, from, to, attrs, rel }

  const normKind = (k) => (k ? KIND_ALIASES[String(k).toLowerCase()] ?? String(k).toLowerCase() : k);

  function addEntity(item, kind, rel) {
    const written = String(kind ?? '').toLowerCase();
    kind = normKind(kind);
    if (!ENTITY_KINDS.includes(kind)) {
      warnings.push({ rel, message: `Kind "${kind}" is not supported, skipped.` });
      return;
    }
    if (!item || typeof item !== 'object') {
      errors.push({ rel, message: `A ${kind} entry is not an object.` });
      return;
    }
    const entity = { ...item, kind, _file: rel };
    delete entity.items;
    if (!entity.id) {
      errors.push({ rel, message: `A ${kind}${entity.name ? ` ("${entity.name}")` : ''} is missing an \`id\`.` });
      return;
    }
    entity.id = String(entity.id);
    if (['solution', 'application', 'model'].includes(written) && entity.type == null) entity.type = written;
    if (written === 'ml-model' && entity.type == null) entity.type = 'model';
    if (byKind[kind].has(entity.id)) {
      errors.push({ rel, message: `Duplicate ${kind} id "${entity.id}" (also in ${byKind[kind].get(entity.id)._file}).` });
      return;
    }
    byKind[kind].set(entity.id, entity);
  }

  // 1. Collect entities and relationship entries
  for (const { rel, doc } of files) {
    if (!doc || typeof doc !== 'object') continue;
    if (Array.isArray(doc.entities) || doc.atlas !== undefined) {
      for (const item of doc.entities ?? []) addEntity(item, item?.kind, rel);
      for (const r of doc.relationships ?? []) rawEdges.push({ ...r, _file: rel });
      continue;
    }
    const kind = normKind(doc.kind);
    if (!kind) {
      warnings.push({ rel, message: 'File has no `kind` (or `entities`), skipped.' });
      continue;
    }
    if (kind === 'relationship' || kind === 'relationships') {
      for (const r of Array.isArray(doc.items) ? doc.items : [doc]) rawEdges.push({ ...r, _file: rel });
      continue;
    }
    for (const item of Array.isArray(doc.items) ? doc.items : [doc]) addEntity(item, kind, rel);
  }

  const get = (kind, id) => byKind[kind]?.get(id);
  const orgs = [...byKind.organization.values()];
  const units = byKind['business-unit'];
  const teams = byKind.team;
  const people = byKind.person;
  const platforms = byKind.platform;
  const products = byKind.product;
  const committees = byKind.committee;

  if (orgs.length > 1) errors.push({ rel: orgs[1]._file, message: 'Only one organization is allowed.' });
  const organization = orgs[0] ?? { id: 'org', kind: 'organization', name: 'Organization' };

  const ref = (entity, field, map, label) => {
    const id = entity[field];
    if (id == null) return null;
    const target = map.get(String(id));
    if (!target) errors.push({ rel: entity._file, message: `${entity.kind} "${entity.id}": ${field} "${id}" is not a known ${label}.` });
    return target ?? null;
  };

  // 2. People
  for (const p of people.values()) {
    p.tier ??= 'ic';
    p.employment ??= 'fte';
    if (!vocab.tier[p.tier]) errors.push({ rel: p._file, message: `person "${p.id}": unknown tier "${p.tier}".` });
    if (p.discipline && !vocab.discipline[p.discipline])
      errors.push({ rel: p._file, message: `person "${p.id}": unknown discipline "${p.discipline}".` });
    if (!vocab.employmentById[p.employment])
      errors.push({ rel: p._file, message: `person "${p.id}": unknown employment "${p.employment}".` });
    if (!p.name && p.employment !== 'vacancy') errors.push({ rel: p._file, message: `person "${p.id}" needs a \`name\`.` });
    p.displayName = p.name ?? `Open: ${p.role ?? 'position'}`;
    p.memberships = (p.memberships ?? []).map((m) => (typeof m === 'string' ? { team: m } : m));
    if (p.memberships.length && !p.memberships.some((m) => m.primary)) p.memberships[0].primary = true;
    p.teamRefs = [];
  }

  // 3. Structure
  for (const u of units.values()) {
    u.leadPerson = ref(u, 'lead', people, 'person');
    u.teams = [];
  }
  for (const t of teams.values()) {
    t.unit = ref(t, 'parent', units, 'business unit');
    if (t.type && !vocab.teamType[t.type]) errors.push({ rel: t._file, message: `team "${t.id}": unknown type "${t.type}".` });
    t.leadPerson = ref(t, 'lead', people, 'person');
    t.members = [];
    t.unit?.teams.push(t);
  }
  for (const p of people.values()) {
    for (const m of p.memberships) {
      const team = teams.get(String(m.team));
      if (!team) {
        errors.push({ rel: p._file, message: `person "${p.id}": team "${m.team}" is not a known team.` });
        continue;
      }
      team.members.push({ person: p, primary: !!m.primary, role: m.role ?? p.role ?? null });
      p.teamRefs.push({ team, primary: !!m.primary, role: m.role ?? null });
    }
  }
  if (organization.lead) organization.leadPerson = people.get(organization.lead) ?? null;

  // Committees: seats (chair, members with roles)
  for (const p of people.values()) p.seats = [];
  for (const c of committees.values()) {
    if (c.type && !vocab.committeeType[c.type]) errors.push({ rel: c._file, message: `committee "${c.id}": unknown type "${c.type}".` });
    const seats = new Map();
    for (const m of [].concat(c.members ?? [])) {
      const seat = typeof m === 'string' ? { person: m } : { ...m };
      seat.role ??= 'member';
      if (!vocab.seatRole[seat.role]) errors.push({ rel: c._file, message: `committee "${c.id}": unknown seat role "${seat.role}".` });
      const person = people.get(String(seat.person ?? '').replace(/^person:/, ''));
      if (!person) {
        errors.push({ rel: c._file, message: `committee "${c.id}": member "${seat.person}" is not a known person.` });
        continue;
      }
      let representing = null;
      if (seat.representing) {
        const [rk, rid] = String(seat.representing).includes(':') ? String(seat.representing).split(':') : ['team', seat.representing];
        representing = byKind[normKind(rk)]?.get(rid) ?? null;
        if (!representing) errors.push({ rel: c._file, message: `committee "${c.id}": representing "${seat.representing}" does not exist.` });
      }
      seats.set(person.id, { person, role: seat.role, representing, note: seat.note ?? null });
    }
    if (c.chair) {
      const chair = people.get(String(c.chair).replace(/^person:/, ''));
      if (!chair) errors.push({ rel: c._file, message: `committee "${c.id}": chair "${c.chair}" is not a known person.` });
      else seats.set(chair.id, { ...(seats.get(chair.id) ?? { person: chair, representing: null, note: null }), role: 'chair' });
    }
    const rankOf = (r) => vocab.seatRole[r]?.rank ?? 99;
    c.seats = [...seats.values()].sort((a, b) => rankOf(a.role) - rankOf(b.role) || a.person.displayName.localeCompare(b.person.displayName));
    c.chairPerson = c.seats.find((x) => x.role === 'chair')?.person ?? null;
    for (const seat of c.seats) seat.person.seats.push({ committee: c, role: seat.role });
    if (!c.chairPerson) warnings.push({ rel: c._file, message: `committee "${c.id}" has no chair.` });
    if (!c.seats.length) warnings.push({ rel: c._file, message: `committee "${c.id}" has no members.` });
  }

  // Logos
  for (const kind of ['platform', 'product']) {
    for (const e of byKind[kind].values()) {
      const logo = resolveLogo(e.logo, { iconsDir, fallback: kind === 'platform' ? 'package' : 'apps' });
      if (!logo.ok) errors.push({ rel: e._file, message: `${kind} "${e.id}": ${logo.error}` });
      e.logoSvg = logo;
    }
  }

  // Nested products (e.g. models inside the product that uses them)
  for (const p of products.values()) p.children = [];
  for (const p of products.values()) {
    if (p.parent == null) continue;
    const parent = products.get(String(p.parent).replace(/^product:/, ''));
    if (!parent) {
      errors.push({ rel: p._file, message: `product "${p.id}": parent "${p.parent}" is not a known product.` });
      continue;
    }
    p.parentProduct = parent;
    parent.children.push(p);
  }
  for (const p of products.values()) {
    const seenUp = new Set([p.id]);
    for (let a = p.parentProduct; a; a = a.parentProduct) {
      if (seenUp.has(a.id)) {
        errors.push({ rel: p._file, message: `product "${p.id}": parent chain loops back on itself.` });
        p.parentProduct = null;
        break;
      }
      seenUp.add(a.id);
    }
  }

  // Personas (groups of users): icon defaults by internal / external
  for (const e of byKind.persona.values()) {
    e.icon ??= e.internal === false ? 'globe' : 'people';
  }

  // Tech stack: known technologies get a label, category and logo
  for (const kind of ['platform', 'product']) {
    for (const e of byKind[kind].values()) {
      e.stackItems = [].concat(e.stack ?? []).map((item) => {
        const raw = typeof item === 'string' ? { id: item } : { ...item, id: item.id ?? item.tech };
        const known = vocab.techAlias[String(raw.id ?? '').toLowerCase()];
        return {
          id: known?.id ?? String(raw.id),
          label: known?.label ?? String(raw.id),
          category: known?.category ?? null,
          version: raw.version ?? null,
          note: raw.note ?? null,
          known: !!known,
          logo: known ? resolveLogo(known.logo, { fallback: 'code' }) : resolveLogo('octicon:code'),
        };
      });
    }
  }

  // 4. Inline relationships -> entries
  const inlineTarget = vocab.relTypes.filter((t) => t.inline);
  const inlineSource = vocab.relTypes.filter((t) => t['inline-on-source']);
  for (const kind of ENTITY_KINDS) {
    if (['person', 'organization', 'business-unit'].includes(kind)) continue;
    for (const e of byKind[kind].values()) {
      for (const t of inlineTarget) {
        if (!t.to.includes(kind) || e[t.inline] == null) continue;
        for (const v of [].concat(e[t.inline])) {
          const { refStr, attrs } = splitInline(v);
          rawEdges.push({ type: t.id, from: refStr, to: `${kind}:${e.id}`, ...attrs, _file: e._file, _defaultFrom: t['default-from'] });
        }
      }
      for (const t of inlineSource) {
        if (!t.from.includes(kind) || e[t['inline-on-source']] == null) continue;
        for (const v of [].concat(e[t['inline-on-source']])) {
          const { refStr, attrs } = splitInline(v);
          rawEdges.push({ type: t.id, from: `${kind}:${e.id}`, to: refStr, ...attrs, _file: e._file, _defaultTo: t['default-to'] });
        }
      }
    }
  }

  // 5. Resolve relationship entries
  const edges = [];
  const seen = new Set();
  const parseRef = (s, defaultKind) => {
    if (s && typeof s === 'object') s = s.ref ?? s.id;
    if (!s) return null;
    s = String(s);
    const i = s.indexOf(':');
    if (i > 0 && (ENTITY_KINDS.includes(normKind(s.slice(0, i))) || KIND_ALIASES[s.slice(0, i)]))
      return { kind: normKind(s.slice(0, i)), id: s.slice(i + 1) };
    return defaultKind ? { kind: defaultKind, id: s } : null;
  };
  for (const r of rawEdges) {
    const typeId = vocab.relAlias[String(r.type ?? '').toLowerCase()];
    const t = typeId && vocab.relType[typeId];
    if (!t) {
      errors.push({ rel: r._file, message: `Unknown relationship type "${r.type}". See engine/vocab/relationships.yaml.` });
      continue;
    }
    if (t.structural) {
      errors.push({ rel: r._file, message: `"${t.id}" is structural: set it with the entity's fields, not as a relationship entry.` });
      continue;
    }
    const fromRef = parseRef(r.from, r._defaultFrom ?? t['default-from']);
    const toRef = parseRef(r.to, r._defaultTo ?? t['default-to'] ?? (t.to.length === 1 ? t.to[0] : null));
    const label = `${t.id} ${r.from ?? '?'} -> ${r.to ?? '?'}`;
    if (!fromRef || !toRef) {
      errors.push({ rel: r._file, message: `Relationship ${label}: write ends as "kind:id", e.g. "team:payments-core".` });
      continue;
    }
    const from = get(fromRef.kind, fromRef.id);
    const to = get(toRef.kind, toRef.id);
    if (!from) errors.push({ rel: r._file, message: `Relationship ${label}: ${fromRef.kind} "${fromRef.id}" does not exist.` });
    if (!to) errors.push({ rel: r._file, message: `Relationship ${label}: ${toRef.kind} "${toRef.id}" does not exist.` });
    if (!from || !to) continue;
    if (!t.from.includes(from.kind) || !t.to.includes(to.kind)) {
      errors.push({
        rel: r._file,
        message: `Relationship ${label}: "${t.id}" goes from ${t.from.join('/')} to ${t.to.join('/')}, not ${from.kind} to ${to.kind}.`,
      });
      continue;
    }
    const k = `${keyOf(from)}|${t.id}|${keyOf(to)}`;
    if (seen.has(k)) {
      warnings.push({ rel: r._file, message: `Relationship ${label} is listed more than once.` });
      continue;
    }
    seen.add(k);
    const attrs = {};
    for (const a of t.attributes ?? []) if (r[a] != null) attrs[a] = r[a];
    edges.push({ type: t.id, rel: t, from, to, ...attrs });
  }

  // 6. Edge indexes
  const out = new Map();
  const inc = new Map();
  for (const e of edges) {
    const a = keyOf(e.from);
    const b = keyOf(e.to);
    if (!out.has(a)) out.set(a, []);
    if (!inc.has(b)) inc.set(b, []);
    out.get(a).push(e);
    inc.get(b).push(e);
  }
  const edgesFrom = (entity, type) => (out.get(keyOf(entity)) ?? []).filter((e) => !type || e.type === type);
  const edgesTo = (entity, type) => (inc.get(keyOf(entity)) ?? []).filter((e) => !type || e.type === type);

  // 7. Cardinality (e.g. everything needs an owner)
  for (const t of vocab.relTypes) {
    const min = t.cardinality?.['min-per-target'];
    if (!min) continue;
    for (const kind of t.to) {
      for (const e of byKind[kind]?.values() ?? []) {
        if (edgesTo(e, t.id).length < min) {
          // A nested product without its own owner is owned through its parent.
          let a = e.parentProduct;
          while (a && t.id === 'owner' && !edgesTo(a, 'owner').length) a = a.parentProduct;
          if (t.id === 'owner' && a) {
            e.inheritsOwnershipFrom = a;
            continue;
          }
          e.unowned = t.id === 'owner';
          warnings.push({ rel: e._file, message: `${kind} "${e.id}" has no ${t.label.toLowerCase()}.` });
        }
      }
    }
  }

  // 8. Sorting and structural warnings
  const rank = (p) => vocab.tier[p.tier]?.rank ?? 99;
  for (const t of teams.values()) {
    t.members.sort(
      (a, b) =>
        (a.person === t.leadPerson ? -1 : 0) - (b.person === t.leadPerson ? -1 : 0) ||
        rank(a.person) - rank(b.person) ||
        (a.person.employment === 'vacancy') - (b.person.employment === 'vacancy') ||
        a.person.displayName.localeCompare(b.person.displayName),
    );
    if (!t.leadPerson) warnings.push({ rel: t._file, message: `team "${t.id}" has no lead.` });
    if (!t.members.length) warnings.push({ rel: t._file, message: `team "${t.id}" has no members.` });
  }
  for (const p of people.values()) {
    const leads = organization.lead === p.id || [...units.values()].some((u) => u.lead === p.id);
    if (!p.memberships.length && !leads && !p.seats.length && !edgesFrom(p).length)
      warnings.push({ rel: p._file, message: `person "${p.id}" is not on any team.` });
  }

  const byOrder = (a, b) => (a.order ?? 99) - (b.order ?? 99) || String(a.name).localeCompare(String(b.name));
  const unitList = [...units.values()].sort(byOrder);
  for (const u of unitList) u.teams.sort(byOrder);
  const byName = (a, b) => String(a.name).localeCompare(String(b.name));

  return {
    organization,
    units: unitList,
    teams: [...teams.values()],
    people: [...people.values()],
    platforms: [...platforms.values()].sort(byName),
    products: [...products.values()].sort(byName),
    committees: [...committees.values()].sort(byOrder),
    personas: [...byKind.persona.values()].sort(byOrder),
    edges,
    team: (id) => teams.get(id),
    get,
    edgesFrom,
    edgesTo,
    unassignedTeams: [...teams.values()].filter((t) => !t.unit),
    errors,
    warnings,
  };
}

// Inline values are either a reference string or { ref|id, ...attributes }.
function splitInline(v) {
  if (v && typeof v === 'object') {
    const { ref, id, ...attrs } = v;
    return { refStr: ref ?? id, attrs };
  }
  return { refStr: v, attrs: {} };
}

// Headcount for a team. `filled` counts people whose primary team this is;
// shared members (primary team elsewhere) and open positions are counted separately.
export function headcount(team) {
  const open = team.members.filter((m) => m.person.employment === 'vacancy').length;
  const shared = team.members.filter((m) => !m.primary && m.person.employment !== 'vacancy').length;
  return { filled: team.members.length - open - shared, shared, open };
}

// Display name of any entity.
export const nameOf = (e) => e?.displayName ?? e?.name ?? e?.id;
