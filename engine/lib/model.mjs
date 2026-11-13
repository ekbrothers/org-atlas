// Builds the in-memory model (organization, business units, teams, people)
// from parsed data files, and reports reference and vocabulary problems.
//
// A data file holds either one entity:
//     kind: team
//     id: payments-core
//     ...
// or several entities of one kind:
//     kind: person
//     items:
//       - id: ...
//
// This is the first slice of the Phase 1 model. Solutions, platforms and
// typed relationships are added next.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { ROOT } from './config.mjs';

const KINDS = ['organization', 'business-unit', 'team', 'person'];

export function loadVocab() {
  const raw = parse(readFileSync(resolve(ROOT, 'engine/vocab/people.yaml'), 'utf8'));
  const index = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  return {
    tiers: raw.tiers,
    disciplines: raw.disciplines,
    employment: raw.employment,
    teamTypes: raw['team-types'],
    tier: index(raw.tiers),
    discipline: index(raw.disciplines),
    employmentById: index(raw.employment),
    teamType: index(raw['team-types']),
  };
}

export function buildModel(files, vocab = loadVocab()) {
  const errors = [];
  const warnings = [];
  const byKind = Object.fromEntries(KINDS.map((k) => [k, new Map()]));

  // 1. Collect entities
  for (const { rel, doc } of files) {
    if (!doc || typeof doc !== 'object') continue;
    const kind = doc.kind;
    if (!kind) {
      warnings.push({ rel, message: 'File has no `kind`, skipped.' });
      continue;
    }
    if (!KINDS.includes(kind)) {
      warnings.push({ rel, message: `Kind "${kind}" is not supported yet, skipped.` });
      continue;
    }
    const items = Array.isArray(doc.items) ? doc.items : [doc];
    for (const item of items) {
      const entity = { ...item, kind, _file: rel };
      delete entity.items;
      if (!entity.id) {
        errors.push({ rel, message: `A ${kind} is missing an \`id\`.` });
        continue;
      }
      if (byKind[kind].has(entity.id)) {
        errors.push({ rel, message: `Duplicate ${kind} id "${entity.id}" (also in ${byKind[kind].get(entity.id)._file}).` });
        continue;
      }
      byKind[kind].set(entity.id, entity);
    }
  }

  const orgs = [...byKind.organization.values()];
  const units = byKind['business-unit'];
  const teams = byKind.team;
  const people = byKind.person;

  if (orgs.length > 1) errors.push({ rel: orgs[1]._file, message: 'Only one organization is allowed.' });
  const organization = orgs[0] ?? { id: 'org', name: 'Organization' };

  const ref = (entity, field, map, label) => {
    const id = entity[field];
    if (id == null) return null;
    const target = map.get(id);
    if (!target) errors.push({ rel: entity._file, message: `${entity.kind} "${entity.id}": ${field} "${id}" is not a known ${label}.` });
    return target ?? null;
  };

  // 2. People: vocabulary and defaults
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

  // 3. Business units
  for (const u of units.values()) {
    u.leadPerson = ref(u, 'lead', people, 'person');
    u.teams = [];
  }

  // 4. Teams
  for (const t of teams.values()) {
    t.unit = ref(t, 'parent', units, 'business unit');
    if (t.type && !vocab.teamType[t.type]) errors.push({ rel: t._file, message: `team "${t.id}": unknown type "${t.type}".` });
    t.leadPerson = ref(t, 'lead', people, 'person');
    t.members = [];
    t.unit?.teams.push(t);
  }

  // 5. Memberships
  for (const p of people.values()) {
    for (const m of p.memberships) {
      const team = teams.get(m.team);
      if (!team) {
        errors.push({ rel: p._file, message: `person "${p.id}": team "${m.team}" is not a known team.` });
        continue;
      }
      team.members.push({ person: p, primary: !!m.primary, role: m.role ?? p.role ?? null });
      p.teamRefs.push({ team, primary: !!m.primary, role: m.role ?? null });
    }
  }
  if (organization.lead) organization.leadPerson = people.get(organization.lead) ?? null;

  // 6. Sorting and warnings
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
    if (!p.memberships.length && !isLeaderOfSomething(p, units, organization))
      warnings.push({ rel: p._file, message: `person "${p.id}" is not on any team.` });
  }

  const unitList = [...units.values()].sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name));
  for (const u of unitList) u.teams.sort((a, b) => (a.order ?? 99) - (b.order ?? 99) || a.name.localeCompare(b.name));

  return {
    organization,
    units: unitList,
    teams: [...teams.values()],
    people: [...people.values()],
    team: (id) => teams.get(id),
    unassignedTeams: [...teams.values()].filter((t) => !t.unit),
    errors,
    warnings,
  };
}

function isLeaderOfSomething(p, units, organization) {
  return organization.lead === p.id || [...units.values()].some((u) => u.lead === p.id);
}

// Headcount for a team. `filled` counts people whose primary team this is;
// shared members (primary team elsewhere) and open positions are counted separately.
export function headcount(team) {
  const open = team.members.filter((m) => m.person.employment === 'vacancy').length;
  const shared = team.members.filter((m) => !m.primary && m.person.employment !== 'vacancy').length;
  return { filled: team.members.length - open - shared, shared, open };
}
