# Org Atlas: Project Plan

This is the consolidated plan (v6). It is a living document: decisions are recorded here as they are made.

## 1. Purpose

A toolkit that anyone can clone to map a **technical enterprise** (roughly 500 to 20,000 people), both organizationally and technically:

- business units, departments, teams and people
- solutions, capabilities, platforms, systems and components
- the relationships between them (owner, supporting, stakeholder, and many more)

All of it is described as YAML and rendered as an interactive, filterable site deployed to GitHub Pages. The upstream repository contains only the engine and fictional demo data. No real company data is ever committed here.

**Audience:** technical users (engineers, architects, IT leaders) who are comfortable with YAML and git. There is no visual editor.

## 2. Decisions

| Topic | Decision |
|---|---|
| Distribution | One repository. Clone it, run it locally, push it, and GitHub Actions deploys to Pages |
| Stack | TypeScript, Astro (static site), Cytoscape.js (interactive graphs), JSON Schema (validation) |
| Updates | Engine-owned and user-owned files are separate. User files never exist upstream, so `git pull upstream main` never conflicts |
| Avatars | Every person uses the same `person` Octicon silhouette. No photos or initials |
| People in multiple teams | Shown in every team. Primary team shows them normally, others show a "shared" marker linking to the primary team |
| First public release | After Phase 4 (graph explorer, filters, semantic zoom) |
| License | MIT. Icon packs keep their own licenses |
| Default theme | "Navy & Gold": navy `#00274e`, gold accent `#f5b700`, warm off-white `#f7f6f2`, link blue `#23527c`, Figtree font, 4px corners, cards with a navy top border. Light and dark |
| Demo default | A fresh clone shows the Meridian Dynamics demo until `npm run init` is run |

## 3. Data model

### Entity kinds

| Layer | Kinds |
|---|---|
| Organizational | organization, business-unit, department, team, person, position, location, cost-center, legal-entity |
| Business | capability, solution, initiative, vendor, contract |
| Technical | platform, system, component, api, datastore, integration, environment |
| Governance | policy, control, review-board, risk |

Entity kinds are extensible: users can add their own (for example a `guild` that extends `team`) in `overrides/`. Hierarchy levels default to business unit > department > team and are configurable.

### Enterprise attributes (optional on technical entities)

`criticality` (T0 to T3), `lifecycle` (planned, pilot, active, contained, deprecated, sunset), `portfolio` (tolerate, invest, migrate, eliminate), `radar` (adopt, trial, assess, hold), `hosting`, `dr` (tier, RTO, RPO), `data-classification`, `compliance`, `cost-center`, `sla`, `links`, `region`.

### People

A person has three structured categories plus free text:

- **Tier:** executive, senior leader, manager, team lead, principal/architect, individual contributor
- **Discipline:** software engineering, SRE/operations, infrastructure/cloud, security, data/analytics, architecture, product management, design/UX, quality/test, program/project management, business analysis, support/service desk, business/non-technical
- **Employment:** full-time, contractor, vendor staff, intern, vacancy, interim
- **Role (free text):** the person's role in their own words, plus an optional per-team role on each membership

```yaml
kind: person
id: aisha-k
name: Aisha K.
role: "Engineering Manager, Payments & Fraud"
tier: manager
discipline: software-engineering
employment: fte
memberships:
  - team: payments-core
    primary: true
  - team: fraud-guild
    role: "Guild facilitator"
```

Only `name` is required. Categories can be renamed or extended in `overrides/`.

### Relationships

Relationship types are **data, not code**. Each type is defined in a vocabulary file with a label, inverse label, allowed source and target kinds, cardinality (for example "exactly one owner") and style. Aliases let an organization use its own words (`dri` for `owner`). Relationships also accept free-text `role` and `note`.

**Presets, in build order:**

