import { useEffect, useMemo, useRef, useState } from "react";
import api from "../../../api/client";
import {
  adminListCourts,
  createCourt,
  updateCourt,
  deleteCourt,
} from "../../../api/courts";
import "../../../styles/adminCrud.css";

const CATEGORIES = ["Criminal", "Civil", "Environmental", "Labour"];

// ----------------------------------
// helpers
// ----------------------------------
function toText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return String(v);
}

function normalizeCategory(v) {
  const t = (v ?? "").trim();
  if (!t) return "Civil";
  const hit = CATEGORIES.find((c) => c.toLowerCase() === t.toLowerCase());
  return hit ?? "Civil";
}

function parseBool(v) {
  const t = (v ?? "").trim().toLowerCase();
  if (!t) return undefined;
  if (["1", "true", "yes", "y"].includes(t)) return true;
  if (["0", "false", "no", "n"].includes(t)) return false;
  return undefined;
}

// Very small CSV parser (handles commas + quoted fields)
function parseCsv(text) {
  const lines = (text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return { headers: [], rows: [] };

  const rows = lines.map(parseCsvLine);
  const headers = rows[0].map((h) => h.trim());
  const data = rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => (obj[h] = r[i] ?? ""));
    return obj;
  });

  return { headers, rows: data };
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      // escaped quote
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

function buildImportRow(row) {
  // Accept flexible header names
  const countryId = Number(row.CountryId ?? row.countryId ?? row.country_id ?? "");
  const name = (row.Name ?? row.name ?? "").trim();
  const category = normalizeCategory(row.Category ?? row.category);
  const abbreviation = (row.Abbreviation ?? row.abbreviation ?? row.Abbrev ?? "").trim();
  const levelRaw = row.Level ?? row.level ?? "";
  const level = levelRaw === "" ? null : Number(levelRaw);
  const displayOrderRaw = row.DisplayOrder ?? row.displayOrder ?? row.display_order ?? "";
  const displayOrder = displayOrderRaw === "" ? 0 : Number(displayOrderRaw);
  const isActive = parseBool(row.IsActive ?? row.isActive ?? row.active);

  // Code is optional — if blank, backend generates KE-CO-001
  const code = (row.Code ?? row.code ?? "").trim();

  const payload = {
    countryId,
    name,
    category,
    abbreviation: abbreviation || null,
    level: Number.isFinite(level) ? level : null,
    displayOrder: Number.isFinite(displayOrder) ? displayOrder : 0,
    isActive: typeof isActive === "boolean" ? isActive : true,
  };

  if (code) payload.code = code;

  return payload;
}

