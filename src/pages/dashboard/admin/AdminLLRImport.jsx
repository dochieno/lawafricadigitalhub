// src/pages/dashboard/admin/AdminLLRImport.jsx
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Papa from "papaparse";
import api from "../../../api/client";
import "../../../styles/adminCrud.css";
import AdminPageFooter from "../../../components/AdminPageFooter";

/* =========================
   Helpers (kept consistent)
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

function toInt(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function normalizeText(v) {
  const s = String(v ?? "").trim();
  return s ? s : "";
}

function isEmpty(v) {
  return !String(v ?? "").trim();
}

function csvHeaderKey(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[_-]+/g, "");
}

/* =========================
   Enum Options (match backend)
========================= */
const DECISION_OPTIONS = [
  { label: "Judgment", value: 1 },
  { label: "Ruling", value: 2 },
  { label: "Award", value: 3 },
  { label: "Award by Consent", value: 4 },
  { label: "Notice of Motion", value: 5 },
  { label: "Interpretation of Award", value: 6 },
  { label: "Order", value: 7 },
  { label: "Interpretation of Amended Order", value: 8 },
];

const CASETYPE_OPTIONS = [
  { label: "Criminal", value: 1 },
  { label: "Civil", value: 2 },
  { label: "Environmental", value: 3 },
  { label: "Family", value: 4 },
  { label: "Commercial", value: 5 },
  { label: "Constitutional", value: 6 },
];

// Your ReportService enum mapping
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

// CourtType enum mapping (1..10)
const COURT_TYPE_OPTIONS = [
  { label: "Supreme Court", value: 1 },
  { label: "Court of Appeal", value: 2 },
  { label: "High Court", value: 3 },
  { label: "Employment & Labour Relations Court", value: 4 },
  { label: "Environment & Land Court", value: 5 },
  { label: "Magistrates Courts", value: 6 },
  { label: "Kadhi's Courts", value: 7 },
  { label: "Courts Martial", value: 8 },
  { label: "Small Claims Court", value: 9 },
  { label: "Tribunals", value: 10 },
];

function enumToInt(value, options, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number") return toInt(value, fallback);

  const s = String(value).trim();
  if (!s) return fallback;

  const asNum = Number(s);
  if (Number.isFinite(asNum)) return Math.floor(asNum);

  const hit = options.find((o) => o.label.toLowerCase() === s.toLowerCase());
  if (hit) return hit.value;

  // Allow "AwardByConsent" like enum names by stripping non-letters
  const compact = s.toLowerCase().replace(/[^a-z]/g, "");
  const hit2 = options.find((o) => o.label.toLowerCase().replace(/[^a-z]/g, "") === compact);
  return hit2 ? hit2.value : fallback;
}

function labelFrom(options, value) {
  const v = enumToInt(value, options, 0);
  return options.find((o) => o.value === v)?.label || "—";
}

function parseDateToIsoOrNull(v) {
  // Accept: YYYY-MM-DD or ISO or empty
  const s = String(v ?? "").trim();
  if (!s) return null;

  // If already ISO-ish
  const d = new Date(s);
  if (Number.isFinite(d.getTime())) return d.toISOString();

  // If yyyy-mm-dd, coerce
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const dt = new Date(`${s}T00:00:00.000Z`);
    return Number.isFinite(dt.getTime()) ? dt.toISOString() : null;
  }

  return null;
}

/* =========================
   CSV Template
========================= */
const TEMPLATE_HEADERS = [
  "CountryId",
  "Service",
  "CourtType",
  "Town",
  "ReportNumber",
  "Year",
  "CaseNumber",
  "Citation",
  "DecisionType",
  "CaseType",
  "Court",
  "Parties",
  "Judges",
  "DecisionDate",
  "ContentText",
];

