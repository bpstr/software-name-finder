# NameFoundry / software-name-finder

A privacy-friendly, dependency-free product-name research tool designed to run on **GitHub Pages**.

**Live app:** https://bpstr.github.io/software-name-finder/

Enter a future product or software name and check:

- domain registration across `.com`, `.io`, `.ai`, `.dev`, `.app`, `.co`, `.net`, `.org`, and `.hu`
- GitHub, GitLab, Bluesky, DEV Community, and Docker Hub profiles
- npm, PyPI, and crates.io packages
- manual profile links for restricted social platforms
- web, GitHub, Product Hunt, app-store, EUIPO, and TMview collision research
- generated naming variants such as `getname`, `usename`, `tryname`, `nameapp`, and `namehq`
- local shortlists with CSV and JSON export

## Why some checks are manual

A static GitHub Pages site cannot reliably inspect every social network. Major networks commonly block browser-side cross-origin requests, require authenticated APIs, or return bot challenges. NameFoundry reports those checks as **manual** instead of incorrectly claiming the handle is available.

Domains use authoritative RDAP where possible. When RDAP is unavailable, DNS is only used as a low-confidence fallback.

## Run locally

No installation is required.

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

Run the dependency-free tests with Node.js 20 or newer:

```bash
npm test
```

## Deploy to GitHub Pages

1. Open **Settings → Pages** in this repository.
2. Set **Source** to **GitHub Actions**.
3. Push to `main`, or run the workflow manually from the **Actions** tab.
4. `.github/workflows/pages.yml` tests the project and deploys the static files.

The published URL is:

```text
https://bpstr.github.io/software-name-finder/
```

All asset paths are relative, so the project Pages path works without configuring a build-time base URL.

## Architecture

```text
index.html              UI shell
styles.css              responsive visual system
src/app.js              application state and rendering
src/core.js             normalization, variants, scoring, export
src/network.js          timeout and concurrency helpers
src/providers.js        provider adapters and research links
src/rdap.js             IANA RDAP discovery and DNS fallback
src/storage.js          browser-local shortlist
sw.js                   optional offline shell cache
tests/core.test.js      dependency-free unit tests
```

See [`docs/PROVIDERS.md`](docs/PROVIDERS.md) for confidence rules and provider limitations.

## Privacy

There is no application backend and no analytics. Searches are sent directly from the visitor's browser to the public providers being checked. Saved candidates use `localStorage` and remain on the current device.

## Extending providers

Add live adapters in `src/providers.js`. Every adapter should:

- return `taken`, `available`, or `unknown` based on explicit provider responses
- treat network errors, CORS blocks, rate limits, and anti-bot pages as `unknown`
- never infer availability from a generic fetch failure
- include a manual verification URL

## License

MIT
