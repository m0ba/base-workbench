<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, toRaw, watch } from 'vue';
import { Capacitor } from '@capacitor/core';
import appPackage from '../package.json';
import AppIcon from './components/AppIcon.vue';
import heroImage from './assets/cucumber-hero.webp';
import { buildBackup, mergeBackupState, readBackup } from './lib/backup.js';
import { APP_VERSION, createEmptyState, deepCopy, formatDate, formatMoney, makeId, normalizeState, todayKey } from './lib/defaults.js';
import { createLogRecord, getCurrentWeekBounds, sortLogs } from './lib/logs.js';
import { loadSafetySnapshot, loadState, saveSafetySnapshot, saveState } from './lib/storage.js';

const VERSION = appPackage.version || APP_VERSION;
const LOGIN_PASSWORD = 'gxty';
const AUTH_STORAGE_KEY = 'base-workbench:authenticated:v1';
const navItems = [
  { id: 'base', title: '我的基地', icon: 'building' },
  { id: 'dashboard', title: '工作台', icon: 'grid' },
  { id: 'logs', title: '工作日志', icon: 'note' },
  { id: 'inventory', title: '设备管理', icon: 'box' },
  { id: 'modules', title: '模块中心', icon: 'sparkles' }
];
const mobileNavItems = [
  ...navItems.slice(0, 4),
  { id: 'reserved-expert', title: '农事专家', icon: 'leaf', reserved: true },
  { id: 'reimbursement', title: '报账助手', icon: 'receipt', integrated: true },
  navItems[4]
];
const settingsItems = [
  { id: 'profile', title: '基地资料', icon: 'building' },
  { id: 'data', title: '数据迁移', icon: 'archive' },
  { id: 'system', title: '系统信息', icon: 'settings' },
  { id: 'integrations', title: '应用接入', icon: 'plug' },
  { id: 'updates', title: '版本与更新', icon: 'refresh' },
  { id: 'help', title: '使用帮助', icon: 'help' },
  { id: 'about', title: '关于工作台', icon: 'info' }
];
const releasePlatforms = [
  { id: 'mac', name: 'Mac 安装包', icon: 'monitor' },
  { id: 'windows', name: 'Windows 安装包', icon: 'monitor' },
  { id: 'android', name: 'Android APK', icon: 'phone' },
  { id: 'reimbursement', name: '报账助手安装包', icon: 'receipt' }
];
const defaultReleaseLink = 'https://github.com/m0ba/base-workbench/releases/latest';
const defaultReimbursementLink = `${import.meta.env.BASE_URL}tools/reimbursement/`;
const reimbursementDownloadLink = 'https://github.com/m0ba/reimbursement-assistant/releases/latest';
const reimbursementAppId = 'reimbursement-assistant';

const authenticated = ref(false);
const loginPassword = ref('');
const passwordVisible = ref(false);
const loginError = ref('');
const loginBusy = ref(false);
const workspaceReady = ref(false);
const page = ref('base');
const state = reactive(createEmptyState());
const savedLabel = ref('本机保存');
const toast = ref('');
const settingsOpen = ref(false);
const settingsTab = ref('profile');
const settingsName = ref('');
const settingsDescription = ref('');
const settingsLocation = ref('');
const settingsReleaseLinks = reactive({ mac: '', windows: '', android: '', reimbursement: '' });
const settingsReimbursementLink = ref('');
const reimbursementLaunching = ref(false);
const modal = ref('');
const modalMode = ref('create');
const formError = ref('');
const confirmAction = ref(null);
const importPending = ref(null);
const snapshotInfo = ref(null);
const isBusy = ref(false);
const logSearch = ref('');
const logDateFilter = ref('');
const dashboardLocationOpen = ref(false);
const logLocationOpen = ref(false);
const dashboardLocationActiveIndex = ref(-1);
const logLocationActiveIndex = ref(-1);
const equipmentSearch = ref('');
const equipmentPage = ref(1);
const equipmentPageSize = 20;
const expandedLogIds = ref([]);
const importFileInput = ref(null);
const equipmentEditId = ref('');
const reminderTaskId = ref('');
const reminderRescheduleAt = ref('');
const reminderRescheduleOpen = ref(false);
const taskScheduleTargetId = ref('');
const taskScheduleForm = ref('');
let saveTimer;
let toastTimer;
let reminderInterval;
let reminderAdvanceTimer;

const dashboardDraft = reactive(blankLogForm());
const logForm = reactive(blankLogForm());
const equipmentForm = reactive(blankEquipmentForm());
const moduleForm = reactive({ id: '', title: '', icon: 'sparkles' });

function blankLogForm(date = todayKey()) {
  return {
    id: '', date, location: '', completed: '', inProgress: '', nextStep: '',
    inProgressDueAt: '', nextStartAt: '', inProgressTaskId: '', nextStepTaskId: ''
  };
}

function blankEquipmentForm() {
  return {
    name: '', category: '', model: '', serialNumber: '', location: '', status: '在用',
    purchaseDate: todayKey(), purchasePrice: '', supplier: '', warrantyUntil: '', notes: ''
  };
}

function compareTaskSchedule(a, b, field) {
  const left = Date.parse(a[field] || '') || Number.POSITIVE_INFINITY;
  const right = Date.parse(b[field] || '') || Number.POSITIVE_INFINITY;
  return left - right || String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
}

function toDateTimeLocal(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(date);
}

const pageTitle = computed(() => navItems.find((item) => item.id === page.value)?.title || '我的基地');
const baseName = computed(() => state.preferences.baseName?.trim() || '我的基地');
const baseDescription = computed(() => state.preferences.baseDescription?.trim() || '记录基地日常，管理设备与工作进度。');
const baseLocation = computed(() => state.preferences.baseLocation?.trim() || '');
const currentDateText = computed(() => new Intl.DateTimeFormat('zh-CN', {
  weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
}).format(new Date()));
const currentDateShort = computed(() => new Intl.DateTimeFormat('zh-CN', {
  month: 'long', day: 'numeric', weekday: 'short'
}).format(new Date()));
const today = computed(() => todayKey());
const sortedLogs = computed(() => sortLogs(state.logs));
const todayLog = computed(() => state.logs.find((item) => item.date === today.value) || null);
const weekBounds = computed(() => getCurrentWeekBounds());
const weekLogs = computed(() => sortedLogs.value.filter((item) => item.date >= weekBounds.value.start && item.date <= weekBounds.value.end));
const logDaysThisWeek = computed(() => new Set(weekLogs.value.map((item) => item.date)).size);
const activePlans = computed(() => [...state.tasks]
  .filter((item) => item.status === 'active')
  .sort((a, b) => compareTaskSchedule(a, b, 'dueAt')));
const nextPlans = computed(() => [...state.tasks]
  .filter((item) => item.status === 'planned')
  .sort((a, b) => compareTaskSchedule(a, b, 'startAt')));
const archivedTasks = computed(() => [...state.tasks]
  .filter((item) => ['done', 'paused', 'cancelled'].includes(item.status))
  .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))));
const reminderTask = computed(() => state.tasks.find((item) => item.id === reminderTaskId.value) || null);
const reminderIsForStart = computed(() => reminderTask.value?.status === 'planned');
const taskScheduleTarget = computed(() => state.tasks.find((item) => item.id === taskScheduleTargetId.value) || null);
const savedLocations = computed(() => {
  const locations = [
    ...(state.preferences.locations || []),
    ...sortedLogs.value.map((item) => item.location || '')
  ];
  return [...new Set(locations.map((item) => String(item).trim()).filter(Boolean))];
});
const dashboardLocationOptions = computed(() => filterLocationOptions(dashboardDraft.location));
const logLocationOptions = computed(() => filterLocationOptions(logForm.location));
const recentLogs = computed(() => sortedLogs.value.slice(0, 3));
const activeItemsThisWeek = computed(() => state.tasks.filter((item) => item.status === 'active').length);
const filteredLogs = computed(() => {
  const query = logSearch.value.trim().toLocaleLowerCase('zh-CN');
  return sortedLogs.value.filter((item) => {
    if (logDateFilter.value && item.date !== logDateFilter.value) return false;
    if (!query) return true;
    return [item.date, item.location, item.completed, item.inProgress, item.nextStep, item.rawText]
      .some((value) => String(value || '').toLocaleLowerCase('zh-CN').includes(query));
  });
});
const filteredEquipment = computed(() => {
  const query = equipmentSearch.value.trim().toLocaleLowerCase('zh-CN');
  return [...state.equipment]
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh-CN'))
    .filter((item) => !query || [item.name, item.category, item.model, item.serialNumber, item.location, item.supplier]
      .some((value) => String(value || '').toLocaleLowerCase('zh-CN').includes(query)));
});
const equipmentPageCount = computed(() => Math.max(1, Math.ceil(filteredEquipment.value.length / equipmentPageSize)));
const currentEquipmentPage = computed(() => Math.min(equipmentPage.value, equipmentPageCount.value));
const visibleEquipment = computed(() => {
  const start = (currentEquipmentPage.value - 1) * equipmentPageSize;
  return filteredEquipment.value.slice(start, start + equipmentPageSize);
});
const equipmentLocationCount = computed(() => new Set(state.equipment.map((item) => item.location?.trim()).filter(Boolean)).size);
const reservedModules = computed(() => state.modules.filter((item) => item.locked));
const moduleSlots = computed(() => state.modules.filter((item) => !item.locked).slice(0, 3));
const expertModule = computed(() => reservedModules.value.find((item) => item.id === 'reserved-agricultural-expert'));
const reimbursementModule = computed(() => reservedModules.value.find((item) => item.id === 'reserved-reimbursement'));
const reimbursementAddress = computed(() => settingsReimbursementLink.value.trim() || new URL(defaultReimbursementLink, window.location.href).href);
const archivedPurchaseCount = computed(() => state.archivedPurchases.length);
const platformName = computed(() => {
  if (window.location.protocol === 'baseworkbench:') return 'Mac / Windows 桌面应用';
  if (Capacitor.isNativePlatform()) return Capacitor.getPlatform() === 'android' ? 'Android 应用' : '移动应用';
  return 'Web / PWA';
});

function handleGlobalKeydown(event) {
  if (event.key !== 'Escape') return;
  if (dashboardLocationOpen.value || logLocationOpen.value) {
    dashboardLocationOpen.value = false;
    logLocationOpen.value = false;
    dashboardLocationActiveIndex.value = -1;
    logLocationActiveIndex.value = -1;
  } else if (modal.value === 'backup') {
    cancelImport();
  } else if (modal.value === 'task-reminder') {
    dismissTaskReminder();
  } else if (modal.value === 'confirm') {
    cancelConfirm();
  } else if (modal.value) {
    modal.value = '';
  } else if (settingsOpen.value) {
    settingsOpen.value = false;
  }
}

watch([modal, settingsOpen], ([activeModal, activeSettings], [previousModal, previousSettings]) => {
  const blockingModal = activeModal && activeModal !== 'task-reminder';
  document.body.style.overflow = blockingModal || activeSettings ? 'hidden' : '';
  if (workspaceReady.value && !activeModal && !activeSettings && (previousModal || previousSettings)) {
    clearTimeout(reminderAdvanceTimer);
    reminderAdvanceTimer = setTimeout(processTaskReminders, 160);
  }
});
watch(equipmentSearch, () => { equipmentPage.value = 1; });
watch(equipmentPageCount, (count) => {
  if (equipmentPage.value > count) equipmentPage.value = count;
});

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown);
  document.addEventListener('click', handleLocationOutsideClick);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  reminderInterval = window.setInterval(processTaskReminders, 60_000);
  try {
    if (localStorage.getItem(AUTH_STORAGE_KEY) === '1') {
      authenticated.value = true;
      hydrateWorkspace();
    }
  } catch {
    // Keep the password gate available if local storage is disabled.
  }
});
onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalKeydown);
  document.removeEventListener('click', handleLocationOutsideClick);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  window.clearInterval(reminderInterval);
  clearTimeout(reminderAdvanceTimer);
  document.body.style.overflow = '';
});

