import { useEffect, useMemo, useState } from "react";
import api from "../../../api/client";
import "../../../styles/adminCrud.css";
import AdminPageFooter from "../../../components/AdminPageFooter";

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

const BUNDLE_PRODUCT_NAME = "Institution All-Access Bundle";

const emptyCreateForm = {
  institutionId: "",
  durationInMonths: "12",
  startDate: "",
};

const emptyRenewForm = {
  durationInMonths: "12",
  startDate: "",
};

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

function isValidNow(row) {
  const status = row.status ?? row.Status;
  const start = row.startDate ?? row.StartDate;
  const end = row.endDate ?? row.EndDate;

  const n = parseStatus(status);
  if (n !== 2) return false;

  const s = new Date(start);
  const e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return false;

  const now = Date.now();
  return s.getTime() <= now && e.getTime() > now;
}

// ✅ (Nice UI) Map audit action if backend returns enums/numbers
function auditActionLabel(v) {
  if (v == null || v === "") return "—";
  if (typeof v === "string") return v;

  // If it comes as a number (enum), just show the numeric value.
  // You can replace with exact mapping if you want.
  return String(v);
}

export default function AdminInstitutionBundleSubscriptions() {
  const [rows, setRows] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [bundleProduct, setBundleProduct] = useState(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [openCreate, setOpenCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ ...emptyCreateForm, startDate: todayYmd() });

  const [openRenew, setOpenRenew] = useState(false);
  const [renewForm, setRenewForm] = useState({ ...emptyRenewForm });
  const [renewTarget, setRenewTarget] = useState(null);

  // ✅ Phase 5: audit modal
  const [openAudit, setOpenAudit] = useState(false);
  const [auditTarget, setAuditTarget] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditRows, setAuditRows] = useState([]);

  async function loadBundleProduct() {
    try {
      const res = await api.get("/content-products");
      const data = res.data?.data ?? res.data;
      const list = Array.isArray(data) ? data : [];
      const found = list.find((p) => (p.name ?? p.Name) === BUNDLE_PRODUCT_NAME);
      setBundleProduct(found || null);
    } catch {
      setBundleProduct(null);
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

  async function loadAll() {
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const res = await api.get("/institutions/subscriptions");
      const data = res.data?.data ?? res.data;
      const list = Array.isArray(data) ? data : [];

      const onlyBundle = list.filter((r) => {
        const prodName = r.contentProductName ?? r.ContentProductName ?? "";
        return prodName === BUNDLE_PRODUCT_NAME;
      });

      setRows(onlyBundle);
    } catch (e) {
      setRows([]);
      setError(toText(e?.response?.data || e?.message || "Failed to load bundle subscriptions."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBundleProduct();
    loadInstitutions();
    loadAll();
  }, []);

  const filteredRows = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      const inst = (r.institutionName ?? r.InstitutionName ?? "").toLowerCase();
      const status = statusLabel(r.status ?? r.Status).toLowerCase();
      return inst.includes(s) || status.includes(s);
    });
  }, [rows, q]);

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

  async function createOrExtend(e) {
    e?.preventDefault?.();
    setError("");
    setInfo("");

    if (!bundleProduct) return setError("Bundle product not found.");
    if (!createForm.institutionId) return setError("Institution is required.");

    const months = Number(createForm.durationInMonths);
    if (!months || months <= 0) return setError("Duration must be > 0.");

    const startDateIso = createForm.startDate ? `${createForm.startDate}T00:00:00Z` : null;

    const payload = {
      institutionId: Number(createForm.institutionId),
      contentProductId: Number(bundleProduct.id ?? bundleProduct.Id),
      durationInMonths: months,
      startDate: startDateIso,
    };

    setBusy(true);
    try {
      const res = await api.post("/institutions/subscriptions", payload);
      const endDate = res.data?.endDate ?? res.data?.EndDate;
      const status = res.data?.status ?? res.data?.Status;

      setInfo(`Saved. Status: ${statusLabel(status)}. Ends: ${endDate ? formatPrettyDate(endDate) : "—"}`);
      closeCreateModal();
      await loadAll();
    } catch (e2) {
      setError(toText(e2?.response?.data || e2?.message || "Create/extend failed."));
    } finally {
      setBusy(false);
    }
  }

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
    const msg = `Confirm renewal?\n\nInstitution: ${inst}\nMonths: ${months}${
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
      setError(toText(e2?.response?.data || e2?.message || "Renew failed."));
    } finally {
      setBusy(false);
    }
  }

  // ✅ Phase 5: Audit History
  function closeAuditModal() {
    if (busy || auditLoading) return;
    setOpenAudit(false);
    setAuditTarget(null);
    setAuditRows([]);
  }

  async function openAuditFor(row) {
    setError("");
    setInfo("");

    const id = row.id ?? row.Id;
    setAuditTarget(row);
    setOpenAudit(true);
    setAuditLoading(true);
    setAuditRows([]);

    try {
      const res = await api.get(`/institutions/subscriptions/${id}/audit`);
      const data = res.data?.data ?? res.data;
      setAuditRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setAuditRows([]);
      setError(toText(e?.response?.data || e?.message || "Failed to load audit history."));
    } finally {
      setAuditLoading(false);
    }
  }

  return (
    <div className="admin-page admin-page-wide">
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Admin · Institution Bundle Subscriptions</h1>
          <p className="admin-subtitle">Activate/extend the institution “All-Access Bundle” subscription (Admin only).</p>
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

      {!bundleProduct && (
        <div className="admin-alert error" style={{ marginBottom: 12 }}>
          Bundle product not found. Create it via Swagger:
          <div style={{ marginTop: 6 }}>
            <code>POST /api/admin/seed/institution-bundle-product</code>
          </div>
        </div>
      )}

      <div className="admin-card admin-card-fill">
        <div className="admin-toolbar">
          <input
            className="admin-search admin-search-wide"
            placeholder="Search by institution or status…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <div className="admin-pill muted">{loading ? "Loading…" : `${filteredRows.length} bundle subscription(s)`}</div>
        </div>

        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: "40%" }}>Institution</th>
              <th style={{ width: "14%" }}>Status</th>
              <th style={{ width: "16%" }}>Start</th>
              <th style={{ width: "16%" }}>End</th>
              <th style={{ width: "10%" }} title="Valid now = Active AND within start/end dates">
                Valid now?
              </th>
              <th style={{ textAlign: "right", width: "14%" }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {!loading && filteredRows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ color: "#6b7280", padding: "14px" }}>
                  No bundle subscriptions found.
                </td>
              </tr>
            )}

            {filteredRows.map((r) => {
              const id = r.id ?? r.Id;
              const inst = r.institutionName ?? r.InstitutionName ?? "—";
              const statusVal = r.status ?? r.Status;
              const start = r.startDate ?? r.StartDate;
              const end = r.endDate ?? r.EndDate;

              const validNow = isValidNow(r);
              const statusText = statusLabel(statusVal);
              const pillClass = statusPillClass(statusVal);

              const statusNum = parseStatus(statusVal);
              const isSuspended = statusNum === 4;

              return (
                <tr key={id}>
                  <td style={{ fontWeight: 900 }}>{inst}</td>

                  <td>
                    <span className={`admin-pill ${pillClass}`}>{statusText}</span>
                  </td>

                  <td>{formatPrettyDate(start)}</td>
                  <td>{formatPrettyDate(end)}</td>

                  <td>
                    <span className={`admin-pill ${validNow ? "ok" : "muted"}`}>{validNow ? "Yes" : "No"}</span>
                  </td>

                  <td>
                    <div className="admin-row-actions" style={{ justifyContent: "flex-end", gap: 10 }}>
                      <button
                        className="admin-action-btn neutral small"
                        onClick={() => openAuditFor(r)}
                        disabled={busy}
                        title="View audit history"
                      >
                        History
                      </button>

                      <button
                        className="admin-action-btn neutral small"
                        onClick={() => openRenewModalFor(r)}
                        disabled={busy || isSuspended}
                        title={isSuspended ? "Unsuspend first" : "Renew (Rule A)"}
                      >
                        Renew
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AdminPageFooter right={<span className="admin-footer-muted">Suspended subscriptions must be unsuspended before renewing.</span>} />

      {/* CREATE MODAL */}
      {openCreate && (
        <div className="admin-modal-overlay" onClick={closeCreateModal}>
          <div className="admin-modal admin-modal-tight" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <div>
                <h3 className="admin-modal-title">Create / Extend Bundle Subscription</h3>
                <div className="admin-modal-subtitle">
                  Applies to: <b>{BUNDLE_PRODUCT_NAME}</b>
                </div>
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
                <b>Backend:</b> POST <code>/api/institutions/subscriptions</code> (bundle product)
              </div>

              <div className="admin-modal-foot">
                <button className="admin-btn" type="button" onClick={closeCreateModal} disabled={busy}>
                  Cancel
                </button>
                <button className="admin-btn primary" type="submit" disabled={busy || !bundleProduct}>
                  {busy ? "Saving…" : "Create / Extend"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RENEW MODAL */}
      {openRenew && renewTarget && (
        <div className="admin-modal-overlay" onClick={closeRenewModal}>
          <div className="admin-modal admin-modal-tight" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <div>
                <h3 className="admin-modal-title">Renew Bundle Subscription</h3>
                <div className="admin-modal-subtitle">Rule A: extends from EndDate if still active.</div>
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
                    {(renewTarget.institutionName ?? renewTarget.InstitutionName) || "—"}
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

      {/* AUDIT MODAL */}
      {openAudit && auditTarget && (
        <div className="admin-modal-overlay" onClick={closeAuditModal}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 980 }}>
            <div className="admin-modal-head">
              <div>
                <h3 className="admin-modal-title">Audit History</h3>
                <div className="admin-modal-subtitle">
                  {(auditTarget.institutionName ?? auditTarget.InstitutionName) || "—"} — <b>{BUNDLE_PRODUCT_NAME}</b>
                </div>
              </div>

              <button className="admin-btn" onClick={closeAuditModal} disabled={busy || auditLoading}>
                Close
              </button>
            </div>

            <div className="admin-modal-body admin-modal-scroll">
              {auditLoading ? (
                <div className="admin-pill muted">Loading audit…</div>
              ) : auditRows.length === 0 ? (
                <div className="admin-alert" style={{ background: "#EFE5E6" }}>
                  No audit entries found.
                </div>
              ) : (
                <table className="admin-table" style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th style={{ width: "18%" }}>When</th>
                      <th style={{ width: "14%" }}>Action</th>
                      <th style={{ width: "10%" }}>By</th>
                      <th style={{ width: "14%" }}>Old Status</th>
                      <th style={{ width: "14%" }}>New Status</th>
                      <th style={{ width: "15%" }}>Old End</th>
                      <th style={{ width: "15%" }}>New End</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditRows.map((a) => {
                      const id = a.id ?? a.Id;
                      const when = a.createdAt ?? a.CreatedAt;
                      const action = a.action ?? a.Action;
                      const by = a.performedByUserId ?? a.PerformedByUserId;

                      const oldStatus = a.oldStatus ?? a.OldStatus;
                      const newStatus = a.newStatus ?? a.NewStatus;

                      const oldEnd = a.oldEndDate ?? a.OldEndDate;
                      const newEnd = a.newEndDate ?? a.NewEndDate;

                      const notes = a.notes ?? a.Notes;

                      return (
                        <tr key={id} title={notes || ""}>
                          <td>{formatPrettyDateTime(when)}</td>
                          <td style={{ fontWeight: 800 }}>{auditActionLabel(action)}</td>
                          <td>{by == null ? "—" : String(by)}</td>
                          <td>
                            <span className={`admin-pill ${statusPillClass(oldStatus)}`}>{statusLabel(oldStatus)}</span>
                          </td>
                          <td>
                            <span className={`admin-pill ${statusPillClass(newStatus)}`}>{statusLabel(newStatus)}</span>
                          </td>
                          <td>{formatPrettyDate(oldEnd)}</td>
                          <td>{formatPrettyDate(newEnd)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              <div className="admin-note" style={{ marginTop: 10 }}>
                <b>Backend:</b> GET <code>/api/institutions/subscriptions/{`{id}`}/audit</code>
              </div>
            </div>

            <div className="admin-modal-foot">
              <button className="admin-btn" type="button" onClick={closeAuditModal} disabled={busy || auditLoading}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
