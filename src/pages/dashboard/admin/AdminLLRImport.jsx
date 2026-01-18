// src/pages/dashboard/admin/AdminLLRImport.jsx
import { useMemo, useRef, useState } from "react";
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

    if (dt.getUTCFullYear() !== yyyy || dt.getUTCMonth() + 1 !== mm || dt.getUTCDate() !== dd) return null;
    return dt.toISOString();
  }

  // DD-MM-YYYY
  const ddmmyyyy = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddmmyyyy) {
    const dd = Number(ddmmyyyy[1]);
    const mm = Number(ddmmyyyy[2]);
    const yyyy = Number(ddmmyyyy[3]);

    const dt = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0, 0));
    if (!Number.isFinite(dt.getTime())) return null;

    if (dt.getUTCFullYear() !== yyyy || dt.getUTCMonth() + 1 !== mm || dt.getUTCDate() !== dd) return null;
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

    if (dt.getUTCFullYear() !== yyyy || dt.getUTCMonth() + 1 !== mm || dt.getUTCDate() !== dd) return null;
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
   ✅ Now includes PostCode (preferred) and Town (optional override)
========================= */
const TEMPLATE_HEADERS = [
  "CountryId",
  "Service",
  "CourtType",
  "PostCode", // ✅ NEW
  "Town", // optional override
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
    PostCode: "50100",
    Town: "Kakamega", // optional override (will be auto-resolved if blank)
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
   Town resolve cache
   GET /api/towns/resolve?countryId=1&postCode=50100
========================= */
async function resolveTownByPostCode({ countryId, postCode, cache }) {
  const cid = toInt(countryId, 0);
  const pc = normalizeText(postCode);
  if (!cid || !pc) return { ok: false, name: "", message: "CountryId and PostCode are required." };

  const key = `${cid}::${pc}`;
  if (cache.has(key)) return cache.get(key);

  try {
    const res = await api.get("/towns/resolve", { params: { countryId: cid, postCode: pc } });
    const d = res.data || {};
    const name = normalizeText(d.name ?? d.Name ?? "");
    const out = name ? { ok: true, name } : { ok: false, name: "", message: "Town not returned." };
    cache.set(key, out);
    return out;
  } catch (e) {
    const status = e?.response?.status;
    const msg =
      e?.response?.data?.message ||
      (status === 404 ? "Town not found for that PostCode." : "Failed to resolve Town for PostCode.");
    const out = { ok: false, name: "", message: msg };
    cache.set(key, out);
    return out;
  }
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
    case "wand":
      return (
        <svg {...common}>
          <path d="M4 20l10-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M14 10l6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M15.5 3.5l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M7 13l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
  const [resolving, setResolving] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, ok: 0, dup: 0, failed: 0 });

  const stopRef = useRef(false);
  const fileInputRef = useRef(null);

  // cache for postcode->town resolves (avoids repeated calls)
  const resolveCacheRef = useRef(new Map());

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
    setResolving(false);
    setImporting(false);
    setProgress({ done: 0, total: 0, ok: 0, dup: 0, failed: 0 });
    stopRef.current = false;
    resolveCacheRef.current = new Map();
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
      const service = enumToInt(map["service"], SERVICE_OPTIONS, 0) || toInt(map["service"], 0);
      const courtType = enumToInt(map["courttype"], COURT_TYPE_OPTIONS, 0) || toInt(map["courttype"], 0);

      const reportNumber = normalizeText(map["reportnumber"]);
      const year = toInt(map["year"], 0);

      const caseNumber = normalizeText(map["casenumber"]) || null;
      const citation = normalizeText(map["citation"]) || null;

      const decisionType = enumToInt(map["decisiontype"], DECISION_OPTIONS, 0) || toInt(map["decisiontype"], 0);
      const caseType = enumToInt(map["casetype"], CASETYPE_OPTIONS, 0) || toInt(map["casetype"], 0);

      const court = normalizeText(map["court"]) || null;

      // ✅ NEW: PostCode preferred, Town optional
      const postCode = normalizeText(map["postcode"]) || null;
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
        postCode, // ✅ send to API
        town, // may be auto-resolved later
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
      if (!countryId) issues.push("CountryId is required.");
      if (!service) issues.push("Service is required.");
      if (!courtType) issues.push("CourtType is required.");
      if (!reportNumber) issues.push("ReportNumber is required.");
      if (!year || year < 1900 || year > 2100) issues.push("Year must be between 1900 and 2100.");
      if (!decisionType) issues.push("DecisionType is required (e.g. 1=Judgment).");
      if (!caseType) issues.push("CaseType is required (e.g. 2=Civil).");
      if (!contentText) issues.push("ContentText is required.");

      // Require at least one location hint
      if (!postCode && !town) issues.push("Provide PostCode (preferred) or Town.");

      if (!isEmpty(decisionDateRaw) && !decisionDate) {
        issues.push("DecisionDate invalid. Use DD-MM-YY (e.g. 18-01-26).");
      }

      return {
        rowNumber: idx + 2,
        payload,
        issues,
        valid: issues.length === 0,
        // internal flags for UI
        resolved: false,
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
      else if (normalized.every((x) => x.valid))
        setInfo(`Loaded ${normalized.length} row(s). You can resolve Towns from PostCodes, then import.`);
      else setInfo(`Loaded ${normalized.length} row(s). Fix invalid rows then re-upload.`);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  // ✅ NEW: Resolve Town for rows that have PostCode but no Town
  async function resolveTownsFromPostCodes() {
    setError("");
    setInfo("");
    stopRef.current = false;

    const candidates = preview.filter(
      (x) => x.valid && normalizeText(x.payload?.postCode) && !normalizeText(x.payload?.town)
    );

    if (!candidates.length) {
      setInfo("Nothing to resolve: either Town is already filled, or PostCode is missing.");
      return;
    }

    const okConfirm = window.confirm(`Resolve Town for ${candidates.length} row(s) using PostCode now?`);
    if (!okConfirm) return;

    setResolving(true);

    // work on a local copy, then set state once (faster UI)
    const updated = preview.map((x) => ({ ...x, payload: { ...x.payload }, issues: [...x.issues] }));

    let resolvedOk = 0;
    let notFound = 0;

    for (let i = 0; i < updated.length; i++) {
      if (stopRef.current) break;

      const item = updated[i];
      const cid = item?.payload?.countryId;
      const pc = item?.payload?.postCode;

      if (!item.valid) continue;
      if (!normalizeText(pc)) continue;
      if (normalizeText(item.payload?.town)) continue;

      const result = await resolveTownByPostCode({
        countryId: cid,
        postCode: pc,
        cache: resolveCacheRef.current,
      });

      // remove any previous resolve errors
      item.issues = item.issues.filter((m) => !String(m).toLowerCase().includes("postcode resolve"));

      if (result.ok) {
        item.payload.town = result.name;
        item.resolved = true;
        resolvedOk++;
      } else {
        item.resolved = false;
        notFound++;
        item.issues.push(`PostCode resolve: ${result.message}`);
        item.valid = false; // make it invalid until fixed
      }
    }

    // recompute valid flags for rows that didn't change
    for (const item of updated) {
      item.valid = item.issues.length === 0;
    }

    setPreview(updated);
    setResolving(false);

    if (stopRef.current) {
      setInfo(`Stopped resolving. Resolved: ${resolvedOk}, unresolved: ${notFound}.`);
      return;
    }

    setInfo(`Resolve complete. Resolved: ${resolvedOk}. Unresolved: ${notFound} (fix PostCode or provide Town).`);
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

    const okConfirm = window.confirm(`Import ${validRows.length} valid row${validRows.length === 1 ? "" : "s"} now?`);
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
      resetAll({ keepInfo: `✅ Import successful. ${ok} case(s) added. Ready for the next file.` });
      return;
    }

    setInfo(`Import finished. OK: ${ok}, duplicates: ${dup}, failed: ${failed}.`);
  }

  function stopAll() {
    stopRef.current = true;
    setInfo("Stopping…");
  }

  return (
    <div className="admin-page admin-page-wide">
      <style>{`
        /* Modern, clean cards + readable font + spacing */
        .la-page { max-width: 1180px; margin: 0 auto; }
        .la-title { font-size: 26px; font-weight: 950; letter-spacing: -0.02em; margin: 0; }
        .la-subtitle { margin: 8px 0 0; font-size: 13px; color: #64748b; font-weight: 700; line-height: 1.5; }

        .la-toolbar { display:flex; gap:12px; align-items:center; justify-content:space-between; margin-bottom: 14px; }
        .la-tools { display:flex; gap:10px; align-items:center; flex-wrap: wrap; justify-content:flex-end; }

        .la-card {
          background:#fff;
          border:1px solid #e5e7eb;
          border-radius:18px;
          padding:16px;
          box-shadow: 0 10px 28px rgba(0,0,0,.06);
        }

        .la-cardHeader { display:flex; align-items:flex-start; justify-content:space-between; gap:14px; }
        .la-chipBar { display:flex; gap:10px; flex-wrap:wrap; margin-top: 10px; }
        .la-chip {
          display:inline-flex; align-items:center; gap:8px;
          padding:9px 12px;
          border-radius:14px;
          border:1px solid #e5e7eb;
          background:#f8fafc;
          color:#0f172a;
          font-weight:800;
          font-size:12px;
          line-height: 1.15;
        }
        .la-chip strong { font-weight: 950; }
        .la-chip.good { background:#ecfdf5; border-color:#a7f3d0; color:#065f46; }
        .la-chip.warn { background:#fff7ed; border-color:#fed7aa; color:#9a3412; }
        .la-chip.bad  { background:#fef2f2; border-color:#fecaca; color:#991b1b; }

        .la-row { display:flex; gap:12px; align-items:stretch; flex-wrap:wrap; }
        .la-col { flex:1; min-width: 320px; }

        .la-stepTitle { font-weight: 950; font-size: 14px; margin: 0; }
        .la-stepSub { margin-top: 6px; color:#64748b; font-size: 12px; font-weight: 750; line-height: 1.45; }

        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }

        .la-icon-btn {
          position: relative;
          display:inline-flex; align-items:center; justify-content:center;
          width: 46px; height: 46px;
          border-radius: 14px;
          border: 1px solid #e5e7eb;
          background: #fff;
          cursor: pointer;
          color: #111827;
          box-shadow: 0 10px 22px rgba(0,0,0,.08);
          transition: transform .08s ease, box-shadow .12s ease, background .12s ease, border-color .12s ease;
        }
        .la-icon-btn:hover { transform: translateY(-1px); box-shadow: 0 16px 28px rgba(0,0,0,.12); background:#fafafa; }
        .la-icon-btn:active { transform: translateY(0px) scale(.98); }
        .la-icon-btn:disabled { opacity: .55; cursor: not-allowed; box-shadow:none; }

        .la-icon-btn.primary { border-color:#c7d2fe; background: #eef2ff; box-shadow: 0 12px 24px rgba(99,102,241,.18); }
        .la-icon-btn.primary:hover { background:#e0e7ff; }

        .la-icon-btn.import { border-color:#bbf7d0; background: #ecfdf5; box-shadow: 0 12px 24px rgba(16,185,129,.16); }
        .la-icon-btn.import:hover { background:#d1fae5; }

        .la-icon-btn.resolve { border-color:#bae6fd; background: #eff6ff; box-shadow: 0 12px 24px rgba(59,130,246,.14); }
        .la-icon-btn.resolve:hover { background:#dbeafe; }

        .la-icon-btn.danger { border-color:#fecaca; background: #fef2f2; box-shadow: 0 12px 24px rgba(239,68,68,.10); }
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
          box-shadow: 0 10px 20px rgba(0,0,0,.14);
        }

        .uploadLabel { display:inline-flex; }

        .tableWrap {
          margin-top: 12px;
          max-height: 60vh;
          overflow:auto;
          border-radius: 14px;
          border:1px solid #e5e7eb;
        }
        table { width:100%; border-collapse: collapse; font-size: 12.5px; }
        thead th {
          position: sticky; top:0; background:#f8fafc; z-index:1;
          text-align:left; padding:10px; border-bottom:1px solid #e5e7eb;
          font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color:#64748b;
          white-space: nowrap;
        }
        tbody td { padding:10px; border-bottom:1px solid #f1f5f9; vertical-align: top; }
        tr.badRow td { background: #fff5f5; }
        tr.goodRow td { background: #f0fdf4; }
        .issues { color:#991b1b; font-weight:900; }
      `}</style>

      <div className="la-page">
        <div className="la-toolbar">
          <div>
            <h1 className="la-title">Admin · LLR Services · Import</h1>
            <p className="la-subtitle">
              Upload a CSV, preview & validate, then import using <b>POST /api/law-reports</b>.{" "}
              <span>
                Date format: <b>DD-MM-YY</b> (e.g. <span className="mono">18-01-26</span>). Location:{" "}
                <b>PostCode</b> (preferred) auto-resolves Town.
              </span>
            </p>
          </div>

          <div className="la-tools">
            <IconButton title="Back to reports list" onClick={goBackToList} disabled={busy || importing || resolving}>
              <Icon name="back" />
            </IconButton>

            <IconButton
              title="Reset page"
              onClick={() => resetAll({ keepInfo: "Reset done. Ready for a new file." })}
              disabled={busy || importing || resolving}
            >
              <Icon name="refresh" />
            </IconButton>

            <IconButton
              title="Download CSV template (includes PostCode)"
              onClick={() => downloadTextFile("llr_import_template.csv", buildTemplateCsv())}
              disabled={busy || importing || resolving}
              tone="primary"
            >
              <Icon name="download" />
            </IconButton>

            <label
              className="uploadLabel"
              title="Choose CSV file"
              style={{ cursor: busy || importing || resolving ? "not-allowed" : "pointer" }}
            >
              <span className="la-icon-btn primary" aria-label="Choose CSV file">
                <Icon name="upload" />
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: "none" }}
                disabled={busy || importing || resolving}
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
                  className="la-icon-btn resolve"
                  title={resolving ? "Resolving Towns…" : "Resolve Town from PostCode for rows missing Town"}
                  aria-label="Resolve Town from PostCode"
                  onClick={resolveTownsFromPostCodes}
                  disabled={busy || importing || resolving || counts.total === 0}
                >
                  <Icon name="wand" />
                </button>

                <button
                  type="button"
                  className="la-icon-btn import"
                  title={importHint}
                  aria-label={importHint}
                  onClick={startImport}
                  disabled={busy || importing || resolving || counts.valid === 0}
                >
                  <Icon name="import" />
                  {counts.valid > 0 ? <span className="la-btn-badge">{counts.valid}</span> : null}
                </button>

                {(importing || resolving) && (
                  <IconButton title="Stop" onClick={stopAll} disabled={busy} tone="danger">
                    <Icon name="stop" />
                  </IconButton>
                )}
              </>
            )}
          </div>
        </div>

        {(error || info) && <div className={`admin-alert ${error ? "error" : "ok"}`}>{error || info}</div>}

        <div className="la-row" style={{ marginBottom: 14 }}>
          <div className="la-card la-col">
            <div className="la-cardHeader">
              <div>
                <div className="la-stepTitle">Step 1 — Template</div>
                <div className="la-stepSub">
                  1) Download the template. 2) Fill it. 3) Upload it.
                  <br />
                  Location: use <b>PostCode</b> (preferred). Town can be blank and will be resolved.
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

          <div className="la-card la-col">
            <div className="la-cardHeader">
              <div>
                <div className="la-stepTitle">Step 2 — Upload & Preview</div>
                <div className="la-stepSub">
                  Upload a CSV to see preview & validation.
                  <br />
                  Then click the <b>wand</b> to auto-resolve Town from PostCode (only where Town is missing).
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
            </div>

            {fileName && (
              <div className="la-stepSub" style={{ marginTop: 10 }}>
                File: <b>{fileName}</b>
              </div>
            )}
          </div>
        </div>

        <div className="la-card">
          <div className="la-cardHeader">
            <div>
              <div className="la-stepTitle">Step 3 — Import</div>
              <div className="la-stepSub">
                Imports only valid rows. Duplicates return <b>409</b>.
                <br />
                If import finishes with <b>no duplicates and no failures</b>, the page resets automatically.
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
            <div className="la-stepSub" style={{ marginTop: 12 }}>
              Upload a CSV to see the preview here.
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
                      <th className="mono">PostCode</th>
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
                      const isGood = p.valid && (p.resolved || normalizeText(pay.town));
                      return (
                        <tr key={p.rowNumber} className={!p.valid ? "badRow" : isGood ? "goodRow" : ""}>
                          <td className="mono">{p.rowNumber}</td>
                          <td className="mono">{pay.reportNumber || "—"}</td>
                          <td className="mono">{pay.year || "—"}</td>
                          <td className="mono">{pay.countryId || "—"}</td>
                          <td>{labelFrom(SERVICE_OPTIONS, pay.service)}</td>
                          <td>{labelFrom(COURT_TYPE_OPTIONS, pay.courtType)}</td>
                          <td className="mono">{pay.postCode || "—"}</td>
                          <td>{pay.town || "—"}</td>
                          <td>{labelFrom(DECISION_OPTIONS, pay.decisionType)}</td>
                          <td>{labelFrom(CASETYPE_OPTIONS, pay.caseType)}</td>
                          <td className="mono">{pay.caseNumber || "—"}</td>
                          <td className="mono">{pay.citation || "—"}</td>
                          <td className="mono">{pay.decisionDate ? isoToDdMmYy(pay.decisionDate) : "—"}</td>
                          <td className="issues">{p.issues.join(" ")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {preview.length > 500 && (
                <div className="la-stepSub" style={{ marginTop: 8 }}>
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
              Tip: Use <b>PostCode</b> and click the <b>wand</b> to auto-fill Town. Date format:{" "}
              <b>DD-MM-YY</b> (e.g. <span className="mono">18-01-26</span>).
            </span>
          }
        />
      </div>
    </div>
  );
}
