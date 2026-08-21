# Form

Form is a local-first workout planner designed for a public GitHub Pages
deployment. The application code is public; personal workout data is not.

## Privacy boundary

- The repository contains only application code, schemas, and fictional data.
- Imported plans and workout records stay in browser IndexedDB.
- No analytics, accounts, APIs, or remote data requests are used.
- Exported `*.private.json` files are ignored and must never be committed.
- Only the verified `pages-dist/` artifact is deployed.

Read [PRIVACY.md](PRIVACY.md) before working with personal data.

## Local development

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

The application is a static Vite build. Create the GitHub Pages artifact with:

```bash
npm run build:pages
npm run verify:public
```

Run the full validation suite with `npm test`.

## Private import format

The canonical schema is [`schema/workout-data.schema.json`](schema/workout-data.schema.json).
[`examples/fictional-demo-plan.json`](examples/fictional-demo-plan.json) is a
safe example that can be imported into the app.

## GitHub Pages

1. Push this directory to a new repository that contains no private source files.
2. In repository settings, select **GitHub Actions** as the Pages source.
3. Push to `main`; the workflow tests, scans, and deploys `pages-dist/`.
