// src/utils/pdfSource.js
import { API_BASE_URL } from "../api/client";

export function getPdfSource(documentId) {
  const token = localStorage.getItem("token");

  // API_BASE_URL is expected to be like: https://lawafricaapi.onrender.com/api
  const url = `${String(API_BASE_URL).replace(/\/+$/, "")}/documents/${documentId}/content`;

  // react-pdf supports { url, httpHeaders }
  return token
    ? { url, httpHeaders: { Authorization: `Bearer ${token}` } }
    : { url };
}
