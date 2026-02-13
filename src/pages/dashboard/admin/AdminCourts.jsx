// =======================================================
// FILE: src/pages/dashboard/admin/AdminCourts.jsx
// Purpose: Premium Admin Courts CRUD (AU-style)
// Routes (matches your controller):
//  - GET    /courts?countryId=&q=&includeInactive=
//  - GET    /courts/{id}
//  - POST   /courts
//  - PUT    /courts/{id}   (204 NoContent)
//  - DELETE /courts/{id}   (204 NoContent)
// Notes:
// - No inline CSS (all in adminCourts.css)
// - Uses adminCrud.css + adminUsers.css (au-* system)
// =======================================================

import { useEffect, useMemo, useRef, useState } from "react";
import api from "../../../api/client";
import "../../../styles/adminCrud.css";
import "../../../styles/adminUsers.css";
import "../../../styles/adminCourts.css";
import AdminPageFooter from "../../../components/AdminPageFooter";

/* =========================
   Helpers
========================= */
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
  if (status === 403) return serverMsg || "You don’t have permission to do that (Admin only).";
  return serverMsg || toText(e?.message || "Request failed.");
}

function makeToast(setToast) {
  return (type, text) => {
    setToast({ type, text });
    window.setTimeout(() => setToast(null), 2200);
  };
}

function safeId(x) {
  return x?.id ?? x?.Id ?? null;
}

function pick(x, ...keys) {
  for (const k of keys) {
    const v = x?.[k];
    if (v !== undefined) return v;
  }
  return undefined;
}

function asBool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.toLowerCase() === "true" || v === "1";
  return !!v;
}

function asIntOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* =========================
   AU mini UI (reused)
========================= */
function Badge({ tone = "neutral", children }) {
  return <span className={`au-badge au-badge-${tone}`}>{children}</span>;
}

