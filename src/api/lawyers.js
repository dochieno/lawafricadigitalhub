// src/api/lawyers.js
import api from "./client";

/**
 * GET /api/lawyers/search
 * Query params: countryId, townId, practiceAreaId, highestCourtAllowedId, verifiedOnly, q, take, skip
 */
export async function searchLawyers(params = {}) {
  const res = await api.get("/lawyers/search", { params });
  return res.data; // { items, take, skip }
}

/**
 * GET /api/lawyers/{id}
 */
export async function getLawyer(id) {
  const res = await api.get(`/lawyers/${id}`);
  return res.data;
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