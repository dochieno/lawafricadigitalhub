// src/pages/dashboard/admin/AdminInstitutionAdmins.jsx
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

export default function AdminInstitutionAdmins() {
  const [rows, setRows] = useState([]);
  const [institutions, setInstitutions] = useState([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [modalLoading, setModalLoading] = useState(false);

  // ✅ Adjust here if your API routes differ
  const API_BASE = "/institution-admins";

  async function loadAll() {
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const res = await api.get(API_BASE);
      const data = res.data?.data ?? res.data;
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setRows([]);
      setError(toText(e?.response?.data || e?.message || "Failed to load institution admins."));
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

  function setField(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function openCreate() {
    setError("");
    setInfo("");
    setEditing(null);
    setForm({ ...emptyForm });
    setOpen(true);
  }

  async function openEdit(row) {
    setError("");
    setInfo("");
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
      // If endpoint doesn't exist, we silently keep partial
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
    setError("");
    setInfo("");

    if (!form.institutionId) return setError("Institution is required.");
    if (!form.userEmail.trim()) return setError("User email is required.");

    setBusy(true);
    try {
      const payload = buildPayload();

      if (editing) {
        const id = editing.id ?? editing.Id;
        await api.put(`${API_BASE}/${id}`, payload);
        setInfo("Institution admin updated.");
      } else {
        await api.post(API_BASE, payload);
        setInfo("Institution admin created.");
      }

      closeModal();
      await loadAll();
    } catch (e) {
      setError(toText(e?.response?.data || e?.message || "Save failed."));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row) {
    const id = row.id ?? row.Id;
    const isActive = row.isActive ?? row.IsActive ?? false;

    setError("");
    setInfo("");
    setBusy(true);
    try {
      await api.post(`${API_BASE}/${id}/${isActive ? "deactivate" : "activate"}`);
      setInfo(isActive ? "Institution admin deactivated." : "Institution admin activated.");
      await loadAll();
    } catch (e) {
      setError(toText(e?.response?.data || e?.message || "Failed to update status."));
    } finally {
      setBusy(false);
    }
  }

  function getInstitutionLabelById(idStr) {
    if (!idStr) return "—";
    const found = institutions.find((x) => (x.id ?? x.Id)?.toString?.() === idStr);
    return found ? (found.name ?? found.Name ?? idStr) : idStr;
  }

  return (
    <div className="admin-page admin-page-wide">
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Admin · Institution Admins</h1>
          <p className="admin-subtitle">
            Assign and manage institution-level administrators (Global Admin only).
          </p>
        </div>

        <div className="admin-actions">
          <button className="admin-btn" onClick={loadAll} disabled={busy || loading}>
            Refresh
          </button>
          <button className="admin-btn primary compact" onClick={openCreate} disabled={busy}>
            + New
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
            placeholder="Search by email, role, or institution…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <div className="admin-pill muted">
            {loading ? "Loading…" : `${filtered.length} admin(s)`}
          </div>
        </div>

        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: "28%" }}>Institution</th>
              <th style={{ width: "28%" }}>User Email</th>
              <th style={{ width: "18%" }}>Role</th>
              <th style={{ width: "10%" }}>Status</th>
              <th style={{ textAlign: "right", width: "16%" }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: "#6b7280", padding: "14px" }}>
                  No institution admins found.
                </td>
              </tr>
            )}

            {filtered.map((r) => {
              const id = r.id ?? r.Id;
              const instId = (r.institutionId ?? r.InstitutionId ?? "")?.toString?.() ?? "";
              const email = r.userEmail ?? r.UserEmail ?? r.email ?? r.Email;
              const role = r.role ?? r.Role ?? "InstitutionAdmin";
              const isActive = r.isActive ?? r.IsActive ?? false;

              return (
                <tr key={id}>
                  <td style={{ fontWeight: 900 }}>{getInstitutionLabelById(instId)}</td>
                  <td>{email}</td>

                  <td>
                    <span className="admin-pill">{role}</span>
                  </td>

                  <td>
                    <span className={`admin-pill ${isActive ? "ok" : "muted"}`}>
                      {isActive ? "Active" : "Inactive"}
                    </span>
                  </td>

                  <td>
                    <div className="admin-row-actions">
                      <button
                        className="admin-action-btn neutral small"
                        onClick={() => openEdit(r)}
                        disabled={busy}
                        title="Edit assignment"
                      >
                        Edit
                      </button>

                      <button
                        className={`admin-action-btn small ${isActive ? "warn" : "ok"}`}
                        onClick={() => toggleActive(r)}
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

      {/* MODAL */}
      {open && (
        <div className="admin-modal-overlay" onClick={closeModal}>
          <div className="admin-modal admin-modal-tight" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <div>
                <h3 className="admin-modal-title">
                  {editing ? "Edit Institution Admin" : "Create Institution Admin"}
                </h3>
                <div className="admin-modal-subtitle">
                  {modalLoading ? "Loading full record…" : "Assign an admin to an institution."}
                </div>
              </div>

              <button className="admin-btn" onClick={closeModal} disabled={busy}>
                Close
              </button>
            </div>

            <div className="admin-modal-body admin-modal-scroll">
              {modalLoading && <div className="admin-inline-loading">Fetching details…</div>}

              <div className="admin-grid">
                <div className="admin-field">
                  <label>Institution *</label>
                  <select
                    value={form.institutionId}
                    onChange={(e) => setField("institutionId", e.target.value)}
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
                  <label>User email *</label>
                  <input
                    placeholder="user@example.com"
                    value={form.userEmail}
                    onChange={(e) => setField("userEmail", e.target.value)}
                  />
                </div>

                <div className="admin-field">
                  <label>Role</label>
                  <input
                    value={form.role}
                    onChange={(e) => setField("role", e.target.value)}
                    placeholder="InstitutionAdmin"
                  />
                </div>

                <div className="admin-field">
                  <label>Active?</label>
                  <select
                    value={String(!!form.isActive)}
                    onChange={(e) => setField("isActive", e.target.value === "true")}
                  >
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </div>
              </div>

              <div className="admin-note" style={{ marginTop: 10 }}>
                <b>API expected:</b> GET/POST <code>{API_BASE}</code>, PUT{" "}
                <code>{API_BASE}/{`{id}`}</code>, POST{" "}
                <code>{API_BASE}/{`{id}`}/activate</code> | <code>deactivate</code>
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
      <AdminPageFooter />
    </div>
  );
}
