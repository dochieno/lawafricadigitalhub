// src/pages/dashboard/admin/AdminInstitutionSubscriptions.jsx
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
  if (status === 403)
    return (
      serverMsg ||
      "You don’t have permission to do that. This action requires Global Admin approval."
    );

  return serverMsg || toText(e?.message || "Request failed.");
}

function formatPrettyDate(d) {
  if (!d) return "—";
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return String(d);
  return x.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
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

function todayYmd() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseStatus(v) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;

  const s = String(v).trim();
  const n = Number(s);
  if (!Number.isNaN(n)) return n;

  const lower = s.toLowerCase();
  if (lower === "pending") return 1;
  if (lower === "active") return 2;
  if (lower === "expired") return 3;
  if (lower === "suspended") return 4;

  return 0;
}

function statusLabel(v) {
  const n = parseStatus(v);
  if (n === 1) return "Pending";
  if (n === 2) return "Active";
  if (n === 3) return "Expired";
  if (n === 4) return "Suspended";
  return String(v ?? "—");
}

function statusPillClass(v) {
  const n = parseStatus(v);
  if (n === 2) return "ok";
  if (n === 1) return "warn";
  if (n === 4) return "warn";
  return "muted";
}

function parseAuditAction(v) {
  if (v == null || v === "") return "—";
  if (typeof v === "string") return v;
  return String(v);
}

// --------------------
// Pending request helpers (UX)
// --------------------
function getPendingRequestId(row) {
  return row.pendingRequestId ?? row.PendingRequestId ?? null;
}

function getPendingRequestType(row) {
  const t = row.pendingRequestType ?? row.PendingRequestType ?? null;

  if (t == null) return null;

  if (typeof t === "string") {
    const lower = t.toLowerCase();
    if (lower.includes("unsuspend")) return "Unsuspend";
    if (lower.includes("suspend")) return "Suspend";
    return t;
  }

  // If your enum maps: 1 = Suspend, 2 = Unsuspend (common)
  if (typeof t === "number") {
    if (t === 1) return "Suspend";
    if (t === 2) return "Unsuspend";
    return String(t);
  }

  return String(t);
}

function getPendingRequestedAt(row) {
  return row.pendingRequestedAt ?? row.PendingRequestedAt ?? null;
}

function pendingLabel(row) {
  const type = getPendingRequestType(row);
  if (!type) return null;
  return `${type} pending`;
}

// --------------------
// Forms
// --------------------
const emptyCreateForm = {
  institutionId: "",
  contentProductId: "",
  durationInMonths: "12",
  startDate: "",
};

const emptyRenewForm = {
  durationInMonths: "12",
  startDate: "",
};

