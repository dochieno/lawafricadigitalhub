// src/pages/dashboard/institution/InstitutionMembersAdmin.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../../api/client";
import "../../../styles/adminCrud.css";
import "../../../styles/adminUsers.css"; // ✅ branding
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

function safeStr(v) {
  return (v ?? "").toString();
}

function ConfirmModal({ open, title, body, confirmText = "Confirm", cancelText = "Cancel", busy, onCancel, onConfirm }) {
  if (!open) return null;

  return (
    <div className="admin-modal-overlay" onClick={busy ? undefined : onCancel}>
      <div className="admin-modal admin-modal-tight" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-head admin-modal-head-x">
          <div>
            <h3 className="admin-modal-title">{title}</h3>
            {body ? <div className="admin-modal-subtitle">{body}</div> : null}
          </div>

          <button className="admin-modal-xbtn" onClick={onCancel} disabled={busy} aria-label="Close" title="Close">
            ✕
          </button>
        </div>

        <div className="admin-modal-foot">
          <button className="admin-btn" type="button" onClick={onCancel} disabled={busy}>
            {cancelText}
          </button>
          <button className="admin-btn primary" type="button" onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================
   Tiny icons (no deps)
========================= */
function ISearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 21l-4.3-4.3m1.3-5.4a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function IRefresh({ spin = false } = {}) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={spin ? "au-spin" : undefined}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M21 3v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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

  // toast (same pattern we used on approvals page)
  const [toast, setToast] = useState(null); // {type:"error"|"success", text:string}

  // search
  const [q, setQ] = useState("");

  // confirm modal
  const [confirm, setConfirm] = useState({
    open: false,
    title: "",
    body: "",
    confirmText: "Confirm",
    action: null,
  });

  function showError(msg) {
    setToast({ type: "error", text: String(msg || "Request failed.") });
    window.clearTimeout(showError._t);
    showError._t = window.setTimeout(() => setToast(null), 4500);
  }
  function showSuccess(msg) {
    setToast({ type: "success", text: String(msg || "Done.") });
    window.clearTimeout(showSuccess._t);
    showSuccess._t = window.setTimeout(() => setToast(null), 2500);
  }

  async function loadAll() {
    if (!institutionId) {
      showError("No institution is linked to your account (missing institutionId claim).");
      setLoading(false);
      return;
    }

    setLoading(true);

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
      showError(friendlyError(e));
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
    try {
      await api.post(`/institutions/${institutionId}/members/${membershipId}/approve`, {
        adminNotes: null,
      });
      showSuccess("Approved.");
      await loadAll();
    } catch (e) {
      showError(friendlyError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function rejectMember(membershipId) {
    setBusyId(membershipId);
    try {
      await api.post(`/institutions/${institutionId}/members/${membershipId}/reject`, {
        adminNotes: null,
      });
      showSuccess("Rejected.");
      await loadAll();
    } catch (e) {
      showError(friendlyError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function deactivateMember(membershipId) {
    setBusyId(membershipId);
    try {
      await api.post(`/institutions/${institutionId}/members/${membershipId}/deactivate`);
      showSuccess("Deactivated.");
      await loadAll();
    } catch (e) {
      showError(friendlyError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function reactivateMember(membershipId) {
    setBusyId(membershipId);
    try {
      await api.post(`/institutions/${institutionId}/members/${membershipId}/reactivate`);
      showSuccess("Reactivated.");
      await loadAll();
    } catch (e) {
      showError(friendlyError(e));
    } finally {
      setBusyId(null);
    }
  }

  async function changeType(membershipId, memberType) {
    setBusyId(membershipId);
    try {
      await api.post(`/institutions/${institutionId}/members/${membershipId}/change-type`, {
        memberType,
      });
      showSuccess("Role updated.");
      await loadAll();
    } catch (e) {
      showError(friendlyError(e));
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

  // search filters (client-side)
  const filteredPending = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return pending;

    return pending.filter((m) => {
      const id = safeStr(m.id ?? m.membershipId ?? m.Id);
      const username = safeStr(m.username).toLowerCase();
      const email = safeStr(m.email).toLowerCase();
      const type = safeStr(m.memberType).toLowerCase();
      const ref = safeStr(m.referenceNumber).toLowerCase();
      const hay = `${id} ${username} ${email} ${type} ${ref}`.toLowerCase();
      return hay.includes(s);
    });
  }, [pending, q]);

  const filteredApproved = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return approved;

    return approved.filter((m) => {
      const membershipId = safeStr(m.membershipId ?? m.id ?? m.Id);
      const memberType = safeStr(m.memberType).toLowerCase();
      const user = m.user ?? {};
      const name = `${safeStr(user.firstName)} ${safeStr(user.lastName)}`.trim().toLowerCase();
      const username = safeStr(user.username).toLowerCase();
      const email = safeStr(user.email).toLowerCase();
      const hay = `${membershipId} ${memberType} ${name} ${username} ${email}`.toLowerCase();
      return hay.includes(s);
    });
  }, [approved, q]);

  const stats = useMemo(() => {
    const totalPending = pending.length;
    const totalApproved = approved.length;

    const active = approved.filter((m) => (m.user?.isActive ?? true) && (m.user?.isApproved ?? true)).length;
    const inactive = totalApproved - active;

    return { totalPending, totalApproved, active, inactive };
  }, [pending, approved]);

  function openConfirm({ title, body, confirmText, action }) {
    setConfirm({ open: true, title, body, confirmText, action });
  }
  function closeConfirm() {
    if (busyId) return;
    setConfirm((p) => ({ ...p, open: false }));
  }
  async function runConfirm() {
    const act = confirm.action;
    if (!act) return closeConfirm();
    closeConfirm();
    await act();
  }

  return (
    <div className="au-wrap">
      {/* Toast */}
      {toast?.text ? (
        <div className={`toast ${toast.type === "error" ? "toast-error" : "toast-success"}`}>{toast.text}</div>
      ) : null}

      {/* HERO */}
      <div className="au-hero">
        <div className="au-titleRow">
          <div>
            <div className="au-kicker">INSTITUTION • ADMIN</div>
            <h1 className="au-title">Members</h1>
            <p className="au-subtitle">Manage pending approvals, seats, and member roles for your institution.</p>
          </div>

          <div className="au-heroRight" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button className="au-refresh" onClick={() => navigate(-1)} title="Go back" disabled={busyId != null}>
              ← Back
            </button>

            <button className="au-refresh" onClick={loadAll} disabled={loading} title="Refresh members and seat usage">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <IRefresh spin={loading} /> {loading ? "Refreshing…" : "Refresh"}
              </span>
            </button>
          </div>
        </div>

        {/* TOPBAR */}
        <div className="au-topbar">
          <div className="au-search" style={{ minWidth: 420 }}>
            <span className="au-searchIcon" aria-hidden="true">
              <ISearch />
            </span>
            <input
              placeholder="Search members (name, email, type, ref, id)…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={loading}
            />
            {q ? (
              <button className="au-clear" onClick={() => setQ("")} title="Clear">
                Clear
              </button>
            ) : null}
          </div>

          <div className="au-topbarRight" style={{ gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span className="admin-pill muted">{loading ? "Loading…" : `Pending: ${filteredPending.length}`}</span>
            <span className="admin-pill muted">{loading ? "Loading…" : `Members: ${filteredApproved.length}`}</span>
          </div>
        </div>

        {/* KPIs */}
        <div className="au-kpis">
          <div className="au-kpiCard">
            <div className="au-kpiLabel">Pending approvals</div>
            <div className="au-kpiValue">{loading ? "…" : stats.totalPending}</div>
          </div>

          <div className="au-kpiCard">
            <div className="au-kpiLabel">Total members</div>
            <div className="au-kpiValue">{loading ? "…" : stats.totalApproved}</div>
          </div>

          <div className="au-kpiCard">
            <div className="au-kpiLabel">Active / Inactive</div>
            <div className="au-kpiValue">{loading ? "…" : `${stats.active} / ${stats.inactive}`}</div>
          </div>

          <div className="au-kpiCard">
            <div className="au-kpiLabel">Seat usage</div>
            <div className="au-kpiValue">
              {loading ? "…" : `${stuUsed ?? "—"}/${stuMax ?? "—"} • ${stfUsed ?? "—"}/${stfMax ?? "—"}`}
            </div>
          </div>
        </div>
      </div>

      {/* Seats usage panel */}
      <div className="au-panel" style={{ marginTop: 12 }}>
        <div className="au-panelTop">
          <div className="au-panelTitle">Seat usage</div>
          <div className="au-pageMeta">Seats are consumed by Approved + Active memberships.</div>
        </div>

        <div style={{ padding: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {/* Students */}
          <div className="au-card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
              <div style={{ fontWeight: 950 }}>Students</div>
              <div className="au-muted" style={{ fontWeight: 900 }}>
                {stuUsed ?? "—"} / {stuMax ?? "—"} · {stuMax === 0 ? "Blocked" : `${Math.round(stuPct * 100)}%`}
              </div>
            </div>
            <div className="au-meter" style={{ marginTop: 10 }}>
              <div className="au-meterFill" style={{ width: `${Math.round((stuMax === 0 ? 1 : stuPct) * 100)}%` }} />
            </div>
          </div>

          {/* Staff */}
          <div className="au-card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
              <div style={{ fontWeight: 950 }}>Staff/Admin</div>
              <div className="au-muted" style={{ fontWeight: 900 }}>
                {stfUsed ?? "—"} / {stfMax ?? "—"} · {stfMax === 0 ? "Blocked" : `${Math.round(stfPct * 100)}%`}
              </div>
            </div>
            <div className="au-meter" style={{ marginTop: 10 }}>
              <div className="au-meterFill" style={{ width: `${Math.round((stfMax === 0 ? 1 : stfPct) * 100)}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Pending approvals */}
      <div className="au-panel" style={{ marginTop: 12 }}>
        <div className="au-panelTop">
          <div className="au-panelTitle">Pending approvals</div>
          <div className="au-pageMeta">{loading ? "Loading…" : `${filteredPending.length} pending`}</div>
        </div>

        <div className="au-tableWrap">
          <table className="au-table">
            <thead>
              <tr>
                <th style={{ width: "26%" }}>User</th>
                <th style={{ width: "28%" }}>Email</th>
                <th style={{ width: "14%" }}>Type</th>
                <th style={{ width: "18%" }}>Reference</th>
                <th className="au-thRight" style={{ width: "14%" }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {!loading && filteredPending.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="au-empty">
                      <div style={{ fontWeight: 950 }}>No pending requests.</div>
                      <div className="au-muted" style={{ marginTop: 6 }}>
                        When users request access, they will appear here for approval.
                      </div>
                    </div>
                  </td>
                </tr>
              )}

              {filteredPending.map((m) => {
                const id = m.id ?? m.membershipId ?? m.Id;
                const username = m.username ?? "—";
                const email = m.email ?? "—";
                const memberType = m.memberType ?? "—";
                const ref = m.referenceNumber ?? "—";

                const rowBusy = busyId === id;

                return (
                  <tr key={id}>
                    <td style={{ fontWeight: 950 }}>{username}</td>
                    <td>{email}</td>
                    <td>
                      <span className="admin-pill">{normalizeMemberType(memberType)}</span>
                    </td>
                    <td className="au-mono">{ref}</td>
                    <td className="au-tdRight">
                      <div className="au-actionsRow">
                        <button
                          className="admin-btn primary"
                          style={{ padding: "8px 12px", borderRadius: 12, fontWeight: 900 }}
                          disabled={rowBusy}
                          onClick={() => approveMember(id)}
                          title="Approve member"
                        >
                          {rowBusy ? "Approving…" : "Approve"}
                        </button>

                        <button
                          className="admin-btn"
                          style={{ padding: "8px 12px", borderRadius: 12, fontWeight: 900 }}
                          disabled={rowBusy}
                          onClick={() =>
                            openConfirm({
                              title: "Reject member request?",
                              body: `This will reject ${username} (${email}). You can’t undo this action.`,
                              confirmText: "Reject",
                              action: () => rejectMember(id),
                            })
                          }
                          title="Reject request"
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
      </div>

      {/* Active members */}
      <div className="au-panel" style={{ marginTop: 12 }}>
        <div className="au-panelTop">
          <div className="au-panelTitle">Active members</div>
          <div className="au-pageMeta">{loading ? "Loading…" : `${filteredApproved.length} member(s)`}</div>
        </div>

        <div className="au-tableWrap">
          <table className="au-table">
            <thead>
              <tr>
                <th style={{ width: "26%" }}>Name</th>
                <th style={{ width: "30%" }}>Email</th>
                <th style={{ width: "18%" }}>Role</th>
                <th style={{ width: "12%" }}>Status</th>
                <th className="au-thRight" style={{ width: "14%" }}>
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {!loading && filteredApproved.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="au-empty">
                      <div style={{ fontWeight: 950 }}>No approved members yet.</div>
                      <div className="au-muted" style={{ marginTop: 6 }}>
                        Approve pending requests to activate seats.
                      </div>
                    </div>
                  </td>
                </tr>
              )}

              {filteredApproved.map((m) => {
                const membershipId = m.membershipId ?? m.id ?? m.Id;
                const memberType = m.memberType ?? "—";
                const user = m.user ?? {};
                const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.username || "—";
                const email = user.email ?? "—";

                const isActive = user.isActive ?? true;
                const isApproved = user.isApproved ?? true;
                const rowBusy = busyId === membershipId;

                return (
                  <tr key={membershipId}>
                    <td style={{ fontWeight: 950 }}>{name}</td>
                    <td>{email}</td>

                    <td>
                      <select
                        value={memberType}
                        disabled={rowBusy}
                        onChange={(e) => changeType(membershipId, e.target.value)}
                        className="admin-select"
                        style={{ minWidth: 220, fontWeight: 900 }}
                      >
                        <option value="Student">Student</option>
                        <option value="Staff">Staff</option>
                        <option value="InstitutionAdmin">InstitutionAdmin</option>
                      </select>
                      <div className="au-muted" style={{ marginTop: 6, fontSize: 12 }}>
                        {normalizeMemberType(memberType)}
                      </div>
                    </td>

                    <td>
                      <span className={`admin-pill ${isActive && isApproved ? "ok" : "muted"}`}>
                        {isActive && isApproved ? "Active" : "Inactive"}
                      </span>
                    </td>

                    <td className="au-tdRight">
                      <div className="au-actionsRow">
                        {isActive ? (
                          <button
                            className="admin-btn"
                            style={{ padding: "8px 12px", borderRadius: 12, fontWeight: 900 }}
                            disabled={rowBusy}
                            onClick={() =>
                              openConfirm({
                                title: "Deactivate member?",
                                body: `This will deactivate ${name} (${email}). They will lose access until reactivated.`,
                                confirmText: "Deactivate",
                                action: () => deactivateMember(membershipId),
                              })
                            }
                          >
                            {rowBusy ? "Working…" : "Deactivate"}
                          </button>
                        ) : (
                          <button
                            className="admin-btn primary"
                            style={{ padding: "8px 12px", borderRadius: 12, fontWeight: 900 }}
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

        <div className="au-panelBottom">
          <span className="au-pageMeta">
            Tip: Institution Admin permissions are granted via <b>membership type</b> (InstitutionAdmin).
          </span>
        </div>
      </div>

      <AdminPageFooter
        right={
          <span className="admin-footer-muted">
            Tip: Institution Admin permissions are granted via <strong>membership type</strong> (InstitutionAdmin).
          </span>
        }
      />

      {/* CONFIRM MODAL */}
      <ConfirmModal
        open={confirm.open}
        title={confirm.title}
        body={confirm.body}
        confirmText={confirm.confirmText}
        cancelText="Back"
        busy={!!busyId}
        onCancel={closeConfirm}
        onConfirm={runConfirm}
      />

      {/* Local-only styles to support au-* meter if not already in your adminUsers.css */}
      <style>{`
        .au-card{
          border:1px solid rgba(0,0,0,0.06);
          border-radius:16px;
          background:#fff;
          padding:14px;
        }
        .au-meter{
          width:100%;
          height:10px;
          border-radius:999px;
          background: rgba(15,23,42,0.08);
          overflow:hidden;
        }
        .au-meterFill{
          height:100%;
          border-radius:999px;
          background: linear-gradient(90deg, rgba(37,99,235,1) 0%, rgba(14,165,233,1) 60%, rgba(16,185,129,1) 100%);
        }
      `}</style>
    </div>
  );
}
