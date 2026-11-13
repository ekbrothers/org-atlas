#!/usr/bin/env node
// Generates the Meridian Dynamics demo dataset into examples/meridian/data.
// Meridian Dynamics and everyone in it are fictional.
//
// Deterministic: the same seed always produces the same files, so the
// committed YAML only changes when this script changes.
//
//   node examples/meridian/generate.mjs

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'data');

// Small seeded PRNG (mulberry32)
let seed = 20261113;
function rand() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));

const FIRST = [
  'Aisha', 'Ben', 'Carmen', 'Dev', 'Elena', 'Femi', 'Grace', 'Hiro', 'Ines', 'Jonah', 'Kavya', 'Liam', 'Mei', 'Nikhil',
  'Olivia', 'Pablo', 'Quinn', 'Rosa', 'Samir', 'Tara', 'Umar', 'Vera', 'Wes', 'Ximena', 'Yusuf', 'Zoe', 'Andre', 'Bianca',
  'Chidi', 'Dana', 'Emeka', 'Farah', 'Gabe', 'Hana', 'Ivan', 'Jade', 'Kofi', 'Lena', 'Marco', 'Nadia', 'Owen', 'Priya',
  'Rafael', 'Sofia', 'Tomas', 'Uma', 'Victor', 'Wren', 'Yara', 'Zain', 'Amara', 'Bruno', 'Celine', 'Diego', 'Esther',
  'Felix', 'Gita', 'Hugo', 'Isla', 'Jamal', 'Keiko', 'Leo', 'Maya', 'Noah', 'Oona', 'Pedro', 'Rhea', 'Sean', 'Tess',
];
const LAST = [
  'Abara', 'Bergstrom', 'Castillo', 'Dimitrov', 'Eze', 'Fontaine', 'Gupta', 'Haddad', 'Ishikawa', 'Jensen', 'Kowalski',
  'Lindqvist', 'Moreau', 'Nakamura', 'Okafor', 'Petrov', 'Quintero', 'Rossi', 'Sato', 'Tanaka', 'Uddin', 'Vasquez',
  'Whitfield', 'Xu', 'Yilmaz', 'Zhang', 'Adeyemi', 'Brennan', 'Chowdhury', 'Delgado', 'Ekstrom', 'Farouk', 'Gallagher',
  'Holm', 'Iyer', 'Juarez', 'Kim', 'Laurent', 'Mensah', 'Novak', 'Oyelaran', 'Park', 'Reyes', 'Santos', 'Thorne', 'Varga',
  'Weiss', 'Yamamoto', 'Ziegler', 'Achebe', 'Bianchi', 'Cohen', 'Dubois', 'Esposito', 'Fischer', 'Greer', 'Hale',
];

const usedNames = new Set();
function personName() {
  for (;;) {
    const n = `${pick(FIRST)} ${pick(LAST)}`;
    if (!usedNames.has(n)) {
      usedNames.add(n);
      return n;
    }
  }
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const ROLE = {
  'software-engineering': ['Software Engineer', 'Senior Software Engineer', 'Software Engineer II'],
  sre: ['Site Reliability Engineer', 'Senior SRE'],
  infrastructure: ['Cloud Engineer', 'Senior Infrastructure Engineer', 'Network Engineer'],
  security: ['Security Engineer', 'Senior Security Engineer', 'Security Analyst'],
  data: ['Data Engineer', 'Analytics Engineer', 'Data Scientist'],
  architecture: ['Solution Architect', 'Enterprise Architect'],
  product: ['Product Manager', 'Senior Product Manager', 'Product Owner'],
  design: ['Product Designer', 'UX Researcher'],
  quality: ['QA Engineer', 'Test Automation Engineer'],
  program: ['Program Manager', 'Scrum Master', 'Release Manager'],
  'business-analysis': ['Business Analyst', 'Senior Business Analyst'],
  support: ['Service Desk Analyst', 'Application Support Analyst'],
  business: ['Operations Specialist', 'Finance Partner', 'HR Partner'],
};

const LEAD = {
  'software-engineering': 'Tech Lead', sre: 'SRE Lead', infrastructure: 'Infrastructure Lead', security: 'Security Lead',
  data: 'Data Engineering Lead', architecture: 'Lead Architect', product: 'Lead Product Manager', design: 'Design Lead',
  quality: 'QA Lead', program: 'Delivery Lead', 'business-analysis': 'Lead Business Analyst', support: 'Service Desk Lead',
  business: 'Operations Lead',
};
const PRINCIPAL = {
  'software-engineering': 'Principal Engineer', sre: 'Principal SRE', infrastructure: 'Principal Cloud Engineer',
  security: 'Principal Security Engineer', data: 'Principal Data Engineer', architecture: 'Principal Architect',
  quality: 'Principal Quality Engineer', support: 'Principal Support Engineer', 'business-analysis': 'Principal Business Analyst',
  product: 'Principal Product Manager', design: 'Principal Designer', program: 'Principal Program Manager', business: 'Principal Consultant',
};
const MANAGER_TITLE = {
  'stream-aligned': 'Engineering Manager', platform: 'Engineering Manager', 'complicated-subsystem': 'Engineering Manager',
  enabling: 'Practice Manager', 'shared-service': 'Service Manager',
};
const stripLevel = (r) => r.replace(/^Senior /, '').replace(/ II$/, '');

// Discipline mix by team type: [discipline, weight]
const MIX = {
  'stream-aligned': [['software-engineering', 6], ['quality', 1], ['product', 1], ['design', 1], ['business-analysis', 1], ['data', 1]],
  platform: [['infrastructure', 4], ['sre', 3], ['software-engineering', 2], ['security', 1]],
  enabling: [['architecture', 3], ['security', 2], ['software-engineering', 1], ['program', 1]],
  'complicated-subsystem': [['data', 4], ['software-engineering', 3], ['quality', 1]],
  'shared-service': [['support', 3], ['business-analysis', 2], ['software-engineering', 2], ['business', 1]],
};
function weighted(list) {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [v, w] of list) if ((r -= w) < 0) return v;
  return list[0][0];
}

