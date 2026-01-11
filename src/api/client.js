// src/api/client.js
import axios from "axios";
import { getToken, clearToken, isTokenExpired } from "../auth/auth";

export const API_BASE_URL = "https://localhost:7033/api";

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    // Keep existing default, but we will intelligently remove it for FormData.
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
    // This prevents spamming the API with 401s (your current code still sends the request).
    if (token && isTokenExpired()) {
      clearToken();

      // Cancel the request cleanly (caller won't see 401 spam)
      return Promise.reject(
        new axios.Cancel("Token expired. Request cancelled; user must login again.")
      );
    }

    // ✅ Attach Authorization if token exists
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }

    // ✅ If sending FormData, remove JSON Content-Type so browser sets multipart boundary
    // (important for /upload and /cover endpoints)
    const isFormData =
      typeof FormData !== "undefined" && config.data instanceof FormData;

    if (isFormData && config.headers) {
      // Axios may store headers in different casing/structures; handle both.
      delete config.headers["Content-Type"];
      delete config.headers["content-type"];
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// ✅ Auto-clear token + redirect to login on 401 (once)
api.interceptors.response.use(
  (res) => res,
  (error) => {
    // Ignore axios cancel (we used it for expired token)
    if (axios.isCancel(error)) return Promise.reject(error);

    const status = error?.response?.status;

    if (status === 401) {
      clearToken();

      // Prevent endless redirects / loops
      if (!hasRedirectedOn401) {
        hasRedirectedOn401 = true;

        // If you're using react-router navigation in components, this still works globally:
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
