import { useEffect, useMemo, useState } from "react";
import api from "../../../api/client";

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
      const res = await api.get("/trials/admin/requests", { params: { status: statusValue } });
      setItems(Array.isArray(res.data) ? res.data : []);
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
      await api.post(`/trials/admin/requests/${requestId}/approve`, { adminNotes });
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
      await api.post(`/trials/admin/requests/${requestId}/reject`, { adminNotes });
      await refresh();
    } catch (e) {
      setActionError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Trial Requests</h2>
          <p style={{ marginTop: 6, opacity: 0.8 }}>
            Approve/reject trial requests. Approval creates a <b>7-day</b> trial subscription.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, opacity: 0.8 }}>Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </label>

          <button disabled={busy} onClick={refresh}>
            {busy ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #ffb3b3", background: "#fff5f5" }}>
          <b>Error:</b> {error}
        </div>
      )}

      {actionError && (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid #ffb3b3", background: "#fff5f5" }}>
          <b>Action error:</b> {actionError}
        </div>
      )}

      <div style={{ marginTop: 14, border: "1px solid rgba(0,0,0,0.12)", borderRadius: 10, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "120px 1fr 1fr 220px 240px",
            padding: 10,
            background: "#fafafa",
            fontWeight: 600,
          }}
        >
          <div>ID</div>
          <div>User</div>
          <div>Product</div>
          <div>Requested</div>
          <div>Actions</div>
        </div>

        {items.length === 0 ? (
          <div style={{ padding: 14, opacity: 0.75 }}>No requests found.</div>
        ) : (
          items.map((r) => {
            const isPending = String(r.status).toLowerCase() === "pending";
            return (
              <div
                key={r.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "120px 1fr 1fr 220px 240px",
                  padding: 10,
                  borderTop: "1px solid rgba(0,0,0,0.08)",
                  alignItems: "start",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>#{r.id}</div>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>{String(r.status)}</div>
                </div>

                <div style={{ fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>{r?.user?.username || "—"}</div>
                  <div style={{ opacity: 0.85 }}>{r?.user?.email || "—"}</div>
                  <div style={{ opacity: 0.85 }}>{r?.user?.phoneNumber || "—"}</div>

                  {r?.reason ? (
                    <div
                      style={{
                        marginTop: 8,
                        padding: 8,
                        background: "#fcfcfc",
                        border: "1px solid rgba(0,0,0,0.08)",
                        borderRadius: 8,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>User reason</div>
                      {r.reason}
                    </div>
                  ) : null}
                </div>

                <div style={{ fontSize: 13 }}>
                  <div style={{ fontWeight: 600 }}>{r?.product?.name || "—"}</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    ProductId: {r?.product?.contentProductId ?? r?.contentProductId ?? "—"}
                  </div>
                </div>

                <div style={{ fontSize: 13 }}>
                  <div>{fmt(r.requestedAt)}</div>
                  {r.reviewedAt ? <div style={{ fontSize: 12, opacity: 0.75 }}>Reviewed: {fmt(r.reviewedAt)}</div> : null}
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  <textarea
                    rows={2}
                    placeholder="Admin notes (optional)"
                    value={notesById[r.id] || ""}
                    onChange={(e) => setNotesById((p) => ({ ...p, [r.id]: e.target.value }))}
                  />

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button disabled={busy || !isPending} onClick={() => approve(r.id)}>
                      Approve (7 days)
                    </button>
                    <button disabled={busy || !isPending} onClick={() => reject(r.id)}>
                      Reject
                    </button>
                  </div>

                  {r?.adminNotes ? (
                    <div style={{ fontSize: 12, opacity: 0.8 }}>
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
