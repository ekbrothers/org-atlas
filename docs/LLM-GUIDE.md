# Building charts with an LLM

Org Atlas charts are plain data, so any LLM can write them. The recommended format is a **bundle**: one JSON file holding every entity and relationship. Drop it into `data/`, run `npm run validate`, and the site builds from it.

## The workflow

1. **Give the LLM the rules.** Paste the prompt below, plus the schema (`schema/atlas.schema.json`, also published at `<your site>/schema/atlas.schema.json`).
2. **Describe your organization** in plain words, or paste source material (an org list, a spreadsheet export, a list of platforms and owners).
3. **Save the answer** as `data/atlas.json`.
4. **Validate:** `npm run validate -- data/atlas.json`. Send any errors back to the LLM and ask it to fix them. `npm run validate -- --json data/atlas.json` returns the result as JSON, which works well for automated tool loops.
5. **Preview:** `npm run dev`.

To **change an existing chart**, export everything as one bundle with `npm run export -- --out current.json`, give that to the LLM with your requested changes, and replace your data with what it returns.

## The bundle format

```json
{
  "atlas": 1,
  "entities": [
    { "kind": "organization", "id": "acme", "name": "Acme", "lead": "maria-chen" },
    { "kind": "business-unit", "id": "product", "name": "Product", "lead": "maria-chen" },
    { "kind": "team", "id": "data-eng", "name": "Data Engineering", "parent": "product", "type": "platform", "lead": "raj-patel" },
    { "kind": "person", "id": "raj-patel", "name": "Raj Patel", "role": "Data Engineering Lead", "tier": "team-lead", "discipline": "data", "memberships": ["data-eng"] },
    { "kind": "platform", "id": "snowflake", "name": "Snowflake", "logo": "si:snowflake", "category": "data", "criticality": "T1" },
    { "kind": "application", "id": "revenue-reports", "name": "Revenue Reports", "logo": "octicon:graph" }
  ],
  "relationships": [
    { "from": "team:data-eng", "type": "owner", "to": "platform:snowflake" },
    { "from": "team:data-eng", "type": "owner", "to": "application:revenue-reports" },
    { "from": "application:revenue-reports", "type": "uses", "to": "platform:snowflake", "purpose": "Warehouse" }
  ]
}
```

A complete working example is in [`examples/bundle/data/atlas.json`](../examples/bundle/data/atlas.json). To try it: `npm run init -- --starter bundle`.

## Entity kinds

| Kind | Required | Main fields |
|---|---|---|
| `organization` | `id`, `name` | `lead` (person id) |
| `business-unit` | `id`, `name` | `lead` (person id) |
| `team` | `id`, `name` | `parent` (business unit id), `type`, `lead` (person id) |
| `person` | `id`, and `name` unless `employment: vacancy` | `role` (free text), `tier`, `discipline`, `employment`, `memberships` |
| `platform` | `id`, `name` | `logo`, `category`, `vendor`, `hosting`, `criticality`, `lifecycle`, `proprietary` |
| `application` | `id`, `name` | as platform, plus `type` (application, solution, service, product) |

Every entity also accepts `description`, `tags`, `links` (named URLs), `order` and `meta` (free-form). Unknown fields are rejected so typos are caught; prefix your own fields with `x-` to keep them.

Allowed values for `tier`, `discipline`, `employment`, team `type`, `hosting`, `criticality` and `lifecycle` are listed in the schema and on the site's **Legend** page.

## Relationships

Each relationship is `{ "from": "kind:id", "type": "...", "to": "kind:id" }`, with optional `scope`, `purpose` or `note`. Every type, what it means and which kinds it connects is on the site's **Relationships** page and in [`engine/vocab/relationships.yaml`](../engine/vocab/relationships.yaml).

| Type | From | To | Meaning |
|---|---|---|---|
| `owner` | team, person | platform, application | Accountable. **Several owners = shared ownership**; give each a `scope` |
| `supporting` | team, person | platform, application | Does real work on it without being accountable |
| `operator` | team, person | platform, application | Runs it day to day or holds the pager |
| `stakeholder` | person, team | platform, application | Affected by changes |
| `sponsor` | person, team | platform, application | Funds or champions it |
| `sme` | person, team | platform, application | Subject-matter expert |
| `escalation` | person, team | platform, application | Who to escalate to |
| `uses` | application | platform | The application runs on or uses the platform (`purpose`) |
| `depends-on` | application | application | The application needs another application |
| `built-on` | platform | platform | A platform built on another platform |

Team membership, leads and business units are **not** relationships: set them with `memberships`, `lead` and `parent`.

## Logos

- `si:<slug>`: brand logo from [Simple Icons](https://simpleicons.org) (for example `si:snowflake`, `si:github`, `si:sonatype` for Nexus, `si:apachekafka`, `si:kubernetes`, `si:datadog`, `si:okta`). Some brands, including Salesforce, ServiceNow, Workday, AWS and Azure, are not in Simple Icons; use an Octicon or a custom SVG for those.
- `octicon:<name>`: a generic icon from [Octicons](https://primer.style/octicons/), for example `octicon:sync`, `octicon:database`, `octicon:browser`.
- `custom:<name>`: your own SVG at `overrides/icons/<name>.svg`, for proprietary platforms.

`npm run validate` reports any logo that does not exist.

## Prompt template

Copy this, fill in the last section, and attach `schema/atlas.schema.json`.

````text
You are generating data for Org Atlas, a tool that renders org charts and
platform ownership maps. Output ONE JSON object and nothing else, in this shape:

{ "atlas": 1, "entities": [ ... ], "relationships": [ ... ] }

Rules:
- Follow the attached JSON Schema exactly. Do not invent fields; use "x-" prefixed
  fields for anything extra.
- Every entity has "kind" and a stable "id" (lowercase, dashes, e.g. "data-platform").
- Kinds: organization (exactly one), business-unit, team, person, platform, application.
- Teams: "parent" is a business-unit id, "lead" is a person id.
- People: "role" is free text. "tier" is one of executive, senior-leader, manager,
  team-lead, principal, ic. "memberships" lists team ids; mark one
  { "team": "...", "primary": true } if they are on several teams.
  An open position is a person with "employment": "vacancy" and no "name".
- Relationships use "kind:id" at both ends, e.g.
  { "from": "team:data-platform", "type": "owner", "to": "platform:snowflake" }.
  Types: owner, supporting, operator, stakeholder, sponsor, sme, escalation
  (team/person -> platform/application), uses (application -> platform),
  depends-on (application -> application), built-on (platform -> platform).
- Shared ownership: add one "owner" relationship per owning team, each with a
  "scope" saying what that team owns.
- Every platform and application should have at least one owner.
- Logos: "si:<simpleicons slug>" for well-known products, "octicon:<name>" for
  generic or unknown ones, "custom:<name>" only if told a custom SVG exists.
- Do not invent people's names. If names are not given, use roles such as
  "Data Engineer 1", or model the seat as a vacancy.

Here is the organization to model:
<describe the business units, teams, people, platforms, applications and who owns,
supports and uses what>
````

## Tips

- Ask for **one business unit at a time** for large organizations, then merge the bundles (several bundle files in `data/` work fine, as long as ids are unique).
- Keep ids stable between runs so links and history stay meaningful.
- The `scope` on shared ownership is what makes the chart useful: "Administration and runners" versus "Security policies" says who to call.
