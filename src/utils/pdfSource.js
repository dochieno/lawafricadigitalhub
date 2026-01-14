// src/utils/pdfSource.js
import { API_BASE_URL } from "../api/client";

function getToken() {
  // Try common keys (keep your system working without guessing)
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("jwt") ||
    localStorage.getItem("authToken") ||
    ""
  );
}

/**
 * Returns a react-pdf compatible "file" object that includes auth headers.
 * Uses secured download endpoint: /legal-documents/{id}/download
 */
export function getPdfSource(documentId) {
  const token = getToken();

  // API_BASE_URL is typically ".../api"
  const url = `${String(API_BASE_URL || "").replace(/\/$/, "")}/legal-documents/${documentId}/download`;

  // react-pdf/pdf.js supports httpHeaders
  return {
    url,
    httpHeaders: token ? { Authorization: `Bearer ${token}` } : {},
    withCredentials: false,
  };
}
