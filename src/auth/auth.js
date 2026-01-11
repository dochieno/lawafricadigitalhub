// src/auth/auth.js
const TOKEN_KEY = "token";

/* =========================
   Token storage
========================= */
export function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function logout() {
  clearToken();
}

export function isAuthed() {
  return !!getToken();
}

/* =========================
   JWT decode helpers
========================= */
export function decodeJwt(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = parts[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "===".slice((base64.length + 3) % 4);
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Converts common "boolean-like" values into real booleans:
 * true/false, "true"/"false", "1"/"0", 1/0, "yes"/"no"
 */
function toBool(v) {
  if (v === true || v === false) return v;

  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes" || s === "y") return true;
    if (s === "false" || s === "0" || s === "no" || s === "n") return false;
  }

  if (typeof v === "number") {
    if (v === 1) return true;
    if (v === 0) return false;
  }

  return false;
}

export function isTokenExpired() {
  const token = getToken();
  if (!token) return true;

  const payload = decodeJwt(token);
  if (!payload || !payload.exp) return false;

  const nowSec = Math.floor(Date.now() / 1000);
  return payload.exp <= nowSec;
}

/* =========================
   Claims extraction
========================= */
export function getAuthClaims() {
  const token = getToken();
  const payload = token ? decodeJwt(token) : null;
  if (!payload) return null;

  // Role can come in many shapes depending on issuer / framework
  const role =
    payload.role ||
    payload.Role ||
    payload["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"] ||
    payload["role"] ||
    null;

  // institutionId sometimes comes as "", null, undefined
  const institutionIdRaw =
    payload.institutionId ??
    payload.InstitutionId ??
    payload["institutionId"] ??
    payload["InstitutionId"] ??
    null;

  const institutionId =
    institutionIdRaw === "" || institutionIdRaw == null ? null : Number(institutionIdRaw);

  // Backend sends "isGlobalAdmin" as a STRING: "true"/"false"
  const isGlobalAdminClaim =
    payload.isGlobalAdmin ??
    payload.IsGlobalAdmin ??
    payload["isGlobalAdmin"] ??
    payload["IsGlobalAdmin"];

  const isGlobalAdmin = toBool(isGlobalAdminClaim);

  // Useful user id (optional)
  const userIdRaw =
    payload.userId ??
    payload["userId"] ??
    payload.sub ??
    payload["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"] ??
    payload["http://schemas.microsoft.com/ws/2008/06/identity/claims/nameidentifier"];

  const userId = userIdRaw == null || userIdRaw === "" ? null : Number(userIdRaw);

  // ✅ NEW: membership-based institution admin flags (comes from backend claims)
  const isInstitutionAdminClaim =
    payload.isInstitutionAdmin ??
    payload.IsInstitutionAdmin ??
    payload["isInstitutionAdmin"] ??
    payload["IsInstitutionAdmin"];

  const isInstitutionAdmin = toBool(isInstitutionAdminClaim);

  const institutionRole =
    payload.institutionRole ??
    payload.InstitutionRole ??
    payload["institutionRole"] ??
    payload["InstitutionRole"] ??
    null;

  return {
    payload,
    role,
    institutionId,
    isGlobalAdmin,
    userId,

    // ✅ expose safely for UI usage
    isInstitutionAdmin,
    institutionRole,
  };
}

/* =========================
   Role helpers
========================= */

/** ✅ Admin role access (includes Admin, and also Global Admin flag users) */
export function isAdminRole() {
  const c = getAuthClaims();
  if (!c) return false;

  return c.role === "Admin" || c.role === "GlobalAdmin" || c.isGlobalAdmin === true;
}

/** ✅ True Global Admin only (policy-backed via isGlobalAdmin claim) */
export function isGlobalAdmin() {
  const c = getAuthClaims();
  return !!c?.isGlobalAdmin;
}

/** ✅ Institution Admin (Option A: membership-based) + must have institutionId */
export function isInstitutionAdminWithInstitution() {
  const c = getAuthClaims();
  if (!c) return false;

  const instAdmin =
    c.role === "InstitutionAdmin" ||
    c.isInstitutionAdmin === true ||
    c.institutionRole === "InstitutionAdmin";

  return !!(instAdmin && c.institutionId && c.institutionId > 0);
}

/**
 * ✅ Approvals nav should be visible to:
 * - Admin (and Global Admin)
 * - InstitutionAdmin (with institutionId)
 */
export function canSeeApprovals() {
  const c = getAuthClaims();
  if (!c) return false;

  const role = (c.role || "").toString().toLowerCase();
  const userType = (c.payload?.userType || "").toString().toLowerCase();

  const isAdmin = role === "admin" || userType === "admin" || c.isGlobalAdmin === true;

  const instAdmin =
    c.role === "InstitutionAdmin" ||
    c.isInstitutionAdmin === true ||
    c.institutionRole === "InstitutionAdmin";

  return isAdmin || (instAdmin && !!c.institutionId);
}
