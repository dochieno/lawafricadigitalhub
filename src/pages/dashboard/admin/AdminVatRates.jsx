import { useEffect, useMemo, useRef, useState } from "react";
import api from "../../../api/client";
import "../../../styles/adminCrud.css";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function getApiErrorMessage(err, fallback = "Request failed.") {
  const data = err?.response?.data;
  if (typeof data === "string") return data;
  if (data?.message) return data.message;
  if (data?.error) return data.error;
  return fallback;
}

export default function AdminVatRates() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [editing, setEditing] = useState(null); // dto or null
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const res = await api.get("/admin/vat-rates");
      setRows(res.data || []);
    } catch (e) {
      setErr(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const defaults = useMemo(() => ({
    id: 0,
    code: "",
    name: "",
    ratePercent: 0,
    countryScope: "",
    isActive: true,
    effectiveFrom: null,
    effectiveTo: null,
  }), []);

  function openCreate() {
    setEditing({ ...defaults });
  }

  function openEdit(r) {
    setEditing({
      id: r.id,
      code: r.code ?? "",
      name: r.name ?? "",
      ratePercent: Number(r.ratePercent ?? 0),
      countryScope: r.countryScope ?? "",
      isActive: !!r.isActive,
      effectiveFrom: r.effectiveFrom ?? null,
      effectiveTo: r.effectiveTo ?? null,
    });
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    setErr("");
    try {
      const dto = {
        id: editing.id,
        code: (editing.code || "").trim(),
        name: (editing.name || "").trim(),
        ratePercent: Number(editing.ratePercent || 0),
        countryScope: (editing.countryScope || "").trim() || null,
        isActive: !!editing.isActive,
        effectiveFrom: editing.effectiveFrom || null,
        effectiveTo: editing.effectiveTo || null,
      };

      if (!dto.code) throw new Error("Code is required.");
      if (!dto.name) throw new Error("Name is required.");

      if (dto.id && dto.id > 0) {
        await api.put(`/admin/vat-rates/${dto.id}`, dto);
      } else {
        await api.post(`/admin/vat-rates`, dto);
      }

      setEditing(null);
      await load();
    } catch (e) {
      setErr(e?.message || getApiErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function del(id) {
    if (!id) return;
    if (!confirm("Delete this VAT rate?")) return;
    setErr("");
    try {
      await api.delete(`/admin/vat-rates/${id}`);
      await load();
    } catch (e) {
      setErr(getApiErrorMessage(e));
    }
  }

  return (
    <div className="au-page">
      <div className="au-header">
        <div>
          <h1 className="au-title">VAT Rates</h1>
          <p className="au-subtitle">Manage tax codes (VAT16, VAT0, VAT18), country scope, activity and effective dates.</p>
        </div>
        <div className="au-actions">
          <button className="au-btn au-btn-primary" onClick={openCreate}>+ New VAT Rate</button>
        </div>
      </div>

      {err ? <div className="au-alert au-alert-danger">{err}</div> : null}

      <div className="au-card">
        {loading ? (
          <div className="au-muted">Loading...</div>
        ) : (
          <div className="au-table-wrap">
            <table className="au-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th className="au-right">Rate %</th>
                  <th>Country Scope</th>
                  <th>Active</th>
                  <th>Effective</th>
                  <th className="au-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id}>
                    <td className="au-mono">{r.code}</td>
                    <td>{r.name}</td>
                    <td className="au-right">{Number(r.ratePercent ?? 0).toFixed(2)}</td>
                    <td className="au-mono">{r.countryScope || "—"}</td>
                    <td>{r.isActive ? "Yes" : "No"}</td>
                    <td className="au-mono">
                      {(r.effectiveFrom ? new Date(r.effectiveFrom).toLocaleDateString() : "—")}
                      {" → "}
                      {(r.effectiveTo ? new Date(r.effectiveTo).toLocaleDateString() : "—")}
                    </td>
                    <td className="au-right">
                      <button className="au-btn au-btn-sm" onClick={() => openEdit(r)}>Edit</button>
                      <button className="au-btn au-btn-sm au-btn-danger" onClick={() => del(r.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
                {!rows.length ? (
                  <tr><td colSpan={7} className="au-muted">No VAT rates yet.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing ? (
        <div className="au-modal-backdrop" role="dialog" aria-modal="true">
          <div className="au-modal">
            <div className="au-modal-header">
              <h2 className="au-modal-title">{editing.id ? "Edit VAT Rate" : "New VAT Rate"}</h2>
              <button className="au-btn au-btn-sm" onClick={() => setEditing(null)}>✕</button>
            </div>

            <div className="au-modal-body">
              <div className="au-grid au-grid-2">
                <label className="au-field">
                  <div className="au-label">Code</div>
                  <input className="au-input" value={editing.code} onChange={e => setEditing({ ...editing, code: e.target.value })} placeholder="VAT16" />
                </label>

                <label className="au-field">
                  <div className="au-label">Rate %</div>
                  <input className="au-input" type="number" step="0.01" value={editing.ratePercent}
                    onChange={e => setEditing({ ...editing, ratePercent: e.target.value })} />
                </label>

                <label className="au-field au-colspan-2">
                  <div className="au-label">Name</div>
                  <input className="au-input" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="Kenya VAT" />
                </label>

                <label className="au-field">
                  <div className="au-label">Country Scope</div>
                  <input className="au-input au-mono" value={editing.countryScope || ""} onChange={e => setEditing({ ...editing, countryScope: e.target.value })} placeholder="KE or *" />
                  <div className="au-hint">Optional: KE / UG / * etc.</div>
                </label>

                <label className="au-field">
                  <div className="au-label">Active</div>
                  <select className="au-input" value={editing.isActive ? "1" : "0"} onChange={e => setEditing({ ...editing, isActive: e.target.value === "1" })}>
                    <option value="1">Yes</option>
                    <option value="0">No</option>
                  </select>
                </label>

                <label className="au-field">
                  <div className="au-label">Effective From</div>
                  <input className="au-input" type="date" value={editing.effectiveFrom ? editing.effectiveFrom.slice(0, 10) : ""} onChange={e => setEditing({ ...editing, effectiveFrom: e.target.value ? `${e.target.value}T00:00:00Z` : null })} />
                </label>

                <label className="au-field">
                  <div className="au-label">Effective To</div>
                  <input className="au-input" type="date" value={editing.effectiveTo ? editing.effectiveTo.slice(0, 10) : ""} onChange={e => setEditing({ ...editing, effectiveTo: e.target.value ? `${e.target.value}T23:59:59Z` : null })} />
                </label>
              </div>
            </div>

            <div className="au-modal-footer">
              <button className="au-btn" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
              <button className="au-btn au-btn-primary" onClick={save} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
