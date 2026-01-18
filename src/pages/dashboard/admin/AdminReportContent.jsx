import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import api from "../../../api/client";

import { CKEditor } from "@ckeditor/ckeditor5-react";
import ClassicEditor from "@ckeditor/ckeditor5-build-classic";

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

function dateInputFromIso(iso) {
  if (!iso) return "";
  try {
    return String(iso).slice(0, 10);
  } catch {
    return "";
  }
}

function isoOrNullFromDateInput(yyyyMmDd) {
  const s = String(yyyyMmDd || "").trim();
  if (!s) return null;
  const d = new Date(`${s}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function pickReportIdFromParams(params) {
  const raw =
    params?.id ??
    params?.reportId ??
    params?.lawReportId ??
    params?.lawreportid ??
    null;

  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
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

/* =========================
   Inline SVG Icons (no deps)
========================= */
function Icon({ name }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", xmlns: "http://www.w3.org/2000/svg" };

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
    case "save":
      return (
        <svg {...common}>
          <path
            d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M17 21v-8H7v8" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M7 3v5h8" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
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

export default function AdminReportContent() {
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const initialTitle = location.state?.title || "";
  const reportId = useMemo(() => pickReportIdFromParams(params), [params]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [dto, setDto] = useState(null);

  const [contentHtml, setContentHtml] = useState("");
  const [title, setTitle] = useState(initialTitle);
  const [legalDocumentId, setLegalDocumentId] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);

  async function load() {
    setLoading(true);
    setError("");
    setInfo("");

    try {
      const res = await api.get(`/law-reports/${reportId}`);
      const d = res.data;

      setDto(d);
      setTitle(pick(d, ["title", "Title"], "") || initialTitle || `Report #${reportId}`);
      setLegalDocumentId(pick(d, ["legalDocumentId", "LegalDocumentId"], null));

      setContentHtml(pick(d, ["contentText", "ContentText"], "") ?? "");
      setLastSavedAt(pick(d, ["updatedAt", "UpdatedAt"], null));
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to load report."));
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!dto) return;

    setSaving(true);
    setError("");
    setInfo("");

    try {
      // ✅ robust casing + enum handling
      const decisionType = enumToInt(pick(dto, ["decisionType", "DecisionType"], 1), DECISION_OPTIONS, 1);
      const caseType = enumToInt(pick(dto, ["caseType", "CaseType"], 2), CASETYPE_OPTIONS, 2);
      const service = enumToInt(pick(dto, ["service", "Service"], 1), SERVICE_OPTIONS, 1);

      const payload = {
        category: 6,
        countryId: pick(dto, ["countryId", "CountryId"], 0) ?? 0,
        service,

        citation: pick(dto, ["citation", "Citation"], null),
        reportNumber: String(pick(dto, ["reportNumber", "ReportNumber"], "") || "").trim(),
        year: pick(dto, ["year", "Year"], new Date().getUTCFullYear()),
        caseNumber: pick(dto, ["caseNumber", "CaseNumber"], null),

        decisionType,
        caseType,

        court: pick(dto, ["court", "Court"], null),
        parties: pick(dto, ["parties", "Parties"], null),
        judges: pick(dto, ["judges", "Judges"], null),
        decisionDate: isoOrNullFromDateInput(dateInputFromIso(pick(dto, ["decisionDate", "DecisionDate"], null))),

        contentText: String(contentHtml ?? ""),
      };

      if (!payload.countryId || payload.countryId <= 0) {
        throw new Error("Country is missing. Go back and Edit the report to set Country.");
      }
      if (!payload.reportNumber) {
        throw new Error("ReportNumber is missing. Go back and Edit the report to set it.");
      }
      if (!payload.contentText.trim()) {
        throw new Error("Content is required.");
      }

      await api.put(`/law-reports/${reportId}`, payload);

      const nowIso = new Date().toISOString();
      setLastSavedAt(nowIso);
      setInfo("Saved.");
      await load();
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to save report content."));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!reportId) {
      setError("Invalid report id in the link.");
      setLoading(false);
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId]);

  // ✅ Decision/case labels from DB (robust casing)
  const decisionLabel = dto ? labelFrom(DECISION_OPTIONS, pick(dto, ["decisionType", "DecisionType"], null)) : "—";
  const caseLabel = dto ? labelFrom(CASETYPE_OPTIONS, pick(dto, ["caseType", "CaseType"], null)) : "—";

  return (
    <div className="admin-page admin-page-wide">
      <style>{`
        .rc-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; }
        .rc-title { font-size: 22px; font-weight: 900; margin: 0; }
        .rc-sub { color:#6b7280; margin-top:6px; font-size: 13px; font-weight: 700; }
        .rc-actions { display:flex; gap:10px; align-items:center; flex-wrap:nowrap; }
        .rc-card { margin-top: 14px; border-radius: 16px; border: 1px solid #e5e7eb; background: #fff; overflow: hidden; }
        .rc-meta { display:flex; gap:10px; flex-wrap:wrap; padding: 12px 14px; background: #fafafa; border-bottom: 1px solid #e5e7eb; color:#374151; font-weight: 800; font-size: 12px; }
        .rc-pill { display:inline-flex; align-items:center; gap:8px; border: 1px solid #e5e7eb; background:#fff; padding: 6px 10px; border-radius: 999px; }
        .rc-editor-wrap { padding: 14px; }
        .ck-editor__editable_inline { min-height: 68vh; }

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
        .la-icon-btn.success { border-color:#bbf7d0; }
        .la-icon-btn.success:hover { background:#f0fdf4; }
      `}</style>

      <div className="rc-head">
        <div>
          <h1 className="rc-title">Report Content</h1>
          <div className="rc-sub">{title ? title : "—"}</div>

          <div className="rc-sub" style={{ marginTop: 8 }}>
            LawReportId: <b>{reportId ?? "—"}</b>
            {legalDocumentId ? (
              <>
                {" "}
                · LegalDocumentId: <b>{legalDocumentId}</b>
              </>
            ) : null}
          </div>
        </div>

        {/* ✅ small icon buttons in one row */}
        <div className="rc-actions">
          <IconButton title="Back" onClick={() => navigate(-1)} disabled={saving}>
            <Icon name="back" />
          </IconButton>

          <IconButton title="Refresh" onClick={load} disabled={loading || saving} tone="primary">
            <Icon name="refresh" />
          </IconButton>

          <IconButton title="Save" onClick={save} disabled={loading || saving} tone="success">
            <Icon name="save" />
          </IconButton>
        </div>
      </div>

      {(error || info) && <div className={`admin-alert ${error ? "error" : "ok"}`}>{error || info}</div>}

      <div className="rc-card">
        <div className="rc-meta">
          <span className="rc-pill">Format: <b>Rich text (HTML)</b></span>
          <span className="rc-pill">Decision: <b>{decisionLabel}</b></span>
          <span className="rc-pill">Case type: <b>{caseLabel}</b></span>
          <span className="rc-pill">
            Last saved: <b>{lastSavedAt ? new Date(lastSavedAt).toLocaleString() : "—"}</b>
          </span>
          <span className="rc-pill">Tip: paste from Word, then use “Remove format” if needed</span>
        </div>

        <div className="rc-editor-wrap">
          {loading ? (
            <div style={{ padding: 14, color: "#6b7280", fontWeight: 800 }}>Loading…</div>
          ) : (
            <CKEditor
              editor={ClassicEditor}
              data={contentHtml}
              disabled={saving}
              onChange={(event, editor) => {
                const data = editor.getData();
                setContentHtml(data);
              }}
              config={{
                toolbar: [
                  "heading",
                  "|",
                  "bold",
                  "italic",
                  "link",
                  "bulletedList",
                  "numberedList",
                  "|",
                  "blockQuote",
                  "insertTable",
                  "|",
                  "undo",
                  "redo",
                ],
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
