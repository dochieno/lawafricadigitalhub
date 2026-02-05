import { useEffect, useMemo, useState } from "react";
import api from "../../../api/client";
import "../../../styles/adminTrials.css";

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
  if (!dt) return "";
  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return String(dt);
  return d.toLocaleString();
}

function apiPath(path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (p.startsWith("/api/") || p === "/api") return p;

  const base = String(api?.defaults?.baseURL || "").toLowerCase();
  const baseHasApi = base.includes("/api");
  return baseHasApi ? p : `/api${p}`;
}

export default function AdminTrials() {
  const [status, setStatus] = useState("Pending");
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notesById, setNotesById] = useState({}); // { [requestId]: string }

  const statusValue = useMemo(() => STATUS[status] ?? STATUS.Pending, [status]);

  async function refresh() {
    setBusy(true);
    setError("");
    setActionError("");
    try {
      const res = await api.get(apiPath("/trials/admin/requests"), { params: { status: statusValue } });
      setItems(Array.isArray(res.data) ? res.data : (res.data?.data ?? []));
    } catch (e) {
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
      await api.post(apiPath(`/trials/admin/requests/${requestId}/approve`), { adminNotes });
      await refresh();
    } catch (e) {
      setActionError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function reject(requestId) {
    setBusy(true);
    setActionError("");
    try {
      const adminNotes = (notesById[requestId] || "").trim() || null;
      await api.post(apiPath(`/trials/admin/requests/${requestId}/reject`), { adminNotes });
      await refresh();
    } catch (e) {
      setActionError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="at-page">
      <div className="at-heroCard">
        <div className="at-heroTop">
          <div>
            <div className="at-kicker">LAWFRAICA • ADMIN</div>
            <h1 className="at-title">Trial Requests</h1>
            <p className="at-sub">Approve/reject trial requests. Approval creates a <b>7-day</b> trial subscription.</p>
          </div>

          <div className="at-controls">
            <label className="at-control">
              <span>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={busy}>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </label>

            <button className="at-btn" disabled={busy} onClick={refresh}>
              {busy ? "Loading…" : "Refresh"}
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="at-alert at-err">
          <b>Error:</b> {error}
        </div>
      ) : null}

      {actionError ? (
        <div className="at-alert at-err">
          <b>Action error:</b> {actionError}
        </div>
      ) : null}

      <div className="at-tableCard">
        <div className="at-tableHead">
          <div className="at-th">ID</div>
          <div className="at-th">User</div>
          <div className="at-th">Product</div>
          <div className="at-th">Requested</div>
          <div className="at-th">Actions</div>
        </div>

        {items.length === 0 ? (
          <div className="at-empty">No requests found.</div>
        ) : (
          items.map((r) => {
            const isPending = String(r.status).toLowerCase() === "pending";
            return (
              <div key={r.id} className="at-row">
                <div className="at-id">
                  <div className="at-idMain">#{r.id}</div>
                  <div className="at-idSub">{String(r.status)}</div>
                </div>

                <div className="at-user">
                  <div className="at-userMain">{r?.user?.username || "—"}</div>
                  <div className="at-userSub">{r?.user?.email || "—"}</div>
                  <div className="at-userSub">{r?.user?.phoneNumber || "—"}</div>

                  {r?.reason ? (
                    <div className="at-noteBox">
                      <div className="at-noteLabel">User reason</div>
                      <div className="at-noteText">{r.reason}</div>
                    </div>
                  ) : null}
                </div>

                <div className="at-product">
                  <div className="at-productMain">{r?.product?.name || "—"}</div>
                  <div className="at-productSub">
                    ProductId: {r?.product?.contentProductId ?? r?.contentProductId ?? "—"}
                  </div>
                </div>

                <div className="at-when">
                  <div>{fmt(r.requestedAt)}</div>
                  {r.reviewedAt ? <div className="at-whenSub">Reviewed: {fmt(r.reviewedAt)}</div> : null}
                </div>

                <div className="at-actions">
                  <textarea
                    rows={2}
                    placeholder="Admin notes (optional)"
                    value={notesById[r.id] || ""}
                    onChange={(e) => setNotesById((p) => ({ ...p, [r.id]: e.target.value }))}
                    disabled={busy}
                  />

                  <div className="at-actionBtns">
                    <button className="at-btnPrimary" disabled={busy || !isPending} onClick={() => approve(r.id)}>
                      Approve (7 days)
                    </button>
                    <button className="at-btnGhost" disabled={busy || !isPending} onClick={() => reject(r.id)}>
                      Reject
                    </button>
                  </div>

                  {r?.adminNotes ? (
                    <div className="at-existing">
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
