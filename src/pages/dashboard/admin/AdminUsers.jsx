import { useEffect, useMemo, useRef, useState } from "react";
import api from "../../../api/client.js";
import "../../../styles/adminUsers.css";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtDateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function friendlyApiError(e) {
  // Abort is not an error we should show
  if (e?.name === "CanceledError" || e?.code === "ERR_CANCELED") return "";

  if (!e?.response) {
    return (
      e?.message ||
      "Network error. Check API base URL / CORS / server availability (no response received)."
    );
  }

  const status = e?.response?.status;
  const title = e?.response?.data?.title;
  const detail = e?.response?.data?.detail;

  if (title || detail) return `${title ?? "Request failed"}${detail ? ` — ${detail}` : ""}`;
  if (typeof e?.response?.data === "string" && e.response.data.trim()) return e.response.data;

  if (status === 401) return "You are not authorized. Please log in again.";
  if (status === 403) return "You don’t have permission to manage users.";
  if (status === 404) return "Endpoint not found. Check that the request is going to /api/admin/users.";
  if (status >= 500) return "Server error while loading users.";
  return "Request failed. Please try again.";
}

function Badge({ tone = "neutral", children }) {
  return <span className={`au-badge au-badge-${tone}`}>{children}</span>;
}

function Chip({ active, children, ...props }) {
  return (
    <button type="button" className={`au-chip ${active ? "active" : ""}`} {...props}>
      {children}
    </button>
  );
}