// Structure. Order controls left-to-right placement on the org chart.
const UNITS = [
  {
    name: 'Office of the CEO', short: 'ceo', lead: { title: 'Chief Executive Officer', discipline: 'business' },
    description: 'Executive leadership and corporate strategy.',
    teams: [],
  },
  {
    name: 'Financial Services', short: 'fs', lead: { title: 'President, Financial Services', discipline: 'business' },
    description: 'Payments, lending and digital banking products.',
    teams: [
      ['Payments Core', 'stream-aligned', 'Card and real-time payment processing.'],
      ['Lending Platform', 'stream-aligned', 'Loan origination and servicing.'],
      ['Fraud & Risk Analytics', 'complicated-subsystem', 'Fraud scoring models and risk analytics.'],
      ['Digital Banking Apps', 'stream-aligned', 'Web and mobile banking experiences.'],
    ],
  },
  {
    name: 'Retail & Commerce', short: 'rc', lead: { title: 'President, Retail & Commerce', discipline: 'business' },
    description: 'Online storefronts, ordering and supply chain.',
    teams: [
      ['Storefront', 'stream-aligned', 'Customer-facing commerce sites.'],
      ['Order Management', 'stream-aligned', 'Orders, fulfilment and returns.'],
      ['Pricing & Promotions', 'stream-aligned', 'Pricing engine and promotional campaigns.'],
      ['Supply Chain Integration', 'stream-aligned', 'Supplier and logistics integrations.'],
    ],
  },
  {
    name: 'Healthcare', short: 'hc', lead: { title: 'President, Healthcare', discipline: 'business' },
    description: 'Claims, member services and clinical data.',
    teams: [
      ['Claims Processing', 'stream-aligned', 'Claims intake, adjudication and payment.'],
      ['Member Portal', 'stream-aligned', 'Member self-service portal and apps.'],
      ['Clinical Data', 'complicated-subsystem', 'Clinical data exchange and analytics.'],
    ],
  },
  {
    name: 'Technology Shared Services', short: 'tss', lead: { title: 'Chief Technology Officer', discipline: 'architecture' },
    description: 'Platforms, security and services used by every business unit.',
    teams: [
      ['Cloud Platform', 'platform', 'Landing zones, Kubernetes and developer platform.'],
      ['Site Reliability Engineering', 'platform', 'Observability, incident response and on-call.'],
      ['Data Platform', 'platform', 'Warehouse, streaming and data tooling.'],
      ['Identity & Access', 'platform', 'Workforce and customer identity.'],
      ['Security Engineering', 'enabling', 'Secure engineering practices and tooling.'],
      ['Enterprise Architecture', 'enabling', 'Architecture standards and review board.'],
      ['IT Service Desk', 'shared-service', 'Level 1 support for all employees.'],
    ],
  },
  {
    name: 'Corporate Functions', short: 'corp', lead: { title: 'Chief Financial Officer', discipline: 'business' },
    description: 'Finance, people and legal technology.',
    teams: [
      ['Finance Systems', 'shared-service', 'ERP, general ledger and financial reporting.'],
      ['HR Technology', 'shared-service', 'HR systems and workforce data.'],
      ['Legal & Compliance Tech', 'shared-service', 'Contract, policy and compliance tooling.'],
    ],
  },
];

const people = new Map(); // teamId -> person[]
const add = (teamId, p) => {
  if (!people.has(teamId)) people.set(teamId, []);
  people.get(teamId).push(p);
  return p;
};
const newId = (name) => {
  let id = slug(name);
  let n = 2;
  const all = new Set([...people.values()].flat().map((p) => p.id));
  while (all.has(id)) id = `${slug(name)}-${n++}`;
  return id;
};

const units = [];
const teams = [];

// Executive leadership team: CEO plus every BU lead (their primary home).
const execTeamId = 'executive-leadership';
const ceoName = personName();
const ceo = add(execTeamId, {
  id: newId(ceoName), name: ceoName, role: 'Chief Executive Officer', tier: 'executive',
  discipline: 'business', employment: 'fte', memberships: [{ team: execTeamId, primary: true }],
});

