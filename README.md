# rtc.io-docs

[![docs](https://img.shields.io/badge/docs-rtcio.dev-blue?style=flat-square)](https://docs.rtcio.dev)
[![license](https://img.shields.io/badge/license-MIT-green?style=flat-square)](./LICENSE)

Docusaurus 3 site for the [rtc.io](https://github.com/solidet-com/rtc.io) client and [rtc.io-server](https://github.com/solidet-com/rtc.io-server) signaling server.

> **Live**: [docs.rtcio.dev](https://docs.rtcio.dev) · **Library**: [rtc.io](https://github.com/solidet-com/rtc.io) · **Live demo**: [rtcio.dev](https://rtcio.dev)

---

The "Edit this page" link at the bottom of every doc page points back to this repository, so PRs land in the right place without any monorepo gymnastics.

## Local development

```bash
npm install
npm run dev
```

Opens at http://localhost:3000. Live-reloads on edits in `docs/`.

## Production build

```bash
npm run build
npm run preview   # local preview of the production bundle
```

The output goes to `build/` — drop it on any static host (Vercel, Netlify, Cloudflare Pages, S3 / CloudFront, GitHub Pages).

## Deploying on Heroku

Heroku's Node buildpack auto-runs `npm run build` after install, then `npm start`. Our `start` script serves the built static site via the [`serve`](https://github.com/vercel/serve) package on `$PORT`.

```bash
heroku create rtcio-docs
heroku buildpacks:set heroku/nodejs
git push heroku master
```

`engines.node` is pinned to `22.x` (active LTS) — the buildpack respects it. Don't loosen it to `>=18` or Heroku will resolve to whatever is current and may pull in stricter webpack schemas that older Docusaurus versions trip on.

## Site structure

```
docs/
├─ docs/                    # all the markdown content
│  ├─ introduction.md
│  ├─ getting-started.md
│  ├─ how-it-works.md
│  ├─ api/                  # client API reference
│  ├─ guides/               # explainers
│  ├─ server/               # rtc.io-server docs
│  └─ tutorial/             # step-by-step build
├─ src/
│  ├─ css/custom.css        # theme overrides
│  └─ pages/index.tsx       # landing page
├─ static/img/              # logos, favicons
├─ docusaurus.config.ts
└─ sidebars.ts
```

The two sidebars are **Docs** (everything) and **Server** (just the server section). Configured in `sidebars.ts`.

## Conventions

- All internal links use `/docs/...` form so cross-section links work.
- Code samples are TypeScript-flavored. Drop the type annotations for plain JS.
- Each guide ends with a "What's next" pointer to keep the reader moving.
- The "Tutorial" section is sequential; "Guides" are reference-style and order-independent.
