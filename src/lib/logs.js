import { makeId, todayKey } from './defaults.js';

export function createLogRecord(fields, date = todayKey(), current = null) {
  const now = new Date().toISOString();
  return {
    id: current?.id || makeId(),
    date,
    location: String(fields.location || '').trim(),
    completed: String(fields.completed || '').trim(),
    inProgress: String(fields.inProgress || '').trim(),
    nextStep: String(fields.nextStep || '').trim(),
    inProgressDueAt: String(Object.prototype.hasOwnProperty.call(fields, 'inProgressDueAt') ? fields.inProgressDueAt || '' : current?.inProgressDueAt || ''),
    nextStartAt: String(Object.prototype.hasOwnProperty.call(fields, 'nextStartAt') ? fields.nextStartAt || '' : current?.nextStartAt || ''),
    inProgressTaskId: String(current?.inProgressTaskId || ''),
    nextStepTaskId: String(current?.nextStepTaskId || ''),
    rawText: [fields.completed, fields.inProgress, fields.nextStep].filter(Boolean).join('；'),
    createdAt: current?.createdAt || now,
    updatedAt: now
  };
}

export function getCurrentWeekBounds(from = new Date()) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: todayKey(start), end: todayKey(end) };
}

export function sortLogs(logs) {
  return [...logs].sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
}
