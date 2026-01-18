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

  // ISO / Date-parseable
  const d0 = new Date(s);
  if (Number.isFinite(d0.getTime())) return d0.toISOString();

  // DD-MM-YY
  const ddmmyy = s.match(/^(\d{2})-(\d{2})-(\d{2})$/);
  if (ddmmyy) {
    const dd = Number(ddmmyy[1]);
    const mm = Number(ddmmyy[2]);
    const yy = Number(ddmmyy[3]);
    const yyyy = 2000 + yy;

    const dt = new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0, 0));
    if (!Number.isFinite(dt.getTime())) return null;
    if (dt.getUTCFullYear() !== yyyy || dt.getUTCMonth() + 1 !== mm || dt.getUTCDate() !== dd)
      return null;

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
    if (dt.getUTCFullYear() !== yyyy || dt.getUTCMonth() + 1 !== mm || dt.getUTCDate() !== dd)
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
   ✅ includes PostCode, Town optional
========================= */
const TEMPLATE_HEADERS = [
  "CountryId",
  "Service",
  "CourtType",
  "PostCode",
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
    PostCode: "50100",
    Town: "", // optional; will be resolved from PostCode
    ReportNumber: "HOK045",
    Year: 2013,
    CaseNumber: "045/2013",
    Citation: "", // ✅ allowed blank (server auto-generates) but DecisionDate must exist
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
   UI: icons (tiny)
========================= */
function SmallIcon({ name }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg" };
  switch (name) {
    case "back":
      return (
        <svg {...common}>
          <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
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
    case "import":
      return (
        <svg {...common}>
          <path d="M12 3v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M7 8l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 21h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "x":
      return (
        <svg {...common}>
          <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}

function Pill({ tone = "neutral", children }) {
  return <span className={`la-pill ${tone}`}>{children}</span>;
}

function ActionTile({ title, subtitle, icon, onClick, disabled, tone = "neutral", right }) {
  return (
    <button type="button" className={`la-tile ${tone}`} onClick={onClick} disabled={disabled}>
      <div className="la-tile-left">
        <span className="la-tile-icon">{icon}</span>
        <div>
          <div className="la-tile-title">{title}</div>
          <div className="la-tile-sub">{subtitle}</div>
        </div>
      </div>
      <div className="la-tile-right">{right}</div>
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
  const [resolving, setResolving] = useState(false);
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
  const resolveCacheRef = useRef(new Map());

  const counts = useMemo(() => {
    const total = preview.length;
    const valid = preview.filter((x) => x.valid).length;
    const invalid = total - valid;
    return { total, valid, invalid };
  }, [preview]);

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

      const postCode = normalizeText(map["postcode"]) || null;
      const town = normalizeText(map["town"]) || null;

      const parties = normalizeText(map["parties"]) || null;
      const judges = normalizeText(map["judges"]) || null;

      const decisionDateRaw = map["decisiondate"];
      const decisionDate = parseDateToIsoOrNull(decisionDateRaw);

      const contentText = String(map["contenttext"] ?? "").trim();

      // ✅ IMPORTANT: bulk endpoint expects TownPostCode + Town
      const payload = {
        category: 6,
        countryId,
        service,
        courtType,
        townPostCode: postCode, // ✅ maps to dto.TownPostCode
        town, // free text fallback/override
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
      if (!year || year < 1900 || year > 2100) issues.push("Year must be between 1900 and 2100.");
      if (!decisionType) issues.push("DecisionType is required.");
      if (!caseType) issues.push("CaseType is required.");
      if (!contentText) issues.push("ContentText is required.");

      // At least one location hint
      if (!postCode && !town) issues.push("Provide PostCode (preferred) or Town.");

      if (!isEmpty(decisionDateRaw) && !decisionDate) {
        issues.push("DecisionDate invalid. Use DD-MM-YY (e.g. 18-01-26).");
      }

      // If citation blank, DecisionDate must exist (server rule)
      if (!citation && !decisionDate) {
        issues.push("If Citation is blank, DecisionDate must be provided (for citation year).");
      }

      return {
        rowNumber: idx + 2,
        payload,
        issues,
        valid: issues.length === 0,
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
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });

      if (parsed.errors?.length) {
        setError(`CSV parse error: ${parsed.errors[0]?.message || "Unknown error"}`);
        return;
      }

      const rows = Array.isArray(parsed.data) ? parsed.data : [];
      const normalized = normalizeCsvRows(rows);
      setPreview(normalized);

      if (normalized.length === 0) setInfo("No rows found in the file.");
      else if (normalized.every((x) => x.valid)) setInfo(`Loaded ${normalized.length} row(s). Ready for bulk import.`);
      else setInfo(`Loaded ${normalized.length} row(s). Fix invalid rows then re-upload.`);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function resolveTownsFromPostCodes() {
    setError("");
    setInfo("");
    stopRef.current = false;

    const candidates = preview.filter(
      (x) => x.valid && normalizeText(x.payload?.townPostCode) && !normalizeText(x.payload?.town)
    );

    if (!candidates.length) {
      setInfo("Nothing to resolve: Town is already filled or PostCode is missing.");
      return;
    }

    const okConfirm = window.confirm(`Resolve Town for ${candidates.length} row(s) using PostCode now?`);
    if (!okConfirm) return;

    setResolving(true);

    const updated = preview.map((x) => ({ ...x, payload: { ...x.payload }, issues: [...x.issues] }));

    let resolvedOk = 0;
    let notFound = 0;

    for (let i = 0; i < updated.length; i++) {
      if (stopRef.current) break;

      const item = updated[i];
      const cid = item?.payload?.countryId;
      const pc = item?.payload?.townPostCode;

      if (!item.valid) continue;
      if (!normalizeText(pc)) continue;
      if (normalizeText(item.payload?.town)) continue;

      const result = await resolveTownByPostCode({
        countryId: cid,
        postCode: pc,
        cache: resolveCacheRef.current,
      });

      item.issues = item.issues.filter((m) => !String(m).toLowerCase().includes("postcode resolve"));

      if (result.ok) {
        item.payload.town = result.name;
        item.resolved = true;
        resolvedOk++;
      } else {
        item.resolved = false;
        notFound++;
        item.issues.push(`PostCode resolve: ${result.message}`);
      }

      // refresh validity
      item.valid = item.issues.length === 0;
    }

    // re-evaluate all
    for (const item of updated) item.valid = item.issues.length === 0;

    setPreview(updated);
    setResolving(false);

    if (stopRef.current) {
      setInfo(`Stopped resolving. Resolved: ${resolvedOk}, unresolved: ${notFound}.`);
      return;
    }
    setInfo(`Resolve complete. Resolved: ${resolvedOk}. Unresolved: ${notFound}.`);
  }

  async function startBulkImport() {
    setError("");
    setInfo("");
    stopRef.current = false;

    const validRows = preview.filter((x) => x.valid);
    if (!validRows.length) {
      setError("No valid rows to import. Fix the CSV first.");
      return;
    }

    const okConfirm = window.confirm(
      `Bulk import ${validRows.length} valid row${validRows.length === 1 ? "" : "s"} now?`
    );
    if (!okConfirm) return;

    setImporting(true);
    setProgress({ done: 0, total: validRows.length, ok: 0, dup: 0, failed: 0 });

    try {
      // ✅ Bulk endpoint
      const payload = {
        items: validRows.map((x) => x.payload),
        batchSize: 200,
        stopOnError: false,
        dryRun: false,
      };

      const res = await api.post("/law-reports/import", payload);
      const data = res?.data || {};

      // We treat server response as source of truth
      const created = toInt(data.created, 0);
      const duplicates = toInt(data.duplicates, 0);
      const failed = toInt(data.failed, 0);

      setProgress({
        done: validRows.length,
        total: validRows.length,
        ok: created,
        dup: duplicates,
        failed,
      });

      if (failed === 0 && duplicates === 0) {
        resetAll({ keepInfo: `✅ Import successful. ${created} case(s) added. Ready for the next file.` });
        return;
      }

      setInfo(`Import finished. Created: ${created}, duplicates: ${duplicates}, failed: ${failed}.`);
    } catch (e) {
      const msg = e?.response?.data?.message || String(e?.message || e);
      setError(msg);
    } finally {
      setImporting(false);
    }
  }

  function stopAll() {
    stopRef.current = true;
    setInfo("Stopping…");
  }

  const disabledAll = busy || resolving || importing;

  return (
    <div className="admin-page admin-page-wide">
      <style>{`
        /* =========================
           Signup-like layout system
        ========================= */
        .la-wrap {
          max-width: 1120px;
          margin: 0 auto;
          padding: 18px 10px 24px;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif;
        }

        .la-topbar {
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:12px;
          margin-bottom: 14px;
        }

        .la-h1 {
          font-size: 28px;
          font-weight: 950;
          letter-spacing: -0.02em;
          margin: 0;
          color: #0f172a;
        }
        .la-sub {
          margin: 6px 0 0;
          font-size: 13px;
          color: #64748b;
          font-weight: 650;
          line-height: 1.55;
        }

        .la-top-actions {
          display:flex;
          align-items:center;
          gap:10px;
          flex-wrap:wrap;
          justify-content:flex-end;
        }

        .la-ghost {
          display:inline-flex;
          align-items:center;
          gap:8px;
          height: 40px;
          padding: 0 12px;
          border-radius: 14px;
          border: 1px solid #e5e7eb;
          background: #fff;
          color:#0f172a;
          font-weight: 850;
          cursor:pointer;
          box-shadow: 0 10px 22px rgba(0,0,0,.06);
          transition: transform .08s ease, box-shadow .12s ease;
        }
        .la-ghost:hover { transform: translateY(-1px); box-shadow: 0 16px 28px rgba(0,0,0,.10); }
        .la-ghost:disabled { opacity:.55; cursor:not-allowed; box-shadow:none; transform:none; }

        .la-card {
          background:#fff;
          border:1px solid #e5e7eb;
          border-radius: 22px;
          box-shadow: 0 18px 44px rgba(0,0,0,.08);
          overflow:hidden;
        }

        .la-cardHead {
          padding: 18px 18px 14px;
          border-bottom: 1px solid #f1f5f9;
          background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
        }

        .la-headRow {
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:14px;
          flex-wrap:wrap;
        }

        .la-badges {
          display:flex;
          gap:10px;
          align-items:center;
          flex-wrap:wrap;
        }

        .la-pill {
          display:inline-flex;
          align-items:center;
          gap:8px;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid #e5e7eb;
          background:#fff;
          font-size: 12px;
          font-weight: 900;
          color:#0f172a;
          box-shadow: 0 10px 18px rgba(0,0,0,.05);
          white-space: nowrap;
        }
        .la-pill.good { background:#ecfdf5; border-color:#a7f3d0; color:#065f46; }
        .la-pill.warn { background:#fff7ed; border-color:#fed7aa; color:#9a3412; }
        .la-pill.bad  { background:#fef2f2; border-color:#fecaca; color:#991b1b; }
        .la-pill.neutral { background:#f8fafc; border-color:#e5e7eb; color:#0f172a; }

        .la-body {
          padding: 18px;
        }

        .la-grid {
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        @media (max-width: 980px) {
          .la-grid { grid-template-columns: 1fr; }
        }

        .la-section {
          border: 1px solid #eef2f7;
          border-radius: 18px;
          padding: 14px;
          background: #fff;
        }
        .la-sectionTitle {
          font-weight: 950;
          font-size: 14px;
          margin: 0;
          color:#0f172a;
        }
        .la-sectionSub {
          margin-top: 6px;
          font-size: 12px;
          color:#64748b;
          font-weight: 650;
          line-height: 1.55;
        }

        .la-tiles {
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 12px;
        }
        @media (max-width: 980px) {
          .la-tiles { grid-template-columns: 1fr; }
        }

        .la-tile {
          width: 100%;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          padding: 12px 12px;
          border-radius: 18px;
          border: 1px solid #e5e7eb;
          background: #fff;
          cursor:pointer;
          text-align:left;
          box-shadow: 0 14px 30px rgba(0,0,0,.06);
          transition: transform .08s ease, box-shadow .12s ease, background .12s ease;
        }
        .la-tile:hover { transform: translateY(-1px); box-shadow: 0 18px 38px rgba(0,0,0,.10); background:#fbfbfb; }
        .la-tile:disabled { opacity:.55; cursor:not-allowed; box-shadow:none; transform:none; }
        .la-tile-left { display:flex; gap:12px; align-items:flex-start; }
        .la-tile-icon {
          width: 40px; height: 40px;
          border-radius: 14px;
          display:flex; align-items:center; justify-content:center;
          border: 1px solid #e5e7eb;
          background:#f8fafc;
          color:#0f172a;
          flex: 0 0 auto;
        }
        .la-tile-title { font-weight: 950; color:#0f172a; font-size: 13px; }
        .la-tile-sub { margin-top: 3px; font-size: 12px; color:#64748b; font-weight: 650; line-height: 1.35; }
        .la-tile-right { display:flex; align-items:center; gap:10px; }

        .la-tile.primary { border-color:#c7d2fe; background:#eef2ff; }
        .la-tile.primary .la-tile-icon { border-color:#c7d2fe; background:#e0e7ff; }
        .la-tile.success { border-color:#bbf7d0; background:#ecfdf5; }
        .la-tile.success .la-tile-icon { border-color:#bbf7d0; background:#d1fae5; }
        .la-tile.info { border-color:#bae6fd; background:#eff6ff; }
        .la-tile.info .la-tile-icon { border-color:#bae6fd; background:#dbeafe; }

        .la-fileRow {
          margin-top: 10px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:10px;
          flex-wrap:wrap;
        }

        .la-fileTag {
          display:inline-flex;
          align-items:center;
          gap:8px;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px dashed #cbd5e1;
          background:#f8fafc;
          color:#0f172a;
          font-weight: 850;
          font-size: 12px;
        }

        .la-alert {
          margin-top: 12px;
          border-radius: 16px;
          padding: 12px 12px;
          font-weight: 800;
          font-size: 13px;
          border: 1px solid #e5e7eb;
          background: #f8fafc;
          color:#0f172a;
        }
        .la-alert.error {
          background:#fef2f2;
          border-color:#fecaca;
          color:#991b1b;
        }
        .la-alert.ok {
          background:#ecfdf5;
          border-color:#a7f3d0;
          color:#065f46;
        }

        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }

        .la-tableWrap {
          margin-top: 14px;
          border: 1px solid #e5e7eb;
          border-radius: 18px;
          overflow: hidden;
          background:#fff;
        }
        .la-tableTop {
          padding: 12px 12px;
          border-bottom: 1px solid #f1f5f9;
          display:flex;
          justify-content:space-between;
          gap:10px;
          flex-wrap:wrap;
          background:#fbfdff;
        }
        .la-table {
          width:100%;
          border-collapse: collapse;
          font-size: 12.5px;
        }
        .la-table thead th {
          text-align:left;
          padding: 10px 12px;
          border-bottom: 1px solid #e5e7eb;
          background:#f8fafc;
          position: sticky;
          top: 0;
          z-index: 1;
          font-size: 11px;
          letter-spacing: .06em;
          text-transform: uppercase;
          color:#64748b;
          white-space: nowrap;
        }
        .la-table tbody td {
          padding: 10px 12px;
          border-bottom: 1px solid #f1f5f9;
          vertical-align: top;
        }
        .badRow td { background:#fff5f5; }
        .issues { color:#991b1b; font-weight: 900; }
        .goodHint { color:#065f46; font-weight: 900; }

        .la-footHint {
          margin-top: 10px;
          color:#64748b;
          font-size: 12px;
          font-weight: 650;
        }
      `}</style>

      <div className="la-wrap">
        <div className="la-topbar">
          <div>
            <h1 className="la-h1">Admin · LLR Services · Import</h1>
            <p className="la-sub">
              Upload CSV → preview/validate → optionally resolve Town via PostCode → bulk import using{" "}
              <b>POST /api/law-reports/import</b>. Date format: <b>DD-MM-YY</b>.
            </p>
          </div>

          <div className="la-top-actions">
            <button className="la-ghost" onClick={goBackToList} disabled={disabledAll} type="button">
              <SmallIcon name="back" /> Back
            </button>
            <button
              className="la-ghost"
              onClick={() => resetAll({ keepInfo: "Reset done. Ready for a new file." })}
              disabled={disabledAll}
              type="button"
            >
              <SmallIcon name="x" /> Reset
            </button>
          </div>
        </div>

        <div className="la-card">
          <div className="la-cardHead">
            <div className="la-headRow">
              <div>
                <div style={{ fontWeight: 950, fontSize: 14, color: "#0f172a" }}>
                  Import dashboard
                </div>
                <div className="la-sectionSub" style={{ marginTop: 6 }}>
                  <b>PostCode</b> is preferred and can auto-resolve Town. <b>Citation can be blank</b> (server auto-generates),
                  but <b>DecisionDate must exist</b>.
                </div>
              </div>

              <div className="la-badges">
                <Pill tone="neutral">
                  <b>{counts.total}</b>&nbsp;rows
                </Pill>
                <Pill tone={counts.valid ? "good" : "neutral"}>
                  <b>{counts.valid}</b>&nbsp;valid
                </Pill>
                <Pill tone={counts.invalid ? "bad" : "neutral"}>
                  <b>{counts.invalid}</b>&nbsp;invalid
                </Pill>
                <Pill tone="good">
                  <b>{progress.ok}</b>&nbsp;Created
                </Pill>
                <Pill tone="warn">
                  <b>{progress.dup}</b>&nbsp;Duplicates
                </Pill>
                <Pill tone="bad">
                  <b>{progress.failed}</b>&nbsp;Failed
                </Pill>
              </div>
            </div>

            {(error || info) && <div className={`la-alert ${error ? "error" : "ok"}`}>{error || info}</div>}
          </div>

          <div className="la-body">
            <div className="la-grid">
              <div className="la-section">
                <h3 className="la-sectionTitle">Template & actions</h3>
                <div className="la-sectionSub">
                  Download the template, fill it, then upload it. Use numeric enums for best results.
                </div>

                <div className="la-tiles">
                  <ActionTile
                    tone="primary"
                    title="Download template"
                    subtitle="CSV includes PostCode + optional Town"
                    icon={<SmallIcon name="download" />}
                    onClick={() => downloadTextFile("llr_import_template.csv", buildTemplateCsv())}
                    disabled={disabledAll}
                    right={<Pill tone="neutral">CSV</Pill>}
                  />

                  <ActionTile
                    tone="primary"
                    title={fileName ? "Replace CSV" : "Upload CSV"}
                    subtitle="Loads preview + validation"
                    icon={<SmallIcon name="upload" />}
                    disabled={disabledAll}
                    onClick={() => fileInputRef.current?.click()}
                    right={<Pill tone="neutral">{fileName ? "Loaded" : "Choose file"}</Pill>}
                  />
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  style={{ display: "none" }}
                  disabled={disabledAll}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />

                <div className="la-fileRow">
                  <span className="la-fileTag">
                    File: <span style={{ fontWeight: 950 }}>{fileName || "No file loaded"}</span>
                  </span>

                  <span className="la-sectionSub" style={{ marginTop: 0 }}>
                    Date: <span className="mono">DD-MM-YY</span> (e.g. <span className="mono">18-01-26</span>)
                  </span>
                </div>

                <div className="la-footHint">
                  Enums: DecisionType {DECISION_OPTIONS.map((x) => `${x.value}=${x.label}`).join(", ")} · CaseType{" "}
                  {CASETYPE_OPTIONS.map((x) => `${x.value}=${x.label}`).join(", ")} · CourtType{" "}
                  {COURT_TYPE_OPTIONS.map((x) => `${x.value}=${x.label}`).join(", ")}
                </div>
              </div>

              <div className="la-section">
                <h3 className="la-sectionTitle">Resolve & bulk import</h3>
                <div className="la-sectionSub">
                  Optional: resolve Town from PostCode for rows where Town is blank. Then bulk import (fast).
                </div>

                <div className="la-tiles">
                  <ActionTile
                    tone="info"
                    title="Resolve Town (optional)"
                    subtitle="Uses /api/towns/resolve"
                    icon={<SmallIcon name="wand" />}
                    onClick={resolveTownsFromPostCodes}
                    disabled={disabledAll || !preview.length}
                    right={<Pill tone="neutral">Wand</Pill>}
                  />

                  <ActionTile
                    tone="success"
                    title="Bulk import"
                    subtitle="Uses POST /api/law-reports/import"
                    icon={<SmallIcon name="import" />}
                    onClick={startBulkImport}
                    disabled={disabledAll || counts.valid === 0}
                    right={<Pill tone={counts.valid ? "good" : "neutral"}>{counts.valid} valid</Pill>}
                  />
                </div>

                {(resolving || importing) && (
                  <div style={{ marginTop: 12 }}>
                    <button className="la-ghost" onClick={stopAll} type="button">
                      <SmallIcon name="x" /> Stop
                    </button>
                  </div>
                )}

                <div className="la-footHint">
                  If <b>Citation</b> is blank, <b>DecisionDate</b> must exist (server uses it for citation year).
                </div>
              </div>
            </div>

            <div className="la-tableWrap">
              <div className="la-tableTop">
                <div style={{ fontWeight: 950, color: "#0f172a" }}>Preview (first 500 rows)</div>
                <div className="la-sectionSub" style={{ marginTop: 0 }}>
                  Invalid rows show exact issues. Fix CSV then re-upload.
                </div>
              </div>

              {preview.length === 0 ? (
                <div style={{ padding: 14, color: "#64748b", fontWeight: 650 }}>
                  Upload a CSV to see the preview here.
                </div>
              ) : (
                <div style={{ maxHeight: "60vh", overflow: "auto" }}>
                  <table className="la-table">
                    <thead>
                      <tr>
                        <th className="mono">Row</th>
                        <th className="mono">Report</th>
                        <th className="mono">Year</th>
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
                        const okTown = normalizeText(pay.town) ? "Resolved" : "—";
                        return (
                          <tr key={p.rowNumber} className={!p.valid ? "badRow" : ""}>
                            <td className="mono">{p.rowNumber}</td>
                            <td className="mono">{pay.reportNumber || "—"}</td>
                            <td className="mono">{pay.year || "—"}</td>
                            <td className="mono">{pay.countryId || "—"}</td>
                            <td>{labelFrom(SERVICE_OPTIONS, pay.service)}</td>
                            <td>{labelFrom(COURT_TYPE_OPTIONS, pay.courtType)}</td>
                            <td className="mono">{pay.townPostCode || "—"}</td>
                            <td>
                              {pay.town || "—"}{" "}
                              {pay.town ? <span className="goodHint">({okTown})</span> : null}
                            </td>
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
              )}
            </div>

            {preview.length > 500 && (
              <div className="la-footHint">Showing first 500 rows. Bulk import uses all valid rows.</div>
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
              Tip: Use <b>PostCode</b> to auto-fill Town. If <b>Citation</b> is blank, <b>DecisionDate</b> must be present.
            </span>
          }
        />
      </div>
    </div>
  );
}