| Preset | Contents |
|---|---|
| `core` | owner, supporting, stakeholder, sponsor, sme, operator, escalation, reports-to, dotted-line, member-of, depends-on, runs-on |
| `itsm` | service-owner, support-group (L1/L2/L3), change-approver, cab-member, on-call |
| `c4` | context/container/component kinds, uses, delivers-to |
| `raci` | responsible, accountable, consulted, informed |
| `team-topologies` | team types and interaction modes |
| `lifecycle` | replaces, migrating-to, deprecated-by, pilot-of |
| `vendor` | vendor-of, contract-owner, licensed-to, vendor-support |
| `data-governance` | data-owner, steward, custodian, producer, consumer |
| `security` (later) | ciso, biso, security-champion, control-owner, risk-owner |

## 4. Diagram language

- **Semantics are fixed:** accountability is always a solid line, support always dashed, awareness always dotted, and line weight means strength of responsibility. Every type also has a glyph and a text label, so meaning never depends on color alone.
- **Themes are swappable:** colors, glyph choices and light/dark values live in design tokens. It ships with default, high-contrast, print and primer themes.

### Person card

```
   [tier badge]       top-left: star-fill, star, people, person-fill, light-bulb (none for IC)
      ( person )      avatar: always the person silhouette
   ring               employment: solid FTE, dashed contractor, double vendor, dotted intern
            [discipline badge]   bottom-right: code, pulse, server, shield-lock, database...
```

Vacancies use `person-add` in an outlined style. Interims get a hatched ring and a `clock` badge. Relationship badges (owner `shield-check`, stakeholder `eye`, sponsor `rocket`, SME `mortar-board`, operator `bell`, escalation `alert`, approver `check-circle`) appear only in the context of the thing they relate to.

### Node encodings

Shape by entity kind, border style by lifecycle, corner badge by criticality, chips for compliance and hosting, and a red "unowned" stamp on anything without an owner.

## 5. Icons

| Set | Source | License |
|---|---|---|
| Octicons | `@primer/octicons` | MIT |
| Platform logos | `simple-icons` | CC0 (trademarks belong to their owners) |
| Cloud services | AWS, Azure and Google Cloud architecture icon sets | Vendor terms, downloaded at build time rather than committed |
| Custom | `overrides/icons/` | Yours |

Icons are referenced with one syntax (`octicon:shield`, `si:salesforce`, `aws:lambda`, `custom:checkout`), compiled to a sprite, listed in a searchable gallery, and checked in CI.

## 6. Views

| Priority | View |
|---|---|
| Must | Org chart, ownership map and "who do I talk to", graph explorer with filters, dependency graph and impact analysis |
| Should | Capability map, platform landscape, support model, risk and coverage dashboard, RACI matrix |
| Could | Tech radar, C4 drill-down, integration flows, time travel and quarter-over-quarter diff |

### Semantic zoom

| Level | Shows |
|---|---|
| Z0 Enterprise | Business units as tiles with counts and risk indicators |
| Z1 Business unit | Departments and teams with lead and headcount |
| Z2 Team | The team expanded: members grouped by tier, stakeholders in a ring outside the team boundary, owned and supported solutions, platform logos |
| Z3 Person | One person's card and all their relationships |

Interactions: scroll or pinch zoom with detail appearing at thresholds, double-click to drill in, breadcrumbs, minimap, search with "zoom to", deep links (`?focus=team:payments-core`), filters that persist through zoom, and a legend that adapts per level.

### Filtering

Facets for business unit, team, solution, platform, relationship type, criticality, compliance, lifecycle, hosting, location and employment type. Focus mode (N-hop neighborhood), path finder, URL-encoded state and saved views defined in YAML.

### Question catalog

The home page becomes "What do you want to know?": a searchable list of questions, each opening the right view pre-filtered. Questions are defined in YAML and users can add their own in `overrides/questions/`. Starting set:

