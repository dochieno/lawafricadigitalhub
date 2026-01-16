import { useEffect, useMemo, useRef, useState } from "react";
import api from "../../../api/client";
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
  const status = e?.response?.status;
  const title = e?.response?.data?.title;
  const detail = e?.response?.data?.detail;

  if (title || detail) return `${title ?? "Request failed"}${detail ? ` — ${detail}` : ""}`;

  if (typeof e?.response?.data === "string" && e.response.data.trim()) return e.response.data;

  if (status === 401) return "You are not authorized. Please log in again.";
  if (status === 403) return "You don’t have permission to manage users.";
  if (status >= 500) return "Server error while loading users.";
  return "Request failed. Please try again.";
}

function Badge({ tone = "neutral", children }) {
  return <span className={`au-badge au-badge-${tone}`}>{children}</span>;
}

function PillButton({ active, children, ...props }) {
  return (
    <button type="button" className={`au-chip ${active ? "active" : ""}`} {...props}>
      {children}
    </button>
  );
}

/** Icon button (compact) */
function IconBtn({ tone = "neutral", disabled, title, label, onClick, children }) {
  return (
    <button
      type="button"
      className={`au-iconBtn au-iconBtn-${tone}`}
      disabled={disabled}
      onClick={onClick}
      title={title}
      data-tip={title}
      aria-label={title}
    >
      {children}
      {label ? <span className="au-iconBtnLabel">{label}</span> : null}
    </button>
  );
}

/** Minimal inline icons (no deps) */
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

// ✅ NEW: map UI filter values -> backend expected query values
function mapTypeParam(type) {
  if (type === "all") return undefined;
  if (type === "public") return "Public";
  if (type === "institution") return "Institution";
  return undefined;
}

function mapStatusParam(status) {
  if (status === "all") return undefined;
  if (status === "active") return "Active";
  if (status === "inactive") return "Inactive";
  if (status === "locked") return "Locked";
  return undefined;
}

// ✅ NEW: normalize response shape
function normalizeUsersResponse(res, fallbackPageSize = 20) {
  const raw = res?.data?.data ?? res?.data ?? {};
  const items = raw.items ?? raw.Items ?? raw.data ?? raw.Data ?? [];
  const total = raw.total ?? raw.Total ?? num(items?.length);
  const page = raw.page ?? raw.Page ?? 1;
  const pageSize = raw.pageSize ?? raw.PageSize ?? fallbackPageSize;

  return {
    items: Array.isArray(items) ? items : [],
    total: num(total),
    page: num(page) || 1,
    pageSize: num(pageSize) || fallbackPageSize,
  };
}

