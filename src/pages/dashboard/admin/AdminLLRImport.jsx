// src/pages/dashboard/admin/AdminLLRImport.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Papa from "papaparse";
import api from "../../../api/client";
import "../../../styles/adminCrud.css";
import AdminPageFooter from "../../../components/AdminPageFooter";

/* =========================
   Helpers
========================= */
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
   Date helpers (DD-MM-YY)
   Example: 18-01-26
========================= */
function pad2(n) {
  const x = Number(n);
  return Number.isFinite(x) ? String(x).padStart(2, "0") : "";
}
function isoToDdMmYy(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const dd = pad2(d.getUTCDate());
  const mm = pad2(d.getUTCMonth() + 1);
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}

/**
 * Accepts:
 * - DD-MM-YY (preferred)
 * - DD-MM-YYYY
 * - YYYY-MM-DD
 * - ISO strings
 * Returns ISO string or null
 */
function parseDateToIsoOrNull(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;

  // ISO / Date-parseable (handles most)
  const d0 = new Date(s);
  if (Number.isFinite(d0.getTime())) return d0.toISOString();

  // DD-MM-YY
  const ddmmyy = s.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (ddmmyy) {
    const dd = Number(ddmmyy[1]);
    const mm = Number(ddmmyy[2]);
    const yy = Number(ddmmyy[3]);
    const yyyy = 2000 + yy; // 00-99 => 2000-2099

    const dt = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0, 0));
    if (!Number.isFinite(dt.getTime())) return null;

    if (dt.getUTCFullYear() !== yyyy || dt.getUTCMonth() + 1 !== mm || dt.getUTCDate() !== dd)
      return null;

    return dt.toISOString();
  }

  // DD-MM-YYYY (allow)
  const ddmmyyyy = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddmmyyyy) {
    const dd = Number(ddmmyyyy[1]);
    const mm = Number(ddmmyyyy[2]);
    const yyyy = Number(ddmmyyyy[3]);

    const dt = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0, 0));
    if (!Number.isFinite(dt.getTime())) return null;

    if (dt.getUTCFullYear() !== yyyy || dt.getUTCMonth() + 1 !== mm || dt.getUTCDate() !== dd)
      return null;

    return dt.toISOString();
  }

  // YYYY-MM-DD (allow)
  const yyyymmdd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyymmdd) {
    const yyyy = Number(yyyymmdd[1]);
    const mm = Number(yyyymmdd[2]);
    const dd = Number(yyyymmdd[3]);

    const dt = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0, 0));
    if (!Number.isFinite(dt.getTime())) return null;

    if (dt.getUTCFullYear() !== yyyy || dt.getUTCMonth() + 1 !== mm || dt.getUTCDate() !== dd)
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
  const hit2 = options.find((o) => o.label.toLowerCase().replace(/[^a-z]/g, "") === compact);
  return hit2 ? hit2.value : fallback;
}
function labelFrom(options, value) {
  const v = enumToInt(value, options, 0);
  return options.find((o) => o.value === v)?.label || "—";
}

