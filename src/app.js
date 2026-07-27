import {
  RESULT_STATUS,
  calculateScore,
  createResult,
  generateVariants,
  normalizeInput,
  resultsToCsv,
  summarizeResults,
  toHandle,
  toSlug
} from './core.js';
import { mapLimit } from './network.js';
import {
  DEFAULT_TLDS,
  createDomainProviders,
  createLiveProviders,
  createManualProviders,
  createResearchLinks
} from './providers.js';
import { loadSaved, removeCandidate, saveCandidate } from './storage.js';

const state = {
  displayName: '',
  selectedVariant: null,
  results: [],
  checking: false,
  saved: loadSaved()
};

const els = {
  form: document.querySelector('#name-form'),
  input: document.querySelector('#name-input'),
  submit: document.querySelector('#check-button'),
  examples: document.querySelector('#examples'),
  variants: document.querySelector('#variants'),
  resultsShell: document.querySelector('#results-shell'),
  results: document.querySelector('#results'),
  score: document.querySelector('#score'),
  scoreText: document.querySelector('#score-text'),
  scoreLabel: document.querySelector('#score-label'),
  summary: document.querySelector('#summary'),
  currentName: document.querySelector('#current-name'),
  currentHandle: document.querySelector('#current-handle'),
  currentDomain: document.querySelector('#current-domain'),
  save: document.querySelector('#save-button'),
  exportCsv: document.querySelector('#export-csv'),
  exportJson: document.querySelector('#export-json'),
  savedList: document.querySelector('#saved-list'),
  savedEmpty: document.querySelector('#saved-empty'),
  liveRegion: document.querySelector('#live-region')
};

function statusLabel(status) {
  return {
    [RESULT_STATUS.CHECKING]: 'Checking',
    [RESULT_STATUS.AVAILABLE]: 'Available',
    [RESULT_STATUS.LIKELY_AVAILABLE]: 'Likely available',
    [RESULT_STATUS.TAKEN]: 'Taken',
    [RESULT_STATUS.MANUAL]: 'Verify manually',
    [RESULT_STATUS.UNKNOWN]: 'Unknown',
    [RESULT_STATUS.ERROR]: 'Error'
  }[status] ?? status;
}

function statusIcon(status) {
  return {
    [RESULT_STATUS.CHECKING]: '↻',
    [RESULT_STATUS.AVAILABLE]: '✓',
    [RESULT_STATUS.LIKELY_AVAILABLE]: '≈',
    [RESULT_STATUS.TAKEN]: '×',
    [RESULT_STATUS.MANUAL]: '↗',
    [RESULT_STATUS.UNKNOWN]: '?',
    [RESULT_STATUS.ERROR]: '!'
  }[status] ?? '•';
}

function renderVariants() {
  const variants = generateVariants(els.input.value);
  els.variants.innerHTML = '';
  if (!variants.length) return;

  for (const variant of variants) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `variant-chip${state.selectedVariant?.id === variant.id ? ' active' : ''}`;
    button.innerHTML = `<span>${variant.label}</span><strong>${variant.value}</strong>`;
    button.addEventListener('click', () => {
      state.selectedVariant = variant;
      renderVariants();
      runCheck();
    });
    els.variants.append(button);
  }
}

function renderResearchLinks(links) {
  const container = document.createElement('div');
  container.className = 'research-grid';
  for (const link of links) {
    const anchor = document.createElement('a');
    anchor.className = 'research-card';
    anchor.href = link.url;
    anchor.target = '_blank';
    anchor.rel = 'noreferrer';
    anchor.innerHTML = `<span class="research-arrow">↗</span><strong>${link.name}</strong><small>${link.note}</small>`;
    container.append(anchor);
  }
  return container;
}

function renderResultCard(result) {
  const article = document.createElement('article');
  article.className = `result-card status-${result.status}`;
  article.dataset.provider = result.providerId;

  const action = result.url
    ? `<a href="${result.url}" target="_blank" rel="noreferrer" aria-label="Open ${result.providerName}">Open ↗</a>`
    : '';

  article.innerHTML = `
    <div class="result-icon" aria-hidden="true">${statusIcon(result.status)}</div>
    <div class="result-copy">
      <div class="result-title"><strong>${result.providerName}</strong><span class="status-pill">${statusLabel(result.status)}</span></div>
      <p>${result.note || 'Waiting for provider response.'}</p>
    </div>
    <div class="result-action">${action}</div>
  `;
  return article;
}

function groupResults(results) {
  return results.reduce((groups, result) => {
    (groups[result.category] ??= []).push(result);
    return groups;
  }, {});
}

