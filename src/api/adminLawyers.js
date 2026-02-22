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
