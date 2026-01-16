// src/api/client.js
import axios from "axios";
import { getToken, clearToken, isTokenExpired } from "../auth/auth";

// Base = https://localhost:7033 (dev) OR https://lawafricaapi.onrender.com (prod)
const BASE = (import.meta.env.VITE_API_BASE_URL || "https://lawafricaapi.onrender.com")
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
 * ✅ Only during payment return should we avoid force-logout redirects.
 */
function isOnPaystackReturnRoute() {
  try {
    const p = window.location.pathname || "";
    return p === "/payments/paystack/return" || p.startsWith("/payments/paystack/return");
  } catch {
    return false;
  }
}

/**
 * ✅ Detect auth endpoints so we don't create loops or redirects on them.
 * NOTE: These are PATHS AFTER baseURL (because axios config.url is relative).
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
 * ✅ Detect PDF download endpoint (pdf.js uses MANY requests, often Range-based)
 */
function isPdfDownload(url = "") {
  const u = String(url || "");
  return /\/legal-documents\/[^/]+\/download/i.test(u);
}

/**
 * ✅ Throttle identical requests to stop storms.
 * IMPORTANT FIX: include query params in key (config.params).
 *
 * PDF FIX:
 * - Never throttle requests with Range headers, binary responseTypes, or /download endpoint
 *   (pdf.js will break if those are canceled).
 *
 * You can bypass per request by setting:
 *   api.get("/x", { __skipThrottle: true })
 */
const recentRequestMap = new Map();

// Keep your original, but now it’s safe because keys are more accurate.
// If you still want it more “responsive”, you can reduce to 500–800ms.
const THROTTLE_MS = 1200;

function stableStringify(obj) {
  try {
    if (!obj || typeof obj !== "object") return "";
    const keys = Object.keys(obj).sort();
    const out = {};
    for (const k of keys) {
      const v = obj[k];
      // keep signature small and stable
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

  // ✅ include query params (critical)
  const paramsSig = stableStringify(config?.params);

  // ✅ include Range header signature (critical for pdf.js)
  const rangeSig = String(getHeader(config, "Range") || "");

  // ✅ include responseType (blob/arraybuffer should never collide with json)
  const rt = String(config?.responseType || "");

  // Keep signature small; enough to stop repeated identical storms
  let bodySig = "";
  try {
    if (config?.data && typeof config.data === "object" && !(config.data instanceof FormData)) {
      const keys = Object.keys(config.data).slice(0, 10).sort();
      bodySig = keys.map((k) => `${k}:${String(config.data[k]).slice(0, 32)}`).join("|");
    }
  } catch {
    // ignore
  }

  return `${method} ${url} rt=${rt} range=${rangeSig} params=${paramsSig} body=${bodySig}`;
}

function cleanupOldKeys(now) {
  // Prevent unbounded growth
  if (recentRequestMap.size < 500) return;
  for (const [k, t] of recentRequestMap.entries()) {
    if (now - t > THROTTLE_MS * 4) recentRequestMap.delete(k);
  }
}

function shouldThrottle(config) {
  // ✅ Allow bypass per request
  if (config?.__skipThrottle) return false;

  const url = String(config?.url || "");
  const range = getHeader(config, "Range");
  const rt = String(config?.responseType || "").toLowerCase();

  // ✅ PDF safety: never throttle these, otherwise pdf.js breaks
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

// ✅ Attach JWT to every request + handle FormData correctly + stop expired-token requests
api.interceptors.request.use(
  (config) => {
    // ✅ Stop request storms early (now safe because params+range are part of signature,
    // and PDF downloads are excluded)
    if (shouldThrottle(config)) {
      return Promise.reject(
        new axios.CanceledError("Throttled duplicate request (preventing request storm).")
      );
    }

    const token = getToken();

    // ✅ If token exists but is expired, clear it and STOP the request,
    // EXCEPT for auth endpoints (login / 2fa actions).
    if (token && isTokenExpired() && !isAuthEndpoint(config?.url)) {
      clearToken();
      return Promise.reject(
        new axios.CanceledError("Token expired. Request cancelled; user must login again.")
      );
    }

    // ✅ Attach Authorization if token exists (avoid attaching on login endpoints)
    if (token && !isAuthEndpoint(config?.url)) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }

    // ✅ If sending FormData, remove JSON Content-Type so browser sets boundary
    const isFormData = typeof FormData !== "undefined" && config.data instanceof FormData;
    if (isFormData && config.headers) {
      delete config.headers["Content-Type"];
      delete config.headers["content-type"];
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ✅ Auto-clear token + redirect to login on 401 ONLY (except Paystack return route)
api.interceptors.response.use(
  (res) => {
    hasRedirectedOn401 = false;
    return res;
  },
  (error) => {
    // ✅ Do not treat cancels as real errors
    if (axios.isCancel(error)) return Promise.reject(error);

    const status = error?.response?.status;
    const url = error?.config?.url || "";

    // ✅ Never redirect from auth endpoints (prevents loops if a screen is already handling it)
    if (isAuthEndpoint(url)) {
      return Promise.reject(error);
    }

    if (status === 401) {
      if (isOnPaystackReturnRoute()) {
        return Promise.reject(error);
      }

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
  // Optional: skip throttle just in case multiple components call this quickly
  const res = await api.get(`/legal-documents/${documentId}/availability`, { __skipThrottle: true });
  return res.data?.data ?? res.data;
}
