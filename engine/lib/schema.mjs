// Generates the JSON Schema for Org Atlas data files from the vocabulary files,
// so the schema always matches what the engine accepts.
//
// Used by `npm run validate` (with Ajv), written to schema/atlas.schema.json by
// `npm run schema`, and published with the site for editors and LLMs.

import { ENTITY_KINDS, KIND_ALIASES, loadVocab } from './model.mjs';

// Kinds accepted in files: canonical kinds plus their other names (e.g. application -> product).
const ALIAS_KINDS = Object.keys(KIND_ALIASES).filter((k) => ENTITY_KINDS.includes(KIND_ALIASES[k]) && /^[a-z-]+$/.test(k));

const ID = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]*$', description: 'Stable identifier: lowercase letters, digits, dots, dashes or underscores, e.g. "payments-core".' };
// Relationship attributes that hold lists; all others are strings.
const LIST_ATTRS = new Set(['environments', 'regions']);
const attrSchema = (a) =>
  LIST_ATTRS.has(a) ? { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] } : { type: 'string' };

const REF = {
  type: 'string',
  minLength: 1,
  description: 'Reference to another entity: "kind:id" (e.g. "team:payments-core", "person:jo-lindqvist", "platform:snowflake"). A bare id uses the default kind for the field.',
};

