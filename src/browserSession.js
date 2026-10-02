export const KEY_STORAGE_NAME = 'weh.apiKey';

export function readSavedKey() {
  try { return window.localStorage.getItem(KEY_STORAGE_NAME)?.trim() || ''; }
  catch { return ''; }
}

export function saveValidatedKey(key) {
  try { window.localStorage.setItem(KEY_STORAGE_NAME, key); return true; }
  catch { return false; }
}

export function accountIdsFromPath(pathname, base = '/') {
  if (!pathname.startsWith(base)) return [];
  const match = pathname.slice(base.length).match(/^([a-f\d]{24})(?:\/([a-f\d]{24}))?\/?$/i);
  return match ? [...new Set(match.slice(1).filter(Boolean).map(id=>id.toLowerCase()))] : [];
}

export function accountIdFromPath(pathname, base = '/') {
  const ids=accountIdsFromPath(pathname,base);
  return ids.length===1 ? ids[0] : null;
}

export function accountPath(value, base = '/') {
  const ids=Array.isArray(value)?value:[value];
  if (!ids.length || ids.length>2 || ids.some(id=>!/^[a-f\d]{24}$/i.test(id))) throw Error('Enter a valid account ID.');
  return base + [...new Set(ids.map(id=>id.toLowerCase()))].join('/');
}
