import Store from "electron-store";
import { DEFAULT_SETTINGS, isStealthToggleAllowed, enforceDesktopSettingsPolicy } from "./default-settings.mjs";
import { getSnapshot } from "./auth.mjs";

const store$2 = new Store({
  name: "config",
  defaults: { settings: DEFAULT_SETTINGS }
});
function deepMerge(base, patch) {
  if (patch === void 0 || patch === null) return base;
  if (typeof base !== "object" || base === null) return patch;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const key of Object.keys(patch)) {
    const pv = patch[key];
    const bv = base[key];
    if (pv && typeof pv === "object" && !Array.isArray(pv) && bv && typeof bv === "object") {
      out[key] = deepMerge(bv, pv);
    } else if (pv !== void 0) {
      out[key] = pv;
    }
  }
  return out;
}
function sanitize(s, options) {
  const allowedKeys = Object.keys(DEFAULT_SETTINGS);
  const clean = {};
  for (const k of allowedKeys) {
    if (s[k] !== void 0) {
      clean[k] = s[k];
    }
  }
  const allowStealthToggle = options?.allowStealthToggle ?? isStealthToggleAllowed(getSnapshot().email);
  return enforceDesktopSettingsPolicy(deepMerge(DEFAULT_SETTINGS, clean), { allowStealthToggle });
}
function readPersistedSettings() {
  return store$2.get("settings", DEFAULT_SETTINGS);
}
function getSettings() {
  return sanitize(readPersistedSettings());
}
function getWindowBootstrapSettings() {
  return sanitize(readPersistedSettings(), { allowStealthToggle: true });
}
function setSettings(next) {
  const clean = sanitize(next);
  store$2.set("settings", clean);
}
function patchSettings(patch) {
  const persisted = getWindowBootstrapSettings();
  const merged = deepMerge(getSettings(), patch);
  const clean = sanitize(merged);
  store$2.set("settings", patch.windowMode === void 0 ? { ...clean, windowMode: persisted.windowMode } : clean);
  return clean;
}

export { store$2, deepMerge, sanitize, readPersistedSettings, getSettings, getWindowBootstrapSettings, setSettings, patchSettings };
