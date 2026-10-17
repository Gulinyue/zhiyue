import { createHash, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';

export function trustedInstallerDigest(rawUrl, manifest) {
  const url = new URL(rawUrl);
  const digest = manifest[url.href];
  if (url.protocol !== 'https:' || url.username || url.password || typeof digest !== 'string' || !/^[0-9a-f]{64}$/i.test(digest)) {
    throw new Error('UPDATE_INTEGRITY_UNAVAILABLE: 发布清单未包含此安装包的可信 SHA-256。');
  }
  return digest.toLowerCase();
}

export async function verifyInstallerDigest(file, expected) {
  if (typeof expected !== 'string' || !/^[0-9a-f]{64}$/i.test(expected)) throw new Error('UPDATE_INTEGRITY_UNAVAILABLE');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (!timingSafeEqual(hash.digest(), Buffer.from(expected, 'hex'))) throw new Error('UPDATE_INTEGRITY_MISMATCH');
}