export default function AdminUsers() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [online, setOnline] = useState("all");

  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const [data, setData] = useState({ items: [], total: 0, page: 1, pageSize: 20 });

  const [toast, setToast] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const totalPages = useMemo(() => {
    const t = num(data.total);
    return Math.max(1, Math.ceil(t / num(data.pageSize || pageSize)));
  }, [data.total, data.pageSize, pageSize]);

  function showToast(type, text) {
    setToast({ type, text });
    window.setTimeout(() => setToast(null), 2400);
  }

  // prevent overlapping loads when fast typing (optional, safe)
  const loadSeq = useRef(0);

  async function load() {
    setErr("");
    setLoading(true);

    const seq = ++loadSeq.current;

    try {
      const res = await api.get("/admin/users", {
        params: {
          q: q?.trim() || undefined,
          type: mapTypeParam(type),
          status: mapStatusParam(status),
          online: online === "all" ? undefined : online === "true",
          page,
          pageSize,
        },
      });

      // ignore stale results
      if (seq !== loadSeq.current) return;

      setData(normalizeUsersResponse(res, pageSize));
    } catch (e) {
      console.error(e);
      setErr(friendlyApiError(e));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }

  useEffect(() => {
    const t = window.setTimeout(() => {
      setPage(1);
    }, 250);
    return () => window.clearTimeout(t);
  }, [q, type, status, online]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, type, status, online]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      load();
    }, 280);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const counts = useMemo(() => {
    const items = Array.isArray(data.items) ? data.items : [];
    const active = items.filter((x) => x.isActive).length;
    const locked = items.filter((x) => !!x.lockoutEndAt && new Date(x.lockoutEndAt) > new Date()).length;
    const onlineNow = items.filter((x) => x.isOnline).length;
    return { active, locked, onlineNow, shown: items.length };
  }, [data.items]);

  async function setActive(userId, isActive) {
    try {
      setBusyId(userId);
      await api.put(`/admin/users/${userId}/active`, { isActive });
      showToast("success", isActive ? "User activated." : "User deactivated.");
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
      showToast("success", locked ? "Sign-in blocked." : "User unblocked.");
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
      showToast("success", "2FA reset email sent.");
    } catch (e) {
      console.error(e);
      showToast("error", friendlyApiError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function approveUser(userId, makeInstitutionAdmin = true) {
    try {
      setBusyId(userId);

      await api.post(`/admin/users/${userId}/approve`, {
        makeInstitutionAdmin: !!makeInstitutionAdmin,
      });

      showToast("success", makeInstitutionAdmin ? "User approved + set as Institution Admin." : "User approved.");
      await load();
    } catch (e) {
      console.error(e);
      showToast("error", friendlyApiError(e));
    } finally {
      setBusyId(null);
    }
  }

  function roleTone(role) {
    const r = String(role || "").toLowerCase();
    if (r === "admin") return "success";
    return "neutral";
  }

  function typeTone(userType) {
    const t = String(userType || "").toLowerCase();
    if (t === "admin") return "success";
    if (t === "institution") return "info";
    if (t === "student") return "warn";
    return "neutral";
  }

  return (
    <div className="au-wrap">
      {toast ? (
        <div className={`toast ${toast.type === "success" ? "toast-success" : "toast-error"}`}>{toast.text}</div>
      ) : null}

      <header className="au-hero">
        <div className="au-heroLeft">
          <div className="au-titleRow">
            <h1 className="au-title">Users</h1>
            <span className="au-subBadge">Admin Console</span>
          </div>

          <p className="au-subtitle">
            Manage user access: approve users, activate/deactivate, block sign-in, reset 2FA, and monitor presence.
          </p>

          {err ? <div className="au-error">{err}</div> : null}

          <div className="au-toolbar">
            <div className="au-search">
              <span className="au-searchIcon">⌕</span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by username, email, first/last name…"
                aria-label="Search users"
              />
              {q ? (
                <button className="au-clear" type="button" onClick={() => setQ("")} aria-label="Clear search">
                  ✕
                </button>
              ) : null}
            </div>

            <button className="au-refresh" type="button" onClick={load} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <div className="au-filters">
            <div className="au-filterGroup">
              <div className="au-filterLabel">
                Type <span className="au-filterHint">Public vs Institution</span>
              </div>

              <div className="au-chips">
                <PillButton
                  active={type === "all"}
                  onClick={() => {
                    setType("all");
                    setPage(1);
                  }}
                >
                  All
                </PillButton>
                <PillButton
                  active={type === "public"}
                  onClick={() => {
                    setType("public");
                    setPage(1);
                  }}
                >
                  Public
                </PillButton>
                <PillButton
                  active={type === "institution"}
                  onClick={() => {
                    setType("institution");
                    setPage(1);
                  }}
                >
                  Institution
                </PillButton>
              </div>
            </div>

            <div className="au-filterGroup">
              <div className="au-filterLabel">Status</div>
              <div className="au-chips">
                <PillButton
                  active={status === "all"}
                  onClick={() => {
                    setStatus("all");
                    setPage(1);
                  }}
                >
                  All
                </PillButton>
                <PillButton
                  active={status === "active"}
                  onClick={() => {
                    setStatus("active");
                    setPage(1);
                  }}
                >
                  Active
                </PillButton>
                <PillButton
                  active={status === "inactive"}
                  onClick={() => {
                    setStatus("inactive");
                    setPage(1);
                  }}
                >
                  Inactive
                </PillButton>
                <PillButton
                  active={status === "locked"}
                  onClick={() => {
                    setStatus("locked");
                    setPage(1);
                  }}
                >
                  Locked
                </PillButton>
              </div>
            </div>

            <div className="au-filterGroup">
              <div className="au-filterLabel">Presence</div>
              <div className="au-chips">
                <PillButton
                  active={online === "all"}
                  onClick={() => {
                    setOnline("all");
                    setPage(1);
                  }}
                >
                  All
                </PillButton>
                <PillButton
                  active={online === "true"}
                  onClick={() => {
                    setOnline("true");
                    setPage(1);
                  }}
                >
                  Online
                </PillButton>
                <PillButton
                  active={online === "false"}
                  onClick={() => {
                    setOnline("false");
                    setPage(1);
                  }}
                >
                  Offline
                </PillButton>
              </div>
            </div>
          </div>
        </div>

        <aside className="au-heroRight">
          <div className="au-kpi">
            <div className="au-kpiLabel">Shown</div>
            <div className="au-kpiValue">{counts.shown}</div>
            <div className="au-kpiHint">of {num(data.total).toLocaleString()} total</div>
          </div>
          <div className="au-kpi">
            <div className="au-kpiLabel">Online now</div>
            <div className="au-kpiValue">{counts.onlineNow}</div>
            <div className="au-kpiHint">last 5 minutes</div>
          </div>
          <div className="au-kpi">
            <div className="au-kpiLabel">Locked</div>
            <div className="au-kpiValue">{counts.locked}</div>
            <div className="au-kpiHint">blocked sign-in</div>
          </div>
        </aside>
      </header>

      <section className="au-panel">
        <div className="au-panelTop">
          <div className="au-panelTitle">{loading ? "Loading users…" : "User directory"}</div>

          <div className="au-pager">
            <button
              type="button"
              className="au-pageBtn"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={loading || page <= 1}
            >
              ← Prev
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
              Next →
            </button>
          </div>
        </div>

        <div className="au-tableWrap">
          <table className="au-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Type</th>
                <th>Status</th>
                <th>Last seen</th>
                <th className="au-thRight">Actions</th>
              </tr>
            </thead>

            <tbody>
              {!loading && (data.items?.length ?? 0) === 0 ? (
                <tr>
                  <td colSpan={5} className="au-empty">
                    No users found for the current filters.
                  </td>
                </tr>
              ) : null}

              {(data.items || []).map((u) => {
                const name = u.name?.trim() || u.username;
                const isLocked = !!u.lockoutEndAt && new Date(u.lockoutEndAt) > new Date();
                const isBusy = busyId === u.id;

                const isApproved = !!u.isApproved;
                const canApprove = !isApproved;

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
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <Badge tone={typeTone(u.userType)}>{String(u.userType)}</Badge>
                    </td>

                    <td>
                      <div className="au-badges">
                        <Badge tone={u.isActive ? "success" : "danger"}>{u.isActive ? "Active" : "Inactive"}</Badge>
                        {isLocked ? <Badge tone="warn">Locked</Badge> : <Badge tone="neutral">Normal</Badge>}
                        {!u.isEmailVerified ? <Badge tone="danger">Email unverified</Badge> : <Badge tone="neutral">Email ok</Badge>}
                        {u.isApproved ? <Badge tone="success">Approved</Badge> : <Badge tone="warn">Pending</Badge>}
                      </div>
                    </td>

                    <td>
                      <div className="au-lastSeen">
                        <div className="au-lastSeenMain">{fmtDateTime(u.lastSeenAtUtc)}</div>
                        {u.lastLoginAt ? (
                          <div className="au-muted">Last login: {fmtDateTime(u.lastLoginAt)}</div>
                        ) : (
                          <div className="au-muted">Last login: —</div>
                        )}
                      </div>
                    </td>

                    <td className="au-tdRight">
                      <div className="au-actions au-actionsIcons">
                        {canApprove ? (
                          <IconBtn
                            tone="success"
                            disabled={isBusy}
                            title="Approve user (also make Institution Admin)"
                            label="Approve"
                            onClick={() => approveUser(u.id, true)}
                          >
                            {isBusy ? <Icon name="spinner" /> : <Icon name="check" />}
                          </IconBtn>
                        ) : (
                          <IconBtn tone="neutral" disabled title="Already approved" label="Approved">
                            <Icon name="shield" />
                          </IconBtn>
                        )}

                        <IconBtn
                          tone={u.isActive ? "neutral" : "success"}
                          disabled={isBusy}
                          title={u.isActive ? "Deactivate user" : "Activate user"}
                          label={u.isActive ? "Deactivate" : "Activate"}
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

                        <IconBtn tone="neutral" disabled={isBusy} title="Reset 2FA (email new setup)" onClick={() => reset2fa(u.id)}>
                          <Icon name="key" />
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
          <div className="au-muted">Tip: “Locked” blocks sign-in even if a user is Active.</div>
          <div className="au-muted">Online is derived from last seen within 5 minutes.</div>
        </div>
      </section>
    </div>
  );
}
