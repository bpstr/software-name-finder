# Provider behavior

NameFoundry deliberately separates **verified checks** from **manual verification**.

## Domains

The app downloads the IANA RDAP bootstrap registry, selects the authoritative RDAP service for each top-level domain, and requests the candidate domain.

- `200`: registered / taken
- `404`: not present in RDAP / available at that moment
- other response: unknown
- failed RDAP request: Cloudflare DNS-over-HTTPS fallback

A DNS `NXDOMAIN` result is shown as **likely available**, not definitively available. A registered domain can exist without ordinary website records, and registry/registrar checkout remains the final authority.

## Live browser checks

The following providers expose endpoints that can usually be called from a browser:

- GitHub user API
- GitLab user API
- Bluesky public API
- DEV Community API
- Docker Hub API
- npm registry
- PyPI
- crates.io

Provider CORS policies and rate limits can change. A blocked request is reported as **unknown**, never as available.

## Manual social checks

X, Instagram, Threads, TikTok, YouTube, LinkedIn, Reddit, Product Hunt, Medium, and Twitch frequently block anonymous cross-origin checks or return anti-bot pages that cannot be interpreted safely from GitHub Pages.

For these platforms the app creates the exact profile URL and asks the user to verify it. This avoids false green results and avoids fragile scraping logic.

## Trademark and collision research

The app links to web search, GitHub search, app stores, Product Hunt, TMview, and EUIPO. These are research shortcuts, not legal advice or trademark clearance.
