import { RESULT_STATUS } from './core.js';
import { fetchWithTimeout } from './network.js';

const BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';
const CACHE_KEY = 'namefoundry.rdap.bootstrap.v1';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function readCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    if (cached?.savedAt && Date.now() - cached.savedAt < CACHE_TTL_MS && cached.data?.services) {
      return cached.data;
    }
  } catch {
    // Ignore malformed cache entries.
  }
  return null;
}

function writeCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    // Storage may be unavailable in private browsing.
  }
}

async function getBootstrap() {
  const cached = readCache();
  if (cached) return cached;

  const response = await fetchWithTimeout(BOOTSTRAP_URL, {
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) throw new Error(`IANA bootstrap returned ${response.status}`);
  const data = await response.json();
  writeCache(data);
  return data;
}

function findRdapBase(bootstrap, tld) {
  const normalized = tld.replace(/^\./, '').toLowerCase();
  for (const [tlds, urls] of bootstrap.services ?? []) {
    if (tlds.some((item) => item.toLowerCase() === normalized)) {
      return urls.find((url) => url.startsWith('https://')) ?? urls[0] ?? null;
    }
  }
  return null;
}

function joinRdapUrl(base, domain) {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return new URL(`domain/${encodeURIComponent(domain)}`, normalizedBase).toString();
}

async function dnsFallback(domain) {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=SOA`;
  const response = await fetchWithTimeout(url, {
    headers: { Accept: 'application/dns-json' }
  });
  if (!response.ok) throw new Error(`DNS fallback returned ${response.status}`);
  const data = await response.json();

  if (data.Status === 0 && Array.isArray(data.Answer) && data.Answer.length > 0) {
    return {
      status: RESULT_STATUS.TAKEN,
      confidence: 'medium',
      note: 'RDAP could not be reached, but the domain has DNS records.'
    };
  }
  if (data.Status === 3) {
    return {
      status: RESULT_STATUS.LIKELY_AVAILABLE,
      confidence: 'low',
      note: 'No DNS records were found. Verify with a registrar before relying on this result.'
    };
  }
  return {
    status: RESULT_STATUS.UNKNOWN,
    confidence: 'low',
    note: 'Registration could not be confirmed.'
  };
}

export async function checkDomain(domain) {
  const tld = domain.split('.').at(-1);
  const verifyUrl = `https://lookup.icann.org/en/lookup?name=${encodeURIComponent(domain)}`;

  try {
    const bootstrap = await getBootstrap();
    const base = findRdapBase(bootstrap, tld);
    if (!base) throw new Error(`No RDAP service listed for .${tld}`);

    const response = await fetchWithTimeout(joinRdapUrl(base, domain), {
      headers: { Accept: 'application/rdap+json, application/json' }
    });

    if (response.status === 200) {
      return { status: RESULT_STATUS.TAKEN, confidence: 'high', url: verifyUrl, note: 'Registered according to the authoritative RDAP service.' };
    }
    if (response.status === 404) {
      return { status: RESULT_STATUS.AVAILABLE, confidence: 'high', url: verifyUrl, note: 'Not found in the authoritative RDAP service. Confirm at checkout with a registrar.' };
    }
    if (response.status === 429) {
      return { status: RESULT_STATUS.UNKNOWN, confidence: 'low', url: verifyUrl, note: 'The registry rate-limited this lookup.' };
    }

    throw new Error(`RDAP returned ${response.status}`);
  } catch (error) {
    try {
      const fallback = await dnsFallback(domain);
      return { ...fallback, url: verifyUrl };
    } catch {
      return {
        status: RESULT_STATUS.UNKNOWN,
        confidence: 'low',
        url: verifyUrl,
        note: error instanceof Error ? error.message : 'Domain lookup failed.'
      };
    }
  }
}
