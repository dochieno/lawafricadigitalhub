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

function auditActionLabel(v) {
  if (v == null || v === "") return "—";
  if (typeof v === "string") return v;
  return String(v);
}

function plural(n, one, many = `${one}s`) {
  return n === 1 ? one : many;
}

function DismissibleAlert({ kind = "ok", title, message, onClose }) {
  if (!message && !title) return null;
  const cls = kind === "error" ? "admin-alert error" : "admin-alert ok";

  return (
    <div className={cls} style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
      <div style={{ flex: 1 }}>
        {title && <div style={{ fontWeight: 900, marginBottom: 4 }}>{title}</div>}
        {message && <div style={{ whiteSpace: "pre-wrap" }}>{message}</div>}
      </div>

      {onClose && (
        <button
          className="admin-btn"
          type="button"
          onClick={onClose}
          style={{ padding: "6px 10px", lineHeight: 1, height: 32 }}
          aria-label="Dismiss"
          title="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function PrimaryEmptyState({ title, subtitle, actionLabel, onAction, disabled }) {
  return (
    <div
      className="admin-card"
      style={{
        padding: 18,
        background: "#fff",
        borderRadius: 14,
        border: "1px solid rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
      {subtitle && <div style={{ marginTop: 6, color: "#6b7280" }}>{subtitle}</div>}

      {actionLabel && (
        <div style={{ marginTop: 12 }}>
          <button className="admin-btn primary" onClick={onAction} disabled={disabled}>
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}

function ConfirmModal({ open, title, body, confirmText = "Confirm", cancelText = "Cancel", busy, onCancel, onConfirm }) {
  if (!open) return null;

  return (
    <div className="admin-modal-overlay" onClick={busy ? undefined : onCancel}>
      <div className="admin-modal admin-modal-tight" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-head">
          <div>
            <h3 className="admin-modal-title">{title}</h3>
            {body ? <div className="admin-modal-subtitle">{body}</div> : null}
          </div>

          <button className="admin-btn" onClick={onCancel} disabled={busy}>
            Close
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

  // Confirm renew modal (replaces window.confirm)
  const [openConfirmRenew, setOpenConfirmRenew] = useState(false);

  // Audit modal
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
      setError(toText(e?.response?.data || e?.message || "Failed to load subscriptions."));
    } finally {
      setLoading(false);
    }
  }

  async function refreshEverything() {
    setError("");
    setInfo("");
    setLoading(true);
    try {
      await Promise.all([loadBundleProduct(), loadInstitutions(), loadAll()]);
      setInfo("Refreshed.");
    } catch {
      // loadAll handles its own error, but keep UI calm
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBundleProduct();
    loadInstitutions();
    loadAll();
  }, []);

  const stats = useMemo(() => {
    const active = rows.filter((r) => parseStatus(r.status ?? r.Status) === 2).length;
    const validNow = rows.filter((r) => isValidNow(r)).length;
    const pending = rows.filter((r) => parseStatus(r.status ?? r.Status) === 1).length;
    const suspended = rows.filter((r) => parseStatus(r.status ?? r.Status) === 4).length;
    return { active, validNow, pending, suspended, total: rows.length };
  }, [rows]);

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
    setOpenConfirmRenew(false);
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
      setError("This subscription is suspended. Unsuspend it before renewing.");
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

    if (!bundleProduct) return setError("Bundle product is not available yet. Please refresh and try again.");
    if (!createForm.institutionId) return setError("Please select an institution.");

    const months = Number(createForm.durationInMonths);
    if (!months || months <= 0) return setError("Duration must be greater than 0.");

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

      setInfo(`Saved. ${statusLabel(status)} · Ends ${endDate ? formatPrettyDate(endDate) : "—"}`);
      closeCreateModal();
      await loadAll();
    } catch (e2) {
      setError(toText(e2?.response?.data || e2?.message || "Could not save subscription."));
    } finally {
      setBusy(false);
    }
  }

  function beginRenewConfirm(e) {
    e?.preventDefault?.();
    setError("");
    setInfo("");
    if (!renewTarget) return setError("No subscription selected.");

    const statusNum = parseStatus(renewTarget.status ?? renewTarget.Status);
    if (statusNum === 4) return setError("This subscription is suspended. Unsuspend it before renewing.");

    const months = Number(renewForm.durationInMonths);
    if (!months || months <= 0) return setError("Duration must be greater than 0.");

    setOpenConfirmRenew(true);
  }

  async function confirmRenew() {
    setError("");
    setInfo("");
    if (!renewTarget) return setError("No subscription selected.");

    const months = Number(renewForm.durationInMonths);
    if (!months || months <= 0) return setError("Duration must be greater than 0.");

    const startDateIso = renewForm.startDate ? `${renewForm.startDate}T00:00:00Z` : null;

    setBusy(true);
    try {
      const id = renewTarget.id ?? renewTarget.Id;
      const res = await api.post(`/institutions/subscriptions/${id}/renew`, {
        durationInMonths: months,
        startDate: startDateIso,
      });

      const endDate = res.data?.endDate ?? res.data?.EndDate;
      const status = res.data?.status ?? res.data?.Status;

      setInfo(`Renewed. ${statusLabel(status)} · Ends ${endDate ? formatPrettyDate(endDate) : "—"}`);
      closeRenewModal();
      await loadAll();
    } catch (e2) {
      setError(toText(e2?.response?.data || e2?.message || "Renewal failed."));
    } finally {
      setBusy(false);
    }
  }

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
      setError(toText(e?.response?.data || e?.message || "Failed to load history."));
    } finally {
      setAuditLoading(false);
    }
  }

  const renewSummary = useMemo(() => {
    if (!renewTarget) return "";
    const inst = (renewTarget.institutionName ?? renewTarget.InstitutionName) || "—";
    const months = Number(renewForm.durationInMonths) || 0;
    const start = renewForm.startDate ? renewForm.startDate : "Automatic (recommended)";
    return `Institution: ${inst}\nDuration: ${months} ${plural(months, "month")}\nStart: ${start}`;
  }, [renewTarget, renewForm.durationInMonths, renewForm.startDate]);

  return (
    <div className="admin-page admin-page-wide">
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Institution Bundle Subscriptions</h1>
          <p className="admin-subtitle">
            Manage the institution “All-Access Bundle” — create, extend, renew, and review history.
          </p>
        </div>

        <div className="admin-actions">
          <button className="admin-btn" onClick={refreshEverything} disabled={busy || loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>

          <button
            className="admin-btn primary compact"
            onClick={openCreateModal}
            disabled={busy || !bundleProduct}
            title={!bundleProduct ? "Bundle product isn’t available yet. Refresh first." : "Create a new bundle subscription"}
          >
            + New
          </button>
        </div>
      </div>

      <DismissibleAlert
        kind={error ? "error" : "ok"}
        title={error ? "Something went wrong" : info ? "Done" : ""}
        message={error || info}
        onClose={() => {
          setError("");
          setInfo("");
        }}
      />

      {!bundleProduct && (
        <PrimaryEmptyState
          title="Bundle product isn’t available yet"
          subtitle={
            "This page needs the “Institution All-Access Bundle” product to exist. If it was just created, refresh to load it."
          }
          actionLabel={loading ? "Refreshing…" : "Refresh now"}
          onAction={refreshEverything}
          disabled={busy || loading}
        />
      )}

      <div className="admin-card admin-card-fill" style={{ marginTop: 12 }}>
        <div className="admin-toolbar" style={{ alignItems: "center" }}>
          <input
            className="admin-search admin-search-wide"
            placeholder="Search by institution or status…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div className="admin-pill muted">{loading ? "Loading…" : `${stats.total} ${plural(stats.total, "subscription")}`}</div>
            <div className="admin-pill ok" title="Active subscriptions">{stats.active} Active</div>
            <div className="admin-pill ok" title="Active & within dates">{stats.validNow} Valid now</div>
            <div className="admin-pill warn" title="Pending subscriptions">{stats.pending} Pending</div>
            <div className="admin-pill warn" title="Suspended subscriptions">{stats.suspended} Suspended</div>
          </div>
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
                <td colSpan={6} style={{ padding: "18px" }}>
                  <div style={{ color: "#6b7280", fontWeight: 700 }}>No bundle subscriptions found.</div>
                  <div style={{ color: "#6b7280", marginTop: 6 }}>
                    Click <b>+ New</b> to create one for an institution.
                  </div>
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
                        title="View changes and renewals"
                      >
                        History
                      </button>

                      <button
                        className="admin-action-btn neutral small"
                        onClick={() => openRenewModalFor(r)}
                        disabled={busy || isSuspended}
                        title={isSuspended ? "Unsuspend first" : "Renew subscription"}
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
                    Leave as today, or choose a future date to schedule activation.
                  </div>
                </div>

                <div className="admin-field">
                  <label>Duration *</label>
                  <select
                    value={createForm.durationInMonths}
                    onChange={(e) => setCreateForm((p) => ({ ...p, durationInMonths: e.target.value }))}
                  >
                    <option value="1">1 month</option>
                    <option value="3">3 months</option>
                    <option value="6">6 months</option>
                    <option value="12">12 months</option>
                    <option value="24">24 months</option>
                  </select>
                </div>
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
                <h3 className="admin-modal-title">Renew Subscription</h3>
                <div className="admin-modal-subtitle" style={{ maxWidth: 560 }}>
                  Renews the current bundle. If you leave the start date empty, the system will apply the normal renewal rule.
                </div>
              </div>

              <button className="admin-btn" onClick={closeRenewModal} disabled={busy}>
                Close
              </button>
            </div>

            <form className="admin-modal-body admin-modal-scroll" onSubmit={beginRenewConfirm}>
              <div className="admin-grid">
                <div className="admin-field admin-span2">
                  <label>Institution</label>
                  <div style={{ fontWeight: 900, paddingTop: 8 }}>
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
                    Optional. Leave empty for the recommended default.
                  </div>
                </div>

                <div className="admin-field">
                  <label>Duration *</label>
                  <select
                    value={renewForm.durationInMonths}
                    onChange={(e) => setRenewForm((p) => ({ ...p, durationInMonths: e.target.value }))}
                  >
                    <option value="1">1 month</option>
                    <option value="3">3 months</option>
                    <option value="6">6 months</option>
                    <option value="12">12 months</option>
                    <option value="24">24 months</option>
                  </select>
                </div>
              </div>

              <div className="admin-modal-foot">
                <button className="admin-btn" type="button" onClick={closeRenewModal} disabled={busy}>
                  Cancel
                </button>
                <button className="admin-btn primary" type="submit" disabled={busy}>
                  Continue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRM RENEW MODAL */}
      <ConfirmModal
        open={openConfirmRenew}
        title="Confirm renewal"
        body={
          <div style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>
            {renewSummary}
            <div style={{ marginTop: 10, color: "#6b7280" }}>
              You can view the full change log in <b>History</b>.
            </div>
          </div>
        }
        confirmText="Renew"
        cancelText="Back"
        busy={busy}
        onCancel={() => setOpenConfirmRenew(false)}
        onConfirm={confirmRenew}
      />

      {/* AUDIT MODAL */}
      {openAudit && auditTarget && (
        <div className="admin-modal-overlay" onClick={closeAuditModal}>
          <div className="admin-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 980 }}>
            <div className="admin-modal-head">
              <div>
                <h3 className="admin-modal-title">History</h3>
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
                <div className="admin-pill muted">Loading…</div>
              ) : auditRows.length === 0 ? (
                <div className="admin-alert" style={{ background: "#EFE5E6" }}>
                  No history found.
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
