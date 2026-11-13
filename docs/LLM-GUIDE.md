# Building charts with an LLM

Org Atlas charts are plain data, so any LLM can write them. The quickest route is the ready-made **authoring agent** in [`agent/org-atlas-agent.md`](../agent/org-atlas-agent.md): use it as the system prompt, or [`agent/tool.json`](../agent/tool.json) as a tool definition. It is generated from the vocabulary, so it is always complete and current. Setup steps for each tool are in [`agent/README.md`](../agent/README.md). The rest of this page explains the format by hand.

 The recommended format is a **bundle**: one JSON file holding every entity and relationship. Drop it into `data/`, run `npm run validate`, and the site builds from it.

## The workflow

1. **Give the LLM the rules.** Paste the prompt below, plus the schema (`schema/atlas.schema.json`, also published at `<your site>/schema/atlas.schema.json`).
2. **Describe your organization** in plain words, or paste source material (an org list, a spreadsheet export, a list of platforms and owners).
3. **Save the answer** as `data/atlas.json`.
4. **Validate:** `npm run validate -- data/atlas.json`. Send any errors back to the LLM and ask it to fix them. `npm run validate -- --json data/atlas.json` returns the result as JSON, which works well for automated tool loops.
5. **Preview:** `npm run dev`.

To **change an existing chart**, the simplest route is the **context pack**: `npm run export -- --pack --out atlas-pack.json` writes one JSON with the instructions, schema, full vocabulary and all current data. Give the LLM that single file plus your request ("add a Data Science team that owns these two models", "draw who supports Snowflake"), and save what it returns in `data/`. A returned pack or bundle can be dropped in as is. For smaller context windows use `--slim` (no schema, minified). `npm run export -- --out current.json` gives just the data.

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
    { "kind": "product", "id": "revenue-reports", "name": "Revenue Reports", "logo": "octicon:graph" }
  ],
  "relationships": [
    { "from": "team:data-eng", "type": "owner", "to": "platform:snowflake" },
    { "from": "team:data-eng", "type": "owner", "to": "product:revenue-reports" },
    { "from": "product:revenue-reports", "type": "uses", "to": "platform:snowflake", "purpose": "Warehouse" }
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
| `product` | `id`, `name` | as platform, plus `type` (product, application, solution, service, data-product, model), `parent` (another product id, for nesting such as a model inside a product), `version`, `stack`. `application` and `solution` are accepted as other names for this kind |
| `persona` | `id`, `name` | `internal` (false for customers, suppliers and other outside users), `size`, `icon` |
| `committee` | `id`, `name` | `type`, `purpose`, `cadence`, `chair` (person id), `members` (person ids or `{ person, role, representing }`) |

Every entity also accepts `description`, `tags`, `links` (named URLs), `order`, `meta` (free-form) and `notes` (context: a string, or a list of `{ text, author, date, tags, private }`; private notes never appear on the site). Unknown fields are rejected so typos are caught; prefix your own fields with `x-` to keep them.

Allowed values for `tier`, `discipline`, `employment`, team `type`, `hosting`, `criticality` and `lifecycle` are listed in the schema and on the site's **Legend** page.

## Relationships

Each relationship is `{ "from": "kind:id", "type": "...", "to": "kind:id" }`, with optional `scope`, `purpose` or `note`. Every type, what it means and which kinds it connects is on the site's **Relationships** page and in [`engine/vocab/relationships.yaml`](../engine/vocab/relationships.yaml).

| Type | From | To | Meaning |
|---|---|---|---|
| `owner` | team, person | platform, product | Accountable. **Several owners = shared ownership**; give each a `scope` |
| `supporting` | team, person | platform, product | Does real work on it without being accountable |
| `operator` | team, person | platform, product | Runs it day to day or holds the pager |
| `stakeholder` | person, team | platform, product | Affected by changes |
| `sponsor` | person, team | platform, product | Funds or champions it |
| `sme` | person, team | platform, product | Subject-matter expert |
| `escalation` | person, team, committee | platform, product | Who to escalate to |
| `governs` | committee | platform, product, team | Sets standards or policy for it |
| `advises` | committee, person, team | platform, product, team, committee | Advises without decision rights |
| `approver` | committee, person, team | platform, product | Must approve changes or releases |
| `itlt-alignment` | person, committee | product, platform, team | The IT Leadership Team member it is aligned to (inline: `itlt`) |
| `reports-to` | committee | committee, person, team, business-unit | Where the committee reports |
| `user` | persona, team, business-unit, person, committee | product, platform | Uses it day to day |
| `deployed-to` | product | platform | Where the product is deployed and runs (`environments`, `regions` as lists) |
| `uses` | product | platform | The product uses the platform, e.g. a database or identity provider (`purpose`) |
| `depends-on` | product | product | The product needs another product |
| `built-on` | platform | platform | A platform built on another platform |

Team membership, leads, business units and committee seats are **not** relationships: set them with `memberships`, `lead`, `parent`, `chair` and `members`.

### Committees and boards

Committee types: review-board, change-advisory-board, steering-committee, governance-board, council, advisory-board, community-of-practice, center-of-excellence, working-group. Seat roles: chair, vice-chair, secretary, voting-member, member, advisor, observer.

```json
{ "kind": "committee", "id": "architecture-review-board", "name": "Architecture Review Board",
  "type": "review-board", "cadence": "Every two weeks", "chair": "maya-zhang",
  "members": [ { "person": "bruno-thorne", "role": "secretary" }, { "person": "rhea-thorne", "role": "voting-member", "representing": "cloud-platform" } ],
  "governs": [ { "ref": "platform:kubernetes", "scope": "Architecture standards" } ],
  "advises": ["payments-core"], "reports-to": ["person:nikhil-kim"] }
```

### Deployments

```json
{ "from": "product:storefront-web", "type": "deployed-to", "to": "platform:kubernetes",
  "environments": ["production", "staging"], "regions": ["us-east", "eu-west"] }
```

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
- Kinds: organization (exactly one), business-unit, team, person, platform, product, committee.
- Teams: "parent" is a business-unit id, "lead" is a person id.
- People: "role" is free text. "tier" is one of executive, senior-leader, manager,
  team-lead, principal, ic. "memberships" lists team ids; mark one
  { "team": "...", "primary": true } if they are on several teams.
  An open position is a person with "employment": "vacancy" and no "name".
- Relationships use "kind:id" at both ends, e.g.
  { "from": "team:data-platform", "type": "owner", "to": "platform:snowflake" }.
  Types: owner, supporting, operator, stakeholder, sponsor, sme, escalation
  (team/person -> platform/product), uses (product -> platform),
  deployed-to (product -> platform, with "environments" and "regions" lists),
  depends-on (product -> product), built-on (platform -> platform),
  governs / advises / approver / reports-to (committee -> ...).
- Committees: "chair" is a person id, "members" are person ids or
  { "person": "...", "role": "voting-member", "representing": "team-id" }.
- Shared ownership: add one "owner" relationship per owning team, each with a
  "scope" saying what that team owns.
- Every platform and product should have at least one owner.
- Logos: "si:<simpleicons slug>" for well-known products, "octicon:<name>" for
  generic or unknown ones, "custom:<name>" only if told a custom SVG exists.
- Do not invent people's names. If names are not given, use roles such as
  "Data Engineer 1", or model the seat as a vacancy.

Here is the organization to model:
<describe the business units, teams, people, platforms, products and who owns,
supports and uses what>
````

## Tips

- Ask for **one business unit at a time** for large organizations, then merge the bundles (several bundle files in `data/` work fine, as long as ids are unique).
- Keep ids stable between runs so links and history stay meaningful.
- The `scope` on shared ownership is what makes the chart useful: "Administration and runners" versus "Security policies" says who to call.
