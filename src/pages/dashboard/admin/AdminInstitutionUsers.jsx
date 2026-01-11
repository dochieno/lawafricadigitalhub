import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../../api/client";
import "../../../styles/adminCrud.css";
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

export default function AdminInstitutionUsers() {
  const { id } = useParams(); // institutionId
  const navigate = useNavigate();

  const [institution, setInstitution] = useState(null);
  const [users, setUsers] = useState([]);
  const [memberships, setMemberships] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [busyMembershipId, setBusyMembershipId] = useState(null);

  async function loadAll() {
    setLoading(true);
    setError("");

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
      setError(friendlyError(e));
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

  async function runAction(membershipId, actionFn) {
    setError("");
    setBusyMembershipId(membershipId);
    try {
      await actionFn();
      await loadAll();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusyMembershipId(null);
    }
  }

  // UI helpers
  const instName = institution?.name ?? institution?.Name ?? "…";

  return (
    <div className="admin-page admin-page-wide">
      {/* Inline UI polish (safe: scoped to this component only) */}
      <style>{`
        .iu-card {
          border-radius: 18px;
          overflow: hidden;
        }
        .iu-table thead th {
          font-size: 12px;
          letter-spacing: .06em;
          text-transform: uppercase;
          color: #6b7280;
          background: #f9fafb;
          border-bottom: 1px solid #eef2f7;
          padding-top: 14px;
          padding-bottom: 14px;
        }
        .iu-table tbody td {
          padding-top: 16px;
          padding-bottom: 16px;
        }
        .iu-table tbody tr:hover td {
          background: #fbfbfd;
        }
        .iu-name {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .iu-name strong {
          font-weight: 900;
          color: #271611ff;
        }
        .iu-muted {
          color: #6b7280;
          font-size: 12px;
        }
        .iu-actions {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          flex-wrap: nowrap;       /* ✅ do not wrap */
          white-space: nowrap;     /* ✅ keep one line */
        }
        .iu-action-btn {
          height: 36px;
          padding: 0 12px;
          border-radius: 12px;
          font-weight: 800;
          font-size: 13px;
          border: 1px solid #e5e7eb;
          background: #ffffff;
          cursor: pointer;
          transition: transform .05s ease, box-shadow .15s ease, background .15s ease;
        }
        .iu-action-btn:hover {
          background: #f9fafb;
          box-shadow: 0 1px 0 rgba(17,24,39,.04);
        }
        .iu-action-btn:active {
          transform: translateY(1px);
        }
        .iu-action-btn.primary {
          border-color: rgba(127, 29, 29, 0.25);
          background: rgba(127, 29, 29, 0.06);
        }
        .iu-action-btn.primary:hover {
          background: rgba(127, 29, 29, 0.10);
        }
        .iu-action-btn.danger {
          border-color: rgba(220, 38, 38, 0.25);
          background: rgba(220, 38, 38, 0.06);
        }
        .iu-action-btn.danger:hover {
          background: rgba(220, 38, 38, 0.10);
        }
        .iu-action-btn:disabled {
          opacity: .6;
          cursor: not-allowed;
          transform: none;
        }
        .iu-chip {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .iu-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: #10b981;
        }
        .iu-dot.muted {
          background: #9ca3af;
        }
        .iu-subhead {
          margin-top: 8px;
          display: flex;
          align-items: center;
          gap: 10px;
          color: #6b7280;
          font-size: 13px;
        }
        .iu-subhead .sep {
          width: 1px;
          height: 14px;
          background: #e5e7eb;
          display: inline-block;
        }
      `}</style>

      {/* HEADER */}
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Institution · Users</h1>

          <div className="iu-subhead">
            <span>Users belonging to <strong style={{ color: "#111827" }}>{instName}</strong></span>
            <span className="sep" />
            <span>{loading ? "Loading…" : `${users.length} user(s)`}</span>
          </div>
        </div>

        <div className="admin-actions">
          <button className="admin-btn" onClick={() => navigate(-1)}>
            ← Back
          </button>
          <button className="admin-btn" onClick={loadAll} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      {error && <div className="admin-alert error">{error}</div>}

      <div className="admin-card admin-card-fill iu-card">
        <table className="admin-table iu-table">
          <thead>
            <tr>
              <th style={{ width: "26%" }}>Name</th>
              <th style={{ width: "28%" }}>Email</th>
              <th style={{ width: "14%" }}>Role</th>
              <th style={{ width: "14%" }}>Status</th>
              <th style={{ width: "12%" }}>Joined</th>
              <th style={{ width: "16%" }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {!loading && !error && users.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 16, color: "#6b7280" }}>
                  No users found for this institution.
                </td>
              </tr>
            )}

            {users.map((u) => {
              const userId = u.id ?? u.Id;
              const name = normalizeUserName(u);
              const email = u.email ?? u.Email ?? "—";

              const joinedRaw = u.createdAt ?? u.CreatedAt;
              const joined = joinedRaw ? new Date(joinedRaw).toLocaleDateString() : "—";

              const isActive = u.isActive ?? u.IsActive ?? true;

              const membership = membershipByUserId.get(userId);
              const membershipId = membership?.membershipId ?? membership?.id ?? membership?.Id ?? null;

              const memberTypeRaw = membership?.memberType ?? membership?.MemberType ?? "Student";
              const memberType = typeof memberTypeRaw === "string" ? memberTypeRaw : String(memberTypeRaw);

              const isInstitutionAdmin = memberType.toLowerCase() === "institutionadmin";
              const rowBusy = membershipId != null && busyMembershipId === membershipId;

              // membership active preferred; fallback to user active
              const membershipActive =
                membership?.isActive ?? membership?.IsActive ?? true;

              const showDeactivate = membershipActive === true;

              return (
                <tr key={userId}>
                  <td>
                    <div className="iu-name">
                      <strong>{name}</strong>
                      <span className="iu-muted">{isInstitutionAdmin ? "Institution Admin membership" : "Institution member"}</span>
                    </div>
                  </td>

                  <td>{email}</td>

                  <td>
                    <span className="admin-pill">{isInstitutionAdmin ? "Institution Admin" : "User"}</span>
                  </td>

                  <td>
                    <span className="iu-chip">
                      <span className={`iu-dot ${isActive ? "" : "muted"}`} />
                      <span className={`admin-pill ${isActive ? "ok" : "muted"}`}>
                        {isActive ? "Active" : "Inactive"}
                      </span>
                    </span>
                  </td>

                  <td>{joined}</td>

                  <td>
                    {!membershipId ? (
                      <span style={{ color: "#6b7280" }}>—</span>
                    ) : (
                      <div className="iu-actions">
                        <button
                          className="iu-action-btn primary"
                          disabled={rowBusy}
                          onClick={() =>
                            runAction(membershipId, async () => {
                              const next = isInstitutionAdmin ? "Staff" : "InstitutionAdmin";
                              await changeMemberType(membershipId, next);
                            })
                          }
                          title={isInstitutionAdmin ? "Remove admin rights" : "Grant admin rights"}
                        >
                          {rowBusy ? "Working…" : isInstitutionAdmin ? "Remove Admin" : "Make Admin"}
                        </button>

                        <button
                          className={`iu-action-btn ${showDeactivate ? "danger" : ""}`}
                          disabled={rowBusy}
                          onClick={() =>
                            runAction(membershipId, async () => {
                              if (showDeactivate) await deactivateMember(membershipId);
                              else await reactivateMember(membershipId);
                            })
                          }
                          title={showDeactivate ? "Deactivate member (free seat)" : "Reactivate member (consume seat)"}
                        >
                          {rowBusy ? "Working…" : showDeactivate ? "Deactivate" : "Reactivate"}
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
