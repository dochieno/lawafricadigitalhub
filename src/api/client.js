// src/api/client.js
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
 * Includes:
 * - /payments/paystack/return...
 * - /dashboard/documents/:id?paid=1&provider=paystack...
 * - /dashboard/documents/:id/read?paid=1&provider=paystack...
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
 * ✅ Public payment endpoints that must still work even if token is expired
 * (important for paystack return + confirmation UX).
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
 * ✅ Detect PDF download endpoint (pdf.js uses MANY requests, often Range-based)
 */
function isPdfDownload(url = "") {
  const u = String(url || "");
  return /\/legal-documents\/[^/]+\/download/i.test(u);
}

/* ============================================================
   ✅ OPTION A: In-flight de-dupe (NO CANCELLATION)
   - If an identical GET request is already in progress, we reuse
     the same Promise instead of canceling the new request.
   - This fixes “Network tab has nothing / white screen” caused by
     canceled boot requests (e.g., /Profile/me) that the UI awaits.
============================================================ */

const inflight = new Map();
const INFLIGHT_TTL_MS = 12_000; // safety cleanup if a promise never settles

function stableStringify(obj) {
  try {
    if (!obj || typeof obj !== "object") return "";
    const keys = Object.keys(obj).sort();
    const out = {};
    for (const k of keys) {
      const v = obj[k];
      if (v === undefined) continue;
      if (v === null) out[k] = null;
      else if (typeof v === "string") out[k] = v.slice(0, 120);
      else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
      else out[k] = String(v).slice(0, 120);
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

function bodySignature(data) {
  try {
    if (!data) return "";
    if (typeof FormData !== "undefined" && data instanceof FormData) return "formdata";
    if (typeof data === "string") return data.slice(0, 180);
    if (typeof data !== "object") return String(data).slice(0, 180);

    // small stable signature (not full JSON to avoid huge keys)
    const keys = Object.keys(data).slice(0, 12).sort();
    return keys.map((k) => `${k}:${String(data[k]).slice(0, 60)}`).join("|");
  } catch {
    return "";
  }
}

function makeReqKey(config) {
  const method = String(config?.method || "get").toUpperCase();
  const url = String(config?.url || "");

  const paramsSig = stableStringify(config?.params);
  const rangeSig = String(getHeader(config, "Range") || "");
  const rt = String(config?.responseType || "");

  // For GETs, body is normally empty; if present we still include a small signature
  const dataSig = bodySignature(config?.data);

  return `${method} ${url} rt=${rt} range=${rangeSig} params=${paramsSig} data=${dataSig}`;
}

function cleanupInflight(now = Date.now()) {
  for (const [k, v] of inflight.entries()) {
    if (!v || !v.ts) {
      inflight.delete(k);
      continue;
    }
    if (now - v.ts > INFLIGHT_TTL_MS) inflight.delete(k);
  }
}

/**
 * Decide if this request can be deduped.
 * ✅ Only dedupe idempotent requests by default (GET/HEAD).
 * ✅ Never dedupe pdf.js critical flows.
 * ✅ Allow opt-out: config.__skipDedupe = true
 */
function canDedupe(config) {
  if (config?.__skipDedupe) return false;

  const method = String(config?.method || "get").toUpperCase();
  if (!(method === "GET" || method === "HEAD")) return false;

  const url = String(config?.url || "");
  const range = getHeader(config, "Range");
  const rt = String(config?.responseType || "").toLowerCase();

  if (isPdfDownload(url)) return false;
  if (range) return false;
  if (rt === "blob" || rt === "arraybuffer") return false;

  return true;
}

/**
 * Attach an adapter wrapper that:
 * - reuses the same in-flight Promise for identical requests
 * - cleans up once resolved/rejected
 */
function attachInflightDedupeAdapter(config) {
  if (!canDedupe(config)) return;

  cleanupInflight();

  const key = makeReqKey(config);
  const existing = inflight.get(key);

  if (existing?.promise) {
    // ✅ Reuse the same Promise (no cancellation)
    config.adapter = () => existing.promise;
    return;
  }

  const baseAdapter =
    config.adapter || api.defaults.adapter || axios.defaults.adapter;

  // Wrap the adapter so the first request stores its promise
  config.adapter = (cfg) => {
    const p = Promise.resolve(baseAdapter(cfg))
      .finally(() => {
        // ensure we only delete if still mapped to this promise
        const cur = inflight.get(key);
        if (cur?.promise === p) inflight.delete(key);
      });

    inflight.set(key, { promise: p, ts: Date.now() });
    return p;
  };
}

/* =========================
   Interceptors
========================= */

// ✅ Attach JWT + handle FormData + stop expired-token requests
api.interceptors.request.use(
  (config) => {
    // ✅ NEW: de-dupe identical GETs by sharing the same in-flight Promise
    attachInflightDedupeAdapter(config);

    const token = getToken();
    const url = String(config?.url || "");

    /**
     * ✅ IMPORTANT:
     * If token exists but is expired, clear it and STOP the request,
     * EXCEPT for:
     * - auth endpoints
     * - public payment endpoints (paystack confirm / intent-by-reference / return-visit)
     */
    if (token && isTokenExpired() && !isAuthEndpoint(url) && !isPublicPaymentEndpoint(url)) {
      clearToken();
      return Promise.reject(
        new axios.CanceledError("Token expired. Request cancelled; user must login again.")
      );
    }

    // ✅ Attach Authorization if token exists (avoid attaching on auth endpoints)
    if (token && !isAuthEndpoint(url)) {
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

// ✅ Auto-clear token + redirect to login on 401 ONLY (except Paystack return/paid context)
api.interceptors.response.use(
  (res) => {
    hasRedirectedOn401 = false;
    return res;
  },
  (error) => {
    // ✅ Do not treat cancels as real errors (but still propagate to caller)
    if (axios.isCancel(error) || error?.code === "ERR_CANCELED") {
      return Promise.reject(error);
    }

    const status = error?.response?.status;
    const url = error?.config?.url || "";

    // ✅ Never redirect from auth endpoints (prevents loops if a screen is already handling it)
    if (isAuthEndpoint(url)) {
      return Promise.reject(error);
    }

    if (status === 401) {
      // ✅ KEY FIX: do NOT redirect away while confirming paystack payment
      if (isInPaystackReturnOrPaidContext()) {
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
  // Safe: availability may be called by multiple components; dedupe will share the same promise anyway.
  const res = await api.get(`/legal-documents/${documentId}/availability`, { __skipThrottle: true });
  return res.data?.data ?? res.data;
}
