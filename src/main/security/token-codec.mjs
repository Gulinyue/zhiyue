export function createTokenCodec(safeStorage) {
  return {
    encrypt(plain) {
      if (!plain) return undefined;
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('AUTH_ENCRYPTION_UNAVAILABLE: 系统凭据加密不可用，无法保存登录状态。');
      }
      return safeStorage.encryptString(plain).toString('base64');
    },
    decrypt(encoded) {
      if (!encoded || !safeStorage.isEncryptionAvailable()) return undefined;
      try { return safeStorage.decryptString(Buffer.from(encoded, 'base64')); }
      catch { return undefined; }
    },
  };
}
