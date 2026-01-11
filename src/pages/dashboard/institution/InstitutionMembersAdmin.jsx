import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../../api/client";
import "../../../styles/adminCrud.css";
import AdminPageFooter from "../../../components/AdminPageFooter";
import { getAuthClaims } from "../../../auth/auth";

/* -------------------------------------------------------
   Helpers
------------------------------------------------------- */
function friendlyError(e) {
  const status = e?.response?.status;

  if (status === 403) return "Access denied. Only Institution Admins can manage members.";
  if (status === 401) return "Your session has expired. Please log in again.";

  const data = e?.response?.data;
  if (typeof data === "string") return data;
  if (data?.message) return data.message;

  return e?.message || "Request failed.";
}

function normalizeMemberType(v) {
  const t = String(v || "");
  if (t === "InstitutionAdmin") return "Institution Admin";
  return t || "—";
}

function clamp01(n) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function pct(used, max) {
  const u = Number(used);
  const m = Number(max);
  if (!Number.isFinite(u) || !Number.isFinite(m) || m <= 0) return 0;
  return clamp01(u / m);
}

export default function InstitutionMembersAdmin() {
  const navigate = useNavigate();

  const claims = useMemo(() => getAuthClaims?.() || {}, []);
  const institutionId =
    claims?.institutionId ??
    claims?.InstitutionId ??
    claims?.institutionID ??
    claims?.InstitutionID ??
    null;

  const [seatUsage, setSeatUsage] = useState(null);
  const [pending, setPending] = useState([]);
  const [approved, setApproved] = useState([]);

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  async function loadAll() {
    if (!institutionId) {
      setError("No institution is linked to your account (missing institutionId claim).");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const [seatsRes, pendingRes, approvedRes] = await Promise.all([
        api.get(`/institutions/${institutionId}/members/seats`),
        api.get(`/institutions/${institutionId}/members/pending`),
        api.get(`/institutions/${institutionId}/members/approved`),
      ]);

      setSeatUsage(seatsRes.data ?? null);

      const p = pendingRes.data?.data ?? pendingRes.data;
      setPending(Array.isArray(p) ? p : []);

      const a = approvedRes.data?.data ?? approvedRes.data;
      setApproved(Array.isArray(a) ? a : []);
    } catch (e) {
      setSeatUsage(null);
      setPending([]);
      setApproved([]);
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [institutionId]);

  async function approveMember(membershipId) {
    setBusyId(membershipId);
    setError("");
    try {
      await api.post(`/institutions/${institutionId}/members/${membershipId}/approve`, {
        adminNotes: null,
      });
      await loadAll();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function rejectMember(membershipId) {
    setBusyId(membershipId);
    setError("");
    try {
      await api.post(`/institutions/${institutionId}/members/${membershipId}/reject`, {
        adminNotes: null,
      });
      await loadAll();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function deactivateMember(membershipId) {
    setBusyId(membershipId);
    setError("");
    try {
      await api.post(`/institutions/${institutionId}/members/${membershipId}/deactivate`);
      await loadAll();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function reactivateMember(membershipId) {
    setBusyId(membershipId);
    setError("");
    try {
      await api.post(`/institutions/${institutionId}/members/${membershipId}/reactivate`);
      await loadAll();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function changeType(membershipId, memberType) {
    setBusyId(membershipId);
    setError("");
    try {
      await api.post(`/institutions/${institutionId}/members/${membershipId}/change-type`, {
        memberType,
      });
      await loadAll();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusyId(null);
    }
  }

  // UI data
  const stuUsed = seatUsage?.students?.used ?? null;
  const stuMax = seatUsage?.students?.max ?? null;
  const stfUsed = seatUsage?.staff?.used ?? null;
  const stfMax = seatUsage?.staff?.max ?? null;

  const stuPct = pct(stuUsed, stuMax);
  const stfPct = pct(stfUsed, stfMax);

  /* -------------------------------------------------------
     Local styles (NO global CSS edits)
  ------------------------------------------------------- */
  const styles = {
    topActions: { display: "flex", gap: 10, flexWrap: "nowrap", alignItems: "center" },
    
    btn: {
      appearance: "none",
      borderRadius: 12,
      padding: "10px 14px",
      fontWeight: 800,
      border: "1px solid #e5e7eb",
      background: "#fff",
      cursor: "pointer",
      lineHeight: 1,
      transition: "transform 120ms ease, box-shadow 120ms ease, background 120ms ease",
      boxShadow: "0 1px 0 rgba(0,0,0,0.03)",
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      userSelect: "none",
      whiteSpace: "nowrap",
    },
    btnPrimary: {
      border: "1px solid rgba(190, 18, 60, 0.25)",
      background: "linear-gradient(180deg, rgba(190,18,60,1) 0%, rgba(153,27,27,1) 100%)",
      color: "#fff",
      boxShadow: "0 10px 24px rgba(153,27,27,0.18)",
    },
    btnOutline: {
      background: "#fff",
      border: "1px solid #e5e7eb",
      color: "#111827",
    },
    btnDanger: {
      background: "linear-gradient(180deg, rgba(239,68,68,1) 0%, rgba(185,28,28,1) 100%)",
      border: "1px solid rgba(239,68,68,0.35)",
      color: "#fff",
      boxShadow: "0 10px 24px rgba(239,68,68,0.16)",
    },
    btnSmall: { padding: "8px 12px", borderRadius: 10, fontSize: 13, fontWeight: 800 },

    sectionTitle: { margin: 0, fontSize: 16, fontWeight: 950, letterSpacing: "-0.01em" },
    sectionHint: { marginTop: 6, fontSize: 13, color: "#6b7280" },

    usageCard: {
      marginBottom: 14,
      borderRadius: 18,
      border: "1px solid rgba(59,130,246,0.18)",
      background:
        "linear-gradient(135deg, rgba(239,246,255,1) 0%, rgba(224,242,254,1) 45%, rgba(240,253,250,1) 100%)",
      boxShadow: "0 20px 50px rgba(2,132,199,0.10)",
      padding: 16,
    },
    usagePillsRow: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" },

    meterWrap: { display: "flex", flexDirection: "column", gap: 8, minWidth: 280 },
    meterTop: { display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, color: "#111827" },
    meterBar: {
      height: 10,
      borderRadius: 999,
      background: "rgba(15,23,42,0.08)",
      overflow: "hidden",
    },
    meterFill: (fraction) => ({
      height: "100%",
      width: `${Math.round(fraction * 100)}%`,
      borderRadius: 999,
      background:
        "linear-gradient(90deg, rgba(37,99,235,1) 0%, rgba(14,165,233,1) 60%, rgba(16,185,129,1) 100%)",
    }),

    actionRow: { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" },

    select: {
      width: "100%",
      maxWidth: 240,
      borderRadius: 12,
      border: "1px solid #e5e7eb",
      padding: "8px 10px",
      fontWeight: 800,
      background: "#fff",
      color: "#111827",
      outline: "none",
    },
  };

  return (
    <div className="admin-page admin-page-wide">
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Institution · Members</h1>
          <p className="admin-subtitle">
            Manage pending approvals, active seats, and member roles for your institution.
          </p>
        </div>

        <div style={styles.topActions}>
          <button
            type="button"
            style={{ ...styles.btn, ...styles.btnOutline }}
            onClick={() => navigate(-1)}
          >
            ← Back
          </button>

          <button
            type="button"
            style={{ ...styles.btn, ...styles.btnPrimary, opacity: loading ? 0.7 : 1 }}
            onClick={loadAll}
            disabled={loading}
            title="Refresh members and seat usage"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {error && <div className="admin-alert error">{error}</div>}

      {/* Seats usage */}
      <div style={styles.usageCard}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
          <div style={{ minWidth: 260 }}>
            <div style={{ fontWeight: 950, fontSize: 16, marginBottom: 6 }}>Seat usage</div>
            <div style={{ color: "#334155", fontSize: 13 }}>
              Seats are consumed by <strong>Approved + Active</strong> memberships.
            </div>

            <div style={{ marginTop: 10, ...styles.usagePillsRow }}>
              <span className="admin-pill">
                Students:{" "}
                <strong>
                  {stuUsed ?? "—"}/{stuMax ?? "—"}
                </strong>
              </span>
              <span className="admin-pill">
                Staff/Admin:{" "}
                <strong>
                  {stfUsed ?? "—"}/{stfMax ?? "—"}
                </strong>
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <div style={styles.meterWrap}>
              <div style={styles.meterTop}>
                <span style={{ fontWeight: 900 }}>Students</span>
                <span style={{ color: "#475569" }}>
                  {stuMax === 0 ? "Blocked (max = 0)" : `${Math.round(stuPct * 100)}%`}
                </span>
              </div>
              <div style={styles.meterBar}>
                <div style={styles.meterFill(stuMax === 0 ? 1 : stuPct)} />
              </div>
            </div>

            <div style={styles.meterWrap}>
              <div style={styles.meterTop}>
                <span style={{ fontWeight: 900 }}>Staff/Admin</span>
                <span style={{ color: "#475569" }}>
                  {stfMax === 0 ? "Blocked (max = 0)" : `${Math.round(stfPct * 100)}%`}
                </span>
              </div>
              <div style={styles.meterBar}>
                <div style={styles.meterFill(stfMax === 0 ? 1 : stfPct)} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pending */}
      <div className="admin-card admin-card-fill" style={{ marginBottom: 14 }}>
        <div className="admin-card-title-row" style={{ alignItems: "flex-end" }}>
          <div>
            <h2 style={styles.sectionTitle}>Pending approvals</h2>
            <div style={styles.sectionHint}>
              Approving activates the account and consumes a seat.
            </div>
          </div>

          <div style={{ color: "#6b7280", fontSize: 13, fontWeight: 800 }}>
            {loading ? "Loading…" : `${pending.length} pending`}
          </div>
        </div>

        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: "26%" }}>User</th>
              <th style={{ width: "26%" }}>Email</th>
              <th style={{ width: "14%" }}>Type</th>
              <th style={{ width: "18%" }}>Reference</th>
              <th style={{ width: "16%", textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {!loading && pending.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 16, color: "#6b7280" }}>
                  No pending requests.
                </td>
              </tr>
            )}

            {pending.map((m) => {
              const id = m.id ?? m.membershipId ?? m.Id;
              const username = m.username ?? "—";
              const email = m.email ?? "—";
              const memberType = m.memberType ?? "—";
              const ref = m.referenceNumber ?? "—";

              const rowBusy = busyId === id;

              return (
                <tr key={id}>
                  <td style={{ fontWeight: 900 }}>{username}</td>
                  <td>{email}</td>
                  <td>
                    <span className="admin-pill">{normalizeMemberType(memberType)}</span>
                  </td>
                  <td>{ref}</td>
                  <td style={{ textAlign: "right" }}>
                    <div style={styles.actionRow}>
                      <button
                        type="button"
                        style={{
                          ...styles.btn,
                          ...styles.btnPrimary,
                          ...styles.btnSmall,
                          opacity: rowBusy ? 0.75 : 1,
                        }}
                        disabled={rowBusy}
                        onClick={() => approveMember(id)}
                      >
                        {rowBusy ? "Approving…" : "Approve"}
                      </button>

                      <button
                        type="button"
                        style={{
                          ...styles.btn,
                          ...styles.btnDanger,
                          ...styles.btnSmall,
                          opacity: rowBusy ? 0.75 : 1,
                        }}
                        disabled={rowBusy}
                        onClick={() => rejectMember(id)}
                      >
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Approved */}
      <div className="admin-card admin-card-fill">
        <div className="admin-card-title-row" style={{ alignItems: "flex-end" }}>
          <div>
            <h2 style={styles.sectionTitle}>Active members</h2>
            <div style={styles.sectionHint}>
              Change member types (Student/Staff/Admin), or deactivate/reactivate.
            </div>
          </div>

          <div style={{ color: "#6b7280", fontSize: 13, fontWeight: 800 }}>
            {loading ? "Loading…" : `${approved.length} members`}
          </div>
        </div>

        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: "24%" }}>Name</th>
              <th style={{ width: "26%" }}>Email</th>
              <th style={{ width: "16%" }}>Type</th>
              <th style={{ width: "14%" }}>Status</th>
              <th style={{ width: "20%", textAlign: "right" }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {!loading && approved.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 16, color: "#6b7280" }}>
                  No approved members yet.
                </td>
              </tr>
            )}

            {approved.map((m) => {
              const membershipId = m.membershipId ?? m.id ?? m.Id;
              const memberType = m.memberType ?? "—";
              const user = m.user ?? {};
              const name =
                `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() ||
                user.username ||
                "—";
              const email = user.email ?? "—";

              const isActive = user.isActive ?? true;
              const isApproved = user.isApproved ?? true;

              const rowBusy = busyId === membershipId;

              return (
                <tr key={membershipId}>
                  <td style={{ fontWeight: 900 }}>{name}</td>
                  <td>{email}</td>

                  <td>
                    <select
                      value={memberType}
                      disabled={rowBusy}
                      onChange={(e) => changeType(membershipId, e.target.value)}
                      style={{ ...styles.select, opacity: rowBusy ? 0.75 : 1 }}
                    >
                      <option value="Student">Student</option>
                      <option value="Staff">Staff</option>
                      <option value="InstitutionAdmin">InstitutionAdmin</option>
                    </select>
                  </td>

                  <td>
                    <span className={`admin-pill ${isActive && isApproved ? "ok" : "muted"}`}>
                      {isActive && isApproved ? "Active" : "Inactive"}
                    </span>
                  </td>

                  <td style={{ textAlign: "right" }}>
                    <div style={styles.actionRow}>
                      {isActive ? (
                        <button
                          type="button"
                          style={{
                            ...styles.btn,
                            ...styles.btnDanger,
                            ...styles.btnSmall,
                            opacity: rowBusy ? 0.75 : 1,
                          }}
                          disabled={rowBusy}
                          onClick={() => deactivateMember(membershipId)}
                        >
                          {rowBusy ? "Working…" : "Deactivate"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          style={{
                            ...styles.btn,
                            ...styles.btnPrimary,
                            ...styles.btnSmall,
                            opacity: rowBusy ? 0.75 : 1,
                          }}
                          disabled={rowBusy}
                          onClick={() => reactivateMember(membershipId)}
                        >
                          {rowBusy ? "Working…" : "Reactivate"}
                        </button>
                      )}
                    </div>
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
            Tip: Institution Admin permissions are granted via{" "}
            <strong>membership type</strong> (InstitutionAdmin).
          </span>
        }
      />
    </div>
  );
}
