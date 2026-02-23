// src/api/lawyers.js
import api, { toApiAssetUrl } from "./client";

/**
 * Normalize lawyer DTO for frontend usage (assets, etc.)
 */
export function normalizeLawyerProfile(dto) {
  if (!dto) return dto;
  return {
    ...dto,
    profileImageUrl: dto.profileImageUrl ? toApiAssetUrl(dto.profileImageUrl) : null,
  };
}

/**
 * GET /api/lawyers/search
 * Query params: countryId, townId, practiceAreaId, highestCourtAllowedId, verifiedOnly, q, take, skip
 */
export async function searchLawyers(params = {}) {
  const res = await api.get("/lawyers/search", { params });
  const data = res.data || {};
  const items = Array.isArray(data.items) ? data.items : [];

  // ✅ normalize assets in list items (safe, does not change shape)
  return {
    ...data,
    items: items.map((x) => ({
      ...x,
      profileImageUrl: x?.profileImageUrl ? toApiAssetUrl(x.profileImageUrl) : null,
    })),
  }; // { items, take, skip }
}

/**
 * GET /api/lawyers/{id}
 */
export async function getLawyer(id) {
  const res = await api.get(`/lawyers/${id}`);
  // ✅ normalize profile image URL
  return normalizeLawyerProfile(res.data);
}

/**
 * POST /api/lawyers/inquiries
 * payload: { lawyerProfileId?, practiceAreaId?, townId?, problemSummary, preferredContactMethod? }
 */
export async function createLawyerInquiry(payload) {
  const res = await api.post("/lawyers/inquiries", payload);
  return res.data; // { id, status, createdAt }
}

/**
 * GET /api/lawyers/inquiries/mine?take&skip
 */
export async function getMyLawyerInquiries({ take = 50, skip = 0 } = {}) {
  const res = await api.get("/lawyers/inquiries/mine", { params: { take, skip } });
  return res.data; // { items, take, skip }
}

/**
 * GET /api/lawyers/inquiries/for-me?take&skip
 */
export async function getLawyerInquiriesForMe({ take = 50, skip = 0 } = {}) {
  const res = await api.get("/lawyers/inquiries/for-me", { params: { take, skip } });
  return res.data; // { items, take, skip }
}

// Lookups (for dropdowns)

// GET /api/lawyers/practice-areas?q=...
export async function lookupPracticeAreas({ q = "" } = {}) {
  const res = await api.get("/lawyers/practice-areas", { params: { q } });
  return res.data; // expected: [{ id, name }]
}

// GET /api/lawyers/towns?countryId=1&q=...
export async function lookupTowns({ countryId, q = "" } = {}) {
  const res = await api.get("/lawyers/towns", { params: { countryId, q } });
  return res.data; // expected: [{ id, name, postCode? }]
}

// GET /api/lawyers/courts?countryId=1&q=...
export async function lookupCourts({ countryId, q = "" } = {}) {
  const res = await api.get("/lawyers/courts", { params: { countryId, q } });
  return res.data; // expected: [{ id, name, code? }]
}

// GET /api/lawyers/me
export async function getMyLawyerProfile() {
  const res = await api.get("/lawyers/me");
  return res.data; // null or profile object
}

// POST /api/lawyers/me
export async function upsertMyLawyerProfile(payload) {
  const res = await api.post("/lawyers/me", payload);
  return res.data; // { message, lawyerProfileId, verificationStatus }
}

// GET /api/lawyers/services?q=...&take=...
export async function lookupServices({ q = "", take = 200 } = {}) {
  const res = await api.get("/lawyers/services", { params: { q, take } });
  return res.data; // [{id,name}]
}

/* =========================================================
   ✅ NEW: Lawyer Verification Documents (Attachments)
   Endpoints:
   - GET    /api/lawyers/me/documents
   - POST   /api/lawyers/me/documents  (multipart: file, type)
   - DELETE /api/lawyers/me/documents/{id}
========================================================= */

function normalizeLawyerDoc(d) {
  if (!d) return d;

  // backend returns urlPath
  const rawUrl =
    d.url ??
    d.fileUrl ??
    d.urlPath ?? // ✅ backend uses urlPath
    d.path ??
    d.storagePath ??
    d.downloadUrl ??
    null;

  return {
    ...d,
    url: rawUrl ? toApiAssetUrl(rawUrl) : null,
    // optional alias for UI consistency
    kind: d.kind ?? d.type ?? null, // ✅ backend uses "type" string
  };
}

export async function listMyLawyerDocuments() {
  const res = await api.get("/lawyers/me/documents");
  const list = Array.isArray(res.data) ? res.data : [];
  return list.map(normalizeLawyerDoc);
}

export async function uploadMyLawyerDocument({ file, type } = {}) {
  const fd = new FormData();
  if (file) fd.append("file", file);

  // ✅ MUST be "type" to match controller [FromForm] LawyerDocumentType type
  // ✅ MUST match enum NAME, e.g. "KenyaSchoolOfLawCertificate"
  if (type) fd.append("type", String(type));

  const res = await api.post("/lawyers/me/documents", fd);
  return normalizeLawyerDoc(res.data);
}

export async function deleteMyLawyerDocument(id) {
  // backend returns 204 NoContent
  await api.delete(`/lawyers/me/documents/${id}`);
  return true;
}