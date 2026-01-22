// src/pages/dashboard/admin/AdminInstitutionUsers.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../../api/client";
import "../../../styles/adminUsers.css"; // ✅ new branding
import "../../../styles/adminCrud.css";  // ✅ keep for footer / shared legacy bits
import AdminPageFooter from "../../../components/AdminPageFooter";

/* -------------------------------------------------------
   Error helpers
------------------------------------------------------- */
function friendlyError(e) {
  const status = e?.response?.status;

  if (status === 403) {
    return "Access denied. You do not have permission to manage users for this institution.";
  }

  if (status === 401) {
    return "Your session has expired. Please log in again.";
  }

  const data = e?.response?.data;
  if (typeof data === "string") return data;
  if (data?.message) return data.message;

  return e?.message || "Request failed.";
}

function normalizeUserName(u) {
  let name = u.fullName ?? u.FullName ?? null;
  if (!name) {
    const first = u.firstName ?? u.FirstName ?? "";
    const last = u.lastName ?? u.LastName ?? "";
    name = `${first} ${last}`.trim() || "—";
  }
  return name;
}

/* =========================
   Tiny icons (no deps)
========================= */
function IBack() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IRefresh({ spin = false }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={spin ? "au-spin" : undefined}
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M21 3v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ISearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function IShield() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2l8 4v6c0 5-3.4 9.4-8 10-4.6-.6-8-5-8-10V6l8-4Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IUser() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 21a8 8 0 0 0-16 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 13a5 5 0 1 0-5-5 5 5 0 0 0 5 5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  return <div className={`toast ${toast.type === "error" ? "toast-error" : "toast-success"}`}>{toast.msg}</div>;
}

