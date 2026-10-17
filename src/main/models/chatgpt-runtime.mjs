import Store from 'electron-store';
import { safeStorage, shell } from 'electron';
import { ChatGptAuth } from './chatgpt-auth.mjs';
const store = new Store({ name: 'chatgpt-authorization', defaults: {}, clearInvalidConfig: true });
export const chatgptAuth = new ChatGptAuth({
  openBrowser: (url) => shell.openExternal(url),
  storage: {
    read() {
      const encrypted = store.get('record');
      if (!encrypted) return {};
      if (!safeStorage.isEncryptionAvailable()) throw new Error('系统凭据存储不可用，无法读取 ChatGPT 授权');
      try { return JSON.parse(safeStorage.decryptString(Buffer.from(encrypted, 'base64'))); }
      catch { throw new Error('无法解锁 ChatGPT 授权，请在原系统账号中重试'); }
    },
    write(record) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('系统凭据存储不可用，无法安全保存 ChatGPT 授权');
      store.set('record', safeStorage.encryptString(JSON.stringify(record)).toString('base64'));
    },
  },
});
