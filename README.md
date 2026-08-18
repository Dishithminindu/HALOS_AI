# HALOS — AI-Assisted Dietary Salt Intake Assessment & Prediction System

HALOS is a static research prototype using HTML5, CSS3 and Vanilla JavaScript, with an optional Cloudflare Worker + D1 API.

## Fixed deployment layout

The project is configured for **Cloudflare Workers Static Assets**:

- `src/index.js` — Worker entry point
- `public/` — all frontend pages, CSS, JavaScript, data and assets
- `wrangler.toml` — Worker + Static Assets configuration
- `package.json` — Wrangler scripts

The previous deployment configuration referenced `src/worker.js` and `./public` even though the Worker was actually `src/index.js` and the frontend files were at the repository root. That mismatch has been corrected.

## Deploy

Install dependencies:

```bash
npm install
```

Validate the Worker:

```bash
npm run typecheck
```

Run locally:

```bash
npm run dev
```

Deploy:

```bash
npm run deploy
```

Cloudflare will deploy the Worker and the contents of `public/` as Static Assets.

## Optional D1 API

The frontend prototype currently works without D1 because assessment state is stored in browser localStorage.

If you want to enable the API, create a D1 database and bind it as `DB` in `wrangler.toml`. You must also apply a schema matching the SQL statements in `src/index.js`.

Configure API authentication as Worker secrets:

```bash
npx wrangler secret put ADMIN_USER
npx wrangler secret put ADMIN_PASS
```

Do **not** put API credentials in JavaScript, HTML, or `wrangler.toml`.

The API is intentionally protected separately from the static frontend. This prevents the Basic Auth challenge from blocking the CSS/JS/assets required by the public pages.

## Food database

`public/data/food-database.json` contains example/demo values only. Replace it with a validated food-composition database before research use.

## ML model

`public/js/prediction.js` contains a demonstration model. It is not a clinically validated prediction model.

## Privacy

Browser localStorage is suitable only for demonstration/prototyping and is not secure clinical storage. Do not store identifiable patient health information.

## Disclaimer

HALOS is a research prototype and does not provide medical diagnosis or treatment recommendations.