watch(state, () => {
  if (!workspaceReady.value) return;
  savedLabel.value = '保存中…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await saveState(toRaw(state));
      savedLabel.value = '本机已保存';
    } catch (error) {
      savedLabel.value = '保存失败';
      showToast(error.message || '无法保存数据');
    }
  }, 220);
}, { deep: true });

async function hydrateWorkspace() {
  if (loginBusy.value) return;
  loginBusy.value = true;
  loginError.value = '';
  try {
    Object.assign(state, normalizeState(await loadState()));
    page.value = 'base';
    Object.assign(dashboardDraft, makeLogForm(state.logs.find((item) => item.date === todayKey()) || null));
    snapshotInfo.value = await loadSafetySnapshot();
    await saveState(toRaw(state));
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, '1');
    } catch {
      // The current session remains usable when persistent storage is unavailable.
    }
    authenticated.value = true;
    workspaceReady.value = true;
    savedLabel.value = '本机已保存';
    clearTimeout(reminderAdvanceTimer);
    reminderAdvanceTimer = setTimeout(processTaskReminders, 220);
    return true;
  } catch (error) {
    authenticated.value = false;
    workspaceReady.value = false;
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // Ignore blocked local storage.
    }
    loginError.value = error.message || '无法读取本机工作空间。';
    return false;
  } finally {
    loginBusy.value = false;
  }
}

async function unlockWorkspace() {
  if (loginBusy.value) return;
  if (loginPassword.value !== LOGIN_PASSWORD) {
    loginError.value = '密码不正确，请再试一次。';
    loginPassword.value = '';
    return;
  }
  await hydrateWorkspace();
}

function logout() {
  settingsOpen.value = false;
  authenticated.value = false;
  loginPassword.value = '';
  loginError.value = '';
  workspaceReady.value = false;
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // The in-memory sign out still takes effect.
  }
}

function makeLogForm(record = null) {
  if (!record) return blankLogForm();
  const activeTask = state.tasks.find((item) => item.id === record.inProgressTaskId);
  const plannedTask = state.tasks.find((item) => item.id === record.nextStepTaskId);
  return {
    id: record.id || '', date: record.date || todayKey(), location: record.location || '',
    completed: record.completed || '', inProgress: record.inProgress || '', nextStep: record.nextStep || '',
    inProgressDueAt: activeTask?.dueAt ?? record.inProgressDueAt ?? '',
    nextStartAt: plannedTask?.startAt ?? record.nextStartAt ?? '',
    inProgressTaskId: record.inProgressTaskId || '', nextStepTaskId: record.nextStepTaskId || ''
  };
}

function refreshDashboardDraft() {
  Object.assign(dashboardDraft, makeLogForm(state.logs.find((item) => item.date === todayKey()) || null));
}

function setPage(nextPage) {
  page.value = nextPage;
  state.preferences.lastOpenedPage = nextPage;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (nextPage !== 'logs' && modal.value === 'task-reminder') closeTaskReminder();
  if (nextPage === 'logs') {
    clearTimeout(reminderAdvanceTimer);
    reminderAdvanceTimer = setTimeout(processTaskReminders, 180);
  }
}

function reimbursementDesktopBridge() {
  return window.desktopWorkspace && typeof window.desktopWorkspace.openTool === 'function'
    ? window.desktopWorkspace
    : null;
}

function isValidToolAddress(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

async function openReimbursement() {
  if (reimbursementLaunching.value) return;
  const address = reimbursementAddress.value;
  if (!isValidToolAddress(address) && !address.startsWith('baseworkbench:')) return showToast('报账助手地址无效，请在设置中检查。');
  reimbursementLaunching.value = true;
  try {
    const bridge = reimbursementDesktopBridge();
    if (bridge) {
      const desktopAddress = address.startsWith('http:') || address.startsWith('https:')
        ? new URL(address).pathname + new URL(address).search + new URL(address).hash
        : address;
      const result = await bridge.openTool({
        id: reimbursementAppId,
        title: '报账助手',
        url: desktopAddress
      });
      if (!result?.ok) throw new Error(result?.message || '无法打开报账助手');
      return;
    }
    window.open(address, '_blank');
  } catch (error) {
    showToast(error.message || '报账助手暂时无法打开');
  } finally {
    reimbursementLaunching.value = false;
  }
}

function showToast(message) {
  toast.value = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.value = ''; }, 2800);
}

function normalizedTaskTitle(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN');
}

function detachTaskFromLog(taskId, logId, record) {
  if (!taskId || !logId || [record.inProgressTaskId, record.nextStepTaskId].includes(taskId)) return;
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  task.sourceLogIds = task.sourceLogIds.filter((id) => id !== logId);
  task.updatedAt = new Date().toISOString();
}

function syncTaskFromLog(record, current, kind, title, scheduleValue) {
  const isActive = kind === 'active';
  const linkField = isActive ? 'inProgressTaskId' : 'nextStepTaskId';
  const textField = isActive ? 'inProgress' : 'nextStep';
  const scheduleField = isActive ? 'dueAt' : 'startAt';
  const sourceTaskId = record[linkField] || current?.[linkField] || '';
  let task = state.tasks.find((item) => item.id === sourceTaskId) || null;
  const normalizedTitle = normalizedTaskTitle(title);

  if (!normalizedTitle) {
    record[linkField] = '';
    detachTaskFromLog(sourceTaskId, record.id, record);
    return;
  }

  if (task && normalizedTaskTitle(task.title) !== normalizedTitle) {
    record[linkField] = '';
    detachTaskFromLog(task.id, record.id, record);
    task = null;
  }

  if (!task) {
    task = state.tasks.find((item) =>
      item.kind === kind && item.status === kind && normalizedTaskTitle(item.title) === normalizedTitle
    ) || null;
  }

  const now = new Date().toISOString();
  if (!task) {
    task = {
      id: makeId(),
      title: String(title).trim(),
      kind,
      status: kind,
      resumeStatus: kind,
      location: String(record.location || '').trim(),
      startAt: isActive ? '' : String(scheduleValue || ''),
      dueAt: isActive ? String(scheduleValue || '') : '',
      remindAfter: '',
      startedAt: isActive ? now : '',
      completedAt: '',
      sourceLogIds: [record.id],
      createdAt: now,
      updatedAt: now
    };
    state.tasks.push(task);
  } else {
    const attachedToThisLog = sourceTaskId === task.id;
    task.title = String(title).trim();
    task.location = String(record.location || '').trim();
    if (attachedToThisLog || scheduleValue) task[scheduleField] = String(scheduleValue || '');
    task.sourceLogIds = [...new Set([...(task.sourceLogIds || []), record.id])];
    task.updatedAt = now;
  }
  record[linkField] = task.id;
  const previousTitle = normalizedTaskTitle(current?.[textField]);
  if (previousTitle && previousTitle !== normalizedTitle) {
    detachTaskFromLog(current?.[linkField], record.id, record);
  }
}

function syncLogTasks(record, current) {
  syncTaskFromLog(record, current, 'active', record.inProgress, record.inProgressDueAt);
  syncTaskFromLog(record, current, 'planned', record.nextStep, record.nextStartAt);
}

function taskStatusLabel(status) {
  return ({ active: '正在做', planned: '下一步', done: '已完成', paused: '已暂停', cancelled: '已取消' })[status] || '正在做';
}

function updateTaskSchedule(task, field, value) {
  if (!['dueAt', 'startAt'].includes(field)) return;
  const nextValue = String(value || '').trim();
  if (nextValue && Number.isNaN(Date.parse(nextValue))) {
    showToast('时间格式不正确，请重新选择。');
    return;
  }
  task[field] = nextValue;
  task.remindAfter = '';
  task.updatedAt = new Date().toISOString();
  for (const log of state.logs) {
    if (field === 'dueAt' && log.inProgressTaskId === task.id) log.inProgressDueAt = nextValue;
    if (field === 'startAt' && log.nextStepTaskId === task.id) log.nextStartAt = nextValue;
  }
  if (field === 'dueAt' && dashboardDraft.inProgressTaskId === task.id) dashboardDraft.inProgressDueAt = nextValue;
  if (field === 'startAt' && dashboardDraft.nextStepTaskId === task.id) dashboardDraft.nextStartAt = nextValue;
  showToast(nextValue ? '提醒时间已更新' : '提醒时间已清除');
  if (nextValue && Date.parse(nextValue) <= Date.now()) {
    clearTimeout(reminderAdvanceTimer);
    reminderAdvanceTimer = setTimeout(processTaskReminders, 180);
  }
}

function openTaskSchedule(task) {
  if (!task) return;
  taskScheduleTargetId.value = task.id;
  taskScheduleForm.value = task.status === 'planned' ? task.startAt || '' : task.dueAt || '';
  modal.value = 'task-schedule';
}

function saveTaskScheduleModal() {
  const task = taskScheduleTarget.value;
  if (!task) {
    modal.value = '';
    return;
  }
  const field = task.status === 'planned' ? 'startAt' : 'dueAt';
  updateTaskSchedule(task, field, taskScheduleForm.value);
  modal.value = '';
}

function changeTaskStatus(task, nextStatus, announce = true) {
  if (!task || !['active', 'planned', 'done', 'paused', 'cancelled'].includes(nextStatus)) return;
  const now = new Date().toISOString();
  if (['done', 'paused', 'cancelled'].includes(nextStatus) && ['active', 'planned'].includes(task.status)) {
    task.resumeStatus = task.status;
  }
  if (nextStatus === 'active' || nextStatus === 'planned') {
    task.kind = nextStatus;
    task.resumeStatus = nextStatus;
    task.completedAt = '';
    if (nextStatus === 'active' && !task.startedAt) task.startedAt = now;
  }
  task.status = nextStatus;
  task.remindAfter = '';
  task.updatedAt = now;
  if (nextStatus === 'done') task.completedAt = now;
  if (announce) showToast('事项状态已更新：' + taskStatusLabel(nextStatus));
  clearTimeout(reminderAdvanceTimer);
  reminderAdvanceTimer = setTimeout(processTaskReminders, 180);
}

function restoreTask(task) {
  if (!task || !['done', 'paused', 'cancelled'].includes(task.status)) return;
  const resumeStatus = ['active', 'planned'].includes(task.resumeStatus)
    ? task.resumeStatus
    : task.kind === 'planned' ? 'planned' : 'active';
  confirmAction.value = {
    type: 'task-status',
    id: task.id,
    nextStatus: resumeStatus,
    title: '恢复这个事项？',
    detail: '“' + task.title + '”将恢复到「' + taskStatusLabel(resumeStatus) + '」。',
    confirmLabel: '确认恢复'
  };
  modal.value = 'confirm';
}

function dueTaskCandidates() {
  const now = Date.now();
  return state.tasks
    .filter((task) => ['active', 'planned'].includes(task.status))
    .map((task) => ({
      task,
      schedule: task.status === 'planned' ? task.startAt : task.dueAt
    }))
    .filter(({ task, schedule }) => {
      if (!String(schedule || '').trim()) return false;
      const dueAt = Date.parse(schedule || '');
      const remindAfter = Date.parse(task.remindAfter || '');
      return Number.isFinite(dueAt) && dueAt <= now && (!Number.isFinite(remindAfter) || remindAfter <= now);
    })
    .sort((a, b) => (Date.parse(a.schedule) || 0) - (Date.parse(b.schedule) || 0));
}

function processTaskReminders() {
  if (!workspaceReady.value || !authenticated.value || page.value !== 'logs' || settingsOpen.value || modal.value) return;
  if (document.visibilityState === 'hidden') return;
  const next = dueTaskCandidates()[0]?.task;
  if (!next) return;
  reminderTaskId.value = next.id;
  reminderRescheduleAt.value = toDateTimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1000));
  reminderRescheduleOpen.value = false;
  modal.value = 'task-reminder';
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') processTaskReminders();
}

function closeTaskReminder() {
  reminderTaskId.value = '';
  reminderRescheduleOpen.value = false;
  modal.value = '';
}

function openReminderReschedule() {
  reminderRescheduleAt.value = toDateTimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1000));
  reminderRescheduleOpen.value = true;
}

