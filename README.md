# Org Atlas

**Diagrams as data for technical enterprises.** Describe your business units, teams, people, solutions and platforms in YAML, and Org Atlas turns them into an interactive, filterable site you can deploy to GitHub Pages.

> **Status: early.** Working today: org chart (with filters and a people view), team pages, a legend, a fictional demo enterprise, local preview and GitHub Pages deployment. Solutions, platforms, relationships and the graph explorer are next. See [docs/PLAN.md](docs/PLAN.md).

## What you get

- **Org chart:** organization, business units and teams as a tree. Filter by business unit, team type or discipline, search for people or roles, and switch between a Teams view and a People view. Filters are kept in the URL, so you can share a filtered view as a link.
- **Team pages:** each team's lead and members grouped by tier, shared members, open positions and discipline mix.
- **Legend:** what every badge, ring and icon means, generated from the same vocabulary file the site renders with.
- **Demo data:** *Meridian Dynamics*, a fictional enterprise with 6 business units, 22 teams and about 150 people.

## Quickstart

You need [Node.js](https://nodejs.org/) 22.23.4 or newer.

```bash
git clone https://github.com/ekbrothers/org-atlas.git my-atlas
```

```bash
cd my-atlas && npm install
```

```bash
npm run init
```

```bash
npm run dev
```

`npm run init` asks a few questions and creates your own `atlas.config.yaml`, `data/` and `overrides/` from a starter (`minimal` or `meridian`). Until you run it, the site shows the Meridian Dynamics demo.

## Describing your organization

Everything lives in YAML under `data/`. A file holds one entity, or several of one kind under `items`. The `minimal` starter has comments explaining every field.

```yaml
# data/teams/engineering.yaml
kind: team
items:
  - id: web-app
    name: Web App
    parent: engineering        # business unit id
    type: stream-aligned
    lead: sam-okafor           # person id
```

```yaml
# data/people/engineering.yaml
kind: person
items:
  - id: jo-lindqvist
    name: Jo Lindqvist
    role: Platform Lead        # free text, in your own words
    tier: team-lead            # executive | senior-leader | manager | team-lead | principal | ic
    discipline: infrastructure
    employment: fte            # fte | contractor | vendor | intern | vacancy | interim
    memberships:
      - team: platform
        primary: true
      - team: web-app
        role: Platform liaison # per-team role
```

People can belong to several teams. They appear on every team, marked as shared on all but their primary one. An open position is a person with `employment: vacancy` and no name.

## Commands

| Command | What it does |
|---|---|
| `npm run init` | Create your config and data from a starter. Flags: `--starter`, `--name`, `--real-data yes\|no`, `--force`, `--yes` |
| `npm run dev` | Local preview with live reload |
| `npm run validate` | Check your config and data. Errors show `file:line` |
| `npm run build` | Validate, then build the static site into `dist/` |
| `npm run preview` | Serve `dist/` with the same base path GitHub Pages will use |

## Deploy to GitHub Pages

1. Push your copy to a GitHub repository (see [Keeping real data private](#keeping-real-data-private)).
2. In the repository, open **Settings > Pages** and set **Source** to **GitHub Actions**.
3. Push to `main`. The included workflow validates your data, builds the site and deploys it.

Your site appears at `https://<owner>.github.io/<repo>/`. The base path is detected automatically:

| Situation | Served from |
|---|---|
| Normal repository | `https://<owner>.github.io/<repo>/` |
| Repository named `<owner>.github.io` | `https://<owner>.github.io/` |
| `site.domain` set in `atlas.config.yaml` | `https://<your domain>/` (a `CNAME` file is written for you) |

If your data fails validation, the deploy stops and the last good version of the site stays live. Pull requests run the same checks without deploying.

To override detection (for another host or a subfolder), set `ATLAS_BASE` and `ATLAS_SITE` when building, for example `ATLAS_BASE=/atlas npm run build`. The output in `dist/` is plain static files that any web server can host.

## Keeping real data private

Org Atlas itself is public, but your organization's data probably should not be.

- **Do not fork** this repository for real data: forks of public repositories are public. Clone it and push to a **new private repository** instead.
- GitHub Pages on a private repository needs a paid plan (Pro, Team or Enterprise).
- A Pages site can be opened by anyone who has the URL, unless you use GitHub Enterprise Cloud's access-controlled Pages.
- If you answer "yes" to the real-data question in `npm run init`, search engine indexing is turned off (`site.noindex: true`).

## Getting updates

Your files (`atlas.config.yaml`, `data/`, `overrides/`) never exist in this upstream repository, so pulling updates does not conflict with them.

```bash
git remote add upstream https://github.com/ekbrothers/org-atlas.git
```

```bash
git pull upstream main
```

## Repository layout

```
.github/workflows/   deploy.yml (Pages) and validate.yml (pull requests)
engine/              config and data loading, model, vocabulary, CLI scripts
site/                the Astro site (pages, layouts, styles)
examples/minimal/    small starter
examples/meridian/   demo enterprise (regenerate with `node examples/meridian/generate.mjs`)
docs/                the plan and, later, authoring guides
data/                YOURS, created by `npm run init`
atlas.config.yaml    YOURS, created by `npm run init`
overrides/           YOURS, custom vocabulary, themes, icons (Phase 1+)
```

## License

[MIT](LICENSE). Uses [Primer Octicons](https://primer.style/octicons/) (MIT). Icon sets added later keep their own licenses.
