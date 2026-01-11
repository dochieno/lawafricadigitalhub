// src/utils/pdfSource.js
import { getToken } from "../auth/auth";

/**
 * Returns an authenticated PDF source for react-pdf
 */
export function getPdfSource(documentId) {
  const token = getToken();

  return {
    url: `${import.meta.env.VITE_API_URL}/api/documents/${documentId}/content`,
    httpHeaders: {
      Authorization: `Bearer ${token}`,
    },
    withCredentials: false,
  };
}
