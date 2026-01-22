// src/pages/dashboard/admin/AdminVATRates.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import api from "../../../api/client";
import "../../../styles/adminCrud.css";
import "../../../styles/adminUsers.css"; // ✅ LawAfrica Admin Users branding

function getApiErrorMessage(err, fallback = "Request failed.") {
  const data = err?.response?.data;

  if (data && typeof data === "object") {
    if (typeof data.message === "string") return data.message;
    if (typeof data.error === "string") return data.error;

    if (data.errors && typeof data.errors === "object") {
      const k = Object.keys(data.errors)[0];
      const arr = data.errors[k];
      if (Array.isArray(arr) && arr[0]) return `${k}: ${arr[0]}`;
      return "Validation failed.";
    }
  }

  if (typeof data === "string") return data;
  if (typeof err?.message === "string") return err.message;
  return fallback;
}

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function formatPercent(v) {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  // display up to 2 dp but strip trailing zeros nicely
  const s = n.toFixed(2);
  return `${s.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")}%`;
}

function toDecimalOrNull(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeCode(v) {
  return String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9\-_]/g, "");
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
function IPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function IEdit() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function ITrash() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 6V4h8v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 6l1 16h8l1-16" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M10 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Badge({ children, kind = "neutral", title }) {
  const cls =
    kind === "success"
      ? "au-badge au-badge-success"
      : kind === "warn"
      ? "au-badge au-badge-warn"
      : kind === "info"
      ? "au-badge au-badge-info"
      : kind === "danger"
      ? "au-badge au-badge-danger"
      : "au-badge au-badge-neutral";

  return (
    <span className={cls} title={title}>
      {children}
    </span>
  );
}

