// src/utils/pdfSource.js

function getApiBase() {
  const envBase =
    import.meta?.env?.VITE_API_BASE_URL ||
    import.meta?.env?.VITE_API_URL ||
    "";
  return (envBase || "").replace(/\/+$/, "");
}

function getToken() {
  return (
    localStorage.getItem("token") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("jwt") ||
    ""
  );
}

export function getPdfSource(documentId) {
  const base = getApiBase();
  const url = `${base}/legal-documents/${documentId}/download`;
  const token = getToken();

  return {
    url,
    httpHeaders: token ? { Authorization: `Bearer ${token}` } : {},
    withCredentials: true,
  };
}
