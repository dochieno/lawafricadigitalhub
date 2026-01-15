// src/utils/pdfSource.js
import { getToken } from "../auth/auth";

/**
 * Returns an authenticated PDF source for react-pdf
 * Backend endpoint: GET /api/legal-documents/{id}/download
 */
function normalizeApiBase(raw) {
  const base = (raw || "").trim().replace(/\/+$/, "");
  if (!base) return "";
  // If already ends with /api keep it, else add /api
  return base.endsWith("/api") ? base : `${base}/api`;
}

export function getPdfSource(documentId) {
  const token = getToken();

  // Support either env var name
  const rawBase =
    import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || "";

  const apiBase = normalizeApiBase(rawBase);

  if (!apiBase) {
    throw new Error(
      "Missing API base env var. Set VITE_API_BASE_URL (or VITE_API_URL) to e.g. https://lawafricaapi.onrender.com"
    );
  }

  return {
    url: `${apiBase}/legal-documents/${documentId}/download`,
    httpHeaders: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : {},
    withCredentials: false,
  };
}
