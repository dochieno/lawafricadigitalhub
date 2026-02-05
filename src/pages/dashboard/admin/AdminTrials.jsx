// src/pages/dashboard/admin/AdminTrials.jsx
import { useEffect, useMemo, useState } from "react";
import api from "../../../api/client";
import "../../../styles/trials.css";

const STATUS = {
  Pending: 1,
  Approved: 2,
  Rejected: 3,
  Cancelled: 4,
};

function extractErrorMessage(e) {
  const data = e?.response?.data;
  if (data?.message) return data.message;

  if (data?.errors && typeof data.errors === "object") {
    const firstKey = Object.keys(data.errors)[0];
    const firstVal = Array.isArray(data.errors[firstKey]) ? data.errors[firstKey][0] : null;
    if (firstVal) return `${firstKey}: ${firstVal}`;
  }

  if (typeof data === "string") return data;
  return e?.message || "Request failed";
}

function fmt(dt) {
  if (!dt) return "—";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return String(dt);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusClass(s) {
  const x = String(s || "").toLowerCase();
  if (x.includes("approved")) return "approved";
  if (x.includes("rejected")) return "rejected";
  if (x.includes("cancelled")) return "cancelled";
  return "pending";
}

export default function AdminTrials() {
  const [status, setStatus] = useState("Pending");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notesById, setNotesById] = useState({}); // { [requestId]: string }
  const [toast, setToast] = useState(null); // { type: "success"|"error", text: string }

  const statusValue = useMemo(() => STATUS[status] ?? STATUS.Pending, [status]);

  function showToast(type, text) {
    setToast({ type, text });
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(null), 2600);
  }

  async function refresh() {
    setBusy(true);
    setError("");
    setActionError("");

    try {
      // ✅ Backend: GET /api/trials/admin/requests?status={int}
      // ✅ Frontend: assumes api.baseURL already includes /api
      const res = await api.get("/trials/admin/requests", { params: { status: statusValue } });
      const data = Array.isArray(res.data) ? res.data : [];
      setItems(data);
    } catch (e) {
      setItems([]);
      setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusValue]);

  async function approve(requestId) {
    setBusy(true);
    setActionError("");

    try {
      const adminNotes = (notesById[requestId] || "").trim() || null;

      // ✅ Backend: POST /api/trials/admin/requests/{id}/approve
      await api.post(`/trials/admin/requests/${requestId}/approve`, { adminNotes });

      showToast("success", `Approved request #${requestId} (7-day trial).`);
      await refresh();
    } catch (e) {
      const msg = extractErrorMessage(e);
      setActionError(msg);
      showToast("error", msg);
    } finally {
      setBusy(false);
    }
  }

  async function reject(requestId) {
    setBusy(true);
    setActionError("");

    try {
      const adminNotes = (notesById[requestId] || "").trim() || null;

      // ✅ Backend: POST /api/trials/admin/requests/{id}/reject
      await api.post(`/trials/admin/requests/${requestId}/reject`, { adminNotes });

      showToast("success", `Rejected request #${requestId}.`);
      await refresh();
    } catch (e) {
      const msg = extractErrorMessage(e);
      setActionError(msg);
      showToast("error", msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="la-trials">
      {toast?.text ? (
        <div className={`la-toast ${toast.type === "success" ? "success" : "error"}`}>{toast.text}</div>
      ) : null}

      <div className="la-trialsTop">
        <div>
          <h2 className="la-trialsTitle">Trial Requests</h2>
          <p className="la-trialsSub">
            Approve/reject trial requests. Approval creates a <b>7-day</b> trial subscription.
          </p>
        </div>

        <div className="la-trialsControls">
          <label className="la-field">
            <span>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={busy}>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </label>

          <button className="la-btn la-btnNeutral" type="button" disabled={busy} onClick={refresh}>
            {busy ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="la-alert error">
          <div className="la-alertTitle">Error</div>
          <div>{error}</div>
        </div>
      ) : null}

      {actionError ? (
        <div className="la-alert warn">
          <div className="la-alertTitle">Action error</div>
          <div>{actionError}</div>
        </div>
      ) : null}

      <div className="la-card">
        <div className="la-tableHead">
          <div>ID</div>
          <div>User</div>
          <div>Product</div>
          <div>Requested</div>
          <div>Actions</div>
        </div>

        {items.length === 0 ? (
          <div className="la-empty">{busy ? "Loading…" : "No requests found."}</div>
        ) : (
          items.map((r) => {
            const isPending = String(r?.status || "").toLowerCase() === "pending";
            const sClass = statusClass(r?.status);

            const requestId = r?.id;
            const user = r?.user || {};
            const product = r?.product || {};

            return (
              <div key={requestId} className="la-row">
                <div className="la-idCell">
                  <div className="la-idTop">
                    <div className="la-idNum">#{requestId}</div>
                    <span className={`la-badge ${sClass}`}>{String(r?.status || "—")}</span>
                  </div>
                  {r?.reviewedAt ? (
                    <div className="la-mutedSmall">Reviewed: {fmt(r.reviewedAt)}</div>
                  ) : (
                    <div className="la-mutedSmall">Not reviewed</div>
                  )}
                </div>

                <div className="la-userCell">
                  <div className="la-strong">{user?.username || "—"}</div>
                  <div className="la-muted">{user?.email || "—"}</div>
                  <div className="la-muted">{user?.phoneNumber || "—"}</div>

                  {r?.reason ? (
                    <div className="la-noteBox">
                      <div className="la-noteTitle">User reason</div>
                      <div className="la-noteText">{r.reason}</div>
                    </div>
                  ) : null}
                </div>

                <div className="la-prodCell">
                  <div className="la-strong">{product?.name || "—"}</div>
                  <div className="la-mutedSmall">
                    ProductId: {product?.contentProductId ?? r?.contentProductId ?? "—"}
                  </div>
                </div>

                <div className="la-timeCell">
                  <div>{fmt(r?.requestedAt)}</div>
                </div>

                <div className="la-actionsCell">
                  <textarea
                    className="la-notes"
                    rows={2}
                    placeholder="Admin notes (optional)"
                    value={notesById[requestId] || ""}
                    onChange={(e) => setNotesById((p) => ({ ...p, [requestId]: e.target.value }))}
                    disabled={busy}
                  />

                  <div className="la-actions">
                    <button
                      className="la-btn approve"
                      type="button"
                      disabled={busy || !isPending}
                      onClick={() => approve(requestId)}
                      title={!isPending ? "Only pending requests can be approved" : "Approve and grant 7-day trial"}
                    >
                      Approve (7 days)
                    </button>

                    <button
                      className="la-btn reject"
                      type="button"
                      disabled={busy || !isPending}
                      onClick={() => reject(requestId)}
                      title={!isPending ? "Only pending requests can be rejected" : "Reject request"}
                    >
                      Reject
                    </button>
                  </div>

                  {r?.adminNotes ? (
                    <div className="la-mutedSmall">
                      <b>Existing admin notes:</b> {r.adminNotes}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