/* =========================
   CSV Template
   ✅ Updated for PostCode-driven Town+Country
========================= */
const TEMPLATE_HEADERS = [
  "PostCode", // ✅ NEW (preferred)
  "Town", // still allowed (user can override)
  "CountryId", // optional if PostCode exists (Town table will supply)
  "Service",
  "CourtType",
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
    PostCode: "50100",
    Town: "Kakamega",
    CountryId: 1,
    Service: 1,
    CourtType: 3,
    ReportNumber: "HOK045",
    Year: 2013,
    CaseNumber: "045/2013",
    Citation: "[2016] LLR (HCK-K) 045/2013",
    DecisionType: 1,
    CaseType: 2,
    Court: "",
    Parties: "Mauga and others v Kaluworks Limited",
    Judges: "M. J. A. Emukule, MBS, J",
    DecisionDate: "28-04-16",
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
          <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...common}>
          <path d="M21 12a9 9 0 1 1-2.64-6.36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M21 3v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path d="M12 3v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M7 11l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 21h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "upload":
      return (
        <svg {...common}>
          <path d="M12 21V11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M7 15l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M20 21H4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M20 11a4 4 0 0 0-4-4h-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "import":
      return (
        <svg {...common}>
          <path d="M12 3v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M7 8l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 21h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "stop":
      return (
        <svg {...common}>
          <rect x="6" y="6" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    default:
      return null;
  }
}

function IconButton({ title, onClick, disabled, tone = "neutral", children, badge }) {
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
   Town lookup (PostCode -> Town + CountryId)
   - Safe: UI still works even if no endpoint exists
========================= */
async function tryGetFirst(paths, config = {}) {
  for (const p of paths) {
    try {
      const res = await api.get(p, config);
      return { ok: true, data: res.data, path: p };
    } catch {
      // keep trying
    }
  }
  return { ok: false, data: null, path: "" };
}

function pickTownFields(t) {
  const postCode = normalizeText(
    t?.postCode ??
      t?.PostCode ??
      t?.postcode ??
      t?.Postcode ??
      t?.postalCode ??
      t?.PostalCode ??
      t?.code ??
      t?.Code ??
      ""
  );
  const name = normalizeText(t?.name ?? t?.Name ?? t?.town ?? t?.Town ?? "");
  const countryId = toInt(t?.countryId ?? t?.CountryId ?? 0, 0) || null;
  if (!postCode || !name) return null;
  return { postCode, name, countryId };
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
  const [progress, setProgress] = useState({ done: 0, total: 0, ok: 0, dup: 0, failed: 0 });

  const stopRef = useRef(false);
  const fileInputRef = useRef(null);

  // ✅ local Town index (postcode -> {name,countryId})
  const [townsByPostCode, setTownsByPostCode] = useState(new Map());
  const [townIndexLoaded, setTownIndexLoaded] = useState(false);

  const counts = useMemo(() => {
    const total = preview.length;
    const valid = preview.filter((x) => x.valid).length;
    const invalid = total - valid;
    return { total, valid, invalid };
  }, [preview]);

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

  // ✅ best-effort towns preload (so we can validate and auto-fill CountryId during import preview)
  useEffect(() => {
    (async () => {
      const res = await tryGetFirst(
        ["/towns", "/town", "/locations/towns", "/admin/towns"],
        { params: { take: 50000 } }
      );

      if (res.ok) {
        const list = Array.isArray(res.data) ? res.data : [];
        const m = new Map();
        for (const t of list) {
          const parsed = pickTownFields(t);
          if (!parsed) continue;
          if (!m.has(parsed.postCode)) m.set(parsed.postCode, { name: parsed.name, countryId: parsed.countryId });
        }
        setTownsByPostCode(m);
      }
      setTownIndexLoaded(true);
    })();
  }, []);

  function resolveTownFromPostCode(pcRaw) {
    const pc = normalizeText(pcRaw);
    if (!pc) return null;
    const hit = townsByPostCode.get(pc);
    if (!hit) return null;
    return { postCode: pc, name: hit.name, countryId: hit.countryId ?? null };
  }

  function normalizeCsvRows(rows) {
    return rows.map((r, idx) => {
      const map = {};
      for (const [k, v] of Object.entries(r)) map[csvHeaderKey(k)] = v;

      // ✅ Accept either PostCode (preferred) or legacy Town+CountryId
      const postCode =
        normalizeText(map["postcode"] ?? map["postCode"] ?? map["postalcode"] ?? map["code"]) || null;

      const townFromCsv = normalizeText(map["town"]) || null;

      // If postcode exists, try resolve Town+Country from index (best-effort)
      const resolved = postCode ? resolveTownFromPostCode(postCode) : null;

      // ✅ countryId:
      // - prefer resolved countryId from town table if postcode exists
      // - else use CSV CountryId
      const countryIdFromCsv = toInt(map["countryid"], 0);
      const countryId = toInt(resolved?.countryId ?? countryIdFromCsv, 0);

      // ✅ town:
      // - default to resolved town name if postcode exists
      // - BUT allow CSV Town to override with a more specific name
      const town = normalizeText(townFromCsv || resolved?.name || "") || null;

      const service = enumToInt(map["service"], SERVICE_OPTIONS, 0) || toInt(map["service"], 0);
      const courtType = enumToInt(map["courttype"], COURT_TYPE_OPTIONS, 0) || toInt(map["courttype"], 0);

      const reportNumber = normalizeText(map["reportnumber"]);
      const year = toInt(map["year"], 0);

      const caseNumber = normalizeText(map["casenumber"]) || null;
      const citation = normalizeText(map["citation"]) || null;

      const decisionType = enumToInt(map["decisiontype"], DECISION_OPTIONS, 0) || toInt(map["decisiontype"], 0);
      const caseType = enumToInt(map["casetype"], CASETYPE_OPTIONS, 0) || toInt(map["casetype"], 0);

      const court = normalizeText(map["court"]) || null;

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

        // ✅ new
        postCode: postCode || null,

        // free-text town (can be more specific)
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
        decisionDate, // ISO for API
        contentText,
      };

      const issues = [];

      // ✅ Validation rules:
      // - If PostCode exists, CountryId can be derived (but only if lookup succeeds OR csv provided).
      // - If no PostCode, CountryId is required as before.
      if (!postCode && !countryId) issues.push("CountryId is required when PostCode is empty.");
      if (postCode && !countryId) {
        issues.push(
          townIndexLoaded
            ? "PostCode not found in Town table. Either fix PostCode or provide CountryId."
            : "Town index still loading. If PostCode cannot resolve, provide CountryId."
        );
      }

      if (!service) issues.push("Service is required.");
      if (!courtType) issues.push("CourtType is required.");
      if (!town) issues.push("Town is required (directly or via PostCode).");
      if (!reportNumber) issues.push("ReportNumber is required.");
      if (!year || year < 1900 || year > 2100) issues.push("Year must be between 1900 and 2100.");
      if (!decisionType) issues.push("DecisionType is required (e.g. 1=Judgment).");
      if (!caseType) issues.push("CaseType is required (e.g. 2=Civil).");
      if (!contentText) issues.push("ContentText is required.");

      if (!isEmpty(decisionDateRaw) && !decisionDate) {
        issues.push("DecisionDate invalid. Use DD-MM-YY (e.g. 18-01-26).");
      }

      // Optional hint if postcode resolves but CSV overrides town
      const hints = [];
      if (postCode && resolved?.name) {
        if (townFromCsv && townFromCsv.toLowerCase() !== resolved.name.toLowerCase()) {
          hints.push(`Town overridden: ${resolved.name} → ${townFromCsv}`);
        } else {
          hints.push(`Town from PostCode: ${resolved.name}`);
        }
      }

      return {
        rowNumber: idx + 2,
        payload,
        issues,
        hints,
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
        return;
      }

      const rows = Array.isArray(parsed.data) ? parsed.data : [];
      const normalized = normalizeCsvRows(rows);
      setPreview(normalized);

      if (normalized.length === 0) setInfo("No rows found in the file.");
      else if (normalized.every((x) => x.valid)) setInfo(`Loaded ${normalized.length} row(s). Ready to import.`);
      else setInfo(`Loaded ${normalized.length} row(s). Fix invalid rows then re-upload.`);
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

    const okConfirm = window.confirm(
      `Import ${validRows.length} valid row${validRows.length === 1 ? "" : "s"} now?`
    );
    if (!okConfirm) return;

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
        if (status === 409) dup++;
        else failed++;
      } finally {
        setProgress({ done: i + 1, total: validRows.length, ok, dup, failed });
      }
    }

    setImporting(false);

    if (stopRef.current) {
      setInfo(`Stopped. OK: ${ok}, duplicates: ${dup}, failed: ${failed}.`);
      return;
    }

    if (failed === 0 && dup === 0) {
      resetAll({
        keepInfo: `✅ Import successful. ${ok} case(s) added. Ready for the next file.`,
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
        /* ✅ Modern, airy UI (clear font, spacing, soft shadows) */
        .la-page {
          max-width: 1240px;
          margin: 0 auto;
          padding: 6px 0 0;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
        }

        .la-hero {
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:16px;
          margin-bottom: 14px;
        }

        .la-title {
          font-size: 28px;
          font-weight: 980;
          letter-spacing: -0.03em;
          margin: 0;
          color:#0f172a;
        }

        .la-subtitle {
          margin: 8px 0 0;
          font-size: 13px;
          color: #64748b;
          font-weight: 750;
          line-height: 1.6;
        }

        .la-toolbar {
          display:flex;
          gap:12px;
          align-items:center;
          justify-content:space-between;
          margin-bottom: 14px;
        }

        .la-tools {
          display:flex;
          gap:10px;
          align-items:center;
          flex-wrap:wrap;
        }

        .la-card {
          background:#fff;
          border:1px solid rgba(226,232,240,.95);
          border-radius:20px;
          padding:18px;
          box-shadow: 0 10px 32px rgba(2,6,23,.06);
        }

        .la-cardHeader {
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:14px;
        }

        .la-cardTitle {
          font-weight: 950;
          font-size: 14px;
          margin: 0;
          color:#0f172a;
        }

        .la-cardSub {
          margin-top: 6px;
          color:#64748b;
          font-size: 12px;
          font-weight: 750;
          line-height: 1.5;
        }

        .la-grid {
          display:grid;
          grid-template-columns: repeat(12, 1fr);
          gap:12px;
          margin-bottom: 14px;
        }
        .span6 { grid-column: span 6; }
        .span12 { grid-column: span 12; }

        @media (max-width: 980px) {
          .span6 { grid-column: span 12; }
        }

        .mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        }

        /* ✅ Icon buttons */
        .la-icon-btn {
          position: relative;
          display:inline-flex; align-items:center; justify-content:center;
          width: 46px; height: 46px;
          border-radius: 14px;
          border: 1px solid rgba(226,232,240,.95);
          background: #fff;
          cursor: pointer;
          color: #0f172a;
          box-shadow: 0 10px 22px rgba(2,6,23,.08);
          transition: transform .08s ease, box-shadow .12s ease, background .12s ease, border-color .12s ease;
        }
        .la-icon-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 18px 30px rgba(2,6,23,.14);
          background:#fafafa;
        }
        .la-icon-btn:active { transform: translateY(0px) scale(.98); }
        .la-icon-btn:disabled { opacity: .55; cursor: not-allowed; box-shadow:none; }

        .la-icon-btn.primary {
          border-color:#c7d2fe;
          background: #eef2ff;
          box-shadow: 0 12px 24px rgba(99,102,241,.18);
        }
        .la-icon-btn.primary:hover { background:#e0e7ff; }

        .la-icon-btn.import {
          border-color:#bbf7d0;
          background: #ecfdf5;
          box-shadow: 0 12px 24px rgba(16,185,129,.16);
        }
        .la-icon-btn.import:hover { background:#d1fae5; }

        .la-icon-btn.danger {
          border-color:#fecaca;
          background: #fef2f2;
          box-shadow: 0 12px 24px rgba(239,68,68,.10);
        }
        .la-icon-btn.danger:hover { background:#fee2e2; }

        .la-btn-badge {
          position:absolute;
          top:-8px;
          right:-8px;
          background:#0f172a;
          color:#fff;
          border:2px solid #fff;
          font-size:11px;
          font-weight:950;
          padding:2px 7px;
          border-radius:999px;
          line-height: 1.4;
          box-shadow: 0 10px 20px rgba(2,6,23,.18);
        }

        .uploadLabel { display:inline-flex; }

        /* ✅ Chips */
        .la-chipBar {
          display:flex;
          gap:10px;
          flex-wrap:wrap;
          margin-top: 10px;
        }

        .la-chip {
          display:inline-flex;
          align-items:center;
          gap:8px;
          padding:9px 12px;
          border-radius:14px;
          border:1px solid rgba(226,232,240,.95);
          background:#f8fafc;
          color:#0f172a;
          font-weight:850;
          font-size:12px;
          line-height: 1.15;
        }

        .la-chip strong { font-weight: 950; }
        .la-chip.good { background:#ecfdf5; border-color:#a7f3d0; color:#065f46; }
        .la-chip.warn { background:#fff7ed; border-color:#fed7aa; color:#9a3412; }
        .la-chip.bad { background:#fef2f2; border-color:#fecaca; color:#991b1b; }

        /* ✅ Table */
        .tableWrap {
          margin-top: 12px;
          max-height: 62vh;
          overflow:auto;
          border-radius: 16px;
          border:1px solid rgba(226,232,240,.95);
          background:#fff;
        }
        table { width:100%; border-collapse: collapse; font-size: 12.5px; }
        thead th {
          position: sticky; top:0; background:#f8fafc; z-index:1;
          text-align:left; padding:12px; border-bottom:1px solid rgba(226,232,240,.95);
          font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color:#64748b;
        }
        tbody td {
          padding:12px;
          border-bottom:1px solid #f1f5f9;
          vertical-align: top;
          color:#0f172a;
        }
        tr.badRow td { background: #fff5f5; }
        .issues { color:#991b1b; font-weight:900; }
        .hints { color:#0f172a; font-weight:800; opacity:.7; }

        .note {
          margin-top: 10px;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(226,232,240,.95);
          background: #f8fafc;
          color: #0f172a;
          font-size: 12px;
          font-weight: 800;
          line-height: 1.4;
        }
        .note b { font-weight: 950; }
      `}</style>

      <div className="la-page">
        <div className="la-hero">
          <div>
            <h1 className="la-title">Admin · LLR Services · Import</h1>
            <p className="la-subtitle">
              Upload a CSV, preview & validate, then import using <b>POST /api/law-reports</b>.{" "}
              Date format: <b>DD-MM-YY</b> (e.g. <span className="mono">18-01-26</span>).
            </p>
          </div>

          <div className="la-tools">
            <IconButton title="Back to reports list" onClick={goBackToList} disabled={busy || importing}>
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

            {preview.length > 0 && (
              <>
                <button
                  type="button"
                  className="la-icon-btn import"
                  title={importHint}
                  aria-label={importHint}
                  onClick={startImport}
                  disabled={busy || importing || counts.valid === 0}
                >
                  <Icon name="import" />
                  {counts.valid > 0 ? <span className="la-btn-badge">{counts.valid}</span> : null}
                </button>

                {importing && (
                  <IconButton title="Stop import" onClick={stopImport} disabled={busy} tone="danger">
                    <Icon name="stop" />
                  </IconButton>
                )}
              </>
            )}
          </div>
        </div>

        {(error || info) && <div className={`admin-alert ${error ? "error" : "ok"}`}>{error || info}</div>}

        {/* ✅ Modern card layout */}
        <div className="la-grid">
          <div className="la-card span6">
            <div className="la-cardHeader">
              <div>
                <div className="la-cardTitle">Step 1 — Template</div>
                <div className="la-cardSub">
                  Download the template, fill it, then upload it. Use <b>PostCode</b> to auto-link Town + Country.
                  <div className="note" style={{ marginTop: 10 }}>
                    <b>Tip:</b> If you provide <b>PostCode</b>, you may leave <b>CountryId</b> empty (as long as the
                    postcode exists in the Town table). <b>Town</b> can still be provided to override with a more specific name.
                  </div>
                </div>
              </div>
            </div>

            <div className="la-chipBar">
              <span className="la-chip">
                <strong>DecisionType</strong> {DECISION_OPTIONS.map((x) => `${x.value}=${x.label}`).join(", ")}
              </span>
              <span className="la-chip">
                <strong>CaseType</strong> {CASETYPE_OPTIONS.map((x) => `${x.value}=${x.label}`).join(", ")}
              </span>
              <span className="la-chip">
                <strong>CourtType</strong> {COURT_TYPE_OPTIONS.map((x) => `${x.value}=${x.label}`).join(", ")}
              </span>
            </div>
          </div>

          <div className="la-card span6">
            <div className="la-cardHeader">
              <div>
                <div className="la-cardTitle">Step 2 — Upload & Preview</div>
                <div className="la-cardSub">
                  Upload a CSV to preview. Invalid rows show the exact issue. Fix the CSV and upload again.
                </div>
              </div>
            </div>

            <div className="la-chipBar">
              <span className="la-chip">
                <strong>{counts.total}</strong> row(s)
              </span>
              <span className={`la-chip ${counts.valid ? "good" : ""}`}>
                <strong>{counts.valid}</strong> valid
              </span>
              <span className={`la-chip ${counts.invalid ? "bad" : ""}`}>
                <strong>{counts.invalid}</strong> invalid
              </span>
              <span className={`la-chip ${townIndexLoaded ? "" : "warn"}`}>
                <strong>{townIndexLoaded ? "Town index ready" : "Town index loading…"}</strong>
              </span>
            </div>

            {fileName && (
              <div className="la-cardSub" style={{ marginTop: 10 }}>
                File: <b>{fileName}</b>
              </div>
            )}
          </div>

          <div className="la-card span12">
            <div className="la-cardHeader">
              <div>
                <div className="la-cardTitle">Step 3 — Import</div>
                <div className="la-cardSub">
                  Imports only valid rows. Duplicates return <b>409</b>. If there are <b>no duplicates</b> and <b>no failures</b>,
                  the page resets automatically.
                </div>
              </div>

              <div className="la-chipBar" style={{ marginTop: 0 }}>
                <span className="la-chip">
                  <strong>{progress.done}</strong> / {progress.total} done
                </span>
                <span className="la-chip good">
                  <strong>{progress.ok}</strong> OK
                </span>
                <span className="la-chip warn">
                  <strong>{progress.dup}</strong> Duplicates
                </span>
                <span className="la-chip bad">
                  <strong>{progress.failed}</strong> Failed
                </span>
              </div>
            </div>

            {preview.length === 0 ? (
              <div className="la-cardSub" style={{ marginTop: 12 }}>
                Upload a CSV to see the preview here.
              </div>
            ) : (
              <>
                <div className="tableWrap">
                  <table>
                    <thead>
                      <tr>
                        <th className="mono">Row</th>
                        <th className="mono">PostCode</th>
                        <th>Town</th>
                        <th className="mono">Country</th>
                        <th>Service</th>
                        <th>CourtType</th>
                        <th className="mono">Report</th>
                        <th className="mono">Year</th>
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
                            <td className="mono">{pay.postCode || "—"}</td>
                            <td>{pay.town || "—"}</td>
                            <td className="mono">{pay.countryId || "—"}</td>
                            <td>{labelFrom(SERVICE_OPTIONS, pay.service)}</td>
                            <td>{labelFrom(COURT_TYPE_OPTIONS, pay.courtType)}</td>
                            <td className="mono">{pay.reportNumber || "—"}</td>
                            <td className="mono">{pay.year || "—"}</td>
                            <td>{labelFrom(DECISION_OPTIONS, pay.decisionType)}</td>
                            <td>{labelFrom(CASETYPE_OPTIONS, pay.caseType)}</td>
                            <td className="mono">{pay.caseNumber || "—"}</td>
                            <td className="mono">{pay.citation || "—"}</td>
                            <td className="mono">{pay.decisionDate ? isoToDdMmYy(pay.decisionDate) : "—"}</td>
                            <td>
                              <div className="issues">{p.issues.join(" ")}</div>
                              {p.hints?.length ? <div className="hints" style={{ marginTop: 6 }}>{p.hints.join(" • ")}</div> : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {preview.length > 500 && (
                  <div className="la-cardSub" style={{ marginTop: 8 }}>
                    Showing first 500 rows. Import uses all valid rows.
                  </div>
                )}
              </>
            )}
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
          right={
            <span className="admin-footer-muted">
              Tip: Use <b>PostCode</b> to auto-link Town+Country. DecisionDate uses <b>DD-MM-YY</b> (e.g.{" "}
              <span className="mono">18-01-26</span>).
            </span>
          }
        />
      </div>
    </div>
  );
}
