export const RESULT_STATUS = Object.freeze({
  CHECKING: 'checking',
  AVAILABLE: 'available',
  LIKELY_AVAILABLE: 'likely-available',
  TAKEN: 'taken',
  MANUAL: 'manual',
  UNKNOWN: 'unknown',
  ERROR: 'error'
});

export function normalizeInput(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function toHandle(value) {
  return normalizeInput(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 39);
}

export function toSlug(value) {
  return normalizeInput(value)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 63)
    .replace(/-+$/g, '');
}

export function toPackageName(value) {
  return toSlug(value).replace(/-/g, '-');
}

export function generateVariants(value) {
  const compact = toHandle(value);
  const slug = toSlug(value);
  if (!compact || !slug) return [];

  const candidates = [
    { id: 'exact', label: 'Exact', value: compact, domain: slug },
    { id: 'get', label: 'Get', value: `get${compact}`, domain: `get-${slug}` },
    { id: 'use', label: 'Use', value: `use${compact}`, domain: `use-${slug}` },
    { id: 'try', label: 'Try', value: `try${compact}`, domain: `try-${slug}` },
    { id: 'app', label: 'App', value: `${compact}app`, domain: `${slug}-app` },
    { id: 'hq', label: 'HQ', value: `${compact}hq`, domain: `${slug}-hq` }
  ];

  return candidates.filter((item, index, items) =>
    item.value.length <= 39 &&
    item.domain.length <= 63 &&
    items.findIndex((candidate) => candidate.value === item.value) === index
  );
}

export function createResult(provider, status, extra = {}) {
  return {
    providerId: provider.id,
    providerName: provider.name,
    category: provider.category,
    status,
    label: extra.label ?? status,
    url: extra.url ?? null,
    note: extra.note ?? '',
    confidence: extra.confidence ?? 'high',
    checkedAt: new Date().toISOString(),
    ...extra
  };
}

export function calculateScore(results) {
  const scoreable = results.filter((result) => Number.isFinite(result.weight) && result.weight > 0);
  const maximum = scoreable.reduce((sum, result) => sum + result.weight, 0);
  if (!maximum) return { score: null, maximum: 0, availableWeight: 0 };

  const availableWeight = scoreable.reduce((sum, result) => {
    if (result.status === RESULT_STATUS.AVAILABLE) return sum + result.weight;
    if (result.status === RESULT_STATUS.LIKELY_AVAILABLE) return sum + result.weight * 0.4;
    return sum;
  }, 0);

  return {
    score: Math.round((availableWeight / maximum) * 100),
    maximum,
    availableWeight
  };
}

export function summarizeResults(results) {
  return results.reduce((summary, result) => {
    summary[result.status] = (summary[result.status] ?? 0) + 1;
    return summary;
  }, {});
}

export function csvEscape(value) {
  const string = String(value ?? '');
  return /[",\n]/.test(string) ? `"${string.replaceAll('"', '""')}"` : string;
}

export function resultsToCsv(candidate, results) {
  const rows = [
    ['candidate', 'category', 'provider', 'status', 'confidence', 'url', 'note'],
    ...results.map((result) => [
      candidate,
      result.category,
      result.providerName,
      result.status,
      result.confidence,
      result.url ?? '',
      result.note ?? ''
    ])
  ];
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
}
