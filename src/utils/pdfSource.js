import { getToken } from "../auth/auth";

export function getPdfSource(documentId) {
  const token = getToken();

  const BASE = (import.meta.env.VITE_API_BASE_URL || "https://lawafricaapi.onrender.com")
    .trim()
    .replace(/\/$/, "");

  return {
    url: `${BASE}/api/legal-documents/${documentId}/download`,
    httpHeaders: token ? { Authorization: `Bearer ${token}` } : {},
    withCredentials: false,
  };
}
