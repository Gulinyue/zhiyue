// Recovered from the supplied Climb 3.0.1 artifact. See docs/RECOVERY.md.
import Store from "electron-store";
import * as electron from "electron";
import * as node_crypto from "node:crypto";
import { createTokenCodec } from "../security/token-codec.mjs";

const store$3 = new Store({
  name: "auth",
  defaults: {},
  clearInvalidConfig: true
});
const { encrypt, decrypt } = createTokenCodec(electron.safeStorage);
function getTokens() {
  return {
    accessToken: decrypt(store$3.get("atEnc")),
    refreshToken: decrypt(store$3.get("rtEnc"))
  };
}
function saveTokens(p) {
  const next = {};
  if (p.accessToken !== void 0) next.atEnc = encrypt(p.accessToken);
  if (p.refreshToken !== void 0) next.rtEnc = encrypt(p.refreshToken);
  if (p.email !== void 0) next.email = p.email;
  if (p.expiresAt !== void 0) next.expiresAt = p.expiresAt;
  if (p.subscription !== void 0) next.subscription = p.subscription;
  store$3.set(next);
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
  const { accessToken } = getTokens();
  const email = store$3.get("email");
  const sub = store$3.get("subscription");
  const expiresAt = store$3.get("expiresAt");
  if (!accessToken || !email) {
    return { status: "anon" };
  }
  if (sub && sub.active === false) {
    return { status: "expired", email, subscription: sub, expiresAt };
  }
  return { status: "loggedIn", email, subscription: sub, expiresAt };
}

export { store$3, encrypt, decrypt, getTokens, saveTokens, clearTokens, getRemoteControlCredentials, saveRemoteControlCredentials, clearRemoteControlCredentials, getOrCreateRemoteControlDeviceId, getSnapshot };
