import Store from 'electron-store';
import { normalizeConversation, normalizeWorkspace } from './workspace-schema.mjs';

const workspace = new Store({ name: 'local-workspace', defaults: { conversations: [] } });
export function registerWorkspaceIpc(ipc) {
  ipc.handle('local-workspace:list', () => normalizeWorkspace(workspace.get('conversations')).map(({ messages, ...conversation }) => ({ ...conversation, messageCount: messages.length })));
  ipc.handle('local-workspace:read', (_event, id) => normalizeWorkspace(workspace.get('conversations')).find((item) => item.id === id) ?? null);
  ipc.handle('local-workspace:save', (_event, raw) => {
    const conversation = normalizeConversation(raw);
    const next = [conversation, ...normalizeWorkspace(workspace.get('conversations')).filter((item) => item.id !== conversation.id)];
    if (next.length > 100) throw new Error('本地会话已达到 100 份，请先删除不需要的记录。');
    if (Buffer.byteLength(JSON.stringify(next)) > 32 * 1024 * 1024) throw new Error('本地会话总量超过 32 MiB，请先清理记录。');
    workspace.set('conversations', next);
    return conversation;
  });
  ipc.handle('local-workspace:delete', (_event, id) => {
    workspace.set('conversations', normalizeWorkspace(workspace.get('conversations')).filter((item) => item.id !== id));
  });
}
