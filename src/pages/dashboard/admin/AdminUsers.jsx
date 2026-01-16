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
    case "shield":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M12 2 20 6v6c0 5-3.4 9.4-8 10-4.6-.6-8-5-8-10V6l8-4Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
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
    case "userPlus":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path
            d="M20 8v6m-3-3h6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
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

export default function AdminUsers() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [online, setOnline] = useState("all");

  const [sort, setSort] = useState("recent"); // recent | username | email
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const [data, setData] = useState({ items: [], total: 0, page: 1, pageSize: 20, summary: null });

  const [toast, setToast] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const totalPages = useMemo(() => {
    const t = num(data.total);
    return Math.max(1, Math.ceil(t / num(data.pageSize || pageSize)));
  }, [data.total, data.pageSize, pageSize]);

  function showToast(type, text) {
    setToast({ type, text });
    window.setTimeout(() => setToast(null), 2200);
  }

  const loadSeq = useRef(0);

  async function load() {
    setErr("");
    setLoading(true);
    const seq = ++loadSeq.current;

    try {
      const res = await api.get("/admin/users", {
        params: {
          q: q?.trim() || null,
          type,
          status,
          online: online === "all" ? null : online === "true",
          page,
          pageSize,
        },
      });

      if (seq !== loadSeq.current) return;
      setData(res.data);
    } catch (e) {
      console.error(e);
      setErr(friendlyApiError(e));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }

  // reset page on filter changes
  useEffect(() => {
    const t = window.setTimeout(() => setPage(1), 200);
    return () => window.clearTimeout(t);
  }, [q, type, status, online]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, type, status, online]);

  useEffect(() => {
    const t = window.setTimeout(load, 260);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const items = useMemo(() => {
    const arr = Array.isArray(data.items) ? [...data.items] : [];
    const key = sort;

    if (key === "username") {
      arr.sort((a, b) => String(a.username || "").localeCompare(String(b.username || "")));
    } else if (key === "email") {
      arr.sort((a, b) => String(a.email || "").localeCompare(String(b.email || "")));
    } else {
      // recent: keep server order (already most recent)
    }
    return arr;
  }, [data.items, sort]);

  const counts = useMemo(() => {
    const arr = Array.isArray(data.items) ? data.items : [];
    const active = arr.filter((x) => x.isActive).length;
    const locked = arr.filter((x) => !!x.lockoutEndAt && new Date(x.lockoutEndAt) > new Date()).length;
    const onlineNow = arr.filter((x) => x.isOnline).length;
    const pending = arr.filter((x) => !x.isApproved).length;
    return { active, locked, onlineNow, pending, shown: arr.length };
  }, [data.items]);

  async function setActive(userId, isActive) {
    try {
      setBusyId(userId);
      await api.put(`/admin/users/${userId}/active`, { isActive });
      showToast("success", isActive ? "Activated" : "Deactivated");
      await load();
    } catch (e) {
      console.error(e);
      showToast("error", friendlyApiError(e));
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
      await load();
    } catch (e) {
      console.error(e);
      showToast("error", friendlyApiError(e));
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
      console.error(e);
      showToast("error", friendlyApiError(e));
    } finally {
      setBusyId(null);
    }
  }

  // ✅ Institution approval uses your existing membership endpoint
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
        adminNotes: "Approved from global admin dashboard",
      });
      showToast("success", "Approved");
      await load();
    } catch (e) {
      console.error(e);
      showToast("error", friendlyApiError(e));
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
      await load();
    } catch (e) {
      console.error(e);
      showToast("error", friendlyApiError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function setSystemRole(u, newRole) {
    try {
      setBusyId(u.id);
      await api.post(`/admin/users/${u.id}/role`, { newRole });
      showToast("success", `Role: ${newRole}`);
      await load();
    } catch (e) {
      console.error(e);
      showToast("error", friendlyApiError(e));
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

      <header className="au-hero au-heroTight">
        <div className="au-heroLeft">
          <div className="au-titleRow">
            <h1 className="au-title">Users</h1>
            <span className="au-subBadge">Admin Console</span>
          </div>

          <div className="au-subtitle au-subtitleTight">
            Search, filter and manage users. Actions are compact and always in a single row.
          </div>

          {err ? <div className="au-error">{err}</div> : null}

          <div className="au-toolbar au-toolbarTight">
            <div className="au-search">
              <span className="au-searchIcon">⌕</span>
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

            <div className="au-toolbarRight">
              <div className="au-sort">
                <label className="au-sortLabel">Sort</label>
                <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort users">
                  <option value="recent">Recent</option>
                  <option value="username">Username</option>
                  <option value="email">Email</option>
                </select>
              </div>

              <button className="au-refresh au-refreshSmall" type="button" onClick={load} disabled={loading}>
                {loading ? "…" : "Refresh"}
              </button>
            </div>
          </div>

          <div className="au-kpisInline">
            <div className="au-kpiMini">
              <div className="au-kpiMiniLabel">Shown</div>
              <div className="au-kpiMiniValue">{counts.shown}</div>
            </div>
            <div className="au-kpiMini">
              <div className="au-kpiMiniLabel">Pending</div>
              <div className="au-kpiMiniValue">{counts.pending}</div>
            </div>
            <div className="au-kpiMini">
              <div className="au-kpiMiniLabel">Online</div>
              <div className="au-kpiMiniValue">{counts.onlineNow}</div>
            </div>
            <div className="au-kpiMini">
              <div className="au-kpiMiniLabel">Locked</div>
              <div className="au-kpiMiniValue">{counts.locked}</div>
            </div>
          </div>

          <div className="au-filters au-filtersTight">
            <div className="au-filterGroup">
              <div className="au-filterLabel">Type</div>
              <div className="au-chips">
                <Chip active={type === "all"} onClick={() => { setType("all"); setPage(1); }}>
                  All
                </Chip>
                <Chip active={type === "public"} onClick={() => { setType("public"); setPage(1); }}>
                  Public
                </Chip>
                <Chip active={type === "institution"} onClick={() => { setType("institution"); setPage(1); }}>
                  Institution
                </Chip>
              </div>
            </div>

            <div className="au-filterGroup">
              <div className="au-filterLabel">Status</div>
              <div className="au-chips">
                <Chip active={status === "all"} onClick={() => { setStatus("all"); setPage(1); }}>
                  All
                </Chip>
                <Chip active={status === "active"} onClick={() => { setStatus("active"); setPage(1); }}>
                  Active
                </Chip>
                <Chip active={status === "inactive"} onClick={() => { setStatus("inactive"); setPage(1); }}>
                  Inactive
                </Chip>
                <Chip active={status === "locked"} onClick={() => { setStatus("locked"); setPage(1); }}>
                  Locked
                </Chip>
              </div>
            </div>

            <div className="au-filterGroup">
              <div className="au-filterLabel">Presence</div>
              <div className="au-chips">
                <Chip active={online === "all"} onClick={() => { setOnline("all"); setPage(1); }}>
                  All
                </Chip>
                <Chip active={online === "true"} onClick={() => { setOnline("true"); setPage(1); }}>
                  Online
                </Chip>
                <Chip active={online === "false"} onClick={() => { setOnline("false"); setPage(1); }}>
                  Offline
                </Chip>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="au-panel au-panelTight">
        <div className="au-panelTop">
          <div className="au-panelTitle">{loading ? "Loading…" : "User directory"}</div>

          <div className="au-pager">
            <button
              type="button"
              className="au-pageBtn"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={loading || page <= 1}
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

                const membershipPending =
                  String(u.membershipStatus || "").toLowerCase().includes("pending");
                const membershipApproved =
                  String(u.membershipStatus || "").toLowerCase().includes("approved");

                // Approve logic:
                // - For institution users: only if membership is pending and we have membershipId
                // - For public users: "approve" usually handled by payment; we don't show approve here
                const showApprove = isInstitutionUser && hasMembership && membershipPending;

                const canMakeInstAdmin =
                  isInstitutionUser && hasMembership && membershipApproved;

                const showPromote =
                  !isInstitutionUser && !u.isGlobalAdmin; // public users only

                return (
                  <tr key={u.id}>
                    <td>
                      <div className="au-userCell">
                        <div
                          className={`au-dot ${u.isOnline ? "on" : ""}`}
                          title={u.isOnline ? "Online" : "Offline"}
                        />
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
                              <Badge tone={membershipStatusTone(u.membershipStatus)}>
                                {String(u.membershipStatus)}
                              </Badge>
                              {u.memberType ? <Badge tone="neutral">{String(u.memberType)}</Badge> : null}
                              {u.referenceNumber ? (
                                <span className="au-muted">Ref: {u.referenceNumber}</span>
                              ) : null}
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
                        <Badge tone={u.isActive ? "success" : "danger"}>
                          {u.isActive ? "Active" : "Inactive"}
                        </Badge>
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
                      <div className="au-lastSeen au-lastSeenTight">
                        <div className="au-lastSeenMain">{fmtDateTime(u.lastSeenAtUtc)}</div>
                        <div className="au-muted">Login: {u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "—"}</div>
                      </div>
                    </td>

                    <td className="au-tdRight">
                      {/* ✅ Actions always one row */}
                      <div className="au-actionsRow">
                        {showApprove ? (
                          <IconBtn
                            tone="success"
                            disabled={isBusy}
                            title="Approve membership (seat-safe)"
                            onClick={() => approveMembership(u)}
                          >
                            {isBusy ? <Icon name="spinner" /> : <Icon name="check" />}
                          </IconBtn>
                        ) : null}

                        {canMakeInstAdmin ? (
                          <IconBtn
                            tone={u.isInstitutionAdmin ? "neutral" : "info"}
                            disabled={isBusy}
                            title={u.isInstitutionAdmin ? "Remove Institution Admin (set to Staff)" : "Make Institution Admin"}
                            onClick={() => makeInstitutionAdmin(u, !u.isInstitutionAdmin)}
                          >
                            {isBusy ? <Icon name="spinner" /> : <Icon name="crown" />}
                          </IconBtn>
                        ) : null}

                        {showPromote ? (
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

                        <IconBtn
                          tone="neutral"
                          disabled={isBusy}
                          title="Reset 2FA (email new setup)"
                          onClick={() => reset2fa(u.id)}
                        >
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

        <div className="au-panelBottom au-panelBottomTight">
          <div className="au-muted">Locked blocks sign-in even if a user is Active.</div>
          <div className="au-muted">Online = last seen within 5 minutes.</div>
        </div>
      </section>
    </div>
  );
}
