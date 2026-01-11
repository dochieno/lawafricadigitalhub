// src/pages/dashboard/approvals/AdminSubscriptionRequests.jsx
import { useEffect, useMemo, useState } from "react";
import api from "../../../api/client";
import "../../../styles/adminCrud.css";
import AdminPageFooter from "../../../components/AdminPageFooter";
import { isGlobalAdmin } from "../../../auth/auth";

function toText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    if (v.message) return String(v.message);
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return "An unexpected error occurred.";
    }
  }
  return String(v);
}

function normalizeApiError(e) {
  const status = e?.response?.status;
  const payload = e?.response?.data;

  const serverMsg =
    (typeof payload === "string" && payload) ||
    payload?.message ||
    payload?.error ||
    payload?.title ||
    "";

  if (status === 401) return "Your session has expired. Please log in again.";
  if (status === 403) {
    return (
      serverMsg ||
      "You don’t have permission to access this page. Global Admin is required to review requests."
    );
  }
  return serverMsg || toText(e?.message || "Request failed.");
}

function formatPrettyDateTime(d) {
  if (!d) return "—";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return String(d);
  return x.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function reqTypeLabel(v) {
  const s = String(v ?? "").toLowerCase();
  if (s.includes("suspend") && !s.includes("unsuspend")) return "Suspend";
  if (s.includes("unsuspend")) return "Unsuspend";
  // numeric enum fallback (common: 1 Suspend, 2 Unsuspend)
  const n = Number(v);
  if (!Number.isNaN(n)) {
    if (n === 1) return "Suspend";
    if (n === 2) return "Unsuspend";
  }
  return String(v ?? "—");
}

function statusLabel(v) {
  const s = String(v ?? "").toLowerCase();
  if (s === "pending") return "Pending";
  if (s === "approved") return "Approved";
  if (s === "rejected") return "Rejected";

  // numeric enum fallback (common: 1 Pending, 2 Approved, 3 Rejected)
  const n = Number(v);
  if (!Number.isNaN(n)) {
    if (n === 1) return "Pending";
    if (n === 2) return "Approved";
    if (n === 3) return "Rejected";
  }

  return String(v ?? "—");
}

function statusPillClass(v) {
  const s = String(statusLabel(v)).toLowerCase();
  if (s.includes("approved")) return "ok";
  if (s.includes("pending")) return "warn";
  if (s.includes("rejected")) return "muted";
  return "muted";
}

function extractType(row) {
  return row.requestType ?? row.RequestType ?? row.type ?? row.Type ?? null;
}
function extractStatus(row) {
  return row.status ?? row.Status ?? null;
}
function extractReviewedBy(row) {
  return (
    row.reviewedByUsername ??
    row.ReviewedByUsername ??
    row.reviewedBy ??
    row.ReviewedBy ??
    null
  );
}
function extractReviewedAt(row) {
  return row.reviewedAt ?? row.ReviewedAt ?? null;
}

export default function AdminSubscriptionRequests() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [statusFilter, setStatusFilter] = useState("pending");
  const [typeFilter, setTypeFilter] = useState("all");
  const [q, setQ] = useState("");

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [selected, setSelected] = useState(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const meIsGlobal = isGlobalAdmin();

  // ✅ Global Admin: see all requests
  // ✅ Admin (non-global): see only what THEY submitted (mine)
  const listEndpoint = meIsGlobal
    ? "/institutions/subscriptions/requests"
    : "/institutions/subscriptions/requests/mine";

  async function loadAll(opts) {
    const nextStatus = opts?.status ?? statusFilter;
    const nextType = opts?.type ?? typeFilter;
    const nextQ = opts?.q ?? q;

    setError("");
    setInfo("");
    setLoading(true);

    try {
      const res = await api.get(listEndpoint, {
        params: {
          status: nextStatus,
          type: nextType === "all" ? "" : nextType,
          q: (nextQ || "").trim(),
        },
      });

      const data = res.data?.data ?? res.data;
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setRows([]);
      setError(normalizeApiError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, typeFilter, listEndpoint]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      const inst = (r.institutionName ?? r.InstitutionName ?? "").toLowerCase();
      const prod = (r.contentProductName ?? r.ContentProductName ?? "").toLowerCase();
      const by = (r.requestedByUsername ?? r.RequestedByUsername ?? "").toLowerCase();
      const reqNotes = (r.requestNotes ?? r.RequestNotes ?? "").toLowerCase();
      const revNotes = (r.reviewNotes ?? r.ReviewNotes ?? "").toLowerCase();

      const id = String(r.id ?? r.Id ?? "");
      const sid = String(r.subscriptionId ?? r.SubscriptionId ?? "");

      const reviewedBy = (extractReviewedBy(r) ?? "").toLowerCase();

      return (
        inst.includes(s) ||
        prod.includes(s) ||
        by.includes(s) ||
        reviewedBy.includes(s) ||
        reqNotes.includes(s) ||
        revNotes.includes(s) ||
        id.includes(s) ||
        sid.includes(s)
      );
    });
  }, [rows, q]);

  function openReviewModal(row) {
    setError("");
    setInfo("");
    setSelected(row);
    setReviewNotes("");
  }

  function closeReviewModal() {
    if (busy) return;
    setSelected(null);
    setReviewNotes("");
  }

  async function review(approve) {
    if (!selected) return;

    if (!meIsGlobal) {
      setError("Global Admin is required to review requests.");
      return;
    }

    const requestId = selected.id ?? selected.Id;
    const label = approve ? "approve" : "reject";

    if (!window.confirm(`Confirm ${label} this request?`)) return;

    setBusy(true);
    setError("");
    setInfo("");

    try {
      const res = await api.post(`/institutions/subscriptions/requests/${requestId}/review`, {
        approve,
        notes: reviewNotes || null,
      });

      const msg = res.data?.message || (approve ? "Request approved and applied." : "Request rejected.");
      setInfo(msg);
      closeReviewModal();
      await loadAll();
    } catch (e) {
      setError(normalizeApiError(e));
    } finally {
      setBusy(false);
    }
  }

  const subtitle = meIsGlobal
    ? "Review suspend/unsuspend requests (approve/reject)."
    : "Pending approvals you have submitted (view only).";

  return (
    <div className="admin-page admin-page-wide">
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Approvals · Subscription Requests</h1>
          <p className="admin-subtitle">{subtitle}</p>
        </div>

        <div className="admin-actions">
          <button className="admin-btn" onClick={() => loadAll()} disabled={busy || loading}>
            Refresh
          </button>
        </div>
      </div>

      {(error || info) && (
        <div className={`admin-alert ${error ? "error" : "ok"}`}>{error ? error : info}</div>
      )}

      <div className="admin-card admin-card-fill">
        <div className="admin-toolbar">
          <input
            className="admin-search admin-search-wide"
            placeholder={
              meIsGlobal
                ? "Search (institution, product, requester, reviewer, notes, ids)…"
                : "Search your requests (institution, product, notes, ids)…"
            }
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") loadAll();
            }}
          />

          <select
            className="admin-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ minWidth: 170 }}
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All</option>
          </select>

          <select
            className="admin-select"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{ minWidth: 160 }}
          >
            <option value="all">All types</option>
            <option value="suspend">Suspend</option>
            <option value="unsuspend">Unsuspend</option>
          </select>

          <div className="admin-pill muted">{loading ? "Loading…" : `${filtered.length} request(s)`}</div>

          <button className="admin-btn" onClick={() => loadAll()} disabled={busy || loading}>
            Search
          </button>
        </div>

        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: "8%" }}>Req #</th>
              <th style={{ width: "18%" }}>Institution</th>
              <th style={{ width: "18%" }}>Product</th>
              <th style={{ width: "9%" }}>Type</th>
              <th style={{ width: "9%" }}>Status</th>
              <th style={{ width: "11%" }}>Requested By</th>
              <th style={{ width: "11%" }}>Created</th>
              <th style={{ width: "10%" }}>Reviewed By</th>
              <th style={{ width: "10%" }}>Reviewed</th>
              <th style={{ textAlign: "right", width: "8%" }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={10} style={{ color: "#6b7280", padding: "14px" }}>
                  No requests found.
                </td>
              </tr>
            )}

            {filtered.map((r) => {
              const id = r.id ?? r.Id;
              const inst = r.institutionName ?? r.InstitutionName ?? "—";
              const prod = r.contentProductName ?? r.ContentProductName ?? "—";

              const type = extractType(r);
              const status = extractStatus(r);

              const by =
                r.requestedByUsername ??
                r.RequestedByUsername ??
                `User #${r.requestedByUserId ?? r.RequestedByUserId ?? "—"}`;

              const created = r.createdAt ?? r.CreatedAt;

              const reviewedBy = extractReviewedBy(r);
              const reviewedAt = extractReviewedAt(r);

              const statusText = statusLabel(status);
              const pillClass = statusPillClass(status);

              const isPending = String(statusText).toLowerCase() === "pending";

              return (
                <tr key={id}>
                  <td style={{ fontWeight: 900 }}>#{id}</td>
                  <td style={{ fontWeight: 900 }}>{inst}</td>
                  <td>{prod}</td>
                  <td>
                    <span className="admin-pill muted">{reqTypeLabel(type)}</span>
                  </td>
                  <td>
                    <span className={`admin-pill ${pillClass}`}>{statusText}</span>
                  </td>
                  <td>{by}</td>
                  <td>{formatPrettyDateTime(created)}</td>
                  <td>{reviewedBy || <span style={{ color: "#9ca3af" }}>—</span>}</td>
                  <td>{reviewedAt ? formatPrettyDateTime(reviewedAt) : <span style={{ color: "#9ca3af" }}>—</span>}</td>
                  <td>
                    <div className="admin-row-actions" style={{ justifyContent: "flex-end", gap: 10 }}>
                      <button
                        className="admin-action-btn neutral small"
                        onClick={() => openReviewModal(r)}
                        disabled={busy}
                        title={
                          meIsGlobal ? (isPending ? "Review request" : "View request") : "View details (read-only)"
                        }
                      >
                        {meIsGlobal ? (isPending ? "Review" : "View") : "View"}
                      </button>
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
            Tip: Admins submit requests; Global Admin approves/rejects them here.
          </span>
        }
      />

      {/* REVIEW / VIEW MODAL */}
      {selected && (
        <div className="admin-modal-overlay" onClick={closeReviewModal}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 980 }}>
            <div className="admin-modal-head" style={{ alignItems: "center" }}>
              <div>
                <h3 className="admin-modal-title">Request #{selected.id ?? selected.Id}</h3>
                <div className="admin-modal-subtitle">
                  {(selected.institutionName ?? selected.InstitutionName) || "—"} —{" "}
                  {(selected.contentProductName ?? selected.ContentProductName) || "—"}
                </div>
              </div>

              <button className="admin-btn" onClick={closeReviewModal} disabled={busy}>
                Close
              </button>
            </div>

            <div className="admin-modal-body admin-modal-scroll">
              <div className="admin-grid" style={{ marginBottom: 12 }}>
                <div className="admin-field">
                  <label>Type</label>
                  <div style={{ paddingTop: 8, fontWeight: 800 }}>
                    {reqTypeLabel(extractType(selected))}
                  </div>
                </div>

                <div className="admin-field">
                  <label>Status</label>
                  <div style={{ paddingTop: 8 }}>
                    <span className={`admin-pill ${statusPillClass(extractStatus(selected))}`}>
                      {statusLabel(extractStatus(selected))}
                    </span>
                  </div>
                </div>

                <div className="admin-field">
                  <label>Requested By</label>
                  <div style={{ paddingTop: 8, fontWeight: 800 }}>
                    {(selected.requestedByUsername ?? selected.RequestedByUsername) ||
                      `User #${selected.requestedByUserId ?? selected.RequestedByUserId ?? "—"}`}
                  </div>
                </div>

                <div className="admin-field">
                  <label>Created</label>
                  <div style={{ paddingTop: 8 }}>{formatPrettyDateTime(selected.createdAt ?? selected.CreatedAt)}</div>
                </div>

                <div className="admin-field">
                  <label>Reviewed By</label>
                  <div style={{ paddingTop: 8, fontWeight: 800 }}>
                    {extractReviewedBy(selected) || <span style={{ color: "#9ca3af" }}>—</span>}
                  </div>
                </div>

                <div className="admin-field">
                  <label>Reviewed At</label>
                  <div style={{ paddingTop: 8 }}>
                    {extractReviewedAt(selected) ? (
                      formatPrettyDateTime(extractReviewedAt(selected))
                    ) : (
                      <span style={{ color: "#9ca3af" }}>—</span>
                    )}
                  </div>
                </div>

                <div className="admin-field admin-span2">
                  <label>Request Notes</label>
                  <div style={{ paddingTop: 8, color: "#374151", whiteSpace: "pre-wrap" }}>
                    {(selected.requestNotes ?? selected.RequestNotes) || <span style={{ color: "#9ca3af" }}>—</span>}
                  </div>
                </div>

                <div className="admin-field admin-span2">
                  <label>Review Notes {meIsGlobal ? "(optional)" : ""}</label>
                  <textarea
                    rows={4}
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder={
                      meIsGlobal ? "Add a review note (optional)…" : "Global Admin will add notes here (view only)."
                    }
                    disabled={!meIsGlobal || busy}
                  />
                  {/* If already reviewed, show saved review notes under textarea in view-only way */}
                  {!meIsGlobal && (selected.reviewNotes ?? selected.ReviewNotes) ? (
                    <div className="admin-help" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                      <b>Saved review note:</b> {selected.reviewNotes ?? selected.ReviewNotes}
                    </div>
                  ) : null}
                </div>
              </div>

              {!meIsGlobal && (
                <div className="admin-alert" style={{ marginTop: 8 }}>
                  This is a read-only view. A Global Admin must approve/reject this request.
                </div>
              )}
            </div>

            <div className="admin-modal-foot" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <button className="admin-btn" onClick={closeReviewModal} disabled={busy}>
                Close
              </button>

              {meIsGlobal && (
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    className="admin-btn"
                    onClick={() => review(false)}
                    disabled={busy || String(statusLabel(extractStatus(selected))).toLowerCase() !== "pending"}
                    title="Reject request"
                  >
                    Reject
                  </button>

                  <button
                    className="admin-btn primary"
                    onClick={() => review(true)}
                    disabled={busy || String(statusLabel(extractStatus(selected))).toLowerCase() !== "pending"}
                    title="Approve request and apply action"
                  >
                    Approve &amp; Apply
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
