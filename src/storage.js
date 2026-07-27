const STORAGE_KEY = 'namefoundry.saved.v1';

export function loadSaved() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function saveCandidate(candidate) {
  const saved = loadSaved();
  const next = [candidate, ...saved.filter((item) => item.id !== candidate.id)].slice(0, 50);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function removeCandidate(id) {
  const next = loadSaved().filter((item) => item.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
