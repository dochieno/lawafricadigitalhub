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

// ✅ Attach JWT to every request + handle FormData correctly + stop expired-token requests
api.interceptors.request.use(
  (config) => {
    const token = getToken();

    // ✅ If token exists but is expired, clear it and STOP the request.
    if (token && isTokenExpired()) {
      clearToken();
      return Promise.reject(
        new axios.Cancel("Token expired. Request cancelled; user must login again.")
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

// ✅ Auto-clear token + redirect to login on 401 ONLY
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (axios.isCancel(error)) return Promise.reject(error);

    const status = error?.response?.status;

    // ✅ IMPORTANT:
    // 401 = invalid/expired token => logout
    // 403 = authenticated but not allowed => DO NOT logout
    if (status === 401) {
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
