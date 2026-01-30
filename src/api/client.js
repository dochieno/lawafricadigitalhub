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
============================================================ */

const inflight = new Map();
const INFLIGHT_TTL_MS = 12_000;

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


function resolveAdapter(config) {
  // If caller already provided a function adapter, use it.
  if (typeof config?.adapter === "function") return config.adapter;

  const candidate = config?.adapter ?? api.defaults.adapter ?? axios.defaults.adapter;

  // Axios v1+ provides getAdapter()
  if (typeof axios.getAdapter === "function") {
    return axios.getAdapter(candidate);
  }

  // Fallback: if it's already a function, use it
  if (typeof candidate === "function") return candidate;

  // Last resort: throw a clear error rather than "r is not a function"
  throw new Error("Axios adapter could not be resolved to a function.");
}

function attachInflightDedupeAdapter(config) {
  if (!canDedupe(config)) return;

  cleanupInflight();

  const key = makeReqKey(config);
  const existing = inflight.get(key);

  if (existing?.promise) {
    // ✅ Reuse same Promise (no cancellation)
    config.adapter = () => existing.promise;
    return;
  }

  const baseAdapter = resolveAdapter(config);

  config.adapter = (cfg) => {
    const p = Promise.resolve(baseAdapter(cfg)).finally(() => {
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

api.interceptors.request.use(
  (config) => {
    // ✅ NEW: de-dupe identical GETs by sharing the same in-flight Promise
    attachInflightDedupeAdapter(config);

    const token = getToken();
    const url = String(config?.url || "");

    // ✅ Expired token: stop request except auth + public payment endpoints
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
