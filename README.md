# STKR

Pronounced "stalker". Codename: Project Omnitron.

STKR is a personal app for rating anything on radar maps you define. Choose what matters
about a meal, a trail or a film, drag each axis to how you feel, and add as much context as
you like. Over time your maps form a graph you can explore, and STKR can estimate whether
something new would suit you, based on your own ratings.

**Your data stays on your device.** Maps and photos live in your browser's IndexedDB, and
the AI model runs in your browser. The server has no accounts, API or database.

## Run it

Needs Node.js 24 or later.

```sh
npm ci
npm run fetch-model   # downloads the model and verifies its SHA-256 hashes
npm run preview       # builds, then serves on http://localhost:8787 with the real Worker
```

`npm run dev` starts Vite with hot reload, but without the Worker's security headers.
Search only works multi-threaded under those headers, so use `preview` to test it.

## Commands

| Command | What it does |
| --- | --- |
| `npm run check` | Lint, typecheck, unit tests and `npm audit` for production dependencies |
| `npm run build` | Builds to `dist/` |
| `npm run e2e` | Browser tests against `wrangler dev`. Run `npm run build` first, and `npx playwright install chromium` once |
| `npm run deploy` | Checks, builds and publishes with `wrangler deploy`. Run `npx wrangler login` first |

## How it's built

Vue 3, anime.js, d3-force, Transformers.js and a Cloudflare Worker with static assets.

Each directory has one job, and side effects stay at the edges:

```
src/core/     Pure logic: geometry, validation, stacks, graph, prediction, backup format
src/io/       One side effect per file: IndexedDB, photos, location, files, the model
src/ui/       Vue views and components that connect core and io
src/worker/   The Cloudflare Worker: routing and security headers
scripts/      Fetches the model and verifies it
e2e/          Playwright tests against the real Worker
```

ESLint enforces this. Code in `src/core` can't import `io` or `ui`, or use the DOM, the
network, the clock or randomness. These are passed in as arguments, which is why almost
all of the logic can be tested without a browser.

### How predictions work

1. Each map's text (name, category, tags, axes, place, notes, details) becomes a vector
   using a quantised `all-MiniLM-L6-v2` model.
2. Your query becomes a vector too, and maps with a cosine similarity of at least 0.25
   count as evidence, up to the closest 5.
3. The estimate is the average of those maps' overall scores, weighted by similarity.
4. Confidence depends on how close the maps are and how much they agree.

This is a weighted average of your own opinions, not a language model. It can tell that
udon resembles ramen, but it can't reason or converse. The 0.25 threshold comes from a
small set of test phrases, so it may need adjusting as real collections grow.

## Security and privacy

Designed around the OWASP Top 10.

- **Content Security Policy:** `default-src 'none'`, with no inline script or style, no
  JavaScript `eval` and no other origins. `'wasm-unsafe-eval'` is allowed only so the
  model's WebAssembly can compile.
- **Other headers:** HSTS, `nosniff`, `no-referrer`, cross-origin isolation, and a
  `Permissions-Policy` that allows only location and camera on this site.
- **Worker:** allows GET and HEAD only, holds no secrets, and returns real 404s.
- **Input validation:** forms and imports pass through allowlist validators in
  `src/core/validate.ts`.
- **Photos:** identified by their bytes, never their name, and redrawn through a canvas to
  a new JPEG, which removes EXIF data including GPS. SVG is rejected.
- **Output:** all text is rendered through Vue's escaping, and lint forbids `v-html`.
- **Supply chain:** exact versions, a committed lockfile, install scripts disabled, and a
  self-hosted model pinned by SHA-256.

### Limits you should know about

- **There's only one copy of your data.** Clearing browser data or losing the device
  deletes it. Export backups regularly from the Backup page.
- **Nothing is encrypted at rest.** Anyone with access to your unlocked browser profile
  or a backup file can read your notes, places and photos.
- **Maps don't sync between devices.** Move them with export and import.
- **Photo decoding has only partial protection from oversized images.** Files are limited
  to 20 MB, and the 100-megapixel check runs after the browser has decoded the image.

## Model and runtime files

`npm run fetch-model` places these in `public/`, which git ignores:

- `models/Xenova/all-MiniLM-L6-v2/`: downloaded from Hugging Face at a pinned revision.
- `ort/`: copied from `node_modules/onnxruntime-web`. When upgrading that package, update
  the pinned hashes in `scripts/fetch-model.mjs`.

The script fails if a hash doesn't match or a file exceeds Cloudflare's 25 MiB limit.
