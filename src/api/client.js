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
 * ✅ Throttle identical requests to stop storms.
 * Key = METHOD + URL + (optional) small body signature
 */
const recentRequestMap = new Map();
const THROTTLE_MS = 1200;

function makeReqKey(config) {
  const method = String(config?.method || "get").toUpperCase();
  const url = String(config?.url || "");
  // Keep signature small; enough to stop repeated identical storms
  let bodySig = "";
  try {
    if (config?.data && typeof config.data === "object" && !(config.data instanceof FormData)) {
      const keys = Object.keys(config.data).slice(0, 6).sort();
      bodySig = keys.map((k) => `${k}:${String(config.data[k]).slice(0, 16)}`).join("|");
    }
  } catch {
    // ignore
  }
  return `${method} ${url} ${bodySig}`;
}

function shouldThrottle(config) {
  const key = makeReqKey(config);
  const now = Date.now();
  const last = recentRequestMap.get(key) || 0;
  if (now - last < THROTTLE_MS) return true;
  recentRequestMap.set(key, now);
  return false;
}

// ✅ Attach JWT to every request + handle FormData correctly + stop expired-token requests
api.interceptors.request.use(
  (config) => {
    // ✅ Stop request storms early (but do NOT block user typing, etc.)
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
  const res = await api.get(`/legal-documents/${documentId}/availability`);
  return res.data?.data ?? res.data;
}
