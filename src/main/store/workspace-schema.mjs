import { CONVERSATION_MODES } from '../../shared/conversation-modes.mjs';

export function normalizeConversation(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(raw.id)) throw new Error('无效的会话');
  if (typeof raw.title !== 'string' || raw.title.length > 160 || !Number.isFinite(raw.updatedAt) || !CONVERSATION_MODES.includes(raw.mode)) throw new Error('无效的会话信息');
  if (!Array.isArray(raw.messages) || raw.messages.length > 200) throw new Error('每份会话最多保存 200 条消息，请开始新会话。');
  const messages = raw.messages.map((message) => {
    if (!message || !['user', 'assistant'].includes(message.role) || typeof message.text !== 'string' || message.text.length > 200000 || typeof message.id !== 'string' || message.id.length > 100) throw new Error('无效的会话消息');
    return { id: message.id, role: message.role, text: message.text, status: ['completed', 'cancelled', 'failed'].includes(message.status) ? message.status : 'completed' };
  });
  return { id: raw.id, title: raw.title, updatedAt: raw.updatedAt, mode: raw.mode, messages };
}
export function normalizeWorkspace(raw) {
  if (!Array.isArray(raw)) throw new Error('本地会话文件损坏，请检查 local-workspace.json。');
  return raw.map(normalizeConversation);
}
