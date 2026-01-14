// src/utils/pdfSource.js
import { API_BASE_URL } from "../api/client";

// Try multiple keys (since projects vary)
function getToken() {
  const candidates = [
    "token",
    "accessToken",
    "jwt",
    "authToken",
    "LawAfricaToken",
  ];

  for (const k of candidates) {
    const v = localStorage.getItem(k);
    if (v && String(v).trim().length > 10) return String(v).trim();
  }

  // Fallback: if you store auth object JSON
  try {
    const raw = localStorage.getItem("auth");
    if (raw) {
      const obj = JSON.parse(raw);
      const t = obj?.token || obj?.accessToken;
      if (t) return String(t).trim();
    }
  } catch {}

  return null;
}

export function getPdfSource(documentId) {
  const base = String(API_BASE_URL || "").replace(/\/+$/, "");

  const token = getToken();

  // react-pdf accepts either URL string OR { url, httpHeaders }
  // We must pass headers for protected PDFs.
  return {
    url: `${base}/documents/${documentId}/download`,
    httpHeaders: token ? { Authorization: `Bearer ${token}` } : {},
    withCredentials: false,
  };
}
