// Generates the JSON Schema for Org Atlas data files from the vocabulary files,
// so the schema always matches what the engine accepts.
//
// Used by `npm run validate` (with Ajv), written to schema/atlas.schema.json by
// `npm run schema`, and published with the site for editors and LLMs.

import { ENTITY_KINDS, loadVocab } from './model.mjs';

const ID = { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._-]*$', description: 'Stable identifier: lowercase letters, digits, dots, dashes or underscores, e.g. "payments-core".' };
const REF_KINDS = [...ENTITY_KINDS, 'solution'];
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
      const attrs = Object.fromEntries((t.attributes ?? []).map((a) => [a, { type: 'string' }]));
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
    application: strict({ ...tech, type: { enum: ['application', 'solution', 'service', 'product'] }, ...inlineFields('application') }, ['id', 'name']),
    relationship: {
      type: 'object',
      properties: {
        kind: { type: 'string' },
        type: { enum: relTypeNames, description: 'Relationship type. See engine/vocab/relationships.yaml.' },
        from: REF,
        to: REF,
        scope: { type: 'string', description: 'Which part this covers, e.g. for shared ownership.' },
        purpose: { type: 'string', description: 'Why an application uses a platform.' },
        note: { type: 'string' },
      },
      required: ['type', 'from', 'to'],
      additionalProperties: false,
    },
  };

  const kindEnum = [...ENTITY_KINDS, 'solution', 'relationship'];
  const kindDef = (k) => (k === 'solution' ? 'application' : k);

  // A bundle entity must carry `kind`; dispatch on it.
  const bundleEntity = {
    type: 'object',
    required: ['kind'],
    properties: { kind: { enum: [...ENTITY_KINDS, 'solution'] } },
    allOf: [...ENTITY_KINDS, 'solution'].map((k) => ({
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