export default function AdminInstitutionUsers() {
  const { id } = useParams(); // institutionId
  const navigate = useNavigate();

  const [institution, setInstitution] = useState(null);
  const [users, setUsers] = useState([]);
  const [memberships, setMemberships] = useState([]);

  const [loading, setLoading] = useState(true);

  // ✅ branded: toast, not inline alert
  const [toast, setToast] = useState(null); // {type:"success"|"error", msg:string}

  const [busyMembershipId, setBusyMembershipId] = useState(null);

  // ✅ UX: search + optional role filter
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all"); // all | admin | user
  const [statusFilter, setStatusFilter] = useState("all"); // all | active | inactive

  function showToast(type, msg) {
    setToast({ type, msg });
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(null), 2300);
  }

  async function loadAll() {
    setLoading(true);

    try {
      const instRes = await api.get(`/Institutions/${id}`);
      const inst = instRes.data?.data ?? instRes.data;
      setInstitution(inst);

      const usersRes = await api.get(`/Institutions/${id}/users`);
      const usersData = usersRes.data?.data ?? usersRes.data;
      setUsers(Array.isArray(usersData) ? usersData : []);

      const memRes = await api.get(`/institutions/${id}/members/approved`);
      const memData = memRes.data?.data ?? memRes.data;
      setMemberships(Array.isArray(memData) ? memData : []);
    } catch (e) {
      setUsers([]);
      setMemberships([]);
      showToast("error", friendlyError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const membershipByUserId = useMemo(() => {
    const map = new Map();
    for (const m of memberships) {
      const uid = m?.user?.id ?? m?.userId ?? m?.UserId;
      if (uid != null) map.set(uid, m);
    }
    return map;
  }, [memberships]);

  async function changeMemberType(membershipId, memberType) {
    await api.post(`/institutions/${id}/members/${membershipId}/change-type`, {
      memberType, // "Student" | "Staff" | "InstitutionAdmin"
    });
  }

  async function deactivateMember(membershipId) {
    await api.post(`/institutions/${id}/members/${membershipId}/deactivate`);
  }

  async function reactivateMember(membershipId) {
    await api.post(`/institutions/${id}/members/${membershipId}/reactivate`);
  }

  async function runAction(membershipId, actionFn, successMsg) {
    setBusyMembershipId(membershipId);
    try {
      await actionFn();
      showToast("success", successMsg || "Updated.");
      await loadAll();
    } catch (e) {
      showToast("error", friendlyError(e));
    } finally {
      setBusyMembershipId(null);
    }
  }

  const instName = institution?.name ?? institution?.Name ?? "…";

  const decoratedUsers = useMemo(() => {
    return users.map((u) => {
      const userId = u.id ?? u.Id;
      const email = u.email ?? u.Email ?? "—";
      const name = normalizeUserName(u);

      const joinedRaw = u.createdAt ?? u.CreatedAt;
      const joined = joinedRaw ? new Date(joinedRaw).toLocaleDateString("en-GB") : "—";

      const isActive = u.isActive ?? u.IsActive ?? true;

      const membership = membershipByUserId.get(userId);
      const membershipId = membership?.membershipId ?? membership?.id ?? membership?.Id ?? null;

      const memberTypeRaw = membership?.memberType ?? membership?.MemberType ?? "Student";
      const memberType = typeof memberTypeRaw === "string" ? memberTypeRaw : String(memberTypeRaw);

      const isInstitutionAdmin = memberType.toLowerCase() === "institutionadmin";

      // membership active preferred; fallback to user active
      const membershipActive = membership?.isActive ?? membership?.IsActive ?? true;
      const showDeactivate = membershipActive === true;

      return {
        u,
        userId,
        email,
        name,
        joined,
        isActive,
        membership,
        membershipId,
        memberType,
        isInstitutionAdmin,
        membershipActive,
        showDeactivate,
      };
    });
  }, [users, membershipByUserId]);

  const filteredUsers = useMemo(() => {
    const s = q.trim().toLowerCase();

    return decoratedUsers
      .filter((x) => {
        if (roleFilter === "all") return true;
        if (roleFilter === "admin") return x.isInstitutionAdmin;
        return !x.isInstitutionAdmin;
      })
      .filter((x) => {
        if (statusFilter === "all") return true;
        if (statusFilter === "active") return !!x.isActive;
        return !x.isActive;
      })
      .filter((x) => {
        if (!s) return true;
        const t = `${x.name} ${x.email} ${x.isInstitutionAdmin ? "institution admin" : "user"}`
          .toLowerCase()
          .trim();
        return t.includes(s);
      });
  }, [decoratedUsers, q, roleFilter, statusFilter]);

  const summary = useMemo(() => {
    let total = filteredUsers.length;
    let active = 0;
    let admins = 0;
    let inactive = 0;

    for (const x of filteredUsers) {
      if (x.isActive) active += 1;
      else inactive += 1;
      if (x.isInstitutionAdmin) admins += 1;
    }
    return { total, active, admins, inactive };
  }, [filteredUsers]);

  return (
    <div className="au-wrap">
      <Toast toast={toast} />

      {/* HERO */}
      <div className="au-hero">
        <div className="au-titleRow">
          <div>
            <div className="au-kicker">LawAfrica • Admin</div>
            <h1 className="au-title">Institution Users</h1>
            <div className="au-subtitle">
              Users belonging to <b>{instName}</b>. Manage admin rights & membership activation.
            </div>
          </div>

          <div className="au-heroRight" style={{ gap: 10 }}>
            <button className="au-refresh" onClick={() => navigate(-1)} disabled={!!busyMembershipId}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <IBack /> Back
              </span>
            </button>

            <button className="au-refresh" onClick={loadAll} disabled={loading || !!busyMembershipId}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <IRefresh spin={loading} /> {loading ? "Refreshing…" : "Refresh"}
              </span>
            </button>
          </div>
        </div>

        {/* TOPBAR */}
        <div className="au-topbar">
          <div className="au-search">
            <span className="au-searchIcon" aria-hidden="true">
              <ISearch />
            </span>
            <input
              placeholder="Search users by name, email, role…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={loading}
            />
            {q ? (
              <button className="au-clear" type="button" onClick={() => setQ("")} title="Clear">
                Clear
              </button>
            ) : null}
          </div>

          <div className="au-topbarRight">
            <div className="au-sort">
              <span className="au-sortLabel">Role</span>
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} disabled={loading}>
                <option value="all">All</option>
                <option value="admin">Institution Admin</option>
                <option value="user">User</option>
              </select>
            </div>

            <div className="au-sort">
              <span className="au-sortLabel">Status</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} disabled={loading}>
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="au-kpis">
          <div className="au-kpiCard">
            <div className="au-kpiLabel">Shown</div>
            <div className="au-kpiValue">{loading ? "…" : summary.total}</div>
          </div>

          <div className="au-kpiCard">
            <div className="au-kpiLabel">Active</div>
            <div className="au-kpiValue">{loading ? "…" : summary.active}</div>
          </div>

          <div className="au-kpiCard">
            <div className="au-kpiLabel">Institution Admins</div>
            <div className="au-kpiValue">{loading ? "…" : summary.admins}</div>
          </div>

          <div className="au-kpiCard">
            <div className="au-kpiLabel">Inactive</div>
            <div className="au-kpiValue">{loading ? "…" : summary.inactive}</div>
          </div>
        </div>
      </div>

      {/* DIRECTORY */}
      <div className="au-panel">
        <div className="au-panelTop">
          <div className="au-panelTitle">User directory</div>
          <div className="au-pageMeta">{loading ? "Loading…" : `${filteredUsers.length} record(s)`}</div>
        </div>

        <div className="au-tableWrap">
          <table className="au-table" style={{ minWidth: 980 }}>
            <thead>
              <tr>
                <th style={{ width: "28%" }}>User</th>
                <th style={{ width: "26%" }}>Email</th>
                <th style={{ width: "14%" }}>Role</th>
                <th style={{ width: "14%" }}>Status</th>
                <th style={{ width: "10%" }}>Joined</th>
                <th className="au-thRight" style={{ width: "18%" }}>
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {!loading && filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="au-empty">
                    No users found for the current filters.
                  </td>
                </tr>
              )}

              {filteredUsers.map((x) => {
                const rowBusy = x.membershipId != null && busyMembershipId === x.membershipId;

                const roleBadge = x.isInstitutionAdmin ? "au-badge-info" : "au-badge-neutral";
                const statusBadge = x.isActive ? "au-badge-success" : "au-badge-danger";

                return (
                  <tr key={x.userId}>
                    <td>
                      <div className="au-userCell">
                        <span className={`au-dot ${x.isActive ? "on" : ""}`} />
                        <div className="au-userMeta">
                          <div className="au-userName">{x.name}</div>
                          <div className="au-userSub2">
                            <span className="au-badge au-badge-neutral">
                              <span className="au-muted">UserId:</span> <span className="au-mono">{x.userId}</span>
                            </span>

                            {x.isInstitutionAdmin ? (
                              <span className="au-badge au-badge-info" title="Institution Admin membership">
                                <IShield /> Admin membership
                              </span>
                            ) : (
                              <span className="au-badge au-badge-neutral" title="Standard institution membership">
                                <IUser /> Member
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className="au-mono">{x.email}</span>
                    </td>

                    <td>
                      <span className={`au-badge ${roleBadge}`}>
                        {x.isInstitutionAdmin ? "Institution Admin" : "User"}
                      </span>
                    </td>

                    <td>
                      <span className={`au-badge ${statusBadge}`}>{x.isActive ? "Active" : "Inactive"}</span>
                    </td>

                    <td>{x.joined}</td>

                    <td className="au-tdRight">
                      {!x.membershipId ? (
                        <span className="au-muted">—</span>
                      ) : (
                        <div className="au-actionsRow">
                          <button
                            className={`au-iconBtn ${x.isInstitutionAdmin ? "au-iconBtn-neutral" : "au-iconBtn-info"}`}
                            disabled={rowBusy}
                            onClick={() =>
                              runAction(
                                x.membershipId,
                                async () => {
                                  const next = x.isInstitutionAdmin ? "Staff" : "InstitutionAdmin";
                                  await changeMemberType(x.membershipId, next);
                                },
                                x.isInstitutionAdmin ? "Admin rights removed." : "Admin rights granted."
                              )
                            }
                            title={x.isInstitutionAdmin ? "Remove admin rights" : "Grant admin rights"}
                          >
                            <IShield />
                          </button>

                          <button
                            className={`au-iconBtn ${
                              x.showDeactivate ? "au-iconBtn-danger" : "au-iconBtn-success"
                            }`}
                            disabled={rowBusy}
                            onClick={() =>
                              runAction(
                                x.membershipId,
                                async () => {
                                  if (x.showDeactivate) await deactivateMember(x.membershipId);
                                  else await reactivateMember(x.membershipId);
                                },
                                x.showDeactivate ? "Member deactivated." : "Member reactivated."
                              )
                            }
                            title={x.showDeactivate ? "Deactivate member (free seat)" : "Reactivate member (consume seat)"}
                          >
                            {x.showDeactivate ? (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path
                                  d="M3 6h18"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                />
                                <path
                                  d="M8 6V4h8v2m-1 0v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6h10Z"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinejoin="round"
                                />
                                <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                              </svg>
                            ) : (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                <path
                                  d="M12 5v14M5 12h14"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                />
                              </svg>
                            )}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="au-panelBottom">
          <div className="au-pageMeta">
            Tip: Making a user an Institution Admin is done by changing their membership type.
          </div>
          <div className="au-pageMeta">{busyMembershipId ? "Working…" : ""}</div>
        </div>
      </div>

      <AdminPageFooter
        right={
          <span className="admin-footer-muted">
            Tip: Making a user an Institution Admin is done by changing their membership type.
          </span>
        }
      />
    </div>
  );
}
