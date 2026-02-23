import api from "./client";

// --------------------
// Practice Areas (Admin)
// --------------------
export async function adminListPracticeAreas({ q = "", includeInactive = false, take = 500 } = {}) {
  const res = await api.get("/admin/lawyers/practice-areas", { params: { q, includeInactive, take } });
  return res.data; // [{id,name,slug,isActive}]
}

export async function adminCreatePracticeArea(payload) {
  const res = await api.post("/admin/lawyers/practice-areas", payload);
  return res.data;
}

export async function adminUpdatePracticeArea(id, payload) {
  const res = await api.put(`/admin/lawyers/practice-areas/${id}`, payload);
  return res.data;
}

export async function adminDisablePracticeArea(id) {
  const res = await api.delete(`/admin/lawyers/practice-areas/${id}`);
  return res.data;
}

// --------------------
// Services (Admin)
// --------------------
export async function adminListLawyerServices({ q = "", includeInactive = false, take = 500 } = {}) {
  const res = await api.get("/admin/lawyers/services", { params: { q, includeInactive, take } });
  return res.data; // [{id,name,slug,sortOrder,isActive}]
}

export async function adminCreateLawyerService(payload) {
  const res = await api.post("/admin/lawyers/services", payload);
  return res.data;
}

export async function adminUpdateLawyerService(id, payload) {
  const res = await api.put(`/admin/lawyers/services/${id}`, payload);
  return res.data;
}

export async function adminDisableLawyerService(id) {
  const res = await api.delete(`/admin/lawyers/services/${id}`);
  return res.data;
}
// ====================
// Lawyer Profiles (Admin verification)
// ====================

/**
 * GET /api/admin/lawyers/profiles?q=&status=&take=&skip=
 * returns: { total, take, skip, items: [...] }
 */
export async function adminListLawyerProfiles({ q = "", status = "", take = 50, skip = 0 } = {}) {
  const res = await api.get("/admin/lawyers/profiles", { params: { q, status, take, skip } });
  return res.data;
}

/**
 * GET /api/admin/lawyers/profiles/{id}
 * returns: profile detail + documents
 */
export async function adminGetLawyerProfile(profileId) {
  const res = await api.get(`/admin/lawyers/profiles/${profileId}`);
  return res.data;
}

/**
 * POST /api/admin/lawyers/profiles/{id}/verify
 * body: { action: "verify"|"reject"|"suspend", reason? }
 */
export async function adminVerifyLawyerProfile(profileId, { action = "verify", reason = "" } = {}) {
  const res = await api.post(`/admin/lawyers/profiles/${profileId}/verify`, {
    action,
    reason: reason?.trim() || null,
  });
  return res.data;
}