function IconBtn({ tone = "neutral", disabled, title, onClick, children }) {
  return (
    <button
      type="button"
      className={`au-iconBtn au-iconBtn-${tone}`}
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
}

function Icon({ name }) {
  switch (name) {
    case "search":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M10.5 18a7.5 7.5 0 1 1 5.3-12.8A7.5 7.5 0 0 1 10.5 18Zm6.2-1.2L22 22"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "spinner":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="au-spin">
          <path
            d="M12 2a10 10 0 1 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "plus":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M12 5v14M5 12h14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "edit":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M12 20h9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path
            d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "trash":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M3 6h18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M8 6V4h8v2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path
            d="M6 6l1 16h10l1-16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "upload":
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M12 16V3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path
            d="M7 8l5-5 5 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M4 21h16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}

/* =========================
   Forms
========================= */
const emptyForm = {
  countryId: "",
  code: "",
  name: "",
  category: "Civil",
  abbreviation: "",
  level: "",
  displayOrder: "0",
  isActive: true,
  notes: "",
};

const CATEGORY_OPTIONS = ["Civil", "Criminal", "Environmental", "Labour"];

export default function AdminCourts() {
  const [countries, setCountries] = useState([]);
  const [rows, setRows] = useState([]);

  const [countryId, setCountryId] = useState("");
  const [q, setQ] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [toast, setToast] = useState(null);
  const showToast = useMemo(() => makeToast(setToast), []);

  // Create/Edit modal
  const [openEdit, setOpenEdit] = useState(false);
  const [editMode, setEditMode] = useState("create"); // create|edit
  const [form, setForm] = useState({ ...emptyForm });
  const [editTarget, setEditTarget] = useState(null);

  // Import modal (UI ready; backend endpoint not provided in controller)
  const [openImport, setOpenImport] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importMode, setImportMode] = useState("upsert"); // upsert|createOnly
  const fileRef = useRef(null);

  // -------------------------
  // Load countries
  // -------------------------
  async function loadCountries() {
    try {
      const res = await api.get("/Country");
      const data = res.data?.data ?? res.data;
      const list = Array.isArray(data) ? data : [];
      setCountries(list);

      if (!countryId && list.length) {
        const firstId = pick(list[0], "id", "Id");
        if (firstId) setCountryId(String(firstId));
      }
    } catch {
      setCountries([]);
    }
  }

  // -------------------------
  // Load courts (matches GET /api/courts)
  // -------------------------
  async function loadCourts() {
    setError("");
    setInfo("");
    setLoading(true);

    try {
      const res = await api.get("/courts", {
        params: {
          countryId: countryId ? Number(countryId) : undefined,
          q: q?.trim() || undefined,
          includeInactive: includeInactive ? true : undefined,
        },
      });

      const data = res.data?.data ?? res.data;
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setRows([]);
      setError(normalizeApiError(e) || "Failed to load courts.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCountries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!countryId) return;
    loadCourts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryId, includeInactive]);

  // debounced q -> server query param q
  useEffect(() => {
    if (!countryId) return;
    const t = window.setTimeout(() => loadCourts(), 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // -------------------------
  // Derived
  // -------------------------
  const filtered = useMemo(() => rows, [rows]); // server already filters by q when provided

  const summary = useMemo(() => {
    const total = filtered.length;
    let active = 0;
    let inactive = 0;
    for (const r of filtered) {
      const isActive = asBool(pick(r, "isActive", "IsActive"));
      if (isActive) active += 1;
      else inactive += 1;
    }
    return { total, active, inactive };
  }, [filtered]);

  // -------------------------
  // Modal handlers
  // -------------------------
  function openCreate() {
    setError("");
    setInfo("");
    setEditMode("create");
    setEditTarget(null);
    setForm({
      ...emptyForm,
      countryId: countryId || "",
      isActive: true,
      category: "Civil",
      displayOrder: "0",
    });
    setOpenEdit(true);
  }

  function openEditModal(row) {
    setError("");
    setInfo("");
    setEditMode("edit");
    setEditTarget(row);

    setForm({
      countryId: String(pick(row, "countryId", "CountryId") ?? ""),
      code: String(pick(row, "code", "Code") ?? ""),
      name: String(pick(row, "name", "Name") ?? ""),
      category: String(pick(row, "category", "Category") ?? "Civil"),
      abbreviation: String(pick(row, "abbreviation", "Abbreviation") ?? ""),
      level: pick(row, "level", "Level") == null ? "" : String(pick(row, "level", "Level")),
      displayOrder: String(pick(row, "displayOrder", "DisplayOrder") ?? "0"),
      isActive: asBool(pick(row, "isActive", "IsActive")),
      notes: String(pick(row, "notes", "Notes") ?? ""),
    });

    setOpenEdit(true);
  }

  function closeEditModal() {
    if (busy) return;
    setOpenEdit(false);
  }

  function openImportModal() {
    setError("");
    setInfo("");
    setImportFile(null);
    setImportMode("upsert");
    setOpenImport(true);
  }

  function closeImportModal() {
    if (busy) return;
    setOpenImport(false);
  }

  // -------------------------
  // CRUD (matches controller)
  // -------------------------
  async function saveCourt(e) {
    e?.preventDefault?.();
    setError("");
    setInfo("");

    if (!form.countryId) return setError("Please select a country.");
    if (!form.name?.trim()) return setError("Name is required.");
    if (!form.category?.trim()) return setError("Category is required.");

    // CourtUpsertDto (assumed fields to match your UI)
    const payload = {
      countryId: Number(form.countryId),
      code: form.code?.trim() ? form.code.trim() : null,
      name: form.name.trim(),
      category: form.category.trim(),
      abbreviation: form.abbreviation?.trim() ? form.abbreviation.trim() : null,
      level: asIntOrNull(form.level),
      displayOrder: Number(form.displayOrder || 0),
      isActive: !!form.isActive,
      notes: form.notes?.trim() ? form.notes.trim() : null,
    };

    setBusy(true);
    try {
      if (editMode === "create") {
        // POST /api/courts -> 201 Created + CourtDto body
        const res = await api.post("/courts", payload);
        const created = res.data?.data ?? res.data;
        showToast("success", `Court created${created?.code ? ` • ${created.code}` : ""}`);
      } else {
        const id = safeId(editTarget);
        if (!id) throw new Error("Missing target Id");

        // PUT /api/courts/{id} -> 204 NoContent
        await api.put(`/courts/${id}`, payload);
        showToast("success", "Court updated");
      }

      setOpenEdit(false);
      await loadCourts();
    } catch (err) {
      setError(normalizeApiError(err) || "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function removeCourt(row) {
    if (busy) return;

    const id = safeId(row);
    const name = pick(row, "name", "Name") ?? "—";

    const msg =
      `Delete this court?\n\n` +
      `• ${name}\n\n` +
      `If you only want to hide it, edit and set it inactive instead.`;

    if (!window.confirm(msg)) return;

    setBusy(true);
    setError("");
    try {
      // DELETE /api/courts/{id} -> 204 NoContent
      await api.delete(`/courts/${id}`);
      showToast("success", "Court deleted");
      await loadCourts();
    } catch (err) {
      setError(normalizeApiError(err) || "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  // -------------------------
  // CSV Import (UI ready)
  // -------------------------
  async function importCsv(e) {
    e?.preventDefault?.();
    setError("");
    setInfo("");

    if (!countryId) return setError("Select a country first.");
    if (!importFile) return setError("Please choose a CSV file.");

    const fd = new FormData();
    fd.append("file", importFile);
    fd.append("countryId", String(countryId));
    fd.append("mode", importMode);

    setBusy(true);
    try {
      // ⚠️ You did not include an import endpoint in the controller you pasted.
      // If you already have one elsewhere, set it here (example):
      // await api.post("/courts/import", fd, { headers: { "Content-Type": "multipart/form-data" } });

      await api.post("/courts/import", fd, { headers: { "Content-Type": "multipart/form-data" } });

      showToast("success", "Import complete.");
      setOpenImport(false);
      setImportFile(null);
      if (fileRef.current) fileRef.current.value = "";
      await loadCourts();
    } catch (err) {
      setError(normalizeApiError(err) || "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  // -------------------------
  // UI
  // -------------------------
  return (
    <div className="au-wrap la-courts">
      {toast ? (
        <div className={`toast ${toast.type === "success" ? "toast-success" : "toast-error"}`}>
          {toast.text}
        </div>
      ) : null}

      <header className="au-hero">
        <div className="au-heroLeft">
          <div className="au-titleRow">
            <div className="au-titleStack">
              <div className="au-kicker">LawAfrica • Admin</div>
              <h1 className="au-title">Courts</h1>
              <div className="au-subtitle">
                Manage courts per country. Codes auto-generate as <b>KE-CO-001</b>.
              </div>
            </div>

            <div className="au-heroRight">
              <button className="au-refresh la-courtsBtn" type="button" onClick={loadCourts} disabled={busy || loading}>
                {loading ? "Refreshing…" : "Refresh"}
              </button>

              <button className="au-refresh la-courtsBtn" type="button" onClick={openImportModal} disabled={busy}>
                <span className="la-btnIcon" aria-hidden="true">
                  <Icon name="upload" />
                </span>
                Import CSV
              </button>

              <button className="au-refresh la-courtsBtn" type="button" onClick={openCreate} disabled={busy}>
                <span className="la-btnIcon" aria-hidden="true">
                  <Icon name="plus" />
                </span>
                New
              </button>
            </div>
          </div>

          {error ? <div className="au-error">{error}</div> : null}
          {info ? <div className="au-info">{info}</div> : null}

          <div className="au-topbar la-courtsTopbar">
            <div className="au-search">
              <span className="au-searchIcon" aria-hidden="true">
                <Icon name="search" />
              </span>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search code, name, category…"
                aria-label="Search courts"
              />
              {q ? (
                <button className="au-clear" type="button" onClick={() => setQ("")} aria-label="Clear search">
                  ✕
                </button>
              ) : null}
            </div>

            <div className="la-courtsFilters">
              <div className="la-courtsField">
                <label className="la-courtsLabel">Country</label>
                <select value={countryId} onChange={(e) => setCountryId(e.target.value)} aria-label="Select country">
                  <option value="">Select…</option>
                  {countries.map((c) => {
                    const id = safeId(c);
                    const name = pick(c, "name", "Name") ?? "";
                    const code = pick(c, "code", "Code") ?? "";
                    return (
                      <option key={id} value={id}>
                        {name} {code ? `(${code})` : ""}
                      </option>
                    );
                  })}
                </select>
              </div>

              <label className="la-courtsCheck">
                <input
                  type="checkbox"
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                />
                <span>Include inactive</span>
              </label>
            </div>
          </div>

          <div className="au-kpis la-courtsKpis">
            <div className="au-kpiCard">
              <div className="au-kpiLabel">Shown</div>
              <div className="au-kpiValue">{summary.total}</div>
            </div>
            <div className="au-kpiCard">
              <div className="au-kpiLabel">Active</div>
              <div className="au-kpiValue">{summary.active}</div>
            </div>
            <div className="au-kpiCard">
              <div className="au-kpiLabel">Inactive</div>
              <div className="au-kpiValue">{summary.inactive}</div>
            </div>
          </div>
        </div>
      </header>

      <section className="au-panel">
        <div className="au-panelTop">
          <div className="au-panelTitle">{loading ? "Loading…" : "Court directory"}</div>
          <div className="au-muted">{loading ? "—" : `${filtered.length} record(s)`}</div>
        </div>

        <div className="au-tableWrap">
          <table className="au-table au-tableModern la-courtsTable">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Category</th>
                <th>Abbrev.</th>
                <th>Level</th>
                <th>Order</th>
                <th>Status</th>
                <th className="au-thRight">Actions</th>
              </tr>
            </thead>

            <tbody>
              {!loading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="au-empty">
                    No courts found for the selected filters.
                  </td>
                </tr>
              ) : null}

              {filtered.map((r) => {
                const id = safeId(r);
                const code = pick(r, "code", "Code") ?? "—";
                const name = pick(r, "name", "Name") ?? "—";
                const category = pick(r, "category", "Category") ?? "—";
                const abbr = pick(r, "abbreviation", "Abbreviation") ?? "—";
                const level = pick(r, "level", "Level");
                const order = pick(r, "displayOrder", "DisplayOrder");
                const active = asBool(pick(r, "isActive", "IsActive"));

                return (
                  <tr key={id}>
                    <td className="la-courtsCode">{code}</td>
                    <td className="la-courtsName">{name}</td>

                    <td>
                      <Badge tone="neutral">{category}</Badge>
                    </td>

                    <td>{abbr || "—"}</td>
                    <td>{level == null || level === "" ? <span className="la-muted">—</span> : level}</td>
                    <td>{order == null ? 0 : order}</td>

                    <td>
                      <Badge tone={active ? "success" : "neutral"}>{active ? "Active" : "Inactive"}</Badge>
                    </td>

                    <td className="au-tdRight">
                      <div className="au-actionsRow">
                        <IconBtn tone="neutral" disabled={busy} title="Edit court" onClick={() => openEditModal(r)}>
                          <Icon name="edit" />
                        </IconBtn>

                        <IconBtn tone="danger" disabled={busy} title="Delete court" onClick={() => removeCourt(r)}>
                          <Icon name="trash" />
                        </IconBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="au-panelBottom">
          <div className="au-muted">To deactivate a court, edit it and uncheck “Active”.</div>
          <div className="au-muted">Import CSV is wired to <b>/api/courts/import</b> (ensure the endpoint exists).</div>
        </div>
      </section>

      <AdminPageFooter right={<span className="admin-footer-muted">LawAfrica • Admin Console</span>} />

      {/* =========================
          CREATE / EDIT MODAL
      ========================= */}
      {openEdit && (
        <div className="admin-modal-overlay" onClick={closeEditModal}>
          <div className="admin-modal admin-modal-tight la-courtsModal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head admin-modal-head-x">
              <div>
                <h3 className="admin-modal-title">{editMode === "create" ? "Create Court" : "Edit Court"}</h3>
                <div className="admin-modal-subtitle">
                  Codes auto-generate if you leave <b>Code</b> blank.
                </div>
              </div>

              <button
                type="button"
                className="admin-modal-xbtn"
                onClick={closeEditModal}
                disabled={busy}
                aria-label="Close"
                title="Close"
              >
                ✕
              </button>
            </div>

            <form className="admin-modal-body admin-modal-scroll" onSubmit={saveCourt}>
              <div className="admin-grid la-courtsGrid">
                <div className="admin-field">
                  <label>Country *</label>
                  <select
                    value={form.countryId}
                    onChange={(e) => setForm((p) => ({ ...p, countryId: e.target.value }))}
                    disabled={editMode === "edit"}
                  >
                    <option value="">Select…</option>
                    {countries.map((c) => {
                      const id = safeId(c);
                      const name = pick(c, "name", "Name") ?? "";
                      const code = pick(c, "code", "Code") ?? "";
                      return (
                        <option key={id} value={id}>
                          {name} {code ? `(${code})` : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="admin-field">
                  <label>Code (optional)</label>
                  <input
                    value={form.code}
                    onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                    placeholder="Leave blank to auto-generate"
                    disabled={editMode === "edit"}
                  />
                </div>

                <div className="admin-field admin-span2">
                  <label>Name *</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. High Court"
                  />
                </div>

                <div className="admin-field">
                  <label>Category *</label>
                  <select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}>
                    {CATEGORY_OPTIONS.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-field">
                  <label>Abbreviation</label>
                  <input
                    value={form.abbreviation}
                    onChange={(e) => setForm((p) => ({ ...p, abbreviation: e.target.value }))}
                    placeholder="e.g. HC"
                  />
                </div>

                <div className="admin-field">
                  <label>Level</label>
                  <input
                    value={form.level}
                    onChange={(e) => setForm((p) => ({ ...p, level: e.target.value }))}
                    placeholder="e.g. 3"
                    inputMode="numeric"
                  />
                </div>

                <div className="admin-field">
                  <label>Display order</label>
                  <input
                    value={form.displayOrder}
                    onChange={(e) => setForm((p) => ({ ...p, displayOrder: e.target.value }))}
                    inputMode="numeric"
                  />
                </div>

                <div className="admin-field admin-span2">
                  <label>Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Optional notes"
                    rows={4}
                  />
                </div>

                <div className="admin-field la-courtsCheckRow">
                  <label className="la-courtsCheck la-courtsCheckLarge">
                    <input
                      type="checkbox"
                      checked={!!form.isActive}
                      onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))}
                    />
                    <span>Active</span>
                  </label>
                </div>
              </div>

              <div className="admin-modal-foot">
                <button className="admin-btn" type="button" onClick={closeEditModal} disabled={busy}>
                  Cancel
                </button>
                <button className="admin-btn primary" type="submit" disabled={busy}>
                  {busy ? "Saving…" : editMode === "create" ? "Create" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================
          IMPORT CSV MODAL (UI ready)
      ========================= */}
      {openImport && (
        <div className="admin-modal-overlay" onClick={closeImportModal}>
          <div className="admin-modal admin-modal-tight la-courtsModal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head admin-modal-head-x">
              <div>
                <h3 className="admin-modal-title">Import Courts (CSV)</h3>
                <div className="admin-modal-subtitle">
                  This UI posts to <b>/api/courts/import</b>. Ensure you have that endpoint (multipart).
                </div>
              </div>

              <button
                type="button"
                className="admin-modal-xbtn"
                onClick={closeImportModal}
                disabled={busy}
                aria-label="Close"
                title="Close"
              >
                ✕
              </button>
            </div>

            <form className="admin-modal-body admin-modal-scroll" onSubmit={importCsv}>
              <div className="admin-grid la-courtsGrid">
                <div className="admin-field admin-span2">
                  <label>Import mode</label>
                  <select value={importMode} onChange={(e) => setImportMode(e.target.value)}>
                    <option value="upsert">Upsert (recommended)</option>
                    <option value="createOnly">Create only</option>
                  </select>
                  <div className="admin-help la-courtsHelp">
                    Upsert updates existing matches (usually by Country+Code or Country+Name).
                  </div>
                </div>

                <div className="admin-field admin-span2">
                  <label>CSV file *</label>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  />
                  <div className="admin-help la-courtsHelp">
                    Tip: Save as <b>CSV (UTF-8)</b>.
                  </div>
                </div>

                <div className="admin-field admin-span2 la-courtsSample">
                  <div className="la-courtsSampleTitle">Sample CSV</div>
                  <pre className="la-courtsSamplePre">
{`Name,Category,Abbreviation,Level,DisplayOrder,IsActive,Notes
High Court,Civil,HC,3,0,true,
Employment & Labour Relations Court,Labour,ELRC,4,10,true,`}
                  </pre>
                </div>
              </div>

              <div className="admin-modal-foot">
                <button className="admin-btn" type="button" onClick={closeImportModal} disabled={busy}>
                  Cancel
                </button>
                <button className="admin-btn primary" type="submit" disabled={busy}>
                  {busy ? "Importing…" : "Import"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
