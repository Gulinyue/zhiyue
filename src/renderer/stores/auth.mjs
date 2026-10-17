import { create$1 } from "../vendor/react-icons-state.mjs";
import { primeTokens, subscriptionNeedsSync, publicFetch, withClientVersionBody, clearTokens, authFetch, GatewayUnavailableError, mergeSubscriptionFromStatusBody, AuthRequiredError, ClientUpdateRequiredError, SubscriptionRequiredError, toGatewayUnavailableError, WEB_PORTAL_URL } from "../services/gateway.mjs";

const STATUS_CACHE_MS = 6e4;
let lastStatusCheck = 0;
const useAuth = create$1((set, get) => ({
  logoutRevision: 0,
  status: "unknown",
  loggingIn: false,
  resendCooldown: 0,
  async init() {
    try {
      const snap = await window.api.auth.status();
      const tokens = await window.api.auth.getTokens();
      primeTokens(tokens ?? {});
      set({
        status: snap.status,
        email: snap.email,
        subscription: snap.subscription,
        expiresAt: snap.expiresAt
      });
      if (snap.status === "loggedIn" && subscriptionNeedsSync(snap.subscription)) {
        await get().refreshStatus(true);
      }
    } catch {
      set({ status: "anon" });
    }
    window.api.auth.onChange((snap) => {
      set({
        status: snap?.status ?? "anon",
        email: snap?.email,
        subscription: snap?.subscription,
        expiresAt: snap?.expiresAt
      });
    });
  },
  async login(email, password) {
    set({ loggingIn: true, lastError: void 0, needsVerification: void 0, resendMessage: void 0 });
    try {
      const res = await publicFetch("/v1/auth/login", {
        method: "POST",
        body: JSON.stringify(withClientVersionBody({ email, password }))
      });
      if (!res.ok) {
        const text2 = await res.text().catch(() => "");
        let msg = `HTTP ${res.status}`;
        let code2;
        let emailFromBody;
        try {
          const j = JSON.parse(text2);
          if (j?.message) msg = j.message;
          if (typeof j?.code === "string") code2 = j.code;
          if (typeof j?.email === "string") emailFromBody = j.email;
        } catch {
          if (text2) msg = text2.slice(0, 200);
        }
        if (res.status === 403 && code2 === "EMAIL_NOT_VERIFIED") {
          set({
            loggingIn: false,
            needsVerification: emailFromBody ?? email,
            lastError: msg
          });
          return;
        }
        throw new Error(msg);
      }
      const body = await res.json();
      const accessToken = body?.accessToken;
      const refreshToken = body?.refreshToken;
      const expiresAt = body?.expiresAt;
      const subscription = body?.subscription;
      if (!accessToken) throw new Error("backend did not return accessToken");
      primeTokens({ accessToken, refreshToken });
      const snap = await window.api.auth.saveTokens({
        accessToken,
        refreshToken,
        email,
        expiresAt,
        subscription
      });
      lastStatusCheck = Date.now();
      set({
        status: snap.status,
        email: snap.email,
        subscription: snap.subscription,
        expiresAt: snap.expiresAt,
        loggingIn: false,
        lastError: void 0
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ loggingIn: false, lastError: msg });
      throw err;
    }
  },
  async logout() {
    set({ logoutRevision: get().logoutRevision + 1 });
    clearTokens();
    try {
      await window.api.auth.clearTokens();
    } catch {
    }
    lastStatusCheck = 0;
    set({ status: "anon", email: void 0, subscription: void 0, expiresAt: void 0 });
  },
  async refreshStatus(force = false, options = {}) {
    const now = Date.now();
    if (!force && now - lastStatusCheck < STATUS_CACHE_MS) {
      return get().status;
    }
    lastStatusCheck = now;
    try {
      const res = await authFetch("/v1/subscription/status", { method: "GET" });
      if (!res.ok) {
        if (res.status === 401) {
          set({ status: "anon" });
          return "anon";
        }
        if (options.throwOnTransient) {
          throw new GatewayUnavailableError();
        }
        return get().status;
      }
      const body = await res.json();
      const subscription = mergeSubscriptionFromStatusBody(body, get().subscription);
      const snap = await window.api.auth.saveTokens({ subscription });
      const next = subscription.active ? "loggedIn" : "expired";
      set({
        status: next,
        subscription,
        email: snap.email ?? get().email
      });
      return next;
    } catch (err) {
      if (err instanceof AuthRequiredError) {
        set({ status: "anon" });
        return "anon";
      }
      if (err instanceof ClientUpdateRequiredError) {
        set({ status: "anon", lastError: err.message });
        return "anon";
      }
      if (err instanceof SubscriptionRequiredError) {
        const subscription = {
          active: false,
          message: err.backendMessage,
          portalUrl: err.portalUrl
        };
        await window.api.auth.saveTokens({ subscription });
        set({ status: "expired", subscription });
        return "expired";
      }
      if (options.throwOnTransient) {
        lastStatusCheck = 0;
        throw toGatewayUnavailableError(err);
      }
      return get().status;
    }
  },
  async ensureUsable() {
    const s2 = get();
    if (s2.status === "unknown") {
      await get().init();
    }
    if (get().status === "anon") return false;
    const next = await get().refreshStatus(false);
    return next === "loggedIn";
  },
  async openPortal() {
    const url2 = get().subscription?.portalUrl ?? `${WEB_PORTAL_URL}/subscribe`;
    await window.api.auth.openPortal(url2);
  },
  async openWebUrl(path2) {
    const rel2 = path2.startsWith("/") ? path2 : `/${path2}`;
    await window.api.auth.openPortal(`${WEB_PORTAL_URL}${rel2}`);
  },
  async resendVerification(email) {
    if (get().resendCooldown > 0) return;
    set({ resendMessage: "发送中…" });
    try {
      const res = await publicFetch("/v1/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      if (res.status === 429) {
        let cooldown = 60;
        try {
          const j = await res.json();
          if (typeof j?.cooldownSec === "number") cooldown = j.cooldownSec;
        } catch {
        }
        set({ resendCooldown: cooldown, resendMessage: "发送太频繁，请稍后再试" });
        tickCooldown(cooldown, set);
        return;
      }
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          if (j?.message) msg = j.message;
        } catch {
        }
        set({ resendMessage: `重发失败：${msg}` });
        return;
      }
      set({ resendCooldown: 60, resendMessage: "已重新发送，请查收邮箱" });
      tickCooldown(60, set);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ resendMessage: `重发失败：${msg}` });
    }
  },
  setError(err) {
    set({ lastError: err });
  }
}));
function tickCooldown(seconds, set) {
  let left = seconds;
  const int = window.setInterval(() => {
    left -= 1;
    if (left <= 0) {
      window.clearInterval(int);
      set({ resendCooldown: 0 });
    } else {
      set({ resendCooldown: left });
    }
  }, 1e3);
}

export { STATUS_CACHE_MS, lastStatusCheck, useAuth, tickCooldown };
