// src/utils/pdfSource.js
import { getToken } from "../auth/auth";

// Base = https://localhost:7033 (dev) OR https://lawafricaapi.onrender.com (prod)
const BASE = String(import.meta.env.VITE_API_BASE_URL || "https://lawafricaapi.onrender.com")
  .trim()
  .replace(/\/$/, "");

export function getPdfSource(documentId) {
  const token = getToken();

  // defensive: allow string/number ids
  const id = encodeURIComponent(String(documentId ?? "").trim());

  return {
    url: `${BASE}/api/legal-documents/${id}/download`,
    httpHeaders: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      Accept: "application/pdf",
    },
    withCredentials: false,
  };
}
