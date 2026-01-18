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
   Date helpers (DD-MM-YYYY)
========================= */
function pad2(n) {
  const x = Number(n);
  return Number.isFinite(x) ? String(x).padStart(2, "0") : "";
}

function isoToDdMmYyyy(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const dd = pad2(d.getUTCDate());
  const mm = pad2(d.getUTCMonth() + 1);
  const yyyy = d.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/**
 * Accepts:
 * - DD-MM-YYYY (preferred)
 * - YYYY-MM-DD
 * - ISO strings
 * Returns ISO string or null
 */
function parseDateToIsoOrNull(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;

  // ISO / Date-parseable
  const d0 = new Date(s);
  if (Number.isFinite(d0.getTime())) return d0.toISOString();

  // DD-MM-YYYY
  const ddmmyyyy = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddmmyyyy) {
    const dd = Number(ddmmyyyy[1]);
    const mm = Number(ddmmyyyy[2]);
    const yyyy = Number(ddmmyyyy[3]);

    const dt = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0, 0));
    if (!Number.isFinite(dt.getTime())) return null;

    if (
      dt.getUTCFullYear() !== yyyy ||
      dt.getUTCMonth() + 1 !== mm ||
      dt.getUTCDate() !== dd
    )
      return null;

    return dt.toISOString();
  }

  // YYYY-MM-DD
  const yyyymmdd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyymmdd) {
    const yyyy = Number(yyyymmdd[1]);
    const mm = Number(yyyymmdd[2]);
    const dd = Number(yyyymmdd[3]);

    const dt = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0, 0));
    if (!Number.isFinite(dt.getTime())) return null;

    if (
      dt.getUTCFullYear() !== yyyy ||
      dt.getUTCMonth() + 1 !== mm ||
      dt.getUTCDate() !== dd
    )
      return null;

    return dt.toISOString();
  }

  return null;
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

  const compact = s.toLowerCase().replace(/[^a-z]/g, "");
  const hit2 = options.find(
    (o) => o.label.toLowerCase().replace(/[^a-z]/g, "") === compact
  );
  return hit2 ? hit2.value : fallback;
}

function labelFrom(options, value) {
  const v = enumToInt(value, options, 0);
  return options.find((o) => o.value === v)?.label || "—";
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
    Court: "",
    Parties: "Mauga and others v Kaluworks Limited",
    Judges: "M. J. A. Emukule, MBS, J",
    DecisionDate: "28-04-2016",
    ContentText: "Paste plain text here (you can format later in Report Content).",
  };

  const rows = [TEMPLATE_HEADERS, TEMPLATE_HEADERS.map((h) => example[h] ?? "")];
  return rows
    .map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(","))
    .join("\n");
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
   Inline SVG Icons (no deps)
