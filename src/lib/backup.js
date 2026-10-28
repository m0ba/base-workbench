import JSZip from 'jszip';
import { APP_FORMAT_VERSION, normalizeState } from './defaults.js';

const APP_ID = 'base-workbench';

export async function buildBackup(state) {
  const normalized = normalizeState(JSON.parse(JSON.stringify(state)));
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({
    app: APP_ID,
    formatVersion: APP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    counts: {
      logs: normalized.logs.length,
      tasks: normalized.tasks.length,
      equipment: normalized.equipment.length,
      archivedPurchases: normalized.archivedPurchases.length,
      modules: normalized.modules.length
    }
  }, null, 2));
  zip.file('data.json', JSON.stringify(normalized, null, 2));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export async function readBackup(file) {
  const zip = await JSZip.loadAsync(file);
  const manifestFile = zip.file('manifest.json');
  const dataFile = zip.file('data.json');
  if (!manifestFile || !dataFile) throw new Error('备份包缺少必要文件');

  const manifest = JSON.parse(await manifestFile.async('string'));
  if (manifest.app !== APP_ID) throw new Error('这不是基地工作台备份包');
  if (!Number.isInteger(Number(manifest.formatVersion))) throw new Error('备份包缺少有效的格式版本');
  if (Number(manifest.formatVersion) > APP_FORMAT_VERSION) {
    throw new Error('备份包来自更新版本的工作台，请先升级应用');
  }

  const rawState = JSON.parse(await dataFile.async('string'));
  if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) {
    throw new Error('备份数据格式不正确');
  }
  if (!Number.isInteger(Number(rawState.formatVersion))) throw new Error('备份数据缺少有效的格式版本');
  if (Number(rawState.formatVersion) > APP_FORMAT_VERSION) {
    throw new Error('备份数据来自更新版本的工作台，请先升级应用');
  }
  for (const collection of ['logs', 'equipment', 'modules']) {
    if (!Array.isArray(rawState[collection])) {
      throw new Error(`备份数据缺少“${collection}”记录列表`);
    }
    if (rawState[collection].some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
      throw new Error(`备份中的“${collection}”包含无效记录`);
    }
    if (rawState[collection].some((item) => typeof item.id !== 'string' || !item.id.trim())) {
      throw new Error(`备份中的“${collection}”记录缺少唯一编号`);
    }
  }
  if (rawState.tasks != null && !Array.isArray(rawState.tasks)) {
    throw new Error('备份数据中的“tasks”记录列表格式不正确');
  }
  if (Array.isArray(rawState.tasks)) {
    if (rawState.tasks.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
      throw new Error('备份中的“tasks”包含无效记录');
    }
    if (rawState.tasks.some((item) => typeof item.id !== 'string' || !item.id.trim())) {
      throw new Error('备份中的“tasks”记录缺少唯一编号');
    }
  }
  for (const collection of ['archivedPurchases', 'purchases']) {
    if (rawState[collection] != null && !Array.isArray(rawState[collection])) {
      throw new Error(`备份数据中的“${collection}”格式不正确`);
    }
  }
  const state = normalizeState(rawState);
  return {
    manifest,
    state,
    archivedLegacyPurchaseCount: Array.isArray(rawState.purchases) ? rawState.purchases.length : 0
  };
}

function mergeById(current = [], incoming = [], preferIncoming = false) {
  const map = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) {
    const existing = map.get(item.id);
    if (!existing || preferIncoming || String(item.updatedAt || '') > String(existing.updatedAt || '')) {
      map.set(item.id, item);
    }
  }
  return [...map.values()];
}

function mergeTasks(current = [], incoming = []) {
  const map = new Map(current.map((task) => [task.id, task]));
  for (const task of incoming) {
    const existing = map.get(task.id);
    if (!existing) {
      map.set(task.id, task);
      continue;
    }
    const newer = String(task.updatedAt || '') >= String(existing.updatedAt || '') ? task : existing;
    map.set(task.id, {
      ...existing,
      ...newer,
      sourceLogIds: [...new Set([
        ...(existing.sourceLogIds || []),
        ...(task.sourceLogIds || [])
      ])]
    });
  }
  return [...map.values()];
}

function deduplicateLogsByDate(logs) {
  const byDate = new Map();
  for (const log of logs) {
    const current = byDate.get(log.date);
    if (!current || String(log.updatedAt || '') > String(current.updatedAt || '')) {
      byDate.set(log.date, log);
    }
  }
  return [...byDate.values()];
}

export function mergeBackupState(current, incoming) {
  return {
    ...current,
    formatVersion: APP_FORMAT_VERSION,
    logs: deduplicateLogsByDate(mergeById(current.logs, incoming.logs)),
    tasks: mergeTasks(current.tasks, incoming.tasks),
    equipment: mergeById(current.equipment, incoming.equipment),
    archivedPurchases: mergeById(current.archivedPurchases, incoming.archivedPurchases),
    modules: mergeById(current.modules, incoming.modules, true),
    preferences: {
      ...current.preferences,
      ...incoming.preferences,
      locations: [...new Set([
        ...(incoming.preferences?.locations || []),
        ...(current.preferences?.locations || [])
      ].map((location) => String(location || '').trim()).filter(Boolean))].slice(0, 30)
    },
    updatedAt: new Date().toISOString()
  };
}
