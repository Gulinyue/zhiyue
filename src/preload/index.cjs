"use strict";
// 知跃 / Zhiyue · Developed by gulinyue. See LICENSE.
const electron = require("electron");
const { IPC } = require("../shared/channels.mjs");
const { BRAND } = require('../shared/brand.mjs');
function subscribe(channel, cb) {
  const wrapped = (_e, payload) => cb(payload);
  electron.ipcRenderer.on(channel, wrapped);
  return () => electron.ipcRenderer.off(channel, wrapped);
}
let shortcutOverlayProtectionReady = false;
const shortcutOverlayProtectionListeners = /* @__PURE__ */ new Set();
electron.ipcRenderer.on(
  IPC.windowShortcutOverlayProtectionChanged,
  (_event, ready) => {
    shortcutOverlayProtectionReady = ready === true;
    for (const listener of shortcutOverlayProtectionListeners) {
      listener(shortcutOverlayProtectionReady);
    }
  }
);
const api = {
  lan: {
    status: () => electron.ipcRenderer.invoke('lan:status'),
    start: (address) => electron.ipcRenderer.invoke('lan:start', address),
    stop: () => electron.ipcRenderer.invoke('lan:stop'),
    rotate: () => electron.ipcRenderer.invoke('lan:rotate'),
    approve: (id, allow) => electron.ipcRenderer.invoke('lan:approve', id, allow),
    revoke: (id) => electron.ipcRenderer.invoke('lan:revoke', id),
    scroll: (direction) => electron.ipcRenderer.invoke('lan:scroll', direction),
    copyLink: () => electron.ipcRenderer.invoke('lan:copyLink'),
    publish: (snapshot) => electron.ipcRenderer.invoke('lan:publish', snapshot),
    ack: (value) => electron.ipcRenderer.invoke('lan:ack', value),
    onStatus: (cb) => subscribe('lan:statusChanged', cb),
    onCommand: (cb) => subscribe('lan:command', cb),
  },
  tutorial: {
    openLink: (id) => electron.ipcRenderer.invoke('tutorial:openLink', id),
    copyValue: (id) => electron.ipcRenderer.invoke('tutorial:copyValue', id),
  },
  interview: {
    connection: () => electron.ipcRenderer.invoke('interview:connection'),
    saveConnection: (value) => electron.ipcRenderer.invoke('interview:saveConnection', value),
    discoverModels: (value) => electron.ipcRenderer.invoke('interview:discoverModels', value),
    testConnection: (value) => electron.ipcRenderer.invoke('interview:testConnection', value),
    removeConnection: () => electron.ipcRenderer.invoke('interview:removeConnection'),
    start: () => electron.ipcRenderer.invoke('interview:start'),
    enterWindow: (sessionId) => electron.ipcRenderer.invoke('interview:enterWindow', sessionId),
    windowStatus: () => electron.ipcRenderer.invoke('interview:windowStatus'),
    onWindowChange: (cb) => subscribe('interview:windowChanged', cb),
    stop: (sessionId) => electron.ipcRenderer.invoke('interview:stop', sessionId),
    transcribe: (value) => electron.ipcRenderer.invoke('interview:transcribe', value),
  },
  written: {
    enter: () => electron.ipcRenderer.invoke(IPC.writtenEnter),
    exit: () => electron.ipcRenderer.invoke(IPC.writtenExit),
    status: () => electron.ipcRenderer.invoke(IPC.writtenStatus),
    onChange: (cb) => subscribe(IPC.writtenChanged, cb)
  },
  runtime: { platform: process.platform, arch: process.arch, edition: 'community', brand: BRAND },
  chatgpt: {
    status: () => electron.ipcRenderer.invoke('chatgpt:status'),
    signIn: (options) => electron.ipcRenderer.invoke('chatgpt:signin', options),
    cancel: () => electron.ipcRenderer.invoke('chatgpt:cancel'),
    logout: () => electron.ipcRenderer.invoke('chatgpt:logout'),
    usage: () => electron.ipcRenderer.invoke('chatgpt:usage')
  },
  workspace: {
    list: () => electron.ipcRenderer.invoke('local-workspace:list'),
    read: (id) => electron.ipcRenderer.invoke('local-workspace:read', id),
    save: (conversation) => electron.ipcRenderer.invoke('local-workspace:save', conversation),
    delete: (id) => electron.ipcRenderer.invoke('local-workspace:delete', id)
  },
  settings: {
    get: () => electron.ipcRenderer.invoke(IPC.settingsGet),
    set: (s) => electron.ipcRenderer.invoke(IPC.settingsSet, s),
    patch: (p) => electron.ipcRenderer.invoke(IPC.settingsPatch, p),
    onChange: (cb) => subscribe(IPC.settingsChanged, cb)
  },
  screenshot: {
    capture: (options) => electron.ipcRenderer.invoke(IPC.screenshotCapture, options),
    probe: (displayId) => electron.ipcRenderer.invoke(IPC.screenshotProbe, displayId),
    health: () => electron.ipcRenderer.invoke(IPC.screenshotHealth),
    reset: () => electron.ipcRenderer.invoke(IPC.screenshotReset),
    displays: () => electron.ipcRenderer.invoke(IPC.screenshotDisplays),
    list: () => electron.ipcRenderer.invoke(IPC.screenshotList),
    popLast: () => electron.ipcRenderer.invoke(IPC.screenshotPopLast),
    clear: () => electron.ipcRenderer.invoke(IPC.screenshotClear),
    onChange: (cb) => subscribe(IPC.screenshotChanged, cb)
  },
  window: {
    toggle: () => electron.ipcRenderer.invoke(IPC.windowToggle),
    minimize: () => electron.ipcRenderer.invoke(IPC.windowMinimize),
    toggleMaximize: () => electron.ipcRenderer.invoke(IPC.windowToggleMaximize),
    close: () => electron.ipcRenderer.invoke(IPC.windowClose),
    hide: () => electron.ipcRenderer.invoke(IPC.windowHide),
    show: () => electron.ipcRenderer.invoke(IPC.windowShow),
    setBounds: (expanded) => electron.ipcRenderer.invoke(IPC.windowSetBounds, { expanded }),
    setSurface: (surface) => electron.ipcRenderer.invoke(IPC.windowSetSurface, surface),
    setTaskSurface: (mode, surface, shortcutOverlayEnabled) => electron.ipcRenderer.invoke(IPC.windowSetTaskSurface, {
      mode,
      surface,
      shortcutOverlayEnabled
    }),
    commitTaskSurface: (token) => electron.ipcRenderer.invoke(IPC.windowCommitTaskSurface, token),
    beginTaskLaunch: () => electron.ipcRenderer.invoke(IPC.windowBeginTaskLaunch),
    cancelTaskLaunch: (token) => electron.ipcRenderer.invoke(IPC.windowCancelTaskLaunch, token),
    commitReveal: (token) => electron.ipcRenderer.invoke(IPC.windowCommitReveal, token),
    onRevealRequested: (cb) => subscribe(IPC.windowRevealRequested, cb),
    focusResizeStart: (screenX, screenY) => electron.ipcRenderer.invoke(IPC.windowFocusResizeStart, { screenX, screenY }),
    focusResizeUpdate: (screenX, screenY) => electron.ipcRenderer.invoke(IPC.windowFocusResizeUpdate, { screenX, screenY }),
    focusResizeEnd: () => electron.ipcRenderer.invoke(IPC.windowFocusResizeEnd),
    move: (dx, dy) => electron.ipcRenderer.invoke(IPC.windowMove, { dx, dy }),
    zoom: (z) => electron.ipcRenderer.invoke(IPC.windowZoom, z),
    opacity: (o) => electron.ipcRenderer.invoke(IPC.windowOpacity, o),
    previewOpacity: (o) => electron.ipcRenderer.invoke(IPC.windowPreviewOpacity, o),
    onOpacityPreviewed: (cb) => subscribe(IPC.windowOpacityPreviewed, cb),
    onShortcutOverlayProtectionChanged: (cb) => {
      shortcutOverlayProtectionListeners.add(cb);
      cb(shortcutOverlayProtectionReady);
      return () => {
        shortcutOverlayProtectionListeners.delete(cb);
      };
    },
    reportShortcutOverlayLayout: (size) => {
      electron.ipcRenderer.send(IPC.windowShortcutOverlayLayout, size);
    },
    setInteractive: (v) => electron.ipcRenderer.invoke(IPC.windowSetInteractive, v),
    setFocusable: (v) => electron.ipcRenderer.invoke(IPC.windowSetFocusable, v),
    setWorkMode: (mode) => electron.ipcRenderer.invoke(IPC.windowSetWorkMode, mode),
    onInteractionRecovered: (cb) => subscribe(IPC.windowInteractionRecovered, cb)
  },
  hotkey: {
    onTriggered: (cb) => subscribe(IPC.hotkeyTriggered, cb),
    setCapturing: (v) => electron.ipcRenderer.invoke(IPC.hotkeySetCapturing, v),
    setMobileViewportActive: (v) => electron.ipcRenderer.invoke(IPC.hotkeySetMobileViewportActive, v),
    setAnswerScrollActive: (v) => electron.ipcRenderer.invoke(IPC.hotkeySetAnswerScrollActive, v),
    status: (prospectiveMode) => electron.ipcRenderer.invoke(IPC.hotkeyStatus, prospectiveMode)
  },
  app: {
    openSupport: () => electron.ipcRenderer.invoke(IPC.appOpenSupport),
    openFeedback: () => electron.ipcRenderer.invoke(IPC.appOpenFeedback),
    quit: () => electron.ipcRenderer.invoke(IPC.appQuit),
    downloadUpdate: (downloadUrl) => electron.ipcRenderer.invoke(IPC.appDownloadUpdate, { downloadUrl }),
    onUpdateDownloadProgress: (cb) => subscribe(IPC.appUpdateDownloadProgress, cb)
  },
  auth: {
    status: () => electron.ipcRenderer.invoke(IPC.authGetSnapshot),
    openPortal: (url) => electron.ipcRenderer.invoke(IPC.authOpenPortal, url),
    getTokens: () => electron.ipcRenderer.invoke(IPC.authGetTokens),
    saveTokens: (p) => electron.ipcRenderer.invoke(IPC.authSaveTokens, p),
    clearTokens: () => electron.ipcRenderer.invoke(IPC.authClearTokens),
    onChange: (cb) => subscribe(IPC.authChanged, cb)
  },
  personalModels: {
    discover: (input) => electron.ipcRenderer.invoke('personal-models:discover', input),
    load: () => electron.ipcRenderer.invoke(IPC.personalModelsLoad),
    save: (input) => electron.ipcRenderer.invoke(IPC.personalModelsSave, input),
    test: (input) => electron.ipcRenderer.invoke(IPC.personalModelsTest, input),
    remove: (slot) => electron.ipcRenderer.invoke(IPC.personalModelsRemove, slot),
    run: (input) => electron.ipcRenderer.invoke(IPC.personalModelRun, input),
    cancel: (requestId) => electron.ipcRenderer.invoke(IPC.personalModelCancel, requestId),
    onStreamEvent: (cb) => subscribe(IPC.personalModelStreamEvent, cb)
  },
  knowledgeLibrary: {
    list: (accountKey) => electron.ipcRenderer.invoke(IPC.knowledgeLibraryList, accountKey),
    save: (accountKey, index) => electron.ipcRenderer.invoke(IPC.knowledgeLibrarySave, accountKey, index),
    delete: (accountKey, id) => electron.ipcRenderer.invoke(IPC.knowledgeLibraryDelete, accountKey, id)
  },
  localRecords: {
    state: (accountKey) => electron.ipcRenderer.invoke(IPC.localRecordsState, accountKey),
    configure: (accountKey, patch) => electron.ipcRenderer.invoke(IPC.localRecordsConfigure, accountKey, patch),
    appendTranscript: (accountKey, input) => electron.ipcRenderer.invoke(IPC.localRecordsAppendTranscript, accountKey, input),
    endInterview: (accountKey, id) => electron.ipcRenderer.invoke(IPC.localRecordsEndInterview, accountKey, id),
    readTranscript: (accountKey, id) => electron.ipcRenderer.invoke(IPC.localRecordsReadTranscript, accountKey, id),
    openDirectory: (accountKey) => electron.ipcRenderer.invoke(IPC.localRecordsOpenDirectory, accountKey),
    openScreenshot: (accountKey, id) => electron.ipcRenderer.invoke(IPC.localRecordsOpenScreenshot, accountKey, id),
    delete: (accountKey, id) => electron.ipcRenderer.invoke(IPC.localRecordsDelete, accountKey, id)
  },
  remoteControl: {
    getDeviceId: () => electron.ipcRenderer.invoke(IPC.remoteControlDeviceIdGet),
    getCredentials: () => electron.ipcRenderer.invoke(IPC.remoteControlCredentialsGet),
    saveCredentials: (credentials) => electron.ipcRenderer.invoke(IPC.remoteControlCredentialsSave, credentials),
    clearCredentials: () => electron.ipcRenderer.invoke(IPC.remoteControlCredentialsClear),
    getPowerState: () => electron.ipcRenderer.invoke(IPC.remoteControlPowerStateGet),
    onPowerState: (cb) => subscribe(IPC.remoteControlPowerStateChanged, cb)
  },
  qa: {
    seedTaskSurfaceConversation: () => electron.ipcRenderer.invoke(IPC.qaSeedTaskSurfaceConversation),
    inspectTaskSurfaceWindows: () => electron.ipcRenderer.invoke(IPC.qaInspectTaskSurfaceWindows),
    onTaskSurfaceSeedRequested: (cb) => subscribe(IPC.qaTaskSurfaceSeedRequested, cb)
  },
  log: {
    info: (...args) => electron.ipcRenderer.send(IPC.logInfo, ...args),
    error: (...args) => electron.ipcRenderer.send(IPC.logError, ...args)
  }
};
electron.contextBridge.exposeInMainWorld("api", api);
