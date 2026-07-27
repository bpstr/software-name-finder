import { RESULT_STATUS } from './core.js';
import { fetchWithTimeout } from './network.js';
import { checkDomain } from './rdap.js';

function profileUrl(template, name) {
  return template.replace('{name}', encodeURIComponent(name));
}

async function statusEndpointCheck(url, { availableStatuses = [404], takenStatuses = [200], options = {} } = {}) {
  try {
    const response = await fetchWithTimeout(url, options);
    if (takenStatuses.includes(response.status)) return { status: RESULT_STATUS.TAKEN, confidence: 'high' };
    if (availableStatuses.includes(response.status)) return { status: RESULT_STATUS.AVAILABLE, confidence: 'high' };
    return { status: RESULT_STATUS.UNKNOWN, confidence: 'low', note: `Provider returned HTTP ${response.status}.` };
  } catch (error) {
    return {
      status: RESULT_STATUS.UNKNOWN,
      confidence: 'low',
      note: error instanceof Error && error.name === 'AbortError' ? 'Lookup timed out.' : 'The provider blocked or failed the browser request.'
    };
  }
}

export const DEFAULT_TLDS = ['com', 'io', 'ai', 'dev', 'app', 'co', 'net', 'org', 'hu'];

export function createDomainProviders(domainLabel, tlds = DEFAULT_TLDS) {
  return tlds.map((tld, index) => ({
    id: `domain-${tld}`,
    name: `${domainLabel}.${tld}`,
    category: 'Domains',
    weight: index === 0 ? 25 : ['io', 'ai'].includes(tld) ? 10 : 4,
    async check() {
      return checkDomain(`${domainLabel}.${tld}`);
    }
  }));
}

export function createLiveProviders(name) {
  const npmName = name.toLowerCase();
  return [
    {
      id: 'github', name: 'GitHub handle', category: 'Profiles', weight: 12,
      url: `https://github.com/${encodeURIComponent(name)}`,
      check: () => statusEndpointCheck(`https://api.github.com/users/${encodeURIComponent(name)}`, {
        options: { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } }
      })
    },
    {
      id: 'gitlab', name: 'GitLab handle', category: 'Profiles', weight: 5,
      url: `https://gitlab.com/${encodeURIComponent(name)}`,
      async check() {
        try {
          const response = await fetchWithTimeout(`https://gitlab.com/api/v4/users?username=${encodeURIComponent(name)}`);
          if (!response.ok) return { status: RESULT_STATUS.UNKNOWN, confidence: 'low', note: `Provider returned HTTP ${response.status}.` };
          const users = await response.json();
          return { status: users.length ? RESULT_STATUS.TAKEN : RESULT_STATUS.AVAILABLE, confidence: 'high' };
        } catch {
          return { status: RESULT_STATUS.UNKNOWN, confidence: 'low', note: 'GitLab blocked or failed the browser request.' };
        }
      }
    },
    {
      id: 'bluesky', name: 'Bluesky handle', category: 'Profiles', weight: 4,
      url: `https://bsky.app/profile/${encodeURIComponent(name)}.bsky.social`,
      check: () => statusEndpointCheck(`https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(name)}.bsky.social`, {
        availableStatuses: [400, 404], takenStatuses: [200]
      })
    },
    {
      id: 'devto', name: 'DEV Community', category: 'Profiles', weight: 3,
      url: `https://dev.to/${encodeURIComponent(name)}`,
      check: () => statusEndpointCheck(`https://dev.to/api/users/by_username?url=${encodeURIComponent(name)}`)
    },
    {
      id: 'docker', name: 'Docker Hub namespace', category: 'Profiles', weight: 3,
      url: `https://hub.docker.com/u/${encodeURIComponent(name)}`,
      check: () => statusEndpointCheck(`https://hub.docker.com/v2/users/${encodeURIComponent(name)}/`)
    },
    {
      id: 'npm', name: 'npm package', category: 'Package registries', weight: 8,
      url: `https://www.npmjs.com/package/${encodeURIComponent(npmName)}`,
      check: () => statusEndpointCheck(`https://registry.npmjs.org/${encodeURIComponent(npmName)}`)
    },
    {
      id: 'pypi', name: 'PyPI package', category: 'Package registries', weight: 5,
      url: `https://pypi.org/project/${encodeURIComponent(npmName)}/`,
      check: () => statusEndpointCheck(`https://pypi.org/pypi/${encodeURIComponent(npmName)}/json`)
    },
    {
      id: 'crates', name: 'crates.io package', category: 'Package registries', weight: 4,
      url: `https://crates.io/crates/${encodeURIComponent(npmName)}`,
      check: () => statusEndpointCheck(`https://crates.io/api/v1/crates/${encodeURIComponent(npmName)}`)
    }
  ];
}

const MANUAL_PROVIDERS = [
  ['x', 'X / Twitter', 'https://x.com/{name}'],
  ['instagram', 'Instagram', 'https://www.instagram.com/{name}/'],
  ['threads', 'Threads', 'https://www.threads.net/@{name}'],
  ['tiktok', 'TikTok', 'https://www.tiktok.com/@{name}'],
  ['youtube', 'YouTube handle', 'https://www.youtube.com/@{name}'],
  ['linkedin', 'LinkedIn company', 'https://www.linkedin.com/company/{name}/'],
  ['reddit', 'Reddit', 'https://www.reddit.com/user/{name}/'],
  ['producthunt', 'Product Hunt', 'https://www.producthunt.com/@{name}'],
  ['medium', 'Medium', 'https://medium.com/@{name}'],
  ['twitch', 'Twitch', 'https://www.twitch.tv/{name}']
];

export function createManualProviders(name) {
  return MANUAL_PROVIDERS.map(([id, providerName, template]) => ({
    id,
    name: providerName,
    category: 'Restricted social profiles',
    weight: 0,
    url: profileUrl(template, name),
    async check() {
      return {
        status: RESULT_STATUS.MANUAL,
        confidence: 'manual',
        note: 'This platform restricts reliable browser-side availability checks. Open the profile to verify.'
      };
    }
  }));
}

export function createResearchLinks(name, displayName) {
  const quoted = encodeURIComponent(`"${displayName}"`);
  const plain = encodeURIComponent(displayName);
  return [
    { id: 'web', name: 'Exact web search', category: 'Collision research', url: `https://www.google.com/search?q=${quoted}`, note: 'Look for existing products, companies, and unrelated meanings.' },
    { id: 'github-search', name: 'GitHub repository search', category: 'Collision research', url: `https://github.com/search?q=${encodeURIComponent(`${name} in:name`)}&type=repositories`, note: 'Find software projects already using a similar repository name.' },
    { id: 'producthunt-search', name: 'Product Hunt search', category: 'Collision research', url: `https://www.producthunt.com/search?q=${plain}`, note: 'Check launched products and startup naming collisions.' },
    { id: 'apple-search', name: 'Apple App Store search', category: 'App stores', url: `https://www.apple.com/us/search/${plain}?src=globalnav`, note: 'Search Apple products and App Store references.' },
    { id: 'play-search', name: 'Google Play search', category: 'App stores', url: `https://play.google.com/store/search?q=${plain}&c=apps`, note: 'Search existing Android app names.' },
    { id: 'tmview', name: 'TMview trademark search', category: 'Trademark research', url: 'https://www.tmdn.org/tmview/', note: 'Manual EU and international trademark screening. This is not legal clearance.' },
    { id: 'euipo', name: 'EUIPO search', category: 'Trademark research', url: 'https://euipo.europa.eu/eSearch/', note: 'Search EU trademarks and owners before committing to a name.' }
  ];
}
