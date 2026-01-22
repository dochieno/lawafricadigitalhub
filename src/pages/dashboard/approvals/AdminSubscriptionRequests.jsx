// src/pages/dashboard/approvals/AdminSubscriptionRequests.jsx
import { useEffect, useMemo, useState } from "react";
import api from "../../../api/client";
import "../../../styles/adminCrud.css";
import "../../../styles/adminUsers.css"; // ✅ branding
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
function IView() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}
function ICheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
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

export default function AdminSubscriptionRequests() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [statusFilter, setStatusFilter] = useState("pending");
  const [typeFilter, setTypeFilter] = useState("all");
  const [q, setQ] = useState("");

  // ✅ toast
  const [toast, setToast] = useState(null); // {type:"success"|"error", text:string}

  const [selected, setSelected] = useState(null);
  const [reviewNotes, setReviewNotes] = useState("");

  // ✅ confirm review modal (no window.confirm)
  const [openConfirm, setOpenConfirm] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(true);

  const meIsGlobal = isGlobalAdmin();

  // ✅ Global Admin: see all requests
  // ✅ Admin (non-global): see only what THEY submitted (mine)
  const listEndpoint = meIsGlobal
    ? "/institutions/subscriptions/requests"
    : "/institutions/subscriptions/requests/mine";

  function showError(msg) {
    setToast({ type: "error", text: String(msg || "Request failed.") });
    window.clearTimeout(showError._t);
    showError._t = window.setTimeout(() => setToast(null), 4500);
  }
  function showSuccess(msg) {
    setToast({ type: "success", text: String(msg || "Done.") });
    window.clearTimeout(showSuccess._t);
    showSuccess._t = window.setTimeout(() => setToast(null), 3200);
  }

  async function loadAll(opts) {
    const nextStatus = opts?.status ?? statusFilter;
    const nextType = opts?.type ?? typeFilter;
    const nextQ = opts?.q ?? q;

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
      showError(normalizeApiError(e));
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

  const stats = useMemo(() => {
    const pending = rows.filter((r) => String(statusLabel(extractStatus(r))).toLowerCase() === "pending").length;
    const approved = rows.filter((r) => String(statusLabel(extractStatus(r))).toLowerCase() === "approved").length;
    const rejected = rows.filter((r) => String(statusLabel(extractStatus(r))).toLowerCase() === "rejected").length;

    const suspend = rows.filter((r) => reqTypeLabel(extractType(r)).toLowerCase() === "suspend").length;
    const unsuspend = rows.filter((r) => reqTypeLabel(extractType(r)).toLowerCase() === "unsuspend").length;

    return { pending, approved, rejected, suspend, unsuspend, total: rows.length };
  }, [rows]);

  function openReviewModal(row) {
    setSelected(row);
    setReviewNotes("");
  }

  function closeReviewModal() {
    if (busy) return;
    setSelected(null);
    setReviewNotes("");
    setOpenConfirm(false);
  }

  function requestConfirm(approve) {
    if (!selected) return;
    if (!meIsGlobal) {
      showError("Global Admin is required to review requests.");
      return;
    }

    const pending = String(statusLabel(extractStatus(selected))).toLowerCase() === "pending";
    if (!pending) {
      // view-only: no confirm
      return;
    }

    setConfirmApprove(approve);
    setOpenConfirm(true);
  }

  async function reviewConfirmed() {
    if (!selected) return;

    if (!meIsGlobal) {
      showError("Global Admin is required to review requests.");
      return;
    }

    const requestId = selected.id ?? selected.Id;
    const approve = !!confirmApprove;

    setBusy(true);
    setOpenConfirm(false);

    try {
      const res = await api.post(`/institutions/subscriptions/requests/${requestId}/review`, {
        approve,
        notes: reviewNotes || null,
      });

      const msg = res.data?.message || (approve ? "Request approved and applied." : "Request rejected.");
      showSuccess(msg);
      closeReviewModal();
      await loadAll();
    } catch (e) {
      showError(normalizeApiError(e));
    } finally {
      setBusy(false);
    }
  }

  const subtitle = meIsGlobal
    ? "Review suspend/unsuspend requests (approve/reject)."
    : "Pending approvals you have submitted (view only).";

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
            <div className="au-kicker">LAWFRAICA • APPROVALS</div>
            <h1 className="au-title">Subscription Requests</h1>
            <p className="au-subtitle">{subtitle}</p>
          </div>

          <div className="au-heroRight">
            <button className="au-refresh" onClick={() => loadAll()} disabled={busy || loading} title="Refresh list">
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
              disabled={loading}
            />
            {q ? (
              <button className="au-clear" onClick={() => setQ("")} title="Clear">
                Clear
              </button>
            ) : null}
          </div>

          <div className="au-topbarRight" style={{ gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <select className="admin-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ minWidth: 170 }}>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="all">All</option>
            </select>

            <select className="admin-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ minWidth: 160 }}>
              <option value="all">All types</option>
              <option value="suspend">Suspend</option>
              <option value="unsuspend">Unsuspend</option>
            </select>

            <button className="au-refresh" onClick={() => loadAll()} disabled={busy || loading} title="Search">
              Search
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="au-kpis">
          <div className="au-kpiCard">
            <div className="au-kpiLabel">Total</div>
            <div className="au-kpiValue">{loading ? "…" : stats.total}</div>
          </div>
          <div className="au-kpiCard">
            <div className="au-kpiLabel">Pending</div>
            <div className="au-kpiValue">{loading ? "…" : stats.pending}</div>
          </div>
          <div className="au-kpiCard">
            <div className="au-kpiLabel">Approved / Rejected</div>
            <div className="au-kpiValue">{loading ? "…" : `${stats.approved} / ${stats.rejected}`}</div>
          </div>
          <div className="au-kpiCard">
            <div className="au-kpiLabel">Suspend / Unsuspend</div>
            <div className="au-kpiValue">{loading ? "…" : `${stats.suspend} / ${stats.unsuspend}`}</div>
          </div>
        </div>
      </div>

      {/* PANEL */}
      <div className="au-panel">
        <div className="au-panelTop">
          <div className="au-panelTitle">Requests</div>
          <div className="au-pageMeta">{loading ? "Loading…" : `${filtered.length} request(s)`}</div>
        </div>

        <div className="au-tableWrap">
          <table className="au-table">
            <thead>
              <tr>
                <th style={{ width: "8%" }}>Req #</th>
                <th style={{ width: "20%" }}>Institution</th>
                <th style={{ width: "18%" }}>Product</th>
                <th style={{ width: "9%" }}>Type</th>
                <th style={{ width: "9%" }}>Status</th>
                <th style={{ width: "12%" }}>Requested By</th>
                <th style={{ width: "12%" }}>Created</th>
                <th style={{ width: "10%" }}>Reviewed By</th>
                <th style={{ width: "10%" }}>Reviewed</th>
                <th className="au-thRight" style={{ width: "8%" }}>
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={10}>
                    <div className="au-empty">
                      <div style={{ fontWeight: 950 }}>No requests found.</div>
                      <div className="au-muted" style={{ marginTop: 6 }}>
                        Try adjusting filters or search terms.
                      </div>
                    </div>
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
                    <td style={{ fontWeight: 950 }} className="au-mono">
                      #{id}
                    </td>

                    <td>
                      <div className="au-userCell">
                        <span className={`au-dot ${isPending ? "on" : ""}`} />
                        <div className="au-userMeta">
                          <div className="au-userName">{inst}</div>
                          <div className="au-userSub">
                            <span className="au-muted au-mono">
                              Sub #{r.subscriptionId ?? r.SubscriptionId ?? "—"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

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

                    <td className="au-tdRight">
                      <div className="au-actionsRow">
                        <button
                          className="au-iconBtn au-iconBtn-neutral"
                          onClick={() => openReviewModal(r)}
                          disabled={busy}
                          title={meIsGlobal ? (isPending ? "Review request" : "View request") : "View details (read-only)"}
                        >
                          <IView />
                        </button>
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
            Tip: Admins submit requests; Global Admin approves/rejects them here.
          </span>
        </div>
      </div>

      <AdminPageFooter
        right={
          <span className="admin-footer-muted">
            Tip: For pending requests, Global Admin can approve &amp; apply immediately.
          </span>
        }
      />

      {/* REVIEW / VIEW MODAL */}
      {selected && (
        <div className="admin-modal-overlay" onClick={closeReviewModal}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 980 }}>
            <div className="admin-modal-head admin-modal-head-x" style={{ alignItems: "center" }}>
              <div>
                <h3 className="admin-modal-title">Request #{selected.id ?? selected.Id}</h3>
                <div className="admin-modal-subtitle">
                  {(selected.institutionName ?? selected.InstitutionName) || "—"} —{" "}
                  {(selected.contentProductName ?? selected.ContentProductName) || "—"}
                </div>
              </div>

              <button className="admin-modal-xbtn" onClick={closeReviewModal} disabled={busy} aria-label="Close" title="Close">
                ✕
              </button>
            </div>

            <div className="admin-modal-body admin-modal-scroll">
              <div className="admin-grid" style={{ marginBottom: 12 }}>
                <div className="admin-field">
                  <label>Type</label>
                  <div style={{ paddingTop: 8, fontWeight: 900 }}>{reqTypeLabel(extractType(selected))}</div>
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
                  <div style={{ paddingTop: 8, fontWeight: 900 }}>
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
                  <div style={{ paddingTop: 8, fontWeight: 900 }}>
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
                    placeholder={meIsGlobal ? "Add a review note (optional)…" : "Global Admin will add notes here (view only)."}
                    disabled={!meIsGlobal || busy}
                  />

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
                    onClick={() => requestConfirm(false)}
                    disabled={busy || String(statusLabel(extractStatus(selected))).toLowerCase() !== "pending"}
                    title="Reject request"
                    style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                  >
                    <IX /> Reject
                  </button>

                  <button
                    className="admin-btn primary"
                    onClick={() => requestConfirm(true)}
                    disabled={busy || String(statusLabel(extractStatus(selected))).toLowerCase() !== "pending"}
                    title="Approve request and apply action"
                    style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                  >
                    <ICheck /> Approve &amp; Apply
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM REVIEW MODAL */}
      <ConfirmModal
        open={openConfirm}
        title={confirmApprove ? "Confirm approval" : "Confirm rejection"}
        body={
          <div style={{ marginTop: 6, color: "#6b7280", lineHeight: 1.5 }}>
            {selected ? (
              <>
                You’re about to <b>{confirmApprove ? "APPROVE" : "REJECT"}</b> request{" "}
                <b>#{selected.id ?? selected.Id}</b> for{" "}
                <b>{(selected.institutionName ?? selected.InstitutionName) || "—"}</b>.
                <div style={{ marginTop: 10 }}>
                  Action: <b>{reqTypeLabel(extractType(selected))}</b>
                </div>
                {reviewNotes ? (
                  <div style={{ marginTop: 10 }}>
                    Notes will be saved with this decision.
                  </div>
                ) : (
                  <div style={{ marginTop: 10 }}>
                    No notes provided (optional).
                  </div>
                )}
              </>
            ) : null}
          </div>
        }
        confirmText={confirmApprove ? "Approve & Apply" : "Reject"}
        cancelText="Back"
        busy={busy}
        onCancel={() => setOpenConfirm(false)}
        onConfirm={reviewConfirmed}
      />
    </div>
  );
}