UNITS.forEach((u, i) => {
  const unitId = u.short;
  let lead = ceo;
  if (u.short !== 'ceo') {
    const name = personName();
    lead = add(execTeamId, {
      id: newId(name), name, role: u.lead.title, tier: 'executive', discipline: u.lead.discipline,
      employment: 'fte', memberships: [{ team: execTeamId, primary: true }],
    });
  }
  units.push({ id: unitId, name: u.name, lead: lead.id, order: i, description: u.description });

  if (u.short === 'ceo') {
    teams.push({
      id: execTeamId, name: 'Executive Leadership', parent: unitId, type: 'leadership', lead: ceo.id, order: 0,
      description: 'The CEO and the heads of each business unit.',
    });
  }

  u.teams.forEach(([teamName, type, description], j) => {
    const id = slug(teamName);
    const size = type === 'enabling' ? between(3, 5) : between(5, 9);
    const roster = [];

    // Manager
    const mgrName = personName();
    const interimLead = rand() < 0.1;
    const mgr = add(id, {
      id: newId(mgrName), name: mgrName,
      role: `${interimLead ? 'Interim ' : ''}${MANAGER_TITLE[type]}, ${teamName}`,
      tier: 'manager', discipline: MIX[type][0][0],
      employment: interimLead ? 'interim' : 'fte', memberships: [{ team: id, primary: true }],
    });
    roster.push(mgr);

    // Lead / principal
    if (size >= 5) {
      const n = personName();
      const d = weighted(MIX[type]);
      roster.push(add(id, { id: newId(n), name: n, role: LEAD[d], tier: 'team-lead', discipline: d, employment: 'fte', memberships: [{ team: id, primary: true }] }));
    }
    if (rand() < 0.35 || type === 'enabling') {
      const n = personName();
      const d = type === 'enabling' ? 'architecture' : weighted(MIX[type]);
      roster.push(add(id, { id: newId(n), name: n, role: PRINCIPAL[d], tier: 'principal', discipline: d, employment: 'fte', memberships: [{ team: id, primary: true }] }));
    }

    // Individual contributors
    while (roster.length < size) {
      const d = weighted(MIX[type]);
      const r = rand();
      const employment =
        id === 'it-service-desk' && r < 0.4 ? 'vendor' : r < 0.12 ? 'contractor' : r < 0.16 ? 'intern' : 'fte';
      const n = personName();
      roster.push(
        add(id, {
          id: newId(n), name: n,
          role: employment === 'intern' ? `${stripLevel(pick(ROLE[d]))} Intern` : pick(ROLE[d]),
          tier: 'ic', discipline: d, employment, memberships: [{ team: id, primary: true }],
        }),
      );
    }

    // Open position
    if (rand() < 0.4) {
      const d = weighted(MIX[type]);
      add(id, { id: `${id}-open-${pick(['senior', 'mid', 'lead'])}`, role: pick(ROLE[d]), tier: 'ic', discipline: d, employment: 'vacancy', memberships: [{ team: id, primary: true }] });
    }

    teams.push({ id, name: teamName, parent: unitId, type, lead: mgr.id, order: j, description });
  });
});

// Shared memberships: embedded specialists who belong to more than one team.
const share = (fromTeam, discipline, toTeam, role) => {
  const p = (people.get(fromTeam) ?? []).find((x) => x.discipline === discipline && x.tier !== 'manager' && x.employment !== 'vacancy');
  if (p) p.memberships.push({ team: toTeam, role });
};
share('enterprise-architecture', 'architecture', 'payments-core', 'Embedded architect');
share('enterprise-architecture', 'architecture', 'claims-processing', 'Embedded architect');
share('security-engineering', 'security', 'storefront', 'Security champion');
share('security-engineering', 'security', 'member-portal', 'Security champion');
share('data-platform', 'data', 'fraud-risk-analytics', 'Data platform liaison');
share('site-reliability-engineering', 'sre', 'payments-core', 'Embedded SRE');

// Write files
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'teams'), { recursive: true });
mkdirSync(join(OUT, 'people'), { recursive: true });

const header = '# Generated by examples/meridian/generate.mjs. Meridian Dynamics is fictional.\n';
const write = (rel, obj) => writeFileSync(join(OUT, rel), header + stringify(obj, { lineWidth: 0 }));

write('organization.yaml', {
  kind: 'organization', id: 'meridian', name: 'Meridian Dynamics', lead: ceo.id,
  description: 'A fictional diversified technology enterprise used to demonstrate Org Atlas.',
});
write('business-units.yaml', { kind: 'business-unit', items: units });
for (const u of units) {
  write(`teams/${u.id}.yaml`, { kind: 'team', items: teams.filter((t) => t.parent === u.id) });
}
for (const [teamId, list] of people) {
  write(`people/${teamId}.yaml`, { kind: 'person', items: list });
}

const total = [...people.values()].flat().length;
console.log(`Meridian Dynamics: ${units.length} business units, ${teams.length} teams, ${total} people -> ${OUT}`);