export default function AdminCourts() {
  const [countries, setCountries] = useState([]);
  const [countryId, setCountryId] = useState("");
  const [q, setQ] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [list, setList] = useState([]);

  // Form (create/edit)
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    countryId: "",
    code: "",
    name: "",
    category: "Civil",
    abbreviation: "",
    level: "",
    displayOrder: 0,
    isActive: true,
    notes: "",
  });

  // Import
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importPreview, setImportPreview] = useState([]);
  const fileRef = useRef(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importLog, setImportLog] = useState([]);

  async function loadCountries() {
    const res = await api.get("/Country");
    const data = res?.data ?? [];
    setCountries(Array.isArray(data) ? data : []);

  }

  async function loadCourts() {
    setLoading(true);
    setErr("");
    try {
      const data = await adminListCourts({
        countryId: countryId ? Number(countryId) : null,
        q,
        includeInactive,
      });
      setList(Array.isArray(data) ? data : []);
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || "Failed to load courts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCountries().catch(() => {});
    loadCourts().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadCourts().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryId, includeInactive]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter((x) => {
      const hay =
        `${x.code} ${x.name} ${x.category} ${x.abbreviation ?? ""}`.toLowerCase();
      return hay.includes(term);
    });
  }, [list, q]);

  function resetForm() {
    setEditingId(null);
    setForm({
      countryId: countryId || "",
      code: "",
      name: "",
      category: "Civil",
      abbreviation: "",
      level: "",
      displayOrder: 0,
      isActive: true,
      notes: "",
    });
  }

  function startEdit(row) {
    setEditingId(row.id);
    setForm({
      countryId: String(row.countryId ?? ""),
      code: row.code ?? "",
      name: row.name ?? "",
      category: row.category ?? "Civil",
      abbreviation: row.abbreviation ?? "",
      level: row.level ?? "",
      displayOrder: row.displayOrder ?? 0,
      isActive: row.isActive ?? true,
      notes: row.notes ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSave(e) {
    e.preventDefault();
    setErr("");

    const payload = {
      countryId: Number(form.countryId),
      name: toText(form.name).trim(),
      category: normalizeCategory(form.category),
      abbreviation: toText(form.abbreviation).trim() || null,
      level: form.level === "" ? null : Number(form.level),
      displayOrder: Number(form.displayOrder || 0),
      isActive: !!form.isActive,
      notes: toText(form.notes).trim() || null,
    };

    // optional: allow manual code entry on create only
    if (!editingId) {
      const code = toText(form.code).trim();
      if (code) payload.code = code;
    } else {
      // backend disallows changing code; we send same code if present
      payload.code = toText(form.code).trim() || undefined;
    }

    try {
      setLoading(true);
      if (editingId) {
        await updateCourt(editingId, payload);
      } else {
        await createCourt(payload);
      }
      await loadCourts();
      resetForm();
    } catch (e2) {
      setErr(e2?.response?.data?.message || e2?.message || "Save failed.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this court? If it's used by reports, deactivate instead.")) return;
    setErr("");
    try {
      setLoading(true);
      await deleteCourt(id);
      await loadCourts();
    } catch (e) {
      setErr(e?.response?.data?.message || e?.message || "Delete failed.");
    } finally {
      setLoading(false);
    }
  }

  function openImport() {
    setImportOpen(true);
    setImportText("");
    setImportPreview([]);
    setImportLog([]);
  }

  function closeImport() {
    if (importBusy) return;
    setImportOpen(false);
  }

  function onPickFile() {
    fileRef.current?.click();
  }

  async function onFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    setImportText(text);
    previewImport(text);
    e.target.value = "";
  }

  function previewImport(text) {
    setImportLog([]);
    try {
      const { rows } = parseCsv(text);
      const payloads = rows.map(buildImportRow);

      // basic validate preview
      const checked = payloads.map((p, idx) => {
        const errors = [];
        if (!p.countryId || p.countryId <= 0) errors.push("CountryId missing/invalid");
        if (!p.name) errors.push("Name missing");
        if (!CATEGORIES.includes(p.category)) errors.push("Invalid Category");
        return { idx: idx + 1, payload: p, errors };
      });

      setImportPreview(checked.slice(0, 50)); // show first 50
    } catch (ex) {
      setImportPreview([]);
      setImportLog([{ type: "error", msg: ex.message || "Invalid CSV" }]);
    }
  }

  async function runImport() {
    setImportBusy(true);
    setImportLog([]);
    try {
      const { rows } = parseCsv(importText);
      const payloads = rows.map(buildImportRow);

      const log = [];
      for (let i = 0; i < payloads.length; i++) {
        const p = payloads[i];
        const rowNo = i + 2; // header is row 1
        try {
          // skip invalid
          if (!p.countryId || p.countryId <= 0 || !p.name || !CATEGORIES.includes(p.category)) {
            log.push({ type: "warn", msg: `Row ${rowNo}: skipped (missing/invalid fields)` });
            continue;
          }
          await createCourt(p); // backend generates Code if missing
          log.push({ type: "ok", msg: `Row ${rowNo}: created '${p.name}'` });
        } catch (e) {
          const m = e?.response?.data?.message || e?.message || "Create failed";
          log.push({ type: "error", msg: `Row ${rowNo}: ${m}` });
        }
      }

      setImportLog(log);
      await loadCourts();
    } finally {
      setImportBusy(false);
    }
  }

  return (
    <div className="admin-crud">
      <div className="admin-crud-header">
        <div>
          <h2>Courts</h2>
          <p className="muted">
            Manage courts per country. Codes auto-generate as <code>KE-CO-001</code>.
          </p>
        </div>

        <div className="admin-crud-actions">
          <button className="btn" type="button" onClick={openImport} disabled={loading}>
            Import CSV
          </button>
          <button className="btn secondary" type="button" onClick={resetForm} disabled={loading}>
            New
          </button>
        </div>
      </div>

      {err && <div className="admin-crud-error">{err}</div>}

      {/* Filters */}
      <div className="admin-crud-filters">
        <select
          value={countryId}
          onChange={(e) => {
            setCountryId(e.target.value);
            setForm((f) => ({ ...f, countryId: e.target.value }));
          }}
        >
          <option value="">All Countries</option>
          {countries.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.isoCode ? `(${c.isoCode})` : ""}
            </option>
          ))}
        </select>

        <input
          placeholder="Search code/name/category…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <label className="admin-crud-checkbox">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          <span>Include inactive</span>
        </label>

        <button className="btn" onClick={loadCourts} disabled={loading}>
          Refresh
        </button>
      </div>

      {/* Create/Edit */}
      <form className="admin-crud-card" onSubmit={handleSave}>
        <div className="admin-crud-card-title">
          {editingId ? `Edit Court #${editingId}` : "Create Court"}
        </div>

        <div className="admin-crud-grid">
          <label>
            <span>Country *</span>
            <select
              required
              value={form.countryId}
              onChange={(e) => setForm((f) => ({ ...f, countryId: e.target.value }))}
            >
              <option value="">Select…</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.isoCode ? `(${c.isoCode})` : ""}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Code {editingId ? "(locked)" : "(optional)"}</span>
            <input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder={editingId ? "" : "Leave blank to auto-generate"}
              disabled={!!editingId}
            />
          </label>

          <label>
            <span>Name *</span>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. High Court"
            />
          </label>

          <label>
            <span>Category *</span>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            >
              {CATEGORIES.map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Abbreviation</span>
            <input
              value={form.abbreviation}
              onChange={(e) => setForm((f) => ({ ...f, abbreviation: e.target.value }))}
              placeholder="e.g. HC"
            />
          </label>

          <label>
            <span>Level</span>
            <input
              type="number"
              value={form.level}
              onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}
              placeholder="e.g. 3"
            />
          </label>

          <label>
            <span>Display Order</span>
            <input
              type="number"
              value={form.displayOrder}
              onChange={(e) => setForm((f) => ({ ...f, displayOrder: e.target.value }))}
            />
          </label>

          <label className="admin-crud-checkbox">
            <input
              type="checkbox"
              checked={!!form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            <span>Active</span>
          </label>

          <label className="admin-crud-span2">
            <span>Notes</span>
            <input
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Optional notes"
            />
          </label>
        </div>

        <div className="admin-crud-footer">
          <button className="btn" type="submit" disabled={loading}>
            {editingId ? "Save Changes" : "Create"}
          </button>
          {editingId && (
            <button className="btn secondary" type="button" onClick={resetForm} disabled={loading}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* List */}
      <div className="admin-crud-table-wrap">
        <table className="admin-crud-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Name</th>
              <th>Country</th>
              <th>Category</th>
              <th>Abbrev</th>
              <th>Level</th>
              <th>Status</th>
              <th style={{ width: 160 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="muted">Loading…</td>
              </tr>
            )}

            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">No courts found.</td>
              </tr>
            )}

            {!loading &&
              filtered.map((x) => {
                const c = countries.find((k) => k.id === x.countryId);
                return (
                  <tr key={x.id}>
                    <td><code>{x.code}</code></td>
                    <td>{x.name}</td>
                    <td>{c ? c.name : x.countryId}</td>
                    <td>{x.category}</td>
                    <td>{x.abbreviation || "—"}</td>
                    <td>{x.level ?? "—"}</td>
                    <td>{x.isActive ? "Active" : "Inactive"}</td>
                    <td>
                      <div className="admin-crud-row-actions">
                        <button className="btn tiny" onClick={() => startEdit(x)}>
                          Edit
                        </button>
                        <button className="btn tiny danger" onClick={() => handleDelete(x.id)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {/* Import modal */}
      {importOpen && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 920 }}>
            <h3>Import Courts (CSV)</h3>
            <p className="muted">
              Headers supported (case-insensitive): <code>CountryId</code>, <code>Name</code>,{" "}
              <code>Category</code>, <code>Abbreviation</code>, <code>Level</code>,{" "}
              <code>DisplayOrder</code>, <code>IsActive</code>, optional <code>Code</code>.
              <br />
              If <code>Code</code> is blank, backend generates <code>KE-CO-001</code>.
            </p>

            <div className="admin-crud-actions" style={{ justifyContent: "flex-start", gap: 10 }}>
              <button className="btn" type="button" onClick={onPickFile} disabled={importBusy}>
                Choose CSV
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                onChange={onFileChange}
              />
              <button
                className="btn secondary"
                type="button"
                onClick={() => previewImport(importText)}
                disabled={importBusy}
              >
                Preview
              </button>
            </div>

            <textarea
              value={importText}
              onChange={(e) => {
                setImportText(e.target.value);
              }}
              placeholder="Paste CSV here..."
              style={{ width: "100%", minHeight: 180, marginTop: 12 }}
              disabled={importBusy}
            />

            {importPreview.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="muted" style={{ marginBottom: 6 }}>
                  Preview (first 50 rows)
                </div>
                <div className="admin-crud-table-wrap">
                  <table className="admin-crud-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>CountryId</th>
                        <th>Name</th>
                        <th>Category</th>
                        <th>Abbrev</th>
                        <th>Level</th>
                        <th>Errors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.map((r) => (
                        <tr key={r.idx}>
                          <td>{r.idx}</td>
                          <td>{r.payload.countryId}</td>
                          <td>{r.payload.name}</td>
                          <td>{r.payload.category}</td>
                          <td>{r.payload.abbreviation || "—"}</td>
                          <td>{r.payload.level ?? "—"}</td>
                          <td style={{ color: r.errors.length ? "inherit" : "inherit" }}>
                            {r.errors.length ? r.errors.join("; ") : "OK"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {importLog.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="muted" style={{ marginBottom: 6 }}>Import log</div>
                <div className="admin-crud-log">
                  {importLog.slice(0, 200).map((l, i) => (
                    <div key={i} className={`log-${l.type}`}>
                      {l.msg}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="modal-actions" style={{ marginTop: 14 }}>
              <button className="modal-btn secondary" onClick={closeImport} disabled={importBusy}>
                Close
              </button>
              <button className="modal-btn" onClick={runImport} disabled={importBusy || !importText.trim()}>
                {importBusy ? "Importing..." : "Run Import"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
