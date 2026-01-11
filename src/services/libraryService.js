// src/services/libraryService.js
import api from "../api/client";

/**
 * Fetch the logged-in user's library items.
 * Returns an array of documents.
 */
export async function fetchMyLibrary() {
  const res = await api.get("/my-library");
  return res.data || [];
}

/**
 * Add a document to the user's library.
 * This should succeed only for FREE documents (or entitled premium later).
 */
export async function addToMyLibrary(documentId) {
  const res = await api.post(`/my-library/${documentId}`);
  return res.data;
}

/**
 * Remove a document from the user's library.
 */
export async function removeFromMyLibrary(documentId) {
  const res = await api.delete(`/my-library/${documentId}`);
  return res.data;
}
