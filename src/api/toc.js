// src/api/toc.js
import api from "./client";

/** -----------------------------
 * Public / Reader
 * ------------------------------
 * NOTE:
 * You currently DO NOT have a public endpoint:
 *   GET /api/legal-documents/{id}/toc
 * (the controller method is commented out)
 *
 * So we keep this exported function, but make it fail loudly
 * to avoid silent 405/404 confusion.
 */

// GET /api/legal-documents/{id}/toc   (NOT AVAILABLE YET)
// eslint-disable-next-line no-unused-vars
export async function getDocumentToc(documentId) {
  throw new Error(
    "Public ToC endpoint is not enabled on the API yet. " +
      "Either re-enable GET /api/legal-documents/{id}/toc on the backend, " +
      "or call adminGetDocumentToc from admin pages."
  );
}

/** -----------------------------
 * Admin
 * ------------------------------ */

// GET /api/admin/legal-documents/{id}/toc
export async function adminGetDocumentToc(documentId) {
  const res = await api.get(`/admin/legal-documents/${documentId}/toc`);
  return res.data;
}

// POST /api/admin/legal-documents/{id}/toc
export async function adminCreateTocEntry(documentId, payload) {
  const res = await api.post(`/admin/legal-documents/${documentId}/toc`, payload);
  return res.data;
}

// PUT /api/admin/legal-documents/{id}/toc/{entryId}
export async function adminUpdateTocEntry(documentId, entryId, payload) {
  const res = await api.put(`/admin/legal-documents/${documentId}/toc/${entryId}`, payload);
  return res.data;
}

// DELETE /api/admin/legal-documents/{id}/toc/{entryId}
export async function adminDeleteTocEntry(documentId, entryId) {
  const res = await api.delete(`/admin/legal-documents/${documentId}/toc/${entryId}`);
  return res.data;
}

// PUT /api/admin/legal-documents/{id}/toc/reorder
export async function adminReorderToc(documentId, items) {
  // items = [{ id, parentId, order }]
  const res = await api.put(`/admin/legal-documents/${documentId}/toc/reorder`, { items });
  return res.data;
}

// POST /api/admin/legal-documents/{id}/toc/import
export async function adminImportToc(documentId, payload) {
  // payload = { mode: "replace" | "append", items: [...] }
  const res = await api.post(`/admin/legal-documents/${documentId}/toc/import`, payload);
  return res.data;
}
