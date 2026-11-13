# Customizing Org Atlas

Everything about your organization is yours to define. There are three layers.

## 1. Your data: anything, in any combination

Business units, teams, people, personas, platforms, products and committees are your data. Create as many as you need, call them whatever you like, and connect them with any relationship. Files can be YAML or JSON, one per entity, one per kind, or one bundle with everything. See the [README](../README.md#describing-your-organization) and the [LLM guide](LLM-GUIDE.md).

The only rules: ids are unique per kind, references point at things that exist, and each relationship type joins the kinds it is defined for (for example, only a committee can `govern`). `npm run validate` tells you exactly what is wrong.

## 2. Your vocabulary: `overrides/vocab/`

The lists of allowed values (disciplines, team types, relationship types and so on) are defaults, not limits. Put one or more YAML files in `overrides/vocab/` and they are merged on top of the defaults. Upstream updates never touch that folder.

| Section | What it controls | Defaults in |
|---|---|---|
| `tiers` | Person tiers (executive, manager, IC...) | `engine/vocab/people.yaml` |
| `disciplines` | Person disciplines (software engineering, data science...) | `engine/vocab/people.yaml` |
| `employment` | Employment types (full-time, contractor, vacancy...) | `engine/vocab/people.yaml` |
| `team-types` | Team types (stream-aligned, platform...) | `engine/vocab/people.yaml` |
| `committee-types` | Committee types (review board, council...) | `engine/vocab/governance.yaml` |
| `seat-roles` | Committee seat roles (chair, voting member...) | `engine/vocab/governance.yaml` |
| `technologies` | Tech stack entries and their logos | `engine/vocab/technologies.yaml` |
| `technology-categories` | Groups for technologies | `engine/vocab/technologies.yaml` |
| `relationship-types` | Every relationship type, its meaning, line style and inline field | `engine/vocab/relationships.yaml` |

How merging works:

- **Same `id` as a default:** changes that item. Only the fields you give are replaced; `aliases` are added to.
- **New `id`:** adds an item.
- **`remove:`** drops defaults: `remove: { team-types: [complicated-subsystem] }`.

```yaml
# overrides/vocab/acme.yaml
team-types:
  - { id: data-domain, label: Data domain, icon: database }        # add

disciplines:
  - { id: actuarial, label: Actuarial, icon: graph }               # add
  - { id: support, label: Service desk and support }               # rename a default

technologies:
  - { id: posit-connect, label: Posit Connect, category: runtime, logo: si:posit }

relationship-types:
  - id: data-steward
    label: Data steward
    inverse: Data stewards
    category: accountability        # accountability | audience | governance | technical
    description: Looks after data quality, definitions and access for the data in it.
    from: [person, team]
    to: [platform, product]
    default-from: person
    inline: stewards                # lets a platform or product say `stewards: [...]`
    attributes: [scope, note]
    style: { line: dotted, weight: 2, glyph: shield }
    aliases: [steward]

remove:
  team-types: [complicated-subsystem]
```

Icons are [Octicon](https://primer.style/octicons/) names. Logos for technologies use the same `si:` / `octicon:` syntax as platforms.

The demo enterprise uses exactly this: see [`examples/meridian/vocab/meridian.yaml`](../examples/meridian/vocab/meridian.yaml).

**After changing your vocabulary, run `npm run generate`.** This rebuilds the JSON Schema and the authoring agent so they describe your types too, then commit the result. CI fails if you forget, so the agent can never fall behind. The validator, legend, relationships page, filters and diagrams pick up the changes automatically.

If an update from upstream conflicts in the generated files (`schema/`, `agent/`, `.claude/agents/`, `AGENTS.md`), take either side and run `npm run generate` again.

## 3. Logos: `overrides/icons/`

Drop an SVG at `overrides/icons/<name>.svg` and use `logo: custom:<name>` on any platform or product. Scripts and event handlers are stripped from custom SVGs.

## Not customizable yet

- **Theme colors and fonts.** They live in `site/src/styles/global.css` (planned: a theme file in `overrides/`).
- **Page layouts and new kinds of entity.** These need changes to the toolkit itself.
