import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RESULT_STATUS,
  calculateScore,
  generateVariants,
  normalizeInput,
  resultsToCsv,
  toHandle,
  toSlug
} from '../src/core.js';

test('normalizes accents and punctuation', () => {
  assert.equal(normalizeInput('  Árvíztűrő  '), 'Arvizturo');
  assert.equal(toHandle('Render Lane!'), 'renderlane');
  assert.equal(toSlug('Render Lane!'), 'render-lane');
});

test('generates deduplicated launch variants', () => {
  const variants = generateVariants('Renderlane');
  assert.equal(variants[0].value, 'renderlane');
  assert.ok(variants.some((variant) => variant.value === 'getrenderlane'));
  assert.equal(new Set(variants.map((variant) => variant.value)).size, variants.length);
});

test('scores only weighted checks and discounts low-confidence DNS fallback', () => {
  const result = calculateScore([
    { status: RESULT_STATUS.AVAILABLE, weight: 10 },
    { status: RESULT_STATUS.TAKEN, weight: 10 },
    { status: RESULT_STATUS.LIKELY_AVAILABLE, weight: 10 },
    { status: RESULT_STATUS.MANUAL, weight: 0 }
  ]);
  assert.equal(result.score, 47);
});

test('exports valid CSV escaping', () => {
  const csv = resultsToCsv('renderlane', [{
    category: 'Domains',
    providerName: 'renderlane.com',
    status: 'available',
    confidence: 'high',
    url: 'https://example.com',
    note: 'Available, verify'
  }]);
  assert.match(csv, /"Available, verify"/);
});
