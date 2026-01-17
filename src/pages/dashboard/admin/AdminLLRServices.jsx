import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../../api/client";
import "../../../styles/adminCrud.css";

/**
 * Admin · LLR Services (Law Reports)
 *
 * ✅ This page is now the REAL LawReports admin module.
 * - Create/Edit LawReport (creates its LegalDocument parent on create)
 * - Import Excel/Word preview + confirm
 * - List/Search
 * - Open Report Content editor (by LawReportId)
 *
 * NOTE:
 * - This expects a list endpoint:
 *   GET /api/law-reports/admin   (recommended)
 *   Fallback: GET /api/law-reports (if you implement list there)
 *
 * If you don't have a list endpoint yet, add one (simple projection).
 */

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

const DECISION_OPTIONS = [
  { label: "Judgment", value: 1 },
  { label: "Ruling", value: 2 },
];

const CASETYPE_OPTIONS = [
  { label: "Criminal", value: 1 },
  { label: "Civil", value: 2 },
  { label: "Environmental", value: 3 },
  { label: "Family", value: 4 },
  { label: "Commercial", value: 5 },
  { label: "Constitutional", value: 6 },
];

function toInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function toIntOrNull(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

function isoOrNullFromDateInput(yyyyMmDd) {
  const s = String(yyyyMmDd || "").trim();
  if (!s) return null;
  // date input gives YYYY-MM-DD; convert to ISO
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function dateInputFromIso(iso) {
  if (!iso) return "";
  try {
    return String(iso).slice(0, 10);
  } catch {
    return "";
  }
}

const emptyForm = {
  citation: "",
  reportNumber: "",
  year: "",
  caseNumber: "",
  decisionType: 1,
  caseType: 2,
  court: "",
  parties: "",
  judges: "",
  decisionDate: "",
  contentText: "",
};

export default function AdminLLRServices() {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // Create/Edit modal
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null); // LawReportDto
  const [form, setForm] = useState({ ...emptyForm });

  // Import
  const [importOpen, setImportOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");
  const [importInfo, setImportInfo] = useState("");

  const [preview, setPreview] = useState(null); // ReportImportPreviewDto
  const [dupStrategy, setDupStrategy] = useState("Skip");

  const excelInputRef = useRef(null);
  const wordInputRef = useRef(null);

  const [wordReportNumber, setWordReportNumber] = useState("");
  const [wordYear, setWordYear] = useState("");

  function setField(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function resetForm() {
    setEditing(null);
    setForm({ ...emptyForm });
  }

  function closeModal() {
    if (busy) return;
    setOpen(false);
  }

  function closeImport() {
    if (importBusy) return;
    setImportOpen(false);
    setPreview(null);
    setImportError("");
    setImportInfo("");
    setDupStrategy("Skip");
    setWordReportNumber("");
    setWordYear("");
    if (excelInputRef.current) excelInputRef.current.value = "";
    if (wordInputRef.current) wordInputRef.current.value = "";
  }

  async function fetchList() {
    setLoading(true);
    setError("");
    setInfo("");

    try {
      // Prefer /law-reports/admin (recommended)
      let res;
      try {
        res = await api.get("/law-reports/admin");
      } catch (e) {
        const st = e?.response?.status;
        // Fallback: /law-reports (if you implement list there)
        if (st === 404 || st === 405) res = await api.get("/law-reports");
        else throw e;
      }

      const list = Array.isArray(res.data) ? res.data : [];
      setRows(list);
    } catch (e) {
      setRows([]);
      setError(getApiErrorMessage(e, "Failed to load law reports."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchList();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      const title = String(r.title ?? "").toLowerCase();
      const reportNumber = String(r.reportNumber ?? "").toLowerCase();
      const year = String(r.year ?? "").toLowerCase();
      const citation = String(r.citation ?? "").toLowerCase();
      const parties = String(r.parties ?? "").toLowerCase();
      const court = String(r.court ?? "").toLowerCase();
      const caseNo = String(r.caseNumber ?? "").toLowerCase();
      const judges = String(r.judges ?? "").toLowerCase();

      const meta = `${reportNumber} ${year} ${citation} ${parties} ${court} ${caseNo} ${judges}`;
      return title.includes(s) || meta.includes(s);
    });
  }, [rows, q]);

  function openCreate() {
    setError("");
    setInfo("");
    resetForm();
    // sensible defaults
    setForm((p) => ({
      ...p,
      decisionType: 1,
      caseType: 2,
      year: String(new Date().getUTCFullYear()),
    }));
    setOpen(true);
  }

  async function openEdit(row) {
    setError("");
    setInfo("");
    setBusy(true);
    setOpen(true);
    setEditing(row);

    try {
      // Load full report to ensure we have ContentText etc
      const res = await api.get(`/law-reports/${row.id}`);
      const d = res.data;

      setEditing(d);

      setForm({
        citation: d.citation ?? "",
        reportNumber: d.reportNumber ?? "",
        year: d.year ?? "",
        caseNumber: d.caseNumber ?? "",
        decisionType: toInt(d.decisionType, 1),
        caseType: toInt(d.caseType, 2),
        court: d.court ?? "",
        parties: d.parties ?? "",
        judges: d.judges ?? "",
        decisionDate: dateInputFromIso(d.decisionDate),
        contentText: d.contentText ?? "",
      });
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to load report details."));
      closeModal();
    } finally {
      setBusy(false);
    }
  }

  function buildPayload() {
    return {
      citation: form.citation?.trim() || null,
      reportNumber: String(form.reportNumber || "").trim(),
      year: toIntOrNull(form.year) ?? new Date().getUTCFullYear(),
      caseNumber: form.caseNumber?.trim() || null,

      // enums as ints (safer for System.Text.Json)
      decisionType: toInt(form.decisionType, 1),
      caseType: toInt(form.caseType, 2),

      court: form.court?.trim() || null,
      parties: form.parties?.trim() || null,
      judges: form.judges?.trim() || null,
      decisionDate: isoOrNullFromDateInput(form.decisionDate),

      contentText: String(form.contentText ?? ""),
    };
  }

  function validate() {
    if (!String(form.reportNumber || "").trim()) return "Report number is required (e.g. CAR353).";
    const year = toIntOrNull(form.year);
    if (!year || year < 1900 || year > 2100) return "Year must be between 1900 and 2100.";
    if (!String(form.contentText ?? "").trim()) return "Content text is required.";
    return "";
  }

  async function save() {
    const msg = validate();
    if (msg) return setError(msg);

    setBusy(true);
    setError("");
    setInfo("");

    try {
      const payload = buildPayload();

      if (editing?.id) {
        await api.put(`/law-reports/${editing.id}`, payload);
        setInfo("Law report updated.");
      } else {
        const res = await api.post("/law-reports", payload);
        const newId = res.data?.id ?? res.data?.data?.id ?? null;
        setInfo(newId ? `Law report created (#${newId}).` : "Law report created.");
      }

      await fetchList();
      closeModal();
    } catch (e) {
      setError(getApiErrorMessage(e, "Save failed."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(row) {
    if (!row?.id) return;
    const ok = window.confirm(`Delete this report?\n\n${row.title || row.reportNumber || ""}`);
    if (!ok) return;

    setBusy(true);
    setError("");
    setInfo("");

    try {
      await api.delete(`/law-reports/${row.id}`);
      setInfo("Deleted.");
      await fetchList();
    } catch (e) {
      setError(getApiErrorMessage(e, "Delete failed."));
    } finally {
      setBusy(false);
    }
  }

  // -------- Import handlers --------

  async function importExcel(file) {
    setImportError("");
    setImportInfo("");
    setPreview(null);
    if (!file) return;

    setImportBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);

      const res = await api.post("/law-reports/import/excel", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setPreview(res.data);
      setImportInfo("Preview ready. Review and confirm.");
    } catch (e) {
      setImportError(getApiErrorMessage(e, "Excel import preview failed."));
    } finally {
      setImportBusy(false);
    }
  }

  async function importWord(file) {
    setImportError("");
    setImportInfo("");
    setPreview(null);

    if (!file) return;
    if (!String(wordReportNumber || "").trim()) return setImportError("Report number is required for Word import.");
    const y = toIntOrNull(wordYear);
    if (!y || y < 1900 || y > 2100) return setImportError("Year must be between 1900 and 2100.");

    setImportBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      fd.append("reportNumber", String(wordReportNumber).trim());
      fd.append("year", String(y));

      const res = await api.post("/law-reports/import/word", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setPreview(res.data);
      setImportInfo("Preview ready. Review and confirm.");
    } catch (e) {
      setImportError(getApiErrorMessage(e, "Word import preview failed."));
    } finally {
      setImportBusy(false);
    }
  }

  async function confirmImport() {
    if (!preview?.items?.length) return setImportError("No preview items to confirm.");

    setImportBusy(true);
    setImportError("");
    setImportInfo("");

    try {
      await api.post("/law-reports/import/confirm", {
        duplicateStrategy: dupStrategy, // "Skip" | "Update"
        items: preview.items,
      });

      setImportInfo("Import completed.");
      setPreview(null);
      await fetchList();
    } catch (e) {
      setImportError(getApiErrorMessage(e, "Import confirm failed."));
    } finally {
      setImportBusy(false);
    }
  }

  function openContent(row) {
    // Route stays under /admin/llr-services/... to keep naming,
    // but param is now LawReportId, NOT LegalDocumentId.
    navigate(`/dashboard/admin/llr-services/${row.id}/content`, {
      state: { title: row.title || "" },
    });
  }

  return (
    <div className="admin-page admin-page-wide">
      <style>{`
        .admin-table-wrap { max-height: 68vh; overflow:auto; border-radius: 14px; }
        .admin-table thead th { position: sticky; top: 0; z-index: 2; background: #fafafa; }
        .row-zebra { background: #fafafa; }
        .row-hover:hover td { background: #fbfbff; }
        .num-cell { text-align:right; font-variant-numeric: tabular-nums; }
        .tight { white-space: nowrap; }
        .pill2 { display:inline-flex; align-items:center; gap:6px; padding: 6px 10px; border-radius:999px; border:1px solid #e5e7eb; background:#fff; font-weight:900; font-size:12px; }
        .import-box { border: 1px dashed #d1d5db; border-radius: 14px; background:#fff; padding: 12px; }
        .import-row { display:flex; gap:12px; flex-wrap:wrap; align-items:flex-end; }
        .import-col { display:flex; flex-direction:column; gap:6px; min-width: 200px; }
        .import-label { font-weight: 900; font-size: 12px; color:#374151; }
        .hint { color:#6b7280; font-size:12px; font-weight:700; }
        .preview-wrap { margin-top: 10px; border-radius: 14px; border: 1px solid #e5e7eb; overflow:hidden; background:#fff; }
        .preview-head { display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; padding: 10px 12px; background:#fafafa; border-bottom: 1px solid #e5e7eb; }
        .preview-table { width:100%; border-collapse: collapse; font-size: 12px; }
        .preview-table th, .preview-table td { border-bottom: 1px solid #f3f4f6; padding: 8px 10px; vertical-align: top; }
        .err { color:#991b1b; font-weight:900; }
        .oktxt { color:#065f46; font-weight:900; }
      `}</style>

      <div className="admin-header">
        <div>
          <h1 className="admin-title">Admin · LLR Services (Reports)</h1>
          <p className="admin-subtitle">
            Create and manage law reports. Saving a report automatically creates its linked LegalDocument.
          </p>
        </div>

        <div className="admin-actions">
          <button className="admin-btn" onClick={fetchList} disabled={busy || loading}>
            Refresh
          </button>

          <button className="admin-btn" onClick={() => setImportOpen(true)} disabled={busy}>
            Import
          </button>

          <button className="admin-btn primary compact" onClick={openCreate} disabled={busy}>
            + New Report
          </button>
        </div>
      </div>

      {(error || info) && <div className={`admin-alert ${error ? "error" : "ok"}`}>{error || info}</div>}

      <div className="admin-card admin-card-fill">
        <div className="admin-toolbar">
          <input
            className="admin-search admin-search-wide"
            placeholder="Search by title, report number, year, parties, citation, court..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="admin-pill muted">{loading ? "Loading…" : `${filtered.length} report(s)`}</div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: "28%" }}>Title</th>
                <th style={{ width: "10%" }}>Report No.</th>
                <th style={{ width: "6%" }} className="num-cell">
                  Year
                </th>
                <th style={{ width: "10%" }}>Decision</th>
                <th style={{ width: "10%" }}>Case Type</th>
                <th style={{ width: "18%" }}>Parties</th>
                <th style={{ width: "10%" }}>Court</th>
                <th style={{ width: "8%" }} className="tight">
                  Date
                </th>
                <th style={{ width: "10%", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ color: "#6b7280", padding: 14 }}>
                    No reports found. Click “+ New Report” or use Import.
                  </td>
                </tr>
              )}

              {filtered.map((r, idx) => (
                <tr key={r.id} className={`${idx % 2 === 1 ? "row-zebra" : ""} row-hover`}>
                  <td style={{ fontWeight: 900 }}>{r.title || "—"}</td>
                  <td className="tight">{r.reportNumber || "—"}</td>
                  <td className="num-cell">{r.year ?? "—"}</td>
                  <td>{DECISION_OPTIONS.find((x) => x.value === toInt(r.decisionType))?.label || "—"}</td>
                  <td>{CASETYPE_OPTIONS.find((x) => x.value === toInt(r.caseType))?.label || "—"}</td>
                  <td>{r.parties || "—"}</td>
                  <td>{r.court || "—"}</td>
                  <td className="tight">{r.decisionDate ? String(r.decisionDate).slice(0, 10) : "—"}</td>
                  <td>
                    <div className="admin-row-actions" style={{ justifyContent: "flex-end", gap: 10 }}>
                      <button className="admin-action-btn neutral small" onClick={() => openEdit(r)} disabled={busy}>
                        Edit
                      </button>

                      <button className="admin-action-btn small" onClick={() => openContent(r)} disabled={busy}>
                        Report Content
                      </button>

                      <button className="admin-action-btn danger small" onClick={() => remove(r)} disabled={busy}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===================== IMPORT MODAL ===================== */}
      {importOpen && (
        <div className="admin-modal-overlay" onClick={closeImport}>
          <div className="admin-modal" style={{ maxWidth: 1100 }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <div>
                <h3 className="admin-modal-title">Import Reports</h3>
                <div className="admin-modal-subtitle">Upload Excel (many rows) or Word (one report).</div>
              </div>

              <button className="admin-btn" onClick={closeImport} disabled={importBusy}>
                Close
              </button>
            </div>

            <div className="admin-modal-body admin-modal-scroll">
              {(importError || importInfo) && (
                <div className={`admin-alert ${importError ? "error" : "ok"}`}>{importError || importInfo}</div>
              )}

              <div className="import-box">
                <div className="import-row">
                  <div className="import-col">
                    <div className="import-label">Excel import</div>
                    <input
                      ref={excelInputRef}
                      type="file"
                      accept=".xlsx,.xls"
                      disabled={importBusy}
                      onChange={(e) => importExcel(e.target.files?.[0] || null)}
                    />
                    <div className="hint">Expected columns: ReportNumber, Year, CaseNumber, Citation, Parties, Court, Judges, DecisionType, CaseType, DecisionDate, ContentText</div>
                  </div>

                  <div className="import-col" style={{ minWidth: 260 }}>
                    <div className="import-label">Word import</div>
                    <input
                      ref={wordInputRef}
                      type="file"
                      accept=".docx"
                      disabled={importBusy}
                      onChange={(e) => importWord(e.target.files?.[0] || null)}
                    />
                    <div className="hint">Word file provides ContentText; you supply ReportNumber + Year.</div>
                  </div>

                  <div className="import-col" style={{ minWidth: 180 }}>
                    <div className="import-label">ReportNumber *</div>
                    <input value={wordReportNumber} onChange={(e) => setWordReportNumber(e.target.value)} disabled={importBusy} placeholder="e.g. CAR353" />
                  </div>

                  <div className="import-col" style={{ minWidth: 140 }}>
                    <div className="import-label">Year *</div>
                    <input value={wordYear} onChange={(e) => setWordYear(e.target.value)} disabled={importBusy} placeholder="e.g. 2020" />
                  </div>

                  <div className="import-col" style={{ minWidth: 220 }}>
                    <div className="import-label">Duplicate strategy</div>
                    <select value={dupStrategy} onChange={(e) => setDupStrategy(e.target.value)} disabled={importBusy}>
                      <option value="Skip">Skip duplicates</option>
                      <option value="Update">Update existing</option>
                    </select>
                    <div className="hint">If duplicates are found: skip or overwrite.</div>
                  </div>

                  <div className="import-col" style={{ minWidth: 150 }}>
                    <button className="admin-btn primary" onClick={confirmImport} disabled={importBusy || !preview?.items?.length}>
                      {importBusy ? "Working…" : "Confirm import"}
                    </button>
                  </div>
                </div>
              </div>

              {preview && (
                <div className="preview-wrap">
                  <div className="preview-head">
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <span className="pill2">Total: {preview.total ?? 0}</span>
                      <span className="pill2">Valid: {preview.valid ?? 0}</span>
                      <span className="pill2">Invalid: {preview.invalid ?? 0}</span>
                      <span className="pill2">Duplicates: {preview.duplicates ?? 0}</span>
                    </div>
                    <div className="hint">Fix invalid rows before confirming.</div>
                  </div>

                  <div style={{ maxHeight: 380, overflow: "auto" }}>
                    <table className="preview-table">
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>ReportNumber</th>
                          <th>Year</th>
                          <th>Citation</th>
                          <th>DecisionType</th>
                          <th>CaseType</th>
                          <th>Duplicate</th>
                          <th>Status</th>
                          <th>Errors</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(preview.items || []).map((it, i) => (
                          <tr key={i}>
                            <td className="tight">{it.rowNumber ?? i + 1}</td>
                            <td className="tight">{it.reportNumber || "—"}</td>
                            <td className="tight">{it.year ?? "—"}</td>
                            <td>{it.citation || "—"}</td>
                            <td className="tight">{it.decisionType || "—"}</td>
                            <td className="tight">{it.caseType || "—"}</td>
                            <td className="tight">
                              {it.isDuplicate ? (
                                <span className="err">Yes</span>
                              ) : (
                                <span className="oktxt">No</span>
                              )}
                            </td>
                            <td className="tight">{it.isValid ? <span className="oktxt">Valid</span> : <span className="err">Invalid</span>}</td>
                            <td className="err">{(it.errors || []).join("; ")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="admin-modal-foot">
              <button className="admin-btn" onClick={closeImport} disabled={importBusy}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== CREATE/EDIT MODAL ===================== */}
      {open && (
        <div className="admin-modal-overlay" onClick={closeModal}>
          <div className="admin-modal" style={{ maxWidth: 1100 }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <div>
                <h3 className="admin-modal-title">{editing ? `Edit Report #${editing.id}` : "Create Law Report"}</h3>
                <div className="admin-modal-subtitle">
                  Fill the fields below. Saving will create/update the LawReport and its linked LegalDocument.
                </div>
              </div>

              <button className="admin-btn" onClick={closeModal} disabled={busy}>
                Close
              </button>
            </div>

            <div className="admin-modal-body admin-modal-scroll">
              <div className="admin-grid">
                <div className="admin-field">
                  <label>Report Number *</label>
                  <input value={form.reportNumber} onChange={(e) => setField("reportNumber", e.target.value)} placeholder="e.g. CAR353" />
                </div>

                <div className="admin-field">
                  <label>Year *</label>
                  <input type="number" min="1900" max="2100" value={form.year} onChange={(e) => setField("year", e.target.value)} placeholder="e.g. 2020" />
                </div>

                <div className="admin-field">
                  <label>Case Number</label>
                  <input value={form.caseNumber} onChange={(e) => setField("caseNumber", e.target.value)} placeholder="e.g. Petition 12 of 2020" />
                </div>

                <div className="admin-field">
                  <label>Citation</label>
                  <input value={form.citation} onChange={(e) => setField("citation", e.target.value)} placeholder="Optional (preferred if available)" />
                </div>

                <div className="admin-field">
                  <label>Decision Type *</label>
                  <select value={String(form.decisionType)} onChange={(e) => setField("decisionType", toInt(e.target.value, 1))}>
                    {DECISION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-field">
                  <label>Case Type *</label>
                  <select value={String(form.caseType)} onChange={(e) => setField("caseType", toInt(e.target.value, 2))}>
                    {CASETYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-field">
                  <label>Court</label>
                  <input value={form.court} onChange={(e) => setField("court", e.target.value)} placeholder="e.g. Court of Appeal" />
                </div>

                <div className="admin-field admin-span2">
                  <label>Parties</label>
                  <input value={form.parties} onChange={(e) => setField("parties", e.target.value)} placeholder="e.g. A v B" />
                </div>

                <div className="admin-field admin-span2">
                  <label>Judges</label>
                  <textarea rows={2} value={form.judges} onChange={(e) => setField("judges", e.target.value)} placeholder="Separate by newline or semicolon" />
                </div>

                <div className="admin-field">
                  <label>Decision Date</label>
                  <input type="date" value={form.decisionDate} onChange={(e) => setField("decisionDate", e.target.value)} />
                </div>

                <div className="admin-field admin-span2">
                  <label>Content Text *</label>
                  <textarea rows={16} value={form.contentText} onChange={(e) => setField("contentText", e.target.value)} placeholder="Paste the full report text here..." />
                  <div className="hint">Tip: You can still use “Report Content” for a focused editor after saving.</div>
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
