// src/pages/dashboard/admin/AdminInstitutionAdmins.jsx
import { useEffect, useMemo, useState } from "react";
import api from "../../../api/client";
import "../../../styles/adminCrud.css";
import "../../../styles/adminUsers.css"; // ✅ au-* styles
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

const emptyForm = {
  institutionId: "",
  userEmail: "",
  role: "InstitutionAdmin", // keep flexible
  isActive: true,
};

function mapRowToForm(row) {
  const r = row || {};
  return {
    institutionId: (r.institutionId ?? r.InstitutionId ?? "")?.toString?.() ?? "",
    userEmail: r.userEmail ?? r.UserEmail ?? r.email ?? r.Email ?? "",
    role: r.role ?? r.Role ?? "InstitutionAdmin",
    isActive: r.isActive ?? r.IsActive ?? true,
  };
}

function ConfirmModal({
  open,
  title,
  body,
  confirmText = "Confirm",
  cancelText = "Cancel",
  busy,
  onCancel,
  onConfirm,
}) {
  if (!open) return null;

  return (
    <div className="admin-modal-overlay" onClick={busy ? undefined : onCancel}>
      <div className="admin-modal admin-modal-tight" onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-head admin-modal-head-x">
          <div>
            <h3 className="admin-modal-title">{title}</h3>
            {body ? <div className="admin-modal-subtitle">{body}</div> : null}
          </div>

          <button
            type="button"
            className="admin-modal-xbtn"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close"
            title="Close"
          >
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
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={spin ? "au-spin" : undefined}
    >
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

export default function AdminInstitutionAdmins() {
  const [rows, setRows] = useState([]);
  const [institutions, setInstitutions] = useState([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState("");

  // toast instead of big banner
  const [toast, setToast] = useState(null); // {type:"error"|"success", text:string}

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [modalLoading, setModalLoading] = useState(false);

  // confirm modal (for activate/deactivate)
  const [confirm, setConfirm] = useState({ open: false, title: "", body: "", confirmText: "Confirm", action: null });

  // ✅ Adjust here if your API routes differ
  const API_BASE = "/institution-admins";

  function showError(msg) {
    setToast({ type: "error", text: String(msg || "Request failed.") });
    window.clearTimeout(showError._t);
    showError._t = window.setTimeout(() => setToast(null), 4500);
  }
  function showSuccess(msg) {
    setToast({ type: "success", text: String(msg || "Done.") });
    window.clearTimeout(showSuccess._t);
    showSuccess._t = window.setTimeout(() => setToast(null), 2500);
  }

  async function loadAll() {
    setLoading(true);
    try {
      const res = await api.get(API_BASE);
      const data = res.data?.data ?? res.data;
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setRows([]);
      showError(toText(e?.response?.data || e?.message || "Failed to load institution admins."));
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

  useEffect(() => {
    loadAll();
    loadInstitutions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      const email = (r.userEmail ?? r.UserEmail ?? r.email ?? r.Email ?? "").toLowerCase();
      const role = (r.role ?? r.Role ?? "").toLowerCase();

      const instId = (r.institutionId ?? r.InstitutionId ?? "")?.toString?.() ?? "";
      const instName =
        (r.institutionName ?? r.InstitutionName ?? "").toLowerCase() ||
        (institutions.find((x) => (x.id ?? x.Id)?.toString?.() === instId)?.name ??
          institutions.find((x) => (x.id ?? x.Id)?.toString?.() === instId)?.Name ??
          "");

      return email.includes(s) || role.includes(s) || instId.includes(s) || String(instName).includes(s);
    });
  }, [rows, q, institutions]);

  const stats = useMemo(() => {
    const active = rows.filter((r) => !!(r.isActive ?? r.IsActive ?? false)).length;
    const inactive = rows.length - active;
    return { total: rows.length, active, inactive };
  }, [rows]);

  function setField(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm });
    setOpen(true);
  }

  async function openEdit(row) {
    setEditing(row);
    setOpen(true);

    setForm(mapRowToForm(row));

    // Optional: fetch full record if your API supports GET /institution-admins/{id}
    setModalLoading(true);
    try {
      const id = row.id ?? row.Id;
      const res = await api.get(`${API_BASE}/${id}`);
      const data = res.data?.data ?? res.data;
      setForm(mapRowToForm(data));
    } catch {
      // keep partial
    } finally {
      setModalLoading(false);
    }
  }

  function closeModal() {
    if (busy) return;
    setOpen(false);
    setModalLoading(false);
  }

  function buildPayload() {
    return {
      institutionId: form.institutionId ? Number(form.institutionId) : null,
      userEmail: form.userEmail.trim(),
      role: form.role?.trim() || "InstitutionAdmin",
      isActive: !!form.isActive,
    };
  }

  async function save() {
    if (!form.institutionId) return showError("Institution is required.");
    if (!form.userEmail.trim()) return showError("User email is required.");

    setBusy(true);
    try {
      const payload = buildPayload();

      if (editing) {
        const id = editing.id ?? editing.Id;
        await api.put(`${API_BASE}/${id}`, payload);
        showSuccess("Institution admin updated.");
      } else {
        await api.post(API_BASE, payload);
        showSuccess("Institution admin created.");
      }

      closeModal();
      await loadAll();
    } catch (e) {
      showError(toText(e?.response?.data || e?.message || "Save failed."));
    } finally {
      setBusy(false);
    }
  }

  function getInstitutionLabelById(idStr) {
    if (!idStr) return "—";
    const found = institutions.find((x) => (x.id ?? x.Id)?.toString?.() === idStr);
    return found ? (found.name ?? found.Name ?? idStr) : idStr;
  }

  function openConfirm({ title, body, confirmText, action }) {
    setConfirm({ open: true, title, body, confirmText, action });
  }
  function closeConfirm() {
    if (busy) return;
    setConfirm((p) => ({ ...p, open: false }));
  }
  async function runConfirm() {
    const act = confirm.action;
    closeConfirm();
    if (act) await act();
  }

  async function toggleActive(row) {
    const id = row.id ?? row.Id;
    const isActive = row.isActive ?? row.IsActive ?? false;

    setBusy(true);
    try {
      await api.post(`${API_BASE}/${id}/${isActive ? "deactivate" : "activate"}`);
      showSuccess(isActive ? "Institution admin deactivated." : "Institution admin activated.");
      await loadAll();
    } catch (e) {
      showError(toText(e?.response?.data || e?.message || "Failed to update status."));
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
            <div className="au-kicker">ADMIN</div>
            <h1 className="au-title">Institution Admins</h1>
            <p className="au-subtitle">Assign and manage institution-level administrators (Global Admin only).</p>
          </div>

          <div className="au-heroRight" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button className="au-refresh" onClick={loadAll} disabled={busy || loading} title="Refresh list">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <IRefresh spin={loading} /> {loading ? "Refreshing…" : "Refresh"}
              </span>
            </button>

            <button
              className="au-primary"
              onClick={openCreate}
              disabled={busy}
              title="Create a new institution admin assignment"
              style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
            >
              <IPlus /> New
            </button>
          </div>
        </div>

        {/* TOPBAR */}
        <div className="au-topbar">
          <div className="au-search" style={{ minWidth: 460 }}>
            <span className="au-searchIcon" aria-hidden="true">
              <ISearch />
            </span>
            <input
              placeholder="Search by email, role, or institution…"
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

          <div className="au-topbarRight" style={{ gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span className="admin-pill muted">{loading ? "Loading…" : `${filtered.length} shown`}</span>
            <span className="admin-pill ok" title="Active assignments">
              {stats.active} Active
            </span>
            <span className="admin-pill warn" title="Inactive assignments">
              {stats.inactive} Inactive
            </span>
          </div>
        </div>

        {/* KPIs */}
        <div className="au-kpis">
          <div className="au-kpiCard">
            <div className="au-kpiLabel">Total assignments</div>
            <div className="au-kpiValue">{loading ? "…" : stats.total}</div>
          </div>
          <div className="au-kpiCard">
            <div className="au-kpiLabel">Active</div>
            <div className="au-kpiValue">{loading ? "…" : stats.active}</div>
          </div>
          <div className="au-kpiCard">
            <div className="au-kpiLabel">Inactive</div>
            <div className="au-kpiValue">{loading ? "…" : stats.inactive}</div>
          </div>
          <div className="au-kpiCard">
            <div className="au-kpiLabel">Institutions loaded</div>
            <div className="au-kpiValue">{institutions.length}</div>
          </div>
        </div>
      </div>

      {/* TABLE PANEL */}
      <div className="au-panel" style={{ marginTop: 12 }}>
        <div className="au-panelTop">
          <div className="au-panelTitle">Assignments</div>
          <div className="au-pageMeta">{loading ? "Loading…" : `${filtered.length} admin(s)`}</div>
        </div>

        <div className="au-tableWrap">
          <table className="au-table">
            <thead>
              <tr>
                <th style={{ width: "28%" }}>Institution</th>
                <th style={{ width: "28%" }}>User Email</th>
                <th style={{ width: "18%" }}>Role</th>
                <th style={{ width: "10%" }}>Status</th>
                <th className="au-thRight" style={{ width: "16%" }}>
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="au-empty">
                      <div style={{ fontWeight: 950 }}>No institution admins found.</div>
                      <div className="au-muted" style={{ marginTop: 6 }}>
                        Click <b>New</b> to assign an admin to an institution.
                      </div>
                    </div>
                  </td>
                </tr>
              )}

              {filtered.map((r, idx) => {
                const id = r.id ?? r.Id;
                const instId = (r.institutionId ?? r.InstitutionId ?? "")?.toString?.() ?? "";
                const email = r.userEmail ?? r.UserEmail ?? r.email ?? r.Email;
                const role = r.role ?? r.Role ?? "InstitutionAdmin";
                const isActive = r.isActive ?? r.IsActive ?? false;

                return (
                  <tr key={id} className={idx % 2 === 1 ? "au-rowZebra" : ""}>
                    <td style={{ fontWeight: 950 }}>{getInstitutionLabelById(instId)}</td>
                    <td className="au-mono">{email}</td>

                    <td>
                      <span className="admin-pill">{role}</span>
                    </td>

                    <td>
                      <span className={`admin-pill ${isActive ? "ok" : "muted"}`}>{isActive ? "Active" : "Inactive"}</span>
                    </td>

                    <td className="au-tdRight">
                      <div className="au-actionsRow">
                        <button className="admin-btn" onClick={() => openEdit(r)} disabled={busy} title="Edit assignment">
                          Edit
                        </button>

                        <button
                          className={`admin-btn ${isActive ? "" : "primary"}`}
                          onClick={() =>
                            openConfirm({
                              title: isActive ? "Deactivate admin?" : "Activate admin?",
                              body: `${email}\nInstitution: ${getInstitutionLabelById(instId)}\nRole: ${role}`,
                              confirmText: isActive ? "Deactivate" : "Activate",
                              action: () => toggleActive(r),
                            })
                          }
                          disabled={busy}
                          title={isActive ? "Deactivate admin" : "Activate admin"}
                        >
                          {isActive ? "Deactivate" : "Activate"}
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
            API: <code>{API_BASE}</code> · PUT <code>{API_BASE}/{"{id}"}</code> · POST{" "}
            <code>{API_BASE}/{"{id}"}/activate</code> / <code>deactivate</code>
          </span>
        </div>
      </div>

      {/* MODAL */}
      {open && (
        <div className="admin-modal-overlay" onClick={closeModal}>
          <div className="admin-modal admin-modal-tight" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head admin-modal-head-x">
              <div>
                <h3 className="admin-modal-title">{editing ? "Edit Institution Admin" : "Create Institution Admin"}</h3>
                <div className="admin-modal-subtitle">
                  {modalLoading ? "Loading full record…" : "Assign an admin to an institution."}
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
              {modalLoading && <div className="admin-inline-loading">Fetching details…</div>}

              <div className="admin-grid">
                <div className="admin-field">
                  <label>Institution *</label>
                  <select value={form.institutionId} onChange={(e) => setField("institutionId", e.target.value)}>
                    <option value="">Select institution…</option>
                    {institutions.map((i) => (
                      <option key={i.id ?? i.Id} value={i.id ?? i.Id}>
                        {i.name ?? i.Name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-field">
                  <label>User email *</label>
                  <input
                    placeholder="user@example.com"
                    value={form.userEmail}
                    onChange={(e) => setField("userEmail", e.target.value)}
                  />
                </div>

                <div className="admin-field">
                  <label>Role</label>
                  <input value={form.role} onChange={(e) => setField("role", e.target.value)} placeholder="InstitutionAdmin" />
                  <div className="admin-help" style={{ marginTop: 6 }}>
                    Keep flexible if you support multiple institution roles.
                  </div>
                </div>

                <div className="admin-field">
                  <label>Active?</label>
                  <select value={String(!!form.isActive)} onChange={(e) => setField("isActive", e.target.value === "true")}>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="admin-modal-foot">
              <button className="admin-btn" onClick={closeModal} disabled={busy}>
                Cancel
              </button>
              <button className="admin-btn primary" onClick={save} disabled={busy || modalLoading}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM MODAL */}
      <ConfirmModal
        open={confirm.open}
        title={confirm.title}
        body={<div style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{confirm.body}</div>}
        confirmText={confirm.confirmText}
        cancelText="Back"
        busy={busy}
        onCancel={closeConfirm}
        onConfirm={runConfirm}
      />

      {/* Local-only helpers (safe even if adminUsers.css doesn’t have zebra row) */}
      <style>{`
        .au-rowZebra td { background: #fafafa; }
      `}</style>

      <AdminPageFooter />
    </div>
  );
}
