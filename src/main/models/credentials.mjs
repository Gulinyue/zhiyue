import { validatePersonalModelCredentialInput, normalizePersonalModelBaseUrl, createDefaultPersonalModelProfile, DEFAULT_PERSONAL_MODEL_BASE_URL, LEGACY_GEMINI_OPENAI_BASE_URL, DEFAULT_PERSONAL_MODEL_ID } from "./validation.mjs";
import Store from "electron-store";
import * as electron from "electron";

class PersonalModelCredentialStoreError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "PersonalModelCredentialStoreError";
  }
}
class PersonalModelCredentialVault {
  constructor(safeStorage, persistence, now = () => /* @__PURE__ */ new Date()) {
    this.safeStorage = safeStorage;
    this.persistence = persistence;
    this.now = now;
  }
  sessionSecrets = /* @__PURE__ */ new Map();
  save(raw, options) {
    const slot = options.slot ?? "screenshot";
    const input = validatePersonalModelCredentialInput(raw);
    const baseUrl = normalizePersonalModelBaseUrl(options.baseUrl, options.urlValidation);
    const updatedAt = this.now().toISOString();
    if (!this.safeStorage.isEncryptionAvailable()) {
      if (!options.allowSessionOnly) {
        throw new PersonalModelCredentialStoreError(
          "PERSONAL_MODEL_ENCRYPTION_UNAVAILABLE",
          "Secure operating-system credential storage is unavailable"
        );
      }
      this.sessionSecrets.set(slot, { apiKey: input.apiKey, updatedAt, baseUrl });
      return createSummary(slot, input.apiKey, updatedAt, false, baseUrl);
    }
    let ciphertext;
    try {
      ciphertext = this.safeStorage.encryptString(input.apiKey).toString("base64");
    } catch {
      if (options.allowSessionOnly) {
        this.sessionSecrets.set(slot, { apiKey: input.apiKey, updatedAt, baseUrl });
        return createSummary(slot, input.apiKey, updatedAt, false, baseUrl);
      }
      throw new PersonalModelCredentialStoreError(
        "PERSONAL_MODEL_CREDENTIAL_ENCRYPTION_FAILED",
        "Unable to protect the personal model credential"
      );
    }
    const current = this.readPersisted();
    const next = {
      ...current,
      [slot]: {
        version: 2,
        ciphertext,
        lastFour: lastFour(input.apiKey),
        updatedAt,
        baseUrl
      }
    };
    if (slot === "screenshot") {
      delete next["custom-api"];
      delete next.openai;
      delete next.gemini;
    }
    this.persistence.set(next);
    this.sessionSecrets.delete(slot);
    return createSummary(slot, input.apiKey, updatedAt, true, baseUrl);
  }
  load(expectedBaseUrl, urlValidation = {}, slot = "screenshot") {
    const normalizedExpected = normalizePersonalModelBaseUrl(expectedBaseUrl, urlValidation);
    const sessionSecret = this.sessionSecrets.get(slot);
    if (sessionSecret) {
      return sessionSecret.baseUrl === normalizedExpected ? sessionSecret.apiKey : null;
    }
    const persisted = resolvePersistedCredential(this.readPersisted(), slot);
    if (!persisted || persisted.version !== 2) return null;
    let boundBaseUrl;
    try {
      boundBaseUrl = normalizePersonalModelBaseUrl(persisted.baseUrl, urlValidation);
    } catch {
      return null;
    }
    if (boundBaseUrl !== normalizedExpected) return null;
    if (!this.safeStorage.isEncryptionAvailable()) {
      throw new PersonalModelCredentialStoreError(
        "PERSONAL_MODEL_ENCRYPTION_UNAVAILABLE",
        "Secure operating-system credential storage is unavailable"
      );
    }
    try {
      const decrypted = this.safeStorage.decryptString(Buffer.from(persisted.ciphertext, "base64"));
      return validatePersonalModelCredentialInput({ apiKey: decrypted }).apiKey;
    } catch (error) {
      if (error instanceof PersonalModelCredentialStoreError) throw error;
      throw new PersonalModelCredentialStoreError(
        "PERSONAL_MODEL_CREDENTIAL_DECRYPTION_FAILED",
        "Unable to unlock the personal model credential"
      );
    }
  }
  list(expectedBaseUrl, urlValidation = {}, slot = "screenshot") {
    const normalizedExpected = normalizePersonalModelBaseUrl(expectedBaseUrl, urlValidation);
    const sessionSecret = this.sessionSecrets.get(slot);
    if (sessionSecret) {
      return sessionSecret.baseUrl === normalizedExpected ? [createSummary(
        slot,
        sessionSecret.apiKey,
        sessionSecret.updatedAt,
        false,
        sessionSecret.baseUrl
      )] : [];
    }
    const persisted = resolvePersistedCredential(this.readPersisted(), slot);
    if (!persisted || persisted.version !== 2) return [];
    let boundBaseUrl;
    try {
      boundBaseUrl = normalizePersonalModelBaseUrl(persisted.baseUrl, urlValidation);
    } catch {
      return [];
    }
    return boundBaseUrl === normalizedExpected ? [{
      configured: true,
      slot,
      lastFour: persisted.lastFour,
      persistent: true,
      updatedAt: persisted.updatedAt,
      boundBaseUrl
    }] : [];
  }
  remove(slot = "screenshot") {
    this.sessionSecrets.delete(slot);
    const current = this.readPersisted();
    delete current[slot];
    if (slot === "screenshot") {
      delete current["custom-api"];
      delete current.openai;
      delete current.gemini;
    }
    this.persistence.set(current);
  }
  clearSessionSecrets() {
    this.sessionSecrets.clear();
  }
  readPersisted() {
    const raw = this.persistence.get();
    if (!raw || typeof raw !== "object") return {};
    const valid2 = {};
    for (const key of ["screenshot", "interview", "custom-api", "openai", "gemini"]) {
      const entry = raw[key];
      if (entry?.version !== 1 && entry?.version !== 2 || typeof entry.ciphertext !== "string" || !entry.ciphertext || typeof entry.lastFour !== "string" || entry.lastFour.length > 4 || typeof entry.updatedAt !== "string" || entry.version === 2 && (typeof entry.baseUrl !== "string" || !entry.baseUrl)) continue;
      valid2[key] = entry;
    }
    return valid2;
  }
}
function resolvePersistedCredential(value, slot) {
  if (slot === "interview") return value.interview;
  return value.screenshot ?? value["custom-api"] ?? value.openai ?? value.gemini;
}
function lastFour(apiKey) {
  return apiKey.slice(-4);
}
function createSummary(slot, apiKey, updatedAt, persistent, boundBaseUrl) {
  return {
    configured: true,
    slot,
    lastFour: lastFour(apiKey),
    persistent,
    updatedAt,
    boundBaseUrl
  };
}
const store$1 = new Store({
  name: "personal-model-credentials",
  defaults: {},
  clearInvalidConfig: true
});
const vault = new PersonalModelCredentialVault(electron.safeStorage, {
  get: () => store$1.get("credentials"),
  set: (value) => store$1.set("credentials", value)
});
function listPersonalModelCredentialSummaries(baseUrl, urlValidation, slot = "screenshot") {
  return vault.list(baseUrl, urlValidation, slot);
}
function savePersonalModelCredential(input, options) {
  return vault.save(input, options);
}
function loadPersonalModelCredentialSecret(baseUrl, urlValidation, slot = "screenshot") {
  return vault.load(baseUrl, urlValidation, slot);
}
function removePersonalModelCredential(slot = "screenshot") {
  vault.remove(slot);
}
function clearSessionPersonalModelCredentials() {
  vault.clearSessionSecrets();
}
const store = new Store({
  name: "personal-model-profiles",
  defaults: {},
  clearInvalidConfig: true
});
function listPersonalModelProfiles(configured, options = {}) {
  const configuredSlots = typeof configured === "boolean" ? { screenshot: configured } : configured;
  return ["screenshot", "interview"].map((slot) => {
    const connection = readConnection(slot, options);
    return createDefaultPersonalModelProfile(
      connection.model,
      connection.baseUrl,
      configuredSlots[slot] === true,
      options,
      generationOptions(connection),
      slot
    );
  });
}
function savePersonalModelProfile(model, baseUrl, options = {}, generation = {}, slot = "screenshot") {
  const profile = createDefaultPersonalModelProfile(
    model,
    baseUrl,
    true,
    options,
    generation,
    slot
  );
  const current = readPersistedConnections();
  store.set("connections", {
    ...current,
    [slot]: {
      version: 7,
      model: profile.model,
      baseUrl: profile.baseUrl,
      webSearchEnabled: profile.webSearchEnabled,
      ...generationOptions(profile)
    }
  });
  if (slot === "screenshot") {
    store.delete("connection");
    store.delete("models");
  }
  return profile;
}
function getConfiguredPersonalModelProfile(enabled, options = {}, slot = "screenshot") {
  const current = readPersistedConnections()[slot];
  if (current) return profileFromPersisted(current, enabled, options, slot);
  if (slot !== "screenshot") return null;
  const legacy = store.get("connection");
  return legacy ? profileFromPersisted(legacy, enabled, options, slot) : null;
}
function removePersonalModelProfile(slot = "screenshot") {
  const current = readPersistedConnections();
  if (current[slot]) {
    delete current[slot];
    if (Object.keys(current).length) store.set("connections", current);
    else store.delete("connections");
  }
  if (slot === "screenshot") {
    store.delete("connection");
    store.delete("models");
  }
}
function readConnection(slot, options) {
  const current = readPersistedConnections()[slot];
  if (current) {
    const profile = profileFromPersisted(current, false, options, slot);
    if (profile) return profileConnection(profile);
  }
  if (slot === "screenshot") {
    const legacyConnection = store.get("connection");
    if (legacyConnection) {
      const profile = profileFromPersisted(legacyConnection, false, options, slot);
      if (profile) return profileConnection(profile);
    }
    const legacyModels = store.get("models");
    if (legacyModels && typeof legacyModels === "object") {
      if (typeof legacyModels.openai === "string") {
        try {
          return profileConnection(createDefaultPersonalModelProfile(
            legacyModels.openai,
            DEFAULT_PERSONAL_MODEL_BASE_URL,
            false,
            options,
            {},
            slot
          ));
        } catch {
        }
      }
      if (typeof legacyModels.gemini === "string") {
        try {
          return profileConnection(createDefaultPersonalModelProfile(
            legacyModels.gemini,
            LEGACY_GEMINI_OPENAI_BASE_URL,
            false,
            options,
            {},
            slot
          ));
        } catch {
        }
      }
    }
  }
  return {
    model: DEFAULT_PERSONAL_MODEL_ID,
    baseUrl: DEFAULT_PERSONAL_MODEL_BASE_URL
  };
}
function readPersistedConnections() {
  const raw = store.get("connections");
  if (!raw || typeof raw !== "object") return {};
  const valid2 = {};
  for (const slot of ["screenshot", "interview"]) {
    const value = raw[slot];
    if ([5, 6, 7].includes(value?.version)) valid2[slot] = value;
  }
  return valid2;
}
function generationOptions(value) {
  const legacyGeneration = value;
  const legacySearch = "webSearchMode" in value ? value.webSearchMode !== "off" : void 0;
  return {
    ...(value.providerId !== undefined ? { providerId: value.providerId } : {}),
    ...(value.apiMode !== undefined ? { apiMode: value.apiMode } : {}),
    ..."webSearchEnabled" in value && value.webSearchEnabled !== void 0 ? { webSearchEnabled: value.webSearchEnabled } : legacySearch !== void 0 ? { webSearchEnabled: legacySearch } : {},
    ...legacyGeneration.temperature !== void 0 ? { temperature: legacyGeneration.temperature } : {},
    ...legacyGeneration.thinkingLevel !== void 0 ? { thinkingLevel: legacyGeneration.thinkingLevel } : {},
    ...legacyGeneration.topP !== void 0 ? { topP: legacyGeneration.topP } : {},
    ...legacyGeneration.stop !== void 0 ? { stop: [...legacyGeneration.stop] } : {}
  };
}
function profileFromPersisted(current, enabled, options, slot) {
  try {
    return createDefaultPersonalModelProfile(
      current.model,
      current.baseUrl,
      enabled,
      options,
      generationOptions(current),
      slot
    );
  } catch {
    return null;
  }
}
function profileConnection(profile) {
  return {
    model: profile.model,
    baseUrl: profile.baseUrl,
    ...generationOptions(profile)
  };
}

export { PersonalModelCredentialStoreError, PersonalModelCredentialVault, resolvePersistedCredential, lastFour, createSummary, store$1, vault, listPersonalModelCredentialSummaries, savePersonalModelCredential, loadPersonalModelCredentialSecret, removePersonalModelCredential, clearSessionPersonalModelCredentials, store, listPersonalModelProfiles, savePersonalModelProfile, getConfiguredPersonalModelProfile, removePersonalModelProfile, readConnection, readPersistedConnections, generationOptions, profileFromPersisted, profileConnection };
