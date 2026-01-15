// src/auth/auth.js
const TOKEN_KEY = "token";

/**
 * Pages where we MUST NOT auto-hydrate an existing session (token),
 * because they are part of an anonymous/public flow.
 *
 * This prevents "token bleed" (e.g., global admin token taking over
 * the Paystack signup return and redirecting you to dashboard).
 */
const AUTH_BLOCK_PATHS = [
  "/register",
  "/payments/paystack/return",
  "/paystack/return",
  "/twofactor-setup", // optional but helps avoid weirdness after return
];

/**
 * Optional “hard” suspension flags (not required for the fix to work),
 * but useful if you decide to temporarily clear token before Paystack redirect.
 */
const AUTH_SUSPEND_KEY = "la_auth_suspended";
const AUTH_PREV_TOKEN_KEY = "la_prev_token";

/* =========================
   Internal helpers
========================= */
function safeWindowLocation() {
  try {
    if (typeof window === "undefined") return null;
    return window.location;
  } catch {
    return null;
  }
}

function normalizePath(p) {
  return String(p || "").trim().toLowerCase();
}

/**
 * Returns true if current browser URL indicates we are in an
 * anonymous/public flow and should ignore any existing token.
 */
function shouldBlockTokenForCurrentPage() {
  const loc = safeWindowLocation();
  if (!loc) return false;

  const path = normalizePath(loc.pathname);
  const search = String(loc.search || "");

  // 1) Block on specific paths
  if (AUTH_BLOCK_PATHS.some((p) => path === normalizePath(p))) return true;

  // 2) Block on /register?paid=1 flows (Paystack signup finalize)
  //    This is the biggest one that causes “logged-in admin takes over”.
  if (path === "/register") {
    try {
      const qs = new URLSearchParams(search);
      const paid = (qs.get("paid") || "").trim();
      if (paid === "1") return true;
    } catch {
      // ignore
    }
  }

  return false;
}

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

/* =========================
   Token storage
========================= */
export function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

/**
 * ✅ IMPORTANT CHANGE:
 * getToken() now returns null on public-flow pages like:
 * - /register?paid=1
 * - /payments/paystack/return
 *
 * This prevents existing admin tokens from hijacking the signup flow.
 */
export function getToken() {
  // If auth is explicitly suspended, act as anonymous
  const suspended = localStorage.getItem(AUTH_SUSPEND_KEY);
  if (suspended === "1") return null;

  // If current page is a public-flow page, ignore any existing token
  if (shouldBlockTokenForCurrentPage()) return null;

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
   Optional: suspend/restore auth (not required)
========================= */

/**
 * Suspends auth for the current browser until you call resumeAuth().
 * Useful if you want to clear a logged-in token before starting Paystack signup.
 */
export function suspendAuth() {
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    if (t) localStorage.setItem(AUTH_PREV_TOKEN_KEY, t);
    localStorage.setItem(AUTH_SUSPEND_KEY, "1");
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

/**
 * Restores auth if it was suspended.
 */
export function resumeAuth() {
  try {
    const prev = localStorage.getItem(AUTH_PREV_TOKEN_KEY);
    if (prev) localStorage.setItem(TOKEN_KEY, prev);
    localStorage.removeItem(AUTH_PREV_TOKEN_KEY);
    localStorage.removeItem(AUTH_SUSPEND_KEY);
  } catch {
    // ignore
  }
}

export function isAuthSuspended() {
  try {
    return localStorage.getItem(AUTH_SUSPEND_KEY) === "1";
  } catch {
    return false;
  }
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

  const role =
    payload.role ||
    payload.Role ||
    payload["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"] ||
    payload["role"] ||
    null;

  const institutionIdRaw =
    payload.institutionId ??
    payload.InstitutionId ??
    payload["institutionId"] ??
    payload["InstitutionId"] ??
    null;

  const institutionId =
    institutionIdRaw === "" || institutionIdRaw == null ? null : Number(institutionIdRaw);

  const isGlobalAdminClaim =
    payload.isGlobalAdmin ??
    payload.IsGlobalAdmin ??
    payload["isGlobalAdmin"] ??
    payload["IsGlobalAdmin"];

  const isGlobalAdmin = toBool(isGlobalAdminClaim);

  const userIdRaw =
    payload.userId ??
    payload["userId"] ??
    payload.sub ??
    payload["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"] ??
    payload["http://schemas.microsoft.com/ws/2008/06/identity/claims/nameidentifier"];

  const userId = userIdRaw == null || userIdRaw === "" ? null : Number(userIdRaw);

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
    isInstitutionAdmin,
    institutionRole,
  };
}

/* =========================
   Role helpers
========================= */
export function isAdminRole() {
  const c = getAuthClaims();
  if (!c) return false;

  return c.role === "Admin" || c.role === "GlobalAdmin" || c.isGlobalAdmin === true;
}

export function isGlobalAdmin() {
  const c = getAuthClaims();
  return !!c?.isGlobalAdmin;
}

export function isInstitutionAdminWithInstitution() {
  const c = getAuthClaims();
  if (!c) return false;

  const instAdmin =
    c.role === "InstitutionAdmin" ||
    c.isInstitutionAdmin === true ||
    c.institutionRole === "InstitutionAdmin";

  return !!(instAdmin && c.institutionId && c.institutionId > 0);
}

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
