import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../../api/client";
import "../../../styles/adminCrud.css";

/* =========================
   Helpers
========================= */
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

function pick(obj, keys, fallback = undefined) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null) return v;
  }
  return fallback;
}

function toInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

/**
 * Handles values that can be:
 * - number (1)
 * - numeric string ("1")
 * - enum label ("Judgment")
 */
function enumToInt(value, options, fallback = 0) {
  if (value === null || value === undefined) return fallback;

  if (typeof value === "number") return toInt(value, fallback);

  const s = String(value).trim();
  if (!s) return fallback;

  const asNum = Number(s);
  if (Number.isFinite(asNum)) return Math.floor(asNum);

  const hit = options.find((o) => o.label.toLowerCase() === s.toLowerCase());
  return hit ? hit.value : fallback;
}

function labelFrom(options, value) {
  const v = enumToInt(value, options, 0);
  return options.find((o) => o.value === v)?.label || "—";
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

/* =========================
   Options
========================= */
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

// Service options (Create/Edit + search + chip)
const SERVICE_OPTIONS = [
  { label: "LawAfrica Law Reports (LLR)", value: 1 },
  { label: "Odungas Digest", value: 2 },
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

function shortServiceLabel(serviceValue) {
  const hit = SERVICE_OPTIONS.find((x) => x.value === enumToInt(serviceValue, SERVICE_OPTIONS, 0));
  if (!hit) return "—";
  return hit.label.replace(/\s*\(.*?\)\s*/g, "").trim();
}

/* =========================
   Inline SVG Icons (no deps)
========================= */
function Icon({ name }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg" };

  switch (name) {
    case "refresh":
      return (
        <svg {...common}>
          <path d="M21 12a9 9 0 1 1-2.64-6.36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M21 3v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <path
            d="M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "edit":
      return (
        <svg {...common}>
          <path
            d="M12 20h9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "file":
      return (
        <svg {...common}>
          <path
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );
    case "trash":
      return (
        <svg {...common}>
          <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path
            d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M6 6l1 16h10l1-16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      );
    default:
      return null;
  }
}

function IconButton({ title, onClick, disabled, tone = "neutral", children }) {
  return (
    <button
      type="button"
      className={`la-icon-btn ${tone}`}
      title={title}
      onClick={onClick}
      disabled={disabled}
      aria-label={title}
    >
      {children}
    </button>
  );
}

/* =========================
   Component
========================= */
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
  const [countries, setCountries] = useState([]);
  const [countryMap, setCountryMap] = useState(new Map());

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });

  const firstLoadRef = useRef(true);

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
    try {
      const res = await api.get("/country");
      const list = Array.isArray(res.data) ? res.data : [];
      setCountries(list);

      const m = new Map();
      for (const c of list) m.set(Number(c.id), c.name);
      setCountryMap(m);
    } catch {
      setCountries([]);
      setCountryMap(new Map());
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
      const msg = getApiErrorMessage(e, "Failed to load law reports.");
      setError(
        msg === "Internal server error"
          ? "Server error while loading reports. Check API logs for GET /api/law-reports/admin."
          : msg
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      await fetchCountries();
      await fetchList();
      firstLoadRef.current = false;
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      // handle both camel + Pascal
      const title = String(pick(r, ["title", "Title"], "")).toLowerCase();
      const reportNumber = String(pick(r, ["reportNumber", "ReportNumber"], "")).toLowerCase();
      const year = String(pick(r, ["year", "Year"], "")).toLowerCase();
      const citation = String(pick(r, ["citation", "Citation"], "")).toLowerCase();
      const parties = String(pick(r, ["parties", "Parties"], "")).toLowerCase();
      const court = String(pick(r, ["court", "Court"], "")).toLowerCase();
      const caseNo = String(pick(r, ["caseNumber", "CaseNumber"], "")).toLowerCase();
      const judges = String(pick(r, ["judges", "Judges"], "")).toLowerCase();

      const countryId = pick(r, ["countryId", "CountryId"], null);
      const countryName = (countryMap.get(Number(countryId)) || "").toLowerCase();

      const serviceVal = pick(r, ["service", "Service"], null);
      const serviceLabel =
        (SERVICE_OPTIONS.find((x) => x.value === enumToInt(serviceVal, SERVICE_OPTIONS, 0))?.label || "").toLowerCase();

      const meta = `${reportNumber} ${year} ${citation} ${parties} ${court} ${caseNo} ${judges} ${countryName} ${serviceLabel}`;
      return title.includes(s) || meta.includes(s);
    });
  }, [rows, q, countryMap]);

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
      const id = pick(row, ["id", "Id"], null);
      const res = await api.get(`/law-reports/${id}`);
      const d = res.data;

      setEditing(d);
      setForm({
        countryId: pick(d, ["countryId", "CountryId"], ""),
        service: enumToInt(pick(d, ["service", "Service"], 1), SERVICE_OPTIONS, 1),
        citation: pick(d, ["citation", "Citation"], "") ?? "",
        reportNumber: pick(d, ["reportNumber", "ReportNumber"], "") ?? "",
        year: pick(d, ["year", "Year"], "") ?? "",
        caseNumber: pick(d, ["caseNumber", "CaseNumber"], "") ?? "",
        decisionType: enumToInt(pick(d, ["decisionType", "DecisionType"], 1), DECISION_OPTIONS, 1),
        caseType: enumToInt(pick(d, ["caseType", "CaseType"], 2), CASETYPE_OPTIONS, 2),
        court: pick(d, ["court", "Court"], "") ?? "",
        parties: pick(d, ["parties", "Parties"], "") ?? "",
        judges: pick(d, ["judges", "Judges"], "") ?? "",
        decisionDate: dateInputFromIso(pick(d, ["decisionDate", "DecisionDate"], "")),
        contentText: pick(d, ["contentText", "ContentText"], "") ?? "",
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
      category: 6,
      countryId: toInt(form.countryId, 0),
      service: toInt(form.service, 1),

      citation: form.citation?.trim() || null,
      reportNumber: String(form.reportNumber || "").trim(),
      year: toInt(form.year, new Date().getUTCFullYear()),
      caseNumber: form.caseNumber?.trim() || null,

      decisionType: toInt(form.decisionType, 1),
      caseType: toInt(form.caseType, 2),

      court: form.court?.trim() || null,
      parties: form.parties?.trim() || null,
      judges: form.judges?.trim() || null,
      decisionDate: isoOrNullFromDateInput(form.decisionDate),

      // required for create currently
      contentText: String(form.contentText ?? ""),
    };
  }

  function validate() {
    if (!toInt(form.countryId, 0)) return "Country is required.";
    if (!toInt(form.service, 0)) return "Service is required.";
    if (!String(form.reportNumber || "").trim()) return "Report number is required (e.g. CAR353).";

    const year = toInt(form.year, 0);
    if (!year || year < 1900 || year > 2100) return "Year must be between 1900 and 2100.";

    if (!editing?.id && !String(form.contentText ?? "").trim()) return "Content text is required on Create.";

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

      const id = pick(editing, ["id", "Id"], null);
      if (id) {
        await api.put(`/law-reports/${id}`, payload);
        setInfo("Saved changes.");
      } else {
        const res = await api.post("/law-reports", payload);
        const newId = pick(res.data, ["id", "Id"], null);
        setInfo(newId ? `Report created (#${newId}).` : "Report created.");
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
    const id = pick(row, ["id", "Id"], null);
    if (!id) return;

    const title = pick(row, ["title", "Title"], "") || pick(row, ["reportNumber", "ReportNumber"], "");
    const ok = window.confirm(`Delete this report?\n\n${title}`);
    if (!ok) return;

    setBusy(true);
    setError("");
    setInfo("");

    try {
      await api.delete(`/law-reports/${id}`);
      setInfo("Deleted.");
      await fetchList();
    } catch (e) {
      setError(getApiErrorMessage(e, "Delete failed."));
    } finally {
      setBusy(false);
    }
  }

  function openContent(row) {
    const id = pick(row, ["id", "Id"], null);
    navigate(`/dashboard/admin/llr-services/${id}/content`, {
      state: { title: pick(row, ["title", "Title"], "") || "" },
    });
  }

  return (
    <div className="admin-page admin-page-wide">
      <style>{`
        .admin-card-fill { border-radius: 18px; overflow:hidden; }
        .admin-table-wrap { max-height: 72vh; overflow:auto; border-radius: 18px; }
        .admin-table { font-size: 13px; }
        .admin-table thead th { position: sticky; top: 0; z-index: 2; background: #fafafa; }
        .row-zebra { background: #fafafa; }
        .row-hover:hover td { background: #fbfbff; }
        .num-cell { text-align:right; font-variant-numeric: tabular-nums; }
        .tight { white-space: nowrap; }
        .hint { color:#6b7280; font-size:12px; font-weight:700; }
        .titleCell { display:flex; flex-direction:column; gap:8px; min-width: 280px; }
        .titleMain { font-weight: 950; line-height: 1.25; }
        .chips { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
        .chip {
          display:inline-flex; align-items:center;
          padding: 4px 10px;
          border-radius: 999px;
          border:1px solid #e5e7eb;
          background:#fff;
          font-weight: 900;
          font-size: 11px;
          color:#374151;
          max-width: 520px;
        }
        .chip.soft { background:#f9fafb; }
        .chip.good { background:#ecfdf5; border-color:#a7f3d0; color:#065f46; }
        .chip.warn { background:#fff7ed; border-color:#fed7aa; color:#9a3412; }
        .chip.muted { background:#f3f4f6; border-color:#e5e7eb; color:#6b7280; }
        .chip strong { font-weight: 950; }
        .actionsRow { display:flex; justify-content:flex-end; gap:10px; align-items:center; flex-wrap:nowrap; }
        .toolbarRow { display:flex; gap:12px; align-items:center; }
        .searchWrap { position: relative; flex: 1; }
        .searchIcon { position:absolute; left: 12px; top: 50%; transform: translateY(-50%); color:#6b7280; }
        .admin-search-wide { padding-left: 42px; }

        /* small icon buttons */
        .la-icon-btn {
          display:inline-flex; align-items:center; justify-content:center;
          width: 36px; height: 36px;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
          background: #fff;
          cursor: pointer;
          color: #111827;
        }
        .la-icon-btn:hover { background:#fafafa; }
        .la-icon-btn:disabled { opacity: .55; cursor: not-allowed; }
        .la-icon-btn.primary { border-color:#c7d2fe; }
        .la-icon-btn.primary:hover { background:#f5f7ff; }
        .la-icon-btn.danger { border-color:#fecaca; }
        .la-icon-btn.danger:hover { background:#fff5f5; }

        .headerActions { display:flex; align-items:center; gap:10px; }
        .headerActions .la-icon-btn { width: 34px; height: 34px; border-radius: 11px; }
      `}</style>

      <div className="admin-header">
        <div>
          <h1 className="admin-title">Admin · LLR Services (Reports)</h1>
          <p className="admin-subtitle">
            Category is fixed to <b>LLR Services</b>. Use <b>Report Content</b> to edit the full formatted body.
          </p>
        </div>

        {/* ✅ smaller top buttons with icons + tooltips */}
        <div className="headerActions">
          <IconButton title="Refresh" onClick={fetchList} disabled={busy || loading}>
            <Icon name="refresh" />
          </IconButton>

          <IconButton title="New report" onClick={openCreate} disabled={busy} tone="primary">
            <Icon name="plus" />
          </IconButton>
        </div>
      </div>

      {(error || info) && <div className={`admin-alert ${error ? "error" : "ok"}`}>{error || info}</div>}

      <div className="admin-card admin-card-fill">
        <div className="admin-toolbar">
          <div className="toolbarRow" style={{ width: "100%" }}>
            <div className="searchWrap">
              <span className="searchIcon">
                <Icon name="search" />
              </span>
              <input
                className="admin-search admin-search-wide"
                placeholder="Search by title, report number, year, country, parties, citation, court..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            <div className="admin-pill muted" title="Total results">
              {loading ? "Loading…" : `${filtered.length} report(s)`}
            </div>
          </div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: "40%" }}>Title</th>
                <th style={{ width: "12%" }}>Country</th>
                <th style={{ width: "12%" }}>Report No.</th>
                <th style={{ width: "6%" }} className="num-cell">
                  Year
                </th>
                <th style={{ width: "10%" }}>Decision</th>
                <th style={{ width: "10%" }}>Case Type</th>
                <th style={{ width: "16%" }}>Parties</th>
                <th style={{ width: "8%" }} className="tight">
                  Date
                </th>
                <th style={{ width: "12%", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ color: "#6b7280", padding: 16, fontWeight: 800 }}>
                    No reports found. Click <b>New report</b> to add one.
                  </td>
                </tr>
              )}

              {filtered.map((r, idx) => {
                // ✅ robust casing support
                const id = pick(r, ["id", "Id"], null);

                const decisionRaw = pick(r, ["decisionType", "DecisionType"], null);
                const caseRaw = pick(r, ["caseType", "CaseType"], null);

                const decisionVal = enumToInt(decisionRaw, DECISION_OPTIONS, 0);
                const caseVal = enumToInt(caseRaw, CASETYPE_OPTIONS, 0);

                const decisionLabel = labelFrom(DECISION_OPTIONS, decisionVal);
                const caseLabel = labelFrom(CASETYPE_OPTIONS, caseVal);

                const countryId = pick(r, ["countryId", "CountryId"], null);
                const countryName = countryMap.get(Number(countryId)) || (countryId ? `#${countryId}` : "—");

                const title = pick(r, ["title", "Title"], "—");
                const citation = pick(r, ["citation", "Citation"], null);
                const caseNumber = pick(r, ["caseNumber", "CaseNumber"], null);

                const reportNumber = pick(r, ["reportNumber", "ReportNumber"], null);
                const year = pick(r, ["year", "Year"], null);
                const parties = pick(r, ["parties", "Parties"], null);
                const decisionDate = pick(r, ["decisionDate", "DecisionDate"], null);

                return (
                  <tr key={id ?? idx} className={`${idx % 2 === 1 ? "row-zebra" : ""} row-hover`}>
                    <td>
                      <div className="titleCell">
                        <div className="titleMain">{title || "—"}</div>

                        {/* ✅ chips remain in same place; now show DB values */}
                        <div className="chips">
                          <span className="chip soft" title="Service">
                            {shortServiceLabel(pick(r, ["service", "Service"], null))}
                          </span>

                          {citation ? (
                            <span className="chip" title="Citation">
                              <strong>Citation:</strong>&nbsp;{citation}
                            </span>
                          ) : (
                            <span className="chip muted" title="Citation">
                              Citation: —
                            </span>
                          )}

                          {caseNumber ? (
                            <span className="chip" title="Case number">
                              <strong>Case No.:</strong>&nbsp;{caseNumber}
                            </span>
                          ) : (
                            <span className="chip muted" title="Case number">
                              Case No.: —
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="tight">{countryName}</td>
                    <td className="tight">{reportNumber || "—"}</td>
                    <td className="num-cell">{year ?? "—"}</td>

                    <td>
                      <span
                        className={`chip ${
                          decisionVal === 1 ? "good" : decisionVal === 2 ? "warn" : "muted"
                        }`}
                        title="Decision type"
                      >
                        {decisionLabel}
                      </span>
                    </td>

                    <td>
                      <span className={`chip ${caseVal ? "" : "muted"}`} title="Case type">
                        {caseLabel}
                      </span>
                    </td>

                    <td>{parties || "—"}</td>
                    <td className="tight">{decisionDate ? String(decisionDate).slice(0, 10) : "—"}</td>

                    <td>
                      <div className="actionsRow">
                        <IconButton title="Edit report details" onClick={() => openEdit(r)} disabled={busy}>
                          <Icon name="edit" />
                        </IconButton>

                        <IconButton
                          title="Edit formatted report content"
                          onClick={() => openContent(r)}
                          disabled={busy}
                          tone="primary"
                        >
                          <Icon name="file" />
                        </IconButton>

                        <IconButton title="Delete report" onClick={() => remove(r)} disabled={busy} tone="danger">
                          <Icon name="trash" />
                        </IconButton>
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
                <h3 className="admin-modal-title">{editing ? `Edit Report #${pick(editing, ["id", "Id"], "")}` : "Create Law Report"}</h3>
                <div className="admin-modal-subtitle">
                  Saves the <b>LawReport</b> and updates its linked <b>LegalDocument</b>. Use <b>Report Content</b> for full formatted editing.
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

                  {countries.length > 0 ? (
                    <select value={String(form.countryId || "")} onChange={(e) => setField("countryId", e.target.value)} disabled={busy}>
                      <option value="">Select country…</option>
                      {countries.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <>
                      <input
                        type="number"
                        min="1"
                        value={form.countryId}
                        onChange={(e) => setField("countryId", e.target.value)}
                        placeholder="CountryId (e.g. 1 = Kenya)"
                        disabled={busy}
                      />
                      <div className="hint">Tip: ensure GET /api/country is accessible.</div>
                    </>
                  )}
                </div>

                <div className="admin-field">
                  <label>Service *</label>
                  <select value={String(form.service)} onChange={(e) => setField("service", toInt(e.target.value, 1))} disabled={busy}>
                    {SERVICE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-field">
                  <label>Report Number *</label>
                  <input value={form.reportNumber} onChange={(e) => setField("reportNumber", e.target.value)} placeholder="e.g. CAR353" disabled={busy} />
                </div>

                <div className="admin-field">
                  <label>Year *</label>
                  <input type="number" min="1900" max="2100" value={form.year} onChange={(e) => setField("year", e.target.value)} placeholder="e.g. 2020" disabled={busy} />
                </div>

                <div className="admin-field">
                  <label>Case Number</label>
                  <input value={form.caseNumber} onChange={(e) => setField("caseNumber", e.target.value)} placeholder="e.g. Petition 12 of 2020" disabled={busy} />
                </div>

                <div className="admin-field">
                  <label>Citation</label>
                  <input value={form.citation} onChange={(e) => setField("citation", e.target.value)} placeholder="Optional (preferred if available)" disabled={busy} />
                </div>

                <div className="admin-field">
                  <label>Decision Type *</label>
                  <select value={String(form.decisionType)} onChange={(e) => setField("decisionType", toInt(e.target.value, 1))} disabled={busy}>
                    {DECISION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-field">
                  <label>Case Type *</label>
                  <select value={String(form.caseType)} onChange={(e) => setField("caseType", toInt(e.target.value, 2))} disabled={busy}>
                    {CASETYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-field">
                  <label>Court</label>
                  <input value={form.court} onChange={(e) => setField("court", e.target.value)} placeholder="e.g. Court of Appeal" disabled={busy} />
                </div>

                <div className="admin-field admin-span2">
                  <label>Parties</label>
                  <input value={form.parties} onChange={(e) => setField("parties", e.target.value)} placeholder="e.g. A v B" disabled={busy} />
                </div>

                <div className="admin-field admin-span2">
                  <label>Judges</label>
                  <textarea rows={2} value={form.judges} onChange={(e) => setField("judges", e.target.value)} placeholder="Separate by newline or semicolon" disabled={busy} />
                </div>

                <div className="admin-field">
                  <label>Decision Date</label>
                  <input type="date" value={form.decisionDate} onChange={(e) => setField("decisionDate", e.target.value)} disabled={busy} />
                </div>

                <div className="admin-field admin-span2">
                  <label>Content Text {editing?.id ? "(optional here)" : "*"}</label>
                  <textarea
                    rows={10}
                    value={form.contentText}
                    onChange={(e) => setField("contentText", e.target.value)}
                    placeholder={editing?.id ? "Optional: use Report Content for formatted editing." : "Required on Create: paste report body here (you can format later in Report Content)."}
                    disabled={busy}
                  />
                  <div className="hint">Tip: Use <b>Report Content</b> for formatting (bold, headings, links).</div>
                </div>
              </div>
            </div>

            <div className="admin-modal-foot" style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
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