function renderResults(researchLinks = []) {
  els.results.innerHTML = '';
  const groups = groupResults(state.results);

  for (const [category, results] of Object.entries(groups)) {
    const section = document.createElement('section');
    section.className = 'result-group';
    section.innerHTML = `<div class="section-heading"><h3>${category}</h3><span>${results.length} checks</span></div>`;
    const grid = document.createElement('div');
    grid.className = 'result-grid';
    results.forEach((result) => grid.append(renderResultCard(result)));
    section.append(grid);
    els.results.append(section);
  }

  if (researchLinks.length) {
    const section = document.createElement('section');
    section.className = 'result-group';
    section.innerHTML = `<div class="section-heading"><h3>Research and legal checks</h3><span>manual</span></div>`;
    section.append(renderResearchLinks(researchLinks));
    els.results.append(section);
  }

  const calculated = calculateScore(state.results);
  const hasPendingChecks = state.results.some((result) => result.status === RESULT_STATUS.CHECKING);
  const score = hasPendingChecks ? null : calculated.score;
  const summary = summarizeResults(state.results);
  els.score.textContent = score === null ? '—' : score;
  els.scoreText.textContent = score === null ? 'Waiting for checks' : `${score}/100`;
  els.scoreLabel.textContent = score === null ? 'Checking name surface' : score >= 75 ? 'Strong name surface' : score >= 50 ? 'Mixed availability' : 'Crowded name surface';
  els.summary.textContent = `${summary[RESULT_STATUS.AVAILABLE] ?? 0} available · ${summary[RESULT_STATUS.TAKEN] ?? 0} taken · ${(summary[RESULT_STATUS.UNKNOWN] ?? 0) + (summary[RESULT_STATUS.MANUAL] ?? 0)} need review`;
}

function updateResult(providerId, patch) {
  const index = state.results.findIndex((result) => result.providerId === providerId);
  if (index === -1) return;
  state.results[index] = { ...state.results[index], ...patch, checkedAt: new Date().toISOString() };
  renderResults(createResearchLinks(state.selectedVariant.value, state.displayName));
}

async function runCheck() {
  if (state.checking) return;
  const displayName = normalizeInput(els.input.value);
  const variants = generateVariants(displayName);
  const selected = state.selectedVariant && variants.some((variant) => variant.id === state.selectedVariant.id)
    ? variants.find((variant) => variant.id === state.selectedVariant.id)
    : variants[0];

  if (!displayName || !selected) {
    els.input.focus();
    return;
  }

  state.displayName = displayName;
  state.selectedVariant = selected;
  state.checking = true;
  els.submit.disabled = true;
  els.submit.textContent = 'Checking…';
  els.resultsShell.hidden = false;
  els.currentName.textContent = displayName;
  els.currentHandle.textContent = `@${selected.value}`;
  els.currentDomain.textContent = `${selected.domain}.com`;
  renderVariants();

  const providers = [
    ...createDomainProviders(selected.domain, DEFAULT_TLDS),
    ...createLiveProviders(selected.value),
    ...createManualProviders(selected.value)
  ];
  state.results = providers.map((provider) => createResult(provider, RESULT_STATUS.CHECKING, {
    weight: provider.weight,
    url: provider.url,
    note: provider.category === 'Restricted social profiles' ? 'Preparing manual verification link.' : 'Contacting provider…'
  }));
  renderResults(createResearchLinks(selected.value, displayName));
  els.resultsShell.scrollIntoView({ behavior: 'smooth', block: 'start' });

  await mapLimit(providers, 5, async (provider) => {
    const response = await provider.check();
    updateResult(provider.id, {
      ...response,
      url: response.url ?? provider.url ?? null,
      weight: provider.weight
    });
  });

  state.checking = false;
  els.submit.disabled = false;
  els.submit.textContent = 'Check name';
  els.liveRegion.textContent = `Finished checking ${displayName}.`;
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function currentSnapshot() {
  const { score } = calculateScore(state.results);
  return {
    id: `${state.selectedVariant.value}-${Date.now()}`,
    displayName: state.displayName,
    handle: state.selectedVariant.value,
    domain: state.selectedVariant.domain,
    score,
    savedAt: new Date().toISOString(),
    results: state.results
  };
}

function renderSaved() {
  els.savedList.innerHTML = '';
  els.savedEmpty.hidden = state.saved.length > 0;

  for (const item of state.saved) {
    const row = document.createElement('article');
    row.className = 'saved-card';
    row.innerHTML = `
      <div><strong>${item.displayName}</strong><span>@${item.handle} · ${item.domain}.com</span></div>
      <div class="saved-score">${item.score ?? '—'}</div>
      <button type="button" aria-label="Remove ${item.displayName}">Remove</button>
    `;
    row.querySelector('button').addEventListener('click', () => {
      state.saved = removeCandidate(item.id);
      renderSaved();
    });
    els.savedList.append(row);
  }
}

els.form.addEventListener('submit', (event) => {
  event.preventDefault();
  state.selectedVariant = null;
  runCheck();
});

els.input.addEventListener('input', () => {
  state.selectedVariant = null;
  renderVariants();
});

els.examples.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-example]');
  if (!button) return;
  els.input.value = button.dataset.example;
  state.selectedVariant = null;
  renderVariants();
  runCheck();
});

els.save.addEventListener('click', () => {
  if (!state.results.length || state.checking) return;
  state.saved = saveCandidate(currentSnapshot());
  renderSaved();
  els.liveRegion.textContent = `${state.displayName} saved to this browser.`;
});

els.exportCsv.addEventListener('click', () => {
  if (!state.results.length) return;
  download(`${state.selectedVariant.value}-name-check.csv`, resultsToCsv(state.selectedVariant.value, state.results), 'text/csv;charset=utf-8');
});

els.exportJson.addEventListener('click', () => {
  if (!state.results.length) return;
  download(`${state.selectedVariant.value}-name-check.json`, JSON.stringify(currentSnapshot(), null, 2), 'application/json');
});

renderSaved();
renderVariants();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