function dismissTaskReminder() {
  const task = reminderTask.value;
  if (task) {
    task.remindAfter = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    task.updatedAt = new Date().toISOString();
  }
  closeTaskReminder();
  showToast('已安排 1 小时后再次提醒');
}

function postponeTaskReminder() {
  const task = reminderTask.value;
  const nextTime = reminderRescheduleAt.value;
  const timestamp = Date.parse(nextTime || '');
  if (!task) return closeTaskReminder();
  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
    showToast('请选择一个未来的时间再延期。');
    return;
  }
  const field = task.status === 'planned' ? 'startAt' : 'dueAt';
  task[field] = nextTime;
  task.remindAfter = '';
  task.updatedAt = new Date().toISOString();
  closeTaskReminder();
  showToast(task.status === 'planned' ? '开始时间已延期' : '预计完成时间已延期');
}

function commitLog(fields) {
  const completed = String(fields.completed || '').trim();
  const inProgress = String(fields.inProgress || '').trim();
  const nextStep = String(fields.nextStep || '').trim();
  const location = String(fields.location || '').trim();
  const date = String(fields.date || '').trim();
  const inProgressDueAt = String(fields.inProgressDueAt || '').trim();
  const nextStartAt = String(fields.nextStartAt || '').trim();
  if (!completed && !inProgress && !nextStep) return { error: '请至少填写完成、正在做或下一步中的一项。' };
  if (!date) return { error: '请选择记录日期。' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: '记录日期格式不正确。' };
  if (!location) return { error: '请填写地点，方便之后按棚区回看。' };
  if (inProgressDueAt && !inProgress) return { error: '请先填写“正在做”的事项，再设置预计完成时间。' };
  if (nextStartAt && !nextStep) return { error: '请先填写“下一步计划”，再设置开始时间。' };
  if (inProgressDueAt && Number.isNaN(Date.parse(inProgressDueAt))) return { error: '预计完成时间格式不正确。' };
  if (nextStartAt && Number.isNaN(Date.parse(nextStartAt))) return { error: '下一步开始时间格式不正确。' };
  const sameDate = state.logs.find((item) => item.date === date);
  if (sameDate && sameDate.id !== fields.id) return { error: '这一天已经有一条日志，请编辑已有记录。' };
  const current = sameDate || (fields.id ? state.logs.find((item) => item.id === fields.id) : null);
  const record = createLogRecord({ completed, inProgress, nextStep, location, inProgressDueAt, nextStartAt }, date, current);
  if (current) {
    const index = state.logs.findIndex((item) => item.id === current.id);
    state.logs.splice(index, 1, record);
  } else {
    state.logs.push(record);
  }
  syncLogTasks(record, current);
  state.preferences.locations = [
    location,
    ...(state.preferences.locations || []).filter((item) => item !== location)
  ].slice(0, 30);
  if (date === todayKey()) refreshDashboardDraft();
  return { record, updated: Boolean(current) };
}

function saveDashboardLog() {
  const result = commitLog(dashboardDraft);
  if (result.error) return showToast(result.error);
  showToast(result.updated ? '今天的工作记录已更新' : '今天的工作记录已保存');
  clearTimeout(reminderAdvanceTimer);
  reminderAdvanceTimer = setTimeout(processTaskReminders, 180);
}

function openLogModal(record = null) {
  const existing = record || state.logs.find((item) => item.date === todayKey()) || null;
  modalMode.value = existing ? 'edit' : 'create';
  Object.assign(logForm, makeLogForm(existing));
  formError.value = '';
  logLocationOpen.value = false;
  logLocationActiveIndex.value = -1;
  modal.value = 'log';
}

function saveLogModal() {
  const result = commitLog(logForm);
  if (result.error) {
    formError.value = result.error;
    return;
  }
  modal.value = '';
  showToast(result.updated ? '工作日志已更新' : '工作日志已保存');
}

function chooseLocation(target, value) {
  target.location = value;
  if (target === dashboardDraft) {
    dashboardLocationOpen.value = false;
    dashboardLocationActiveIndex.value = -1;
  } else {
    logLocationOpen.value = false;
    logLocationActiveIndex.value = -1;
  }
}

function filterLocationOptions(query) {
  const normalizedQuery = String(query || '').trim().toLocaleLowerCase('zh-CN');
  return savedLocations.value
    .filter((location) => !normalizedQuery || location.toLocaleLowerCase('zh-CN').includes(normalizedQuery))
    .slice(0, 8);
}

function toggleLocationMenu(targetName) {
  if (targetName === 'dashboard') {
    dashboardLocationOpen.value = !dashboardLocationOpen.value;
    logLocationOpen.value = false;
    dashboardLocationActiveIndex.value = -1;
  } else {
    logLocationOpen.value = !logLocationOpen.value;
    dashboardLocationOpen.value = false;
    logLocationActiveIndex.value = -1;
  }
}

function handleLocationKeydown(event, targetName) {
  const dashboard = targetName === 'dashboard';
  const options = dashboard ? dashboardLocationOptions.value : logLocationOptions.value;
  const isOpen = dashboard ? dashboardLocationOpen : logLocationOpen;
  const activeIndex = dashboard ? dashboardLocationActiveIndex : logLocationActiveIndex;
  const target = dashboard ? dashboardDraft : logForm;

  if (event.key === 'Escape') {
    if (isOpen.value) {
      event.preventDefault();
      event.stopPropagation();
      isOpen.value = false;
      activeIndex.value = -1;
    }
    return;
  }
  if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && options.length) {
    event.preventDefault();
    isOpen.value = true;
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const start = activeIndex.value < 0 ? (direction === 1 ? -1 : 0) : activeIndex.value;
    activeIndex.value = (start + direction + options.length) % options.length;
    return;
  }
  if (event.key === 'Enter' && isOpen.value && activeIndex.value >= 0 && options[activeIndex.value]) {
    event.preventDefault();
    chooseLocation(target, options[activeIndex.value]);
  }
}

function handleLocationOutsideClick(event) {
  if (event.target instanceof Element && event.target.closest('.location-autocomplete')) return;
  dashboardLocationOpen.value = false;
  logLocationOpen.value = false;
  dashboardLocationActiveIndex.value = -1;
  logLocationActiveIndex.value = -1;
}

function isLogExpanded(id) {
  return expandedLogIds.value.includes(id);
}

function logHasLongText(item) {
  return [item.completed, item.inProgress, item.nextStep].some((value) => String(value || '').length > 96);
}

function toggleLogExpanded(id) {
  expandedLogIds.value = isLogExpanded(id)
    ? expandedLogIds.value.filter((itemId) => itemId !== id)
    : [...expandedLogIds.value, id];
}

