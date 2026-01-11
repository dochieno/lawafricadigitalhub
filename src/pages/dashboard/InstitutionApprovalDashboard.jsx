import { useEffect, useMemo, useState } from "react";
import api from "../../api/client";
import { decodeJwt, getToken } from "../../auth/auth";
import "../../styles/institutionApprovals.css";

function toText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try { return JSON.stringify(v, null, 2); } catch { return "Unexpected error."; }
}

export default function InstitutionApprovalDashboard() {
  const token = getToken();
  const payload = useMemo(() => (token ? decodeJwt(token) : null), [token]);

  // institutionId claim from JWT (we added it)
  const institutionId = useMemo(() => {
    const raw = payload?.institutionId;
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [payload]);

  const role = payload?.role || payload?.["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"];

  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const [pendingMembers, setPendingMembers] = useState([]);

  async function loadPending() {
    setError("");
    setLoading(true);

    try {
      if (!institutionId) {
        setPendingMembers([]);
        setError("No institutionId found on your token. Log in as an institution admin user.");
        return;
      }

      // ✅ You need this endpoint (Step 4 below). For now it will 404 until you add it.
      const res = await api.get(`/institutions/${institutionId}/members/pending`);
      const data = res.data?.data ?? res.data;
      setPendingMembers(Array.isArray(data) ? data : []);
    } catch (err) {
      setPendingMembers([]);
      setError(toText(err?.response?.data || err?.message || "Failed to load pending approvals."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [institutionId]);

  async function approveMember(membershipId) {
    if (!institutionId) return;
    setError("");
    setBusyId(membershipId);

    try {
      await api.post(`/institutions/${institutionId}/members/${membershipId}/approve`, {
        adminNotes: "Approved via dashboard",
      });
      await loadPending();
    } catch (err) {
      setError(toText(err?.response?.data || err?.message || "Approve failed."));
    } finally {
      setBusyId(null);
    }
  }

  async function rejectMember(membershipId) {
    if (!institutionId) return;
    setError("");
    setBusyId(membershipId);

    try {
      await api.post(`/institutions/${institutionId}/members/${membershipId}/reject`, {
        adminNotes: "Rejected via dashboard",
      });
      await loadPending();
    } catch (err) {
      setError(toText(err?.response?.data || err?.message || "Reject failed."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="ia-page">
      <div className="ia-head">
        <div>
          <h1>Institution approvals</h1>
          <p>Approve or reject pending institution members.</p>
        </div>

        <button className="ia-btn" onClick={loadPending} disabled={loading}>
          Refresh
        </button>
      </div>

      <div className="ia-meta">
        <div><b>Role:</b> {role || "—"}</div>
        <div><b>InstitutionId:</b> {institutionId ?? "—"}</div>
      </div>

      {error && <div className="ia-alert">{error}</div>}

      <div className="ia-card">
        <h2>Pending members</h2>

        {loading ? (
          <div className="ia-muted">Loading…</div>
        ) : pendingMembers.length === 0 ? (
          <div className="ia-muted">No pending members.</div>
        ) : (
          <div className="ia-table">
            <div className="ia-row ia-row-head">
              <div>User</div>
              <div>Type</div>
              <div>Requested</div>
              <div>Actions</div>
            </div>

            {pendingMembers.map((m) => (
              <div className="ia-row" key={m.id}>
                <div>
                  <div className="ia-strong">{m.username || m.email || `User #${m.userId}`}</div>
                  <div className="ia-muted">{m.email || ""}</div>
                </div>
                <div>{m.memberType || "—"}</div>
                <div>{m.createdAt ? new Date(m.createdAt).toLocaleString() : "—"}</div>
                <div className="ia-actions">
                  <button
                    className="ia-btn primary"
                    onClick={() => approveMember(m.id)}
                    disabled={busyId === m.id}
                  >
                    Approve
                  </button>
                  <button
                    className="ia-btn danger"
                    onClick={() => rejectMember(m.id)}
                    disabled={busyId === m.id}
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