export default function AdminInstitutionSubscriptions() {
  const [rows, setRows] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [products, setProducts] = useState([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // Create
  const [openCreate, setOpenCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ ...emptyCreateForm, startDate: todayYmd() });

  // Renew
  const [openRenew, setOpenRenew] = useState(false);
  const [renewForm, setRenewForm] = useState({ ...emptyRenewForm });
  const [renewTarget, setRenewTarget] = useState(null);

  // Audit modal
  const [openAudit, setOpenAudit] = useState(false);
  const [auditTarget, setAuditTarget] = useState(null);
  const [auditRows, setAuditRows] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  // ✅ Requests history modal (approval logs)
  const [openReqLog, setOpenReqLog] = useState(false);
  const [reqLogTarget, setReqLogTarget] = useState(null);
  const [reqLogRows, setReqLogRows] = useState([]);
  const [reqLogLoading, setReqLogLoading] = useState(false);

  // ✅ Request action modal (notes)
  const [openReqAction, setOpenReqAction] = useState(false);
  const [reqActionRow, setReqActionRow] = useState(null);
  const [reqActionMode, setReqActionMode] = useState(null); // "suspend" | "unsuspend"
  const [reqActionNotes, setReqActionNotes] = useState("");

  const meIsGlobal = isGlobalAdmin();

  async function loadAll() {
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const res = await api.get("/institutions/subscriptions");
      const data = res.data?.data ?? res.data;
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setRows([]);
      setError(normalizeApiError(e) || "Failed to load subscriptions.");
    } finally {
      setLoading(false);
    }
  }

  async function loadInstitutions() {
    try {
      const res = await api.get("/Institutions");
      const data = res.data?.data ?? res.data;
      setInstitutions(Array.isArray(data) ? data : []);
    } catch {
      setInstitutions([]);
    }
  }

  async function loadProducts() {
    try {
      const res = await api.get("/content-products");
      const data = res.data?.data ?? res.data;
      setProducts(Array.isArray(data) ? data : []);
    } catch {
      setProducts([]);
    }
  }

  useEffect(() => {
    loadAll();
    loadInstitutions();
    loadProducts();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (statusFilter === "all") return true;
        const n = parseStatus(r.status ?? r.Status);
        return n === Number(statusFilter);
      })
      .filter((r) => {
        if (!s) return true;
        const inst = (r.institutionName ?? r.InstitutionName ?? "").toLowerCase();
        const prod = (r.contentProductName ?? r.ContentProductName ?? "").toLowerCase();
        const st = statusLabel(r.status ?? r.Status).toLowerCase();
        const p = (pendingLabel(r) ?? "").toLowerCase();
        return inst.includes(s) || prod.includes(s) || st.includes(s) || p.includes(s);
      });
  }, [rows, q, statusFilter]);

  // --------------------
  // Modal open/close
  // --------------------
  function closeCreateModal() {
    if (busy) return;
    setOpenCreate(false);
  }

  function closeRenewModal() {
    if (busy) return;
    setOpenRenew(false);
    setRenewTarget(null);
  }

  function openCreateModal() {
    setError("");
    setInfo("");
    setCreateForm({ ...emptyCreateForm, startDate: todayYmd() });
    setOpenCreate(true);
  }

  function openRenewModalFor(row) {
    setError("");
    setInfo("");

    const statusNum = parseStatus(row.status ?? row.Status);
    if (statusNum === 4) {
      setError("This subscription is Suspended. Unsuspend it before renewing.");
      return;
    }

    setRenewTarget(row);
    setRenewForm({ ...emptyRenewForm, startDate: "" });
    setOpenRenew(true);
  }

  async function openAuditModalFor(row) {
    setError("");
    setInfo("");
    setAuditTarget(row);
    setAuditRows([]);
    setOpenAudit(true);

    const id = row.id ?? row.Id;
    setAuditLoading(true);
    try {
      const res = await api.get(`/institutions/subscriptions/${id}/audit`);
      const data = res.data?.data ?? res.data;
      setAuditRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setAuditRows([]);
      setError(normalizeApiError(e) || "Failed to load audit history.");
    } finally {
      setAuditLoading(false);
    }
  }

  function closeAuditModal() {
    if (busy || auditLoading) return;
    setOpenAudit(false);
    setAuditTarget(null);
    setAuditRows([]);
  }

  // --------------------
  // ✅ Requests history modal (approval logs)
  // --------------------
  async function openReqLogModalFor(row) {
    setError("");
    setInfo("");
    setReqLogTarget(row);
    setReqLogRows([]);
    setOpenReqLog(true);

    const id = row.id ?? row.Id;
    setReqLogLoading(true);
    try {
      // ✅ This endpoint MUST exist in backend.
      // Recommended: GET /api/institutions/subscriptions/{id}/requests
      const res = await api.get(`/institutions/subscriptions/${id}/requests`);
      const data = res.data?.data ?? res.data;
      setReqLogRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setReqLogRows([]);
      setError(normalizeApiError(e) || "Failed to load request history.");
    } finally {
      setReqLogLoading(false);
    }
  }

  function closeReqLogModal() {
    if (busy || reqLogLoading) return;
    setOpenReqLog(false);
    setReqLogTarget(null);
    setReqLogRows([]);
  }

  // --------------------
  // ✅ Request action modal (notes)
  // --------------------
  function openRequestActionModal(row, mode) {
    if (busy) return;

    const pendingId = getPendingRequestId(row);
    if (pendingId) {
      setError("There is already a pending request for this subscription. Review it before submitting another.");
      return;
    }

    setError("");
    setInfo("");
    setReqActionRow(row);
    setReqActionMode(mode);
    setReqActionNotes("");
    setOpenReqAction(true);
  }

  function closeRequestActionModal() {
    if (busy) return;
    setOpenReqAction(false);
    setReqActionRow(null);
    setReqActionMode(null);
    setReqActionNotes("");
  }

  async function submitRequestAction(e) {
    e?.preventDefault?.();
    if (!reqActionRow || !reqActionMode) return;

    const row = reqActionRow;
    const id = row.id ?? row.Id;

    const inst = (row.institutionName ?? row.InstitutionName) || "—";
    const prod = (row.contentProductName ?? row.ContentProductName) || "—";

    const mode = reqActionMode; // suspend | unsuspend
    const isSuspend = mode === "suspend";

    const actionLabel = meIsGlobal
      ? isSuspend
        ? "Suspend"
        : "Unsuspend"
      : isSuspend
      ? "Request Suspend"
      : "Request Unsuspend";

    if (
      !window.confirm(
        `Confirm ${actionLabel}?\n\nInstitution: ${inst}\nProduct: ${prod}${reqActionNotes ? `\nNotes: ${reqActionNotes}` : ""}`
      )
    ) {
      return;
    }

    setBusy(true);
    setError("");
    setInfo("");

    try {
      if (meIsGlobal) {
        // Global admin direct action
        await api.post(
          `/institutions/subscriptions/${id}/${isSuspend ? "suspend" : "unsuspend"}`,
          { notes: reqActionNotes || null }
        );
        setInfo(isSuspend ? "Subscription suspended." : "Subscription updated.");
      } else {
        // Admin request flow
        const res = await api.post(
          `/institutions/subscriptions/${id}/${isSuspend ? "request-suspend" : "request-unsuspend"}`,
          { notes: reqActionNotes || null }
        );
        setInfo(res.data?.message || "Request submitted for approval.");
      }

      closeRequestActionModal();
      await loadAll();
    } catch (err) {
      setError(normalizeApiError(err) || "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  // --------------------
  // Create / Extend
  // --------------------
  async function createOrExtend(e) {
    e?.preventDefault?.();
    setError("");
    setInfo("");

    if (!createForm.institutionId) return setError("Institution is required.");
    if (!createForm.contentProductId) return setError("Product is required.");

    const months = Number(createForm.durationInMonths);
    if (!months || months <= 0) return setError("Duration must be > 0.");

    const startDateIso = createForm.startDate ? `${createForm.startDate}T00:00:00Z` : null;

    const payload = {
      institutionId: Number(createForm.institutionId),
      contentProductId: Number(createForm.contentProductId),
      durationInMonths: months,
      startDate: startDateIso,
    };

    setBusy(true);
    try {
      const res = await api.post("/institutions/subscriptions", payload);
      const endDate = res.data?.endDate ?? res.data?.EndDate ?? res.data?.subscription?.endDate;
      const status = res.data?.status ?? res.data?.Status;

      setInfo(`Saved. Status: ${statusLabel(status)}. Ends: ${endDate ? formatPrettyDate(endDate) : "—"}`);
      closeCreateModal();
      await loadAll();
    } catch (e2) {
      setError(normalizeApiError(e2) || "Create/extend failed.");
    } finally {
      setBusy(false);
    }
  }

  // --------------------
  // Renew
  // --------------------
  async function renew(e) {
    e?.preventDefault?.();
    setError("");
    setInfo("");

    if (!renewTarget) return setError("No subscription selected.");

    const statusNum = parseStatus(renewTarget.status ?? renewTarget.Status);
    if (statusNum === 4) return setError("This subscription is Suspended. Unsuspend it before renewing.");

    const months = Number(renewForm.durationInMonths);
    if (!months || months <= 0) return setError("Duration must be > 0.");

    const startDateIso = renewForm.startDate ? `${renewForm.startDate}T00:00:00Z` : null;

    const inst = (renewTarget.institutionName ?? renewTarget.InstitutionName) || "—";
    const prod = (renewTarget.contentProductName ?? renewTarget.ContentProductName) || "—";
    const msg = `Confirm renewal?\n\nInstitution: ${inst}\nProduct: ${prod}\nMonths: ${months}${
      renewForm.startDate ? `\nStart: ${renewForm.startDate}` : "\nStart: (Rule A / automatic)"
    }`;

    if (!window.confirm(msg)) return;

    setBusy(true);
    try {
      const id = renewTarget.id ?? renewTarget.Id;
      const res = await api.post(`/institutions/subscriptions/${id}/renew`, {
        durationInMonths: months,
        startDate: startDateIso,
      });

      const endDate = res.data?.endDate ?? res.data?.EndDate;
      const status = res.data?.status ?? res.data?.Status;

      setInfo(`Renewed. Status: ${statusLabel(status)}. Ends: ${endDate ? formatPrettyDate(endDate) : "—"}`);
      closeRenewModal();
      await loadAll();
    } catch (e2) {
      setError(normalizeApiError(e2) || "Renew failed.");
    } finally {
      setBusy(false);
    }
  }

  // Buttons -> open modal (notes)
  function suspend(row) {
    openRequestActionModal(row, "suspend");
  }

  function unsuspend(row) {
    openRequestActionModal(row, "unsuspend");
  }

  return (
    <div className="admin-page admin-page-wide">
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Admin · Institution Subscriptions</h1>
          <p className="admin-subtitle">
            Create/extend, renew and manage institution subscriptions.
            {!meIsGlobal && (
              <span style={{ marginLeft: 8, color: "#6b7280" }}>
                (Suspend/Unsuspend requires Global Admin approval.)
              </span>
            )}
          </p>
        </div>

        <div className="admin-actions">
          <button className="admin-btn" onClick={loadAll} disabled={busy || loading}>
            Refresh
          </button>
          <button className="admin-btn primary compact" onClick={openCreateModal} disabled={busy}>
            + New
          </button>
        </div>
      </div>

      {(error || info) && <div className={`admin-alert ${error ? "error" : "ok"}`}>{error ? error : info}</div>}

      <div className="admin-card admin-card-fill">
        <div className="admin-toolbar">
          <input
            className="admin-search admin-search-wide"
            placeholder="Search by institution, product, status, or pending…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <select
            className="admin-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ minWidth: 200 }}
          >
            <option value="all">All statuses</option>
            <option value="1">Pending</option>
            <option value="2">Active</option>
            <option value="3">Expired</option>
            <option value="4">Suspended</option>
          </select>

          <div className="admin-pill muted">{loading ? "Loading…" : `${filtered.length} subscription(s)`}</div>
        </div>

        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: "22%" }}>Institution</th>
              <th style={{ width: "26%" }}>Product</th>
              <th style={{ width: "16%" }}>Status</th>
              <th style={{ width: "14%" }}>End</th>
              <th style={{ textAlign: "right", width: "22%" }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: "#6b7280", padding: "14px" }}>
                  No subscriptions found.
                </td>
              </tr>
            )}

            {filtered.map((r) => {
              const id = r.id ?? r.Id;
              const inst = r.institutionName ?? r.InstitutionName ?? "—";
              const prod = r.contentProductName ?? r.ContentProductName ?? "—";
              const statusVal = r.status ?? r.Status;
              const end = r.endDate ?? r.EndDate;

              const statusText = statusLabel(statusVal);
              const pillClass = statusPillClass(statusVal);

              const statusNum = parseStatus(statusVal);
              const isSuspended = statusNum === 4;

              const pendingId = getPendingRequestId(r);
              const pendingText = pendingLabel(r);
              const pendingAt = getPendingRequestedAt(r);

              const actionDisabled = !!pendingId || busy;
              const pendingTitle = pendingText
                ? `${pendingText}${pendingAt ? ` • requested ${formatPrettyDateTime(pendingAt)}` : ""}`
                : "";

              return (
                <tr key={id}>
                  <td style={{ fontWeight: 900 }}>
                    {inst}
                    {pendingText && (
                      <div style={{ marginTop: 6 }}>
                        <span className="admin-pill warn" title={pendingTitle}>
                          {pendingText}
                        </span>
                      </div>
                    )}
                  </td>

                  <td>{prod}</td>

                  <td>
                    <span className={`admin-pill ${pillClass}`}>{statusText}</span>
                  </td>

                  <td>{formatPrettyDate(end)}</td>

                  <td>
                    <div className="admin-row-actions actions-inline" style={{ justifyContent: "flex-end", gap: 10 }}>
                      <button
                        className="admin-action-btn neutral small"
                        onClick={() => openAuditModalFor(r)}
                        disabled={busy}
                        title="View audit history"
                      >
                        Audit
                      </button>

                      <button
                        className="admin-action-btn neutral small"
                        onClick={() => openReqLogModalFor(r)}
                        disabled={busy}
                        title="View requests / approval logs"
                      >
                        Requests
                      </button>

                      <button
                        className="admin-action-btn neutral small"
                        onClick={() => openRenewModalFor(r)}
                        disabled={busy || isSuspended}
                        title={isSuspended ? "Unsuspend first" : "Renew (Rule A: extends from EndDate if still active)"}
                      >
                        Renew
                      </button>

                      {!isSuspended ? (
                        <button
                          className="admin-action-btn warn small"
                          onClick={() => suspend(r)}
                          disabled={actionDisabled}
                          title={
                            pendingId
                              ? `Disabled: ${pendingTitle}`
                              : meIsGlobal
                              ? "Suspend subscription"
                              : "Request suspension (needs approval)"
                          }
                        >
                          {meIsGlobal ? "Suspend" : "Request Suspend"}
                        </button>
                      ) : (
                        <button
                          className="admin-action-btn ok small"
                          onClick={() => unsuspend(r)}
                          disabled={actionDisabled}
                          title={
                            pendingId
                              ? `Disabled: ${pendingTitle}`
                              : meIsGlobal
                              ? "Unsuspend subscription"
                              : "Request unsuspend (needs approval)"
                          }
                        >
                          {meIsGlobal ? "Unsuspend" : "Request Unsuspend"}
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
        right={<span className="admin-footer-muted">Tip: Suspended subscriptions must be unsuspended before renewing.</span>}
      />

      {/* ========================= */}
      {/* CREATE MODAL */}
      {/* ========================= */}
      {openCreate && (
        <div className="admin-modal-overlay" onClick={closeCreateModal}>
          <div className="admin-modal admin-modal-tight" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <div>
                <h3 className="admin-modal-title">Create / Extend Subscription</h3>
                <div className="admin-modal-subtitle">Creates a new subscription or extends the existing one.</div>
              </div>

              <button className="admin-btn" onClick={closeCreateModal} disabled={busy}>
                Close
              </button>
            </div>

            <form className="admin-modal-body admin-modal-scroll" onSubmit={createOrExtend}>
              <div className="admin-grid">
                <div className="admin-field">
                  <label>Institution *</label>
                  <select
                    value={createForm.institutionId}
                    onChange={(e) => setCreateForm((p) => ({ ...p, institutionId: e.target.value }))}
                  >
                    <option value="">Select institution…</option>
                    {institutions.map((i) => (
                      <option key={i.id ?? i.Id} value={i.id ?? i.Id}>
                        {i.name ?? i.Name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-field">
                  <label>Product *</label>
                  <select
                    value={createForm.contentProductId}
                    onChange={(e) => setCreateForm((p) => ({ ...p, contentProductId: e.target.value }))}
                  >
                    <option value="">Select product…</option>
                    {products.map((p) => (
                      <option key={p.id ?? p.Id} value={p.id ?? p.Id}>
                        {p.name ?? p.Name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-field">
                  <label>Start date</label>
                  <input
                    type="date"
                    value={createForm.startDate}
                    onChange={(e) => setCreateForm((p) => ({ ...p, startDate: e.target.value }))}
                  />
                  <div className="admin-help" style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>
                    Defaults to today. Choose a future date to schedule (Pending until start).
                  </div>
                </div>

                <div className="admin-field">
                  <label>Duration (months) *</label>
                  <select
                    value={createForm.durationInMonths}
                    onChange={(e) => setCreateForm((p) => ({ ...p, durationInMonths: e.target.value }))}
                  >
                    <option value="1">1</option>
                    <option value="3">3</option>
                    <option value="6">6</option>
                    <option value="12">12</option>
                    <option value="24">24</option>
                  </select>
                </div>
              </div>

              <div className="admin-note" style={{ marginTop: 10 }}>
                <b>Backend:</b> POST <code>/api/institutions/subscriptions</code>
              </div>

              <div className="admin-modal-foot">
                <button className="admin-btn" type="button" onClick={closeCreateModal} disabled={busy}>
                  Cancel
                </button>
                <button className="admin-btn primary" type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Create / Extend"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================= */}
      {/* RENEW MODAL */}
      {/* ========================= */}
      {openRenew && renewTarget && (
        <div className="admin-modal-overlay" onClick={closeRenewModal}>
          <div className="admin-modal admin-modal-tight" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <div>
                <h3 className="admin-modal-title">Renew Subscription</h3>
                <div className="admin-modal-subtitle">
                  Rule A: if still active, renewal extends from current EndDate. Otherwise from now (unless you pick a start date).
                </div>
              </div>

              <button className="admin-btn" onClick={closeRenewModal} disabled={busy}>
                Close
              </button>
            </div>

            <form className="admin-modal-body admin-modal-scroll" onSubmit={renew}>
              <div className="admin-grid">
                <div className="admin-field admin-span2">
                  <label>Target</label>
                  <div style={{ fontWeight: 800, paddingTop: 8 }}>
                    {(renewTarget.institutionName ?? renewTarget.InstitutionName) || "—"} —{" "}
                    {(renewTarget.contentProductName ?? renewTarget.ContentProductName) || "—"}
                  </div>
                </div>

                <div className="admin-field">
                  <label>Optional start date</label>
                  <input
                    type="date"
                    value={renewForm.startDate}
                    onChange={(e) => setRenewForm((p) => ({ ...p, startDate: e.target.value }))}
                  />
                  <div className="admin-help" style={{ color: "#6b7280", fontSize: 12, marginTop: 4 }}>
                    Leave empty to use Rule A automatically.
                  </div>
                </div>

                <div className="admin-field">
                  <label>Duration (months) *</label>
                  <select
                    value={renewForm.durationInMonths}
                    onChange={(e) => setRenewForm((p) => ({ ...p, durationInMonths: e.target.value }))}
                  >
                    <option value="1">1</option>
                    <option value="3">3</option>
                    <option value="6">6</option>
                    <option value="12">12</option>
                    <option value="24">24</option>
                  </select>
                </div>
              </div>

              <div className="admin-note" style={{ marginTop: 10 }}>
                <b>Backend:</b> POST <code>/api/institutions/subscriptions/{`{id}`}/renew</code>
              </div>

              <div className="admin-modal-foot">
                <button className="admin-btn" type="button" onClick={closeRenewModal} disabled={busy}>
                  Cancel
                </button>
                <button className="admin-btn primary" type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Renew"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================= */}
      {/* AUDIT MODAL */}
      {/* ========================= */}
      {openAudit && auditTarget && (
        <div className="admin-modal-overlay" onClick={closeAuditModal}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 1100 }}>
            <div className="admin-modal-head">
              <div>
                <h3 className="admin-modal-title">Subscription Audit History</h3>
                <div className="admin-modal-subtitle">
                  {(auditTarget.institutionName ?? auditTarget.InstitutionName) || "—"} —{" "}
                  {(auditTarget.contentProductName ?? auditTarget.ContentProductName) || "—"}
                </div>
              </div>

              <button className="admin-btn" onClick={closeAuditModal} disabled={busy || auditLoading}>
                Close
              </button>
            </div>

            <div className="admin-modal-body admin-modal-scroll">
              {auditLoading && <div className="admin-inline-loading">Loading history…</div>}

              {!auditLoading && auditRows.length === 0 && (
                <div className="admin-alert" style={{ background: "#fff", border: "1px solid #e5e7eb" }}>
                  No audit entries found.
                </div>
              )}

              {!auditLoading && auditRows.length > 0 && (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th style={{ width: "16%" }}>When</th>
                      <th style={{ width: "12%" }}>Action</th>
                      <th style={{ width: "10%" }}>UserId</th>
                      <th style={{ width: "12%" }}>Old Status</th>
                      <th style={{ width: "12%" }}>New Status</th>
                      <th style={{ width: "14%" }}>Old End</th>
                      <th style={{ width: "14%" }}>New End</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditRows.map((a) => {
                      const aid = a.id ?? a.Id;
                      const when = a.createdAt ?? a.CreatedAt;
                      const action = a.action ?? a.Action;
                      const userId = a.performedByUserId ?? a.PerformedByUserId;

                      const oldStatus = a.oldStatus ?? a.OldStatus;
                      const newStatus = a.newStatus ?? a.NewStatus;

                      const oldEnd = a.oldEndDate ?? a.OldEndDate;
                      const newEnd = a.newEndDate ?? a.NewEndDate;

                      const notes = a.notes ?? a.Notes;

                      return (
                        <tr key={aid}>
                          <td>{formatPrettyDateTime(when)}</td>
                          <td>
                            <span className="admin-pill muted">{parseAuditAction(action)}</span>
                          </td>
                          <td>{userId ?? "—"}</td>
                          <td>
                            <span className={`admin-pill ${statusPillClass(oldStatus)}`}>{statusLabel(oldStatus)}</span>
                          </td>
                          <td>
                            <span className={`admin-pill ${statusPillClass(newStatus)}`}>{statusLabel(newStatus)}</span>
                          </td>
                          <td>{formatPrettyDate(oldEnd)}</td>
                          <td>{formatPrettyDate(newEnd)}</td>
                          <td style={{ color: "#374151" }}>{notes || <span style={{ color: "#9ca3af" }}>—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="admin-modal-foot">
              <button className="admin-btn" onClick={closeAuditModal} disabled={busy || auditLoading}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================= */}
      {/* REQUEST / APPROVAL LOG MODAL */}
      {/* ========================= */}
      {openReqLog && reqLogTarget && (
        <div className="admin-modal-overlay" onClick={closeReqLogModal}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 1100 }}>
            <div className="admin-modal-head">
              <div>
                <h3 className="admin-modal-title">Request / Approval Logs</h3>
                <div className="admin-modal-subtitle">
                  {(reqLogTarget.institutionName ?? reqLogTarget.InstitutionName) || "—"} —{" "}
                  {(reqLogTarget.contentProductName ?? reqLogTarget.ContentProductName) || "—"}
                </div>
              </div>

              <button className="admin-btn" onClick={closeReqLogModal} disabled={busy || reqLogLoading}>
                Close
              </button>
            </div>

            <div className="admin-modal-body admin-modal-scroll">
              {reqLogLoading && <div className="admin-inline-loading">Loading request logs…</div>}

              {!reqLogLoading && reqLogRows.length === 0 && (
                <div className="admin-alert" style={{ background: "#fff", border: "1px solid #e5e7eb" }}>
                  No request logs found for this subscription.
                </div>
              )}

              {!reqLogLoading && reqLogRows.length > 0 && (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th style={{ width: "10%" }}>Req #</th>
                      <th style={{ width: "12%" }}>Type</th>
                      <th style={{ width: "12%" }}>Status</th>
                      <th style={{ width: "18%" }}>Requested By</th>
                      <th style={{ width: "18%" }}>Created</th>
                      <th style={{ width: "18%" }}>Reviewed</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reqLogRows.map((x) => {
                      const rid = x.id ?? x.Id;
                      const type = x.requestType ?? x.RequestType;
                      const status = x.status ?? x.Status;

                      const requestedBy = x.requestedByUsername ?? x.RequestedByUsername ?? "—";
                      const created = x.createdAt ?? x.CreatedAt;

                      const reviewedBy = x.reviewedByUsername ?? x.ReviewedByUsername ?? null;
                      const reviewedAt = x.reviewedAt ?? x.ReviewedAt ?? null;

                      const reqNotes = x.requestNotes ?? x.RequestNotes ?? "";
                      const revNotes = x.reviewNotes ?? x.ReviewNotes ?? "";

                      const typeText =
                        typeof type === "string"
                          ? type
                          : Number(type) === 1
                          ? "Suspend"
                          : Number(type) === 2
                          ? "Unsuspend"
                          : String(type ?? "—");

                      const statusText =
                        typeof status === "string"
                          ? status
                          : Number(status) === 1
                          ? "Pending"
                          : Number(status) === 2
                          ? "Approved"
                          : Number(status) === 3
                          ? "Rejected"
                          : String(status ?? "—");

                      const statusClass =
                        String(statusText).toLowerCase().includes("approved")
                          ? "ok"
                          : String(statusText).toLowerCase().includes("rejected")
                          ? "warn"
                          : "muted";

                      return (
                        <tr key={rid}>
                          <td>{rid}</td>
                          <td>
                            <span className="admin-pill muted">{typeText}</span>
                          </td>
                          <td>
                            <span className={`admin-pill ${statusClass}`}>{statusText}</span>
                          </td>
                          <td>{requestedBy}</td>
                          <td>{formatPrettyDateTime(created)}</td>
                          <td>
                            {reviewedBy || reviewedAt ? (
                              <div>
                                <div style={{ fontWeight: 800 }}>{reviewedBy || "—"}</div>
                                <div style={{ color: "#6b7280", fontSize: 12 }}>
                                  {reviewedAt ? formatPrettyDateTime(reviewedAt) : "—"}
                                </div>
                              </div>
                            ) : (
                              <span style={{ color: "#9ca3af" }}>—</span>
                            )}
                          </td>
                          <td style={{ color: "#374151" }}>
                            {reqNotes || revNotes ? (
                              <div style={{ display: "grid", gap: 6 }}>
                                {reqNotes ? (
                                  <div>
                                    <div style={{ fontSize: 12, color: "#6b7280" }}>Request</div>
                                    <div>{reqNotes}</div>
                                  </div>
                                ) : null}
                                {revNotes ? (
                                  <div>
                                    <div style={{ fontSize: 12, color: "#6b7280" }}>Review</div>
                                    <div>{revNotes}</div>
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              <span style={{ color: "#9ca3af" }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="admin-modal-foot">
              <button className="admin-btn" onClick={closeReqLogModal} disabled={busy || reqLogLoading}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================= */}
      {/* REQUEST ACTION MODAL (notes) */}
      {/* ========================= */}
      {openReqAction && reqActionRow && reqActionMode && (
        <div className="admin-modal-overlay" onClick={closeRequestActionModal}>
          <div className="admin-modal admin-modal-tight" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <div>
                <h3 className="admin-modal-title">
                  {meIsGlobal
                    ? reqActionMode === "suspend"
                      ? "Suspend Subscription"
                      : "Unsuspend Subscription"
                    : reqActionMode === "suspend"
                    ? "Request Suspend"
                    : "Request Unsuspend"}
                </h3>
                <div className="admin-modal-subtitle">
                  {(reqActionRow.institutionName ?? reqActionRow.InstitutionName) || "—"} —{" "}
                  {(reqActionRow.contentProductName ?? reqActionRow.ContentProductName) || "—"}
                </div>
              </div>

              <button className="admin-btn" onClick={closeRequestActionModal} disabled={busy}>
                Close
              </button>
            </div>

            <form className="admin-modal-body admin-modal-scroll" onSubmit={submitRequestAction}>
              <div className="admin-field">
                <label>Notes (optional)</label>
                <textarea
                  value={reqActionNotes}
                  onChange={(e) => setReqActionNotes(e.target.value)}
                  placeholder="Add a note (reason, context, etc.)"
                  rows={4}
                />
              </div>

              <div className="admin-note" style={{ marginTop: 10 }}>
                <b>Backend:</b>{" "}
                <code>
                  {meIsGlobal
                    ? `/api/institutions/subscriptions/{id}/${reqActionMode}`
                    : `/api/institutions/subscriptions/{id}/request-${reqActionMode}`}
                </code>
              </div>

              <div className="admin-modal-foot">
                <button className="admin-btn" type="button" onClick={closeRequestActionModal} disabled={busy}>
                  Cancel
                </button>
                <button className="admin-btn primary" type="submit" disabled={busy}>
                  {busy
                    ? "Submitting…"
                    : meIsGlobal
                    ? reqActionMode === "suspend"
                      ? "Suspend"
                      : "Unsuspend"
                    : "Submit Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