function changeEquipmentPage(nextPage) {
  equipmentPage.value = Math.max(1, Math.min(equipmentPageCount.value, nextPage));
  document.querySelector('.inventory-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function askDelete(type, item) {
  confirmAction.value = {
    type,
    id: item.id,
    title: type === 'log' ? '删除这条工作日志？' : type === 'task' ? '删除这个事项？' : '删除这件设备？',
    detail: type === 'log'
      ? item.date + ' · ' + (item.location || '未填写地点') + '。删除后可通过本地迁移包恢复。'
      : type === 'task'
        ? item.title + ' 将从任务列表中永久移除。'
        : item.name + ' 将从设备台账中移除。'
  };
  modal.value = 'confirm';
}

function askTaskStatusChange(task, nextStatus) {
  if (!task) return;
  const prompts = {
    active: {
      title: '开始进行这个事项？',
      detail: '“' + task.title + '”将从下一步计划移到正在做。',
      confirmLabel: '开始进行'
    },
    done: {
      title: '确认完成这项工作？',
      detail: '“' + task.title + '”将移入已完成事项。',
      confirmLabel: '标记完成'
    },
    cancelled: {
      title: '取消这个事项？',
      detail: '“' + task.title + '”将移入已取消事项，之后仍可恢复。',
      confirmLabel: '确认取消'
    }
  };
  const prompt = prompts[nextStatus];
  if (!prompt) return;
  confirmAction.value = { type: 'task-status', id: task.id, nextStatus, ...prompt };
  modal.value = 'confirm';
}

function confirmIconName() {
  if (confirmAction.value?.type === 'restore') return 'archive';
  if (confirmAction.value?.type !== 'task-status') return 'trash';
  return confirmAction.value.nextStatus === 'done' ? 'check' : confirmAction.value.nextStatus === 'active' || confirmAction.value.nextStatus === 'planned' ? 'arrow' : 'close';
}

function confirmIconClass() {
  const action = confirmAction.value;
  return action?.type === 'restore' || (action?.type === 'task-status' && ['active', 'planned', 'done'].includes(action.nextStatus))
    ? 'confirm-icon-green'
    : 'confirm-icon-red';
}

function confirmButtonClass() {
  return confirmIconClass() === 'confirm-icon-green' ? 'button-primary' : 'button-danger';
}

function confirmButtonLabel() {
  if (confirmAction.value?.type === 'restore') return '恢复快照';
  return confirmAction.value?.confirmLabel || '确认删除';
}

function cancelConfirm() {
  modal.value = '';
  confirmAction.value = null;
}

function confirmDelete() {
  if (!confirmAction.value) return;
  if (confirmAction.value.type === 'log') {
    for (const task of state.tasks) {
      task.sourceLogIds = task.sourceLogIds.filter((id) => id !== confirmAction.value.id);
    }
    state.logs = state.logs.filter((item) => item.id !== confirmAction.value.id);
    refreshDashboardDraft();
  } else if (confirmAction.value.type === 'task') {
    state.tasks = state.tasks.filter((item) => item.id !== confirmAction.value.id);
  } else if (confirmAction.value.type === 'equipment') {
    state.equipment = state.equipment.filter((item) => item.id !== confirmAction.value.id);
  }
  modal.value = '';
  confirmAction.value = null;
  showToast('已删除');
}

function openEquipmentModal(item = null) {
  modalMode.value = item ? 'edit' : 'create';
  equipmentEditId.value = item?.id || '';
  Object.assign(equipmentForm, blankEquipmentForm(), item ? deepCopy(item) : {});
  formError.value = '';
  modal.value = 'equipment';
}

function saveEquipment() {
  const name = equipmentForm.name.trim();
  if (!name) {
    formError.value = '请填写设备名称。';
    return;
  }
  const existing = state.equipment.find((item) => item.id === equipmentEditId.value);
  const record = {
    ...deepCopy(equipmentForm),
    id: existing?.id || makeId(),
    name,
    purchasePrice: equipmentForm.purchasePrice === '' ? '' : Number(equipmentForm.purchasePrice),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (existing) {
    const index = state.equipment.findIndex((item) => item.id === existing.id);
    state.equipment.splice(index, 1, record);
  } else {
    state.equipment.push(record);
  }
  modal.value = '';
  showToast(existing ? '设备档案已更新' : '设备已加入台账');
}

function editModuleSlot(item) {
  moduleForm.id = item.id;
  moduleForm.title = item.title;
  moduleForm.icon = item.icon || 'sparkles';
  formError.value = '';
  modal.value = 'module';
}

function saveModule() {
  const item = state.modules.find((entry) => entry.id === moduleForm.id);
  if (!item || item.locked) return;
  item.title = moduleForm.title.trim() || '新模块';
  item.icon = moduleForm.icon;
  item.description = '为未来的基地工具预留';
  item.status = 'reserved';
  item.target = null;
  modal.value = '';
  showToast('模块卡片显示信息已保存');
}

function openSettings(tab = 'profile') {
  settingsTab.value = tab;
  settingsName.value = state.preferences.baseName || '我的基地';
  settingsDescription.value = state.preferences.baseDescription || '';
  settingsLocation.value = state.preferences.baseLocation || '';
  Object.assign(settingsReleaseLinks, { mac: '', windows: '', android: '', reimbursement: '', ...(state.preferences.releaseLinks || {}) });
  settingsReimbursementLink.value = state.preferences.toolLinks?.reimbursement || '';
  settingsOpen.value = true;
}

function saveBaseProfile() {
  const name = settingsName.value.trim();
  if (!name) return showToast('请填写基地名称');
  state.preferences.baseName = name;
  state.preferences.baseDescription = settingsDescription.value.trim();
  state.preferences.baseLocation = settingsLocation.value.trim();
  refreshDashboardDraft();
  showToast('基地资料已保存');
}

function saveReimbursementIntegration() {
  const raw = settingsReimbursementLink.value.trim();
  if (raw && !isValidToolAddress(raw)) return showToast('报账助手地址需使用有效的 HTTP 或 HTTPS 地址');
  state.preferences.toolLinks = {
    ...(state.preferences.toolLinks || {}),
    reimbursement: raw ? new URL(raw).href : ''
  };
  settingsReimbursementLink.value = state.preferences.toolLinks.reimbursement;
  showToast(raw ? '报账助手入口已更新' : '已恢复报账助手默认入口');
}

function saveReleaseLinks() {
  const next = {};
  for (const platform of ['mac', 'windows', 'android', 'reimbursement']) {
    const raw = settingsReleaseLinks[platform].trim();
    if (!raw) {
      next[platform] = '';
      continue;
    }
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:') throw new Error('only https');
      next[platform] = url.href;
    } catch {
      showToast('下载链接需使用有效的 HTTPS 地址');
      return;
    }
  }
  state.preferences.releaseLinks = next;
  Object.assign(settingsReleaseLinks, next);
  showToast('平台下载链接已保存');
}

function releaseLink(platform) {
  const raw = state.preferences.releaseLinks?.[platform]
    || (platform === 'reimbursement' ? reimbursementDownloadLink : defaultReleaseLink);
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

async function exportBackup() {
  if (isBusy.value) return;
  isBusy.value = true;
  try {
    const blob = await buildBackup(toRaw(state));
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = '基地工作台迁移包_' + todayKey() + '.bwbackup';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('完整迁移包已导出');
  } catch (error) {
    showToast('导出失败：' + error.message);
  } finally {
    isBusy.value = false;
  }
}

function selectBackupFile() {
  importFileInput.value?.click();
}

async function handleBackupFile(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  isBusy.value = true;
  try {
    importPending.value = { ...(await readBackup(file)), fileName: file.name };
    modal.value = 'backup';
  } catch (error) {
    showToast('无法读取迁移包：' + error.message);
  } finally {
    isBusy.value = false;
  }
}

function cancelImport() {
  modal.value = '';
  importPending.value = null;
}

async function applyBackup(mode) {
  if (!importPending.value || isBusy.value) return;
  isBusy.value = true;
  try {
    await saveSafetySnapshot(toRaw(state));
    snapshotInfo.value = await loadSafetySnapshot();
    const nextState = mode === 'merge'
      ? mergeBackupState(toRaw(state), importPending.value.state)
      : normalizeState(deepCopy(importPending.value.state));
    Object.assign(state, nextState);
    await saveState(toRaw(state));
    refreshDashboardDraft();
    importPending.value = null;
    modal.value = '';
    showToast(mode === 'merge' ? '迁移包已合并' : '数据已从迁移包恢复');
  } catch (error) {
    showToast('导入失败：' + error.message);
  } finally {
    isBusy.value = false;
  }
}

async function restoreSnapshot() {
  if (!snapshotInfo.value?.state || isBusy.value) return;
  confirmAction.value = {
    type: 'restore',
    title: '恢复导入前的本机快照？',
    detail: '当前内容会先保存为新的安全快照，然后恢复上次导入前的数据。'
  };
  modal.value = 'confirm';
}

async function runConfirmedAction() {
  if (!confirmAction.value) return;
  if (confirmAction.value.type === 'restore') {
    isBusy.value = true;
    try {
      await saveSafetySnapshot(toRaw(state));
      Object.assign(state, normalizeState(deepCopy(snapshotInfo.value.state)));
      await saveState(toRaw(state));
      snapshotInfo.value = await loadSafetySnapshot();
      refreshDashboardDraft();
      modal.value = '';
      confirmAction.value = null;
      showToast('已恢复本机快照');
    } catch (error) {
      showToast('恢复失败：' + error.message);
    } finally {
      isBusy.value = false;
    }
    return;
  }
  if (confirmAction.value.type === 'task-status') {
    const task = state.tasks.find((item) => item.id === confirmAction.value.id);
    const nextStatus = confirmAction.value.nextStatus;
    if (task) {
      changeTaskStatus(task, nextStatus, false);
      showToast('事项状态已更新：' + taskStatusLabel(nextStatus));
    }
    modal.value = '';
    confirmAction.value = null;
    return;
  }
  confirmDelete();
}

function formatLocation(location) {
  return location?.trim() || '地点待补充';
}

function statusClass(status) {
  if (status === '维修中') return 'status-warn';
  if (status === '已报废') return 'status-muted';
  if (status === '备用') return 'status-blue';
  return 'status-good';
}
</script>

<template>
  <section v-if="!authenticated" class="login-screen" :style="{ '--login-photo': 'url(' + heroImage + ')' }">
    <div class="login-art"><div class="login-brand"><span><AppIcon name="leaf" :size="21" /></span><div><small>BASE WORKSPACE</small><strong>基地工作台</strong></div></div><div class="login-promo"><p>MY BASE · MY WORKSPACE</p><h1>把基地的日常，<br /><em>留在自己的节奏里。</em></h1><span>工作记录、设备台账与基地资料，都保存在本机。</span></div><div class="login-art-caption"><AppIcon name="location" :size="15" />从一条清晰的记录开始</div></div>
    <div class="login-panel-wrap"><form class="login-panel" @submit.prevent="unlockWorkspace"><div class="login-mobile-brand"><span><AppIcon name="leaf" :size="19" /></span><small>基地工作台</small></div><div class="login-lock-icon"><AppIcon name="lock" :size="22" /></div><p class="eyebrow">WELCOME BACK</p><h2>进入你的工作空间</h2><p class="login-copy">请输入访问密码，继续查看基地记录。</p><label class="login-field"><span>访问密码</span><div><input v-model="loginPassword" :type="passwordVisible ? 'text' : 'password'" autocomplete="current-password" placeholder="输入密码" aria-label="访问密码" autofocus /><button type="button" :aria-label="passwordVisible ? '隐藏密码' : '显示密码'" @click="passwordVisible = !passwordVisible"><AppIcon :name="passwordVisible ? 'eyeOff' : 'eye'" :size="18" /></button></div></label><p v-if="loginError" class="login-error" role="alert"><AppIcon name="info" :size="15" />{{ loginError }}</p><button class="button button-primary login-submit" type="submit" :disabled="loginBusy"><span>{{ loginBusy ? '正在打开…' : '登录工作台' }}</span><AppIcon name="arrow" :size="17" /></button><div class="login-local-note"><AppIcon name="shield" :size="16" /><span>数据只保存在此设备，不会上传到云端。</span></div></form><span class="login-footer">简洁记录 · 清晰计划 · 从容经营</span></div>
  </section>
  <div v-else-if="!workspaceReady" class="workspace-loading"><div class="loading-mark"><AppIcon name="leaf" :size="22" /></div><span>正在打开本机工作空间…</span></div>
  <section
    v-else-if="page === 'base'"
    class="base-landing"
    :style="{ '--base-landing-photo': 'url(' + heroImage + ')' }"
    aria-labelledby="base-landing-title"
  >
    <header class="base-landing-header">
      <div class="landing-brand">
        <span class="landing-brand-mark"><AppIcon name="leaf" :size="22" /></span>
        <span><small>BASE WORKSPACE</small><strong>基地工作台</strong></span>
      </div>
      <div class="landing-local"><AppIcon name="shield" :size="15" />资料保存在本机</div>
    </header>
    <main class="base-landing-content">
      <div class="base-landing-copy">
        <span class="landing-kicker"><i></i> MY BASE</span>
        <p class="landing-date">{{ currentDateText }}</p>
        <h1 id="base-landing-title">{{ baseName }}</h1>
        <p class="landing-description">{{ baseDescription }}</p>
        <div class="landing-metrics">
          <div><strong>{{ state.logs.length }}</strong><span>条工作记录</span></div>
          <div><strong>{{ state.equipment.length }}</strong><span>件设备</span></div>
          <div><strong>{{ logDaysThisWeek }}</strong><span>本周记录天数</span></div>
        </div>
        <button class="button button-light landing-enter" type="button" @click="setPage('dashboard')">
          进入工作空间<AppIcon name="arrow" :size="17" />
        </button>
      </div>
    </main>
    <footer class="base-landing-footer">
      <span>每天一条记录，让基地进度和下一步都有迹可循。</span>
      <span>基地工作台 · v{{ VERSION }}</span>
    </footer>
  </section>

  <div v-else class="app-shell">
    <aside class="sidebar">
      <div class="brand-block">
        <div class="brand-mark"><AppIcon name="leaf" :size="22" /></div>
        <div><p class="brand-kicker">BASE WORKSPACE</p><strong>基地工作台</strong></div>
      </div>
      <button class="nav-item nav-base-link" :class="{ active: page === 'base' }" type="button" @click="setPage('base')">
        <AppIcon name="building" :size="19" />
        <span>我的基地</span>
      </button>
      <div class="nav-label">工作空间</div>
      <nav class="primary-nav" aria-label="主导航">
        <button
          v-for="item in navItems.slice(1, 4)"
          :key="item.id"
          class="nav-item"
          :class="{ active: page === item.id }"
          type="button"
          @click="setPage(item.id)"
        >
          <AppIcon :name="item.icon" :size="19" />
          <span>{{ item.title }}</span>
          <span v-if="item.id === 'logs' && state.logs.length" class="nav-count">{{ state.logs.length }}</span>
        </button>
        <div class="reserved-nav-group" aria-label="预留应用">
          <div class="nav-item nav-item-placeholder" aria-disabled="true">
            <AppIcon name="leaf" :size="19" />
            <span>{{ expertModule?.title || '农事专家' }}</span>
            <span class="nav-reserved-badge">预留</span>
          </div>
          <button class="nav-item nav-tool-link" type="button" :disabled="reimbursementLaunching" @click="openReimbursement" :title="reimbursementLaunching ? '正在打开报账助手' : '打开报账助手 · 始终复用同一窗口'">
            <AppIcon name="receipt" :size="19" />
            <span>{{ reimbursementModule?.title || '报账助手' }}</span>
            <span class="nav-tool-badge">{{ reimbursementLaunching ? '打开中' : '打开' }}</span>
          </button>
        </div>
        <button class="nav-item" :class="{ active: page === 'modules' }" type="button" @click="setPage('modules')">
          <AppIcon name="sparkles" :size="19" />
          <span>模块中心</span>
          <span class="nav-count">3</span>
        </button>
      </nav>
      <div class="sidebar-spacer"></div>
      <div class="sidebar-tip">
        <div class="tip-icon"><AppIcon name="shield" :size="17" /></div>
        <div><strong>数据保存在本机</strong><p>通过迁移包把完整资料带到新设备。</p></div>
      </div>
      <div class="sidebar-footer">
        <span class="save-dot"></span><span>{{ savedLabel }}</span><span class="footer-version">v{{ VERSION }}</span>
      </div>
    </aside>

    <div class="main-column"><header class="topbar">
        <div class="topbar-title">
          <span v-if="page !== 'base'" class="breadcrumb">我的基地</span>
          <AppIcon v-if="page !== 'base'" name="chevron" :size="14" />
          <h1>{{ page === 'base' ? '我的基地' : pageTitle }}</h1>
        </div>
        <div class="topbar-actions"><div class="user-chip"><strong>{{ baseName }}</strong></div></div>
      </header>
      <main class="page-content">


        <template v-if="page === 'dashboard'">
          <section class="dashboard-welcome">
            <div>
              <p class="eyebrow">{{ currentDateText }}</p>
              <h2>把基地的事，记得清楚。</h2>
              <p>分开写下完成、正在做和下一步，回看时更容易找到重点。</p>
            </div>
            <div class="dashboard-welcome-side">
              <span class="today-status"><i></i>{{ todayLog ? '今日已记录' : '等待记录' }}</span>
              <button class="button button-outline button-small" type="button" @click="setPage('logs')">查看工作日志<AppIcon name="arrow" :size="14" /></button>
            </div>
          </section>

          <section class="dashboard-stats" aria-label="基地概况">
            <article>
              <span class="stat-icon tone-green"><AppIcon name="calendar" :size="19" /></span>
              <div><small>本周记录</small><strong>{{ logDaysThisWeek }}<em> 天</em></strong></div>
            </article>
            <article>
              <span class="stat-icon tone-blue"><AppIcon name="box" :size="19" /></span>
              <div><small>设备台账</small><strong>{{ state.equipment.length }}<em> 件</em></strong></div>
            </article>
            <article>
              <span class="stat-icon tone-amber"><AppIcon name="clock" :size="19" /></span>
              <div><small>当前进行中</small><strong>{{ activeItemsThisWeek }}<em> 项</em></strong></div>
            </article>
            <article>
              <span class="stat-icon tone-lilac"><AppIcon name="sparkles" :size="19" /></span>
              <div><small>未来模块位</small><strong>{{ moduleSlots.length }}<em> 个</em></strong></div>
            </article>
          </section>

          <section class="dashboard-grid">
            <article class="panel daily-entry-panel">
              <div class="panel-heading">
                <div class="panel-title-wrap">
                  <div class="panel-icon icon-sage"><AppIcon name="note" :size="19" /></div>
                  <div><h3>{{ todayLog ? '更新今天的记录' : '今天做了什么？' }}</h3><p>按提示填写即可，每天一条，随时能改</p></div>
                </div>
                <span class="today-pill"><span></span>{{ currentDateShort }}</span>
              </div>
              <form class="daily-entry-form" @submit.prevent="saveDashboardLog">
                <div class="journal-field field-completed">
                  <label for="dashboard-completed"><span class="field-marker"><AppIcon name="check" :size="14" /></span>已完成</label>
                  <textarea id="dashboard-completed" v-model="dashboardDraft.completed" rows="2" maxlength="500" placeholder="例如：检查 1 号棚水泵，换好滴灌带"></textarea>
                </div>
                <div class="journal-field field-in-progress">
                  <label for="dashboard-in-progress"><span class="field-marker"><i></i></span>正在做</label>
                  <textarea id="dashboard-in-progress" v-model="dashboardDraft.inProgress" rows="2" maxlength="500" placeholder="例如：整理设备资料、查看黄瓜长势"></textarea>
                  <label class="task-time-field" for="dashboard-in-progress-due"><span><AppIcon name="clock" :size="13" />预计完成时间 <small>选填</small></span><input id="dashboard-in-progress-due" v-model="dashboardDraft.inProgressDueAt" type="datetime-local" :disabled="!dashboardDraft.inProgress.trim()" /></label>
                </div>
                <div class="journal-field field-next">
                  <label for="dashboard-next"><span class="field-marker"><AppIcon name="arrow" :size="14" /></span>下一步计划</label>
                  <textarea id="dashboard-next" v-model="dashboardDraft.nextStep" rows="2" maxlength="500" placeholder="例如：明天联系供应商确认配件"></textarea>
                  <label class="task-time-field" for="dashboard-next-start"><span><AppIcon name="calendar" :size="13" />计划开始时间 <small>选填</small></span><input id="dashboard-next-start" v-model="dashboardDraft.nextStartAt" type="datetime-local" :disabled="!dashboardDraft.nextStep.trim()" /></label>
                </div>
                <div class="journal-location-row">
                  <label for="dashboard-location"><AppIcon name="location" :size="16" />地点</label>
                  <div class="location-autocomplete" :class="{ open: dashboardLocationOpen }">
                    <input
                      id="dashboard-location"
                      v-model="dashboardDraft.location"
                      autocomplete="off"
                      role="combobox"
                      aria-label="工作地点"
                      aria-autocomplete="list"
                      aria-controls="dashboard-location-options"
                      :aria-expanded="dashboardLocationOpen"
                      :placeholder="savedLocations.length ? '输入或选择历史地点' : '输入自定义地点'"
                      @focus="dashboardLocationOpen = true"
                      @keydown="handleLocationKeydown($event, 'dashboard')"
                    />
                    <button v-if="savedLocations.length" class="location-menu-toggle" type="button" :aria-label="dashboardLocationOpen ? '收起历史地点' : '选择历史地点'" :aria-expanded="dashboardLocationOpen" @click.stop="toggleLocationMenu('dashboard')">
                      <AppIcon name="chevron" :size="15" />
                    </button>
                    <div v-if="dashboardLocationOpen && dashboardLocationOptions.length" id="dashboard-location-options" class="location-suggestion-menu" role="listbox" aria-label="历史地点">
                      <button
                        v-for="(location, index) in dashboardLocationOptions"
                        :key="location"
                        type="button"
                        role="option"
                        :aria-selected="dashboardLocationActiveIndex === index"
                        :class="{ selected: dashboardLocationActiveIndex === index }"
                        @pointerdown.prevent
                        @click="chooseLocation(dashboardDraft, location)"
                      >
                        <AppIcon name="location" :size="14" />{{ location }}
                      </button>
                    </div>
                  </div>
                  <small class="location-hint">{{ savedLocations.length ? '选择历史地点，或输入新地点；保存后会记住' : '没有预设地点，首次输入后会自动记住' }}</small>
                </div>
                <footer class="daily-entry-footer">
                  <span><AppIcon name="shield" :size="15" />自动保存到本机 · 一天一条记录</span>
                  <button class="button button-primary" type="submit"><AppIcon name="check" :size="16" />{{ todayLog ? '更新今日记录' : '保存今日记录' }}</button>
                </footer>
              </form>
            </article>

            <aside class="dashboard-side-column">
              <article class="panel today-panel">
                <div class="panel-heading">
                  <div class="panel-title-wrap">
                    <div class="panel-icon icon-sage"><AppIcon name="check" :size="18" /></div>
                    <div><h3>今日进度</h3><p>{{ currentDateShort }} · {{ todayLog ? formatLocation(todayLog.location) : '等待记录' }}</p></div>
                  </div>
                  <button class="mini-icon-button" type="button" aria-label="编辑今日记录" @click="openLogModal(todayLog)"><AppIcon name="edit" :size="16" /></button>
                </div>
                <div v-if="todayLog" class="today-progress-list">
                  <div v-if="todayLog.completed" class="today-progress-row progress-done"><span>已完成</span><p>{{ todayLog.completed }}</p></div>
                  <div v-if="todayLog.inProgress" class="today-progress-row progress-active"><span>正在做</span><p>{{ todayLog.inProgress }}</p></div>
                  <div v-if="todayLog.nextStep" class="today-progress-row progress-plan"><span>下一步</span><p>{{ todayLog.nextStep }}</p></div>
                </div>
                <div v-else class="empty-today">
                  <span class="empty-orbit"><AppIcon name="note" :size="18" /></span>
                  <strong>今天还没有记录</strong>
                  <p>填好左侧三项，进度会显示在这里。</p>
                </div>
              </article>

              <article class="panel week-review-card">
                <div class="panel-heading">
                  <div class="panel-title-wrap">
                    <div class="panel-icon icon-lilac"><AppIcon name="calendar" :size="18" /></div>
                    <div><h3>本周回顾</h3><p>{{ formatDate(weekBounds.start, { month: 'short', day: 'numeric' }) }} — {{ formatDate(weekBounds.end, { month: 'short', day: 'numeric' }) }}</p></div>
                  </div>
                  <span class="week-count">{{ weekLogs.length }} 条</span>
                </div>
                <div v-if="weekLogs.length" class="week-log-lines">
                  <div v-for="item in weekLogs.slice(0, 3)" :key="item.id">
                    <span>{{ formatDate(item.date, { day: 'numeric' }) }}</span>
                    <p>{{ item.completed || item.inProgress || item.nextStep }}</p>
                  </div>
                </div>
                <div v-else class="week-review-empty">本周还没有记录，慢慢来。</div>
                <button class="panel-bottom-link" type="button" @click="setPage('logs')">查看全部日志<AppIcon name="arrow" :size="14" /></button>
              </article>

              <article class="dashboard-shortcuts">
                <button type="button" @click="setPage('inventory')"><AppIcon name="box" :size="17" /><span>设备管理</span><AppIcon name="arrow" :size="14" /></button>
                <button type="button" @click="setPage('modules')"><AppIcon name="sparkles" :size="17" /><span>模块中心</span><AppIcon name="arrow" :size="14" /></button>
              </article>
            </aside>
          </section>
        </template>

        <template v-else-if="page === 'logs'">
          <section class="page-intro logs-intro">
            <div><p class="eyebrow">DAILY LOGBOOK</p><h2>工作日志</h2><p>完整保留每一天的正在进行、待完成计划和已完成事项，按日期回看。</p></div>
            <button class="button button-primary" type="button" @click="openLogModal()"><AppIcon name="plus" :size="17" />{{ todayLog ? '编辑今日记录' : '新建日志' }}</button>
          </section>

          <section class="log-focus-grid" aria-label="所有正在做的事和下一步计划">
            <article class="log-focus-card focus-active">
              <div class="focus-card-top"><span class="focus-icon"><AppIcon name="clock" :size="17" /></span><span class="focus-label">正在做</span><span class="focus-live"><i></i>{{ activePlans.length }} 项</span></div>
              <div v-if="activePlans.length" class="focus-plan-list">
                <article v-for="item in activePlans" :key="item.id" class="focus-plan-item managed-task-item">
                  <div class="managed-task-heading"><p>{{ item.title }}</p><span class="task-status-chip task-status-active">正在做</span></div>
                  <div class="managed-task-meta"><small class="managed-task-location"><AppIcon name="location" :size="13" />{{ formatLocation(item.location) }}</small><button class="managed-task-time" type="button" :aria-label="item.title + '预计完成时间'" @click="openTaskSchedule(item)"><AppIcon name="clock" :size="13" /><span>{{ item.dueAt ? '预计完成 · ' + formatDateTime(item.dueAt) : '设置预计完成时间' }}</span></button></div>
                  <div class="managed-task-actions">
                    <button type="button" class="task-action-done" @click="askTaskStatusChange(item, 'done')">完成</button>
                    <button type="button" @click="askTaskStatusChange(item, 'cancelled')">取消</button>
                    <button type="button" class="task-action-delete" aria-label="删除事项" @click="askDelete('task', item)"><AppIcon name="trash" :size="13" />删除</button>
                  </div>
                </article>
              </div>
              <p v-else class="focus-plan-empty">还没有正在进行的工作。新增日志后，所有进行中的事项都会列在这里。</p>
            </article>
            <article class="log-focus-card focus-next">
              <div class="focus-card-top"><span class="focus-icon"><AppIcon name="arrow" :size="17" /></span><span class="focus-label">下一步计划</span><span class="focus-live next-live">{{ nextPlans.length }} 项</span></div>
              <div v-if="nextPlans.length" class="focus-plan-list">
                <article v-for="item in nextPlans" :key="item.id" class="focus-plan-item managed-task-item">
                  <div class="managed-task-heading"><p>{{ item.title }}</p><span class="task-status-chip task-status-planned">下一步</span></div>
                  <div class="managed-task-meta"><small class="managed-task-location"><AppIcon name="location" :size="13" />{{ formatLocation(item.location) }}</small><button class="managed-task-time" type="button" :aria-label="item.title + '计划开始时间'" @click="openTaskSchedule(item)"><AppIcon name="calendar" :size="13" /><span>{{ item.startAt ? '计划开始 · ' + formatDateTime(item.startAt) : '设置计划开始时间' }}</span></button></div>
                  <div class="managed-task-actions">
                    <button type="button" class="task-action-done" @click="askTaskStatusChange(item, 'active')">开始进行</button>
                    <button type="button" class="task-action-delete" aria-label="删除事项" @click="askDelete('task', item)"><AppIcon name="trash" :size="13" />删除</button>
                  </div>
                </article>
              </div>
              <p v-else class="focus-plan-empty">还没有下一步计划。写下准备做的事，后续更容易接上。</p>
            </article>
          </section>

          <section v-if="archivedTasks.length" class="panel task-archive-panel">
            <details class="task-archive">
              <summary><span>已处理事项</span><small>{{ archivedTasks.length }} 项 · 完成、暂停或取消的任务</small></summary>
              <div class="task-archive-list">
                <article v-for="item in archivedTasks" :key="item.id">
                  <div><strong>{{ item.title }}</strong><small>{{ taskStatusLabel(item.status) }} · {{ formatLocation(item.location) }}</small></div>
                  <div class="task-archive-actions"><button type="button" @click="restoreTask(item)">恢复</button><button type="button" aria-label="删除事项" @click="askDelete('task', item)"><AppIcon name="trash" :size="13" />删除</button></div>
                </article>
              </div>
            </details>
          </section>

          <section class="panel log-list-panel">
            <div class="list-toolbar">
              <div class="log-list-heading">
                <div><h3>全部记录</h3><p>共 {{ state.logs.length }} 条 · 本周 {{ weekLogs.length }} 条 · 按日期倒序</p></div>
                <span class="record-count">{{ filteredLogs.length }} 条显示</span>
              </div>
              <div class="filter-controls">
                <label class="search-field"><AppIcon name="search" :size="17" /><input v-model="logSearch" type="search" placeholder="搜索内容或地点" aria-label="搜索日志" /></label>
                <label class="date-filter"><AppIcon name="filter" :size="15" /><input v-model="logDateFilter" type="date" aria-label="按日期筛选" /><button v-if="logDateFilter" type="button" aria-label="清除日期筛选" @click="logDateFilter = ''"><AppIcon name="close" :size="13" /></button></label>
              </div>
            </div>

            <div v-if="filteredLogs.length" class="log-record-list">
              <article v-for="item in filteredLogs" :key="item.id" class="log-record-card">
                <div class="record-date-block"><strong>{{ formatDate(item.date, { day: 'numeric' }) }}</strong><span>{{ formatDate(item.date, { month: 'short' }) }}</span></div>
                <div class="record-details">
                  <div class="record-head">
                    <span class="record-day-label">{{ new Intl.DateTimeFormat('zh-CN', { weekday: 'long' }).format(new Date(item.date + 'T12:00:00')) }}</span>
                    <span class="record-dot"></span>
                    <time>{{ item.date }}</time>
                    <span class="record-location"><AppIcon name="location" :size="13" />{{ formatLocation(item.location) }}</span>
                  </div>
                  <div v-if="item.inProgress" class="record-line record-line-active"><span class="detail-label label-doing"><i></i>正在进行</span><p :class="{ 'record-text-clamped': logHasLongText(item) && !isLogExpanded(item.id) }">{{ item.inProgress }}</p></div>
                  <div v-if="item.nextStep" class="record-line record-line-next"><span class="detail-label label-next"><i></i>下一步 · 待完成</span><p :class="{ 'record-text-clamped': logHasLongText(item) && !isLogExpanded(item.id) }">{{ item.nextStep }}</p></div>
                  <div v-if="item.completed" class="record-line record-line-done"><span class="detail-label label-done"><i></i>已完成</span><p :class="{ 'record-text-clamped': logHasLongText(item) && !isLogExpanded(item.id) }">{{ item.completed }}</p></div>
                  <button v-if="logHasLongText(item)" class="record-expand-button" type="button" :aria-expanded="isLogExpanded(item.id)" @click="toggleLogExpanded(item.id)">{{ isLogExpanded(item.id) ? '收起' : '展开更多' }}</button>
                </div>
                <div class="record-actions">
                  <button class="mini-icon-button" type="button" aria-label="编辑日志" @click="openLogModal(item)"><AppIcon name="edit" :size="16" /></button>
                  <button class="mini-icon-button danger-hover" type="button" aria-label="删除日志" @click="askDelete('log', item)"><AppIcon name="trash" :size="16" /></button>
                </div>
              </article>
            </div>
            <div v-else class="empty-list">
              <div class="empty-list-icon"><AppIcon name="note" :size="22" /></div>
              <strong>{{ state.logs.length ? '没有找到匹配记录' : '还没有工作日志' }}</strong>
              <p>{{ state.logs.length ? '换一个关键词、地点或日期试试。' : '从今天的工作台录入第一条记录。' }}</p>
              <button v-if="!state.logs.length" class="button button-outline button-small" type="button" @click="openLogModal()"><AppIcon name="plus" :size="15" />新建日志</button>
            </div>
          </section>
        </template>

        <template v-else-if="page === 'inventory'"><section class="page-intro inventory-intro"><div><p class="eyebrow">EQUIPMENT LEDGER</p><h2>设备管理</h2><p>集中查看设备档案、使用状态、放置位置和保修信息。</p></div><button class="button button-primary" type="button" @click="openEquipmentModal()"><AppIcon name="plus" :size="17" />添加设备</button></section><section class="inventory-metrics"><article class="inventory-metric"><span class="metric-icon tone-green"><AppIcon name="box" :size="18" /></span><div><small>设备档案</small><strong>{{ state.equipment.length }}</strong></div><span class="metric-caption">件</span></article><article class="inventory-metric"><span class="metric-icon tone-blue"><AppIcon name="pin" :size="18" /></span><div><small>已登记位置</small><strong>{{ equipmentLocationCount }}</strong></div><span class="metric-caption">处</span></article><article class="inventory-metric metric-wide"><span class="metric-icon tone-amber"><AppIcon name="clock" :size="18" /></span><div><small>资料状态</small><strong>{{ state.equipment.length ? '持续更新' : '等待登记' }}</strong></div><span class="metric-caption">本机台账</span></article></section><section class="panel inventory-panel"><div class="inventory-toolbar"><div><div class="inventory-title"><h3>设备台账</h3><span>{{ filteredEquipment.length }} 项</span></div><p>支持型号、序列号和放置位置搜索</p></div><div class="inventory-toolbar-actions"><div class="search-field inventory-search"><AppIcon name="search" :size="17" /><input v-model="equipmentSearch" type="search" placeholder="搜索设备、位置或序列号" aria-label="搜索设备" /></div><button class="button button-primary button-small" type="button" @click="openEquipmentModal()"><AppIcon name="plus" :size="15" />登记设备</button></div></div><div v-if="filteredEquipment.length" class="equipment-results"><div class="equipment-grid"><article v-for="item in visibleEquipment" :key="item.id" class="equipment-card"><div class="equipment-card-top"><div class="equipment-avatar"><AppIcon :name="item.category === '监测设备' ? 'chart' : item.category === '农机设备' ? 'plant' : 'box'" :size="19" /></div><span class="status-pill" :class="statusClass(item.status)"><i></i>{{ item.status || '在用' }}</span></div><div class="equipment-main"><div class="equipment-title-row"><h3>{{ item.name }}</h3><button class="mini-icon-button" type="button" aria-label="编辑设备" @click="openEquipmentModal(item)"><AppIcon name="edit" :size="15" /></button></div><p class="equipment-type">{{ item.category || '未分类' }}<span v-if="item.model"> · {{ item.model }}</span></p></div><div class="equipment-meta"><div v-if="item.serialNumber"><AppIcon name="note" :size="13" /><span>{{ item.serialNumber }}</span></div><div v-if="item.location"><AppIcon name="pin" :size="13" /><span>{{ item.location }}</span></div><div v-if="item.purchaseDate"><AppIcon name="calendar" :size="13" /><span>{{ item.purchaseDate }}</span></div><div v-if="item.warrantyUntil"><AppIcon name="shield" :size="13" /><span>保修至 {{ item.warrantyUntil }}</span></div></div><div class="equipment-card-bottom"><span>{{ item.supplier || '设备档案' }}</span><strong v-if="item.purchasePrice">{{ formatMoney(item.purchasePrice) }}</strong><strong v-else class="light-value">—</strong></div><div class="equipment-actions"><button type="button" @click="openEquipmentModal(item)"><AppIcon name="edit" :size="13" />编辑</button><button type="button" class="danger-action" @click="askDelete('equipment', item)"><AppIcon name="trash" :size="13" />删除</button></div></article><button class="add-equipment-card" type="button" @click="openEquipmentModal()"><span><AppIcon name="plus" :size="20" /></span><strong>登记新设备</strong><small>型号、位置、购入与保修信息</small></button></div><div v-if="equipmentPageCount > 1" class="pagination-controls">
<div class="pagination-summary">显示 {{ (currentEquipmentPage - 1) * equipmentPageSize + 1 }}–{{ Math.min(currentEquipmentPage * equipmentPageSize, filteredEquipment.length) }} 件，共 {{ filteredEquipment.length }} 件</div>
<div class="pagination-actions">
<button class="button button-outline button-small" type="button" :disabled="currentEquipmentPage <= 1" @click="changeEquipmentPage(currentEquipmentPage - 1)">上一页</button>
<span>第 {{ currentEquipmentPage }} / {{ equipmentPageCount }} 页</span>
<button class="button button-outline button-small" type="button" :disabled="currentEquipmentPage >= equipmentPageCount" @click="changeEquipmentPage(currentEquipmentPage + 1)">下一页</button>
</div>
</div></div><div v-else class="empty-list inventory-empty"><div class="empty-list-icon"><AppIcon name="box" :size="22" /></div><strong>{{ state.equipment.length ? '没有找到匹配设备' : '设备台账还是空的' }}</strong><p>{{ state.equipment.length ? '换个关键词试试。' : '登记一件常用设备，之后查找会更方便。' }}</p><button v-if="!state.equipment.length" class="button button-outline button-small" type="button" @click="openEquipmentModal()"><AppIcon name="plus" :size="15" />添加第一件设备</button></div></section></template>

        <template v-else-if="page === 'modules'"><section class="page-intro"><div><p class="eyebrow">FUTURE MODULES</p><h2>模块中心</h2><p>为未来的传感器数据和基地工具，先留出三个清晰的位置。</p></div><span class="reserved-count"><i></i>3 个模块位</span></section><section class="module-note panel"><div class="module-note-icon"><AppIcon name="shield" :size="18" /></div><p>这里只保留未来的基地工具位置。农事专家暂未接入；报账助手请从左侧导航或手机底栏打开。</p></section><section class="module-grid"><article v-for="item in moduleSlots" :key="item.id" class="module-card"><div class="module-card-head"><div class="module-icon" :class="'module-icon-' + item.icon"><AppIcon :name="item.icon" :size="21" /></div><span class="module-status"><i></i>预留中</span></div><div class="module-copy"><h3>{{ item.title }}</h3><p>预留的基地工具入口，当前不会打开应用。</p></div><div class="module-card-footer"><span><AppIcon name="clock" :size="14" />待接入</span><button type="button" class="text-button" @click="editModuleSlot(item)"><AppIcon name="edit" :size="14" />修改显示</button></div></article></section><section class="module-footnote"><div class="footnote-mark"><AppIcon name="sparkles" :size="17" /></div><div><strong>后续接入时再配置入口</strong><p>模块卡片统一预留名称、图标、启用状态和目标地址字段。</p></div></section></template>
      </main>
      <footer class="mobile-footer" aria-label="主导航">
        <template v-for="item in mobileNavItems" :key="item.id">
          <button v-if="item.integrated" type="button" class="mobile-tool-link" @click="openReimbursement">
            <AppIcon :name="item.icon" :size="19" />
            <small>{{ item.title }}</small>
            <i>APP</i>
          </button>
          <div v-else-if="item.reserved" class="mobile-nav-placeholder" aria-disabled="true">
            <AppIcon :name="item.icon" :size="19" />
            <small>{{ item.title }}</small>
            <i>预留</i>
          </div>
          <button v-else type="button" :class="{ active: page === item.id }" @click="setPage(item.id)">
            <AppIcon :name="item.icon" :size="18" />
            <span>{{ item.id === 'inventory' ? '设备' : item.id === 'modules' ? '模块' : item.title }}</span>
          </button>
        </template>
      </footer>
    </div>

    <button class="settings-fab" type="button" aria-label="设置" title="设置" @click="openSettings()"><AppIcon name="settings" :size="20" /><span>设置</span></button>
    <input ref="importFileInput" class="hidden-file-input" type="file" accept=".bwbackup,.zip,application/zip" @change="handleBackupFile" />

    <div v-if="settingsOpen" class="settings-scrim" @click.self="settingsOpen = false"><section class="settings-window" role="dialog" aria-modal="true" aria-labelledby="settings-title"><aside class="settings-sidebar"><div class="settings-sidebar-head"><div class="settings-mark"><AppIcon name="settings" :size="18" /></div><div><p class="eyebrow">WORKSPACE</p><h2 id="settings-title">设置</h2></div><button class="close-icon-button settings-mobile-close" type="button" aria-label="关闭设置" @click="settingsOpen = false"><AppIcon name="close" :size="18" /></button></div><nav class="settings-nav"><button v-for="item in settingsItems" :key="item.id" type="button" :class="{ active: settingsTab === item.id }" @click="settingsTab = item.id"><AppIcon :name="item.icon" :size="17" /><span>{{ item.title }}</span><AppIcon name="chevron" :size="14" /></button></nav><div class="settings-sidebar-bottom"><span class="save-dot"></span><span>资料保存在本机</span></div></aside><div class="settings-main"><header class="settings-main-header"><div><p class="eyebrow">{{ settingsItems.find((item) => item.id === settingsTab)?.title }}</p><h3>{{ settingsItems.find((item) => item.id === settingsTab)?.title }}</h3></div><button class="close-icon-button" type="button" aria-label="关闭设置" @click="settingsOpen = false"><AppIcon name="close" :size="18" /></button></header><div class="settings-body">
      <template v-if="settingsTab === 'profile'"><div class="settings-section-intro"><h4>基地资料</h4><p>这些信息会显示在“我的基地”首页。</p></div><div class="settings-form profile-settings-form"><label class="form-field"><span>基地名称</span><input v-model="settingsName" maxlength="48" placeholder="例如：青禾种植基地" /></label><label class="form-field"><span>常用地点</span><input v-model="settingsLocation" maxlength="80" placeholder="例如：1 号棚、育苗区" /></label><label class="form-field"><span>首页介绍</span><textarea v-model="settingsDescription" rows="3" maxlength="180" placeholder="用一句话介绍你的基地"></textarea></label><button class="button button-primary" type="button" @click="saveBaseProfile"><AppIcon name="check" :size="16" />保存资料</button></div><div class="settings-inline-tip"><AppIcon name="image" :size="16" /><span>首页展示黄瓜植株照片，图片会随应用一起打包。</span></div></template>
      <template v-else-if="settingsTab === 'data'"><div class="settings-section-intro"><h4>完整数据迁移</h4><p>导出一个迁移包，在新设备导入后继续使用。</p></div><div class="data-transfer-card"><div class="transfer-card-icon"><AppIcon name="archive" :size="21" /></div><div><strong>基地工作台迁移包</strong><small>包含 {{ state.logs.length }} 条日志、{{ state.tasks.length }} 项任务、{{ state.equipment.length }} 件设备、{{ moduleSlots.length }} 个模块位与所有设置。</small></div></div><div class="transfer-actions"><button class="button button-primary" type="button" :disabled="isBusy" @click="exportBackup"><AppIcon name="download" :size="16" />导出全部数据</button><button class="button button-outline" type="button" :disabled="isBusy" @click="selectBackupFile"><AppIcon name="upload" :size="16" />导入迁移包</button></div><div v-if="archivedPurchaseCount" class="archive-note"><AppIcon name="info" :size="15" /><span>保留了 {{ archivedPurchaseCount }} 条旧版本采购历史，已从当前界面归档。</span></div><div v-if="snapshotInfo?.state" class="snapshot-settings-row"><div><strong>最近的安全快照</strong><small>{{ new Date(snapshotInfo.savedAt).toLocaleString('zh-CN') }}</small></div><button class="text-button" type="button" @click="restoreSnapshot">恢复快照</button></div><div class="settings-inline-tip"><AppIcon name="shield" :size="16" /><span>数据和迁移包都只保存在你的设备。各设备互不联网同步。</span></div></template>
      <template v-else-if="settingsTab === 'system'"><div class="settings-section-intro"><h4>系统信息</h4><p>当前工作台运行环境与本地资料概况。</p></div><div class="system-info-grid"><div><small>应用名称</small><strong>基地工作台</strong></div><div><small>版本</small><strong>v{{ VERSION }}</strong></div><div><small>当前平台</small><strong>{{ platformName }}</strong></div><div><small>数据存储</small><strong>本机 IndexedDB</strong></div><div><small>工作日志</small><strong>{{ state.logs.length }} 条</strong></div><div><small>任务事项</small><strong>{{ state.tasks.length }} 项</strong></div><div><small>设备台账</small><strong>{{ state.equipment.length }} 件</strong></div></div><div class="settings-inline-tip"><AppIcon name="shield" :size="16" /><span>没有账号系统或云端同步；迁移设备请使用“数据迁移”。</span></div><button class="button button-quiet logout-button" type="button" @click="logout"><AppIcon name="lock" :size="15" />退出工作台</button></template>
      <template v-else-if="settingsTab === 'integrations'"><div class="settings-section-intro"><h4>应用接入</h4><p>从工作台打开独立业务应用，原应用的文件和数据保持不变。</p></div><article class="integration-card"><span class="integration-icon"><AppIcon name="receipt" :size="21" /></span><div class="integration-copy"><div><strong>报账助手</strong><span class="integration-ready"><i></i>已接入</span></div><p>可直接从工作台打开；桌面版始终复用同一个应用窗口，网页与手机打开独立页面。</p><small>已随工作台打包；无需先另装应用</small></div><button class="button button-primary button-small" type="button" :disabled="reimbursementLaunching" @click="openReimbursement"><AppIcon name="external" :size="14" />{{ reimbursementLaunching ? '打开中…' : '现在打开' }}</button></article><label class="form-field integration-address"><span>报账助手地址</span><input v-model="settingsReimbursementLink" type="url" placeholder="留空使用工作台内置版本" /></label><div class="integration-actions"><button class="button button-primary button-small" type="button" @click="saveReimbursementIntegration">保存入口</button><a :href="releaseLink('reimbursement')" target="_blank" rel="noopener noreferrer" class="button button-outline button-small">查看安装包<AppIcon name="external" :size="13" /></a></div><div class="settings-inline-tip"><AppIcon name="shield" :size="16" /><span>工作台只负责打开内置入口，不读取或修改原报账助手项目的代码、发票、草稿和设置。</span></div></template>
      <template v-else-if="settingsTab === 'updates'"><div class="settings-section-intro"><h4>版本与更新</h4><p>安装包发布后，可在这里打开对应平台的 GitHub Releases 下载页。</p></div><div class="version-card"><span class="version-icon"><AppIcon name="refresh" :size="19" /></span><div><small>当前版本</small><strong>基地工作台 v{{ VERSION }}</strong></div><span class="version-current"><i></i>当前版本</span></div><div class="release-link-list"><div v-for="platform in releasePlatforms" :key="platform.id" class="release-link-row"><span class="release-platform-icon"><AppIcon :name="platform.icon" :size="17" /></span><div><strong>{{ platform.name }}</strong><small>{{ releaseLink(platform.id) ? 'GitHub Releases 最新安装包' : '发布后在这里配置下载链接' }}</small></div><a v-if="releaseLink(platform.id)" :href="releaseLink(platform.id)" target="_blank" rel="noopener noreferrer" class="button button-outline button-small">下载最新版<AppIcon name="arrow" :size="13" /></a><span v-else class="release-pending">待发布</span></div></div><details class="release-config"><summary>配置平台下载链接</summary><div class="release-form"><label class="form-field"><span>Mac 下载页</span><input v-model="settingsReleaseLinks.mac" type="url" placeholder="https://github.com/…/releases/latest" /></label><label class="form-field"><span>Windows 下载页</span><input v-model="settingsReleaseLinks.windows" type="url" placeholder="https://github.com/…/releases/latest" /></label><label class="form-field"><span>Android APK 下载页</span><input v-model="settingsReleaseLinks.android" type="url" placeholder="https://github.com/…/releases/latest" /></label><label class="form-field"><span>报账助手下载页</span><input v-model="settingsReleaseLinks.reimbursement" type="url" placeholder="https://github.com/…/releases/latest" /></label><button class="button button-primary button-small" type="button" @click="saveReleaseLinks">保存链接</button></div></details></template>
      <template v-else-if="settingsTab === 'help'"><div class="settings-section-intro"><h4>使用帮助</h4><p>几个简单步骤，开始记录基地日常。</p></div><div class="help-list"><article><span>01</span><div><strong>记录今天的工作</strong><p>在“工作台”分别填写已完成、正在做和下一步计划；预计完成与计划开始时间为选填；没设置时间不会提醒。到期后会在“工作日志”右下角提示，关闭后 1 小时再询问。</p></div></article><article><span>02</span><div><strong>回看工作日志</strong><p>在“工作日志”搜索内容、地点或日期。正在做可标记完成或取消；下一步可开始或删除。状态变更会先确认。</p></div></article><article><span>03</span><div><strong>维护设备台账</strong><p>登记设备名称、型号、位置、状态、购入与保修信息；电脑每行最多显示 5 件，手机每行 2 件。</p></div></article><article><span>04</span><div><strong>迁移到新设备</strong><p>在“数据迁移”导出完整迁移包，再在新设备登录后导入。</p></div></article><article><span>05</span><div><strong>打开报账助手</strong><p>点击左侧“报账助手”即可打开独立应用；桌面版始终复用同一窗口。应用接入里可修改入口地址。</p></div></article></div></template>
      <template v-else><div class="about-card"><span class="about-mark"><AppIcon name="leaf" :size="24" /></span><p class="eyebrow">ABOUT THIS WORKSPACE</p><h4>{{ baseName }}</h4><p>基地工作台是一款本地优先的日常工作工具，用清楚的日志、设备信息和迁移备份，把基地事务放在手边。</p><div class="about-tags"><span>本机保存</span><span>轻量记录</span><span>逐步扩展</span></div><small>基地工作台 · v{{ VERSION }}</small></div></template>
      </div></div></section></div>

    <div v-if="modal === 'log'" class="modal-scrim" @click.self="modal = ''"><section class="dialog-card dialog-large ios-dialog" role="dialog" aria-modal="true" aria-labelledby="log-dialog-title"><header class="dialog-header"><div><p class="eyebrow">DAILY LOGBOOK</p><h2 id="log-dialog-title">{{ modalMode === 'edit' ? '编辑工作日志' : '新建工作日志' }}</h2><p>把工作分成三步写，回看时更容易找到重点。</p></div><button class="close-icon-button" type="button" aria-label="关闭" @click="modal = ''"><AppIcon name="close" :size="18" /></button></header><form class="dialog-form" @submit.prevent="saveLogModal"><div class="form-grid log-form-grid"><label class="form-field"><span>记录日期 <b>*</b></span><input v-model="logForm.date" required type="date" /></label><label class="form-field location-form-field"><span>工作地点 <b>*</b></span><div class="location-autocomplete" :class="{ open: logLocationOpen }"><input v-model="logForm.location" required autocomplete="off" role="combobox" aria-label="工作地点" aria-autocomplete="list" aria-controls="log-location-options" :aria-expanded="logLocationOpen" :placeholder="savedLocations.length ? '输入或选择历史地点' : '输入自定义地点'" @focus="logLocationOpen = true" @keydown="handleLocationKeydown($event, 'log')" /><button v-if="savedLocations.length" class="location-menu-toggle" type="button" :aria-label="logLocationOpen ? '收起历史地点' : '选择历史地点'" :aria-expanded="logLocationOpen" @click.stop="toggleLocationMenu('log')"><AppIcon name="chevron" :size="15" /></button><div v-if="logLocationOpen && logLocationOptions.length" id="log-location-options" class="location-suggestion-menu" role="listbox" aria-label="历史地点"><button v-for="(location, index) in logLocationOptions" :key="location" type="button" role="option" :aria-selected="logLocationActiveIndex === index" :class="{ selected: logLocationActiveIndex === index }" @pointerdown.prevent @click="chooseLocation(logForm, location)"><AppIcon name="location" :size="14" />{{ location }}</button></div></div></label><label class="form-field field-full"><span><i class="form-dot dot-complete"></i>已完成</span><textarea v-model="logForm.completed" rows="3" maxlength="500" placeholder="今天已经完成了什么？"></textarea></label><label class="form-field field-full"><span><i class="form-dot dot-progress"></i>正在做</span><textarea v-model="logForm.inProgress" rows="3" maxlength="500" placeholder="目前正在推进什么？"></textarea><span class="form-schedule-label">预计完成时间 <small>选填，到期会提醒</small></span><input v-model="logForm.inProgressDueAt" type="datetime-local" :disabled="!logForm.inProgress.trim()" /></label><label class="form-field field-full"><span><i class="form-dot dot-plan"></i>下一步计划</span><textarea v-model="logForm.nextStep" rows="3" maxlength="500" placeholder="接下来准备做什么？"></textarea><span class="form-schedule-label">计划开始时间 <small>选填，到时会提醒</small></span><input v-model="logForm.nextStartAt" type="datetime-local" :disabled="!logForm.nextStep.trim()" /></label></div><p v-if="formError" class="inline-form-error"><AppIcon name="info" :size="15" />{{ formError }}</p><footer class="dialog-footer"><button class="button button-quiet" type="button" @click="modal = ''">取消</button><button class="button button-primary" type="button" @click="saveLogModal"><AppIcon name="check" :size="16" />{{ modalMode === 'edit' ? '保存修改' : '保存日志' }}</button></footer></form></section></div>

    <div v-if="modal === 'task-schedule' && taskScheduleTarget" class="modal-scrim" @click.self="modal = ''">
      <section class="dialog-card dialog-small ios-dialog" role="dialog" aria-modal="true" aria-labelledby="task-schedule-title">
        <header class="dialog-header"><div><p class="eyebrow">TASK TIME</p><h2 id="task-schedule-title">{{ taskScheduleTarget.status === 'planned' ? '设置计划开始时间' : '设置预计完成时间' }}</h2><p>{{ taskScheduleTarget.title }}</p></div><button class="close-icon-button" type="button" aria-label="关闭" @click="modal = ''"><AppIcon name="close" :size="18" /></button></header>
        <form class="dialog-form" @submit.prevent="saveTaskScheduleModal">
          <label class="form-field"><span>{{ taskScheduleTarget.status === 'planned' ? '计划开始时间' : '预计完成时间' }}</span><input v-model="taskScheduleForm" type="datetime-local" /></label>
          <p class="settings-inline-tip compact-tip"><AppIcon name="clock" :size="15" /><span>留空不会提醒；设定时间后，到期会在工作日志右下角提醒。</span></p>
          <footer class="dialog-footer"><button class="button button-quiet" type="button" @click="taskScheduleForm = ''">清除时间</button><button class="button button-primary" type="submit"><AppIcon name="check" :size="16" />保存时间</button></footer>
        </form>
      </section>
    </div>

    <div v-if="modal === 'equipment'" class="modal-scrim" @click.self="modal = ''"><section class="dialog-card dialog-large ios-dialog" role="dialog" aria-modal="true" aria-labelledby="equipment-dialog-title"><header class="dialog-header"><div><p class="eyebrow">EQUIPMENT PROFILE</p><h2 id="equipment-dialog-title">{{ modalMode === 'edit' ? '编辑设备' : '登记设备' }}</h2><p>设备信息会保存在本机台账中。</p></div><button class="close-icon-button" type="button" aria-label="关闭" @click="modal = ''"><AppIcon name="close" :size="18" /></button></header><form class="dialog-form" @submit.prevent="saveEquipment"><div class="form-grid"><label class="form-field"><span>设备名称 <b>*</b></span><input v-model="equipmentForm.name" required maxlength="80" placeholder="例如：温湿度记录仪" /></label><label class="form-field"><span>设备类别</span><select v-model="equipmentForm.category"><option value="">选择类别</option><option>农机设备</option><option>监测设备</option><option>水肥设备</option><option>工具</option><option>办公设备</option><option>其他</option></select></label><label class="form-field"><span>型号 / 规格</span><input v-model="equipmentForm.model" maxlength="100" placeholder="型号、规格或品牌" /></label><label class="form-field"><span>序列号</span><input v-model="equipmentForm.serialNumber" maxlength="100" placeholder="选填" /></label><label class="form-field"><span>放置位置</span><input v-model="equipmentForm.location" maxlength="100" placeholder="例如：1 号棚 / 仓库 A 架" /></label><label class="form-field"><span>当前状态</span><select v-model="equipmentForm.status"><option>在用</option><option>备用</option><option>维修中</option><option>已报废</option></select></label><label class="form-field"><span>购入日期</span><input v-model="equipmentForm.purchaseDate" type="date" /></label><label class="form-field"><span>购入金额</span><div class="input-with-prefix"><span>¥</span><input v-model="equipmentForm.purchasePrice" type="number" min="0" step="0.01" placeholder="0.00" /></div></label><label class="form-field"><span>供应商</span><input v-model="equipmentForm.supplier" maxlength="100" placeholder="选填" /></label><label class="form-field"><span>保修截止</span><input v-model="equipmentForm.warrantyUntil" type="date" /></label><label class="form-field field-full"><span>备注</span><textarea v-model="equipmentForm.notes" rows="3" maxlength="500" placeholder="补充说明、保养情况等"></textarea></label></div><p v-if="formError" class="inline-form-error"><AppIcon name="info" :size="15" />{{ formError }}</p><footer class="dialog-footer"><button class="button button-quiet" type="button" @click="modal = ''">取消</button><button class="button button-primary" type="submit"><AppIcon name="check" :size="16" />{{ modalMode === 'edit' ? '保存修改' : '保存设备' }}</button></footer></form></section></div>

    <div v-if="modal === 'module'" class="modal-scrim" @click.self="modal = ''"><section class="dialog-card dialog-small ios-dialog" role="dialog" aria-modal="true" aria-labelledby="module-dialog-title"><header class="dialog-header"><div><p class="eyebrow">RESERVED MODULE</p><h2 id="module-dialog-title">修改预留卡片</h2><p>只修改卡片显示信息，不会启动任何应用。</p></div><button class="close-icon-button" type="button" aria-label="关闭" @click="modal = ''"><AppIcon name="close" :size="18" /></button></header><form class="dialog-form" @submit.prevent="saveModule"><label class="form-field"><span>显示名称</span><input v-model="moduleForm.title" required maxlength="30" placeholder="例如：棚区传感器" /></label><label class="form-field"><span>图标</span><select v-model="moduleForm.icon"><option value="sparkles">星光</option><option value="chart">数据</option><option value="box">设备</option><option value="leaf">植物</option></select></label><p class="settings-inline-tip compact-tip"><AppIcon name="shield" :size="15" /><span>入口地址会在未来正式接入时再配置。</span></p><footer class="dialog-footer"><button class="button button-quiet" type="button" @click="modal = ''">取消</button><button class="button button-primary" type="submit">保存卡片</button></footer></form></section></div>

    <div v-if="modal === 'backup' && importPending" class="modal-scrim" @click.self="cancelImport"><section class="dialog-card dialog-small ios-dialog" role="dialog" aria-modal="true" aria-labelledby="backup-dialog-title"><header class="dialog-header"><div><p class="eyebrow">DATA TRANSFER</p><h2 id="backup-dialog-title">导入迁移包</h2><p>确认资料数量，再选择合并或完整恢复。</p></div><button class="close-icon-button" type="button" aria-label="关闭" @click="cancelImport"><AppIcon name="close" :size="18" /></button></header><div class="backup-preview"><div class="backup-file-icon"><AppIcon name="archive" :size="21" /></div><div class="backup-file-copy"><strong>{{ importPending.fileName }}</strong><small>导出于 {{ new Date(importPending.manifest.exportedAt).toLocaleString('zh-CN') }}</small></div></div><div class="backup-count-grid"><div><strong>{{ importPending.state.logs.length }}</strong><span>条日志</span></div><div><strong>{{ importPending.state.equipment.length }}</strong><span>件设备</span></div><div><strong>{{ importPending.state.tasks.length }}</strong><span>项任务</span></div><div><strong>{{ importPending.state.modules.filter((item) => !item.locked).length }}</strong><span>个模块位</span></div></div><p v-if="importPending.state.archivedPurchases.length" class="archive-note"><AppIcon name="info" :size="15" /><span>迁移包保留了 {{ importPending.state.archivedPurchases.length }} 条旧版采购历史，当前界面不再显示采购模块。</span></p><p class="backup-warning"><AppIcon name="shield" :size="16" />导入前会先保存当前设备的安全快照。</p><div class="backup-actions"><button class="button button-outline" type="button" :disabled="isBusy" @click="applyBackup('merge')">合并到本机</button><button class="button button-primary" type="button" :disabled="isBusy" @click="applyBackup('restore')">完整恢复</button></div><button class="backup-cancel" type="button" @click="cancelImport">取消导入</button></section></div>
    <div v-if="toast" class="toast-message" role="status"><span class="toast-check"><AppIcon name="check" :size="14" /></span>{{ toast }}</div>
  </div>

  <Teleport to="body">
    <div v-if="authenticated && workspaceReady && modal === 'confirm' && confirmAction" class="modal-scrim confirm-scrim" @click.self="cancelConfirm"><section class="confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title"><div class="confirm-icon" :class="confirmIconClass()"><AppIcon :name="confirmIconName()" :size="22" /></div><h2 id="confirm-title">{{ confirmAction.title }}</h2><p>{{ confirmAction.detail }}</p><div class="confirm-actions"><button class="button button-quiet" type="button" @click="cancelConfirm">再想想</button><button class="button" :class="confirmButtonClass()" type="button" :disabled="isBusy" @click="runConfirmedAction">{{ confirmButtonLabel() }}</button></div></section></div>

    <Transition name="task-reminder-pop">
      <aside v-if="authenticated && workspaceReady && page === 'logs' && modal === 'task-reminder' && reminderTask" class="task-reminder-toast" role="status" aria-labelledby="task-reminder-title" aria-live="polite">
        <div class="task-reminder-toast-top"><span class="task-reminder-kind"><i></i>{{ reminderIsForStart ? '计划开始提醒' : '预计完成提醒' }}</span><button type="button" aria-label="稍后提醒" @click="dismissTaskReminder"><AppIcon name="close" :size="17" /></button></div>
        <h3 id="task-reminder-title">{{ reminderTask.title }}</h3>
        <p class="task-reminder-toast-meta"><AppIcon name="location" :size="13" />{{ formatLocation(reminderTask.location) }}<span>·</span>{{ formatDateTime(reminderIsForStart ? reminderTask.startAt : reminderTask.dueAt) }}</p>
        <div v-if="reminderRescheduleOpen" class="task-reminder-reschedule"><label><span>{{ reminderIsForStart ? '延期到' : '新的预计完成时间' }}</span><input v-model="reminderRescheduleAt" type="datetime-local" /></label><button type="button" class="button button-outline button-small" @click="postponeTaskReminder">确认延期</button></div>
        <div class="task-reminder-actions">
          <template v-if="reminderIsForStart"><button type="button" class="task-reminder-primary" @click="askTaskStatusChange(reminderTask, 'active')">开始进行</button></template>
          <template v-else><button type="button" class="task-reminder-primary" @click="askTaskStatusChange(reminderTask, 'done')">完成</button><button type="button" @click="askTaskStatusChange(reminderTask, 'cancelled')">取消</button><button type="button" @click="openReminderReschedule">延期</button></template>
          <button type="button" class="task-reminder-delete" @click="askDelete('task', reminderTask)"><AppIcon name="trash" :size="13" />删除</button>
        </div>
      </aside>
    </Transition>
  </Teleport>

</template>
