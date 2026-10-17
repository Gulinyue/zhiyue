import * as node_fs from "node:fs";
import * as node_crypto from "node:crypto";
import * as path from "node:path";
import * as promises from "node:fs/promises";
import * as node_readline from "node:readline";

const DEFAULT_LOCAL_RECORDS_PREFERENCES = Object.freeze({
  saveScreenshots: false,
  saveInterviewTranscript: false,
  maxStorageMiB: 2048
});
const LOCAL_RECORDS_MIN_STORAGE_MIB = 512;
const LOCAL_RECORDS_MAX_STORAGE_MIB = 10240;
DEFAULT_LOCAL_RECORDS_PREFERENCES.maxStorageMiB * 1024 * 1024;
class LocalRecordsError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "LocalRecordsError";
  }
}
const RECORD_ID = /^(interview|screenshot)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_PNG_BYTES = 16 * 1024 * 1024;
const MAX_TEXT_BYTES = 64 * 1024;
const MAX_TRANSCRIPT_BYTES = 16 * 1024 * 1024;
const MAX_TRANSCRIPT_CACHES = 8;
const MAX_JOURNAL_LINE_BYTES = MAX_TEXT_BYTES * 6 + 4096;
const NO_FOLLOW = node_fs.constants.O_NOFOLLOW || 0;
const MIB = 1024 * 1024;
const NEAR_CAPACITY_MESSAGE = "本机记录空间已使用 90% 以上，接近上限；达到上限后将停止新增，不会自动删除旧记录。";
const CAPACITY_MESSAGE = "本机记录空间已满或不足以保存新记录，请调高保存上限或自行删除不需要的旧记录后重试。";
function fail(code, message) {
  throw new LocalRecordsError(code, message);
}
function isMissing(error) {
  return error?.code === "ENOENT";
}
function recordId(value, kind) {
  if (typeof value !== "string" || !RECORD_ID.test(value) || kind && !value.startsWith(`${kind}-`)) {
    fail("LOCAL_RECORDS_INVALID_INPUT", "本机记录编号无效。");
  }
  return value;
}
function timestamp(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 864e13) {
    fail("LOCAL_RECORDS_INVALID_INPUT", "本机记录时间无效。");
  }
  return value;
}
function localRecordDate(value) {
  const date = new Date(timestamp(value));
  const year = date.getFullYear();
  if (year < 0 || year > 9999) fail("LOCAL_RECORDS_INVALID_INPUT", "本机记录日期无效。");
  return `${String(year).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function validRecordDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = /* @__PURE__ */ new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` === value;
}
function normalizeEntry(id, text, at) {
  if (typeof id !== "string" || !id.trim() || id.length > 512 || /[\x00-\x1f]/u.test(id) || typeof text !== "string" || !text.trim() || Buffer.byteLength(text, "utf8") > MAX_TEXT_BYTES) {
    fail("LOCAL_RECORDS_INVALID_INPUT", "转写内容或事件编号无效。");
  }
  return { id, text: text.trim(), at: timestamp(at) };
}
function validStorageMiB(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= LOCAL_RECORDS_MIN_STORAGE_MIB && value <= LOCAL_RECORDS_MAX_STORAGE_MIB;
}
function preferences(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some((key) => !["saveScreenshots", "saveInterviewTranscript", "maxStorageMiB"].includes(key)) || typeof value.saveScreenshots !== "boolean" || typeof value.saveInterviewTranscript !== "boolean" || "maxStorageMiB" in value && !validStorageMiB(value.maxStorageMiB)) {
    fail("LOCAL_RECORDS_CORRUPT", "本机记录设置损坏，请检查记录目录。");
  }
  return {
    saveScreenshots: value.saveScreenshots,
    saveInterviewTranscript: value.saveInterviewTranscript,
    // Old preferences preserve their privacy switches and gain the new default
    // without rewriting or loading the existing PNG/TXT payloads.
    maxStorageMiB: "maxStorageMiB" in value ? value.maxStorageMiB : DEFAULT_LOCAL_RECORDS_PREFERENCES.maxStorageMiB
  };
}
function fingerprint(text) {
  return node_crypto.createHash("sha256").update(text).digest("hex");
}
function jsonLine(value) {
  return JSON.stringify(value) + "\n";
}
function readable(entry, revised) {
  return `[${new Date(entry.at).toISOString()}]${revised ? " [修订]" : ""}
${entry.text}

`;
}
function summaryMetadata(summary, payloadBytes) {
  const next = { ...summary, bytes: payloadBytes };
  let text = "";
  for (let pass = 0; pass < 12; pass++) {
    text = jsonLine({ version: 1, summary: next });
    const bytes = payloadBytes + Buffer.byteLength(text);
    if (bytes === next.bytes) return { summary: next, text };
    next.bytes = bytes;
  }
  fail("LOCAL_RECORDS_CORRUPT", "本机记录元数据大小无效。");
}
class LocalRecordsStore {
  rootDirectory;
  accounts = /* @__PURE__ */ new Map();
  pendingOperations = 0;
  pendingBytes = 0;
  hardMaxBytes;
  maxQueuedOperations;
  maxQueuedBytes;
  maxTranscriptBytes;
  now;
  constructor(rootDirectory, options = {}) {
    this.rootDirectory = path.resolve(rootDirectory);
    this.hardMaxBytes = options.maxBytes ?? LOCAL_RECORDS_MAX_STORAGE_MIB * MIB;
    this.maxQueuedOperations = options.maxQueuedOperations ?? 64;
    this.maxQueuedBytes = options.maxQueuedBytes ?? 64 * 1024 * 1024;
    this.maxTranscriptBytes = Math.min(MAX_TRANSCRIPT_BYTES, options.maxTranscriptBytes ?? MAX_TRANSCRIPT_BYTES);
    this.now = options.now ?? Date.now;
    for (const limit of [this.hardMaxBytes, this.maxQueuedOperations, this.maxQueuedBytes, this.maxTranscriptBytes]) {
      if (!Number.isSafeInteger(limit) || limit <= 0) fail("LOCAL_RECORDS_INVALID_INPUT", "本机记录容量设置无效。");
    }
  }
  account(accountKey) {
    if (typeof accountKey !== "string" || !accountKey.trim() || accountKey.length > 2048) {
      fail("LOCAL_RECORDS_INVALID_INPUT", "本机记录需要有效账号。");
    }
    const digest = node_crypto.createHash("sha256").update(accountKey.trim().toLowerCase()).digest("hex");
    let account = this.accounts.get(digest);
    if (!account) {
      account = {
        directory: path.join(this.rootDirectory, digest),
        tail: Promise.resolve(),
        overrides: {},
        screenshotEpoch: 0,
        transcriptEpoch: 0,
        deletedInterviews: /* @__PURE__ */ new Set(),
        dirty: false
      };
      this.accounts.set(digest, account);
    }
    return account;
  }
  async safeDirectory(directory) {
    await promises.mkdir(directory, { recursive: true, mode: 448 });
    const info = await promises.lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) fail("LOCAL_RECORDS_UNSAFE_PATH", "本机记录目录不是安全目录。");
    await promises.chmod(directory, 448);
  }
  async safeFile(file, missing = false) {
    await this.safeDirectoryChain(path.dirname(file));
    try {
      const info = await promises.lstat(file);
      if (!info.isFile() || info.isSymbolicLink()) fail("LOCAL_RECORDS_UNSAFE_PATH", "本机记录文件不是安全文件。");
      return info.size;
    } catch (error) {
      if (missing && isMissing(error)) return 0;
      throw error;
    }
  }
  async safeDirectoryChain(directory, create = false) {
    const relative = path.relative(this.rootDirectory, directory);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      fail("LOCAL_RECORDS_UNSAFE_PATH", "本机记录目录超出保存范围。");
    }
    let current = this.rootDirectory;
    for (const part of ["", ...relative.split(path.sep).filter(Boolean)]) {
      if (part) current = path.join(current, part);
      let info;
      try {
        info = await promises.lstat(current);
      } catch (error) {
        if (!create || !isMissing(error)) throw error;
        await promises.mkdir(current, { mode: 448 });
        info = await promises.lstat(current);
      }
      if (!info.isDirectory() || info.isSymbolicLink()) fail("LOCAL_RECORDS_UNSAFE_PATH", "本机记录目录包含不安全链接。");
    }
  }
  plannedRecordBase(account, id, at) {
    const day = localRecordDate(at);
    return id.startsWith("interview-") ? path.join(account.directory, "interviews", day, id, id) : path.join(account.directory, "screenshots", day, id);
  }
  async recordBase(account, data, id) {
    const base = data.locations.get(id);
    if (!base) fail("LOCAL_RECORDS_NOT_FOUND", "本机记录不存在。");
    const relative = path.relative(account.directory, base);
    if (relative.startsWith("..") || path.isAbsolute(relative)) fail("LOCAL_RECORDS_UNSAFE_PATH", "本机记录路径无效。");
    await this.safeDirectoryChain(path.dirname(base));
    return base;
  }
  async atomic(file, text, guard) {
    await this.safeFile(file, true);
    this.checkGuard(guard);
    const temporary = `${file}.${node_crypto.randomUUID()}.tmp`;
    try {
      await promises.writeFile(temporary, text, { encoding: "utf8", flag: "wx", mode: 384 });
      this.checkGuard(guard);
      await promises.rename(temporary, file);
    } catch (error) {
      await promises.unlink(temporary).catch(() => void 0);
      throw error;
    }
  }
  async append(file, text, guard) {
    let existed = true;
    try {
      await this.safeFile(file);
    } catch (error) {
      if (isMissing(error)) existed = false;
      else throw error;
    }
    this.checkGuard(guard);
    const handle = await promises.open(file, node_fs.constants.O_WRONLY | node_fs.constants.O_CREAT | node_fs.constants.O_APPEND | NO_FOLLOW, 384);
    let written = false;
    try {
      this.checkGuard(guard);
      await handle.writeFile(text, "utf8");
      written = true;
      await handle.sync();
    } finally {
      await handle.close();
      if (!written && !existed) await promises.unlink(file).catch(() => void 0);
    }
  }
  enqueue(account, operation, weight = 0, bounded = true) {
    if (bounded && (this.pendingOperations >= this.maxQueuedOperations || this.pendingBytes + weight > this.maxQueuedBytes)) {
      account.warning = "本机记录正在保存，待写队列已满，本次记录未保存。";
      return Promise.reject(new LocalRecordsError("LOCAL_RECORDS_QUEUE_FULL", account.warning));
    }
    if (bounded) {
      this.pendingOperations++;
      this.pendingBytes += weight;
    }
    const current = account.tail.catch(() => void 0).then(async () => {
      account.loaded ??= this.load(account);
      try {
        const data = await account.loaded;
        for (const directory of [this.rootDirectory, account.directory]) {
          const info = await promises.lstat(directory);
          if (!info.isDirectory() || info.isSymbolicLink()) fail("LOCAL_RECORDS_UNSAFE_PATH", "本机记录目录已更改。");
        }
        const result = await operation(data);
        account.dirty = false;
        return result;
      } catch (error) {
        if (account.dirty || !(error instanceof LocalRecordsError)) account.loaded = void 0;
        account.dirty = false;
        throw error;
      }
    });
    account.tail = current;
    return current.finally(() => {
      if (bounded) {
        this.pendingOperations--;
        this.pendingBytes -= weight;
      }
    });
  }
  checkGuard(guard) {
    if (guard && !guard()) fail("LOCAL_RECORDS_DISABLED", "本次记录已取消或当前账号已更改。");
  }
  checkRecording(account, data, kind, epoch, guard) {
    this.checkGuard(guard);
    const prefs = this.effectivePreferences(account, data);
    const enabled = kind === "screenshot" ? prefs.saveScreenshots : prefs.saveInterviewTranscript;
    const currentEpoch = kind === "screenshot" ? account.screenshotEpoch : account.transcriptEpoch;
    if (!enabled || epoch !== currentEpoch) fail("LOCAL_RECORDS_DISABLED", "本机记录保存尚未开启或已关闭。");
  }
  effectivePreferences(account, data) {
    return {
      saveScreenshots: data.preferences.saveScreenshots && account.overrides.saveScreenshots !== false,
      saveInterviewTranscript: data.preferences.saveInterviewTranscript && account.overrides.saveInterviewTranscript !== false,
      // Quota increases must not take effect until configure has successfully
      // persisted in the account's FIFO lane. Only disabling privacy switches
      // has an immediate override above.
      maxStorageMiB: data.preferences.maxStorageMiB
    };
  }
  accountMaxBytes(data) {
    return Math.min(this.hardMaxBytes, data.preferences.maxStorageMiB * MIB);
  }
  capacity(account, data, extra) {
    if (data.totalBytes + extra > this.accountMaxBytes(data)) {
      account.warning = CAPACITY_MESSAGE;
      fail("LOCAL_RECORDS_CAPACITY_LIMIT", CAPACITY_MESSAGE);
    }
  }
  snapshot(account, data) {
    const maxBytes = this.accountMaxBytes(data);
    const warning = data.totalBytes >= maxBytes ? CAPACITY_MESSAGE : account.warning ?? (data.totalBytes >= maxBytes * 0.9 ? NEAR_CAPACITY_MESSAGE : void 0);
    return {
      preferences: this.effectivePreferences(account, data),
      directory: account.directory,
      records: [...data.records.values()].map((item) => ({ ...item })).sort((a, b) => b.createdAt - a.createdAt),
      totalBytes: data.totalBytes,
      maxBytes,
      ...warning ? { warning } : {}
    };
  }
  async journal(file, id, collect) {
    if (await this.safeFile(file) > this.maxTranscriptBytes) {
      fail("LOCAL_RECORDS_CAPACITY_LIMIT", "单份面试转写已达到16MiB限制，请开始新的面试记录。");
    }
    const handle = await promises.open(file, node_fs.constants.O_RDONLY | NO_FOLLOW);
    const stream = handle.createReadStream({ encoding: "utf8" });
    const lines = node_readline.createInterface({ input: stream, crlfDelay: Infinity });
    const entries = /* @__PURE__ */ new Map();
    const fingerprints = /* @__PURE__ */ new Map();
    let createdAt;
    let endedAt;
    let textBytes = 0;
    const textParts = [];
    try {
      for await (const line of lines) {
        if (!line.trim()) continue;
        if (Buffer.byteLength(line) > MAX_JOURNAL_LINE_BYTES) fail("LOCAL_RECORDS_CORRUPT", "本机转写文件损坏。");
        const row = JSON.parse(line);
        if (createdAt === void 0) {
          if (row.type !== "start" || row.id !== id) fail("LOCAL_RECORDS_CORRUPT", "本机转写文件编号不匹配。");
          createdAt = timestamp(row.at);
        } else if (row.type === "entry") {
          if (endedAt !== void 0) fail("LOCAL_RECORDS_CORRUPT", "已结束的转写记录包含额外事件。");
          const entry = normalizeEntry(row.entry?.id, row.entry?.text, row.entry?.at);
          const rendered = readable(entry, fingerprints.has(entry.id));
          textBytes += Buffer.byteLength(rendered);
          if (collect) {
            entries.set(entry.id, entry);
            textParts.push(rendered);
          }
          fingerprints.set(entry.id, fingerprint(entry.text));
        } else if (row.type === "end") endedAt = timestamp(row.at);
        else fail("LOCAL_RECORDS_CORRUPT", "本机转写文件格式无效。");
      }
      if (createdAt === void 0) fail("LOCAL_RECORDS_CORRUPT", "本机转写文件为空。");
    } catch (error) {
      if (error instanceof LocalRecordsError) throw error;
      fail("LOCAL_RECORDS_CORRUPT", "本机转写文件无法读取，请检查记录目录。");
    } finally {
      lines.close();
      stream.destroy();
      await handle.close();
    }
    return { createdAt, endedAt, entries: [...entries.values()], fingerprints, textBytes, text: textParts.join("") };
  }
  cacheTranscript(data, id, cache) {
    data.transcripts.delete(id);
    data.transcripts.set(id, cache);
    if (data.transcripts.size > MAX_TRANSCRIPT_CACHES) {
      data.transcripts.delete(data.transcripts.keys().next().value);
    }
  }
  async scanRecordFiles(account, data) {
    const roots = /* @__PURE__ */ new Map();
    const groups = /* @__PURE__ */ new Map();
    const scan = async (directory, level, sessionId) => {
      await this.safeDirectoryChain(directory);
      for (const item of await promises.readdir(directory, { withFileTypes: true })) {
        if (item.isSymbolicLink()) fail("LOCAL_RECORDS_UNSAFE_PATH", "本机记录目录包含不安全链接。");
        const target = path.join(directory, item.name);
        if (item.isFile()) {
          const size = await this.safeFile(target);
          data.totalBytes += size;
          if (level === "account") roots.set(item.name, size);
          if (!["account", "screenshot-day", "interview-record"].includes(level)) continue;
          const id = item.name.replace(/\.(?:meta\.json|jsonl|txt|png)$/, "");
          if (!RECORD_ID.test(id) || id === item.name) continue;
          if (level === "screenshot-day" && !id.startsWith("screenshot-") || level === "interview-record" && id !== sessionId) {
            fail("LOCAL_RECORDS_CORRUPT", "本机记录文件与所属目录不匹配。");
          }
          const base = path.join(directory, id);
          let group = groups.get(id);
          if (group && group.base !== base) fail("LOCAL_RECORDS_CORRUPT", "本机记录编号重复，已拒绝别名路径。");
          if (!group) {
            group = { base, files: /* @__PURE__ */ new Map() };
            groups.set(id, group);
          }
          group.files.set(item.name, size);
          continue;
        }
        if (!item.isDirectory()) continue;
        if (level === "account" && (item.name === "screenshots" || item.name === "interviews")) {
          await scan(target, item.name);
        } else if (level === "screenshots" || level === "interviews") {
          if (!validRecordDate(item.name)) fail("LOCAL_RECORDS_CORRUPT", "本机记录日期目录无效。");
          await scan(target, level === "screenshots" ? "screenshot-day" : "interview-day");
        } else if (level === "interview-day") {
          recordId(item.name, "interview");
          await scan(target, "interview-record", item.name);
        }
      }
    };
    await scan(account.directory, "account");
    return { roots, groups };
  }
  async load(account) {
    await this.safeDirectory(this.rootDirectory);
    await this.safeDirectory(account.directory);
    const data = {
      preferences: { ...DEFAULT_LOCAL_RECORDS_PREFERENCES },
      preferenceBytes: 0,
      records: /* @__PURE__ */ new Map(),
      locations: /* @__PURE__ */ new Map(),
      transcripts: /* @__PURE__ */ new Map(),
      totalBytes: 0
    };
    const { roots, groups } = await this.scanRecordFiles(account, data);
    if (roots.has("preferences.json")) {
      if (roots.get("preferences.json") > 4096) fail("LOCAL_RECORDS_CORRUPT", "本机记录设置过大。");
      data.preferences = preferences(JSON.parse(await promises.readFile(path.join(account.directory, "preferences.json"), "utf8")));
      data.preferenceBytes = roots.get("preferences.json");
    }
    for (const [id, { base, files }] of groups) {
      const kind = id.startsWith("interview-") ? "interview" : "screenshot";
      const metadataName = `${id}.meta.json`;
      const payloadBytes = kind === "interview" ? (files.get(`${id}.jsonl`) ?? 0) + (files.get(`${id}.txt`) ?? 0) : files.get(`${id}.png`) ?? 0;
      if (!files.has(kind === "interview" ? `${id}.jsonl` : `${id}.png`)) continue;
      data.locations.set(id, base);
      let saved;
      if (files.has(metadataName)) {
        if (files.get(metadataName) > 4096) fail("LOCAL_RECORDS_CORRUPT", "本机记录元数据过大。");
        const parsed = JSON.parse(await promises.readFile(`${base}.meta.json`, "utf8"));
        const item = parsed?.summary;
        if (parsed?.version !== 1 || item?.id !== id || item?.kind !== kind || !Number.isSafeInteger(item.itemCount) || item.itemCount < 0 || !Number.isSafeInteger(item.bytes)) {
          fail("LOCAL_RECORDS_CORRUPT", "本机记录元数据损坏。");
        }
        timestamp(item.createdAt);
        if (item.endedAt !== void 0) timestamp(item.endedAt);
        saved = {
          id,
          kind,
          createdAt: item.createdAt,
          ...item.endedAt !== void 0 ? { endedAt: item.endedAt } : {},
          itemCount: item.itemCount,
          bytes: item.bytes
        };
      }
      if (!saved || saved.bytes !== payloadBytes + (files.get(metadataName) ?? 0)) {
        let summary;
        let recoveredPayload = payloadBytes;
        if (kind === "interview") {
          const journal = await this.journal(`${base}.jsonl`, id, true);
          const txtPath = `${base}.txt`;
          const txtDelta = journal.textBytes - (files.get(`${id}.txt`) ?? 0);
          await this.atomic(txtPath, journal.text);
          data.totalBytes += txtDelta;
          recoveredPayload = (files.get(`${id}.jsonl`) ?? 0) + journal.textBytes;
          summary = {
            id,
            kind,
            createdAt: journal.createdAt,
            ...journal.endedAt !== void 0 ? { endedAt: journal.endedAt } : {},
            itemCount: journal.fingerprints.size,
            bytes: 0
          };
          if (journal.endedAt === void 0) this.cacheTranscript(data, id, { fingerprints: journal.fingerprints });
        } else {
          const info = await promises.stat(`${base}.png`);
          summary = { id, kind, createdAt: Math.round(info.mtimeMs), itemCount: 1, bytes: 0 };
        }
        const next = summaryMetadata(summary, recoveredPayload);
        const delta = Buffer.byteLength(next.text) - (files.get(metadataName) ?? 0);
        await this.atomic(`${base}.meta.json`, next.text);
        data.totalBytes += delta;
        saved = next.summary;
      }
      data.records.set(id, saved);
    }
    return data;
  }
  async state(accountKey) {
    const account = this.account(accountKey);
    return this.enqueue(account, async (data) => this.snapshot(account, data), 0, false);
  }
  async configure(accountKey, patch, guard) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch) || Object.entries(patch).some(([key, value]) => key === "maxStorageMiB" ? !validStorageMiB(value) : !["saveScreenshots", "saveInterviewTranscript"].includes(key) || typeof value !== "boolean")) {
      fail("LOCAL_RECORDS_INVALID_INPUT", "本机记录设置无效。");
    }
    this.checkGuard(guard);
    const account = this.account(accountKey);
    const update = { ...patch };
    if (update.saveScreenshots === false) account.screenshotEpoch++;
    if (update.saveInterviewTranscript === false) account.transcriptEpoch++;
    if (update.saveScreenshots !== void 0) account.overrides.saveScreenshots = update.saveScreenshots;
    if (update.saveInterviewTranscript !== void 0) account.overrides.saveInterviewTranscript = update.saveInterviewTranscript;
    return this.enqueue(account, async (data) => {
      this.checkGuard(guard);
      const next = { ...data.preferences, ...update };
      const text = JSON.stringify(next).padEnd(128, " ") + "\n";
      const delta = Buffer.byteLength(text) - data.preferenceBytes;
      account.dirty = true;
      await this.atomic(path.join(account.directory, "preferences.json"), text, guard);
      data.preferences = next;
      data.preferenceBytes = Buffer.byteLength(text);
      data.totalBytes += delta;
      if (update.maxStorageMiB !== void 0 && account.warning === CAPACITY_MESSAGE) account.warning = void 0;
      return this.snapshot(account, data);
    }, 0, false);
  }
  async appendTranscript(accountKey, input, guard) {
    const id = recordId(input?.recordId, "interview");
    const startedAt = timestamp(input?.startedAt);
    const entry = normalizeEntry(input?.eventId, input?.text, input?.at);
    const account = this.account(accountKey);
    const epoch = account.transcriptEpoch;
    return this.enqueue(account, async (data) => {
      this.checkRecording(account, data, "interview", epoch, guard);
      if (account.deletedInterviews.has(id)) fail("LOCAL_RECORDS_NOT_FOUND", "本机面试记录已删除。");
      const existing = data.records.get(id);
      if (existing && existing.createdAt !== startedAt) fail("LOCAL_RECORDS_INVALID_INPUT", "同一面试记录的开始时间不一致。");
      const base = existing ? await this.recordBase(account, data, id) : this.plannedRecordBase(account, id, startedAt);
      let cache = data.transcripts.get(id);
      if (!cache) {
        cache = { fingerprints: existing ? (await this.journal(`${base}.jsonl`, id, false)).fingerprints : /* @__PURE__ */ new Map() };
      }
      if (existing?.endedAt === void 0) this.cacheTranscript(data, id, cache);
      const hash = fingerprint(entry.text);
      if (cache.fingerprints.get(entry.id) === hash) return { ...existing };
      if (existing?.endedAt !== void 0) fail("LOCAL_RECORDS_CLOSED", "本次面试记录已结束。");
      const revised = cache.fingerprints.has(entry.id);
      const journalText = (existing ? "" : jsonLine({ type: "start", id, at: startedAt })) + jsonLine({ type: "entry", entry });
      const text = readable(entry, revised);
      const oldJournalBytes = existing ? await this.safeFile(`${base}.jsonl`) : 0;
      if (oldJournalBytes + Buffer.byteLength(journalText) + 128 > this.maxTranscriptBytes) {
        account.warning = "单份面试转写已达到16MiB限制，请开始新的面试记录。";
        fail("LOCAL_RECORDS_CAPACITY_LIMIT", account.warning);
      }
      const oldMetaBytes = existing ? await this.safeFile(`${base}.meta.json`) : 0;
      const oldPayload = existing ? existing.bytes - oldMetaBytes : 0;
      const next = summaryMetadata(
        {
          id,
          kind: "interview",
          createdAt: startedAt,
          itemCount: (existing?.itemCount ?? 0) + (revised ? 0 : 1),
          bytes: 0
        },
        oldPayload + Buffer.byteLength(journalText) + Buffer.byteLength(text)
      );
      const delta = next.summary.bytes - (existing?.bytes ?? 0);
      this.capacity(account, data, delta);
      await this.safeDirectoryChain(path.dirname(base), true);
      this.checkRecording(account, data, "interview", epoch, guard);
      const allowed = () => {
        this.checkRecording(account, data, "interview", epoch, guard);
        return true;
      };
      account.dirty = true;
      data.locations.set(id, base);
      await this.append(`${base}.jsonl`, journalText, allowed);
      await this.append(`${base}.txt`, text, allowed);
      await this.atomic(`${base}.meta.json`, next.text, allowed);
      cache.fingerprints.set(entry.id, hash);
      data.records.set(id, next.summary);
      data.totalBytes += delta;
      return { ...next.summary };
    }, Buffer.byteLength(entry.text) * 2 + entry.id.length * 2);
  }
  async endInterview(accountKey, rawId, guard) {
    const id = recordId(rawId, "interview");
    const account = this.account(accountKey);
    return this.enqueue(account, async (data) => {
      this.checkGuard(guard);
      const existing = data.records.get(id);
      if (!existing) fail("LOCAL_RECORDS_NOT_FOUND", "本机面试记录不存在。");
      if (existing.endedAt !== void 0) return { ...existing };
      const endedAt = Math.max(existing.createdAt, timestamp(this.now()));
      const text = jsonLine({ type: "end", at: endedAt });
      const base = await this.recordBase(account, data, id);
      const metaBytes = await this.safeFile(`${base}.meta.json`);
      const next = summaryMetadata({ ...existing, endedAt }, existing.bytes - metaBytes + Buffer.byteLength(text));
      const delta = next.summary.bytes - existing.bytes;
      this.capacity(account, data, delta);
      this.checkGuard(guard);
      account.dirty = true;
      await this.append(`${base}.jsonl`, text, guard);
      await this.atomic(`${base}.meta.json`, next.text, guard);
      data.records.set(id, next.summary);
      data.totalBytes += delta;
      data.transcripts.delete(id);
      return { ...next.summary };
    });
  }
  async readTranscript(accountKey, rawId) {
    const id = recordId(rawId, "interview");
    const account = this.account(accountKey);
    return this.enqueue(account, async (data) => {
      const summary = data.records.get(id);
      if (!summary) fail("LOCAL_RECORDS_NOT_FOUND", "本机面试记录不存在。");
      const base = await this.recordBase(account, data, id);
      const result = await this.journal(`${base}.jsonl`, id, true);
      return { summary: { ...summary }, entries: result.entries };
    });
  }
  async saveScreenshot(accountKey, dataUrl, guard) {
    if (typeof dataUrl !== "string" || dataUrl.length > Math.ceil(MAX_PNG_BYTES / 3) * 4 + 64 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(dataUrl)) {
      fail("LOCAL_RECORDS_INVALID_INPUT", "截图必须是大小不超过16MiB的PNG图像。");
    }
    const createdAt = timestamp(this.now());
    const account = this.account(accountKey);
    const epoch = account.screenshotEpoch;
    return this.enqueue(account, async (data) => {
      this.checkRecording(account, data, "screenshot", epoch, guard);
      const encoded = dataUrl.slice("data:image/png;base64,".length);
      const png = Buffer.from(encoded, "base64");
      if (png.length > MAX_PNG_BYTES || png.length < 33 || png.toString("base64") !== encoded || !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || png.readUInt32BE(8) !== 13 || png.toString("ascii", 12, 16) !== "IHDR" || png.readUInt32BE(16) === 0 || png.readUInt32BE(20) === 0) {
        fail("LOCAL_RECORDS_INVALID_INPUT", "截图PNG内容无效。");
      }
      const id = `screenshot-${node_crypto.randomUUID()}`;
      const base = this.plannedRecordBase(account, id, createdAt);
      const next = summaryMetadata({ id, kind: "screenshot", createdAt, itemCount: 1, bytes: 0 }, png.length);
      this.capacity(account, data, next.summary.bytes);
      await this.safeDirectoryChain(path.dirname(base), true);
      this.checkRecording(account, data, "screenshot", epoch, guard);
      account.dirty = true;
      data.locations.set(id, base);
      await promises.writeFile(`${base}.png`, png, { flag: "wx", mode: 384 });
      const allowed = () => {
        this.checkRecording(account, data, "screenshot", epoch, guard);
        return true;
      };
      await this.atomic(`${base}.meta.json`, next.text, allowed);
      data.records.set(id, next.summary);
      data.totalBytes += next.summary.bytes;
      return { ...next.summary };
    }, dataUrl.length * 2);
  }
  async delete(accountKey, rawId, guard) {
    const id = recordId(rawId);
    const account = this.account(accountKey);
    return this.enqueue(account, async (data) => {
      this.checkGuard(guard);
      const summary = data.records.get(id);
      if (!summary) return false;
      const extensions = summary.kind === "interview" ? ["jsonl", "txt", "meta.json"] : ["png", "meta.json"];
      const base = await this.recordBase(account, data, id);
      const targets = extensions.map((extension) => `${base}.${extension}`);
      for (const target of targets) await this.safeFile(target, true);
      this.checkGuard(guard);
      account.dirty = true;
      if (summary.kind === "interview") {
        account.deletedInterviews.add(id);
        if (account.deletedInterviews.size > 512) account.deletedInterviews.delete(account.deletedInterviews.values().next().value);
      }
      for (const target of targets) await promises.unlink(target).catch((error) => {
        if (!isMissing(error)) throw error;
      });
      data.records.delete(id);
      data.locations.delete(id);
      data.transcripts.delete(id);
      data.totalBytes = Math.max(0, data.totalBytes - summary.bytes);
      account.warning = void 0;
      return true;
    });
  }
  async accountDirectory(accountKey) {
    return (await this.state(accountKey)).directory;
  }
  async screenshotPath(accountKey, rawId) {
    const id = recordId(rawId, "screenshot");
    const account = this.account(accountKey);
    return this.enqueue(account, async (data) => {
      if (!data.records.has(id)) fail("LOCAL_RECORDS_NOT_FOUND", "本机截图不存在。");
      const file = `${await this.recordBase(account, data, id)}.png`;
      await this.safeFile(file);
      return file;
    });
  }
}

export { DEFAULT_LOCAL_RECORDS_PREFERENCES, LOCAL_RECORDS_MIN_STORAGE_MIB, LOCAL_RECORDS_MAX_STORAGE_MIB, LocalRecordsError, RECORD_ID, MAX_PNG_BYTES, MAX_TEXT_BYTES, MAX_TRANSCRIPT_BYTES, MAX_TRANSCRIPT_CACHES, MAX_JOURNAL_LINE_BYTES, NO_FOLLOW, MIB, NEAR_CAPACITY_MESSAGE, CAPACITY_MESSAGE, fail, isMissing, recordId, timestamp, localRecordDate, validRecordDate, normalizeEntry, validStorageMiB, preferences, fingerprint, jsonLine, readable, summaryMetadata, LocalRecordsStore };
