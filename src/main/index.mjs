import { registerWorkspaceIpc } from "./store/workspace.mjs";
import { normalizeLocalModelRunInput } from "./models/local-request.mjs";
import { isLoopbackHostname } from "./models/validation.mjs";
import { IPC } from "../shared/channels.mjs";
import { createIpcGateway } from "./ipc/gateway.mjs";
import * as electron from "electron";
import * as path from "node:path";
import { hardenWindow, getContentProtectionDirect, applyContentProtectionDirect } from "./security/display-affinity.mjs";
import { bindMacProtectionRecovery, applyMacContentProtection } from "./security/mac-protection.mjs";
import { getWindowBootstrapSettings, patchSettings, getSettings, setSettings } from "./store/settings.mjs";
import { WindowPositionPersistence } from "./windows/position.mjs";
import { DASHBOARD_WINDOW_WIDTH, DASHBOARD_WINDOW_HEIGHT, DASHBOARD_WINDOW_MIN_WIDTH, DASHBOARD_WINDOW_MIN_HEIGHT, WINDOW_CHROME_OPTIONS, getWindowSurfaceProfile } from "./windows/profiles.mjs";
import { createInitialWindowReveal } from "./windows/initial-reveal.mjs";
import { isResizePoint, createFocusResizeSession, focusResizeBounds } from "./windows/geometry.mjs";
import { resolveWindowOpacity, normalizeWindowOpacity, getAcceleratorsForAction } from "./store/default-settings.mjs";
import { validatedKnowledgeLibraryAccount, KnowledgeLibraryFileStore } from "./store/knowledge-library.mjs";
import { ScreenshotRecoveryScheduler, ScreenshotVisibilityLeases, completeDisplayMediaRequest, runScreenshotRecoveryWarmup } from "./capture/scheduler.mjs";
import { CAPTURE_DISPLAY_UNAVAILABLE, CAPTURE_SOURCE_UNAVAILABLE, CAPTURE_EMPTY_FRAME, MAX_SCROLL_SCREENSHOT_IMAGE_BYTES, MAX_SCROLL_SCREENSHOT_TOTAL_BYTES, CAPTURE_SCROLL_LIMIT, CAPTURE_LONG_UNAVAILABLE, CAPTURE_SYSTEM_BLOCKED, CAPTURE_FAILED, CAPTURE_TIMEOUT, CAPTURE_LONG_INTERRUPTED, CAPTURE_LONG_MATCH_FAILED } from "./capture/constants.mjs";
import { resolvePrimaryCaptureSourceId, resolveLocalCaptureSourceId, resolveExactCaptureSourceId, normalizeRequestedDisplayId } from "./capture/source-selection.mjs";
import { createLongScreenshotScroller, collectScrollingScreenshots, LongScreenshotError } from "./capture/scrolling.mjs";
import { createMacQuadrupleClickListener, createWindowsQuadrupleClickListener, isUnmodifiedCombo } from "./hotkeys/gestures.mjs";
import { isHotkeyAllowedForWorkMode, isWindowSurface, isWorkMode } from "./hotkeys/modes.mjs";
import { getSnapshot, getTokens, saveTokens, clearTokens, getRemoteControlCredentials, getOrCreateRemoteControlDeviceId, saveRemoteControlCredentials, clearRemoteControlCredentials } from "./store/auth.mjs";
import { LocalRecordsStore } from "./store/local-records.mjs";
import { loadPersonalModelCredentialSecret, removePersonalModelCredential, removePersonalModelProfile, getConfiguredPersonalModelProfile, listPersonalModelCredentialSummaries, listPersonalModelProfiles, savePersonalModelCredential, savePersonalModelProfile, PersonalModelCredentialStoreError, clearSessionPersonalModelCredentials } from "./models/credentials.mjs";
import { createDefaultPersonalModelProfile, isPersonalModelConnectionSlot, validatePersonalModelRequest, PersonalModelValidationError } from "./models/validation.mjs";
import { createPersonalModelAdapter, personalModelInvalidRequestMessage } from "./models/adapters.mjs";
import { PersonalModelAdapterError } from "./models/transport.mjs";
import { chatgptAuth } from './models/chatgpt-runtime.mjs';
import { ChatGptAuthError } from './models/chatgpt-auth.mjs';
import { BRAND } from '../shared/brand.mjs';
import { normalizeWrittenOptions } from '../shared/written-options.mjs';
import { ChatGptPlanAdapter } from './models/chatgpt-adapter.mjs';
import { discoverModels } from './models/native-adapters.mjs';
import { speechConnection, saveSpeechConnection, removeSpeechConnection, startInterview, stopInterview, interviewIsActive, transcribeInterview } from './interview/service.mjs';
// 知跃 / Zhiyue · Developed by gulinyue. See LICENSE.
"use strict";
const HOTKEY_ACTIONS = [
  "screenshot:capture",
  "screenshot:captureScrolling",
  "screenshot:analyze",
  "window:toggle",
  "window:hide",
  "window:show",
  "session:reset",
  "interview:clearContext",
  "exam:exit",
  "screenshot:popLast",
  "app:quit",
  "mode:switchQueue",
  "listen:toggle",
  "interview:toggleChat",
  "llm:resendHistory",
  "window:moveUp",
  "window:moveDown",
  "window:moveLeft",
  "window:moveRight",
  "window:zoomIn",
  "window:zoomOut",
  "window:zoomReset",
  "window:opacityDown",
  "window:opacityUp",
  "window:toggleMouseThrough",
  "answer:scrollUp",
  "answer:scrollDown",
  "answer:scrollLeft",
  "answer:scrollRight",
  "mobile:scrollUp",
  "mobile:scrollDown"
];
const SHORTCUT_OVERLAY_WIDTH = 316;
const SHORTCUT_OVERLAY_HEIGHT = 344;
const SHORTCUT_OVERLAY_MARGIN = 16;
function shortcutOverlaySizeForContent(value) {
  if (!value || typeof value !== "object") return null;
  const candidate = value;
  if (typeof candidate.width !== "number" || !Number.isFinite(candidate.width) || candidate.width <= 0 || typeof candidate.height !== "number" || !Number.isFinite(candidate.height) || candidate.height <= 0) return null;
  return {
    width: Math.max(SHORTCUT_OVERLAY_WIDTH, Math.ceil(candidate.width)),
    height: Math.max(SHORTCUT_OVERLAY_HEIGHT, Math.ceil(candidate.height))
  };
}
function shortcutOverlayBounds(workArea, width = SHORTCUT_OVERLAY_WIDTH, height = SHORTCUT_OVERLAY_HEIGHT, margin = SHORTCUT_OVERLAY_MARGIN) {
  const availableWidth = Math.max(1, workArea.width - margin * 2);
  const availableHeight = Math.max(1, workArea.height - margin * 2);
  const appliedWidth = Math.min(Math.max(1, Math.ceil(width)), availableWidth);
  const appliedHeight = Math.min(Math.max(1, Math.ceil(height)), availableHeight);
  return {
    x: workArea.x + margin,
    y: workArea.y + workArea.height - appliedHeight - margin,
    width: appliedWidth,
    height: appliedHeight
  };
}
const warned = /* @__PURE__ */ new WeakSet();
function refreshMacFullscreenOverlay(owner, reason, platform = process.platform, warn = console.warn) {
  if (platform !== "darwin" || owner.isDestroyed()) return false;
  try {
    owner.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true
    });
    owner.setAlwaysOnTop(true, "screen-saver");
    if (owner.isVisible() && !owner.isMinimized()) owner.moveTop();
    warned.delete(owner);
    return true;
  } catch (error) {
    if (!warned.has(owner)) {
      warned.add(owner);
      warn("[zhiyue:mac-fullscreen] failed to refresh fullscreen Space membership", {
        reason,
        error
      });
    }
    return false;
  }
}
class MacOverlayVisibilityIntent {
  desiredVisible = true;
  temporaryHideDepth = 0;
  protectionBlocked = false;
  reset() {
    this.desiredVisible = true;
    this.temporaryHideDepth = 0;
    this.protectionBlocked = false;
  }
  requestShow() {
    this.desiredVisible = true;
  }
  requestHide() {
    this.desiredVisible = false;
    this.protectionBlocked = false;
  }
  beginTemporaryHide() {
    this.temporaryHideDepth += 1;
  }
  endTemporaryHide() {
    this.temporaryHideDepth = Math.max(0, this.temporaryHideDepth - 1);
  }
  markProtectionBlocked() {
    if (this.shouldMaintainVisibility()) this.protectionBlocked = true;
  }
  shouldMaintainVisibility() {
    return this.desiredVisible && this.temporaryHideDepth === 0;
  }
  consumeProtectionRecovery() {
    if (!this.protectionBlocked || !this.shouldMaintainVisibility()) return false;
    this.protectionBlocked = false;
    return true;
  }
}
let shortcutWindow = null;
let shortcutMode = "idle";
let shortcutOverlayEnabledForTask = false;
let shortcutSurfaceActive = false;
let shortcutRendererReady = false;
let shortcutLayoutReady = false;
let shortcutLayoutSize = {
  width: SHORTCUT_OVERLAY_WIDTH,
  height: SHORTCUT_OVERLAY_HEIGHT
};
let shortcutHost = null;
let shortcutDesiredVisible = false;
let displayListenersRegistered = false;
let shortcutProtectionReady = false;
let shortcutProtectionPriming = false;
let shortcutProtectionPrimeTimer = null;
let shortcutProtectionTopologyTimer = null;
let shortcutProtectionEnabled = false;
let shortcutSecurityPolicy = null;
const SHORTCUT_PROTECTION_PRIME_DELAY_MS = 50;
const SHORTCUT_PROTECTION_PRIME_MAX_ATTEMPTS = 4;
const SHORTCUT_PROTECTION_OFFSCREEN_GAP = 64;
const SHORTCUT_PROTECTION_TOPOLOGY_SETTLE_MS = 100;
function configureShortcutOverlaySecurity(policy) {
  shortcutSecurityPolicy = { ...policy };
}
function setShortcutOverlayMode(mode, host, enabled = shortcutOverlayEnabledForTask) {
  const nextEnabled = mode !== "idle" && enabled;
  const stateChanged = shortcutMode !== mode || shortcutOverlayEnabledForTask !== nextEnabled;
  shortcutMode = mode;
  shortcutOverlayEnabledForTask = nextEnabled;
  if (!shortcutOverlayEnabledForTask) {
    destroyShortcutOverlay();
    return;
  }
  if (!stateChanged) {
    if (mode !== "idle" && host && !host.isDestroyed()) {
      ensureShortcutOverlay(host);
      if (shortcutSurfaceActive) showShortcutOverlay(host);
    }
    return;
  }
  destroyShortcutOverlay();
  if (mode !== "idle" && host && !host.isDestroyed()) {
    ensureShortcutOverlay(host);
    if (shortcutSurfaceActive) showShortcutOverlay(host);
  }
}
function setShortcutOverlaySurfaceActive(active, host) {
  shortcutSurfaceActive = active;
  if (!active || shortcutMode === "idle" || !shortcutOverlayEnabledForTask) {
    destroyShortcutOverlay();
    return;
  }
  showShortcutOverlay(host);
}
function showShortcutOverlay(host) {
  if (!shortcutSurfaceActive || !shortcutOverlayEnabledForTask || shortcutMode === "idle" || !host || host.isDestroyed() || !host.isVisible() || host.isMinimized()) {
    hideShortcutOverlay();
    return;
  }
  shortcutDesiredVisible = true;
  const overlay = ensureShortcutOverlay(host);
  revealShortcutOverlayIfReady(overlay, host);
}
function hideShortcutOverlay() {
  shortcutDesiredVisible = false;
  if (!shortcutWindow || shortcutWindow.isDestroyed()) return;
  shortcutWindow.hide();
  if (shortcutProtectionEnabled) {
    setShortcutOverlayRendererProtectionReady(shortcutWindow, false);
  }
}
function destroyShortcutOverlay() {
  const overlay = shortcutWindow;
  shortcutWindow = null;
  shortcutHost = null;
  shortcutRendererReady = false;
  shortcutLayoutReady = false;
  shortcutLayoutSize = {
    width: SHORTCUT_OVERLAY_WIDTH,
    height: SHORTCUT_OVERLAY_HEIGHT
  };
  shortcutDesiredVisible = false;
  shortcutProtectionReady = false;
  shortcutProtectionPriming = false;
  shortcutProtectionEnabled = false;
  if (shortcutProtectionPrimeTimer !== null) {
    clearTimeout(shortcutProtectionPrimeTimer);
    shortcutProtectionPrimeTimer = null;
  }
  if (shortcutProtectionTopologyTimer !== null) {
    clearTimeout(shortcutProtectionTopologyTimer);
    shortcutProtectionTopologyTimer = null;
  }
  if (overlay && !overlay.isDestroyed()) overlay.destroy();
}
function repositionShortcutOverlay(host) {
  if (!shortcutWindow || shortcutWindow.isDestroyed() || !host || host.isDestroyed()) return;
  if (shortcutProtectionEnabled && !shortcutProtectionReady) return;
  applyShortcutOverlayBounds(shortcutWindow, host);
  if (shortcutProtectionEnabled && shortcutProtectionReady) {
    verifyOrFailClosedShortcutOverlayProtection(shortcutWindow, "reposition");
  }
}
function setShortcutOverlayOpacity(opacity) {
  if (!shortcutWindow || shortcutWindow.isDestroyed()) return;
  if (!shortcutWindow.webContents.isDestroyed()) {
    shortcutWindow.webContents.send(
      IPC.windowOpacityPreviewed,
      clamp$2(opacity, 0.86, 1)
    );
  }
}
function getShortcutOverlayWindow() {
  return shortcutWindow;
}
function reportShortcutOverlayLayout(senderId, value) {
  const overlay = shortcutWindow;
  const host = shortcutHost;
  if (!overlay || overlay.isDestroyed() || overlay.webContents.isDestroyed() || overlay.webContents.id !== senderId || !host || host.isDestroyed() || !shortcutOverlayEnabledForTask || shortcutMode === "idle") return false;
  const nextSize = shortcutOverlaySizeForContent(value);
  if (!nextSize) return false;
  const sizeChanged = shortcutLayoutSize.width !== nextSize.width || shortcutLayoutSize.height !== nextSize.height;
  shortcutLayoutSize = nextSize;
  shortcutLayoutReady = true;
  if (sizeChanged) {
    const requiresReprime = shortcutProtectionEnabled && (overlay.isVisible() || shortcutProtectionPriming);
    if (requiresReprime) {
      overlay.hide();
      setShortcutOverlayRendererProtectionReady(overlay, false);
      shortcutProtectionReady = false;
      shortcutProtectionPriming = false;
      if (shortcutProtectionPrimeTimer !== null) {
        clearTimeout(shortcutProtectionPrimeTimer);
        shortcutProtectionPrimeTimer = null;
      }
    }
    applyShortcutOverlayBounds(overlay, host);
  }
  if (shortcutRendererReady && shortcutDesiredVisible) {
    revealShortcutOverlayIfReady(overlay, host);
  }
  return true;
}
function applyShortcutOverlayBounds(overlay, host) {
  const display = electron.screen.getDisplayMatching(host.getBounds());
  overlay.setBounds(shortcutOverlayBounds(
    display.workArea,
    shortcutLayoutSize.width,
    shortcutLayoutSize.height
  ));
}
function ensureShortcutOverlay(host) {
  if (shortcutWindow && !shortcutWindow.isDestroyed()) {
    shortcutHost = host;
    return shortcutWindow;
  }
  const securityPolicy = resolveShortcutOverlaySecurityPolicy();
  const bounds = shortcutOverlayBounds(electron.screen.getDisplayMatching(host.getBounds()).workArea);
  const wantProtection = securityPolicy.contentProtection;
  const overlay = new electron.BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      // Chromium page zoom is shared by origin. Keep this auxiliary renderer
      // in its own in-memory Session so the user's main-window zoom cannot
      // shrink its fixed native viewport and clip the last shortcut rows.
      partition: "climb-shortcut-overlay",
      zoomFactor: 1,
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  shortcutWindow = overlay;
  shortcutHost = host;
  shortcutRendererReady = false;
  shortcutLayoutReady = false;
  shortcutLayoutSize = {
    width: SHORTCUT_OVERLAY_WIDTH,
    height: SHORTCUT_OVERLAY_HEIGHT
  };
  shortcutProtectionReady = !wantProtection;
  shortcutProtectionPriming = false;
  shortcutProtectionEnabled = wantProtection;
  overlay.setAlwaysOnTop(true, "screen-saver");
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (securityPolicy.harden) {
    hardenWindow(overlay);
  }
  if (wantProtection) {
    applyShortcutOverlayContentProtection(overlay);
  } else {
    overlay.setIgnoreMouseEvents(true, { forward: true });
  }
  overlay.on("closed", () => {
    if (shortcutWindow === overlay) {
      shortcutWindow = null;
      shortcutHost = null;
      shortcutRendererReady = false;
      shortcutLayoutReady = false;
      shortcutProtectionReady = false;
      shortcutProtectionPriming = false;
      shortcutProtectionEnabled = false;
    }
  });
  const revealWhenRendererReady = () => {
    if (!shortcutOverlayEnabledForTask || shortcutWindow !== overlay || overlay.isDestroyed()) return;
    if (shortcutRendererReady) return;
    shortcutRendererReady = true;
    if (shortcutProtectionEnabled) {
      setShortcutOverlayRendererProtectionReady(overlay, false);
    }
    revealShortcutOverlayIfReady(overlay, host);
  };
  overlay.once("ready-to-show", revealWhenRendererReady);
  overlay.webContents.once("did-finish-load", revealWhenRendererReady);
  overlay.on("show", () => {
    if (shortcutProtectionReady) {
      verifyOrFailClosedShortcutOverlayProtection(overlay, "show-event");
    } else {
      applyShortcutOverlayContentProtection(overlay);
    }
  });
  if (wantProtection) {
    if (process.platform === "darwin") {
      bindMacProtectionRecovery(overlay, electron.powerMonitor, electron.screen, (reason) => {
        if (!verifyOrFailClosedShortcutOverlayProtection(overlay, reason)) return;
        revealShortcutOverlayIfReady(overlay, host);
      });
    }
    const protectionTimer = setInterval(() => {
      if (overlay.isDestroyed()) {
        clearInterval(protectionTimer);
        return;
      }
      if (!shortcutOverlayEnabledForTask || shortcutMode === "idle" || !shortcutDesiredVisible || shortcutProtectionPriming || shortcutProtectionTopologyTimer !== null) return;
      if (!shortcutProtectionReady) {
        primeShortcutOverlayProtection(overlay, host);
        return;
      }
      verifyOrFailClosedShortcutOverlayProtection(overlay, "periodic");
    }, 1e3);
    overlay.on("closed", () => clearInterval(protectionTimer));
  }
  if (process.platform === "darwin") {
    const macFullscreenTimer = setInterval(() => {
      if (shortcutWindow !== overlay || overlay.isDestroyed()) {
        clearInterval(macFullscreenTimer);
        return;
      }
      if (!shortcutDesiredVisible || !shortcutOverlayEnabledForTask || !shortcutSurfaceActive || shortcutMode === "idle" || host.isDestroyed() || host.isMinimized()) return;
      refreshMacFullscreenOverlay(overlay, "shortcut-periodic-fullscreen-space");
    }, 1e3);
    overlay.on("closed", () => clearInterval(macFullscreenTimer));
  }
  const query = new URLSearchParams({
    surface: "shortcut-overlay",
    mode: shortcutMode,
    captureProtection: wantProtection ? "required" : "not-required"
  }).toString();
  if (process.env.ELECTRON_RENDERER_URL) {
    const base = process.env.ELECTRON_RENDERER_URL.replace(/\/$/, "");
    void overlay.loadURL(`${base}/?${query}`);
  } else {
    void overlay.loadFile(path.join(__dirname, "../renderer/index.html"), {
      query: {
        surface: "shortcut-overlay",
        mode: shortcutMode,
        captureProtection: wantProtection ? "required" : "not-required"
      }
    });
  }
  registerDisplayListeners(host);
  return overlay;
}
function revealShortcutOverlayIfReady(overlay, host) {
  if (!shortcutDesiredVisible || !shortcutOverlayEnabledForTask || !shortcutRendererReady || !shortcutLayoutReady || !shortcutSurfaceActive || shortcutMode === "idle" || shortcutWindow !== overlay || overlay.isDestroyed() || overlay.webContents.isDestroyed() || host.isDestroyed() || !host.isVisible() || host.isMinimized()) return;
  if (!shortcutProtectionReady) {
    primeShortcutOverlayProtection(overlay, host);
    return;
  }
  repositionShortcutOverlay(host);
  if (!shortcutProtectionReady) return;
  if (!verifyOrFailClosedShortcutOverlayProtection(overlay, "before-show")) return;
  if (!overlay.isVisible()) overlay.showInactive();
  if (!shortcutProtectionReady || !verifyOrFailClosedShortcutOverlayProtection(overlay, "after-show")) return;
  overlay.moveTop();
  overlay.setAlwaysOnTop(true, "screen-saver");
  refreshMacFullscreenOverlay(overlay, "shortcut-reveal");
  if (!verifyOrFailClosedShortcutOverlayProtection(overlay, "after-topmost")) return;
  if (shortcutProtectionEnabled) {
    setShortcutOverlayRendererProtectionReady(overlay, true);
  }
}
function setShortcutOverlayRendererProtectionReady(overlay, ready) {
  if (overlay.isDestroyed() || overlay.webContents.isDestroyed()) return;
  try {
    overlay.webContents.send(
      IPC.windowShortcutOverlayProtectionChanged,
      ready
    );
  } catch (error) {
    console.warn("[zhiyue:shortcut-overlay] renderer protection gate failed:", error);
  }
}
function primeShortcutOverlayProtection(overlay, host, attempt = 1) {
  if (shortcutProtectionReady || shortcutProtectionPriming || !shortcutLayoutReady || !shortcutOverlayEnabledForTask || shortcutMode === "idle" || shortcutWindow !== overlay || overlay.isDestroyed() || host.isDestroyed()) return;
  shortcutProtectionPriming = true;
  setShortcutOverlayRendererProtectionReady(overlay, false);
  if (process.platform === "darwin") {
    if (overlay.isVisible()) overlay.hide();
    let mode = applyShortcutOverlayContentProtection(overlay);
    if (isShortcutProtectionConfirmed(mode)) {
      overlay.setIgnoreMouseEvents(true, { forward: true });
      mode = applyShortcutOverlayContentProtection(overlay);
    }
    shortcutProtectionPriming = false;
    if (!isShortcutProtectionConfirmed(mode)) {
      failClosedShortcutOverlayProtection(overlay, "mac-prime", mode);
      if (attempt < SHORTCUT_PROTECTION_PRIME_MAX_ATTEMPTS) {
        shortcutProtectionPrimeTimer = setTimeout(() => {
          shortcutProtectionPrimeTimer = null;
          primeShortcutOverlayProtection(overlay, host, attempt + 1);
        }, SHORTCUT_PROTECTION_PRIME_DELAY_MS);
      }
      return;
    }
    shortcutProtectionReady = true;
    if (shortcutDesiredVisible) revealShortcutOverlayIfReady(overlay, host);
    return;
  }
  if (overlay.isVisible()) overlay.hide();
  if (!moveShortcutOverlayOffscreen(overlay)) {
    shortcutProtectionPriming = false;
    console.error(
      "[zhiyue:shortcut-overlay] no verified off-screen priming bounds; overlay kept hidden"
    );
    return;
  }
  applyShortcutOverlayContentProtection(overlay);
  if (!isShortcutOverlayOutsideAllDisplays(overlay)) {
    shortcutProtectionPriming = false;
    console.error(
      "[zhiyue:shortcut-overlay] priming bounds became visible; overlay kept hidden"
    );
    return;
  }
  if (!overlay.isVisible()) overlay.showInactive();
  shortcutProtectionPrimeTimer = setTimeout(() => {
    shortcutProtectionPrimeTimer = null;
    if (shortcutWindow !== overlay || !shortcutOverlayEnabledForTask || shortcutMode === "idle" || overlay.isDestroyed() || host.isDestroyed()) {
      if (shortcutWindow === overlay) shortcutProtectionPriming = false;
      return;
    }
    let protectionMode = applyShortcutOverlayContentProtection(overlay);
    let protectionConfirmed = isShortcutProtectionConfirmed(protectionMode);
    if (protectionConfirmed) {
      overlay.setIgnoreMouseEvents(true, { forward: true });
      protectionMode = applyShortcutOverlayContentProtection(overlay);
      protectionConfirmed = isShortcutProtectionConfirmed(protectionMode);
    }
    shortcutProtectionPriming = false;
    if (!protectionConfirmed && attempt < SHORTCUT_PROTECTION_PRIME_MAX_ATTEMPTS) {
      primeShortcutOverlayProtection(overlay, host, attempt + 1);
      return;
    }
    if (!protectionConfirmed) {
      overlay.hide();
      console.error(
        "[zhiyue:shortcut-overlay] capture exclusion could not be confirmed; overlay kept hidden",
        { attempt, protectionMode }
      );
      return;
    }
    shortcutProtectionReady = true;
    if (shortcutDesiredVisible) revealShortcutOverlayIfReady(overlay, host);
    else {
      overlay.hide();
      setShortcutOverlayRendererProtectionReady(overlay, false);
    }
  }, SHORTCUT_PROTECTION_PRIME_DELAY_MS);
}
function isShortcutProtectionConfirmed(mode) {
  return process.platform === "darwin" ? mode === "mac-best-effort" : mode === "exclude";
}
function failClosedShortcutOverlayProtection(overlay, reason, mode) {
  if (shortcutWindow !== overlay || overlay.isDestroyed()) return;
  shortcutProtectionReady = false;
  shortcutProtectionPriming = false;
  if (shortcutProtectionPrimeTimer !== null) {
    clearTimeout(shortcutProtectionPrimeTimer);
    shortcutProtectionPrimeTimer = null;
  }
  overlay.hide();
  setShortcutOverlayRendererProtectionReady(overlay, false);
  if (process.platform === "win32") moveShortcutOverlayOffscreen(overlay);
  console.error("[zhiyue:shortcut-overlay] capture exclusion lost; overlay hidden", {
    reason,
    mode
  });
}
function verifyOrFailClosedShortcutOverlayProtection(overlay, reason) {
  if (!shortcutProtectionEnabled) return true;
  const mode = applyShortcutOverlayContentProtection(overlay);
  if (isShortcutProtectionConfirmed(mode)) return true;
  failClosedShortcutOverlayProtection(overlay, reason, mode);
  return false;
}
function rectanglesIntersect(left, right) {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
}
function isShortcutOverlayOutsideAllDisplays(overlay) {
  if (overlay.isDestroyed()) return false;
  const displays = electron.screen.getAllDisplays();
  if (displays.length === 0) return false;
  const applied = overlay.getBounds();
  return displays.every(
    (display) => !rectanglesIntersect(applied, display.bounds)
  );
}
function moveShortcutOverlayOffscreen(overlay) {
  if (overlay.isDestroyed() || overlay.isVisible()) return false;
  const displays = electron.screen.getAllDisplays();
  if (displays.length === 0) return false;
  const displayBounds = displays.map((display) => display.bounds);
  const virtualLeft = Math.min(...displayBounds.map((bounds) => bounds.x));
  const virtualTop = Math.min(...displayBounds.map((bounds) => bounds.y));
  const virtualRight = Math.max(
    ...displayBounds.map((bounds) => bounds.x + bounds.width)
  );
  const virtualBottom = Math.max(
    ...displayBounds.map((bounds) => bounds.y + bounds.height)
  );
  const current = overlay.getBounds();
  const width = Math.max(1, current.width);
  const height = Math.max(1, current.height);
  const candidates = [
    { x: virtualRight + SHORTCUT_PROTECTION_OFFSCREEN_GAP, y: virtualTop, width, height },
    {
      x: virtualLeft - width - SHORTCUT_PROTECTION_OFFSCREEN_GAP,
      y: virtualTop,
      width,
      height
    },
    { x: virtualLeft, y: virtualBottom + SHORTCUT_PROTECTION_OFFSCREEN_GAP, width, height },
    {
      x: virtualLeft,
      y: virtualTop - height - SHORTCUT_PROTECTION_OFFSCREEN_GAP,
      width,
      height
    }
  ];
  for (const candidate of candidates) {
    try {
      overlay.setBounds(candidate);
      if (isShortcutOverlayOutsideAllDisplays(overlay)) return true;
    } catch {
    }
  }
  return false;
}
function registerDisplayListeners(host) {
  if (displayListenersRegistered) return;
  displayListenersRegistered = true;
  const reposition = () => {
    if (shortcutWindow && !shortcutWindow.isDestroyed() && shortcutProtectionEnabled) {
      const overlay = shortcutWindow;
      overlay.hide();
      setShortcutOverlayRendererProtectionReady(overlay, false);
      shortcutProtectionReady = false;
      shortcutProtectionPriming = false;
      if (shortcutProtectionPrimeTimer !== null) {
        clearTimeout(shortcutProtectionPrimeTimer);
        shortcutProtectionPrimeTimer = null;
      }
      if (shortcutProtectionTopologyTimer !== null) {
        clearTimeout(shortcutProtectionTopologyTimer);
        shortcutProtectionTopologyTimer = null;
      }
      if (shortcutDesiredVisible) {
        shortcutProtectionTopologyTimer = setTimeout(() => {
          shortcutProtectionTopologyTimer = null;
          if (shortcutWindow === overlay && !overlay.isDestroyed()) {
            primeShortcutOverlayProtection(overlay, host);
          }
        }, SHORTCUT_PROTECTION_TOPOLOGY_SETTLE_MS);
      }
      return;
    }
    repositionShortcutOverlay(host);
  };
  electron.screen.on("display-added", reposition);
  electron.screen.on("display-removed", reposition);
  electron.screen.on("display-metrics-changed", reposition);
  electron.app.once("will-quit", () => {
    electron.screen.off("display-added", reposition);
    electron.screen.off("display-removed", reposition);
    electron.screen.off("display-metrics-changed", reposition);
    displayListenersRegistered = false;
    destroyShortcutOverlay();
  });
}
function clamp$2(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
function resolveShortcutOverlaySecurityPolicy() {
  if (shortcutSecurityPolicy) return shortcutSecurityPolicy;
  const settings = getWindowBootstrapSettings();
  const debugAny = process.env.DEBUG_WINDOW === "1" || process.env.DEBUG_WINDOW === "2";
  const stealth = settings.windowMode === "stealth" && !debugAny;
  return {
    contentProtection: stealth && process.env.NO_CONTENT_PROTECTION !== "1",
    harden: stealth && process.env.NO_HARDEN !== "1"
  };
}
function applyShortcutOverlayContentProtection(overlay) {
  if (!shortcutProtectionEnabled || overlay.isDestroyed()) return "none";
  if (process.platform === "darwin") return applyMacContentProtection(overlay);
  try {
    overlay.setContentProtection(true);
  } catch (error) {
    console.warn("[zhiyue:shortcut-overlay] content protection failed:", error);
  }
  const electronResult = getContentProtectionDirect(overlay);
  if (electronResult === "exclude") return electronResult;
  return applyContentProtectionDirect(overlay, true, {
    // WDA_MONITOR is visible to capture paths that only honor true exclusion.
    // A strict overlay must stay hidden instead of downgrading to a black box.
    allowMonitorFallback: false
  });
}
let win = null;
let windowSurface = "preparation";
let preparationBounds = null;
let focusBounds = null;
let focusResizeSession = null;
let windowInteractive = true;
let revealSequence = 0;
let pendingTaskLaunchToken = null;
let pendingTaskSurfaceRevealToken = null;
let pendingInteractiveRevealToken = null;
let taskSurfaceRevealTimer = null;
let interactiveRevealTimer = null;
let nativeWindowMode = "stealth";
let writtenSessionActive = false;
let writtenProtectionTimer = null;
function mainProtectionRequired() {
  return writtenSessionActive && process.platform === 'win32' || nativeWindowMode === 'stealth' && process.env.DEBUG_WINDOW !== '1' && process.env.DEBUG_WINDOW !== '2' && process.env.NO_CONTENT_PROTECTION !== '1';
}
function protectionFailed(mode) {
  return process.platform === 'win32' ? mode !== 'exclude' : process.platform === 'darwin' && mode === 'failed';
}
function writtenStatus() {
  return { active: writtenSessionActive, clickThrough: !windowInteractive, focusable: win?.isFocusable() ?? false, opacity: writtenSessionActive ? normalizeWrittenOptions(getSettings().writtenOptions).opacity : getSettings().opacity,
    captureProtection: process.platform === 'win32' && win ? getContentProtectionDirect(win) : 'not-windows' };
}
function resetWrittenProtection() {
  clearInterval(writtenProtectionTimer); writtenProtectionTimer = null;
  configureShortcutOverlaySecurity({ contentProtection: mainProtectionRequired(), harden: nativeWindowMode === 'stealth' && process.env.NO_HARDEN !== '1' });
  if (!mainProtectionRequired() && win && !win.isDestroyed()) {
    win.setContentProtection(false);
    if (process.platform === 'win32') applyContentProtectionDirect(win, false);
  }
}
function exitWrittenMode(error) {
  if (!writtenSessionActive) return { ...writtenStatus(), token: null };
  // Abort both pending screenshots in the renderer (via changed) and model work.
  for (const run of activePersonalModelRuns.values()) run.controller.abort('written-exit');
  win?.hide(); hideShortcutOverlay();
  writtenSessionActive = false;
  taskSurfaceRequestGeneration++;
  setTaskShortcutOverlayMode('idle', false);
  resetWrittenProtection();
  setHotkeyWorkMode('idle');
  setInteractive(true); setFocusable(true);
  const token = prepareTaskWindowSurface('preparation', true);
  previewOpacity(getSettings().opacity);
  const result = { ...writtenStatus(), token, ...(error ? { error } : {}) };
  if (win && !win.webContents.isDestroyed()) win.webContents.send(IPC.writtenChanged, result);
  return result;
}
function enterWrittenMode() {
  if (writtenSessionActive) return { ...writtenStatus(), token: null };
  if (!win || win.isDestroyed()) throw new Error('窗口尚未准备好');
  const previousMode = activeWorkMode;
  setHotkeyWorkMode('exam');
  if (!registeredActions.has('exam:exit')) {
    setHotkeyWorkMode(previousMode);
    throw new Error('退出笔试快捷键未注册成功，请在设置中修改后再开始');
  }
  writtenSessionActive = true;
  try {
    taskSurfaceRequestGeneration++;
    setTaskShortcutOverlayMode('exam', false);
    configureShortcutOverlaySecurity({ contentProtection: mainProtectionRequired(), harden: nativeWindowMode === 'stealth' && process.env.NO_HARDEN !== '1' });
    const token = prepareTaskWindowSurface('focus', true);
    setInteractive(false); setFocusable(false);
    if (process.platform === 'win32' && applyStrictMainWindowProtection(win, 'written-enter') !== 'exclude') {
      throw new Error('Windows 窗口捕获排除不可用，未进入笔试模式');
    }
    setAnswerScrollHotkeysActive(true);
    setTaskShortcutOverlayMode('exam', normalizeWrittenOptions(getSettings().writtenOptions).showShortcutHints);
    previewOpacity(normalizeWrittenOptions(getSettings().writtenOptions).opacity);
    if (process.platform === 'win32') writtenProtectionTimer = setInterval(() => {
      if (!writtenSessionActive || !win || win.isDestroyed()) return;
      if (getContentProtectionDirect(win) !== 'exclude' && applyStrictMainWindowProtection(win, 'written-recheck') !== 'exclude') exitWrittenMode('窗口捕获排除状态失效，已退出笔试模式');
    }, 2000);
    return { ...writtenStatus(), token };
  } catch (error) { exitWrittenMode(error.message); throw error; }
}
const macOverlayVisibility = new MacOverlayVisibilityIntent();
const TASK_EXIT_DWM_SETTLE_MS = 160;
let mainRendererUnavailableHandler = null;
const preparationPositionPersistence = new WindowPositionPersistence((position) => {
  patchSettings({ position });
});
function applyStrictMainWindowProtection(owner, reason) {
  if (process.platform === "darwin") {
    const mode2 = applyMacContentProtection(owner);
    if (mode2 === "failed") hideShortcutOverlay();
    return mode2;
  }
  try {
    owner.setContentProtection(true);
  } catch (error) {
    console.warn("[zhiyue:window] Electron content protection failed:", error);
  }
  let mode = getContentProtectionDirect(owner);
  if (process.platform === "win32" && mode !== "exclude") {
    mode = applyContentProtectionDirect(owner, true, { allowMonitorFallback: false });
  }
  if (process.platform === "win32" && mode !== "exclude") {
    if (owner.isVisible()) owner.hide();
    hideShortcutOverlay();
    applyContentProtectionDirect(owner, false);
  }
  if (reason !== "periodic") {
    console.log("[zhiyue:window] content protection applied:", mode, "via=", reason);
  }
  return mode;
}
function markMacProtectionRevealBlocked() {
  if (process.platform === "darwin") macOverlayVisibility.markProtectionBlocked();
}
function canRestoreMacProtectionHiddenWindow(owner) {
  return process.platform === "darwin" && win === owner && !owner.isDestroyed() && !owner.webContents.isDestroyed() && !owner.isMinimized() && pendingTaskLaunchToken === null && pendingTaskSurfaceRevealToken === null && pendingInteractiveRevealToken === null;
}
function restoreMacProtectionHiddenWindow(owner, reason) {
  if (!canRestoreMacProtectionHiddenWindow(owner)) return;
  if (!macOverlayVisibility.consumeProtectionRecovery()) return;
  refreshMacFullscreenOverlay(owner, `${reason}-before-restore`);
  if (windowInteractive) owner.show();
  else owner.showInactive();
  refreshMacFullscreenOverlay(owner, `${reason}-after-restore`);
  if (windowSurface === "focus") showShortcutOverlay(owner);
  console.log("[zhiyue:mac-protection] protected window visibility recovered", { reason });
}
function setMainRendererUnavailableHandler(handler) {
  mainRendererUnavailableHandler = handler;
}
function failClosedForRendererLoss(owner, reason) {
  if (win !== owner) return;
  const wasWritten = writtenSessionActive;
  clearRevealTimer("task");
  clearRevealTimer("interactive");
  pendingTaskSurfaceRevealToken = null;
  pendingTaskLaunchToken = null;
  pendingInteractiveRevealToken = null;
  focusResizeSession = null;
  if (!owner.isDestroyed() && owner.isVisible()) owner.hide();
  if (wasWritten) {
    writtenSessionActive = false;
    resetWrittenProtection();
    if (!owner.isDestroyed()) {
      setInteractive(true); setFocusable(true); setWindowSurface('preparation');
      previewOpacity(getSettings().opacity);
      if (!owner.webContents.isDestroyed()) owner.webContents.send(IPC.writtenChanged, { ...writtenStatus(), token: null, error: '笔试窗口未完成切换，已恢复普通模式；可从托盘重新显示。' });
    }
  }
  setShortcutOverlayMode("idle", owner, false);
  mainRendererUnavailableHandler?.(reason);
}
function clearRevealTimer(kind) {
  const timer = kind === "task" ? taskSurfaceRevealTimer : interactiveRevealTimer;
  if (timer) clearTimeout(timer);
  if (kind === "task") taskSurfaceRevealTimer = null;
  else interactiveRevealTimer = null;
}
function nextRevealToken() {
  revealSequence += 1;
  return revealSequence;
}
function appIconPath() {
  if (electron.app.isPackaged) {
    return path.join(process.resourcesPath, "icon.png");
  }
  return path.join(__dirname, "../../resources/icon.png");
}
function clampPositionToVisibleDisplays(x, y, width, height) {
  const rect = {
    left: x,
    top: y,
    right: x + width,
    bottom: y + height
  };
  for (const d of electron.screen.getAllDisplays()) {
    const wa2 = d.workArea;
    const waRect = {
      left: wa2.x,
      top: wa2.y,
      right: wa2.x + wa2.width,
      bottom: wa2.y + wa2.height
    };
    const intersects = rect.right > waRect.left && rect.left < waRect.right && rect.bottom > waRect.top && rect.top < waRect.bottom;
    if (intersects) {
      return { x, y, fixed: false };
    }
  }
  const primary = electron.screen.getPrimaryDisplay();
  const wa = primary.workArea;
  const nx = Math.round(wa.x + (wa.width - width) / 2);
  const ny = Math.round(wa.y + 24);
  console.warn(
    "[zhiyue:window] saved position was off-screen; reset to primary work area:",
    { from: { x, y }, to: { x: nx, y: ny } }
  );
  return { x: nx, y: ny, fixed: true };
}
function createMainWindow() {
  if (win && !win.isDestroyed()) return win;
  if (process.platform === "darwin") macOverlayVisibility.reset();
  mainRendererUnavailableHandler?.("window-created");
  const settings = getWindowBootstrapSettings();
  nativeWindowMode = settings.windowMode;
  const primary = electron.screen.getPrimaryDisplay();
  const defaultX = Math.round(primary.workArea.x + (primary.workArea.width - DASHBOARD_WINDOW_WIDTH) / 2);
  const defaultY = primary.workArea.y + 24;
  const raw = settings.position ?? { x: defaultX, y: defaultY };
  const { x: initX, y: initY, fixed } = clampPositionToVisibleDisplays(
    raw.x,
    raw.y,
    DASHBOARD_WINDOW_WIDTH,
    DASHBOARD_WINDOW_HEIGHT
  );
  if (fixed) {
    patchSettings({ position: { x: initX, y: initY } });
  }
  const debugMode = process.env.DEBUG_WINDOW === "1";
  const debugLoud = process.env.DEBUG_WINDOW === "2";
  const debugAny = debugMode || debugLoud;
  const skipContentProtection = process.env.NO_CONTENT_PROTECTION === "1";
  const wantProtection = settings.windowMode === "stealth" && !debugAny && !skipContentProtection;
  const skipHarden = process.env.NO_HARDEN === "1";
  const wantHarden = settings.windowMode === "stealth" && !debugAny && !skipHarden;
  configureShortcutOverlaySecurity({
    contentProtection: wantProtection,
    harden: wantHarden
  });
  win = new electron.BrowserWindow({
    width: debugLoud ? 800 : DASHBOARD_WINDOW_WIDTH,
    height: debugLoud ? 200 : DASHBOARD_WINDOW_HEIGHT,
    x: initX,
    y: initY,
    frame: debugLoud,
    // Transparency is fixed when the BrowserWindow is created. The regular
    // workbench paints an opaque shell, while the active task surface leaves
    // the host clear so only its capsule and one answer card float above the
    // real desktop.
    transparent: !debugLoud,
    backgroundColor: debugLoud ? "#ff0000" : "#00000000",
    minWidth: debugLoud ? 640 : DASHBOARD_WINDOW_MIN_WIDTH,
    minHeight: debugLoud ? 320 : DASHBOARD_WINDOW_MIN_HEIGHT,
    resizable: WINDOW_CHROME_OPTIONS.resizable,
    // A Mac overlay is an auxiliary window, not a fullscreen-primary window.
    // Keep the Windows BrowserWindow options byte-for-byte unchanged.
    ...process.platform === "darwin" ? { fullscreenable: false } : {},
    // 隐身模式下从任务栏隐藏(配合 hardenWindow 让窗口不进入应用列表);
    // 非隐身模式保留任务栏按钮,使窗口成为可被 Xbox Game Bar(Win+Alt+R)选中的正常应用窗口。
    skipTaskbar: debugLoud ? false : settings.windowMode === "stealth",
    alwaysOnTop: true,
    hasShadow: false,
    focusable: debugLoud ? true : settings.windowMode !== "stealth" ? true : false,
    icon: appIconPath(),
    title: debugLoud ? "CLIMB DEBUG" : "",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  windowInteractive = true;
  preparationBounds = { ...win.getBounds(), zoom: 1 };
  focusBounds = null;
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (wantHarden) {
    hardenWindow(win);
  } else if (skipHarden) {
    console.log("[zhiyue:window] hardenWindow skipped (NO_HARDEN=1)");
  }
  const protectionOwner = win;
  const reapplyContentProtection = (reason) => {
    if (!wantProtection || win !== protectionOwner || protectionOwner.isDestroyed()) return;
    const wasVisible = protectionOwner.isVisible();
    const mode = applyStrictMainWindowProtection(protectionOwner, reason);
    if (process.platform !== "darwin") return;
    if (mode === "failed") {
      if (wasVisible) macOverlayVisibility.markProtectionBlocked();
      return;
    }
    restoreMacProtectionHiddenWindow(protectionOwner, reason);
  };
  reapplyContentProtection("init-before-show");
  win.on("show", () => reapplyContentProtection("show-event"));
  win.on("restore", () => reapplyContentProtection("restore-event"));
  if (wantProtection && process.platform === "darwin") {
    bindMacProtectionRecovery(win, electron.powerMonitor, electron.screen, reapplyContentProtection);
  }
  if (wantProtection) {
    const periodicTimer = setInterval(() => {
      if (!win || win.isDestroyed()) {
        clearInterval(periodicTimer);
        return;
      }
      reapplyContentProtection("periodic");
    }, 1e3);
    win.on("closed", () => clearInterval(periodicTimer));
  }
  if (process.platform === "darwin") {
    const macFullscreenTimer = setInterval(() => {
      if (win !== protectionOwner || protectionOwner.isDestroyed()) {
        clearInterval(macFullscreenTimer);
        return;
      }
      if (!macOverlayVisibility.shouldMaintainVisibility() || protectionOwner.isMinimized() || pendingTaskLaunchToken !== null || pendingTaskSurfaceRevealToken !== null || pendingInteractiveRevealToken !== null) return;
      refreshMacFullscreenOverlay(protectionOwner, "periodic-fullscreen-space");
    }, 1e3);
    protectionOwner.on("closed", () => clearInterval(macFullscreenTimer));
  }
  let safetyTimer;
  const startupOwner = win;
  const initialReveal = createInitialWindowReveal({
    reveal: () => {
      if (!win || win !== startupOwner || win.isDestroyed()) return false;
      if (wantProtection && process.platform === "darwin" && applyStrictMainWindowProtection(win, "startup-before-show") === "failed") return false;
      win.show();
      if (!win.isVisible()) return false;
      win.moveTop();
      win.setAlwaysOnTop(true, "screen-saver");
      refreshMacFullscreenOverlay(win, "startup-reveal");
      return true;
    },
    onError: (error, reason) => {
      console.error("[zhiyue:window] show() failed:", reason, error);
    },
    onVisible: (reason) => {
      clearTimeout(safetyTimer);
      if (!win) return;
      try {
        const b = win.getBounds();
        console.log(
          "[zhiyue:window] shown:",
          reason,
          "bounds=",
          b,
          "visible=",
          win.isVisible(),
          "opacity=",
          win.getOpacity(),
          "mode=",
          settings.windowMode,
          debugLoud ? "(DEBUG_WINDOW=2 LOUD)" : debugMode ? "(DEBUG_WINDOW=1)" : "(transparent host)"
        );
      } catch {
      }
      if (skipContentProtection) {
        console.log("[zhiyue:window] content protection skipped (NO_CONTENT_PROTECTION=1)");
      }
    }
  });
  const showWinOnce = initialReveal.attempt;
  startupOwner.once("closed", () => {
    initialReveal.dispose();
    clearTimeout(safetyTimer);
  });
  safetyTimer = setTimeout(() => {
    showWinOnce("timeout-fallback(5s)");
  }, 5e3);
  win.once("ready-to-show", () => {
    showWinOnce("ready-to-show");
  });
  win.webContents.on("did-finish-load", () => {
    win?.webContents.setZoomFactor(clamp(settings.zoom, 0.5, 2));
    applyWindowSurface(windowSurface, true);
    showWinOnce("did-finish-load");
  });
  win.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame) return;
      console.error("[zhiyue:window] did-fail-load", {
        errorCode,
        errorDescription,
        validatedURL
      });
      showWinOnce("did-fail-load");
    }
  );
  win.on("move", () => {
    if (!win) return;
    rememberCurrentSurfaceBounds();
    repositionShortcutOverlay(win);
    if (windowSurface === "preparation" && preparationBounds) {
      preparationPositionPersistence.schedule({
        x: preparationBounds.x,
        y: preparationBounds.y
      });
    }
  });
  win.on("hide", () => hideShortcutOverlay());
  win.on("minimize", () => hideShortcutOverlay());
  win.on("show", () => {
    if (windowSurface === "focus") showShortcutOverlay(win);
  });
  win.on("restore", () => {
    if (windowSurface === "focus") showShortcutOverlay(win);
  });
  win.on("resize", () => {
    if (!focusResizeSession) rememberCurrentSurfaceBounds();
  });
  const createdWindow = win;
  createdWindow.webContents.on("render-process-gone", () => {
    failClosedForRendererLoss(createdWindow, "render-process-gone");
  });
  createdWindow.on("unresponsive", () => {
    failClosedForRendererLoss(createdWindow, "renderer-unresponsive");
  });
  createdWindow.webContents.on("destroyed", () => {
    failClosedForRendererLoss(createdWindow, "web-contents-destroyed");
  });
  createdWindow.webContents.on("did-start-navigation", (_event, _url, isInPlace, isMainFrame) => {
    if (!isInPlace && isMainFrame) {
      failClosedForRendererLoss(createdWindow, "main-frame-navigation");
    }
  });
  createdWindow.on("close", flushPendingWindowPosition);
  win.on("closed", () => {
    clearRevealTimer("task");
    clearRevealTimer("interactive");
    pendingTaskSurfaceRevealToken = null;
    pendingTaskLaunchToken = null;
    pendingInteractiveRevealToken = null;
    focusResizeSession = null;
    windowInteractive = true;
    nativeWindowMode = "stealth";
    failClosedForRendererLoss(createdWindow, "window-closed");
    if (win === createdWindow) win = null;
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  return win;
}
function getWin() {
  return win;
}
function showMainWindowLikeToggleReveal() {
  if (!win) return;
  if (pendingTaskLaunchToken !== null || pendingTaskSurfaceRevealToken !== null) return;
  const wantProtection = mainProtectionRequired();
  if (wantProtection) {
    const mode = applyStrictMainWindowProtection(win, "toggle-before-show");
    if (protectionFailed(mode)) {
      markMacProtectionRevealBlocked();
      return;
    }
  }
  win.showInactive();
  if (wantProtection) {
    const mode = applyStrictMainWindowProtection(win, "toggle-after-show");
    if (protectionFailed(mode)) {
      markMacProtectionRevealBlocked();
      return;
    }
  }
  win.moveTop();
  win.setAlwaysOnTop(true, "screen-saver");
  refreshMacFullscreenOverlay(win, "toggle-reveal");
  if (windowSurface === "focus") showShortcutOverlay(win);
}
function showMainWindowInteractive() {
  if (!win) return;
  if (writtenSessionActive) { showMainWindowLikeToggleReveal(); return; }
  if (process.platform === "darwin") macOverlayVisibility.requestShow();
  if (pendingTaskLaunchToken !== null || pendingTaskSurfaceRevealToken !== null) return;
  clearRevealTimer("interactive");
  pendingInteractiveRevealToken = null;
  if (win.isMinimized()) win.restore();
  const interactionChanged = !windowInteractive;
  setInteractive(true);
  let focusabilityChanged = false;
  try {
    if (!win.isFocusable()) {
      win.setFocusable(true);
      focusabilityChanged = true;
    }
  } catch {
  }
  const wantProtection = mainProtectionRequired();
  if (wantProtection) {
    const mode = applyStrictMainWindowProtection(win, "interactive-before-show");
    if (protectionFailed(mode)) {
      markMacProtectionRevealBlocked();
      return;
    }
  }
  win.show();
  if (wantProtection) {
    const mode = applyStrictMainWindowProtection(win, "interactive-after-show");
    if (protectionFailed(mode)) {
      markMacProtectionRevealBlocked();
      return;
    }
  }
  win.moveTop();
  win.setAlwaysOnTop(true, "screen-saver");
  refreshMacFullscreenOverlay(win, "interactive-reveal");
  if (windowSurface === "focus") showShortcutOverlay(win);
  if (interactionChanged || focusabilityChanged) {
    win.webContents.send(IPC.windowInteractionRecovered);
  }
}
function showMainWindowPreservingInteraction() {
  if (!win) return;
  if (process.platform === "darwin") macOverlayVisibility.requestShow();
  if (pendingTaskLaunchToken !== null || pendingTaskSurfaceRevealToken !== null) return;
  clearRevealTimer("interactive");
  pendingInteractiveRevealToken = null;
  if (win.isMinimized()) win.restore();
  const wantProtection = mainProtectionRequired();
  if (wantProtection) {
    const mode = applyStrictMainWindowProtection(win, "preserve-before-show");
    if (protectionFailed(mode)) {
      markMacProtectionRevealBlocked();
      return;
    }
  }
  if (windowInteractive) win.show();
  else win.showInactive();
  if (wantProtection) {
    const mode = applyStrictMainWindowProtection(win, "preserve-after-show");
    if (protectionFailed(mode)) {
      markMacProtectionRevealBlocked();
      return;
    }
  }
  win.moveTop();
  win.setAlwaysOnTop(true, "screen-saver");
  refreshMacFullscreenOverlay(win, "preserving-reveal");
  if (windowSurface === "focus") showShortcutOverlay(win);
}
function requestMainWindowInteractiveReveal() {
  if (!win || win.isDestroyed()) return;
  if (win.isVisible()) {
    showMainWindowPreservingInteraction();
    return;
  }
  if (pendingTaskLaunchToken !== null || pendingTaskSurfaceRevealToken !== null || pendingInteractiveRevealToken !== null) return;
  const token = nextRevealToken();
  pendingInteractiveRevealToken = token;
  win.webContents.send(IPC.windowRevealRequested, { token });
  clearRevealTimer("interactive");
  interactiveRevealTimer = setTimeout(() => {
    commitMainWindowInteractiveReveal(token);
  }, 500);
}
function commitMainWindowInteractiveReveal(token) {
  if (!Number.isSafeInteger(token) || token !== pendingInteractiveRevealToken) return false;
  clearRevealTimer("interactive");
  pendingInteractiveRevealToken = null;
  showMainWindowPreservingInteraction();
  return true;
}
function toggleWindow() {
  if (!win) return;
  if (win.isVisible()) {
    if (process.platform === "darwin") macOverlayVisibility.requestHide();
    win.hide();
    hideShortcutOverlay();
  } else {
    requestMainWindowInteractiveReveal();
  }
}
function minimizeWindow() {
  if (process.platform === "darwin") macOverlayVisibility.requestHide();
  hideShortcutOverlay();
  win?.minimize();
}
function toggleMaximizeWindow() {
  if (!win) return;
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
}
function closeWindow() {
  electron.app.quit();
}
function flushPendingWindowPosition() {
  preparationPositionPersistence.flush();
}
function hideWindow() {
  if (process.platform === "darwin") macOverlayVisibility.requestHide();
  win?.hide();
  hideShortcutOverlay();
}
function hideMainWindowForScreenshot() {
  if (process.platform === "darwin") macOverlayVisibility.beginTemporaryHide();
  win?.hide();
  hideShortcutOverlay();
}
function restoreMainWindowAfterScreenshot() {
  if (process.platform === "darwin") {
    macOverlayVisibility.endTemporaryHide();
    if (!macOverlayVisibility.shouldMaintainVisibility()) return;
  }
  showMainWindowLikeToggleReveal();
}
function showWindow() {
  if (writtenSessionActive) { showMainWindowLikeToggleReveal(); return; }
  if (pendingTaskLaunchToken !== null || pendingTaskSurfaceRevealToken !== null) return;
  if (process.platform === "darwin") {
    showMainWindowPreservingInteraction();
    return;
  }
  win?.show();
  if (windowSurface === "focus") showShortcutOverlay(win);
}
function setExpanded(next) {
}
function setWindowSurface(surface) {
  if (!win) return;
  focusResizeSession = null;
  if (surface === windowSurface) {
    if (surface === "focus") {
      focusBounds = null;
      applyWindowSurface(surface, true);
    }
    setShortcutOverlaySurfaceActive(surface === "focus", win);
    return;
  }
  rememberCurrentSurfaceBounds();
  windowSurface = surface;
  if (surface === "focus") focusBounds = null;
  applyWindowSurface(surface, surface === "focus");
  setShortcutOverlaySurfaceActive(surface === "focus", win);
}
function prepareTaskWindowSurface(surface, forceReveal = false) {
  if (!win || win.isDestroyed()) return null;
  const shouldReveal = forceReveal || win.isVisible() || pendingTaskLaunchToken !== null || pendingTaskSurfaceRevealToken !== null || pendingInteractiveRevealToken !== null;
  pendingTaskLaunchToken = null;
  clearRevealTimer("interactive");
  pendingInteractiveRevealToken = null;
  clearRevealTimer("task");
  pendingTaskSurfaceRevealToken = null;
  if (win.isVisible()) {
    win.hide();
    hideShortcutOverlay();
  }
  setWindowSurface(surface);
  if (!shouldReveal) return null;
  const token = nextRevealToken();
  pendingTaskSurfaceRevealToken = token;
  taskSurfaceRevealTimer = setTimeout(() => {
    taskSurfaceRevealTimer = null;
    if (pendingTaskSurfaceRevealToken !== token || !win || win.isDestroyed()) return;
    console.error(
      "[zhiyue:window] renderer did not commit the task surface; window kept hidden",
      { token, surface }
    );
    failClosedForRendererLoss(win, "task-surface-commit-timeout");
  }, 1200);
  return token;
}
async function beginTaskLaunchTransition() {
  if (!win || win.isDestroyed()) return null;
  if (pendingTaskLaunchToken !== null) return pendingTaskLaunchToken;
  const owner = win;
  const leavingFocusSurface = windowSurface === "focus";
  const shouldReveal = win.isVisible() || pendingTaskSurfaceRevealToken !== null || pendingInteractiveRevealToken !== null;
  clearRevealTimer("task");
  pendingTaskSurfaceRevealToken = null;
  clearRevealTimer("interactive");
  pendingInteractiveRevealToken = null;
  if (!shouldReveal) return null;
  const token = nextRevealToken();
  pendingTaskLaunchToken = token;
  if (leavingFocusSurface) destroyShortcutOverlay();
  win.hide();
  hideShortcutOverlay();
  if (leavingFocusSurface && process.platform === "win32") {
    await new Promise((resolve) => {
      setTimeout(resolve, TASK_EXIT_DWM_SETTLE_MS);
    });
    if (win !== owner || owner.isDestroyed() || pendingTaskLaunchToken !== token || owner.isVisible()) return null;
  }
  return token;
}
function cancelTaskLaunchTransition(token) {
  if (!Number.isSafeInteger(token) || token !== pendingTaskLaunchToken) return false;
  pendingTaskLaunchToken = null;
  showMainWindowInteractive();
  return true;
}
function commitTaskWindowSurface(token) {
  if (!Number.isSafeInteger(token) || token !== pendingTaskSurfaceRevealToken) return false;
  clearRevealTimer("task");
  pendingTaskSurfaceRevealToken = null;
  if (windowInteractive) showMainWindowInteractive();
  else showMainWindowLikeToggleReveal();
  return true;
}
function setTaskShortcutOverlayMode(mode, enabled) {
  setShortcutOverlayMode(mode, win, enabled);
}
function applyWindowSurface(surface, forceProfile = false) {
  if (!win) return;
  const zoom = win.webContents.getZoomFactor();
  const profile = getWindowSurfaceProfile(surface);
  const saved = surface === "preparation" ? preparationBounds : focusBounds;
  const savedScale = saved && saved.zoom > 0 ? zoom / saved.zoom : 1;
  const targetHeight = forceProfile || !saved ? Math.round(profile.height * zoom) : Math.round(saved.height * savedScale);
  const targetWidth = forceProfile || !saved ? Math.round(profile.width * zoom) : Math.round(saved.width * savedScale);
  const [currentX, currentY] = win.getPosition();
  const currentDisplay = electron.screen.getDisplayMatching(win.getBounds());
  const firstFocusPosition = surface === "focus" && !saved ? {
    x: Math.round(currentDisplay.workArea.x + (currentDisplay.workArea.width - targetWidth) / 2),
    y: currentDisplay.workArea.y + 16
  } : null;
  const visible = clampPositionToVisibleDisplays(
    saved?.x ?? firstFocusPosition?.x ?? currentX,
    saved?.y ?? firstFocusPosition?.y ?? currentY,
    targetWidth,
    targetHeight
  );
  win.setMinimumSize(
    Math.round(profile.minWidth * zoom),
    Math.round(profile.minHeight * zoom)
  );
  win.setResizable(surface === "preparation");
  win.setBounds({ x: visible.x, y: visible.y, width: targetWidth, height: targetHeight });
  rememberCurrentSurfaceBounds();
  repositionShortcutOverlay(win);
}
function rememberCurrentSurfaceBounds() {
  if (!win) return;
  const bounds = win.getBounds();
  const saved = { ...bounds, zoom: win.webContents.getZoomFactor() };
  if (windowSurface === "preparation") preparationBounds = saved;
  else focusBounds = saved;
}
function moveWindow(dx, dy) {
  if (!win) return;
  const [x, y] = win.getPosition();
  win.setPosition(x + dx, y + dy);
}
function beginFocusWindowResize(pointer) {
  if (!win || windowSurface !== "focus" || !isResizePoint(pointer)) return false;
  const bounds = win.getBounds();
  const workArea = electron.screen.getDisplayMatching(bounds).workArea;
  const zoom = win.webContents.getZoomFactor() || 1;
  const profile = getWindowSurfaceProfile("focus");
  focusResizeSession = createFocusResizeSession(
    pointer,
    bounds,
    workArea,
    Math.round(profile.minWidth * zoom),
    Math.round(profile.minHeight * zoom)
  );
  win.setMinimumSize(focusResizeSession.minWidth, focusResizeSession.minHeight);
  const normalized = focusResizeSession.bounds;
  if (normalized.x !== bounds.x || normalized.y !== bounds.y || normalized.width !== bounds.width || normalized.height !== bounds.height) {
    win.setBounds(normalized);
    focusBounds = { ...normalized, zoom };
    repositionShortcutOverlay(win);
  }
  return true;
}
function updateFocusWindowResize(pointer) {
  if (!win || windowSurface !== "focus" || !focusResizeSession || !isResizePoint(pointer)) return false;
  const next = focusResizeBounds(focusResizeSession, pointer);
  if (focusBounds && next.width === focusBounds.width && next.height === focusBounds.height) return true;
  win.setBounds(next);
  focusBounds = { ...next, zoom: win.webContents.getZoomFactor() || 1 };
  return true;
}
function endFocusWindowResize() {
  if (focusResizeSession) rememberCurrentSurfaceBounds();
  focusResizeSession = null;
}
function setZoom(zoom) {
  if (!win) return 1;
  focusResizeSession = null;
  const clamped = clamp(zoom, 0.5, 2);
  const previousZoom = win.webContents.getZoomFactor() || 1;
  const currentBounds = win.getBounds();
  win.webContents.setZoomFactor(clamped);
  const profile = getWindowSurfaceProfile(windowSurface);
  const zoomedW = Math.round(currentBounds.width * (clamped / previousZoom));
  const zoomedH = Math.round(currentBounds.height * (clamped / previousZoom));
  const [x, y] = win.getPosition();
  win.setMinimumSize(
    Math.round(profile.minWidth * clamped),
    Math.round(profile.minHeight * clamped)
  );
  win.setBounds({ x, y, width: zoomedW, height: zoomedH });
  rememberCurrentSurfaceBounds();
  patchSettings({ zoom: clamped });
  return clamped;
}
function setOpacity(opacity) {
  const clamped = previewOpacity(opacity);
  patchSettings({ opacity: clamped });
  return clamped;
}
function adjustOpacity(delta) {
  const settings = getWindowBootstrapSettings();
  if (writtenSessionActive) {
    const writtenOptions = normalizeWrittenOptions({ ...settings.writtenOptions, opacity: settings.writtenOptions.opacity + delta });
    const next = patchSettings({ writtenOptions });
    previewOpacity(writtenOptions.opacity); broadcast(IPC.settingsChanged, next); return writtenOptions.opacity;
  }
  const mouseThrough = !windowInteractive;
  const current = resolveWindowOpacity(settings, mouseThrough);
  const opacity = normalizeWindowOpacity(current + delta, current);
  const next = patchSettings(mouseThrough ? { mouseThroughOpacity: opacity } : { opacity });
  previewOpacity(opacity);
  if (win && !win.webContents.isDestroyed()) {
    win.webContents.send(IPC.settingsChanged, next);
  }
  return opacity;
}
function previewOpacity(opacity) {
  if (!win) return 1;
  const clamped = writtenSessionActive ? normalizeWrittenOptions({ opacity }).opacity : normalizeWindowOpacity(opacity);
  if (!win.webContents.isDestroyed()) {
    win.webContents.send(IPC.windowOpacityPreviewed, clamped);
  }
  setShortcutOverlayOpacity(clamped);
  return clamped;
}
function setInteractive(interactive) {
  if (writtenSessionActive && interactive) return;
  if (!win || windowInteractive === interactive) return;
  if (interactive) {
    win.setIgnoreMouseEvents(false);
  } else {
    win.setIgnoreMouseEvents(true, { forward: true });
  }
  windowInteractive = interactive;
}
function setFocusable(focusable) {
  if (writtenSessionActive && focusable) return;
  if (!win) return;
  try {
    if (win.isFocusable() === focusable) return;
    if (!focusable) win.blur();
    win.setFocusable(focusable);
    if (focusable) win.focus();
  } catch {
  }
}
function quitApp() {
  electron.app.quit();
}
function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
let tray = null;
function trayIconPath() {
  const filename = process.platform === "win32" ? "icon.ico" : process.platform === "darwin" ? "trayTemplate.png" : "icon.png";
  if (electron.app.isPackaged) {
    return path.join(process.resourcesPath, filename);
  }
  return path.join(__dirname, `../../resources/${filename}`);
}
function createAppTray() {
  if (tray && !tray.isDestroyed()) return;
  const image = electron.nativeImage.createFromPath(appIconPath()).resize({ width: 24, height: 24 });
  if (process.platform === "darwin") image.setTemplateImage(true);
  tray = new electron.Tray(image);
  tray.setToolTip(BRAND.name);
  tray.setContextMenu(electron.Menu.buildFromTemplate([
    {
      label: `显示${BRAND.name}`,
      click: () => showMainWindowInteractive()
    },
    {
      label: `隐藏${BRAND.name}`,
      click: () => hideWindow()
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => quitApp()
    }
  ]));
  tray.on("double-click", () => showMainWindowInteractive());
}
function destroyAppTray() {
  if (tray && !tray.isDestroyed()) tray.destroy();
  tray = null;
}
function syncAppTrayVisibility(settings) {
  if (settings.hideTrayIcon) destroyAppTray();
  else createAppTray();
}
function localRecordsErrorCode(error) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : error instanceof Error ? error.message : "";
  return /^LOCAL_RECORDS_[A-Z_]+$/.test(code) ? code : "LOCAL_RECORDS_FAILED";
}
function publicLocalRecordsError(error) {
  const code = localRecordsErrorCode(error);
  const messages = {
    LOCAL_RECORDS_QUEUE_FULL: "本机记录保存队列繁忙，请稍后重试。",
    LOCAL_RECORDS_CAPACITY_LIMIT: "本机记录空间已满，请调高保存上限或删除不需要的记录。",
    LOCAL_RECORDS_INVALID_INPUT: "本机记录请求无效。",
    LOCAL_RECORDS_NOT_FOUND: "本机记录不存在。",
    LOCAL_RECORDS_CORRUPT: "本机记录文件损坏，请检查记录目录。",
    LOCAL_RECORDS_UNSAFE_PATH: "本机记录路径不安全，已拒绝操作。",
    LOCAL_RECORDS_CLOSED: "本次面试记录已结束。",
    LOCAL_RECORDS_DISABLED: "本次记录已取消或保存已关闭。",
    LOCAL_RECORDS_OPEN_FAILED: "无法打开本机记录，请检查系统默认打开方式。"
  };
  return new Error(`${code}: ${messages[code] ?? "本机记录操作失败，请检查磁盘空间和目录权限。"}`);
}
class LocalRecordsBridge {
  constructor(deps) {
    this.deps = deps;
    this.authChanged();
  }
  authIdentity = "";
  authGeneration = 0;
  screenshotPreferenceEpoch = /* @__PURE__ */ new Map();
  warnings = /* @__PURE__ */ new Map();
  authChanged() {
    const snapshot = this.deps.getAuthSnapshot();
    const identity = `${snapshot.status}:${snapshot.email?.trim().toLowerCase() ?? ""}`;
    if (identity !== this.authIdentity) {
      this.authIdentity = identity;
      this.authGeneration += 1;
    }
  }
  register(registrar) {
    const handle = (channel, write, operation) => registrar.handle(channel, async (event, accountKey, ...args) => {
      this.deps.assertMainRenderer(event.sender.id);
      const lease = this.ownerLease(accountKey, write);
      let result;
      try {
        result = await operation(lease, ...args);
      } catch (error) {
        throw publicLocalRecordsError(error);
      }
      this.assertCurrent(lease);
      this.deps.assertMainRenderer(event.sender.id);
      return result;
    });
    handle(IPC.localRecordsState, false, (lease) => this.state(lease));
    handle(IPC.localRecordsConfigure, false, async (lease, patch) => {
      if (patch && Object.prototype.hasOwnProperty.call(patch, "saveScreenshots")) {
        this.screenshotPreferenceEpoch.set(lease.owner, this.preferenceEpoch(lease.owner) + 1);
      }
      await this.deps.store.configure(lease.owner, patch, () => this.isCurrent(lease));
      this.warnings.delete(lease.owner);
      return this.state(lease);
    });
    handle(IPC.localRecordsAppendTranscript, true, async (lease, input) => {
      try {
        await this.deps.store.appendTranscript(lease.owner, input, () => this.isCurrent(lease));
        this.warnings.delete(lease.owner);
      } catch (error) {
        if (localRecordsErrorCode(error) === "LOCAL_RECORDS_DISABLED") return;
        this.rememberWarning(lease.owner, error);
        throw error;
      }
    });
    handle(IPC.localRecordsEndInterview, false, async (lease, id) => {
      try {
        await this.deps.store.endInterview(lease.owner, id, () => this.isCurrent(lease));
      } catch (error) {
        if (localRecordsErrorCode(error) !== "LOCAL_RECORDS_NOT_FOUND") throw error;
      }
    });
    handle(IPC.localRecordsReadTranscript, false, (lease, id) => this.deps.store.readTranscript(lease.owner, id));
    handle(IPC.localRecordsOpenDirectory, false, async (lease) => {
      const path2 = await this.deps.store.accountDirectory(lease.owner);
      this.assertCurrent(lease);
      await this.openPath(path2);
    });
    handle(IPC.localRecordsOpenScreenshot, false, async (lease, id) => {
      const path2 = await this.deps.store.screenshotPath(lease.owner, id);
      this.assertCurrent(lease);
      await this.openPath(path2);
    });
    handle(IPC.localRecordsDelete, false, async (lease, id) => {
      const deleted = await this.deps.store.delete(lease.owner, id, () => this.isCurrent(lease));
      if (deleted) this.warnings.delete(lease.owner);
      return deleted;
    });
  }
  /** Start before capture is queued, so a delayed frame cannot acquire a new owner. */
  beginScreenshotArchive() {
    try {
      const snapshot = this.deps.getAuthSnapshot();
      const owner = this.ownerLease(snapshot.email, true);
      return { ...owner, preferenceEpoch: this.preferenceEpoch(owner.owner) };
    } catch {
      return null;
    }
  }
  /** Best effort only: archival failure must never fail the real screenshot. */
  async archiveScreenshot(lease, dataUrl) {
    if (!lease || !this.isCaptureCurrent(lease)) return;
    try {
      await this.deps.store.saveScreenshot(lease.owner, dataUrl, () => this.isCaptureCurrent(lease));
      this.warnings.delete(lease.owner);
    } catch (error) {
      this.rememberWarning(lease.owner, error);
    }
  }
  async state(lease) {
    const state = await this.deps.store.state(lease.owner);
    return { ...state, warning: state.warning ?? this.warnings.get(lease.owner) };
  }
  ownerLease(accountKey, write) {
    this.authChanged();
    const snapshot = this.deps.getAuthSnapshot();
    if (write && snapshot.status !== "loggedIn") throw new Error("LOCAL_RECORDS_LOGIN_REQUIRED");
    const email = snapshot.status === "loggedIn" || snapshot.status === "expired" ? snapshot.email : void 0;
    let owner;
    try {
      owner = validatedKnowledgeLibraryAccount(accountKey, email);
    } catch {
      throw new Error("LOCAL_RECORDS_ACCOUNT_MISMATCH");
    }
    return { owner, generation: this.authGeneration, write };
  }
  isCurrent(lease) {
    this.authChanged();
    if (this.authGeneration !== lease.generation) return false;
    const snapshot = this.deps.getAuthSnapshot();
    return (snapshot.status === "loggedIn" || !lease.write && snapshot.status === "expired") && snapshot.email?.trim().toLowerCase() === lease.owner;
  }
  assertCurrent(lease) {
    if (!this.isCurrent(lease)) throw new Error("LOCAL_RECORDS_ACCOUNT_MISMATCH");
  }
  preferenceEpoch(owner) {
    return this.screenshotPreferenceEpoch.get(owner) ?? 0;
  }
  isCaptureCurrent(lease) {
    return this.isCurrent(lease) && lease.preferenceEpoch === this.preferenceEpoch(lease.owner);
  }
  async openPath(path2) {
    const error = await this.deps.openPath(path2);
    if (error) throw new Error("LOCAL_RECORDS_OPEN_FAILED");
  }
  rememberWarning(owner, error) {
    const code = localRecordsErrorCode(error);
    if (code === "LOCAL_RECORDS_DISABLED") return;
    this.warnings.set(owner, code === "LOCAL_RECORDS_QUEUE_FULL" ? "本机记录保存队列繁忙，本次记录未保存。" : code === "LOCAL_RECORDS_CAPACITY_LIMIT" ? "本机记录空间已满，请调高保存上限或删除不需要的记录后继续保存。" : "本机记录保存失败，请检查本机磁盘空间和目录权限。");
  }
}
let bridge;
function registerLocalRecordsIpc(registrar, dependencies) {
  if (bridge) return;
  bridge = new LocalRecordsBridge(dependencies);
  bridge.register(registrar);
}
function notifyLocalRecordsAuthChanged() {
  bridge?.authChanged();
}
function beginScreenshotArchive() {
  return bridge?.beginScreenshotArchive() ?? null;
}
function archiveCapturedScreenshot(lease, dataUrl) {
  void bridge?.archiveScreenshot(lease, dataUrl).catch(() => void 0);
}
const queue = [];
const POST_HIDE_MS = 160;
const BETWEEN_GRABS_MS = 120;
const PROBE_THUMBNAIL_SIZE = { width: 320, height: 240 };
const captureScheduler = new ScreenshotRecoveryScheduler();
const visibilityLeases = new ScreenshotVisibilityLeases({
  isVisible: () => getWin()?.isVisible() ?? false,
  hide: () => hideMainWindowForScreenshot(),
  reveal: () => restoreMainWindowAfterScreenshot()
});
class CaptureDisplayUnavailableError extends Error {
  code = CAPTURE_DISPLAY_UNAVAILABLE;
  constructor(displayId) {
    super(`${CAPTURE_DISPLAY_UNAVAILABLE}: ${displayId}`);
    this.name = "CaptureDisplayUnavailableError";
  }
}
class CaptureSourceUnavailableError extends Error {
  code = CAPTURE_SOURCE_UNAVAILABLE;
  constructor(displayId) {
    super(`${CAPTURE_SOURCE_UNAVAILABLE}: ${displayId}`);
    this.name = "CaptureSourceUnavailableError";
  }
}
class CaptureEmptyFrameError extends Error {
  code = CAPTURE_EMPTY_FRAME;
  constructor(displayId) {
    super(`${CAPTURE_EMPTY_FRAME}: ${displayId}`);
    this.name = "CaptureEmptyFrameError";
  }
}
function resolveTargetDisplay(displayId) {
  const primary = electron.screen.getPrimaryDisplay();
  if (!displayId) return primary;
  const exact = electron.screen.getAllDisplays().find((display) => String(display.id) === displayId);
  if (!exact) throw new CaptureDisplayUnavailableError(displayId);
  return exact;
}
function assertCaptureAllowed(attempt, assertAllowed) {
  attempt.assertActive();
  assertAllowed?.();
}
async function grabScreenThumbnail(displayId, origin, attempt, assertAllowed, thumbnailSize) {
  assertCaptureAllowed(attempt, assertAllowed);
  const display = resolveTargetDisplay(displayId);
  const displays = electron.screen.getAllDisplays();
  const sources = await electron.desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: thumbnailSize ?? display.size
  });
  assertCaptureAllowed(attempt, assertAllowed);
  const displayIdentities = displays.map((candidate) => ({ id: String(candidate.id) }));
  const sourceIdentities = sources.map((source) => ({
    id: source.id,
    displayId: source.display_id
  }));
  const targetDisplayId = String(display.id);
  const targetSourceId = !displayId ? resolvePrimaryCaptureSourceId(displayIdentities, sourceIdentities, targetDisplayId) : origin === "local" && process.platform === "win32" ? resolveLocalCaptureSourceId(displayIdentities, sourceIdentities, targetDisplayId) : resolveExactCaptureSourceId(displayIdentities, sourceIdentities, targetDisplayId);
  const target = targetSourceId ? sources.find((source) => source.id === targetSourceId) : void 0;
  if (!target) throw new CaptureSourceUnavailableError(targetDisplayId);
  return { displayId: targetDisplayId, thumbnail: target.thumbnail };
}
function encodeScreenThumbnail(frame) {
  if (frame.thumbnail.isEmpty()) return null;
  const png = frame.thumbnail.toPNG();
  if (png.byteLength === 0) return null;
  return `data:image/png;base64,${png.toString("base64")}`;
}
async function performScreenshotProbe(rawDisplayId, attempt, assertAllowed) {
  assertCaptureAllowed(attempt, assertAllowed);
  const displayId = normalizeRequestedDisplayId(rawDisplayId);
  const frame = await grabScreenThumbnail(
    displayId,
    "local",
    attempt,
    assertAllowed,
    PROBE_THUMBNAIL_SIZE
  );
  assertCaptureAllowed(attempt, assertAllowed);
  if (frame.thumbnail.isEmpty()) throw new CaptureEmptyFrameError(frame.displayId);
}
async function performCapture(options, attempt, assertAllowed) {
  assertCaptureAllowed(attempt, assertAllowed);
  const displayId = normalizeRequestedDisplayId(options.displayId);
  const longScroller = options.origin === "local" && options.scroll === true ? createLongScreenshotScroller(resolveTargetDisplay(displayId).bounds, () => getWin()?.isFocused() ?? false) : null;
  const visibilityLease = visibilityLeases.acquire();
  const unregisterInvalidation = attempt.onInvalidate(() => visibilityLease.release());
  try {
    if (visibilityLease.didHideWindow) {
      await new Promise((r) => setTimeout(r, POST_HIDE_MS));
      assertCaptureAllowed(attempt, assertAllowed);
    }
    await grabScreenThumbnail(
      displayId,
      options.origin,
      attempt,
      assertAllowed,
      PROBE_THUMBNAIL_SIZE
    );
    await new Promise((r) => setTimeout(r, BETWEEN_GRABS_MS));
    assertCaptureAllowed(attempt, assertAllowed);
    let frame = await grabScreenThumbnail(displayId, options.origin, attempt, assertAllowed);
    let frames = [frame];
    if (longScroller) {
      const assertLongAllowed = () => {
        assertCaptureAllowed(attempt, assertAllowed);
        longScroller.assertSafe();
      };
      const toBitmap = (source) => {
        const { width, height } = source.thumbnail.getSize(1);
        return { width, height, pixels: source.thumbnail.toBitmap({ scaleFactor: 1 }) };
      };
      assertLongAllowed();
      const captured = await collectScrollingScreenshots(toBitmap(frame), {
        assertAllowed: assertLongAllowed,
        canContinue: () => longScroller.canScroll(),
        scroll: () => longScroller.scrollDown(),
        settle: async (ms) => {
          for (let elapsed = 0; elapsed < ms; elapsed += 40) {
            await new Promise((r) => setTimeout(r, Math.min(40, ms - elapsed)));
            assertLongAllowed();
          }
        },
        capture: async () => {
          assertLongAllowed();
          await grabScreenThumbnail(displayId, options.origin, attempt, assertAllowed, PROBE_THUMBNAIL_SIZE);
          await new Promise((r) => setTimeout(r, BETWEEN_GRABS_MS));
          assertLongAllowed();
          const next = await grabScreenThumbnail(displayId, options.origin, attempt, assertAllowed);
          assertLongAllowed();
          return toBitmap(next);
        }
      });
      assertLongAllowed();
      frames = captured.map((bitmap) => ({
        displayId: frame.displayId,
        thumbnail: electron.nativeImage.createFromBitmap(Buffer.from(bitmap.pixels), { width: bitmap.width, height: bitmap.height, scaleFactor: 1 })
      }));
    }
    let totalBytes = 0;
    const dataUrls = frames.map((captured) => {
      assertCaptureAllowed(attempt, assertAllowed);
      const dataUrl = encodeScreenThumbnail(captured);
      if (!dataUrl) throw new CaptureEmptyFrameError(captured.displayId);
      if (longScroller) {
        const bytes = Buffer.byteLength(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64");
        totalBytes += bytes;
        if (bytes > MAX_SCROLL_SCREENSHOT_IMAGE_BYTES || totalBytes > MAX_SCROLL_SCREENSHOT_TOTAL_BYTES) {
          throw new LongScreenshotError(CAPTURE_SCROLL_LIMIT, "滚动截图文件过大，未发送；请降低分辨率或分次单张截图");
        }
      }
      return dataUrl;
    });
    assertCaptureAllowed(attempt, assertAllowed);
    if (options.enqueue !== false) queue.push(...dataUrls);
    return dataUrls;
  } finally {
    unregisterInvalidation();
    visibilityLease.release();
  }
}
async function captureScreenshot(options = {}, assertAllowed) {
  const urls = await captureFrames({ ...options, scroll: false }, assertAllowed);
  return urls[0] ?? null;
}
async function captureScrollingScreenshots(options, assertAllowed) {
  if (options.origin !== "local") throw new LongScreenshotError(CAPTURE_LONG_UNAVAILABLE, "滚动截图只能从电脑端主动触发");
  return captureFrames({ ...options, scroll: true }, assertAllowed);
}
async function captureFrames(options, assertAllowed) {
  const archiveOwner = beginScreenshotArchive();
  const urls = await captureScheduler.run((attempt) => performCapture(options, attempt, assertAllowed));
  for (const url of urls) archiveCapturedScreenshot(archiveOwner, url);
  return urls;
}
async function probeScreenshotSource(displayId, assertAllowed) {
  return captureScheduler.run((attempt) => performScreenshotProbe(displayId, attempt, assertAllowed));
}
function getScreenshotRecoveryState() {
  return captureScheduler.getSnapshot();
}
function resetScreenshotCaptureSubsystem() {
  return captureScheduler.reset();
}
function listCaptureDisplays() {
  const primaryId = String(electron.screen.getPrimaryDisplay().id);
  return electron.screen.getAllDisplays().map((display, index) => ({
    id: String(display.id),
    label: display.label?.trim() || `显示器 ${index + 1}`,
    isPrimary: String(display.id) === primaryId,
    width: display.size.width,
    height: display.size.height,
    scaleFactor: display.scaleFactor
  }));
}
function listScreenshots() {
  return [...queue];
}
function popLastScreenshot() {
  return queue.pop() ?? null;
}
function clearScreenshots() {
  queue.length = 0;
}
function countScreenshots() {
  return queue.length;
}
async function handleDisplayMediaRequest(callback) {
  await completeDisplayMediaRequest(
    captureScheduler,
    () => electron.desktopCapturer.getSources({ types: ["screen"] }),
    callback
  );
}
async function primeDesktopCapturer() {
  await runScreenshotRecoveryWarmup(
    captureScheduler,
    () => electron.desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 320, height: 240 }
    })
  );
}
let currentHandler = null;
const registeredAccelerators = [];
const mobileViewportAccelerators = [];
const interviewContextAccelerators = [];
const answerScrollAccelerators = [];
const taskScopedBareAccelerators = [];
const registeredActions = /* @__PURE__ */ new Set();
const mobileViewportRegisteredActions = /* @__PURE__ */ new Set();
const interviewContextRegisteredActions = /* @__PURE__ */ new Set();
const answerScrollRegisteredActions = /* @__PURE__ */ new Set();
const taskScopedBareRegisteredActions = /* @__PURE__ */ new Set();
let activeWorkMode = "idle";
let mobileViewportActive = false;
let answerScrollActive = false;
let capturing = false;
const createQuadrupleClickListener = process.platform === "darwin" ? createMacQuadrupleClickListener : createWindowsQuadrupleClickListener;
const quadrupleClickScreenshotListener = createQuadrupleClickListener({
  onTrigger: () => onTrigger("screenshot:capture")
});
const MOVE_STEP = 20;
const ZOOM_STEP = 0.1;
const OPACITY_STEP = 0.1;
const MOBILE_VIEWPORT_HOTKEY_ACTIONS = /* @__PURE__ */ new Set([
  "mobile:scrollUp",
  "mobile:scrollDown"
]);
const INTERVIEW_CONTEXT_HOTKEY_ACTIONS = /* @__PURE__ */ new Set([
  "interview:clearContext"
]);
const ANSWER_SCROLL_HOTKEY_ACTIONS = /* @__PURE__ */ new Set([
  "answer:scrollUp",
  "answer:scrollDown",
  "answer:scrollLeft",
  "answer:scrollRight"
]);
function registerHotkeys(handler) {
  currentHandler = handler;
  if (capturing) return;
  unregisterAll();
  const { hotkeys } = getSettings();
  const entries = Object.entries(hotkeys);
  for (const [action, accel] of entries) {
    if (MOBILE_VIEWPORT_HOTKEY_ACTIONS.has(action) || INTERVIEW_CONTEXT_HOTKEY_ACTIONS.has(action) || ANSWER_SCROLL_HOTKEY_ACTIONS.has(action)) continue;
    if (!accel) continue;
    if (isUnmodifiedCombo(accel)) continue;
    const accelerators = getAcceleratorsForAction(action, accel);
    for (const accelerator of accelerators) {
      let ok = false;
      try {
        ok = electron.globalShortcut.register(accelerator, () => onTrigger(action));
      } catch (error) {
        console.warn("[zhiyue:hotkey] failed to register global shortcut", {
          action,
          accelerator,
          error
        });
        continue;
      }
      if (ok) {
        registeredAccelerators.push(accelerator);
        registeredActions.add(action);
      } else {
        console.warn("[zhiyue:hotkey] failed to register global shortcut", {
          action,
          accelerator
        });
      }
    }
  }
  syncTaskScopedBareHotkeys();
  syncMobileViewportHotkeys();
  syncInterviewContextHotkeys();
  syncAnswerScrollHotkeys();
  syncQuadrupleClickScreenshotListener();
}
function unregisterAll() {
  quadrupleClickScreenshotListener.stop();
  unregisterTaskScopedBareHotkeys();
  unregisterMobileViewportHotkeys();
  unregisterInterviewContextHotkeys();
  unregisterAnswerScrollHotkeys();
  for (const a of registeredAccelerators) electron.globalShortcut.unregister(a);
  registeredAccelerators.length = 0;
  registeredActions.clear();
}
function getHotkeyRegistrationStatus(prospectiveMode) {
  const status = Object.fromEntries(
    HOTKEY_ACTIONS.map((action) => [action, registeredActions.has(action)])
  );
  if (capturing || activeWorkMode !== "idle" || !prospectiveMode || prospectiveMode === "idle") return status;
  const { hotkeys } = getSettings();
  const probedAccelerators = [];
  try {
    for (const [action, accel] of Object.entries(hotkeys)) {
      if (status[action] || !accel || !isUnmodifiedCombo(accel) || !isHotkeyAllowedForWorkMode(prospectiveMode, action) || MOBILE_VIEWPORT_HOTKEY_ACTIONS.has(action) || INTERVIEW_CONTEXT_HOTKEY_ACTIONS.has(action) || ANSWER_SCROLL_HOTKEY_ACTIONS.has(action)) continue;
      status[action] = probeAccelerators(
        action,
        getAcceleratorsForAction(action, accel),
        probedAccelerators
      );
    }
  } finally {
    for (const accelerator of probedAccelerators) {
      try {
        electron.globalShortcut.unregister(accelerator);
      } catch (error) {
        console.warn("[zhiyue:hotkey] failed to release probed task-scoped shortcut", {
          accelerator,
          error
        });
      }
    }
  }
  return status;
}
function setHotkeyWorkMode(mode) {
  if (mode !== activeWorkMode) quadrupleClickScreenshotListener.stop();
  activeWorkMode = mode;
  syncTaskScopedBareHotkeys();
  syncMobileViewportHotkeys();
  syncInterviewContextHotkeys();
  syncAnswerScrollHotkeys();
  syncQuadrupleClickScreenshotListener();
}
function setMobileViewportHotkeysActive(next) {
  mobileViewportActive = next;
  syncMobileViewportHotkeys();
}
function setAnswerScrollHotkeysActive(next) {
  answerScrollActive = next;
  syncAnswerScrollHotkeys();
}
function setCapturing(next) {
  if (capturing === next) return;
  capturing = next;
  if (next) {
    unregisterAll();
  } else {
    registerHotkeys(currentHandler ?? (() => {
    }));
  }
}
function onTrigger(action) {
  if (!isHotkeyAllowedForWorkMode(activeWorkMode, action)) return;
  if (writtenSessionActive && (action === 'exam:exit' || action === 'session:reset')) { exitWrittenMode(); return; }
  if (writtenSessionActive && action === 'window:toggleMouseThrough') return;
  const win2 = getWin();
  switch (action) {
    case "window:toggle":
      toggleWindow();
      return;
    case "window:hide":
      hideWindow();
      return;
    case "window:show":
      showMainWindowInteractive();
      return;
    case "app:quit":
      quitApp();
      return;
    case "window:moveUp":
      moveWindow(0, -MOVE_STEP);
      return;
    case "window:moveDown":
      moveWindow(0, MOVE_STEP);
      return;
    case "window:moveLeft":
      moveWindow(-MOVE_STEP, 0);
      return;
    case "window:moveRight":
      moveWindow(MOVE_STEP, 0);
      return;
    case "window:zoomIn": {
      const z = win2?.webContents.getZoomFactor() ?? 1;
      setZoom(z + ZOOM_STEP);
      forward(action);
      return;
    }
    case "window:zoomOut": {
      const z = win2?.webContents.getZoomFactor() ?? 1;
      setZoom(z - ZOOM_STEP);
      forward(action);
      return;
    }
    case "window:zoomReset":
      setZoom(1);
      forward(action);
      return;
    case "window:opacityUp": {
      adjustOpacity(OPACITY_STEP);
      forward(action);
      return;
    }
    case "window:opacityDown": {
      adjustOpacity(-OPACITY_STEP);
      forward(action);
      return;
    }
    default:
      forward(action);
  }
}
function syncQuadrupleClickScreenshotListener() {
  const {
    doubleClickScreenshotEnabled,
    longPressScreenshotEnabled
  } = getSettings();
  quadrupleClickScreenshotListener.setEnabledGestures({
    doubleClick: doubleClickScreenshotEnabled,
    // Retire the old gesture even if an old settings snapshot still enables it.
    quadrupleClick: false,
    longPress: longPressScreenshotEnabled
  });
  if (process.platform !== "win32" && process.platform !== "darwin" || !doubleClickScreenshotEnabled && !longPressScreenshotEnabled || capturing || activeWorkMode === "idle") {
    quadrupleClickScreenshotListener.stop();
    return;
  }
  quadrupleClickScreenshotListener.start();
}
function probeAccelerators(action, accelerators, retainedAccelerators) {
  for (const accelerator of accelerators) {
    let ok = false;
    try {
      ok = electron.globalShortcut.register(accelerator, () => {
      });
    } catch (error) {
      console.warn("[zhiyue:hotkey] failed to probe task-scoped shortcut", {
        action,
        accelerator,
        error
      });
      continue;
    }
    if (!ok) continue;
    retainedAccelerators.push(accelerator);
    return true;
  }
  return false;
}
function syncTaskScopedBareHotkeys() {
  unregisterTaskScopedBareHotkeys();
  if (capturing || activeWorkMode === "idle") return;
  const { hotkeys } = getSettings();
  for (const [action, accel] of Object.entries(hotkeys)) {
    if (!accel || !isUnmodifiedCombo(accel) || !isHotkeyAllowedForWorkMode(activeWorkMode, action) || MOBILE_VIEWPORT_HOTKEY_ACTIONS.has(action) || INTERVIEW_CONTEXT_HOTKEY_ACTIONS.has(action) || ANSWER_SCROLL_HOTKEY_ACTIONS.has(action)) continue;
    for (const accelerator of getAcceleratorsForAction(action, accel)) {
      let ok = false;
      try {
        ok = electron.globalShortcut.register(accelerator, () => onTrigger(action));
      } catch (error) {
        console.warn("[zhiyue:hotkey] failed to register task-scoped bare shortcut", {
          action,
          accelerator,
          error
        });
        continue;
      }
      if (ok) {
        taskScopedBareAccelerators.push(accelerator);
        taskScopedBareRegisteredActions.add(action);
        registeredActions.add(action);
      } else {
        console.warn("[zhiyue:hotkey] failed to register task-scoped bare shortcut", {
          action,
          accelerator
        });
      }
    }
  }
}
function unregisterTaskScopedBareHotkeys() {
  for (const accelerator of taskScopedBareAccelerators) {
    electron.globalShortcut.unregister(accelerator);
  }
  taskScopedBareAccelerators.length = 0;
  for (const action of taskScopedBareRegisteredActions) registeredActions.delete(action);
  taskScopedBareRegisteredActions.clear();
}
function syncMobileViewportHotkeys() {
  unregisterMobileViewportHotkeys();
  if (capturing || !mobileViewportActive || activeWorkMode === "idle") return;
  const { hotkeys } = getSettings();
  for (const action of MOBILE_VIEWPORT_HOTKEY_ACTIONS) {
    const accel = hotkeys[action]?.trim();
    if (!accel) continue;
    for (const accelerator of getAcceleratorsForAction(action, accel)) {
      let ok = false;
      try {
        ok = electron.globalShortcut.register(accelerator, () => onTrigger(action));
      } catch (error) {
        console.warn("[zhiyue:hotkey] failed to register mobile viewport shortcut", {
          action,
          accelerator,
          error
        });
        continue;
      }
      if (ok) {
        mobileViewportAccelerators.push(accelerator);
        mobileViewportRegisteredActions.add(action);
        registeredActions.add(action);
      } else {
        console.warn("[zhiyue:hotkey] failed to register mobile viewport shortcut", {
          action,
          accelerator
        });
      }
    }
  }
}
function unregisterMobileViewportHotkeys() {
  for (const accelerator of mobileViewportAccelerators) {
    electron.globalShortcut.unregister(accelerator);
  }
  mobileViewportAccelerators.length = 0;
  for (const action of mobileViewportRegisteredActions) registeredActions.delete(action);
  mobileViewportRegisteredActions.clear();
}
function syncInterviewContextHotkeys() {
  unregisterInterviewContextHotkeys();
  if (capturing || activeWorkMode !== "interview") return;
  const { hotkeys } = getSettings();
  for (const action of INTERVIEW_CONTEXT_HOTKEY_ACTIONS) {
    const accel = hotkeys[action]?.trim();
    if (!accel) continue;
    for (const accelerator of getAcceleratorsForAction(action, accel)) {
      let ok = false;
      try {
        ok = electron.globalShortcut.register(accelerator, () => onTrigger(action));
      } catch (error) {
        console.warn("[zhiyue:hotkey] failed to register interview context shortcut", {
          action,
          accelerator,
          error
        });
        continue;
      }
      if (ok) {
        interviewContextAccelerators.push(accelerator);
        interviewContextRegisteredActions.add(action);
        registeredActions.add(action);
      } else {
        console.warn("[zhiyue:hotkey] failed to register interview context shortcut", {
          action,
          accelerator
        });
      }
    }
  }
}
function unregisterInterviewContextHotkeys() {
  for (const accelerator of interviewContextAccelerators) {
    electron.globalShortcut.unregister(accelerator);
  }
  interviewContextAccelerators.length = 0;
  for (const action of interviewContextRegisteredActions) registeredActions.delete(action);
  interviewContextRegisteredActions.clear();
}
function syncAnswerScrollHotkeys() {
  unregisterAnswerScrollHotkeys();
  if (capturing || !answerScrollActive) return;
  const { hotkeys } = getSettings();
  for (const action of ANSWER_SCROLL_HOTKEY_ACTIONS) {
    const accel = hotkeys[action]?.trim();
    if (!accel) continue;
    for (const accelerator of getAcceleratorsForAction(action, accel)) {
      let ok = false;
      try {
        ok = electron.globalShortcut.register(accelerator, () => onTrigger(action));
      } catch (error) {
        console.warn("[zhiyue:hotkey] failed to register answer scroll shortcut", {
          action,
          accelerator,
          error
        });
        continue;
      }
      if (ok) {
        answerScrollAccelerators.push(accelerator);
        answerScrollRegisteredActions.add(action);
        registeredActions.add(action);
      } else {
        console.warn("[zhiyue:hotkey] failed to register answer scroll shortcut", {
          action,
          accelerator
        });
      }
    }
  }
}
function unregisterAnswerScrollHotkeys() {
  for (const accelerator of answerScrollAccelerators) {
    electron.globalShortcut.unregister(accelerator);
  }
  answerScrollAccelerators.length = 0;
  for (const action of answerScrollRegisteredActions) registeredActions.delete(action);
  answerScrollRegisteredActions.clear();
}
function forward(action) {
  const win2 = getWin();
  if (!win2 || win2.isDestroyed() || win2.webContents.isDestroyed()) return;
  win2.webContents.send(IPC.hotkeyTriggered, action);
  if (currentHandler) currentHandler(action);
}
function shouldEnableTaskSurfaceQa(isPackaged, qaFlag) {
  return !isPackaged && qaFlag === "1";
}
function snapshotTaskSurfaceQaWindow(candidate) {
  if (!candidate || candidate.isDestroyed()) {
    return { exists: false, isVisible: false, isMinimized: false, bounds: null };
  }
  return {
    exists: true,
    isVisible: candidate.isVisible(),
    isMinimized: candidate.isMinimized(),
    bounds: candidate.getBounds()
  };
}
let remoteControlLocked = false;
let remoteControlSuspended = false;
let powerMonitorBridgeRegistered = false;
let ipcRegistered = false;
let taskSurfaceRequestGeneration = 0;
const activePersonalModelRuns = /* @__PURE__ */ new Map();
const MAX_ACTIVE_PERSONAL_MODEL_RUNS = 2;
const PERSONAL_MODEL_CONNECTION_TEST_IMAGE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAWUlEQVR42u3aMREAMAgEQcxEGfKp00cENEz25wxs/3GyVhcAAIOAu2QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2A5y7Ah4AHEw6dWSd1DRIAAAAASUVORK5CYII=";
let personalModelConnectionTestActive = false;
let knowledgeLibraryStore = null;
function getKnowledgeLibraryStore() {
  knowledgeLibraryStore ??= new KnowledgeLibraryFileStore(
    path.join(electron.app.getPath("userData"), "knowledge-libraries-v3")
  );
  return knowledgeLibraryStore;
}
function authenticatedKnowledgeLibraryAccount(rawAccountKey) {
  const snapshot = getSnapshot();
  const authenticatedEmail = snapshot.status === "loggedIn" || snapshot.status === "expired" ? snapshot.email : void 0;
  return validatedKnowledgeLibraryAccount(rawAccountKey, authenticatedEmail);
}
function shouldStubTaskSurfaceQaScreenshotProbe() {
  return !electron.app.isPackaged && process.env.CLIMB_TASK_SURFACE_QA === "1";
}
const mainIpc = createIpcGateway(
  electron.ipcMain,
  assertMainRenderer,
  (senderId) => {
    const overlay = getShortcutOverlayWindow();
    return !!overlay && !overlay.isDestroyed() && overlay.webContents.id === senderId;
  },
  IPC.windowShortcutOverlayLayout,
  [IPC.settingsGet]
);
function registerIpc() {
  if (ipcRegistered) return;
  ipcRegistered = true;
  registerWorkspaceIpc(mainIpc);
  mainIpc.handle('interview:connection', () => speechConnection());
  mainIpc.handle('interview:saveConnection', (_event, raw) => saveSpeechConnection(raw));
  mainIpc.handle('interview:removeConnection', () => removeSpeechConnection());
  mainIpc.handle('interview:start', () => { if (writtenSessionActive) throw new Error('请先退出笔试模式。'); return startInterview(); });
  mainIpc.handle('interview:stop', (_event, sessionId) => stopInterview(typeof sessionId === 'string' ? sessionId : undefined));
  mainIpc.handle('interview:transcribe', (_event, raw) => transcribeInterview(raw));
  mainIpc.handle(IPC.appOpenSupport, () => electron.shell.openExternal(BRAND.supportUrl));
  mainIpc.handle(IPC.appOpenFeedback, () => electron.shell.openExternal(`mailto:${BRAND.feedbackEmail}?subject=${encodeURIComponent(`知跃 ${BRAND.version} Bug 反馈`)}`));
  mainIpc.handle(IPC.writtenEnter, () => enterWrittenMode());
  mainIpc.handle(IPC.writtenExit, () => exitWrittenMode());
  mainIpc.handle(IPC.writtenStatus, () => writtenStatus());
  mainIpc.handle('chatgpt:status', () => chatgptAuth.status());
  mainIpc.handle('chatgpt:signin', (_event, options) => chatgptAuth.signIn({ newAccount: options?.newAccount === true, clientId: typeof options?.clientId === 'string' ? options.clientId : undefined }));
  mainIpc.handle('chatgpt:cancel', () => chatgptAuth.cancel());
  mainIpc.handle('chatgpt:logout', async () => {
    for (const run of activePersonalModelRuns.values()) {
      if (getConfiguredPersonalModelProfile(true, personalModelUrlValidationOptions(), run.slot)?.providerId === 'chatgpt') run.controller.abort();
    }
    return chatgptAuth.logout();
  });
  mainIpc.handle('chatgpt:usage', () => electron.shell.openExternal('https://chatgpt.com/#settings/Usage'));
  mainIpc.handle('personal-models:discover', async (_event, raw) => {
    const input = normalizePersonalModelConnectionInput({ ...raw, model: raw?.model || 'discovery' });
    const profile = createDefaultPersonalModelProfile(input.model, input.baseUrl, true, personalModelUrlValidationOptions(), personalModelGenerationOptions(input), input.slot);
    const apiKey = profile.providerId === 'chatgpt' ? await chatgptAuth.accessToken() : input.apiKey ?? loadPersonalModelCredentialSecret(profile.baseUrl, personalModelUrlValidationOptions(), input.slot);
    if (!apiKey) throw new Error('请填写此接口的 API Key 后获取模型列表');
    return discoverModels(profile, apiKey);
  });
  registerRemoteControlPowerMonitorBridge();
  registerLocalRecordsIpc(mainIpc, {
    store: new LocalRecordsStore(path.join(electron.app.getPath("userData"), "records-v1", "store")),
    getAuthSnapshot: getSnapshot,
    assertMainRenderer,
    openPath: (path2) => electron.shell.openPath(path2)
  });
  if (shouldEnableTaskSurfaceQa(electron.app.isPackaged, process.env.CLIMB_TASK_SURFACE_QA)) {
    mainIpc.handle(IPC.qaSeedTaskSurfaceConversation, (event) => {
      event.sender.send(IPC.qaTaskSurfaceSeedRequested);
      return { accepted: true };
    });
    mainIpc.handle(IPC.qaInspectTaskSurfaceWindows, () => ({
      main: snapshotTaskSurfaceQaWindow(getWin()),
      shortcut: snapshotTaskSurfaceQaWindow(getShortcutOverlayWindow())
    }));
  }
  mainIpc.handle(IPC.settingsGet, () => getSettings());
  mainIpc.handle(IPC.settingsSet, (_e, s) => {
    setSettings(s);
    const next = getSettings();
    if (writtenSessionActive) setTaskShortcutOverlayMode('exam', next.writtenOptions.showShortcutHints);
    syncAppTrayVisibility(next);
    broadcast(IPC.settingsChanged, next);
    registerHotkeys(() => {
    });
    return next;
  });
  mainIpc.handle(IPC.settingsPatch, (_e, patch) => {
    const merged = patchSettings(patch);
    if (writtenSessionActive && patch.writtenOptions) setTaskShortcutOverlayMode('exam', merged.writtenOptions.showShortcutHints);
    if (patch.hideTrayIcon !== void 0) syncAppTrayVisibility(merged);
    broadcast(IPC.settingsChanged, merged);
    if (patch.hotkeys || patch.doubleClickScreenshotEnabled !== void 0 || patch.quadrupleClickScreenshotEnabled !== void 0 || patch.longPressScreenshotEnabled !== void 0) registerHotkeys(() => {
    });
    return merged;
  });
  mainIpc.handle(IPC.personalModelsLoad, (event) => {
    assertMainRenderer(event.sender.id);
    return personalModelSettingsSnapshot();
  });
  mainIpc.handle(IPC.knowledgeLibraryList, async (event, accountKey) => {
    assertMainRenderer(event.sender.id);
    return getKnowledgeLibraryStore().list(authenticatedKnowledgeLibraryAccount(accountKey));
  });
  mainIpc.handle(
    IPC.knowledgeLibrarySave,
    async (event, accountKey, index) => {
      assertMainRenderer(event.sender.id);
      return getKnowledgeLibraryStore().save(
        authenticatedKnowledgeLibraryAccount(accountKey),
        index
      );
    }
  );
  mainIpc.handle(
    IPC.knowledgeLibraryDelete,
    async (event, accountKey, id) => {
      assertMainRenderer(event.sender.id);
      return getKnowledgeLibraryStore().delete(
        authenticatedKnowledgeLibraryAccount(accountKey),
        id
      );
    }
  );
  mainIpc.handle(IPC.personalModelsSave, (event, raw) => {
    assertMainRenderer(event.sender.id);
    try {
      const input = normalizePersonalModelConnectionInput(raw);
      persistPersonalModelConnection(input);
      return personalModelSettingsSnapshot();
    } catch (error) {
      throw new Error(personalModelSettingsErrorMessage(error));
    }
  });
  mainIpc.handle(
    IPC.personalModelsTest,
    async (event, raw) => {
      assertMainRenderer(event.sender.id);
      if (personalModelConnectionTestActive) {
        return { ok: false, message: "已有连接测试正在进行，请稍后重试" };
      }
      personalModelConnectionTestActive = true;
      try {
        const input = normalizePersonalModelConnectionInput(raw);
        const apiKey = input.providerId === "chatgpt" ? "chatgpt-authorization" : input.apiKey ?? loadPersonalModelCredentialSecret(
          input.baseUrl,
          personalModelUrlValidationOptions(),
          input.slot
        );
        if (!apiKey) {
          return { ok: false, message: "Base URL 变化后必须重新输入 API Key" };
        }
        const profile = createDefaultPersonalModelProfile(
          input.model,
          input.baseUrl,
          true,
          personalModelUrlValidationOptions(),
          personalModelGenerationOptions(input),
          input.slot
        );
        const startedAt = Date.now();
        const adapter = createLocalModelAdapter({
          profile,
          apiKey,
          urlValidation: personalModelUrlValidationOptions()
        });
        if (input.slot === "screenshot") {
          await adapter.stream({
            messages: [{
              role: "user",
              content: [
                { type: "text", text: "只回复 OK。" },
                { type: "image_url", imageUrl: PERSONAL_MODEL_CONNECTION_TEST_IMAGE }
              ]
            }]
          }, () => void 0, {
            timeoutMs: 3e4,
            streamTimeouts: {
              firstResponseMs: 3e4,
              firstVisibleContentMs: 3e4,
              inactivityMs: 15e3,
              absoluteMs: 45e3
            }
          });
        } else {
          await adapter.testConnection({ timeoutMs: 2e4 });
        }
        persistPersonalModelConnection(input);
        return { ok: true, latencyMs: Date.now() - startedAt, saved: true };
      } catch (error) {
        return { ok: false, message: personalModelSettingsErrorMessage(error) };
      } finally {
        personalModelConnectionTestActive = false;
      }
    }
  );
  mainIpc.handle(IPC.personalModelsRemove, (event, rawSlot) => {
    assertMainRenderer(event.sender.id);
    const slot = normalizePersonalModelConnectionSlot(rawSlot);
    for (const active of activePersonalModelRuns.values()) {
      if (active.slot === slot) active.controller.abort("personal-model-connection-removed");
    }
    removePersonalModelCredential(slot);
    removePersonalModelProfile(slot);
    const settings2 = getSettings();
    const selectionPatch = slot === "screenshot" ? settings2.examVisionModelProfile === "personal-custom-api" ? { examVisionModelProfile: "gemini" } : {} : settings2.interviewVoiceModelProfile === "personal-custom-api" ? { interviewVoiceModelProfile: "managed" } : {};
    if (Object.keys(selectionPatch).length > 0) {
      const next = patchSettings(selectionPatch);
      broadcast(IPC.settingsChanged, next);
    }
    return personalModelSettingsSnapshot();
  });
  mainIpc.handle(
    IPC.personalModelRun,
    async (event, raw) => {
      const webContentsId = event.sender.id;
      try {
        assertMainRenderer(webContentsId);
        const input = normalizeLocalModelRunInput(raw);
        if (activePersonalModelRuns.has(input.requestId)) {
          return {
            ok: false,
            error: { code: "PERSONAL_MODEL_BUSY", message: "该请求正在处理中" }
          };
        }
        if (activePersonalModelRuns.size >= MAX_ACTIVE_PERSONAL_MODEL_RUNS) {
          return {
            ok: false,
            error: { code: "PERSONAL_MODEL_BUSY", message: "自有模型请求较多，请稍后重试" }
          };
        }
        const controller = new AbortController();
        const slot = personalModelConnectionSlotForRequest(input);
        activePersonalModelRuns.set(input.requestId, { controller, webContentsId, slot });
        const abortOnDestroyed = () => controller.abort("renderer-destroyed");
        event.sender.once("destroyed", abortOnDestroyed);
        try {
          const profile = getConfiguredPersonalModelProfile(
            true,
            personalModelUrlValidationOptions(),
            slot
          );
          if (!profile) {
            return {
              ok: false,
              error: {
                code: "PERSONAL_MODEL_PROFILE_MISSING",
                message: "自有模型配置缺失或损坏，请重新保存连接"
              }
            };
          }
          const apiKey = profile.providerId === "chatgpt" ? "chatgpt-authorization" : loadPersonalModelCredentialSecret(
            profile.baseUrl,
            personalModelUrlValidationOptions(),
            slot
          );
          if (!apiKey) {
            return {
              ok: false,
              error: {
                code: "PERSONAL_MODEL_CREDENTIAL_MISSING",
                message: "API Key 未配置或与当前 Base URL 不匹配，请重新保存连接"
              }
            };
          }
          const adapter = createLocalModelAdapter({
            profile,
            apiKey,
            urlValidation: personalModelUrlValidationOptions()
          });
          const result = await adapter.stream(
            input.request,
            (streamEvent) => {
              if (event.sender.isDestroyed() || controller.signal.aborted) return;
              const payload = {
                requestId: input.requestId,
                event: streamEvent
              };
              event.sender.send(IPC.personalModelStreamEvent, payload);
            },
            { signal: controller.signal }
          );
          return { ok: true, result };
        } finally {
          event.sender.removeListener("destroyed", abortOnDestroyed);
          const active = activePersonalModelRuns.get(input.requestId);
          if (active?.controller === controller) activePersonalModelRuns.delete(input.requestId);
        }
      } catch (error) {
        return { ok: false, error: personalModelError(error) };
      }
    }
  );
  mainIpc.handle(IPC.personalModelCancel, (event, rawRequestId) => {
    assertMainRenderer(event.sender.id);
    if (typeof rawRequestId !== "string") return;
    const active = activePersonalModelRuns.get(rawRequestId);
    if (active?.webContentsId === event.sender.id) active.controller.abort("renderer-cancelled");
  });
  mainIpc.handle(IPC.screenshotCapture, async (_event, rawOptions) => {
    const options = normalizeScreenshotCaptureOptions(rawOptions);
    try {
      const scroll = options.origin === "local" && options.scroll === true;
      if (scroll) assertMainRenderer(_event.sender.id);
      const urls = scroll ? await captureScrollingScreenshots(options, assertRemoteCapturePowerAllowed) : [await captureScreenshot(options, options.origin === "remote" ? assertRemoteCapturePowerAllowed : void 0)];
      const url = urls[0] ?? null;
      const count = countScreenshots();
      if (options.enqueue !== false) broadcast(IPC.screenshotChanged, { count });
      return { url, count, recovery: getScreenshotRecoveryState(), ...scroll ? { urls } : {} };
    } catch (error) {
      const normalized = normalizeScreenshotCaptureError(error);
      console.error("[zhiyue:screenshot] capture failed", {
        code: normalized.code,
        message: error instanceof Error ? error.message : String(error)
      });
      return {
        url: null,
        count: countScreenshots(),
        error: normalized,
        recovery: getScreenshotRecoveryState()
      };
    }
  });
  mainIpc.handle(IPC.screenshotProbe, async (_event, rawDisplayId) => {
    if (shouldStubTaskSurfaceQaScreenshotProbe()) {
      console.log("[zhiyue:qa] deterministic screenshot preflight accepted");
      return { ok: true, recovery: getScreenshotRecoveryState() };
    }
    const displayId = typeof rawDisplayId === "string" && rawDisplayId.trim() ? rawDisplayId.trim() : void 0;
    try {
      await probeScreenshotSource(displayId);
      return { ok: true, recovery: getScreenshotRecoveryState() };
    } catch (error) {
      return {
        ok: false,
        error: normalizeScreenshotCaptureError(error),
        recovery: getScreenshotRecoveryState()
      };
    }
  });
  mainIpc.handle(IPC.screenshotHealth, () => getScreenshotRecoveryState());
  mainIpc.handle(IPC.screenshotReset, () => resetScreenshotCaptureSubsystem());
  mainIpc.handle(IPC.screenshotDisplays, () => listCaptureDisplays());
  mainIpc.handle(IPC.screenshotList, () => listScreenshots());
  mainIpc.handle(IPC.screenshotPopLast, () => {
    const url = popLastScreenshot();
    broadcast(IPC.screenshotChanged, { count: countScreenshots() });
    return url;
  });
  mainIpc.handle(IPC.screenshotClear, () => {
    clearScreenshots();
    broadcast(IPC.screenshotChanged, { count: 0 });
  });
  mainIpc.handle(IPC.windowToggle, () => toggleWindow());
  mainIpc.handle(IPC.windowMinimize, () => minimizeWindow());
  mainIpc.handle(IPC.windowToggleMaximize, () => toggleMaximizeWindow());
  mainIpc.handle(IPC.windowClose, () => closeWindow());
  mainIpc.handle(IPC.windowHide, () => hideWindow());
  mainIpc.handle(IPC.windowShow, () => showWindow());
  mainIpc.handle(
    IPC.windowSetBounds,
    (_e, payload) => setExpanded(payload.expanded)
  );
  mainIpc.handle(IPC.windowSetSurface, (_e, rawSurface) => {
    if (writtenSessionActive) return;
    if (!isWindowSurface(rawSurface)) return;
    setWindowSurface(rawSurface);
  });
  mainIpc.handle(IPC.windowSetTaskSurface, (event, raw) => {
    if (writtenSessionActive) throw new Error('请先使用退出笔试快捷键结束笔试模式');
    const host = getWin();
    if (!host || host.isDestroyed() || event.sender.id !== host.webContents.id) return;
    if (!raw || typeof raw !== "object") return;
    const value = raw;
    if (!isWorkMode(value.mode) || !isWindowSurface(value.surface)) return;
    const expectedSurface = value.mode === "idle" ? "preparation" : "focus";
    if (value.surface !== expectedSurface) return;
    const shortcutOverlayEnabled = value.mode !== "idle" && value.shortcutOverlayEnabled === true;
    const requestGeneration = ++taskSurfaceRequestGeneration;
    setTaskShortcutOverlayMode(value.mode, false);
    setHotkeyWorkMode(value.mode);
    const revealToken = prepareTaskWindowSurface(value.surface);
    if (shortcutOverlayEnabled) {
      setImmediate(() => {
        if (requestGeneration !== taskSurfaceRequestGeneration || getWin() !== host || host.isDestroyed()) return;
        setTaskShortcutOverlayMode(value.mode, true);
      });
    }
    return revealToken;
  });
  mainIpc.handle(IPC.windowCommitTaskSurface, (_event, token) => commitTaskWindowSurface(token));
  mainIpc.handle(IPC.windowBeginTaskLaunch, () => beginTaskLaunchTransition());
  mainIpc.handle(IPC.windowCancelTaskLaunch, (_event, token) => cancelTaskLaunchTransition(token));
  mainIpc.handle(IPC.windowCommitReveal, (_event, token) => commitMainWindowInteractiveReveal(token));
  mainIpc.handle(IPC.windowFocusResizeStart, (event, pointer) => {
    const host = getWin();
    if (!host || host.isDestroyed() || event.sender.id !== host.webContents.id) return false;
    return beginFocusWindowResize(pointer);
  });
  mainIpc.handle(IPC.windowFocusResizeUpdate, (event, pointer) => {
    const host = getWin();
    if (!host || host.isDestroyed() || event.sender.id !== host.webContents.id) return false;
    return updateFocusWindowResize(pointer);
  });
  mainIpc.handle(IPC.windowFocusResizeEnd, (event) => {
    const host = getWin();
    if (!host || host.isDestroyed() || event.sender.id !== host.webContents.id) return;
    endFocusWindowResize();
  });
  mainIpc.handle(
    IPC.windowMove,
    (_e, p) => moveWindow(p.dx, p.dy)
  );
  mainIpc.handle(IPC.windowZoom, (_e, zoom) => setZoom(zoom));
  mainIpc.handle(IPC.windowOpacity, (_e, opacity) => setOpacity(opacity));
  mainIpc.handle(IPC.windowPreviewOpacity, (_e, opacity) => previewOpacity(opacity));
  mainIpc.on(IPC.windowShortcutOverlayLayout, (event, value) => {
    reportShortcutOverlayLayout(event.sender.id, value);
  });
  mainIpc.handle(IPC.windowSetInteractive, (_e, v) => setInteractive(v));
  mainIpc.handle(IPC.windowSetFocusable, (_e, v) => setFocusable(v));
  mainIpc.handle(IPC.windowSetWorkMode, (event, rawMode) => {
    const host = getWin();
    if (!host || host.isDestroyed() || event.sender.id !== host.webContents.id) return;
    const mode = isWorkMode(rawMode) ? rawMode : "idle";
    if (writtenSessionActive && mode !== 'exam') return;
    taskSurfaceRequestGeneration += 1;
    setHotkeyWorkMode(mode);
    setTaskShortcutOverlayMode(mode);
  });
  mainIpc.handle(IPC.hotkeySetCapturing, (_e, v) => setCapturing(Boolean(v)));
  mainIpc.handle(IPC.hotkeySetMobileViewportActive, (event, rawActive) => {
    const host = getWin();
    if (!host || host.isDestroyed() || event.sender.id !== host.webContents.id) return;
    setMobileViewportHotkeysActive(rawActive === true);
  });
  mainIpc.handle(IPC.hotkeySetAnswerScrollActive, (event, rawActive) => {
    const host = getWin();
    if (!host || host.isDestroyed() || event.sender.id !== host.webContents.id) return;
    setAnswerScrollHotkeysActive(rawActive === true);
  });
  mainIpc.handle(IPC.hotkeyStatus, (_event, rawProspectiveMode) => getHotkeyRegistrationStatus(
    isWorkMode(rawProspectiveMode) && rawProspectiveMode !== "idle" ? rawProspectiveMode : void 0
  ));
  mainIpc.handle(IPC.appQuit, () => quitApp());
  mainIpc.handle(
    IPC.appDownloadUpdate,
    () => ({ status: "unavailable", message: "本地版不使用旧云端更新。" })
  );
  mainIpc.handle(IPC.authGetSnapshot, () => getSnapshot());
  mainIpc.handle(IPC.authGetTokens, () => getTokens());
  mainIpc.handle(
    IPC.authSaveTokens,
    (_e, p) => {
      saveTokens(p ?? {});
      notifyLocalRecordsAuthChanged();
      const snap = getSnapshot();
      broadcast(IPC.authChanged, snap);
      return snap;
    }
  );
  mainIpc.handle(IPC.authClearTokens, () => {
    clearTokens();
    notifyLocalRecordsAuthChanged();
    broadcast(IPC.authChanged, getSnapshot());
  });
  mainIpc.handle(IPC.remoteControlCredentialsGet, () => getRemoteControlCredentials());
  mainIpc.handle(IPC.remoteControlDeviceIdGet, () => getOrCreateRemoteControlDeviceId());
  mainIpc.handle(IPC.remoteControlCredentialsSave, (_event, raw) => {
    if (!raw || typeof raw !== "object") throw new Error("invalid remote-control credentials");
    const value = raw;
    if (typeof value.pairingId !== "string" || typeof value.desktopGrant !== "string") {
      throw new Error("invalid remote-control credentials");
    }
    saveRemoteControlCredentials({ pairingId: value.pairingId, desktopGrant: value.desktopGrant });
  });
  mainIpc.handle(IPC.remoteControlCredentialsClear, () => clearRemoteControlCredentials());
  mainIpc.handle(IPC.remoteControlPowerStateGet, () => remoteControlPowerState());
  mainIpc.handle(IPC.authOpenPortal, async (_e, url) => {
    if (!url) return;
    throw new Error("本地版没有云端账户门户。");
  });
  mainIpc.on(IPC.logInfo, (_e, ...args) => console.log("[zhiyue:ui]", ...args));
  mainIpc.on(IPC.logError, (_e, ...args) => console.error("[zhiyue:ui]", ...args));
  const settings = getSettings();
  if (settings.disableClipboard) {
    electron.clipboard.writeText.bind(electron.clipboard);
    electron.clipboard.writeText = (..._args) => {
    };
  }
}
function broadcast(channel, payload) {
  for (const win2 of electron.BrowserWindow.getAllWindows()) {
    if (!win2.isDestroyed()) win2.webContents.send(channel, payload);
  }
}
function registerRemoteControlPowerMonitorBridge() {
  if (powerMonitorBridgeRegistered) return;
  powerMonitorBridgeRegistered = true;
  electron.powerMonitor.on("lock-screen", () => {
    remoteControlLocked = true;
    broadcast(IPC.remoteControlPowerStateChanged, remoteControlPowerState());
  });
  electron.powerMonitor.on("unlock-screen", () => {
    remoteControlLocked = false;
    broadcast(IPC.remoteControlPowerStateChanged, remoteControlPowerState());
  });
  electron.powerMonitor.on("suspend", () => {
    remoteControlSuspended = true;
    broadcast(IPC.remoteControlPowerStateChanged, remoteControlPowerState());
  });
  electron.powerMonitor.on("resume", () => {
    remoteControlSuspended = false;
    broadcast(IPC.remoteControlPowerStateChanged, remoteControlPowerState());
  });
}
function remoteControlPowerState() {
  if (remoteControlLocked) return { blocked: true, reason: "locked" };
  if (remoteControlSuspended) return { blocked: true, reason: "suspended" };
  return { blocked: false, reason: "active" };
}
function assertRemoteCapturePowerAllowed() {
  if (remoteControlPowerState().blocked) throw new Error(CAPTURE_SYSTEM_BLOCKED);
}
function normalizeScreenshotCaptureOptions(raw) {
  if (!raw || typeof raw !== "object") return {};
  const value = raw;
  return {
    ...typeof value.displayId === "string" && value.displayId.trim() ? { displayId: value.displayId.trim() } : {},
    ...typeof value.enqueue === "boolean" ? { enqueue: value.enqueue } : {},
    ...value.origin === "local" && value.scroll === true ? { scroll: true } : {},
    ...value.origin === "local" || value.origin === "remote" ? { origin: value.origin } : {}
  };
}
function normalizeScreenshotCaptureError(error) {
  const rawCode = error && typeof error === "object" && "code" in error ? error.code : void 0;
  const rawMessage = error instanceof Error ? error.message : String(error);
  const matches = (candidate) => rawCode === candidate || rawMessage.includes(candidate);
  let code = CAPTURE_FAILED;
  if (matches(CAPTURE_DISPLAY_UNAVAILABLE)) code = CAPTURE_DISPLAY_UNAVAILABLE;
  else if (matches(CAPTURE_SOURCE_UNAVAILABLE)) code = CAPTURE_SOURCE_UNAVAILABLE;
  else if (matches(CAPTURE_EMPTY_FRAME)) code = CAPTURE_EMPTY_FRAME;
  else if (matches(CAPTURE_TIMEOUT)) code = CAPTURE_TIMEOUT;
  else if (matches(CAPTURE_SYSTEM_BLOCKED)) code = CAPTURE_SYSTEM_BLOCKED;
  else if (matches(CAPTURE_LONG_UNAVAILABLE)) code = CAPTURE_LONG_UNAVAILABLE;
  else if (matches(CAPTURE_LONG_INTERRUPTED)) code = CAPTURE_LONG_INTERRUPTED;
  else if (matches(CAPTURE_LONG_MATCH_FAILED)) code = CAPTURE_LONG_MATCH_FAILED;
  else if (matches(CAPTURE_SCROLL_LIMIT)) code = CAPTURE_SCROLL_LIMIT;
  if (error instanceof LongScreenshotError) return { code, message: error.message };
  return { code, message: screenshotCaptureErrorLabel(code) };
}
function screenshotCaptureErrorLabel(code) {
  switch (code) {
    case CAPTURE_DISPLAY_UNAVAILABLE:
      return "预选显示器已断开，请重新选择显示器";
    case CAPTURE_SOURCE_UNAVAILABLE:
      return "系统未提供可与预选显示器安全匹配的截屏源";
    case CAPTURE_EMPTY_FRAME:
      return "系统返回了空白截屏，请确认屏幕未锁定后重试";
    case CAPTURE_SYSTEM_BLOCKED:
      return "电脑已锁定或挂起，截屏已安全停止";
    case CAPTURE_TIMEOUT:
      return "屏幕捕获检查超时，请重试";
    default:
      return "系统截屏失败，请重试";
  }
}
function assertMainRenderer(senderId) {
  const host = getWin();
  if (!host || host.isDestroyed() || senderId !== host.webContents.id) {
    throw new Error("unauthorized renderer");
  }
}
function personalModelSettingsSnapshot() {
  const urlValidation = personalModelUrlValidationOptions();
  const configured = {};
  const credentialIssues = {};
  const credentials = ["screenshot", "interview"].flatMap((slot) => {
    const profile = getConfiguredPersonalModelProfile(false, urlValidation, slot);
    if (!profile) return [];
    if (profile.providerId === 'chatgpt') {
      configured[slot] = chatgptAuth.status().planEnabled;
      if (!configured[slot]) credentialIssues[slot] = '请登录 ChatGPT 并允许使用套餐';
      return [];
    }
    const summaries = listPersonalModelCredentialSummaries(
      profile.baseUrl,
      urlValidation,
      slot
    );
    if (!summaries.length) {
      configured[slot] = false;
      credentialIssues[slot] = "该连接尚未保存可用的 API Key，请重新输入并保存。";
      return [];
    }
    try {
      const secret = loadPersonalModelCredentialSecret(profile.baseUrl, urlValidation, slot);
      if (!secret) {
        configured[slot] = false;
        credentialIssues[slot] = "已保存的 API Key 与当前 Base URL 不匹配，请重新保存连接。";
        return [];
      }
    } catch (error) {
      configured[slot] = false;
      credentialIssues[slot] = personalModelCredentialErrorMessage(error);
      return [];
    }
    configured[slot] = true;
    return summaries;
  });
  return {
    credentials,
    profiles: listPersonalModelProfiles(configured, urlValidation),
    ...Object.keys(credentialIssues).length ? { credentialIssues } : {}
  };
}
function persistPersonalModelConnection(input) {
  const slot = input.slot ?? "screenshot";
  const urlValidation = personalModelUrlValidationOptions();
  createDefaultPersonalModelProfile(
    input.model,
    input.baseUrl,
    true,
    urlValidation,
    personalModelGenerationOptions(input),
    slot
  );
  if (input.providerId === 'chatgpt') {
    if (!chatgptAuth.status().planEnabled) throw new Error('请先完成 ChatGPT 授权并允许使用套餐');
    removePersonalModelCredential(slot);
    savePersonalModelProfile(input.model, input.baseUrl, urlValidation, personalModelGenerationOptions(input), slot);
    return;
  }
  if (input.apiKey) {
    savePersonalModelCredential(
      { apiKey: input.apiKey },
      { baseUrl: input.baseUrl, slot, urlValidation }
    );
  }
  const readableKey = loadPersonalModelCredentialSecret(input.baseUrl, urlValidation, slot);
  if (!readableKey) {
    throw new PersonalModelBridgeError(
      "PERSONAL_MODEL_CREDENTIAL_MISSING",
      "API Key 未保存，或与当前 Base URL 不匹配，请重新输入。"
    );
  }
  if (input.apiKey && readableKey !== input.apiKey) {
    throw new PersonalModelBridgeError(
      "PERSONAL_MODEL_CREDENTIAL_PERSISTENCE_FAILED",
      "API Key 保存后的安全回读校验失败，请重试。"
    );
  }
  savePersonalModelProfile(
    input.model,
    input.baseUrl,
    urlValidation,
    personalModelGenerationOptions(input),
    slot
  );
}
function normalizePersonalModelConnectionInput(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("无效的模型连接设置");
  }
  const value = raw;
  if (Object.keys(value).some((key) => ![
    "slot",
    "model",
    "baseUrl",
    "apiKey",
    "providerId",
    "apiMode",
    "webSearchEnabled",
    "temperature",
    "thinkingLevel",
    "topP",
    "stop"
  ].includes(key))) {
    throw new Error("无效的模型连接设置");
  }
  if (typeof value.model !== "string" || typeof value.baseUrl !== "string") {
    throw new Error("无效的模型连接设置");
  }
  const slot = normalizePersonalModelConnectionSlot(value.slot);
  const model = value.model.trim();
  const profile = createDefaultPersonalModelProfile(
    model,
    value.baseUrl,
    true,
    personalModelUrlValidationOptions(),
    {
      ...(value.providerId !== undefined ? { providerId: value.providerId } : {}),
      ...(value.apiMode !== undefined ? { apiMode: value.apiMode } : {}),
      ...value.webSearchEnabled !== void 0 ? { webSearchEnabled: value.webSearchEnabled } : {},
      ...value.temperature !== void 0 ? { temperature: value.temperature } : {},
      ...value.thinkingLevel !== void 0 ? { thinkingLevel: value.thinkingLevel } : {},
      ...value.topP !== void 0 ? { topP: value.topP } : {},
      ...value.stop !== void 0 ? { stop: value.stop } : {}
    },
    slot
  );
  let apiKey = typeof value.apiKey === "string" ? value.apiKey.trim() : void 0;
  if (value.apiKey !== void 0 && !apiKey) throw new Error("API Key 不能为空");
  if (!apiKey && isLoopbackHostname(new URL(profile.baseUrl).hostname)) {
    apiKey = loadPersonalModelCredentialSecret(profile.baseUrl, personalModelUrlValidationOptions(), slot) || "local-no-key";
  }
  return {
    slot: profile.slot,
    model: profile.model,
    baseUrl: profile.baseUrl,
    ...apiKey ? { apiKey } : {},
    ...personalModelGenerationOptions(profile)
  };
}
function personalModelGenerationOptions(value) {
  return {
    ...(value.providerId !== undefined ? { providerId: value.providerId } : {}),
    ...(value.apiMode !== undefined ? { apiMode: value.apiMode } : {}),
    ...value.webSearchEnabled !== void 0 ? { webSearchEnabled: value.webSearchEnabled } : {},
    ...value.temperature !== void 0 ? { temperature: value.temperature } : {},
    ...value.thinkingLevel !== void 0 ? { thinkingLevel: value.thinkingLevel } : {},
    ...value.topP !== void 0 ? { topP: value.topP } : {},
    ...value.stop !== void 0 ? { stop: [...value.stop] } : {}
  };
}
function normalizePersonalModelConnectionSlot(value) {
  if (value === void 0) return "screenshot";
  if (!isPersonalModelConnectionSlot(value)) {
    throw new Error("无效的模型连接用途");
  }
  return value;
}
function personalModelConnectionSlotForRequest(input) {
  return input.slot ?? (countValidatedPersonalModelImages(input.request) > 0 ? "screenshot" : "interview");
}
function countValidatedPersonalModelImages(request) {
  let count = 0;
  for (const message of request.messages) {
    if (!Array.isArray(message.content)) continue;
    count += message.content.filter((part) => part.type === "image_url").length;
  }
  return count;
}
function personalModelUrlValidationOptions() {
  return { allowInsecureLocalhost: true };
}
class PersonalModelBridgeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "PersonalModelBridgeError";
  }
}
function personalModelError(error) {
  if (error instanceof ChatGptAuthError) return { code: error.code, message: error.message };
  if (error instanceof PersonalModelBridgeError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof PersonalModelCredentialStoreError) {
    return { code: error.code, message: personalModelCredentialErrorMessage(error) };
  }
  if (error instanceof PersonalModelValidationError) {
    return {
      code: error.code,
      message: personalModelValidationErrorMessage(error)
    };
  }
  if (error instanceof PersonalModelAdapterError) {
    if (error.code.startsWith('CHATGPT_')) return { code: error.code, message: error.message };
    if (error.code === "PERSONAL_MODEL_INVALID_REQUEST") {
      return {
        code: error.code,
        message: personalModelInvalidRequestMessage(error.status)
      };
    }
    const messages = {
      PERSONAL_MODEL_ABORTED: "请求已取消",
      PERSONAL_MODEL_TIMEOUT: "自有模型响应超时，请重试",
      PERSONAL_MODEL_CREDENTIAL_REJECTED: "API Key 无效或无权调用该模型",
      PERSONAL_MODEL_RATE_LIMITED: "自有模型当前限流，请稍后重试",
      PERSONAL_MODEL_EMPTY_RESPONSE: "自有模型未返回可用内容，请重试",
      PERSONAL_MODEL_RESPONSE_TOO_LARGE: "自有模型返回内容过大，已停止本次请求",
      PERSONAL_MODEL_STREAM_ERROR: "自有模型回答流中断，请重试",
      PERSONAL_MODEL_UPSTREAM_UNAVAILABLE: "无法连接自有模型服务，请检查网络后重试"
    };
    return { code: error.code, message: messages[error.code] ?? "自有模型调用失败" };
  }
  if (error && typeof error === "object" && "code" in error) {
    const code = String(error.code ?? "PERSONAL_MODEL_ERROR");
    if (code.startsWith("PERSONAL_MODEL_")) {
      return { code, message: "本机模型请求失败，请重试；如持续出现，请到准备中心的 API KEY 管理检查连接。" };
    }
  }
  return { code: "PERSONAL_MODEL_ERROR", message: "自有模型调用失败，请重试" };
}
function personalModelCredentialErrorMessage(error) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code ?? "") : "";
  switch (code) {
    case "PERSONAL_MODEL_ENCRYPTION_UNAVAILABLE":
      return "系统安全存储当前不可用，无法安全读取 API Key；请重启客户端后重试。";
    case "PERSONAL_MODEL_CREDENTIAL_ENCRYPTION_FAILED":
      return "API Key 加密保存失败，本次没有保存；请重启客户端后重新输入。";
    case "PERSONAL_MODEL_CREDENTIAL_DECRYPTION_FAILED":
      return "已保存的 API Key 无法解密，请到准备中心的 API KEY 管理重新保存。";
    default:
      return "本机无法安全读取 API Key，请到准备中心的 API KEY 管理重新保存。";
  }
}
function personalModelValidationErrorMessage(error) {
  if (/image/iu.test(error.message)) {
    return "截图数据过大、损坏或格式不受支持，请减少截图数量或降低屏幕分辨率后重试。";
  }
  if (/text/iu.test(error.message)) {
    return "本次模型上下文过长，请清空部分上下文后重试。";
  }
  return "本次截图或模型请求参数无效，请重新截图并检查模型高级参数。";
}
function personalModelSettingsErrorMessage(error) {
  if (error instanceof ChatGptAuthError) return error.message;
  if (error instanceof PersonalModelCredentialStoreError) {
    return personalModelCredentialErrorMessage(error);
  }
  if (error instanceof PersonalModelValidationError) {
    return personalModelValidationErrorMessage(error);
  }
  if (error instanceof PersonalModelBridgeError || error instanceof PersonalModelAdapterError) {
    return personalModelError(error).message;
  }
  if (error instanceof Error && /API Key|Base URL|模型连接|模型名称/u.test(error.message)) {
    return error.message.slice(0, 200);
  }
  return "模型连接操作失败，请检查网络、Base URL、API Key 和模型名称。";
}
function createRendererUnavailableHandler(controls) {
  return (_reason) => {
    stopInterview();
    controls.setMobileViewportActive(false);
    controls.setAnswerScrollActive(false);
    controls.setWorkMode("idle");
  };
}
electron.app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event) => event.preventDefault());
  contents.on("will-attach-webview", (event) => event.preventDefault());
});
const gotLock = electron.app.requestSingleInstanceLock();
if (!gotLock) {
  electron.app.quit();
} else {
  let pendingReveal = false;
  let ipcReady = false;
  setMainRendererUnavailableHandler(createRendererUnavailableHandler({
    setMobileViewportActive: setMobileViewportHotkeysActive,
    setAnswerScrollActive: setAnswerScrollHotkeysActive,
    setWorkMode: setHotkeyWorkMode
  }));
  const revealOrCreateMainWindow = () => {
    if (!electron.app.isReady() || !ipcReady) {
      pendingReveal = true;
      return;
    }
    const existing = getWin();
    if (existing && !existing.isDestroyed()) {
      showMainWindowInteractive();
      return;
    }
    createMainWindow();
  };
  electron.app.on("second-instance", revealOrCreateMainWindow);
  electron.app.on("activate", revealOrCreateMainWindow);
  electron.app.disableHardwareAcceleration();
  electron.app.commandLine.appendSwitch("disable-features", "HardwareMediaKeyHandling");
  electron.app.whenReady().then(async () => {
    try {
      const cfgPath = path.join(electron.app.getPath("userData"), "config.json");
      getSettings();
      console.log("[zhiyue:boot] config file:", cfgPath);
    } catch {
    }
    electron.session.defaultSession.setDisplayMediaRequestHandler(
      (request, callback) => {
        if (!win || win.isDestroyed() || request.frame !== win.webContents.mainFrame || !interviewIsActive()) { callback({}); return; }
        void handleDisplayMediaRequest((selection) => { callback(interviewIsActive() && win && !win.isDestroyed() && request.frame === win.webContents.mainFrame ? selection : {}); });
      },
      { useSystemPicker: false }
    );
    registerIpc();
    ipcReady = true;
    createMainWindow();
    syncAppTrayVisibility(getSettings());
    registerHotkeys(() => {
    });
    void primeDesktopCapturer();
    if (pendingReveal) {
      pendingReveal = false;
      showMainWindowInteractive();
    }
  });
  electron.app.on("window-all-closed", () => {
  });
  electron.app.on("will-quit", () => {
    stopInterview();
    clearInterval(writtenProtectionTimer);
    destroyAppTray();
    flushPendingWindowPosition();
    clearSessionPersonalModelCredentials();
    unregisterAll();
  });
}

function createLocalModelAdapter(options) {
  return options.profile.providerId === 'chatgpt'
    ? new ChatGptPlanAdapter({ ...options, auth: chatgptAuth })
    : createPersonalModelAdapter(options);
}
