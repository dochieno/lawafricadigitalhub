import axios from "axios";
import { getToken, clearToken, isTokenExpired } from "../auth/auth";

// Base = https://localhost:7033 (dev) OR https://lawafricaapi.onrender.com (prod)
const BASE = String(import.meta.env.VITE_API_BASE_URL || "https://lawafricaapi.onrender.com")
  .trim()
  .replace(/\/$/, "");

// Final API base = .../api
export const API_BASE_URL = `${BASE}/api`;

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Prevent multiple redirect loops
let hasRedirectedOn401 = false;

/**
 * ✅ Only during payment return / payment confirmation should we avoid force-logout redirects.
 */
function isInPaystackReturnOrPaidContext() {
  try {
    const p = window.location.pathname || "";
    const qs = new URLSearchParams(window.location.search || "");
    const paid = (qs.get("paid") || "").trim();
    const provider = (qs.get("provider") || "").trim().toLowerCase();

    const isReturn = p === "/payments/paystack/return" || p.startsWith("/payments/paystack/return");

    const isPaidContext =
      paid === "1" &&
      provider === "paystack" &&
      (p.startsWith("/dashboard/documents/") || p.startsWith("/dashboard/library"));

    return isReturn || isPaidContext;
  } catch {
    return false;
  }
}

/**
 * ✅ Detect auth endpoints so we don't create loops or redirects on them.
 */
function isAuthEndpoint(url = "") {
  const u = String(url || "");
  return (
    /\/Auth\/login/i.test(u) ||
    /\/Auth\/confirm-2fa/i.test(u) ||
    /\/Security\/verify-2fa-setup/i.test(u) ||
    /\/Security\/resend-2fa-setup/i.test(u)
  );
}

/**
 * ✅ Public payment endpoints that must still work even if token is expired
 */
function isPublicPaymentEndpoint(url = "") {
  const u = String(url || "");
  return (
    /\/payments\/paystack\/confirm/i.test(u) ||
    /\/payments\/paystack\/intent-by-reference/i.test(u) ||
    /\/payments\/paystack\/return-visit/i.test(u)
  );
}

/**
 * ✅ Boot-critical endpoints: never throttle these
 */
function isBootCritical(url = "") {
  const u = String(url || "");
  return (
    /\/Profile\/me/i.test(u) ||
    /\/my-library/i.test(u) || // safe to keep fast
    /\/legal-documents\/[^/]+\/access/i.test(u)
  );
}

/**
 * ✅ Detect PDF download endpoint (pdf.js uses MANY requests, often Range-based)
 */
function isPdfDownload(url = "") {
  const u = String(url || "");
  return /\/legal-documents\/[^/]+\/download/i.test(u);
}

/**
 * ✅ Throttle identical requests to stop storms.
 */
const recentRequestMap = new Map();
const THROTTLE_MS = 800; // ✅ reduced (less likely to break boot)

function stableStringify(obj) {
  try {
    if (!obj || typeof obj !== "object") return "";
    const keys = Object.keys(obj).sort();
    const out = {};
    for (const k of keys) {
      const v = obj[k];
      if (v === undefined) continue;
      if (v === null) out[k] = null;
      else if (typeof v === "string") out[k] = v.slice(0, 80);
      else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
      else out[k] = String(v).slice(0, 80);
    }
    return JSON.stringify(out);
  } catch {
    return "";
  }
}

function getHeader(config, name) {
  try {
    const h = config?.headers || {};
    return (
      h?.[name] ??
      h?.[name.toLowerCase()] ??
      h?.[name.toUpperCase()] ??
      h?.common?.[name] ??
      h?.common?.[name.toLowerCase()] ??
      undefined
    );
  } catch {
    return undefined;
  }
}

function makeReqKey(config) {
  const method = String(config?.method || "get").toUpperCase();
  const url = String(config?.url || "");

  const paramsSig = stableStringify(config?.params);
  const rangeSig = String(getHeader(config, "Range") || "");
  const rt = String(config?.responseType || "");

  let bodySig = "";
  try {
    if (config?.data && typeof config.data === "object" && !(config.data instanceof FormData)) {
      const keys = Object.keys(config.data).slice(0, 10).sort();
      bodySig = keys.map((k) => `${k}:${String(config.data[k]).slice(0, 32)}`).join("|");
    }
  } catch {}

  return `${method} ${url} rt=${rt} range=${rangeSig} params=${paramsSig} body=${bodySig}`;
}

function cleanupOldKeys(now) {
  if (recentRequestMap.size < 500) return;
  for (const [k, t] of recentRequestMap.entries()) {
    if (now - t > THROTTLE_MS * 4) recentRequestMap.delete(k);
  }
}

function shouldThrottle(config) {
  if (config?.__skipThrottle) return false;

  const url = String(config?.url || "");
  const range = getHeader(config, "Range");
  const rt = String(config?.responseType || "").toLowerCase();

  // ✅ Never throttle boot-critical requests
  if (isBootCritical(url)) return false;

  // ✅ PDF safety
  if (isPdfDownload(url)) return false;
  if (range) return false;
  if (rt === "blob" || rt === "arraybuffer") return false;

  const key = makeReqKey(config);
  const now = Date.now();

  cleanupOldKeys(now);

  const last = recentRequestMap.get(key) || 0;
  if (now - last < THROTTLE_MS) return true;

  recentRequestMap.set(key, now);
  return false;
}

// ✅ Attach JWT + handle FormData + stop expired-token requests
api.interceptors.request.use(
  (config) => {
    if (shouldThrottle(config)) {
      return Promise.reject(
        new axios.CanceledError("Throttled duplicate request (preventing request storm).")
      );
    }

    const token = getToken();
    const url = String(config?.url || "");

    if (token && isTokenExpired() && !isAuthEndpoint(url) && !isPublicPaymentEndpoint(url)) {
      clearToken();
      return Promise.reject(
        new axios.CanceledError("Token expired. Request cancelled; user must login again.")
      );
    }

    if (token && !isAuthEndpoint(url)) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }

    const isFormData = typeof FormData !== "undefined" && config.data instanceof FormData;
    if (isFormData && config.headers) {
      delete config.headers["Content-Type"];
      delete config.headers["content-type"];
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ✅ Auto-clear token + redirect to login on 401 ONLY (except Paystack return/paid context)
api.interceptors.response.use(
  (res) => {
    hasRedirectedOn401 = false;
    return res;
  },
  (error) => {
    if (axios.isCancel(error) || error?.code === "ERR_CANCELED") {
      return Promise.reject(error);
    }

    const status = error?.response?.status;
    const url = error?.config?.url || "";

    if (isAuthEndpoint(url)) return Promise.reject(error);

    if (status === 401) {
      if (isInPaystackReturnOrPaidContext()) return Promise.reject(error);

      clearToken();

      if (!hasRedirectedOn401) {
        hasRedirectedOn401 = true;
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

export default api;

export async function checkDocumentAvailability(documentId) {
  const res = await api.get(`/legal-documents/${documentId}/availability`, { __skipThrottle: true });
  return res.data?.data ?? res.data;
}
