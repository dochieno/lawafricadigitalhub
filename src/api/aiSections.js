// src/api/aiSections.js
import api from "./client";

/**
 * Calls the backend section summariser.
 * NOTE: This is still stubbed on the backend for now (returns "[stub/...]" summary).
 */
export async function summarizeLegalDocSection({
  legalDocumentId,
  tocEntryId = null,
  type = "basic",
  startPage,
  endPage,
  forceRegenerate = false,
  sectionTitle = null,
}) {
  const payload = {
    legalDocumentId,
    tocEntryId,
    type,
    startPage,
    endPage,
    forceRegenerate,
    sectionTitle,
  };

  const res = await api.post("/ai/legal-documents/sections/summarize", payload);
  return res.data;
}
