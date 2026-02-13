import api from "./client";

function unwrap(res) {
  const d = res?.data;
  return d?.data ?? d;
}

export async function adminListCourts({ countryId, q, includeInactive } = {}) {
  const params = {};
  if (countryId) params.countryId = countryId;
  if (q) params.q = q;
  if (includeInactive) params.includeInactive = true;

  const res = await api.get("/courts", { params });
  return unwrap(res);
}

export async function getCourt(id) {
  const res = await api.get(`/courts/${id}`);
  return unwrap(res);
}

export async function createCourt(payload) {
  const res = await api.post("/courts", payload);
  return unwrap(res);
}

export async function updateCourt(id, payload) {
  const res = await api.put(`/courts/${id}`, payload);
  return unwrap(res);
}

export async function deleteCourt(id) {
  const res = await api.delete(`/courts/${id}`);
  return unwrap(res);
}