function IconBtn({ tone = "neutral", disabled, title, onClick, children }) {
  return (
    <button
      type="button"
      className={`au-iconBtn au-iconBtn-${tone}`}
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
}

function Icon({ name }) {
  switch (name) {
    case "power":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M12 2v10m6.36-7.36a9 9 0 1 1-12.72 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "ban":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M12 21a9 9 0 1 0-9-9 9 9 0 0 0 9 9Zm-6.36-6.36L18.36 5.64"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "key":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M7 14a5 5 0 1 1 4.9-6H22v4h-3v3h-3v3h-4.1A5 5 0 0 1 7 14Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "check":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M20 6 9 17l-5-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "crown":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M4 8l4 4 4-7 4 7 4-4v10H4V8Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "swap":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M16 3h5v5M21 3l-7 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M8 21H3v-5m0 5 7-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "search":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M10.5 18a7.5 7.5 0 1 1 5.3-12.8A7.5 7.5 0 0 1 10.5 18Zm6.2-1.2L22 22"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "spinner":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="au-spin">
          <path
            d="M12 2a10 10 0 1 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    default:
      return null;
  }
}

function roleTone(role) {
  const r = String(role || "").toLowerCase();
  if (r === "admin") return "success";
  return "neutral";
}

function typeTone(userType) {
  const t = String(userType || "").toLowerCase();
  if (t === "institution") return "info";
  if (t === "student") return "warn";
  if (t === "admin") return "success";
  return "neutral";
}

function membershipStatusTone(st) {
  const s = String(st || "").toLowerCase();
  if (s.includes("approved")) return "success";
  if (s.includes("pending")) return "warn";
  if (s.includes("rejected")) return "danger";
  return "neutral";
}

function parseBoolClaim(v) {
  if (v === true) return true;
  if (v === false) return false;
  const s = String(v ?? "").toLowerCase().trim();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return false;
}

/**
 * ✅ Decode JWT payload without external libs.
 * Handles base64url and returns {} on failure.
 */
function decodeJwtPayload(token) {
  try {
    if (!token || typeof token !== "string") return {};
    const parts = token.split(".");
    if (parts.length < 2) return {};
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = decodeURIComponent(
      atob(padded)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    );
    const obj = JSON.parse(json);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

/**
 * ✅ Try common storage keys + Authorization header.
 * Adapt keys if your app uses different names.
 */
function getAccessToken() {
  try {
    const candidates = [
      localStorage.getItem("token"),
      localStorage.getItem("accessToken"),
      localStorage.getItem("jwt"),
      localStorage.getItem("authToken"),
      sessionStorage.getItem("token"),
      sessionStorage.getItem("accessToken"),
      sessionStorage.getItem("jwt"),
      sessionStorage.getItem("authToken"),
    ].filter(Boolean);

    if (candidates.length) return candidates[0];

    const hdr = api?.defaults?.headers?.common?.Authorization || api?.defaults?.headers?.Authorization;
    if (hdr && typeof hdr === "string") {
      const m = hdr.match(/Bearer\s+(.+)/i);
      return m ? m[1] : hdr;
    }
    return "";
  } catch {
    return "";
  }
}

export default function AdminUsers() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [online, setOnline] = useState("all");
  const [sort, setSort] = useState("recent");

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const [data, setData] = useState({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
    summary: null,
  });

  const [toast, setToast] = useState(null);
  const [busyId, setBusyId] = useState(null);

  // ✅ Current session claims
  const [meIsGlobalAdmin, setMeIsGlobalAdmin] = useState(false);
  const [myUserId, setMyUserId] = useState(null);

  function showToast(type, text) {
    setToast({ type, text });
    window.setTimeout(() => setToast(null), 2200);
  }

  // ✅ Read token claim once on mount (and whenever storage changes via focus)
  useEffect(() => {
    const readClaims = () => {
      const token = getAccessToken();
      const payload = decodeJwtPayload(token);

      // Your backend sets "isGlobalAdmin" claim as "true"/"false"
      const isGA = parseBoolClaim(payload?.isGlobalAdmin);

      // userId claim exists too (string). Also support sub/nameid
      const uid =
        payload?.userId ??
        payload?.["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"] ??
        payload?.sub ??
        null;

      setMeIsGlobalAdmin(!!isGA);
      setMyUserId(uid ? String(uid) : null);
    };

    readClaims();
    // Refresh claims on tab focus (e.g., user logs in/out in another tab)
    const onFocus = () => readClaims();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const totalPages = useMemo(() => {
    const t = num(data.total);
    return Math.max(1, Math.ceil(t / num(data.pageSize || pageSize)));
  }, [data.total, data.pageSize, pageSize]);

  // ✅ Build params once (stable)
  const params = useMemo(() => {
    const qq = q?.trim();
    return {
      q: qq ? qq : null,
      type,
      status,
      online: online === "all" ? null : online === "true",
      page,
      pageSize,
    };
  }, [q, type, status, online, page, pageSize]);

  // ✅ Prevent storms: debounce + cancel + dedupe
  const abortRef = useRef(null);
  const debounceRef = useRef(null);
  const lastKeyRef = useRef("");
  const lastStartedAtRef = useRef(0);

  async function loadUsers(force = false) {
    const key = JSON.stringify(params);

    // Deduplicate: if same params requested within 400ms and not forced, skip
    const now = Date.now();
    if (!force && key === lastKeyRef.current && now - lastStartedAtRef.current < 400) return;

    lastKeyRef.current = key;
    lastStartedAtRef.current = now;

    // Cancel previous request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setErr("");
    setLoading(true);

    try {
      const res = await api.get("/admin/users", {
        params,
        signal: controller.signal,
      });

      setData(res.data);
    } catch (e) {
      const msg = friendlyApiError(e);
      if (msg) setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  // ✅ Single effect: debounce always
  const paramsKey = useMemo(() => JSON.stringify(params), [params]);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    debounceRef.current = window.setTimeout(() => {
      loadUsers(false);
    }, 260);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  // Reset page when filters/search change (but do NOT call load here)
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, type, status, online]);

  const items = useMemo(() => {
    const arr = Array.isArray(data.items) ? [...data.items] : [];
    if (sort === "username") {
      arr.sort((a, b) => String(a.username || "").localeCompare(String(b.username || "")));
    } else if (sort === "email") {
      arr.sort((a, b) => String(a.email || "").localeCompare(String(b.email || "")));
    }
    return arr;
  }, [data.items, sort]);

  const counts = useMemo(() => {
    const arr = Array.isArray(data.items) ? data.items : [];
    const locked = arr.filter((x) => !!x.lockoutEndAt && new Date(x.lockoutEndAt) > new Date()).length;
    const onlineNow = arr.filter((x) => x.isOnline).length;
    const pending = arr.filter((x) => !x.isApproved).length;
    return { shown: arr.length, pending, onlineNow, locked };
  }, [data.items]);

  async function setActive(userId, isActive) {
    try {
      setBusyId(userId);
      await api.put(`/admin/users/${userId}/active`, { isActive });
      showToast("success", isActive ? "Activated" : "Deactivated");
      await loadUsers(true);
    } catch (e) {
      showToast("error", friendlyApiError(e) || "Request failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function setLock(userId, locked) {
    try {
      setBusyId(userId);
      const minutes = locked ? 60 * 24 * 365 : undefined;
      await api.put(`/admin/users/${userId}/lock`, { locked, minutes });
      showToast("success", locked ? "Blocked" : "Unblocked");
      await loadUsers(true);
    } catch (e) {
      showToast("error", friendlyApiError(e) || "Request failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function reset2fa(userId) {
    try {
      setBusyId(userId);
      await api.post(`/admin/users/${userId}/regenerate-2fa`);
      showToast("success", "2FA reset sent");
    } catch (e) {
      showToast("error", friendlyApiError(e) || "Request failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function approveMembership(u) {
    const institutionId = u.institutionId;
    const membershipId = u.membershipId;

    if (!institutionId || !membershipId) {
      showToast("error", "Missing institutionId/membershipId for this user.");
      return;
    }

    try {
      setBusyId(u.id);
      await api.post(`/institutions/${institutionId}/members/${membershipId}/approve`, {
        adminNotes: "Approved from admin dashboard",
      });
      showToast("success", "Approved");
      await loadUsers(true);
    } catch (e) {
      showToast("error", friendlyApiError(e) || "Request failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function makeInstitutionAdmin(u, makeAdmin) {
    const institutionId = u.institutionId;
    const membershipId = u.membershipId;

    if (!institutionId || !membershipId) {
      showToast("error", "Missing institutionId/membershipId for this user.");
      return;
    }

    try {
      setBusyId(u.id);
      await api.post(`/institutions/${institutionId}/members/${membershipId}/change-type`, {
        memberType: makeAdmin ? 3 : 2, // InstitutionAdmin=3, Staff=2
      });
      showToast("success", makeAdmin ? "Institution Admin set" : "Institution Admin removed");
      await loadUsers(true);
    } catch (e) {
      showToast("error", friendlyApiError(e) || "Request failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function setSystemRole(u, newRole) {
    try {
      setBusyId(u.id);
      await api.post(`/admin/users/${u.id}/role`, { newRole });
      showToast("success", `Role: ${newRole}`);
      await loadUsers(true);
    } catch (e) {
      showToast("error", friendlyApiError(e) || "Request failed.");
    } finally {
      setBusyId(null);
    }
  }

  // ✅ Global Admin promote/demote (UI gated by token claim)
  async function setGlobalAdmin(u, makeGlobalAdmin) {
    if (!meIsGlobalAdmin) {
      showToast("error", "Only a Global Admin can perform this action.");
      return;
    }

    try {
      setBusyId(u.id);

      // Preferred endpoint
      try {
        await api.put(`/admin/users/${u.id}/global-admin`, { isGlobalAdmin: makeGlobalAdmin });
      } catch (e1) {
        // Fallback: role endpoint
        if (e1?.response?.status === 404 || e1?.response?.status === 405) {
          await api.post(`/admin/users/${u.id}/role`, { newRole: makeGlobalAdmin ? "GlobalAdmin" : "Admin" });
        } else {
          throw e1;
        }
      }

      showToast("success", makeGlobalAdmin ? "Global Admin granted" : "Global Admin removed");
      await loadUsers(true);
    } catch (e) {
      showToast("error", friendlyApiError(e) || "Request failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="au-wrap">
      {toast ? (
        <div className={`toast ${toast.type === "success" ? "toast-success" : "toast-error"}`}>
          {toast.text}
        </div>
      ) : null}

      <header className="au-hero">
        <div className="au-heroLeft">
          <div className="au-titleRow">
            <div className="au-titleStack">
              <div className="au-kicker">LawAfrica • Admin</div>
              <h1 className="au-title">User Management</h1>
              <div className="au-subtitle">
                Search, filter and manage users — approvals, roles, access controls, and security.
              </div>
            </div>

            <div className="au-heroRight">
              <button className="au-refresh" type="button" onClick={() => loadUsers(true)} disabled={loading}>
                {loading ? "Refreshing…" : "Refresh"}
              </button>
            </div>
          </div>

          {err ? <div className="au-error">{err}</div> : null}

          <div className="au-topbar">
            <div className="au-search">
              <span className="au-searchIcon" aria-hidden="true">
                <Icon name="search" />
              </span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search username, email, first/last name…"
                aria-label="Search users"
              />
              {q ? (
                <button className="au-clear" type="button" onClick={() => setQ("")} aria-label="Clear search">
                  ✕
                </button>
              ) : null}
            </div>

            <div className="au-topbarRight">
              <div className="au-sort">
                <label className="au-sortLabel">Sort</label>
                <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort users">
                  <option value="recent">Recent</option>
                  <option value="username">Username</option>
                  <option value="email">Email</option>
                </select>
              </div>

              <div className="au-mePill" title="Current session (from JWT claims)">
                <span className={`au-meDot ${meIsGlobalAdmin ? "ga" : ""}`} />
                <span className="au-meText">
                  {meIsGlobalAdmin ? "Global Admin session" : "Admin session"}
                </span>
              </div>
            </div>
          </div>

          <div className="au-kpis">
            <div className="au-kpiCard">
              <div className="au-kpiLabel">Shown</div>
              <div className="au-kpiValue">{counts.shown}</div>
            </div>
            <div className="au-kpiCard">
              <div className="au-kpiLabel">Pending</div>
              <div className="au-kpiValue">{counts.pending}</div>
            </div>
            <div className="au-kpiCard">
              <div className="au-kpiLabel">Online</div>
              <div className="au-kpiValue">{counts.onlineNow}</div>
            </div>
            <div className="au-kpiCard">
              <div className="au-kpiLabel">Locked</div>
              <div className="au-kpiValue">{counts.locked}</div>
            </div>
          </div>

          <div className="au-filters">
            <div className="au-filterGroup">
              <div className="au-filterLabel">Type</div>
              <div className="au-chips">
                <Chip active={type === "all"} onClick={() => setType("all")}>
                  All
                </Chip>
                <Chip active={type === "public"} onClick={() => setType("public")}>
                  Public
                </Chip>
                <Chip active={type === "institution"} onClick={() => setType("institution")}>
                  Institution
                </Chip>
              </div>
            </div>

            <div className="au-filterGroup">
              <div className="au-filterLabel">Status</div>
              <div className="au-chips">
                <Chip active={status === "all"} onClick={() => setStatus("all")}>
                  All
                </Chip>
                <Chip active={status === "active"} onClick={() => setStatus("active")}>
                  Active
                </Chip>
                <Chip active={status === "inactive"} onClick={() => setStatus("inactive")}>
                  Inactive
                </Chip>
                <Chip active={status === "locked"} onClick={() => setStatus("locked")}>
                  Locked
                </Chip>
              </div>
            </div>

            <div className="au-filterGroup">
              <div className="au-filterLabel">Presence</div>
              <div className="au-chips">
                <Chip active={online === "all"} onClick={() => setOnline("all")}>
                  All
                </Chip>
                <Chip active={online === "true"} onClick={() => setOnline("true")}>
                  Online
                </Chip>
                <Chip active={online === "false"} onClick={() => setOnline("false")}>
                  Offline
                </Chip>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="au-panel">
        <div className="au-panelTop">
          <div className="au-panelTitle">{loading ? "Loading…" : "User directory"}</div>

          <div className="au-pager">
            <button
              type="button"
              className="au-pageBtn"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={loading || page <= 1}
              title="Previous page"
            >
              ←
            </button>

            <div className="au-pageMeta">
              Page <strong>{page}</strong> / <strong>{totalPages}</strong>
            </div>

            <button
              type="button"
              className="au-pageBtn"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={loading || page >= totalPages}
              title="Next page"
            >
              →
            </button>
          </div>
        </div>

        <div className="au-tableWrap">
          <table className="au-table au-tableModern">
            <thead>
              <tr>
                <th>User</th>
                <th>Type</th>
                <th>Status</th>
                <th>Activity</th>
                <th className="au-thRight">Actions</th>
              </tr>
            </thead>

            <tbody>
              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="au-empty">
                    No users found for the current filters.
                  </td>
                </tr>
              ) : null}

              {items.map((u) => {
                const name = u.name?.trim() || u.username;
                const isLocked = !!u.lockoutEndAt && new Date(u.lockoutEndAt) > new Date();
                const isBusy = busyId === u.id;

                const isInstitutionUser = !!u.institutionId;
                const hasMembership = !!u.membershipId;

                const membershipPending = String(u.membershipStatus || "").toLowerCase().includes("pending");
                const membershipApproved = String(u.membershipStatus || "").toLowerCase().includes("approved");

                const showApprove = isInstitutionUser && hasMembership && membershipPending;
                const canToggleInstAdmin = isInstitutionUser && hasMembership && membershipApproved;

                const showPromoteAdmin = !isInstitutionUser && !u.isGlobalAdmin;

                // ✅ Global Admin action visibility (token-claim gated)
                const isSelf = myUserId && String(u.id) === String(myUserId);
                const canTouchGlobalAdmin = meIsGlobalAdmin && !isSelf;

                const showMakeGlobalAdmin = canTouchGlobalAdmin && !u.isGlobalAdmin;
                const showRemoveGlobalAdmin = canTouchGlobalAdmin && !!u.isGlobalAdmin;

                return (
                  <tr key={u.id}>
                    <td>
                      <div className="au-userCell">
                        <div className={`au-dot ${u.isOnline ? "on" : ""}`} title={u.isOnline ? "Online" : "Offline"} />
                        <div className="au-userMeta">
                          <div className="au-userName">
                            {name}{" "}
                            {u.isGlobalAdmin ? <Badge tone="success">Global Admin</Badge> : null}{" "}
                            <Badge tone={roleTone(u.role)}>{u.role}</Badge>{" "}
                            {u.isInstitutionAdmin ? <Badge tone="info">Institution Admin</Badge> : null}
                          </div>

                          <div className="au-userSub">
                            <span className="au-mono">{u.email}</span>
                            <span className="au-sep">•</span>
                            <span className="au-mono">#{u.id}</span>
                            {u.institutionName ? (
                              <>
                                <span className="au-sep">•</span>
                                <span className="au-muted">{u.institutionName}</span>
                              </>
                            ) : null}
                          </div>

                          {isInstitutionUser && hasMembership ? (
                            <div className="au-userSub au-userSub2">
                              <Badge tone={membershipStatusTone(u.membershipStatus)}>{String(u.membershipStatus)}</Badge>
                              {u.memberType ? <Badge tone="neutral">{String(u.memberType)}</Badge> : null}
                              {u.referenceNumber ? <span className="au-muted">Ref: {u.referenceNumber}</span> : null}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>

                    <td>
                      <Badge tone={typeTone(u.userType)}>{String(u.userType)}</Badge>
                    </td>

                    <td>
                      <div className="au-badges au-badgesWrap">
                        <Badge tone={u.isActive ? "success" : "danger"}>{u.isActive ? "Active" : "Inactive"}</Badge>
                        {isLocked ? <Badge tone="warn">Locked</Badge> : <Badge tone="neutral">Normal</Badge>}
                        {!u.isEmailVerified ? (
                          <Badge tone="danger">Email unverified</Badge>
                        ) : (
                          <Badge tone="neutral">Email ok</Badge>
                        )}
                        {u.isApproved ? <Badge tone="success">Approved</Badge> : <Badge tone="warn">Pending</Badge>}
                      </div>
                    </td>

                    <td>
                      <div className="au-lastSeen">
                        <div className="au-lastSeenMain">{fmtDateTime(u.lastSeenAtUtc)}</div>
                        <div className="au-muted">Login: {u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "—"}</div>
                      </div>
                    </td>

                    <td className="au-tdRight">
                      <div className="au-actionsRow">
                        {showApprove ? (
                          <IconBtn tone="success" disabled={isBusy} title="Approve membership" onClick={() => approveMembership(u)}>
                            {isBusy ? <Icon name="spinner" /> : <Icon name="check" />}
                          </IconBtn>
                        ) : null}

                        {canToggleInstAdmin ? (
                          <IconBtn
                            tone={u.isInstitutionAdmin ? "neutral" : "info"}
                            disabled={isBusy}
                            title={u.isInstitutionAdmin ? "Remove Institution Admin (set to Staff)" : "Make Institution Admin"}
                            onClick={() => makeInstitutionAdmin(u, !u.isInstitutionAdmin)}
                          >
                            {isBusy ? <Icon name="spinner" /> : <Icon name="crown" />}
                          </IconBtn>
                        ) : null}

                        {showMakeGlobalAdmin ? (
                          <IconBtn tone="success" disabled={isBusy} title="Make Global Admin" onClick={() => setGlobalAdmin(u, true)}>
                            {isBusy ? <Icon name="spinner" /> : <Icon name="crown" />}
                          </IconBtn>
                        ) : null}

                        {showRemoveGlobalAdmin ? (
                          <IconBtn tone="danger" disabled={isBusy} title="Remove Global Admin" onClick={() => setGlobalAdmin(u, false)}>
                            {isBusy ? <Icon name="spinner" /> : <Icon name="crown" />}
                          </IconBtn>
                        ) : null}

                        {showPromoteAdmin ? (
                          <IconBtn
                            tone={String(u.role || "").toLowerCase() === "admin" ? "neutral" : "success"}
                            disabled={isBusy}
                            title={String(u.role || "").toLowerCase() === "admin" ? "Demote to User" : "Promote to Admin"}
                            onClick={() =>
                              setSystemRole(u, String(u.role || "").toLowerCase() === "admin" ? "User" : "Admin")
                            }
                          >
                            {isBusy ? <Icon name="spinner" /> : <Icon name="swap" />}
                          </IconBtn>
                        ) : null}

                        <IconBtn
                          tone={u.isActive ? "neutral" : "success"}
                          disabled={isBusy}
                          title={u.isActive ? "Deactivate user" : "Activate user"}
                          onClick={() => setActive(u.id, !u.isActive)}
                        >
                          {isBusy ? <Icon name="spinner" /> : <Icon name="power" />}
                        </IconBtn>

                        <IconBtn
                          tone={isLocked ? "neutral" : "danger"}
                          disabled={isBusy}
                          title={isLocked ? "Unblock sign-in" : "Block sign-in"}
                          onClick={() => setLock(u.id, !isLocked)}
                        >
                          <Icon name="ban" />
                        </IconBtn>

                        <IconBtn tone="neutral" disabled={isBusy} title="Reset 2FA" onClick={() => reset2fa(u.id)}>
                          {isBusy ? <Icon name="spinner" /> : <Icon name="key" />}
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="au-panelBottom">
          <div className="au-muted">Locked blocks sign-in even if a user is Active.</div>
          <div className="au-muted">Online = last seen within 5 minutes.</div>
        </div>
      </section>
    </div>
  );
}
