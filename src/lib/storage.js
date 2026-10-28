import { createEmptyState, deepCopy, normalizeState } from './defaults.js';

const DB_NAME = 'base-workbench-local';
const DB_VERSION = 1;
const STORE_NAME = 'workspace';
const STATE_KEY = 'state';
const SNAPSHOT_KEY = 'safety-snapshot';
const FALLBACK_KEY = 'base-workbench:state:v1';

let databasePromise;

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local database'));
  });
  return databasePromise;
}

function readFallback() {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export async function loadState() {
  try {
    const db = await openDatabase();
    const value = await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(STATE_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    if (value) return normalizeState(value);
  } catch {
    // Use localStorage as a small, local-only fallback when IndexedDB is unavailable.
  }
  return readFallback() || createEmptyState();
}

export async function saveState(value) {
  const safeValue = normalizeState(JSON.parse(JSON.stringify(value)));
  safeValue.updatedAt = new Date().toISOString();

  try {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(safeValue, STATE_KEY);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Could not save local data'));
      transaction.onabort = () => reject(transaction.error || new Error('Local data save was aborted'));
    });
  } catch {
    try {
      localStorage.setItem(FALLBACK_KEY, JSON.stringify(safeValue));
    } catch (error) {
      throw new Error(`无法保存到本机存储：${error.message}`);
    }
  }
  return safeValue;
}

export async function saveSafetySnapshot(value) {
  const snapshot = {
    savedAt: new Date().toISOString(),
    state: normalizeState(JSON.parse(JSON.stringify(value)))
  };

  try {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(snapshot, SNAPSHOT_KEY);
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error || new Error('Could not save safety snapshot'));
    });
  } catch {
    localStorage.setItem(`${FALLBACK_KEY}:snapshot`, JSON.stringify(snapshot));
  }
}

export async function loadSafetySnapshot() {
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(SNAPSHOT_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    try {
      const value = localStorage.getItem(`${FALLBACK_KEY}:snapshot`);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }
}

export async function restoreSafetySnapshot() {
  const snapshot = await loadSafetySnapshot();
  if (!snapshot?.state) throw new Error('没有找到本机安全备份');
  const restored = normalizeState(deepCopy(snapshot.state));
  await saveState(restored);
  return restored;
}