export default function AdminVATRates() {
  // --------- API paths (keep centralized) ----------
  // If your backend uses a different route, change ONLY these.
  const API_LIST = "/admin/vat-rates";
  const API_CREATE = "/admin/vat-rates";
  const API_UPDATE = (id) => `/admin/vat-rates/${id}`;
  const API_DELETE = (id) => `/admin/vat-rates/${id}`;

  const [rows, setRows] = useState([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState("");

  // ✅ toast (au branding)
  const [toast, setToast] = useState(null); // {type:"success"|"error", text:string}

  // Modal state
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const emptyForm = useMemo(
    () => ({
      code: "",
      name: "",
      ratePercent: "",
      isActive: true,
      isDefault: false,
      notes: "",
    }),
    []
  );

  const [form, setForm] = useState({ ...emptyForm });

  const mountedRef = useRef(false);

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

  function setField(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function loadAll() {
    setToast(null);
    setLoading(true);
    try {
      const res = await api.get(API_LIST);
      const all = Array.isArray(res.data) ? res.data : [];
      setRows(all);
    } catch (e) {
      setRows([]);
      showError(getApiErrorMessage(e, "Failed to load VAT rates."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    loadAll();
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      const code = String(r.code ?? r.Code ?? "").toLowerCase();
      const name = String(r.name ?? r.Name ?? "").toLowerCase();
      const rate = String(r.ratePercent ?? r.RatePercent ?? "").toLowerCase();
      const active = (r.isActive ?? r.IsActive) ? "active" : "inactive";
      const def = (r.isDefault ?? r.IsDefault) ? "default" : "";
      const meta = `${code} ${name} ${rate} ${active} ${def}`.toLowerCase();
      return meta.includes(s);
    });
  }, [rows, q]);

  const kpis = useMemo(() => {
    const total = filtered.length;
    let active = 0;
    let defaults = 0;

    for (const r of filtered) {
      if (r.isActive ?? r.IsActive) active += 1;
      if (r.isDefault ?? r.IsDefault) defaults += 1;
    }
    return { total, active, defaults };
  }, [filtered]);

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm });
    setOpen(true);
  }

  function openEdit(row) {
    setEditing(row);
    setOpen(true);

    setForm({
      code: String(row.code ?? row.Code ?? "").trim(),
      name: String(row.name ?? row.Name ?? "").trim(),
      ratePercent: String(row.ratePercent ?? row.RatePercent ?? ""),
      isActive: !!(row.isActive ?? row.IsActive ?? true),
      isDefault: !!(row.isDefault ?? row.IsDefault ?? false),
      notes: String(row.notes ?? row.Notes ?? "").trim(),
    });
  }

  function closeModal() {
    if (busy) return;
    setOpen(false);
  }

  function buildPayload() {
    const code = normalizeCode(form.code);
    const rate = toDecimalOrNull(form.ratePercent);

    return {
      code: code || null,
      name: form.name?.trim() || null,
      ratePercent: rate,
      isActive: !!form.isActive,
      isDefault: !!form.isDefault,
      notes: form.notes?.trim() || null,
    };
  }

  function validateForm() {
    const code = normalizeCode(form.code);
    if (!code) return "Code is required (e.g. VAT16, VAT0, EXEMPT).";
    if (code.length > 30) return "Code is too long.";

    if (!form.name?.trim()) return "Name is required (e.g. Standard VAT).";

    const rate = toDecimalOrNull(form.ratePercent);
    if (rate == null) return "Rate (%) is required.";
    if (rate < 0 || rate > 100) return "Rate (%) must be between 0 and 100.";

    return null;
  }

  async function save() {
    const err = validateForm();
    if (err) return showError(err);

    setBusy(true);
    try {
      const payload = buildPayload();

      if (editing?.id) {
        await api.put(API_UPDATE(editing.id), payload);
        showSuccess("VAT rate updated.");
      } else {
        await api.post(API_CREATE, payload);
        showSuccess("VAT rate created.");
      }

      await loadAll();
      closeModal();
    } catch (e) {
      showError(getApiErrorMessage(e, "Save failed."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(row) {
    const id = row?.id ?? row?.Id;
    if (!id) return;

    const code = row?.code ?? row?.Code ?? "";
    const ok = window.confirm(`Delete VAT rate ${code ? `"${code}" ` : ""}(#${id})? This cannot be undone.`);
    if (!ok) return;

    setBusy(true);
    try {
      await api.delete(API_DELETE(id));
      showSuccess("VAT rate deleted.");
      await loadAll();
    } catch (e) {
      showError(getApiErrorMessage(e, "Delete failed."));
    } finally {
      setBusy(false);
    }
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
            <div className="au-kicker">LAWFRAICA • ADMIN</div>
            <h1 className="au-title">VAT Rates</h1>
            <p className="au-subtitle">
              Manage VAT codes used for invoicing and tax calculations (e.g. <b>VAT16</b>, <b>VAT0</b>, <b>EXEMPT</b>).
            </p>
          </div>

          <div className="au-heroRight" style={{ gap: 10 }}>
            <button className="au-refresh" onClick={loadAll} disabled={busy || loading} title="Refresh">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <IRefresh spin={loading} /> Refresh
              </span>
            </button>

            <button
              className="au-refresh"
              style={{
                background: "linear-gradient(180deg, rgba(139, 28, 28, 0.95) 0%, rgba(161, 31, 31, 0.95) 100%)",
                borderColor: "rgba(139, 28, 28, 0.35)",
              }}
              onClick={openCreate}
              disabled={busy}
              title="Create a new VAT rate"
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <IPlus /> New
              </span>
            </button>
          </div>
        </div>

        {/* TOPBAR */}
        <div className="au-topbar">
          <div className="au-search">
            <span className="au-searchIcon" aria-hidden="true">
              <ISearch />
            </span>
            <input
              placeholder="Search by code, name, rate, active, default…"
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

          <div className="au-topbarRight">
            <div className="au-mePill" title="Quick stats">
              <span className={`au-meDot ${loading ? "" : "ga"}`} />
              <span className="au-meText">{loading ? "Loading…" : `${filtered.length} rate(s)`}</span>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="au-kpis">
          <div className="au-kpiCard">
            <div className="au-kpiLabel">Shown</div>
            <div className="au-kpiValue">{loading ? "…" : kpis.total}</div>
          </div>
          <div className="au-kpiCard">
            <div className="au-kpiLabel">Active</div>
            <div className="au-kpiValue">{loading ? "…" : kpis.active}</div>
          </div>
          <div className="au-kpiCard">
            <div className="au-kpiLabel">Default</div>
            <div className="au-kpiValue">{loading ? "…" : kpis.defaults}</div>
          </div>
          <div className="au-kpiCard">
            <div className="au-kpiLabel">Tip</div>
            <div className="au-kpiValue" style={{ fontSize: 14 }}>
              Use on documents
            </div>
          </div>
        </div>
      </div>

      {/* PANEL */}
      <div className="au-panel">
        <div className="au-panelTop">
          <div className="au-panelTitle">VAT rates</div>
          <div className="au-pageMeta">{loading ? "Loading…" : `${filtered.length} record(s)`}</div>
        </div>

        <div className="au-tableWrap">
          <table className="au-table">
            <thead>
              <tr>
                <th style={{ width: "18%" }}>Code</th>
                <th style={{ width: "38%" }}>Name</th>
                <th style={{ width: "14%" }}>Rate</th>
                <th style={{ width: "14%" }}>Status</th>
                <th style={{ width: "16%" }}>Default</th>
                <th className="au-thRight" style={{ width: "14%" }}>
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="au-empty">No VAT rates found.</div>
                  </td>
                </tr>
              )}

              {filtered.map((r) => {
                const id = r.id ?? r.Id;
                const code = r.code ?? r.Code ?? "—";
                const name = r.name ?? r.Name ?? "—";
                const rate = r.ratePercent ?? r.RatePercent ?? null;
                const isActive = !!(r.isActive ?? r.IsActive ?? true);
                const isDefault = !!(r.isDefault ?? r.IsDefault ?? false);

                return (
                  <tr key={id}>
                    <td>
                      <span className="au-mono" style={{ fontWeight: 950 }}>
                        {code}
                      </span>
                      <div className="au-muted au-mono">#{id}</div>
                    </td>

                    <td>
                      <div style={{ fontWeight: 800 }}>{name}</div>
                      {r.notes ?? r.Notes ? (
                        <div className="au-muted" style={{ marginTop: 4 }}>
                          {String(r.notes ?? r.Notes)}
                        </div>
                      ) : (
                        <div className="au-muted" style={{ marginTop: 4 }}>
                          —
                        </div>
                      )}
                    </td>

                    <td>
                      <span style={{ fontWeight: 950 }}>{formatPercent(rate)}</span>
                    </td>

                    <td>
                      <Badge kind={isActive ? "success" : "neutral"}>{isActive ? "Active" : "Inactive"}</Badge>
                    </td>

                    <td>
                      {isDefault ? <Badge kind="info">Default</Badge> : <Badge>—</Badge>}
                    </td>

                    <td className="au-tdRight">
                      <div className="au-actionsRow">
                        <button
                          className="au-iconBtn au-iconBtn-neutral"
                          onClick={() => openEdit(r)}
                          disabled={busy}
                          title="Edit"
                        >
                          <IEdit />
                        </button>

                        <button
                          className={cn("au-iconBtn", "au-iconBtn-danger")}
                          onClick={() => remove(r)}
                          disabled={busy}
                          title="Delete"
                        >
                          <ITrash />
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
            Tip: Keep exactly one Default VAT rate (used when a document has no specific VAT rate).
          </span>
        </div>
      </div>

      {/* MODAL (kept adminCrud styles) */}
      {open && (
        <div className="admin-modal-overlay" onClick={closeModal}>
          <div className="admin-modal admin-modal-tight" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head admin-modal-head-x">
              <div>
                <h3 className="admin-modal-title">{editing ? `Edit VAT Rate #${editing.id ?? editing.Id}` : "Create VAT Rate"}</h3>
                <div className="admin-modal-subtitle">
                  Define a VAT code and percentage. Use <b>0</b> for zero-rated/exempt codes.
                </div>
              </div>

              <button
                type="button"
                className="admin-modal-xbtn"
                onClick={closeModal}
                disabled={busy}
                aria-label="Close"
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="admin-modal-body admin-modal-scroll">
              <div className="admin-form-section">
                <div className="admin-form-section-title">VAT details</div>
                <div className="admin-form-section-sub">Code, name, percent and defaults.</div>
              </div>

              <div className="admin-grid">
                <div className="admin-field">
                  <label>Code *</label>
                  <input
                    value={form.code}
                    onChange={(e) => setField("code", e.target.value)}
                    placeholder="e.g. VAT16"
                    disabled={busy}
                  />
                  <div className="admin-help">Uppercase recommended. Spaces become hyphens.</div>
                </div>

                <div className="admin-field admin-span2">
                  <label>Name *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setField("name", e.target.value)}
                    placeholder="e.g. Standard VAT"
                    disabled={busy}
                  />
                </div>

                <div className="admin-field">
                  <label>Rate (%) *</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={form.ratePercent}
                    onChange={(e) => setField("ratePercent", e.target.value)}
                    placeholder="e.g. 16"
                    disabled={busy}
                  />
                  <div className="admin-help">0–100 allowed.</div>
                </div>

                <div className="admin-field">
                  <label>Active?</label>
                  <select
                    value={String(!!form.isActive)}
                    onChange={(e) => setField("isActive", e.target.value === "true")}
                    disabled={busy}
                  >
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </div>

                <div className="admin-field">
                  <label>Default?</label>
                  <select
                    value={String(!!form.isDefault)}
                    onChange={(e) => setField("isDefault", e.target.value === "true")}
                    disabled={busy}
                  >
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </select>
                  <div className="admin-help">Recommended: only one default.</div>
                </div>

                <div className="admin-field admin-span2">
                  <label>Notes</label>
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setField("notes", e.target.value)}
                    placeholder="Optional: internal notes"
                    disabled={busy}
                  />
                </div>

                <div className="admin-field admin-span2">
                  <div className="admin-alert warn" style={{ marginTop: 4 }}>
                    If you set multiple “Default = Yes”, your backend should enforce one default (or last-save wins).
                  </div>
                </div>
              </div>
            </div>

            <div className="admin-modal-foot">
              <button className="admin-btn" onClick={closeModal} disabled={busy}>
                Cancel
              </button>

              <button className="admin-btn primary" onClick={save} disabled={busy}>
                {busy ? "Saving…" : editing ? "Save changes" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
