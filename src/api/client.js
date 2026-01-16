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
 * IMPORTANT: Keep this matcher strict to avoid leaving users “stuck” elsewhere.
 *
 * Adjust these routes to match your frontend routing:
 * - If your Paystack return route is exactly "/paystack/return", keep it exact.
 * - If it is "/dashboard/payments/paystack/return", match that exact prefix.
 */
function isOnPaystackReturnRoute() {
  try {
    const p = window.location.pathname || "";
    // ✅ keep strict (edit to match your exact route)
    return (
      p === "/paystack/return" ||
      p.startsWith("/paystack/return") ||
      p.includes("/paystack/return") ||
      p.includes("paystack") // fallback, safe if your route always contains "paystack"
    );
  } catch {
    return false;
  }
}

// ✅ Attach JWT to every request + handle FormData correctly + stop expired-token requests
api.interceptors.request.use(
  (config) => {
    const token = getToken();

    // ✅ If token exists but is expired, clear it and STOP the request.
    // (This behavior remains unchanged.)
    if (token && isTokenExpired()) {
      clearToken();
      return Promise.reject(
        new axios.CanceledError("Token expired. Request cancelled; user must login again.")
      );
    }

    // ✅ Attach Authorization if token exists
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }

    // ✅ If sending FormData, remove JSON Content-Type so browser sets boundary
    const isFormData =
      typeof FormData !== "undefined" && config.data instanceof FormData;

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
    // Optional: once we successfully get responses, allow future 401 redirects again
    // (prevents “stuck” behavior if user logs back in later in the same session)
    hasRedirectedOn401 = false;
    return res;
  },
  (error) => {
    if (axios.isCancel(error)) return Promise.reject(error);

    const status = error?.response?.status;

    // ✅ IMPORTANT:
    // 401 = invalid/expired token => logout normally
    // 403 = authenticated but not allowed => DO NOT logout
    if (status === 401) {
      // ✅ Paystack return: do NOT clear token or hard redirect.
      // Let PaystackReturn handle the error / restore token snapshot / retry.
      if (isOnPaystackReturnRoute()) {
        return Promise.reject(error);
      }

      // ✅ Everywhere else: current behavior
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

/* -------------------------------------------------------
   Optional helpers (keep if you were using them already)
-------------------------------------------------------- */
export async function checkDocumentAvailability(documentId) {
  const res = await api.get(`/legal-documents/${documentId}/availability`);
  return res.data?.data ?? res.data;
}
