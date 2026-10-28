export const APP_FORMAT_VERSION = 4;
export const APP_VERSION = '0.3.2';

export function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `bw-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function migrateTasksFromLogs(logs) {
  const tasksByKey = new Map();
  const orderedLogs = [...logs].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

  for (const log of orderedLogs) {
    const entries = [
      { status: 'active', title: log.inProgress },
      { status: 'planned', title: log.nextStep }
    ];
    for (const entry of entries) {
      const title = String(entry.title || '').trim();
      if (!title) continue;
      const normalized = title.replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN');
      const key = entry.status + ':' + normalized;
      const sourceLogIds = log.id ? [String(log.id)] : [];
      const existing = tasksByKey.get(key);
      if (existing) {
        existing.sourceLogIds = [...new Set([...existing.sourceLogIds, ...sourceLogIds])];
        continue;
      }
      const fallbackDate = /^\d{4}-\d{2}-\d{2}$/.test(String(log.date || ''))
        ? new Date(String(log.date) + 'T12:00:00').toISOString()
        : new Date().toISOString();
      tasksByKey.set(key, {
        id: 'legacy-' + entry.status + '-' + hashText(key),
        title,
        kind: entry.status,
        status: entry.status,
        resumeStatus: entry.status,
        location: String(log.location || ''),
        startAt: '',
        dueAt: '',
        remindAfter: '',
        startedAt: '',
        completedAt: '',
        sourceLogIds,
        createdAt: log.createdAt || fallbackDate,
        updatedAt: log.updatedAt || fallbackDate
      });
    }
  }
  return [...tasksByKey.values()];
}

function normalizeTaskTitle(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN');
}

function linkTasksToLogs(logs, tasks) {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  return logs.map((log) => {
    const findTask = (idField, titleField, expectedKind) => {
      const title = normalizeTaskTitle(log[titleField]);
      if (!title) return '';
      const linked = taskById.get(log[idField]);
      if (linked && normalizeTaskTitle(linked.title) === title) return linked.id;
      const sourceTasks = tasks.filter((task) =>
        task.sourceLogIds.includes(log.id) && normalizeTaskTitle(task.title) === title
      );
      return (sourceTasks.find((task) => task.kind === expectedKind) || sourceTasks[0])?.id || '';
    };

    return {
      ...log,
      inProgressTaskId: findTask('inProgressTaskId', 'inProgress', 'active'),
      nextStepTaskId: findTask('nextStepTaskId', 'nextStep', 'planned')
    };
  });
}

export function createDefaultModules() {
  return [
    {
      id: 'reserved-agricultural-expert',
      title: '农事专家',
      icon: 'leaf',
      description: '预留入口',
      status: 'reserved',
      target: null,
      locked: true
    },
    {
      id: 'reserved-reimbursement',
      title: '报账助手',
      icon: 'receipt',
      description: '预留入口',
      status: 'reserved',
      target: null,
      locked: true
    },
    {
      id: 'future-module-1',
      title: '新模块 01',
      icon: 'sparkles',
      description: '为未来的基地工具预留',
      status: 'reserved',
      target: null,
      locked: false
    },
    {
      id: 'future-module-2',
      title: '新模块 02',
      icon: 'chart',
      description: '为未来的基地工具预留',
      status: 'reserved',
      target: null,
      locked: false
    },
    {
      id: 'future-module-3',
      title: '新模块 03',
      icon: 'box',
      description: '为未来的基地工具预留',
      status: 'reserved',
      target: null,
      locked: false
    }
  ];
}

export function createEmptyState() {
  return {
    formatVersion: APP_FORMAT_VERSION,
    logs: [],
    tasks: [],
    equipment: [],
    archivedPurchases: [],
    modules: createDefaultModules(),
    preferences: {
      baseName: '我的基地',
      baseDescription: '记录基地日常，管理设备与工作进度。',
      baseLocation: '',
      locations: [],
      lastOpenedPage: 'base',
      releaseLinks: { mac: '', windows: '', android: '' }
    },
    updatedAt: new Date().toISOString()
  };
}

export function normalizeState(value) {
  const empty = createEmptyState();
  if (!value || typeof value !== 'object') return empty;

  const defaults = createDefaultModules();
  const modulesById = new Map(defaults.map((item) => [item.id, item]));
  if (Array.isArray(value.modules)) {
    for (const item of value.modules) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string') continue;
      modulesById.set(item.id, {
        ...(modulesById.get(item.id) || {}),
        ...item,
        target: item.target ?? null
      });
    }
  }
  const modules = [...modulesById.values()];

  const purchaseHistory = [
    ...(Array.isArray(value.archivedPurchases) ? value.archivedPurchases : []),
    ...(Array.isArray(value.purchases) ? value.purchases : [])
  ];
  const archivedPurchases = [...new Map(
    purchaseHistory.map((item, index) => [item?.id || 'legacy-purchase-' + index, item])
  ).values()];
  const logs = Array.isArray(value.logs)
    ? value.logs
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        ...item,
        id: typeof item.id === 'string' && item.id ? item.id : makeId(),
        date: String(item.date || ''),
        location: String(item.location || ''),
        inProgressDueAt: String(item.inProgressDueAt || ''),
        nextStartAt: String(item.nextStartAt || ''),
        inProgressTaskId: String(item.inProgressTaskId || ''),
        nextStepTaskId: String(item.nextStepTaskId || ''),
        createdAt: String(item.createdAt || ''),
        updatedAt: String(item.updatedAt || item.createdAt || '')
      }))
    : [];
  const taskStatuses = new Set(['active', 'planned', 'done', 'paused', 'cancelled']);
  const tasks = Array.isArray(value.tasks)
    ? value.tasks
      .filter((item) => item && typeof item === 'object' && typeof item.title === 'string' && item.title.trim())
      .map((item) => ({
        ...item,
        id: typeof item.id === 'string' && item.id ? item.id : makeId(),
        title: item.title.trim(),
        status: taskStatuses.has(item.status) ? item.status : 'active',
        kind: item.kind === 'planned' || item.status === 'planned' || item.resumeStatus === 'planned' ? 'planned' : 'active',
        resumeStatus: item.resumeStatus === 'planned' || item.resumeStatus === 'active'
          ? item.resumeStatus
          : item.status === 'planned' || item.kind === 'planned' ? 'planned' : 'active',
        location: String(item.location || ''),
        startAt: String(item.startAt || ''),
        dueAt: String(item.dueAt || ''),
        remindAfter: String(item.remindAfter || ''),
        startedAt: String(item.startedAt || ''),
        completedAt: String(item.completedAt || ''),
        sourceLogIds: Array.isArray(item.sourceLogIds) ? [...new Set(item.sourceLogIds.map(String))] : [],
        createdAt: String(item.createdAt || ''),
        updatedAt: String(item.updatedAt || item.createdAt || '')
      }))
    : [];
  const storedFormatVersion = Number(value.formatVersion || 0);
  if (storedFormatVersion < APP_FORMAT_VERSION || !Array.isArray(value.tasks)) {
    for (const legacyTask of migrateTasksFromLogs(logs)) {
      const legacySources = new Set(legacyTask.sourceLogIds);
      const existing = tasks.find((task) =>
        task.kind === legacyTask.kind && normalizeTaskTitle(task.title) === normalizeTaskTitle(legacyTask.title) && (
          task.status === legacyTask.status || task.sourceLogIds.some((id) => legacySources.has(id))
        )
      );
      if (existing) {
        existing.sourceLogIds = [...new Set([...existing.sourceLogIds, ...legacyTask.sourceLogIds])];
        continue;
      }
      tasks.push(legacyTask);
    }
  }
  if (storedFormatVersion < APP_FORMAT_VERSION) {
    for (const task of tasks) {
      if (!task.id.startsWith('legacy-')) continue;
      task.startAt = '';
      task.dueAt = '';
      task.remindAfter = '';
    }
  }
  const linkedLogs = linkTasksToLogs(logs, tasks);
  const savedLocationHistory = [
    ...(Array.isArray(value.preferences?.locations) ? value.preferences.locations : []),
    ...[...logs]
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .map((item) => item.location)
  ];
  const locations = [...new Set(savedLocationHistory.map((location) => String(location || '').trim()).filter(Boolean))].slice(0, 30);
  const preferences = value.preferences && typeof value.preferences === 'object' ? value.preferences : {};

  return {
    formatVersion: APP_FORMAT_VERSION,
    logs: linkedLogs,
    tasks,
    equipment: Array.isArray(value.equipment) ? value.equipment : [],
    archivedPurchases,
    modules,
    preferences: {
      ...empty.preferences,
      ...preferences,
      baseLocation: typeof preferences.baseLocation === 'string' ? preferences.baseLocation : '',
      locations,
      releaseLinks: { ...empty.preferences.releaseLinks, ...(preferences.releaseLinks || {}) }
    },
    updatedAt: value.updatedAt || new Date().toISOString()
  };
}

export function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

export function formatDate(dateKey, options = { month: 'long', day: 'numeric' }) {
  if (!dateKey) return '';
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return new Intl.DateTimeFormat('zh-CN', options).format(date);
}

export function formatMoney(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 2
  }).format(Number.isFinite(amount) ? amount : 0);
}
