import { validatePersonalModelRequest, isPersonalModelConnectionSlot } from './validation.mjs';

export function normalizeLocalModelRunInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).some((key) => !['requestId', 'taskKind', 'request', 'slot'].includes(key))) {
    throw new Error('PERSONAL_MODEL_INVALID_INPUT: 无效的本地模型请求');
  }
  if (typeof raw.requestId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{7,127}$/.test(raw.requestId)) throw new Error('无效的请求标识');
  if (!['exam', 'interview'].includes(raw.taskKind)) throw new Error('无效的任务类型');
  if (raw.slot !== undefined && !isPersonalModelConnectionSlot(raw.slot)) throw new Error('无效的模型连接用途');
  return {
    requestId: raw.requestId,
    taskKind: raw.taskKind,
    slot: raw.slot,
    request: validatePersonalModelRequest(raw.request),
  };
}
