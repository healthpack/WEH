export const KEY_STORAGE_NAME = 'weh.apiKey';

export function readSavedKey() {
  try { return window.localStorage.getItem(KEY_STORAGE_NAME)?.trim() || ''; }
  catch { return ''; }
}

export function saveValidatedKey(key) {
  try { window.localStorage.setItem(KEY_STORAGE_NAME, key); return true; }
  catch { return false; }
}

export function accountIdFromPath(pathname, base = '/') {
  if (!pathname.startsWith(base)) return null;
  const match = pathname.slice(base.length).match(/^([a-f\d]{24})\/?$/i);
  return match ? match[1].toLowerCase() : null;
}

export function accountPath(id, base = '/') {
  if (!/^[a-f\d]{24}$/i.test(id)) throw Error('Enter a valid account ID.');
  return base + id.toLowerCase();
}
