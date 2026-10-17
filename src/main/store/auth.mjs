import Store from "electron-store";
import * as electron from "electron";
import * as node_crypto from "node:crypto";
import { createTokenCodec } from "../security/token-codec.mjs";
import { LOCAL_SNAPSHOT } from '../../shared/local-profile.mjs';

const store$3 = new Store({
  name: "auth",
  defaults: {},
  clearInvalidConfig: true
});
const { encrypt, decrypt } = createTokenCodec(electron.safeStorage);
function getTokens() {
  return {};
}
function saveTokens() {
  throw new Error('本地独立版不使用云端登录令牌。');
}
function clearTokens() {
  store$3.delete("atEnc");
  store$3.delete("rtEnc");
  store$3.delete("email");
  store$3.delete("expiresAt");
  store$3.delete("subscription");
}
function getRemoteControlCredentials() {
  const pairingId = store$3.get("remotePairingId")?.trim();
  const desktopGrant = decrypt(store$3.get("remoteGrantEnc"))?.trim();
  return pairingId && desktopGrant ? { pairingId, desktopGrant } : null;
}
function saveRemoteControlCredentials(credentials) {
  const pairingId = credentials.pairingId.trim();
  const desktopGrant = credentials.desktopGrant.trim();
  if (!pairingId || !desktopGrant) {
    throw new Error("invalid remote-control credentials");
  }
  const encrypted = encrypt(desktopGrant);
  if (!encrypted) throw new Error("remote-control grant encryption failed");
  store$3.set("remotePairingId", pairingId);
  store$3.set("remoteGrantEnc", encrypted);
}
function clearRemoteControlCredentials() {
  store$3.delete("remotePairingId");
  store$3.delete("remoteGrantEnc");
}
function getOrCreateRemoteControlDeviceId() {
  const existing = store$3.get("remoteDesktopDeviceId")?.trim();
  if (existing) return existing;
  const created = node_crypto.randomUUID();
  store$3.set("remoteDesktopDeviceId", created);
  return created;
}
function getSnapshot() {
  return { ...LOCAL_SNAPSHOT };
}

export { store$3, encrypt, decrypt, getTokens, saveTokens, clearTokens, getRemoteControlCredentials, saveRemoteControlCredentials, clearRemoteControlCredentials, getOrCreateRemoteControlDeviceId, getSnapshot };
