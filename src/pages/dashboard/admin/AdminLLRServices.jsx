import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../../api/client";
import "../../../styles/adminCrud.css";

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

// ✅ Service options (enum int values) — keep in sync with backend enum values
const SERVICE_OPTIONS = [
  { label: "LawAfrica Law Reports (LLR)", value: 1 },
  { label: "Odunga's Digest", value: 2 },
  { label: "Uganda Law Reports (ULR)", value: 3 },
  { label: "Tanzania Law Reports (TLR)", value: 4 },
  { label: "Southern Sudan Law Reports & Journal (SSLRJ)", value: 5 },
  { label: "East Africa Law Reports (EALR)", value: 6 },
  { label: "East Africa Court of Appeal Reports (EACA)", value: 7 },
  { label: "East Africa General Reports (EAGR)", value: 8 },
  { label: "East Africa Protectorate Law Reports (EAPLR)", value: 9 },
  { label: "Zanzibar Protectorate Law Reports (ZPLR)", value: 10 },
  { label: "Company Registry Search", value: 11 },
  { label: "Uganda Law Society Reports (ULSR)", value: 12 },
  { label: "Kenya Industrial Property Institute", value: 13 },
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
  countryId: "",
  service: 1,
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

  // Countries
  const [countries, setCountries] = useState([]);
  const [countriesLoading, setCountriesLoading] = useState(true);

  // Create/Edit modal
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });

  const didInitRef = useRef(false);

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

  async function fetchCountries() {
    setCountriesLoading(true);
    try {
      // your controller route is /api/country
      const res = await api.get("/country");
      const list = Array.isArray(res.data) ? res.data : [];
      setCountries(list);
    } catch (e) {
      // don’t hard-fail the page
      setCountries([]);
    } finally {
      setCountriesLoading(false);
    }
  }

  async function fetchList() {
    setLoading(true);
    setError("");
    setInfo("");

    try {
      const res = await api.get("/law-reports/admin");
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setRows([]);
      setError(getApiErrorMessage(e, "Failed to load law reports."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // init once
    if (didInitRef.current) return;
    didInitRef.current = true;
    fetchCountries();
    fetchList();
  }, []);

  const countriesById = useMemo(() => {
    const m = new Map();
    for (const c of countries) {
      if (c && c.id != null) m.set(Number(c.id), c);
    }
    return m;
  }, [countries]);

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

      const serviceLabel =
        SERVICE_OPTIONS.find((x) => x.value === toInt(r.service))?.label?.toLowerCase() || "";

      const countryName =
        countriesById.get(Number(r.countryId))?.name?.toLowerCase() || "";

      const meta = `${reportNumber} ${year} ${citation} ${parties} ${court} ${caseNo} ${judges} ${serviceLabel} ${countryName}`;
      return title.includes(s) || meta.includes(s);
    });
  }, [rows, q, countriesById]);

  function openCreate() {
    setError("");
    setInfo("");
    resetForm();

    setForm((p) => ({
      ...p,
      decisionType: 1,
      caseType: 2,
      service: 1,
      year: String(new Date().getUTCFullYear()),
      countryId: countries?.[0]?.id ? String(countries[0].id) : "",
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
      const res = await api.get(`/law-reports/${row.id}`);
      const d = res.data;

      setEditing(d);
      setForm({
        countryId: d.countryId != null ? String(d.countryId) : "",
        service: toInt(d.service, 1),
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

  // ✅ Mirrors backend LawReportUpsertDto
  // - CountryId included
  // - Service included
  // - Category is NOT sent (backend enforces LLRServices)
  function buildPayload() {
    return {
      countryId: toIntOrNull(form.countryId) ?? 0,
      service: toInt(form.service, 1),

      citation: form.citation?.trim() || null,
      reportNumber: String(form.reportNumber || "").trim(),
      year: toIntOrNull(form.year) ?? new Date().getUTCFullYear(),
      caseNumber: form.caseNumber?.trim() || null,

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
    const countryId = toIntOrNull(form.countryId);
    if (!countryId || countryId <= 0) return "Country is required.";

    const service = toInt(form.service, 0);
    if (!service || service <= 0) return "Service is required.";

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
        const newId = res.data?.id ?? null;
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

  function openContent(row) {
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
        .hint { color:#6b7280; font-size:12px; font-weight:700; }
      `}</style>

      <div className="admin-header">
        <div>
          <h1 className="admin-title">Admin · LLR Services (Reports)</h1>
          <p className="admin-subtitle">
            Create and manage law reports. Category is fixed to LLR Services.
          </p>
        </div>

        <div className="admin-actions">
          <button className="admin-btn" onClick={() => { fetchCountries(); fetchList(); }} disabled={busy || loading}>
            Refresh
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
            placeholder="Search by title, report number, year, service, country, parties, citation, court..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="admin-pill muted">
            {loading ? "Loading…" : `${filtered.length} report(s)`}
          </div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: "22%" }}>Title</th>
                <th style={{ width: "12%" }}>Country</th>
                <th style={{ width: "14%" }}>Service</th>
                <th style={{ width: "10%" }}>Report No.</th>
                <th style={{ width: "6%" }} className="num-cell">Year</th>
                <th style={{ width: "10%" }}>Decision</th>
                <th style={{ width: "10%" }}>Case Type</th>
                <th style={{ width: "18%" }}>Parties</th>
                <th style={{ width: "8%" }} className="tight">Date</th>
                <th style={{ width: "10%", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ color: "#6b7280", padding: 14 }}>
                    No reports found. Click “+ New Report”.
                  </td>
                </tr>
              )}

              {filtered.map((r, idx) => {
                const countryName =
                  countriesById.get(Number(r.countryId))?.name || (r.countryId ? `#${r.countryId}` : "—");
                const serviceName =
                  SERVICE_OPTIONS.find((x) => x.value === toInt(r.service))?.label || "—";

                return (
                  <tr key={r.id} className={`${idx % 2 === 1 ? "row-zebra" : ""} row-hover`}>
                    <td style={{ fontWeight: 900 }}>{r.title || "—"}</td>
                    <td className="tight">{countriesLoading ? "…" : countryName}</td>
                    <td>{serviceName}</td>
                    <td className="tight">{r.reportNumber || "—"}</td>
                    <td className="num-cell">{r.year ?? "—"}</td>
                    <td>{DECISION_OPTIONS.find((x) => x.value === toInt(r.decisionType))?.label || "—"}</td>
                    <td>{CASETYPE_OPTIONS.find((x) => x.value === toInt(r.caseType))?.label || "—"}</td>
                    <td>{r.parties || "—"}</td>
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
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===================== CREATE/EDIT MODAL ===================== */}
      {open && (
        <div className="admin-modal-overlay" onClick={closeModal}>
          <div className="admin-modal" style={{ maxWidth: 1100 }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <div>
                <h3 className="admin-modal-title">{editing ? `Edit Report #${editing.id}` : "Create Law Report"}</h3>
                <div className="admin-modal-subtitle">
                  Category is fixed to <b>LLR Services</b>. Choose Country and Service.
                </div>
              </div>

              <button className="admin-btn" onClick={closeModal} disabled={busy}>
                Close
              </button>
            </div>

            <div className="admin-modal-body admin-modal-scroll">
              <div className="admin-grid">
                <div className="admin-field">
                  <label>Country *</label>
                  <select
                    value={String(form.countryId || "")}
                    onChange={(e) => setField("countryId", e.target.value)}
                    disabled={countriesLoading}
                  >
                    <option value="">{countriesLoading ? "Loading..." : "Select country"}</option>
                    {countries.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <div className="hint">Source: /api/country</div>
                </div>

                <div className="admin-field">
                  <label>Service *</label>
                  <select
                    value={String(form.service)}
                    onChange={(e) => setField("service", toInt(e.target.value, 1))}
                  >
                    {SERVICE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-field">
                  <label>Report Number *</label>
                  <input
                    value={form.reportNumber}
                    onChange={(e) => setField("reportNumber", e.target.value)}
                    placeholder="e.g. CAR353"
                  />
                </div>

                <div className="admin-field">
                  <label>Year *</label>
                  <input
                    type="number"
                    min="1900"
                    max="2100"
                    value={form.year}
                    onChange={(e) => setField("year", e.target.value)}
                    placeholder="e.g. 2020"
                  />
                </div>

                <div className="admin-field">
                  <label>Case Number</label>
                  <input
                    value={form.caseNumber}
                    onChange={(e) => setField("caseNumber", e.target.value)}
                    placeholder="e.g. Petition 12 of 2020"
                  />
                </div>

                <div className="admin-field">
                  <label>Citation</label>
                  <input
                    value={form.citation}
                    onChange={(e) => setField("citation", e.target.value)}
                    placeholder="Optional (preferred if available)"
                  />
                </div>

                <div className="admin-field">
                  <label>Decision Type *</label>
                  <select
                    value={String(form.decisionType)}
                    onChange={(e) => setField("decisionType", toInt(e.target.value, 1))}
                  >
                    {DECISION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-field">
                  <label>Case Type *</label>
                  <select
                    value={String(form.caseType)}
                    onChange={(e) => setField("caseType", toInt(e.target.value, 2))}
                  >
                    {CASETYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-field">
                  <label>Court</label>
                  <input
                    value={form.court}
                    onChange={(e) => setField("court", e.target.value)}
                    placeholder="e.g. Court of Appeal"
                  />
                </div>

                <div className="admin-field admin-span2">
                  <label>Parties</label>
                  <input
                    value={form.parties}
                    onChange={(e) => setField("parties", e.target.value)}
                    placeholder="e.g. A v B"
                  />
                </div>

                <div className="admin-field admin-span2">
                  <label>Judges</label>
                  <textarea
                    rows={2}
                    value={form.judges}
                    onChange={(e) => setField("judges", e.target.value)}
                    placeholder="Separate by newline or semicolon"
                  />
                </div>

                <div className="admin-field">
                  <label>Decision Date</label>
                  <input
                    type="date"
                    value={form.decisionDate}
                    onChange={(e) => setField("decisionDate", e.target.value)}
                  />
                </div>

                <div className="admin-field admin-span2">
                  <label>Content Text *</label>
                  <textarea
                    rows={16}
                    value={form.contentText}
                    onChange={(e) => setField("contentText", e.target.value)}
                    placeholder="Paste the full report text here..."
                  />
                  <div className="hint">Tip: Use “Report Content” for a focused editor after saving.</div>
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
