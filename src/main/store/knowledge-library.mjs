import * as promises from "node:fs/promises";
import * as node_crypto from "node:crypto";
import * as path from "node:path";

const MAX_LIBRARY_ITEMS = 10;
const MAX_LIBRARY_BYTES = 64 * 1024 * 1024;
const MAX_ITEM_BYTES = 12 * 1024 * 1024;
class KnowledgeLibraryFileStore {
  constructor(rootDirectory) {
    this.rootDirectory = rootDirectory;
  }
  accountOperations = /* @__PURE__ */ new Map();
  async list(accountKey) {
    const owner = normalizedAccountKey(accountKey);
    const pending = this.accountOperations.get(owner);
    if (pending) await pending.catch(() => void 0);
    return this.readLibrary(owner);
  }
  async save(accountKey, rawIndex) {
    const owner = normalizedAccountKey(accountKey);
    const index = normalizedIndex(rawIndex);
    return this.withAccountLock(owner, async () => {
      const existing = await this.readLibrary(owner);
      const position = existing.findIndex((item) => item.id === index.id);
      if (position < 0 && existing.length >= MAX_LIBRARY_ITEMS) {
        throw new Error(`KNOWLEDGE_LIBRARY_LIMIT:${MAX_LIBRARY_ITEMS}`);
      }
      const next = position < 0 ? [index, ...existing] : existing.map((item, itemIndex) => itemIndex === position ? index : item);
      await this.writeLibrary(owner, next);
      return index;
    });
  }
  async delete(accountKey, rawId) {
    const owner = normalizedAccountKey(accountKey);
    const id = normalizedId(rawId);
    return this.withAccountLock(owner, async () => {
      const existing = await this.readLibrary(owner);
      const next = existing.filter((item) => item.id !== id);
      if (next.length === existing.length) return false;
      await this.writeLibrary(owner, next);
      return true;
    });
  }
  withAccountLock(owner, operation) {
    const previous = this.accountOperations.get(owner) ?? Promise.resolve();
    const current = previous.catch(() => void 0).then(operation);
    this.accountOperations.set(owner, current);
    void current.finally(() => {
      if (this.accountOperations.get(owner) === current) {
        this.accountOperations.delete(owner);
      }
    }).catch(() => void 0);
    return current;
  }
  async readLibrary(owner) {
    try {
      const raw = await promises.readFile(this.filePath(owner), "utf8");
      if (Buffer.byteLength(raw, "utf8") > MAX_LIBRARY_BYTES) {
        throw new Error("KNOWLEDGE_LIBRARY_CORRUPT");
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length > MAX_LIBRARY_ITEMS) {
        throw new Error("KNOWLEDGE_LIBRARY_CORRUPT");
      }
      return parsed.map(normalizedIndex);
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return [];
      throw error;
    }
  }
  async writeLibrary(owner, indexes) {
    const serialized = JSON.stringify(indexes);
    if (Buffer.byteLength(serialized, "utf8") > MAX_LIBRARY_BYTES) {
      throw new Error("KNOWLEDGE_LIBRARY_TOO_LARGE");
    }
    await promises.mkdir(this.rootDirectory, { recursive: true, mode: 448 });
    const target = this.filePath(owner);
    const temporary = `${target}.${process.pid}.${node_crypto.randomUUID()}.tmp`;
    try {
      await promises.writeFile(temporary, serialized, { encoding: "utf8", mode: 384, flag: "wx" });
      await promises.rename(temporary, target);
    } catch (error) {
      await promises.rm(temporary, { force: true }).catch(() => void 0);
      throw error;
    }
  }
  filePath(owner) {
    const digest = node_crypto.createHash("sha256").update(owner).digest("hex");
    return path.join(this.rootDirectory, `${digest}.json`);
  }
}
function validatedKnowledgeLibraryAccount(requestedAccountKey, authenticatedEmail) {
  let requested = "";
  let authenticated = "";
  try {
    requested = normalizedAccountKey(requestedAccountKey);
    authenticated = normalizedAccountKey(authenticatedEmail);
  } catch {
    throw new Error("KNOWLEDGE_LIBRARY_ACCOUNT_MISMATCH");
  }
  if (requested !== authenticated) {
    throw new Error("KNOWLEDGE_LIBRARY_ACCOUNT_MISMATCH");
  }
  return authenticated;
}
function normalizedAccountKey(value) {
  if (typeof value !== "string") throw new Error("KNOWLEDGE_LIBRARY_INVALID_ACCOUNT");
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 320) {
    throw new Error("KNOWLEDGE_LIBRARY_INVALID_ACCOUNT");
  }
  return normalized;
}
function normalizedId(value) {
  if (typeof value !== "string") throw new Error("KNOWLEDGE_LIBRARY_INVALID_ID");
  const id = value.trim();
  if (!id || id.length > 80 || !/^[a-zA-Z0-9._-]+$/u.test(id)) {
    throw new Error("KNOWLEDGE_LIBRARY_INVALID_ID");
  }
  return id;
}
function normalizedIndex(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("KNOWLEDGE_LIBRARY_INVALID_INDEX");
  }
  const id = normalizedId(value.id);
  let serialized = "";
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new Error("KNOWLEDGE_LIBRARY_INVALID_INDEX");
  }
  if (!serialized || Buffer.byteLength(serialized, "utf8") > MAX_ITEM_BYTES) {
    throw new Error("KNOWLEDGE_LIBRARY_INVALID_INDEX");
  }
  return { ...JSON.parse(serialized), id };
}
function isNodeError(error, code) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === code);
}

export { MAX_LIBRARY_ITEMS, MAX_LIBRARY_BYTES, MAX_ITEM_BYTES, KnowledgeLibraryFileStore, validatedKnowledgeLibraryAccount, normalizedAccountKey, normalizedId, normalizedIndex, isNodeError };
