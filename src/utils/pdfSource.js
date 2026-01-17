// src/utils/pdfSource.js
import { getToken } from "../auth/auth";

// Base = https://localhost:7033 (dev) OR https://lawafricaapi.onrender.com (prod)
const BASE = String(import.meta.env.VITE_API_BASE_URL || "https://lawafricaapi.onrender.com")
  .trim()
  .replace(/\/$/, "");

export function getPdfSource(documentId) {
  // defensive: allow string/number ids
  const id = encodeURIComponent(String(documentId ?? "").trim());

  // ✅ Trim + guard against empty strings
  const token = String(getToken?.() || "").trim();

  // ✅ pdf.js / react-pdf uses these headers for fetch
  const httpHeaders = {
    Accept: "application/pdf",
  };

  // ✅ Only attach Authorization if token exists
  if (token) {
    httpHeaders.Authorization = `Bearer ${token}`;
  }

  return {
    url: `${BASE}/api/legal-documents/${id}/download`,
    httpHeaders,
    withCredentials: false,
  };
}