function buildTemplateCsv() {
  // 1 example row (valid)
  const example = {
    CountryId: 1,
    Service: 1,
    CourtType: 3,
    Town: "Kakamega",
    ReportNumber: "HOK045",
    Year: 2013,
    CaseNumber: "045/2013",
    Citation: "[2016] LLR (HCK-K) 045/2013",
    DecisionType: 1,
    CaseType: 2,
    Court: "", // optional legacy
    Parties: "Mauga and others v Kaluworks Limited",
    Judges: "M. J. A. Emukule, MBS, J",
    DecisionDate: "2016-04-28",
    ContentText: "Paste plain text here (you can format later in Report Content).",
  };

  const rows = [TEMPLATE_HEADERS, TEMPLATE_HEADERS.map((h) => example[h] ?? "")];
  return rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n");
}

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* =========================
   Page
========================= */
export default function AdminLLRImport() {
  const navigate = useNavigate();

  const [step, setStep] = useState(1); // 1=template, 2=upload/preview, 3=import
  const [fileName, setFileName] = useState("");
  const [rawRows, setRawRows] = useState([]);
  const [preview, setPreview] = useState([]); // normalized objects with validation
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, ok: 0, dup: 0, failed: 0 });

  const stopRef = useRef(false);

  const counts = useMemo(() => {
    const total = preview.length;
    const valid = preview.filter((x) => x.valid).length;
    const invalid = total - valid;
    return { total, valid, invalid };
  }, [preview]);

  function resetAll() {
    setFileName("");
    setRawRows([]);
    setPreview([]);
    setError("");
    setInfo("");
    setBusy(false);
    setImporting(false);
    setProgress({ done: 0, total: 0, ok: 0, dup: 0, failed: 0 });
    stopRef.current = false;
  }

  function goBackToList() {
    navigate("/dashboard/admin/llr-services");
  }

  /* =========================
     CSV parsing + normalization
  ========================= */
  function normalizeCsvRows(rows) {
    // rows: array of objects from PapaParse header mode
    const out = rows.map((r, idx) => {
      // map headers flexibly
      const map = {};
      for (const [k, v] of Object.entries(r)) {
        map[csvHeaderKey(k)] = v;
      }

      // expected keys (flexible)
      const countryId = toInt(map["countryid"], 0);
      const service = enumToInt(map["service"], SERVICE_OPTIONS, 0) || toInt(map["service"], 0);
      const courtType = enumToInt(map["courttype"], COURT_TYPE_OPTIONS, 0) || toInt(map["courttype"], 0);
      const reportNumber = normalizeText(map["reportnumber"]);
      const year = toInt(map["year"], 0);

      const caseNumber = normalizeText(map["casenumber"]) || null;
      const citation = normalizeText(map["citation"]) || null;

      const decisionType = enumToInt(map["decisiontype"], DECISION_OPTIONS, 0) || toInt(map["decisiontype"], 0);
      const caseType = enumToInt(map["casetype"], CASETYPE_OPTIONS, 0) || toInt(map["casetype"], 0);

      const court = normalizeText(map["court"]) || null; // optional legacy
      const town = normalizeText(map["town"]) || null;

      const parties = normalizeText(map["parties"]) || null;
      const judges = normalizeText(map["judges"]) || null;

      const decisionDate = parseDateToIsoOrNull(map["decisiondate"]);
      const contentText = String(map["contenttext"] ?? "").trim();

      // Build payload to match your LawReportUpsertDto
      const payload = {
        category: 6, // LLRServices
        countryId,
        service,
        courtType,
        town,
        reportNumber,
        year,
        caseNumber,
        citation,
        decisionType,
        caseType,
        court,
        parties,
        judges,
        decisionDate,
        contentText,
      };

      const issues = [];

      // required fields
      if (!countryId) issues.push("CountryId is required.");
      if (!service) issues.push("Service is required.");
      if (!courtType) issues.push("CourtType is required.");
      if (!reportNumber) issues.push("ReportNumber is required.");
      if (!year || year < 1900 || year > 2100) issues.push("Year must be between 1900 and 2100.");

      // DecisionType/CaseType are required in your DTO
      if (!decisionType) issues.push("DecisionType is required (e.g. 1=Judgment).");
      if (!caseType) issues.push("CaseType is required (e.g. 2=Civil).");

      // content required in DTO
      if (!contentText) issues.push("ContentText is required (paste plain text).");

      // if decisionDate present but invalid
      if (!isEmpty(map["decisiondate"]) && !decisionDate) issues.push("DecisionDate invalid. Use YYYY-MM-DD or ISO.");

      return {
        rowNumber: idx + 2, // +2 because header row = 1
        raw: r,
        payload,
        issues,
        valid: issues.length === 0,
      };
    });

    return out;
  }

  async function handleFile(file) {
    setError("");
    setInfo("");
    setBusy(true);
    setPreview([]);
    setRawRows([]);
    setFileName(file?.name || "");

    try {
      const text = await file.text();

      const parsed = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
      });

      if (parsed.errors?.length) {
        setError(`CSV parse error: ${parsed.errors[0]?.message || "Unknown error"}`);
        setBusy(false);
        return;
      }

      const rows = Array.isArray(parsed.data) ? parsed.data : [];
      setRawRows(rows);

      const normalized = normalizeCsvRows(rows);
      setPreview(normalized);

      setStep(2);

      if (normalized.length === 0) setInfo("No rows found in the file.");
      else if (normalized.every((x) => x.valid)) setInfo(`Loaded ${normalized.length} row(s). Ready to import.`);
      else setInfo(`Loaded ${normalized.length} row(s). Fix invalid rows before importing.`);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  /* =========================
     Import (POST /law-reports)
  ========================= */
  async function startImport() {
    setError("");
    setInfo("");
    stopRef.current = false;

    const validRows = preview.filter((x) => x.valid);
    if (!validRows.length) {
      setError("No valid rows to import. Fix the CSV first.");
      return;
    }

    setImporting(true);
    setProgress({ done: 0, total: validRows.length, ok: 0, dup: 0, failed: 0 });

    let ok = 0;
    let dup = 0;
    let failed = 0;

    for (let i = 0; i < validRows.length; i++) {
      if (stopRef.current) break;

      const item = validRows[i];
      try {
        await api.post("/law-reports", item.payload);
        ok++;
      } catch (e) {
        const status = e?.response?.status;

        // your controller returns 409 for duplicates
        if (status === 409) {
          dup++;
        } else {
          failed++;
        }
      } finally {
        setProgress((p) => ({
          ...p,
          done: i + 1,
          ok,
          dup,
          failed,
        }));
      }
    }

    setImporting(false);

    if (stopRef.current) {
      setInfo(`Stopped. Imported OK: ${ok}, duplicates: ${dup}, failed: ${failed}.`);
      return;
    }

    setInfo(`Import finished. Imported OK: ${ok}, duplicates: ${dup}, failed: ${failed}.`);
  }

  function stopImport() {
    stopRef.current = true;
    setInfo("Stopping…");
  }

  /* =========================
     UI
  ========================= */
  return (
    <div className="admin-page admin-page-wide">
      <style>{`
        .admin-card-fill { border-radius: 18px; overflow:hidden; }
        .section { background:#fff; border:1px solid #e5e7eb; border-radius:18px; padding:16px; }
        .row { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
        .muted { color:#6b7280; font-weight:800; }
        .kpi { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
        .pill { display:inline-flex; align-items:center; padding:6px 12px; border-radius:999px; border:1px solid #e5e7eb; background:#fafafa; font-weight:900; font-size:12px; }
        .pill.good { background:#ecfdf5; border-color:#a7f3d0; color:#065f46; }
        .pill.warn { background:#fff7ed; border-color:#fed7aa; color:#9a3412; }
        .pill.bad { background:#fef2f2; border-color:#fecaca; color:#991b1b; }
        .btnRow { display:flex; gap:10px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
        .small { font-size:12px; font-weight:800; }
        .tableWrap { max-height: 62vh; overflow:auto; border-radius: 14px; border:1px solid #e5e7eb; }
        table { width:100%; border-collapse: collapse; font-size: 12.5px; }
        thead th { position: sticky; top:0; background:#fafafa; z-index:1; text-align:left; padding:10px; border-bottom:1px solid #e5e7eb; }
        tbody td { padding:10px; border-bottom:1px solid #f1f5f9; vertical-align: top; }
        tr.badRow td { background: #fff5f5; }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
        .issues { color:#991b1b; font-weight:800; }
        .nowrap { white-space: nowrap; }
      `}</style>

      <div className="admin-header">
        <div>
          <h1 className="admin-title">Admin · LLR Services · Import</h1>
          <p className="admin-subtitle">
            Upload a CSV, preview & validate, then import using existing API: <b>POST /api/law-reports</b>.
          </p>
        </div>

        <div className="btnRow">
          <button className="admin-btn" onClick={goBackToList} disabled={busy || importing}>
            Back to list
          </button>
          <button
            className="admin-btn"
            onClick={() => {
              resetAll();
              setStep(1);
            }}
            disabled={busy || importing}
          >
            Reset
          </button>
        </div>
      </div>

      {(error || info) && <div className={`admin-alert ${error ? "error" : "ok"}`}>{error || info}</div>}

      {/* Step 1: Template */}
      <div className="section" style={{ marginBottom: 14 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 950, fontSize: 14 }}>Step 1 — Download template</div>
            <div className="muted small">
              Required columns are aligned to your <span className="mono">LawReportUpsertDto</span>.
            </div>
          </div>

          <div className="btnRow">
            <button
              className="admin-btn primary"
              onClick={() => downloadTextFile("llr_import_template.csv", buildTemplateCsv())}
              disabled={busy || importing}
            >
              Download CSV template
            </button>
            <button className="admin-btn" onClick={() => setStep(2)} disabled={busy || importing}>
              I already have a file →
            </button>
          </div>
        </div>

        <div className="kpi" style={{ marginTop: 12 }}>
          <span className="pill">DecisionType: {DECISION_OPTIONS.map((x) => `${x.value}=${x.label}`).join(", ")}</span>
          <span className="pill">CaseType: {CASETYPE_OPTIONS.map((x) => `${x.value}=${x.label}`).join(", ")}</span>
          <span className="pill">CourtType: {COURT_TYPE_OPTIONS.map((x) => `${x.value}=${x.label}`).join(", ")}</span>
        </div>
      </div>

      {/* Step 2: Upload + Preview */}
      <div className="section">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 950, fontSize: 14 }}>Step 2 — Upload & preview</div>
            <div className="muted small">
              CSV only for now. Excel/Word parsers can come later (your backend parser is stubbed).
            </div>
          </div>

          <div className="btnRow">
            <label className="admin-btn primary" style={{ cursor: busy || importing ? "not-allowed" : "pointer" }}>
              Choose CSV
              <input
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                disabled={busy || importing}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </label>

            <button className="admin-btn" onClick={() => setStep(1)} disabled={busy || importing}>
              ← Back
            </button>
          </div>
        </div>

        {fileName && (
          <div className="row" style={{ marginTop: 10, justifyContent: "space-between" }}>
            <div className="muted">
              File: <b>{fileName}</b>
            </div>
            <div className="kpi">
              <span className="pill">{counts.total} row(s)</span>
              <span className={`pill ${counts.valid ? "good" : ""}`}>{counts.valid} valid</span>
              <span className={`pill ${counts.invalid ? "bad" : ""}`}>{counts.invalid} invalid</span>
            </div>
          </div>
        )}

        {preview.length > 0 && (
          <>
            <div className="row" style={{ marginTop: 14, justifyContent: "space-between" }}>
              <div className="muted small">
                Tip: Fix invalid rows in the CSV and re-upload. Duplicates are handled by API (409).
              </div>

              <div className="btnRow">
                <button
                  className="admin-btn primary"
                  onClick={() => {
                    setStep(3);
                    startImport();
                  }}
                  disabled={busy || importing || counts.valid === 0}
                  title={counts.valid === 0 ? "No valid rows to import" : "Import valid rows"}
                >
                  Import valid rows
                </button>
              </div>
            </div>

            <div className="tableWrap" style={{ marginTop: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th className="nowrap">Row</th>
                    <th>Report</th>
                    <th>Year</th>
                    <th>CountryId</th>
                    <th>Service</th>
                    <th>CourtType</th>
                    <th>Town</th>
                    <th>Decision</th>
                    <th>CaseType</th>
                    <th>CaseNo</th>
                    <th>Citation</th>
                    <th>Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 500).map((p) => {
                    const pay = p.payload;
                    return (
                      <tr key={p.rowNumber} className={!p.valid ? "badRow" : ""}>
                        <td className="nowrap mono">{p.rowNumber}</td>
                        <td className="mono">{pay.reportNumber || "—"}</td>
                        <td className="mono">{pay.year || "—"}</td>
                        <td className="mono">{pay.countryId || "—"}</td>
                        <td>{labelFrom(SERVICE_OPTIONS, pay.service)}</td>
                        <td>{labelFrom(COURT_TYPE_OPTIONS, pay.courtType)}</td>
                        <td>{pay.town || "—"}</td>
                        <td>{labelFrom(DECISION_OPTIONS, pay.decisionType)}</td>
                        <td>{labelFrom(CASETYPE_OPTIONS, pay.caseType)}</td>
                        <td className="mono">{pay.caseNumber || "—"}</td>
                        <td className="mono">{pay.citation || "—"}</td>
                        <td className="issues">{p.issues.join(" ")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {preview.length > 500 && (
              <div className="muted small" style={{ marginTop: 8 }}>
                Showing first 500 rows. Import uses all valid rows.
              </div>
            )}
          </>
        )}
      </div>

      {/* Step 3: Import progress */}
      <div className="section" style={{ marginTop: 14 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 950, fontSize: 14 }}>Step 3 — Import</div>
            <div className="muted small">
              Runs <span className="mono">POST /api/law-reports</span> sequentially to avoid overloading the API.
            </div>
          </div>

          <div className="btnRow">
            {importing ? (
              <button className="admin-btn danger" onClick={stopImport}>
                Stop import
              </button>
            ) : (
              <button
                className="admin-btn"
                onClick={() => {
                  // after import, go back to list
                  navigate("/dashboard/admin/llr-services");
                }}
                disabled={busy}
              >
                Go to reports list
              </button>
            )}
          </div>
        </div>

        <div className="kpi" style={{ marginTop: 12 }}>
          <span className="pill">Done: {progress.done}/{progress.total}</span>
          <span className="pill good">OK: {progress.ok}</span>
          <span className="pill warn">Duplicates: {progress.dup}</span>
          <span className="pill bad">Failed: {progress.failed}</span>
        </div>

        <div className="muted small" style={{ marginTop: 10 }}>
          Duplicates are expected if the file contains cases already in DB — your API returns <b>409 Conflict</b> (“Duplicate report exists.”).
        </div>
      </div>

      <AdminPageFooter
        left={
          <>
            <span className="admin-footer-brand">
              Law<span>A</span>frica
            </span>
            <span className="admin-footer-dot">•</span>
            <span className="admin-footer-muted">LLR Import</span>
            <span className="admin-footer-dot">•</span>
            <span className="admin-footer-muted">
              {preview.length ? `${counts.valid}/${counts.total} valid` : "No file loaded"}
            </span>
          </>
        }
        right={<span className="admin-footer-muted">Tip: Start with the template. Keep enums numeric (recommended).</span>}
      />
    </div>
  );
}