========================= */
function Icon({ name }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
  };

  switch (name) {
    case "back":
      return (
        <svg {...common}>
          <path
            d="M15 18l-6-6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "refresh":
      return (
        <svg {...common}>
          <path
            d="M21 12a9 9 0 1 1-2.64-6.36"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M21 3v6h-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path
            d="M12 3v10"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M7 11l5 5 5-5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4 21h16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "upload":
      return (
        <svg {...common}>
          <path
            d="M12 21V11"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M7 15l5-5 5 5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M20 21H4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M20 11a4 4 0 0 0-4-4h-1"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "import":
      return (
        <svg {...common}>
          <path
            d="M12 3v10"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M7 8l5 5 5-5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4 21h16"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "stop":
      return (
        <svg {...common}>
          <rect
            x="6"
            y="6"
            width="12"
            height="12"
            rx="2"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      );
    default:
      return null;
  }
}

function IconButton({
  title,
  onClick,
  disabled,
  tone = "neutral",
  children,
  badge,
}) {
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
      {badge ? <span className="la-btn-badge">{badge}</span> : null}
    </button>
  );
}

/* =========================
   Page
========================= */
export default function AdminLLRImport() {
  const navigate = useNavigate();

  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState([]);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({
    done: 0,
    total: 0,
    ok: 0,
    dup: 0,
    failed: 0,
  });

  const stopRef = useRef(false);
  const fileInputRef = useRef(null);

  const counts = useMemo(() => {
    const total = preview.length;
    const valid = preview.filter((x) => x.valid).length;
    const invalid = total - valid;
    return { total, valid, invalid };
  }, [preview]);

  // ✅ used for tooltip + click-confirm
  const importHint = useMemo(() => {
    if (importing) return "Importing…";
    if (counts.valid === 0) return "No valid rows to import";
    return `Imports ${counts.valid} valid row${counts.valid === 1 ? "" : "s"}`;
  }, [counts.valid, importing]);

  function resetAll({ keepInfo } = {}) {
    setFileName("");
    setPreview([]);
    setError("");
    setInfo(keepInfo || "");
    setBusy(false);
    setImporting(false);
    setProgress({ done: 0, total: 0, ok: 0, dup: 0, failed: 0 });
    stopRef.current = false;
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function goBackToList() {
    navigate("/dashboard/admin/llr-services");
  }

  function normalizeCsvRows(rows) {
    return rows.map((r, idx) => {
      const map = {};
      for (const [k, v] of Object.entries(r)) map[csvHeaderKey(k)] = v;

      const countryId = toInt(map["countryid"], 0);
      const service =
        enumToInt(map["service"], SERVICE_OPTIONS, 0) || toInt(map["service"], 0);
      const courtType =
        enumToInt(map["courttype"], COURT_TYPE_OPTIONS, 0) ||
        toInt(map["courttype"], 0);

      const reportNumber = normalizeText(map["reportnumber"]);
      const year = toInt(map["year"], 0);

      const caseNumber = normalizeText(map["casenumber"]) || null;
      const citation = normalizeText(map["citation"]) || null;

      const decisionType =
        enumToInt(map["decisiontype"], DECISION_OPTIONS, 0) ||
        toInt(map["decisiontype"], 0);
      const caseType =
        enumToInt(map["casetype"], CASETYPE_OPTIONS, 0) ||
        toInt(map["casetype"], 0);

      const court = normalizeText(map["court"]) || null;
      const town = normalizeText(map["town"]) || null;

      const parties = normalizeText(map["parties"]) || null;
      const judges = normalizeText(map["judges"]) || null;

      const decisionDateRaw = map["decisiondate"];
      const decisionDate = parseDateToIsoOrNull(decisionDateRaw);

      const contentText = String(map["contenttext"] ?? "").trim();

      const payload = {
        category: 6,
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
      if (!countryId) issues.push("CountryId is required.");
      if (!service) issues.push("Service is required.");
      if (!courtType) issues.push("CourtType is required.");
      if (!reportNumber) issues.push("ReportNumber is required.");
      if (!year || year < 1900 || year > 2100)
        issues.push("Year must be between 1900 and 2100.");
      if (!decisionType) issues.push("DecisionType is required (e.g. 1=Judgment).");
      if (!caseType) issues.push("CaseType is required (e.g. 2=Civil).");
      if (!contentText) issues.push("ContentText is required.");
      if (!isEmpty(decisionDateRaw) && !decisionDate)
        issues.push("DecisionDate invalid. Use DD-MM-YYYY.");

      return {
        rowNumber: idx + 2,
        payload,
        issues,
        valid: issues.length === 0,
      };
    });
  }

  async function handleFile(file) {
    setError("");
    setInfo("");
    setBusy(true);
    setPreview([]);
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
      const normalized = normalizeCsvRows(rows);
      setPreview(normalized);

      if (normalized.length === 0) setInfo("No rows found in the file.");
      else if (normalized.every((x) => x.valid))
        setInfo(`Loaded ${normalized.length} row(s). Ready to import.`);
      else
        setInfo(
          `Loaded ${normalized.length} row(s). Fix invalid rows (highlighted) then re-upload.`
        );
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function startImport() {
    setError("");
    setInfo("");
    stopRef.current = false;

    const validRows = preview.filter((x) => x.valid);
    if (!validRows.length) {
      setError("No valid rows to import. Fix the CSV first.");
      return;
    }

    // ✅ click-confirm (small UX win)
    const okConfirm = window.confirm(
      `Import ${validRows.length} valid row${validRows.length === 1 ? "" : "s"} now?`
    );
    if (!okConfirm) return;

    setImporting(true);
    setProgress({
      done: 0,
      total: validRows.length,
      ok: 0,
      dup: 0,
      failed: 0,
    });

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
        if (status === 409) dup++;
        else failed++;
      } finally {
        setProgress({
          done: i + 1,
          total: validRows.length,
          ok,
          dup,
          failed,
        });
      }
    }

    setImporting(false);

    if (stopRef.current) {
      setInfo(`Stopped. OK: ${ok}, duplicates: ${dup}, failed: ${failed}.`);
      return;
    }

    if (failed === 0 && dup === 0) {
      resetAll({
        keepInfo: `✅ Import successful. ${ok} case(s) added. Page reset and ready for next file.`,
      });
      return;
    }

    setInfo(`Import finished. OK: ${ok}, duplicates: ${dup}, failed: ${failed}.`);
  }

  function stopImport() {
    stopRef.current = true;
    setInfo("Stopping…");
  }

  return (
    <div className="admin-page admin-page-wide">
      <style>{`
        .card {
          background:#fff;
          border:1px solid #e5e7eb;
          border-radius:18px;
          padding:16px;
          box-shadow: 0 8px 26px rgba(0,0,0,.06);
        }

        .cardTitle { font-weight: 950; font-size: 14px; }
        .cardSub { color:#6b7280; font-size:12px; font-weight: 800; margin-top: 4px; line-height: 1.35; }
        .row { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
        .space { justify-content: space-between; }

        .kpi { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }
        .pill {
          display:inline-flex; align-items:center;
          padding:6px 12px;
          border-radius:999px;
          border:1px solid #e5e7eb;
          background:#fafafa;
          font-weight:900;
          font-size:12px;
          color:#111827;
        }
        .pill.good { background:#ecfdf5; border-color:#a7f3d0; color:#065f46; }
        .pill.warn { background:#fff7ed; border-color:#fed7aa; color:#9a3412; }
        .pill.bad { background:#fef2f2; border-color:#fecaca; color:#991b1b; }

        .small { font-size:12px; font-weight:800; color:#6b7280; }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }

        .tableWrap {
          margin-top: 12px;
          max-height: 60vh;
          overflow:auto;
          border-radius: 14px;
          border:1px solid #e5e7eb;
        }
        table { width:100%; border-collapse: collapse; font-size: 12.5px; }
        thead th {
          position: sticky; top:0; background:#fafafa; z-index:1;
          text-align:left; padding:10px; border-bottom:1px solid #e5e7eb;
          font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color:#6b7280;
        }
        tbody td { padding:10px; border-bottom:1px solid #f1f5f9; vertical-align: top; }
        tr.badRow td { background: #fff5f5; }
        .issues { color:#991b1b; font-weight:900; }

        /* ✅ Header tools – more visible / attractive */
        .headerTools { display:flex; gap:12px; align-items:center; }

        .la-icon-btn {
          position: relative;
          display:inline-flex; align-items:center; justify-content:center;
          width: 44px; height: 44px;        /* bigger */
          border-radius: 14px;
          border: 1px solid #e5e7eb;
          background: #fff;
          cursor: pointer;
          color: #111827;
          box-shadow: 0 8px 18px rgba(0,0,0,.06);
          transition: transform .08s ease, box-shadow .12s ease, background .12s ease, border-color .12s ease;
        }
        .la-icon-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 12px 24px rgba(0,0,0,.10);
          background:#fafafa;
        }
        .la-icon-btn:active { transform: translateY(0px) scale(.98); }
        .la-icon-btn:disabled { opacity: .55; cursor: not-allowed; box-shadow:none; }

        /* Primary: download/upload/import pop more */
        .la-icon-btn.primary {
          border-color:#c7d2fe;
          background: #eef2ff;
          box-shadow: 0 10px 22px rgba(99,102,241,.18);
        }
        .la-icon-btn.primary:hover { background:#e0e7ff; }

        /* Import button: make it clearly the primary action */
        .la-icon-btn.import {
          border-color:#bbf7d0;
          background: #ecfdf5;
          box-shadow: 0 10px 22px rgba(16,185,129,.16);
        }
        .la-icon-btn.import:hover { background:#d1fae5; }

        .la-icon-btn.danger {
          border-color:#fecaca;
          background: #fef2f2;
          box-shadow: 0 10px 22px rgba(239,68,68,.10);
        }
        .la-icon-btn.danger:hover { background:#fee2e2; }

        /* Tiny badge for "valid rows" next to import button */
        .la-btn-badge {
          position:absolute;
          top:-8px;
          right:-8px;
          background:#111827;
          color:#fff;
          border:2px solid #fff;
          font-size:11px;
          font-weight:900;
          padding:2px 7px;
          border-radius:999px;
          line-height: 1.4;
          box-shadow: 0 10px 20px rgba(0,0,0,.14);
        }

        /* Upload label styled like button */
        .uploadLabel { display:inline-flex; }

        /* Step cards spacing */
        .stepGrid { display:flex; gap:12px; flex-wrap:wrap; margin-bottom: 14px; }
      `}</style>

      <div className="admin-header">
        <div>
          <h1 className="admin-title">Admin · LLR Services · Import</h1>
          <p className="admin-subtitle">
            Upload a CSV, preview & validate, then import using <b>POST /api/law-reports</b>.
            <span className="small"> &nbsp;Date format: <b>DD-MM-YYYY</b>.</span>
          </p>
        </div>

        {/* ✅ Better visibility: bigger + colored buttons */}
        <div className="headerTools">
          <IconButton
            title="Back to reports list"
            onClick={goBackToList}
            disabled={busy || importing}
          >
            <Icon name="back" />
          </IconButton>

          <IconButton
            title="Reset page"
            onClick={() => resetAll({ keepInfo: "Reset done. Ready for a new file." })}
            disabled={busy || importing}
          >
            <Icon name="refresh" />
          </IconButton>

          <IconButton
            title="Download CSV template"
            onClick={() => downloadTextFile("llr_import_template.csv", buildTemplateCsv())}
            disabled={busy || importing}
            tone="primary"
          >
            <Icon name="download" />
          </IconButton>

          <label
            className="uploadLabel"
            title="Choose CSV file"
            style={{ cursor: busy || importing ? "not-allowed" : "pointer" }}
          >
            <span className="la-icon-btn primary" aria-label="Choose CSV file">
              <Icon name="upload" />
            </span>
            <input
              ref={fileInputRef}
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

          {/* ✅ Import button: tooltip shows "Imports X valid rows" */}
          {preview.length > 0 && (
            <>
              <button
                type="button"
                className={`la-icon-btn import`}
                title={importHint}
                aria-label={importHint}
                onClick={startImport}
                disabled={busy || importing || counts.valid === 0}
              >
                <Icon name="import" />
                {counts.valid > 0 ? <span className="la-btn-badge">{counts.valid}</span> : null}
              </button>

              {importing && (
                <IconButton
                  title="Stop import"
                  onClick={stopImport}
                  disabled={busy}
                  tone="danger"
                >
                  <Icon name="stop" />
                </IconButton>
              )}
            </>
          )}
        </div>
      </div>

      {(error || info) && (
        <div className={`admin-alert ${error ? "error" : "ok"}`}>
          {error || info}
        </div>
      )}

      {/* Instructions cards */}
      <div className="stepGrid">
        <div className="card" style={{ flex: 1, minWidth: 320 }}>
          <div className="cardTitle">Step 1 — Template</div>
          <div className="cardSub">
            Download the template, fill it, then upload. Keep enums numeric for best results.
            <br />
            <b>Date:</b> use <b>DD-MM-YYYY</b> (e.g. <span className="mono">28-04-2016</span>).
          </div>

          <div className="kpi" style={{ marginTop: 12 }}>
            <span className="pill">
              DecisionType: {DECISION_OPTIONS.map((x) => `${x.value}=${x.label}`).join(", ")}
            </span>
            <span className="pill">
              CaseType: {CASETYPE_OPTIONS.map((x) => `${x.value}=${x.label}`).join(", ")}
            </span>
            <span className="pill">
              CourtType: {COURT_TYPE_OPTIONS.map((x) => `${x.value}=${x.label}`).join(", ")}
            </span>
          </div>
        </div>

        <div className="card" style={{ flex: 1, minWidth: 320 }}>
          <div className="cardTitle">Step 2 — Upload & Preview</div>
          <div className="cardSub">
            Upload CSV to preview rows. Invalid rows are highlighted with issues.
            Fix them in the CSV and re-upload.
          </div>

          <div className="kpi" style={{ marginTop: 12 }}>
            <span className="pill">{counts.total} row(s)</span>
            <span className={`pill ${counts.valid ? "good" : ""}`}>{counts.valid} valid</span>
            <span className={`pill ${counts.invalid ? "bad" : ""}`}>{counts.invalid} invalid</span>
          </div>

          {fileName && (
            <div className="cardSub" style={{ marginTop: 10 }}>
              File: <b>{fileName}</b>
            </div>
          )}
        </div>
      </div>

      {/* Preview table */}
      <div className="card">
        <div className="row space">
          <div>
            <div className="cardTitle">Step 3 — Import</div>
            <div className="cardSub">
              Imports only valid rows. Duplicates return <b>409</b> and are counted as duplicates.
              <br />
              If import finishes with <b>no duplicates and no failures</b>, the page resets automatically.
            </div>
          </div>

          <div className="kpi">
            <span className="pill">Done: {progress.done}/{progress.total}</span>
            <span className="pill good">OK: {progress.ok}</span>
            <span className="pill warn">Duplicates: {progress.dup}</span>
            <span className="pill bad">Failed: {progress.failed}</span>
          </div>
        </div>

        {preview.length === 0 ? (
          <div className="small" style={{ marginTop: 12 }}>
            Upload a CSV to see preview here.
          </div>
        ) : (
          <>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th className="mono">Row</th>
                    <th>Report</th>
                    <th>Year</th>
                    <th className="mono">Country</th>
                    <th>Service</th>
                    <th>CourtType</th>
                    <th>Town</th>
                    <th>Decision</th>
                    <th>CaseType</th>
                    <th className="mono">CaseNo</th>
                    <th className="mono">Citation</th>
                    <th>DecisionDate</th>
                    <th>Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 500).map((p) => {
                    const pay = p.payload;
                    return (
                      <tr key={p.rowNumber} className={!p.valid ? "badRow" : ""}>
                        <td className="mono">{p.rowNumber}</td>
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
                        <td className="mono">
                          {pay.decisionDate ? isoToDdMmYyyy(pay.decisionDate) : "—"}
                        </td>
                        <td className="issues">{p.issues.join(" ")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {preview.length > 500 && (
              <div className="small" style={{ marginTop: 8 }}>
                Showing first 500 rows. Import uses all valid rows.
              </div>
            )}
          </>
        )}
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
        right={
          <span className="admin-footer-muted">
            Tip: DecisionDate uses <b>DD-MM-YYYY</b>. Use the template to avoid column mistakes.
          </span>
        }
      />
    </div>
  );
}