- Who owns X, and who do I contact when it breaks?
- What breaks if platform Y goes down, and who gets paged?
- Which systems have no owner, or only one person who knows them?
- Which teams are overloaded with critical systems?
- What does business unit Z run, and on which platforms?
- Which solutions deliver which capabilities, and where are the gaps or overlaps?
- What should we invest in, tolerate, migrate or retire?
- Who is responsible, accountable, consulted and informed for each solution?
- What is the support path from service desk to vendor?
- Which systems are in scope for SOX/PCI, and who owns their controls?
- Which critical systems lack a DR tier?
- What still depends on deprecated platforms?
- What changed in the org or ownership this quarter?

## 7. Scale

- The explorer opens aggregated at business-unit level and expands on demand.
- Heavy layouts are precomputed at build time.
- Filters are applied before rendering; only the filtered subgraph is drawn.
- Many parallel edges collapse into one weighted edge until expanded.
- A performance budget for a 10,000-node demo is checked in CI.

## 8. Validation

Schema validation, referential integrity, and configurable business rules: one owner per solution, no reporting cycles, every team has a lead, no active dependency on a sunset system, every T0 system has a DR tier, orphan detection. Errors report `file:line`. Imported fields carry a `source:` tag so hand-curated data is never overwritten.

## 9. Demo data

**Meridian Dynamics**, a fictional enterprise of about 2,500 people: four business units (Financial Services, Retail & Commerce, Healthcare, Corporate Functions), shared services (Cloud Platform, SRE, Security, Data & Analytics, Enterprise Architecture, IT Service Desk, Identity), about 60 teams, 25 solutions, 120 components and 35 platforms. It includes deliberate problems (unowned systems, a bus-factor-1 T0 system, deprecated dependencies, an overloaded team) so the risk views have something to show. It is generated by a seeded script and can be scaled up for performance testing.

## 10. Phases

| Phase | Deliverable | Size | Status |
|---|---|---|---|
| 0. Foundations | Repo scaffold with engine/user split, Astro shell, `init`/`dev`/`validate`/`build`/`preview`, Pages workflow with automatic base path, README, this plan | Small | Done |
| 1. Schema and vocabulary | Entity schemas including person categories and free-text roles, vocabulary engine, `core` and `itsm` presets, full `validate`, Meridian generator, editor autocomplete | Large | In progress: org model, platforms, applications, relationship registry (accountability, technical, structural), shared ownership with scopes, JSON Schema + Ajv validation, bundle format, export, LLM guide, editor autocomplete done. Remaining: `itsm` preset, user overrides for vocabulary |
| 2. Design language and icons | Tokens, person card and badge system, icon pipeline, legend, icon gallery | Medium | In progress: person badges, relationship line styles, Simple Icons + Octicons + custom SVG logos, generated legend done. Remaining: design tokens file, icon gallery, cloud icon packs |
| 3. First views | Org chart, static team pages (Z2 layout), profile pages, ownership and "who do I talk to", search, question catalog | Medium | In progress: org chart (filters incl. platform/application, People view), team pages with responsibilities, platform and application pages with relationship maps, relationships page done. Remaining: person pages, site-wide search, question catalog |
| 4. Graph explorer | Semantic zoom Z0 to Z3, filters, breadcrumbs, minimap, deep links, impact analysis. **First public release** | Large | Planned |
| 5. Enterprise views | Capability map, platform landscape with cloud icon packs, support model, risk dashboard, RACI | Large | Planned |
| 6. Remaining presets | c4, raci, team-topologies, lifecycle, vendor, data-governance | Medium | Planned |
| 7. Architect views | Tech radar, C4 drill-down, integration flows, exports (SVG, PNG, Mermaid, CSV) | Medium | Planned |
| 8. Importers and adoption | Generic CSV mapper, Entra ID / Okta, ServiceNow, Backstage, CODEOWNERS, issue-form-to-PR, PR diff bot | Large | Planned |
| 9. Polish | Time travel, accessibility audit, visual regression tests, theming docs | Medium | Planned |

## 11. Open items

- The owner's own job-specific questions will be added to the question catalog when shared. Any the plan cannot answer become new features.