export function buildSchema(vocab = loadVocab()) {
  const enumOf = (list) => list.map((x) => x.id);
  const relTypeNames = [...new Set(vocab.relTypes.filter((t) => !t.structural).flatMap((t) => [t.id, ...(t.aliases ?? [])]))];
  const common = {
    id: ID,
    name: { type: 'string', minLength: 1, description: 'Display name.' },
    description: { type: 'string' },
    order: { type: 'number', description: 'Sort order among siblings (lower first).' },
    tags: { type: 'array', items: { type: 'string' } },
    links: { type: 'object', additionalProperties: { type: 'string' }, description: 'Named URLs, e.g. { "runbook": "https://..." }.' },
    meta: { type: 'object', description: 'Free-form extra data. Ignored by the engine.' },
    notes: {
      description:
        'Context notes: a string, or a list of strings or { text, author, date, tags, private }. Notes with private: true stay in the data (for LLMs and exports) but are never shown on the site.',
      anyOf: [
        { type: 'string' },
        {
          type: 'array',
          items: {
            anyOf: [
              { type: 'string' },
              {
                type: 'object',
                properties: {
                  text: { type: 'string', minLength: 1 },
                  author: { type: 'string' },
                  date: { type: 'string', description: 'ISO date, e.g. 2026-11-13.' },
                  tags: { type: 'array', items: { type: 'string' } },
                  private: { type: 'boolean' },
                },
                required: ['text'],
                additionalProperties: false,
              },
            ],
          },
        },
      ],
    },
  };
  const strict = (properties, required = ['id']) => ({
    type: 'object',
    properties: { kind: { type: 'string' }, ...common, ...properties },
    required,
    patternProperties: { '^x-': {} },
    additionalProperties: false,
  });

  // Inline relationship fields, generated from the registry.
  const inlineFields = (kind) => {
    const fields = {};
    for (const t of vocab.relTypes) {
      const attrs = Object.fromEntries((t.attributes ?? []).map((a) => [a, attrSchema(a)]));
      const item = {
        anyOf: [
          REF,
          { type: 'object', properties: { ref: REF, id: REF, ...attrs }, additionalProperties: false, anyOf: [{ required: ['ref'] }, { required: ['id'] }] },
        ],
      };
      const field = (desc) => ({ description: desc, anyOf: [item, { type: 'array', items: item }] });
      if (t.inline && t.to.includes(kind))
        fields[t.inline] = field(`${t.label} (relationship "${t.id}"): ${t.description} Bare ids are ${t['default-from']} ids.`);
      if (t['inline-on-source'] && t.from.includes(kind))
        fields[t['inline-on-source']] = field(`${t.label} (relationship "${t.id}"): ${t.description} Bare ids are ${t['default-to']} ids.`);
    }
    return fields;
  };

  const tech = {
    logo: { type: 'string', pattern: '^(si|octicon|custom):.+$', description: 'si:<simple-icons slug> (brand logo), octicon:<name> (generic icon) or custom:<file name in the icons dir>.' },
    category: { type: 'string', description: 'Free text, e.g. data, devops, infrastructure, observability, security, identity, integration, collaboration, business.' },
    vendor: { type: 'string' },
    hosting: { enum: ['saas', 'cloud', 'self-hosted', 'on-prem', 'hybrid'] },
    criticality: { enum: ['T0', 'T1', 'T2', 'T3'], description: 'T0 is most critical.' },
    lifecycle: { enum: ['planned', 'pilot', 'active', 'contained', 'deprecated', 'sunset'] },
    proprietary: { type: 'boolean', description: 'Built in-house.' },
    stack: {
      type: 'array',
      description:
        'Technologies it is built with, one or more, e.g. ["python", "streamlit"]. Known ids get a logo (see engine/vocab/technologies.yaml); any other value is shown as text.',
      items: {
        anyOf: [
          { type: 'string', minLength: 1 },
          {
            type: 'object',
            properties: { id: { type: 'string' }, tech: { type: 'string' }, version: { type: 'string' }, note: { type: 'string' } },
            anyOf: [{ required: ['id'] }, { required: ['tech'] }],
            additionalProperties: false,
          },
        ],
      },
    },
  };

  const defs = {
    organization: strict({ lead: { ...REF, description: 'Person id of the top leader.' } }, ['id', 'name']),
    'business-unit': strict({ lead: { ...REF, description: 'Person id.' }, parent: { type: 'string', description: 'Organization id (optional).' } }, ['id', 'name']),
    team: strict(
      {
        parent: { type: 'string', description: 'Business unit id.' },
        type: { enum: enumOf(vocab.teamTypes) },
        lead: { type: 'string', description: 'Person id of the team lead.' },
        contacts: { type: 'object', additionalProperties: { type: 'string' } },
        ...inlineFields('team'),
      },
      ['id', 'name'],
    ),
    person: strict({
      role: { type: 'string', description: 'Free-text role, in their own words.' },
      tier: { enum: enumOf(vocab.tiers) },
      discipline: { enum: enumOf(vocab.disciplines) },
      employment: { enum: enumOf(vocab.employment) },
      location: { type: 'string' },
      memberships: {
        type: 'array',
        description: 'Teams this person belongs to. Mark one as primary.',
        items: {
          anyOf: [
            { type: 'string', description: 'Team id.' },
            {
              type: 'object',
              properties: { team: { type: 'string' }, primary: { type: 'boolean' }, role: { type: 'string', description: 'Role on this team, if different.' } },
              required: ['team'],
              additionalProperties: false,
            },
          ],
        },
      },
    }),
    platform: strict({ ...tech, ...inlineFields('platform') }, ['id', 'name']),
    product: strict({ ...tech, type: { enum: ['product', 'application', 'solution', 'service', 'data-product', 'model', 'ml-model'] },
      parent: { type: 'string', description: 'Product id this product sits inside, e.g. a model inside the product that uses it.' },
      version: { type: 'string', description: 'Version, e.g. a model version "3.2".' }, ...inlineFields('product') }, ['id', 'name']),
    persona: strict(
      {
        internal: { type: 'boolean', description: 'true for staff (e.g. claims adjusters), false for outside users (e.g. customers, suppliers).' },
        size: { type: 'string', description: 'Rough size, e.g. "4.2M" or "350 agents".' },
        icon: { type: 'string', description: 'Octicon name. Defaults to people (internal) or globe (external).' },
      },
      ['id', 'name'],
    ),
    committee: strict(
      {
        type: { enum: enumOf(vocab.committeeTypes) },
        purpose: { type: 'string', description: 'What the committee decides or advises on.' },
        cadence: { type: 'string', description: 'How often it meets, e.g. weekly, monthly, quarterly.' },
        chair: { type: 'string', description: 'Person id of the chair (added to members automatically).' },
        members: {
          type: 'array',
          description: 'Seats on the committee.',
          items: {
            anyOf: [
              { type: 'string', description: 'Person id (role: member).' },
              {
                type: 'object',
                properties: {
                  person: { type: 'string' },
                  role: { enum: enumOf(vocab.seatRoles) },
                  representing: { type: 'string', description: 'Team (or "kind:id") this seat represents.' },
                  note: { type: 'string' },
                },
                required: ['person'],
                additionalProperties: false,
              },
            ],
          },
        },
        ...inlineFields('committee'),
      },
      ['id', 'name'],
    ),
    relationship: {
      type: 'object',
      properties: {
        kind: { type: 'string' },
        type: { enum: relTypeNames, description: 'Relationship type. See engine/vocab/relationships.yaml.' },
        from: REF,
        to: REF,
        scope: { type: 'string', description: 'Which part this covers, e.g. for shared ownership.' },
        purpose: { type: 'string', description: 'Why a product uses a platform.' },
        environments: { ...attrSchema('environments'), description: 'Environments for deployed-to, e.g. ["production", "staging"].' },
        regions: { ...attrSchema('regions'), description: 'Regions for deployed-to, e.g. ["us-east", "eu-west"].' },
        note: { type: 'string' },
      },
      required: ['type', 'from', 'to'],
      additionalProperties: false,
    },
  };

  const kindEnum = [...ENTITY_KINDS, ...ALIAS_KINDS, 'relationship'];
  const kindDef = (k) => KIND_ALIASES[k] ?? k;

  // A bundle entity must carry `kind`; dispatch on it.
  const bundleEntity = {
    type: 'object',
    required: ['kind'],
    properties: { kind: { enum: [...ENTITY_KINDS, ...ALIAS_KINDS] } },
    allOf: [...ENTITY_KINDS, ...ALIAS_KINDS].map((k) => ({
      if: { properties: { kind: { const: k } }, required: ['kind'] },
      then: { $ref: `#/definitions/${kindDef(k)}` },
    })),
  };

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'https://github.com/ekbrothers/org-atlas/schema/atlas.schema.json',
    title: 'Org Atlas data file',
    description:
      'One Org Atlas data file (YAML or JSON). Either a bundle { atlas: 1, entities: [...], relationships: [...] }, a list { kind, items: [...] }, or a single entity { kind, id, ... }.',
    definitions: { ...defs, bundleEntity },
    type: 'object',
    allOf: [
      {
        if: { anyOf: [{ required: ['entities'] }, { required: ['atlas'] }] },
        then: {
          properties: {
            atlas: { const: 1, description: 'Bundle format version.' },
            entities: { type: 'array', items: { $ref: '#/definitions/bundleEntity' } },
            relationships: { type: 'array', items: { $ref: '#/definitions/relationship' } },
          },
          additionalProperties: false,
        },
        else: {
          required: ['kind'],
          properties: { kind: { enum: [...kindEnum, 'relationships'] } },
          allOf: [...kindEnum, 'relationships'].map((k) => ({
            if: { properties: { kind: { const: k } }, required: ['kind'] },
            then: {
              if: { required: ['items'] },
              then: {
                properties: { kind: true, items: { type: 'array', items: { $ref: `#/definitions/${k === 'relationships' ? 'relationship' : kindDef(k)}` } } },
                additionalProperties: false,
              },
              else: { $ref: `#/definitions/${k === 'relationships' ? 'relationship' : kindDef(k)}` },
            },
          })),
        },
      },
    ],
  };
}
