// src/pages/dashboard/admin/AdminLLRServices.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../../api/client";
import "../../../styles/adminCrud.css";
import AdminPageFooter from "../../../components/AdminPageFooter";
import ReportTiptapEditor from "../../../components/editor/ReportTiptapEditor";

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
 * - enum name ("LawAfricaLawReports_LLR") etc (we try match label by contains)
 */
function enumToInt(value, options, fallback = 0) {
  if (value === null || value === undefined) return fallback;

  if (typeof value === "number") return toInt(value, fallback);

  const s = String(value).trim();
  if (!s) return fallback;

  const asNum = Number(s);
  if (Number.isFinite(asNum)) return Math.floor(asNum);

  const hit = options.find((o) => o.label.toLowerCase() === s.toLowerCase());
  if (hit) return hit.value;

  const hit2 = options.find((o) => s.toLowerCase().includes(o.label.toLowerCase()));
  return hit2 ? hit2.value : fallback;
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

function normalizeText(v) {
  const s = String(v ?? "").trim();
  return s ? s : "";
}

function htmlLooksEmpty(html) {
  const s = String(html ?? "").trim();
  if (!s) return true;

  const text = s
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return !text;
}

function safeDefaultHtml(value) {
  const v = String(value ?? "").trim();
  return v ? v : "<p></p>";
}

function normalizeLightList(resData) {
  const d = resData?.data ?? resData;
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") {
    const arr = d.items ?? d.results ?? d.data ?? d.value ?? d.contentProducts ?? d.products ?? null;
    return Array.isArray(arr) ? arr : [];
  }
  return [];
}

function normalizeProductRow(x) {
  const id = pick(x, ["id", "Id"], null);
  const name = normalizeText(pick(x, ["name", "Name", "title", "Title"], ""));
  const code = normalizeText(pick(x, ["code", "Code", "slug", "Slug"], ""));
  return {
    id: id == null ? null : toInt(id, 0),
    name,
    code,
  };
}

function formatIsoDateShort(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return String(iso).slice(0, 10);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
  } catch {
    return String(iso).slice(0, 10);
  }
}

function sortValue(v) {
  if (v === null || v === undefined) return "";
  return typeof v === "string" ? v.toLowerCase() : String(v).toLowerCase();
}

function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let val = n;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  const dp = i === 0 ? 0 : i === 1 ? 0 : 1;
  return `${val.toFixed(dp)} ${units[i]}`;
}

function tryGetFilenameFromContentDisposition(cd) {
  const s = String(cd || "");
  if (!s) return "";
  // filename*=UTF-8''... OR filename="..."
  const m1 = s.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (m1?.[1]) {
    try {
      return decodeURIComponent(m1[1].trim().replace(/^"(.*)"$/, "$1"));
    } catch {
      return m1[1].trim().replace(/^"(.*)"$/, "$1");
    }
  }
  const m2 = s.match(/filename\s*=\s*([^;]+)/i);
  if (m2?.[1]) return m2[1].trim().replace(/^"(.*)"$/, "$1");
  return "";
}

/* =========================
   Options
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

// LEGACY CourtType options (enum-backed) — keep for older records only
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
          <path d="M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z" stroke="currentColor" strokeWidth="2" />
          <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "edit":
      return (
        <svg {...common}>
          <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
          <path d="M6 6l1 16h10l1-16" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      );
    case "chevUp":
      return (
        <svg {...common}>
          <path d="M18 15l-6-6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "chevDown":
      return (
        <svg {...common}>
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "paperclip":
      return (
        <svg {...common}>
          <path
            d="M21.44 11.05l-8.49 8.49a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.19 9.19a2 2 0 0 1-2.83-2.83l8.49-8.49"
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
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M7 10l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "upload":
      return (
        <svg {...common}>
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M17 8l-5-5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "info":
      return (
        <svg {...common}>
          <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" stroke="currentColor" strokeWidth="2" />
          <path d="M12 10v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 7h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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
   Tooltip mini helper
========================= */
function LabelWithTip({ text, tip }) {
  return (
    <span className="laLabelWrap">
      <span>{text}</span>
      {!!tip && (
        <span className="laTip" tabIndex={0} aria-label={tip}>
          <Icon name="info" />
          <span className="laTipBubble" role="tooltip">
            {tip}
          </span>
        </span>
      )}
    </span>
  );
}

/* =========================
   Component
========================= */
const emptyForm = {
  // Title is hidden now (auto-generated)
  title: "",

  contentProductId: "",

  countryId: "",
  service: 1,
  citation: "",
  year: "",
  caseNumber: "",
  decisionType: 1,
  caseType: 2,

  // Court model
  courtId: "",

  // Legacy / compatibility
  court: "",
  courtType: 3,

  // Towns (we keep postCode in payload for backward compatibility / resolver)
  postCode: "",
  town: "",

  // ✅ NEW (backend)
  courtCategory: "", // Court Division

  // Parties
  parties: "",
  judges: "",
  decisionDate: "",

  contentText: "<p></p>",

  // ✅ Attachment UI (optional, not part of upsert dto)
  attachmentSelected: null, // File
};

export default function AdminLLRServices() {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [countries, setCountries] = useState([]);
  const [countryMap, setCountryMap] = useState(new Map());

  // Courts per country (cached)
  const [courts, setCourts] = useState([]);
  const [courtsLoading, setCourtsLoading] = useState(false);
  const courtsCacheRef = useRef(new Map()); // countryId -> courts[]

  // Content Products
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const defaultProductIdRef = useRef(null);

  // Towns state (country-scoped)
  const [towns, setTowns] = useState([]);
  const [townByPostCode, setTownByPostCode] = useState(new Map());
  const [townsLoading, setTownsLoading] = useState(false);
  const townsCacheRef = useRef(new Map()); // countryId -> { towns, map }

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // search + filters + sort
  const [q, setQ] = useState("");
  const [countryFilter, setCountryFilter] = useState(""); // string id
  const [sortKey, setSortKey] = useState("updated"); // title|country|year|decision|caseType|date|updated
  const [sortDir, setSortDir] = useState("desc"); // asc|desc

  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });

  const originalContentRef = useRef("<p></p>");
  const originalProductIdRef = useRef(null);

  // ✅ Attachment meta (comes from DTO on GET /law-reports/{id})
  const [attachmentMeta, setAttachmentMeta] = useState({
    hasAttachment: false,
    fileType: "",
    fileSizeBytes: null,
    originalName: "",
  });
  const [attachBusy, setAttachBusy] = useState(false);

  function setField(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function resetForm() {
    setEditing(null);
    setForm({ ...emptyForm });
    setTowns([]);
    setTownByPostCode(new Map());
    setCourts([]);
    originalContentRef.current = "<p></p>";
    originalProductIdRef.current = null;

    setAttachmentMeta({
      hasAttachment: false,
      fileType: "",
      fileSizeBytes: null,
      originalName: "",
    });
    setAttachBusy(false);
  }

  function closeModal() {
    if (busy || attachBusy) return;
    setOpen(false);
  }

  function autoTitleDraft(next = form) {
    const parties = normalizeText(next.parties);
    const citation = normalizeText(next.citation);
    // ✅ Title format: "Parties [space] Citation"
    const bits = [parties, citation].filter(Boolean);
    return bits.join(" ").trim();
  }

  // Title hidden and always kept in sync
  useEffect(() => {
    if (!open) return;
    const nextTitle = autoTitleDraft(form);
    if (nextTitle && nextTitle !== form.title) {
      setForm((p) => ({ ...p, title: nextTitle }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.parties, form.citation]);

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

  async function fetchCourtsForCountry(countryId) {
    const cid = toInt(countryId, 0);
    if (!cid) {
      setCourts([]);
      return;
    }

    const cached = courtsCacheRef.current.get(cid);
    if (cached) {
      setCourts(cached);
      return;
    }

    setCourtsLoading(true);
    try {
      const res = await api.get("/courts", { params: { countryId: cid, includeInactive: true } });
      const list = Array.isArray(res.data) ? res.data : [];

      const normalized = list
        .map((x) => ({
          id: toInt(x?.id ?? x?.Id, 0),
          countryId: toInt(x?.countryId ?? x?.CountryId, cid),
          code: normalizeText(x?.code ?? x?.Code ?? ""),
          name: normalizeText(x?.name ?? x?.Name ?? ""),
          isActive: !!(x?.isActive ?? x?.IsActive ?? true),
          displayOrder: toInt(x?.displayOrder ?? x?.DisplayOrder, 0),
          level: x?.level ?? x?.Level ?? null,
        }))
        .filter((x) => x.id && x.name);

      normalized.sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
        if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
        return a.name.localeCompare(b.name);
      });

      courtsCacheRef.current.set(cid, normalized);
      setCourts(normalized);
    } catch (e) {
      setCourts([]);
      if (open) setError(getApiErrorMessage(e, "Failed to load courts for that country."));
    } finally {
      setCourtsLoading(false);
    }
  }

  async function fetchContentProductsLight() {
    setProductsLoading(true);
    try {
      const routes = [
        "/content-products",
        "/admin/content-products",
        "/content-products/admin",
        "/content-products?light=true",
        "/admin/content-products?light=true",
      ];

      let list = [];
      for (const url of routes) {
        try {
          const res = await api.get(url);
          const raw = normalizeLightList(res.data);
          if (raw.length) {
            list = raw;
            break;
          }
        } catch {
          // ignore
        }
      }

      const normalized = list.map(normalizeProductRow).filter((x) => x.id && x.name);

      const pickDefault =
        normalized.find((p) => p.name.toLowerCase().includes("lawafrica reports")) ||
        normalized.find((p) => p.name.toLowerCase().includes("reports")) ||
        normalized[0] ||
        null;

      setProducts(normalized);
      defaultProductIdRef.current = pickDefault?.id ?? null;
    } catch {
      setProducts([]);
      defaultProductIdRef.current = null;
    } finally {
      setProductsLoading(false);
    }
  }

  async function fetchTownsForCountry(countryId) {
    const cid = toInt(countryId, 0);
    if (!cid) {
      setTowns([]);
      setTownByPostCode(new Map());
      return;
    }

    const cached = townsCacheRef.current.get(cid);
    if (cached) {
      setTowns(cached.towns);
      setTownByPostCode(cached.map);
      return;
    }

    setTownsLoading(true);
    try {
      const res = await api.get("/towns", { params: { countryId: cid, take: 500 } });
      const list = Array.isArray(res.data) ? res.data : [];

      const normalized = list
        .map((x) => ({
          id: x?.id ?? x?.Id ?? null,
          countryId: toInt(x?.countryId ?? x?.CountryId ?? cid, cid),
          postCode: normalizeText(x?.postCode ?? x?.PostCode ?? ""),
          name: normalizeText(x?.name ?? x?.Name ?? ""),
        }))
        .filter((x) => x.postCode || x.name);

      normalized.sort((a, b) => {
        const an = a.name || "";
        const bn = b.name || "";
        const byName = an.localeCompare(bn);
        if (byName !== 0) return byName;
        return (a.postCode || "").localeCompare(b.postCode || "");
      });

      const m = new Map();
      for (const t of normalized) {
        if (t.postCode && !m.has(t.postCode)) m.set(t.postCode, t);
      }

      setTowns(normalized);
      setTownByPostCode(m);
      townsCacheRef.current.set(cid, { towns: normalized, map: m });
    } catch (e) {
      setTowns([]);
      setTownByPostCode(new Map());
      if (open) setError(getApiErrorMessage(e, "Failed to load towns for that country."));
    } finally {
      setTownsLoading(false);
    }
  }

  async function handleCountryChange(newCountryId) {
    const cid = String(newCountryId || "");
    setField("countryId", cid);

    // reset dependent fields
    setField("postCode", "");
    setField("town", "");
    setField("courtId", "");
    setCourts([]);

    await Promise.all([fetchTownsForCountry(cid), fetchCourtsForCountry(cid)]);
  }

  function handleTownSelect(postCode) {
    const pc = normalizeText(postCode);
    setField("postCode", pc);

    const hit = pc ? townByPostCode.get(pc) : null;
    if (hit?.name) setField("town", hit.name);
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

  // mapping helpers
  async function readProductMappings(productId) {
    const pid = toInt(productId, 0);
    if (!pid) return [];
    const res = await api.get(`/content-products/${pid}/documents`);
    const data = res.data?.data ?? res.data;
    return Array.isArray(data) ? data : [];
  }

  async function ensureProductDocMapping({ productId, legalDocumentId, sortOrder = 0 }) {
    const pid = toInt(productId, 0);
    const did = toInt(legalDocumentId, 0);
    if (!pid || !did) return;

    try {
      const rows2 = await readProductMappings(pid);
      const already = rows2.some((r) => toInt(r.legalDocumentId ?? r.LegalDocumentId, 0) === did);
      if (already) return;
    } catch {
      // ignore
    }

    await api.post(`/content-products/${pid}/documents`, {
      legalDocumentId: did,
      sortOrder: toInt(sortOrder, 0),
    });
  }

  async function removeProductDocMapping({ productId, legalDocumentId }) {
    const pid = toInt(productId, 0);
    const did = toInt(legalDocumentId, 0);
    if (!pid || !did) return;

    const rows2 = await readProductMappings(pid);
    const hit = rows2.find((r) => toInt(r.legalDocumentId ?? r.LegalDocumentId, 0) === did);
    const mapId = hit?.id ?? hit?.Id ?? null;
    if (!mapId) return;

    await api.delete(`/content-products/${pid}/documents/${mapId}`);
  }

  // ✅ Attachment: download (authorized users). In admin screen we allow it too.
  async function downloadAttachment(reportId, suggestedName = "") {
    const id = toInt(reportId, 0);
    if (!id) return;

    setBusy(true);
    setError("");
    setInfo("");

    try {
      const res = await api.get(`/law-reports/${id}/attachment/download`, {
        responseType: "blob",
        validateStatus: (s) => s >= 200 && s < 400,
      });

      const cd = res?.headers?.["content-disposition"] || res?.headers?.["Content-Disposition"];
      const filenameFromHeader = tryGetFilenameFromContentDisposition(cd);
      const filename = filenameFromHeader || suggestedName || `law-report-${id}-attachment`;

      const blob =
        res.data instanceof Blob
          ? res.data
          : new Blob([res.data || ""], { type: res?.headers?.["content-type"] || "application/octet-stream" });
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();

      window.URL.revokeObjectURL(url);

      setInfo("Attachment downloaded.");
    } catch (e) {
      const msg = getApiErrorMessage(e, "Download failed.");
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  // ✅ Attachment: upload (Admin only) - optional
  async function uploadAttachment(reportId, file) {
    const id = toInt(reportId, 0);
    if (!id) return setError("Save the report first, then upload an attachment.");
    if (!file) return setError("Select a file to upload (PDF/DOC/DOCX).");

    const name = String(file?.name || "").toLowerCase();
    const okExt = name.endsWith(".pdf") || name.endsWith(".doc") || name.endsWith(".docx");
    if (!okExt) return setError("Only PDF/DOC/DOCX attachments are allowed.");

    setAttachBusy(true);
    setError("");
    setInfo("");

    try {
      const fd = new FormData();
      fd.append("File", file);

      const res = await api.post(`/law-reports/${id}/attachment`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const d = res?.data ?? {};
      setAttachmentMeta({
        hasAttachment: !!(d?.hasAttachment ?? true),
        fileType: normalizeText(d?.attachmentFileType ?? attachmentMeta.fileType),
        fileSizeBytes: d?.attachmentFileSizeBytes ?? attachmentMeta.fileSizeBytes,
        originalName: normalizeText(d?.attachmentOriginalName ?? file?.name ?? attachmentMeta.originalName),
      });

      setForm((p) => ({ ...p, attachmentSelected: null }));
      setInfo("Attachment uploaded.");
      await fetchList();
    } catch (e) {
      setError(getApiErrorMessage(e, "Attachment upload failed."));
    } finally {
      setAttachBusy(false);
    }
  }

  useEffect(() => {
    (async () => {
      await fetchCountries();
      await fetchContentProductsLight();
      await fetchList();
    })();
  }, []);

  // Filters + Search
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();

    return rows.filter((r) => {
      const countryId = pick(r, ["countryId", "CountryId"], null);
      if (countryFilter && String(countryId ?? "") !== String(countryFilter)) return false;

      if (!s) return true;

      const title = String(pick(r, ["title", "Title"], "")).toLowerCase();
      const year = String(pick(r, ["year", "Year"], "")).toLowerCase();
      const citation = String(pick(r, ["citation", "Citation"], "")).toLowerCase();
      const town = String(pick(r, ["town", "Town"], "")).toLowerCase();
      const div = String(pick(r, ["courtCategory", "CourtCategory"], "")).toLowerCase();

      const courtName = String(pick(r, ["courtName", "CourtName"], "")).toLowerCase();
      const courtCode = String(pick(r, ["courtCode", "CourtCode"], "")).toLowerCase();
      const legacyCourt = String(pick(r, ["court", "Court"], "")).toLowerCase();

      const caseNo = String(pick(r, ["caseNumber", "CaseNumber"], "")).toLowerCase();
      const judges = String(pick(r, ["judges", "Judges"], "")).toLowerCase();

      const countryName = (countryMap.get(Number(countryId)) || "").toLowerCase();

      const courtTypeLabel = String(pick(r, ["courtTypeLabel", "CourtTypeLabel"], "")).toLowerCase();

      const serviceVal = pick(r, ["service", "Service"], null);
      const serviceLabel =
        (pick(r, ["serviceLabel", "ServiceLabel"], null) ||
          SERVICE_OPTIONS.find((x) => x.value === enumToInt(serviceVal, SERVICE_OPTIONS, 0))?.label ||
          "").toLowerCase();

      const hasAttachment = !!pick(r, ["hasAttachment", "HasAttachment"], false);
      const attachmentName = String(pick(r, ["attachmentOriginalName", "AttachmentOriginalName"], "")).toLowerCase();

      const meta = `${year} ${citation} ${courtName} ${courtCode} ${legacyCourt} ${courtTypeLabel} ${div} ${town} ${caseNo} ${judges} ${countryName} ${serviceLabel} ${
        hasAttachment ? "attachment" : ""
      } ${attachmentName}`;
      return title.includes(s) || meta.includes(s);
    });
  }, [rows, q, countryFilter, countryMap]);

  // Sorting
  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;

    const keyFn = (r) => {
      const countryId = pick(r, ["countryId", "CountryId"], null);
      const countryName = countryMap.get(Number(countryId)) || "";

      switch (sortKey) {
        case "title":
          return sortValue(pick(r, ["title", "Title"], ""));
        case "country":
          return sortValue(countryName);
        case "year":
          return toInt(pick(r, ["year", "Year"], 0), 0);
        case "decision": {
          const raw =
            pick(r, ["decisionTypeLabel", "DecisionTypeLabel"], null) ??
            pick(r, ["decisionType", "DecisionType"], null);
          const label = normalizeText(raw) || labelFrom(DECISION_OPTIONS, raw);
          return sortValue(label);
        }
        case "caseType": {
          const raw =
            pick(r, ["caseTypeLabel", "CaseTypeLabel"], null) ?? pick(r, ["caseType", "CaseType"], null);
          const label = normalizeText(raw) || labelFrom(CASETYPE_OPTIONS, raw);
          return sortValue(label);
        }
        case "date": {
          const iso = pick(r, ["decisionDate", "DecisionDate"], null);
          const t = iso ? new Date(iso).getTime() : 0;
          return Number.isFinite(t) ? t : 0;
        }
        case "updated": {
          const iso = pick(r, ["updatedAt", "UpdatedAt", "lastUpdated", "LastUpdated"], null);
          const t = iso ? new Date(iso).getTime() : 0;
          return Number.isFinite(t) ? t : 0;
        }
        default:
          return sortValue(pick(r, ["title", "Title"], ""));
      }
    };

    const copy = [...filtered];
    copy.sort((a, b) => {
      const av = keyFn(a);
      const bv = keyFn(b);

      if (typeof av === "number" && typeof bv === "number") {
        if (av === bv) return 0;
        return av > bv ? dir : -dir;
      }

      const as = String(av ?? "");
      const bs = String(bv ?? "");
      return as.localeCompare(bs) * dir;
    });

    return copy;
  }, [filtered, sortKey, sortDir, countryMap]);

  function toggleSort(nextKey) {
    if (sortKey === nextKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(nextKey);
      setSortDir("asc");
    }
  }

  function SortHeader({ k, children, alignRight = false, width }) {
    const active = sortKey === k;
    return (
      <th
        style={{ width, cursor: "pointer", userSelect: "none", textAlign: alignRight ? "right" : "left" }}
        onClick={() => toggleSort(k)}
        title="Click to sort"
      >
        <span className={`laTh ${active ? "active" : ""}`}>
          {children}
          <span className="laSortIcon" aria-hidden="true">
            {active ? (sortDir === "asc" ? <Icon name="chevUp" /> : <Icon name="chevDown" />) : null}
          </span>
        </span>
      </th>
    );
  }

  function openCreate() {
    setError("");
    setInfo("");
    resetForm();

    const defaultPid = defaultProductIdRef.current;

    setForm((p) => ({
      ...p,
      decisionType: 1,
      caseType: 2,
      service: 1,
      courtType: 3,
      year: String(new Date().getUTCFullYear()),
      contentText: "<p></p>",
      title: "",
      contentProductId: defaultPid ? String(defaultPid) : "",
      courtCategory: "",
      attachmentSelected: null,
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

      setAttachmentMeta({
        hasAttachment: !!pick(d, ["hasAttachment", "HasAttachment"], false),
        fileType: normalizeText(pick(d, ["attachmentFileType", "AttachmentFileType"], "")),
        fileSizeBytes: pick(d, ["attachmentFileSizeBytes", "AttachmentFileSizeBytes"], null),
        originalName: normalizeText(pick(d, ["attachmentOriginalName", "AttachmentOriginalName"], "")),
      });

      const decisionVal = enumToInt(pick(d, ["decisionType", "DecisionType"], 1), DECISION_OPTIONS, 1);
      const caseVal = enumToInt(pick(d, ["caseType", "CaseType"], 2), CASETYPE_OPTIONS, 2);
      const ctVal = enumToInt(pick(d, ["courtType", "CourtType"], 3), COURT_TYPE_OPTIONS, 3);

      const cid = pick(d, ["countryId", "CountryId"], "");
      if (cid) {
        await Promise.all([fetchTownsForCountry(cid), fetchCourtsForCountry(cid)]);
      }

      const pc =
        pick(d, ["townPostCode", "TownPostCode"], null) ??
        pick(d, ["postCode", "PostCode", "postcode", "Postcode"], null) ??
        "";

      const contentHtml = safeDefaultHtml(pick(d, ["contentText", "ContentText"], "") ?? "<p></p>");

      const courtId =
        pick(d, ["courtId", "CourtId"], null) ?? pick(d, ["courtRefId", "CourtRefId"], null) ?? null;

      const pid =
        pick(d, ["contentProductId", "ContentProductId"], null) ?? pick(d, ["productId", "ProductId"], null) ?? null;

      originalProductIdRef.current = pid ? toInt(pid, 0) : null;
      originalContentRef.current = contentHtml;

      const courtCategory = pick(d, ["courtCategory", "CourtCategory"], "") ?? "";

      const nextForm = {
        title: pick(d, ["title", "Title"], "") ?? "",
        contentProductId: pid
          ? String(pid)
          : defaultProductIdRef.current
          ? String(defaultProductIdRef.current)
          : "",

        countryId: cid,
        service: enumToInt(pick(d, ["service", "Service"], 1), SERVICE_OPTIONS, 1),
        citation: pick(d, ["citation", "Citation"], "") ?? "",
        year: pick(d, ["year", "Year"], "") ?? "",
        caseNumber: pick(d, ["caseNumber", "CaseNumber"], "") ?? "",
        decisionType: decisionVal,
        caseType: caseVal,

        courtId: courtId ? String(courtId) : "",

        courtType: ctVal,
        court: pick(d, ["court", "Court"], "") ?? "",

        postCode: String(pc ?? ""),
        town: pick(d, ["town", "Town"], "") ?? "",

        courtCategory: String(courtCategory ?? ""),

        parties: pick(d, ["parties", "Parties"], "") ?? "",
        judges: pick(d, ["judges", "Judges"], "") ?? "",
        decisionDate: dateInputFromIso(pick(d, ["decisionDate", "DecisionDate"], "")),

        contentText: contentHtml,

        attachmentSelected: null,
      };

      const pc2 = normalizeText(nextForm.postCode);
      if (pc2 && !normalizeText(nextForm.town)) {
        const hit = townByPostCode.get(pc2);
        if (hit?.name) nextForm.town = hit.name;
      }

      nextForm.title = autoTitleDraft(nextForm);
      setForm(nextForm);
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to load report details."));
      closeModal();
    } finally {
      setBusy(false);
    }
  }

  function buildPayload() {
    const pid = toInt(form.contentProductId, 0);
    const countryId = toInt(form.countryId, 0);
    const courtId = toInt(form.courtId, 0);

    return {
      category: 6,
      title: normalizeText(form.title) || null,

      contentProductId: pid ? pid : null,

      countryId,
      service: toInt(form.service, 1),

      citation: normalizeText(form.citation) || null,
      year: toInt(form.year, new Date().getUTCFullYear()),
      caseNumber: normalizeText(form.caseNumber) || null,

      decisionType: toInt(form.decisionType, 1),
      caseType: toInt(form.caseType, 2),

      courtId: courtId ? courtId : null,

      courtCategory: normalizeText(form.courtCategory) || null,

      courtType: toInt(form.courtType, 3),

      postCode: normalizeText(form.postCode) || null,
      town: normalizeText(form.town) || null,

      parties: normalizeText(form.parties) || null,
      judges: normalizeText(form.judges) || null,
      decisionDate: isoOrNullFromDateInput(form.decisionDate),

      contentText: safeDefaultHtml(form.contentText),
    };
  }

  function validate() {
    if (!toInt(form.countryId, 0)) return "Country is required (select a country first).";
    if (!toInt(form.service, 0)) return "Service is required.";
    if (!normalizeText(form.parties)) return "Parties is required (e.g. A v B).";
    if (!normalizeText(form.decisionDate)) return "Decision Date is required.";

    const year = toInt(form.year, 0);
    if (!year || year < 1900 || year > 2100) return "Year must be between 1900 and 2100.";

    const hasCourtsForCountry = courts.length > 0;
    if (hasCourtsForCountry && !toInt(form.courtId, 0)) return "Court is required (select a Court).";
    if (!hasCourtsForCountry && !toInt(form.courtType, 0)) return "Court Type is required.";

    if (products.length > 0 && !toInt(form.contentProductId, 0)) {
      return "Content Product is required (select where this report belongs).";
    }

    if (!editing?.id && htmlLooksEmpty(form.contentText)) return "Report content is required on Create (paste the case).";
    return "";
  }

  async function save() {
    const msg = validate();
    if (msg) return setError(msg);

    const hadContentBefore = !htmlLooksEmpty(originalContentRef.current);
    const isEmptyNow = htmlLooksEmpty(form.contentText);
    const isEditing = !!pick(editing, ["id", "Id"], null);

    if (isEditing && hadContentBefore && isEmptyNow) {
      const ok = window.confirm(
        "You are about to save this report with EMPTY content.\n\nThis will clear the formatted body.\n\nContinue?"
      );
      if (!ok) return;
    }

    setBusy(true);
    setError("");
    setInfo("");

    try {
      const syncedTitle = autoTitleDraft(form);
      const payload = { ...buildPayload(), title: syncedTitle || buildPayload().title };

      const id = pick(editing, ["id", "Id"], null);
      const nextPid = toInt(form.contentProductId, 0);

      if (id) {
        await api.put(`/law-reports/${id}`, payload);

        try {
          const oldPid = toInt(originalProductIdRef.current, 0);
          const docId = toInt(id, 0);

          if (oldPid && nextPid && oldPid !== nextPid) {
            await removeProductDocMapping({ productId: oldPid, legalDocumentId: docId });
            await ensureProductDocMapping({ productId: nextPid, legalDocumentId: docId, sortOrder: 0 });
          } else if (nextPid) {
            await ensureProductDocMapping({ productId: nextPid, legalDocumentId: docId, sortOrder: 0 });
          }
        } catch (mapErr) {
          console.warn("Mapping sync failed:", mapErr);
        }

        originalProductIdRef.current = nextPid || null;
        setInfo("Saved changes.");
      } else {
        const res = await api.post("/law-reports", payload);
        const data = res?.data?.data ?? res?.data;
        const newId = pick(data, ["id", "Id"], null);

        if (nextPid && newId) {
          try {
            await ensureProductDocMapping({ productId: nextPid, legalDocumentId: newId, sortOrder: 0 });
          } catch (mapErr) {
            console.warn("Mapping create failed:", mapErr);
            setInfo(
              newId
                ? `Report created (#${newId}). (Mapping failed — you can map manually in Product Documents.)`
                : "Report created. (Mapping failed — you can map manually.)"
            );
          }
        }

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

    const title = pick(row, ["title", "Title"], "");
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
    if (!id) return;

    navigate(`/dashboard/admin/llr-services/${id}/content?id=${id}`, {
      state: {
        title: pick(row, ["title", "Title"], "") || "",
        reportId: id,
        id: id,
      },
    });
  }

  function courtTownDivisionDisplay(row) {
    const courtName = normalizeText(pick(row, ["courtName", "CourtName"], ""));
    const legacyCourt = normalizeText(pick(row, ["court", "Court"], ""));
    const courtTypeLabel = normalizeText(pick(row, ["courtTypeLabel", "CourtTypeLabel"], ""));
    const town = normalizeText(pick(row, ["town", "Town"], ""));
    const div = normalizeText(pick(row, ["courtCategory", "CourtCategory"], ""));

    const base = courtName || legacyCourt || courtTypeLabel;
    let out = base;

    if (div) out = out ? `${out} — ${div}` : div;
    if (out && town) return `${out} — ${town}`;
    return out || town || "—";
  }

  return (
    <div className="admin-page admin-page-wide admin-llrservices">
      {/* Scoped premium tweaks + uniform row layout */}
      <style>{`
        .admin-llrservices .admin-modal {
          border-radius: 18px;
          border: 1px solid rgba(17,24,39,0.10);
          box-shadow: 0 24px 70px rgba(0,0,0,0.16);
          overflow: hidden;
        }
        .admin-llrservices .admin-modal-head {
          background: linear-gradient(180deg, rgba(107,35,59,0.10), rgba(255,255,255,0));
          border-bottom: 1px solid rgba(17,24,39,0.08);
        }
        .admin-llrservices .admin-modal-title { letter-spacing: -0.2px; }

        /* Make modal form feel premium + aligned */
        .admin-llrservices .admin-modal-body { padding-top: 6px; }
        .admin-llrservices .admin-grid { gap: 14px; }

        .admin-llrservices .admin-field { min-width: 0; }
        .admin-llrservices .admin-field > label {
          font-weight: 650;
          color: rgba(17,24,39,0.82);
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 6px;
        }

        /* Force uniform control sizing */
        .admin-llrservices input,
        .admin-llrservices select,
        .admin-llrservices textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid rgba(17,24,39,0.12);
          border-radius: 12px;
          background: rgba(255,255,255,0.92);
          transition: box-shadow .15s ease, border-color .15s ease, background .15s ease;
        }
        .admin-llrservices input,
        .admin-llrservices select {
          height: 46px;
          padding: 10px 12px;
        }
        .admin-llrservices textarea {
          padding: 10px 12px;
          min-height: 86px;
          resize: vertical;
        }
        .admin-llrservices select { appearance: auto; }

        .admin-llrservices input:disabled,
        .admin-llrservices select:disabled,
        .admin-llrservices textarea:disabled {
          background: rgba(17,24,39,0.03);
          color: rgba(17,24,39,0.55);
        }

        .admin-llrservices input:focus,
        .admin-llrservices select:focus,
        .admin-llrservices textarea:focus {
          outline: none;
          border-color: rgba(107,35,59,0.45);
          box-shadow: 0 0 0 4px rgba(107,35,59,0.10);
          background: #fff;
        }

        .admin-llrservices .admin-btn.primary { background: #6b233b; border-color: #6b233b; }
        .admin-llrservices .admin-btn.primary:hover { filter: brightness(0.96); }

        /* ✅ Uniform "two fields per row" grid — equal widths */
        .admin-llrservices .laRow2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          align-items: start;
        }
        .admin-llrservices .laRow2 > .admin-field { margin: 0 !important; }
        @media (max-width: 900px) {
          .admin-llrservices .laRow2 { grid-template-columns: 1fr; }
        }

        /* Table scroll fix */
        .admin-llrservices .laSurfaceCard { display:flex; flex-direction:column; min-height: 0; }
        .admin-llrservices .laTableWrap { overflow: auto; max-height: calc(100vh - 290px); }
        .admin-llrservices .laTableWrap::-webkit-scrollbar { height: 10px; width: 10px; }
        .admin-llrservices .laTableWrap::-webkit-scrollbar-thumb { background: rgba(17,24,39,0.18); border-radius: 999px; }
        .admin-llrservices .laTableWrap:hover::-webkit-scrollbar-thumb { background: rgba(17,24,39,0.28); }

        /* Chips */
        .admin-llrservices .laChips { display:flex; flex-wrap:wrap; gap: 8px; margin-top: 6px; }
        .admin-llrservices .laChipSoft { border-radius: 999px; border: 1px solid rgba(17,24,39,0.10); background: rgba(255,255,255,0.85); }
        .admin-llrservices .chipKey { color: rgba(17,24,39,0.65); font-weight: 650; }

        /* Sort headers */
        .admin-llrservices .laTh { display:inline-flex; align-items:center; gap: 8px; }
        .admin-llrservices .laTh.active { color: rgba(107,35,59,1); }
        .admin-llrservices .laSortIcon svg { width: 16px; height: 16px; opacity: 0.85; }

        /* Toolbar filters */
        .admin-llrservices .laFiltersRow { display:flex; gap: 10px; align-items:center; flex-wrap: wrap; }
        .admin-llrservices .laSelect { min-width: 190px; height: 42px; }
        .admin-llrservices .laMini { min-width: 160px; height: 42px; }
        .admin-llrservices .laClearBtn { border-radius: 999px; }

        /* Attachments UI */
        .admin-llrservices .laAttachBox {
          border: 1px solid rgba(17,24,39,0.10);
          border-radius: 14px;
          padding: 12px;
          background: rgba(255,255,255,0.7);
        }
        .admin-llrservices .laAttachRow { display:flex; gap: 10px; align-items:center; flex-wrap: wrap; }
        .admin-llrservices .laAttachMeta { display:flex; flex-direction:column; gap: 2px; min-width: 240px; }
        .admin-llrservices .laAttachName { font-weight: 750; color: rgba(17,24,39,0.86); }
        .admin-llrservices .laAttachSub { color: rgba(17,24,39,0.6); font-size: 12px; }
        .admin-llrservices .laPillBtn {
          border-radius: 999px;
          padding: 8px 12px;
          display:inline-flex; align-items:center; gap: 8px;
          height: 40px;
        }
        .admin-llrservices .laPillBtn svg { width: 16px; height: 16px; }
        .admin-llrservices .laFileInput {
          padding: 9px 10px;
          border-radius: 12px;
          border: 1px dashed rgba(17,24,39,0.18);
          background: rgba(255,255,255,0.9);
          height: 40px;
        }

        /* Tooltip */
        .admin-llrservices .laLabelWrap { display:inline-flex; align-items:center; gap: 8px; }
        .admin-llrservices .laTip {
          position: relative;
          display:inline-flex; align-items:center; justify-content:center;
          width: 18px; height: 18px;
          border-radius: 999px;
          color: rgba(17,24,39,0.55);
          cursor: help;
        }
        .admin-llrservices .laTip:hover { color: rgba(107,35,59,0.9); }
        .admin-llrservices .laTip svg { width: 16px; height: 16px; }
        .admin-llrservices .laTipBubble {
          position: absolute;
          left: 50%;
          bottom: calc(100% + 10px);
          transform: translateX(-50%);
          width: min(320px, 72vw);
          background: rgba(17,24,39,0.96);
          color: rgba(255,255,255,0.95);
          padding: 10px 12px;
          border-radius: 12px;
          box-shadow: 0 18px 50px rgba(0,0,0,0.22);
          font-size: 12px;
          line-height: 1.35;
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          z-index: 50;
        }
        .admin-llrservices .laTipBubble:after{
          content:"";
          position:absolute;
          left: 50%;
          top: 100%;
          transform: translateX(-50%);
          border: 8px solid transparent;
          border-top-color: rgba(17,24,39,0.96);
        }
        .admin-llrservices .laTip:hover .laTipBubble,
        .admin-llrservices .laTip:focus .laTipBubble {
          opacity: 1;
          visibility: visible;
        }

        .admin-llrservices .hint { display:none; }
      `}</style>

      <div className="admin-header">
        <div>
          <h1 className="admin-title">Admin · LLR Services (Reports)</h1>
          <p className="admin-subtitle">
            Court Division maps to <span className="laEm">CourtCategory</span>. Town is selected via dropdown.
          </p>
        </div>

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

      <div className="admin-card admin-card-fill laSurfaceCard">
        <div className="admin-toolbar">
          <div className="toolbarRow laFiltersRow">
            <div className="searchWrap" style={{ flex: 1, minWidth: 260 }}>
              <span className="searchIcon">
                <Icon name="search" />
              </span>
              <input
                className="admin-search admin-search-wide laSearch"
                placeholder="Search by title, year, country, citation, court, division, town... (and attachment name)"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            <select
              className="laSelect"
              value={String(countryFilter || "")}
              onChange={(e) => setCountryFilter(e.target.value)}
              title="Filter by country"
              disabled={loading}
            >
              <option value="">All countries</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              className="laMini"
              value={`${sortKey}:${sortDir}`}
              onChange={(e) => {
                const [k, d] = String(e.target.value).split(":");
                setSortKey(k);
                setSortDir(d === "asc" ? "asc" : "desc");
              }}
              title="Sort"
              disabled={loading}
            >
              <option value="updated:desc">Sort: Updated (desc)</option>
              <option value="updated:asc">Sort: Updated (asc)</option>
              <option value="date:desc">Sort: Decision date (desc)</option>
              <option value="date:asc">Sort: Decision date (asc)</option>
              <option value="year:desc">Sort: Year (desc)</option>
              <option value="year:asc">Sort: Year (asc)</option>
              <option value="title:asc">Sort: Title (A→Z)</option>
              <option value="title:desc">Sort: Title (Z→A)</option>
              <option value="country:asc">Sort: Country (A→Z)</option>
              <option value="country:desc">Sort: Country (Z→A)</option>
            </select>

            <button
              type="button"
              className="admin-btn laClearBtn"
              onClick={() => {
                setQ("");
                setCountryFilter("");
                setSortKey("updated");
                setSortDir("desc");
              }}
              disabled={loading || busy}
              title="Clear search, filters and sort"
            >
              Clear
            </button>

            <div className="admin-pill muted laCountPill" title="Total results">
              {loading ? "Loading…" : `${sorted.length} report(s)`}
            </div>
          </div>
        </div>

        <div className="admin-table-wrap laTableWrap">
          <table className="admin-table laTable">
            <thead>
              <tr>
                <SortHeader k="title" width="56%">
                  Title
                </SortHeader>
                <SortHeader k="country" width="12%">
                  Country
                </SortHeader>
                <SortHeader k="year" width="6%">
                  Year
                </SortHeader>
                <SortHeader k="decision" width="10%">
                  Decision
                </SortHeader>
                <SortHeader k="caseType" width="10%">
                  Case Type
                </SortHeader>
                <SortHeader k="date" width="8%">
                  Date
                </SortHeader>
                <th style={{ width: "12%", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {!loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={7} className="laEmptyRow">
                    No reports found. Click <span className="laEm">New report</span> to add one.
                  </td>
                </tr>
              )}

              {sorted.map((r, idx) => {
                const id = pick(r, ["id", "Id"], null);

                const decisionRaw = pick(r, ["decisionType", "DecisionType"], null);
                const caseRaw = pick(r, ["caseType", "CaseType"], null);

                const decisionLabel =
                  normalizeText(pick(r, ["decisionTypeLabel", "DecisionTypeLabel"], "")) ||
                  labelFrom(DECISION_OPTIONS, decisionRaw);

                const caseLabel =
                  normalizeText(pick(r, ["caseTypeLabel", "CaseTypeLabel"], "")) ||
                  labelFrom(CASETYPE_OPTIONS, caseRaw);

                const decisionVal = enumToInt(decisionRaw, DECISION_OPTIONS, 0);

                const countryId = pick(r, ["countryId", "CountryId"], null);
                const countryName = countryMap.get(Number(countryId)) || (countryId ? `#${countryId}` : "—");

                const title = pick(r, ["title", "Title"], "—");
                const citation = pick(r, ["citation", "Citation"], null);
                const caseNumber = pick(r, ["caseNumber", "CaseNumber"], null);

                const year = pick(r, ["year", "Year"], null);
                const decisionDate = pick(r, ["decisionDate", "DecisionDate"], null);

                const courtLabel = courtTownDivisionDisplay(r);

                const hasAttachment = !!pick(r, ["hasAttachment", "HasAttachment"], false);
                const attachName = normalizeText(pick(r, ["attachmentOriginalName", "AttachmentOriginalName"], ""));

                return (
                  <tr key={id ?? idx} className={`laRow ${idx % 2 === 1 ? "row-zebra" : ""} row-hover`}>
                    <td>
                      <div className="titleCell">
                        <div className="titleMain laTitleMain">{title || "—"}</div>

                        <div className="chips laChips">
                          {courtLabel && courtLabel !== "—" ? (
                            <span className="chip laChipSoft" title="Court • Division • Town">
                              <span className="chipKey">Court:</span>&nbsp;{courtLabel}
                            </span>
                          ) : (
                            <span className="chip muted laChipSoft" title="Court • Division • Town">
                              Court: —
                            </span>
                          )}

                          {citation ? (
                            <span className="chip laChipSoft" title="Citation">
                              <span className="chipKey">Citation:</span>&nbsp;{citation}
                            </span>
                          ) : (
                            <span className="chip muted laChipSoft" title="Citation">
                              Citation: —
                            </span>
                          )}

                          {caseNumber ? (
                            <span className="chip laChipSoft" title="Case file / number">
                              <span className="chipKey">Case No.:</span>&nbsp;{caseNumber}
                            </span>
                          ) : (
                            <span className="chip muted laChipSoft" title="Case file / number">
                              Case No.: —
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="tight">{countryName}</td>
                    <td className="num-cell">{year ?? "—"}</td>

                    <td>
                      <span
                        className={`chip laChipSoft ${decisionVal === 1 ? "good" : decisionVal === 2 ? "warn" : "muted"}`}
                        title="Decision type"
                      >
                        {decisionLabel}
                      </span>
                    </td>

                    <td>
                      <span className={`chip laChipSoft ${caseLabel !== "—" ? "" : "muted"}`} title="Case type">
                        {caseLabel}
                      </span>
                    </td>

                    <td className="tight">{formatIsoDateShort(decisionDate)}</td>

                    <td>
                      <div className="actionsRow laActions">
                        <IconButton title="Edit report details + formatted content" onClick={() => openEdit(r)} disabled={busy}>
                          <Icon name="edit" />
                        </IconButton>

                        <IconButton
                          title={hasAttachment ? "Download attachment" : "No attachment"}
                          onClick={() => hasAttachment && downloadAttachment(id, attachName)}
                          disabled={busy || !hasAttachment}
                          tone={hasAttachment ? "primary" : "neutral"}
                        >
                          <Icon name="download" />
                        </IconButton>

                        <IconButton
                          title="Open full-page editor (optional)"
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
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <div>
                <h3 className="admin-modal-title">
                  {editing ? `Edit Report #${pick(editing, ["id", "Id"], "")}` : "Create Law Report"}
                </h3>
                <div className="admin-modal-subtitle">Tooltips replace long field explanations.</div>
              </div>

              <button className="admin-btn" onClick={closeModal} disabled={busy || attachBusy}>
                Close
              </button>
            </div>

            <div className="admin-modal-body admin-modal-scroll">
              <div className="admin-grid">
                {/* Parties */}
                <div className="admin-field admin-span2">
                  <label>
                    <LabelWithTip text="Parties *" tip="Required. Title is auto-generated as: Parties + Citation." />
                  </label>
                  <input
                    value={form.parties}
                    onChange={(e) => setField("parties", e.target.value)}
                    placeholder="e.g. A v B"
                    disabled={busy || attachBusy}
                  />
                </div>

                {/* Hidden Title (kept for payload) */}
                <input type="hidden" value={form.title} readOnly />

                {/* ✅ Content Product + Service on SAME ROW (uniform widths) */}
                <div className="admin-field admin-span2">
                  <div className="laRow2">
                    <div className="admin-field">
                      <label>
                        <LabelWithTip
                          text="Content Product *"
                          tip="Where this report belongs (used for subscriptions / packaging)."
                        />
                      </label>

                      {products.length > 0 ? (
                        <select
                          value={String(form.contentProductId || "")}
                          onChange={(e) => setField("contentProductId", e.target.value)}
                          disabled={busy || attachBusy}
                        >
                          <option value="">Select product…</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="number"
                          min="1"
                          value={String(form.contentProductId || "")}
                          onChange={(e) => setField("contentProductId", e.target.value)}
                          placeholder={productsLoading ? "Loading products…" : "ContentProductId"}
                          disabled={busy || productsLoading || attachBusy}
                        />
                      )}
                    </div>

                    <div className="admin-field">
                      <label>
                        <LabelWithTip text="Service *" tip="Legacy/branding grouping (LLR / ULR / TLR etc)." />
                      </label>
                      <select
                        value={String(form.service)}
                        onChange={(e) => setField("service", toInt(e.target.value, 1))}
                        disabled={busy || attachBusy}
                      >
                        {SERVICE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* ✅ Country + Town on SAME ROW (uniform widths) */}
                <div className="admin-field admin-span2">
                  <div className="laRow2">
                    <div className="admin-field">
                      <label>
                        <LabelWithTip text="Country *" tip="Select country first to load Courts and Towns." />
                      </label>

                      {countries.length > 0 ? (
                        <select
                          value={String(form.countryId || "")}
                          onChange={(e) => handleCountryChange(e.target.value)}
                          disabled={busy || attachBusy}
                        >
                          <option value="">Select country…</option>
                          {countries.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="number"
                          min="1"
                          value={form.countryId}
                          onChange={(e) => handleCountryChange(e.target.value)}
                          placeholder="CountryId"
                          disabled={busy || attachBusy}
                        />
                      )}
                    </div>

                    <div className="admin-field">
                      <label>
                        <LabelWithTip
                          text="Town"
                          tip="Town name is stored for display; Town code/postcode is stored internally."
                        />
                      </label>
                      <select
                        value={String(form.postCode || "")}
                        onChange={(e) => handleTownSelect(e.target.value)}
                        disabled={busy || attachBusy || !toInt(form.countryId, 0)}
                      >
                        {!toInt(form.countryId, 0) ? (
                          <option value="">Select country first…</option>
                        ) : (
                          <option value="">{townsLoading ? "Loading towns…" : "Select town…"}</option>
                        )}

                        {towns.map((t) => (
                          <option key={`${t.postCode || t.name}`} value={t.postCode || ""}>
                            {t.name || "—"}
                            {t.postCode ? ` (${t.postCode})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* ✅ Year + Case No on SAME ROW (uniform widths) */}
                <div className="admin-field admin-span2">
                  <div className="laRow2">
                    <div className="admin-field">
                      <label>
                        <LabelWithTip text="Year *" tip="Must be between 1900 and 2100." />
                      </label>
                      <input
                        type="number"
                        min="1900"
                        max="2100"
                        value={form.year}
                        onChange={(e) => setField("year", e.target.value)}
                        placeholder="e.g. 2020"
                        disabled={busy || attachBusy}
                      />
                    </div>

                    <div className="admin-field">
                      <label>
                        <LabelWithTip text="Case No." tip="Optional. Example: Petition 12 of 2020." />
                      </label>
                      <input
                        value={form.caseNumber}
                        onChange={(e) => setField("caseNumber", e.target.value)}
                        placeholder="e.g. Petition 12 of 2020"
                        disabled={busy || attachBusy}
                      />
                    </div>
                  </div>
                </div>

                {/* ✅ Citation + Decision Date on SAME ROW (uniform widths) */}
                <div className="admin-field admin-span2">
                  <div className="laRow2">
                    <div className="admin-field">
                      <label>
                        <LabelWithTip text="Citation" tip="Optional but preferred (used in title and search)." />
                      </label>
                      <input
                        value={form.citation}
                        onChange={(e) => setField("citation", e.target.value)}
                        placeholder="Optional"
                        disabled={busy || attachBusy}
                      />
                    </div>

                    <div className="admin-field">
                      <label>
                        <LabelWithTip text="Decision Date *" tip="Required. Used for consistency and citations." />
                      </label>
                      <input
                        type="date"
                        value={form.decisionDate}
                        onChange={(e) => setField("decisionDate", e.target.value)}
                        disabled={busy || attachBusy}
                      />
                    </div>
                  </div>
                </div>

                {/* ✅ Court + Court Division on SAME ROW (uniform widths) */}
                <div className="admin-field admin-span2">
                  <div className="laRow2">
                    <div className="admin-field">
                      <label>
                        <LabelWithTip
                          text="Court *"
                          tip="Courts are loaded per Country. If none exist, legacy fallback appears."
                        />
                      </label>
                      <select
                        value={String(form.courtId || "")}
                        onChange={(e) => setField("courtId", e.target.value)}
                        disabled={busy || attachBusy || !toInt(form.countryId, 0)}
                      >
                        {!toInt(form.countryId, 0) ? (
                          <option value="">Select country first…</option>
                        ) : (
                          <option value="">
                            {courtsLoading
                              ? "Loading courts…"
                              : courts.length
                              ? "Select court…"
                              : "No courts found (create courts first)"}
                          </option>
                        )}

                        {courts.map((c) => (
                          <option key={c.id} value={String(c.id)}>
                            {c.name}
                            {c.code ? ` (${c.code})` : ""}
                            {c.isActive ? "" : " — Inactive"}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="admin-field">
                      <label>
                        <LabelWithTip
                          text="Court Division"
                          tip='Optional. Saved as "CourtCategory" (e.g., Industrial, Environmental).'
                        />
                      </label>
                      <input
                        value={form.courtCategory}
                        onChange={(e) => setField("courtCategory", e.target.value)}
                        placeholder='e.g. "Industrial" (optional)'
                        disabled={busy || attachBusy}
                      />
                    </div>
                  </div>
                </div>

                {/* Hidden Town Text field (kept for payload, but not editable) */}
                <input type="hidden" value={form.town} readOnly />

                {/* Legacy fallback UI (only if no courts exist for selected country) */}
                {!courtsLoading && toInt(form.countryId, 0) && courts.length === 0 && (
                  <div className="admin-field admin-span2">
                    <label>
                      <LabelWithTip
                        text="Legacy Court (optional text)"
                        tip="Only used when there are no Court records for this country."
                      />
                    </label>
                    <input
                      value={form.court}
                      onChange={(e) => setField("court", e.target.value)}
                      placeholder="Optional display text (legacy)"
                      disabled={busy || attachBusy}
                    />
                  </div>
                )}

                {/* ✅ Case Type + Decision Type on SAME ROW */}
                <div className="admin-field admin-span2">
                  <div className="laRow2">
                    <div className="admin-field">
                      <label>
                        <LabelWithTip text="Case Type *" tip="Criminal / Civil / etc." />
                      </label>
                      <select
                        value={String(form.caseType)}
                        onChange={(e) => setField("caseType", toInt(e.target.value, 2))}
                        disabled={busy || attachBusy}
                      >
                        {CASETYPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="admin-field">
                      <label>
                        <LabelWithTip text="Decision Type *" tip="Judgment / Ruling / Order / etc." />
                      </label>
                      <select
                        value={String(form.decisionType)}
                        onChange={(e) => setField("decisionType", toInt(e.target.value, 1))}
                        disabled={busy || attachBusy}
                      >
                        {DECISION_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Judges */}
                <div className="admin-field admin-span2">
                  <label>
                    <LabelWithTip text="Judges" tip="Optional. Separate by newline or semicolon." />
                  </label>
                  <textarea
                    rows={2}
                    value={form.judges}
                    onChange={(e) => setField("judges", e.target.value)}
                    placeholder="Separate by newline or semicolon"
                    disabled={busy || attachBusy}
                  />
                </div>

                {/* Attachment */}
                <div className="admin-field admin-span2">
                  <label>
                    <LabelWithTip
                      text="Attachment (optional)"
                      tip="Upload PDF/DOC/DOCX. Downloading requires authorization (subscribed users)."
                    />
                  </label>

                  <div className="laAttachBox">
                    {!pick(editing, ["id", "Id"], null) ? (
                      <div style={{ color: "rgba(17,24,39,0.65)", fontSize: 13 }}>
                        Save/Create the report first, then upload an attachment.
                      </div>
                    ) : (
                      <div className="laAttachRow">
                        <div className="laAttachMeta">
                          <div className="laAttachName">
                            {attachmentMeta.hasAttachment
                              ? attachmentMeta.originalName || "Attachment available"
                              : "No attachment"}
                          </div>
                          <div className="laAttachSub">
                            {attachmentMeta.hasAttachment ? (
                              <>
                                {attachmentMeta.fileType ? attachmentMeta.fileType.toUpperCase() : "FILE"}{" "}
                                {attachmentMeta.fileSizeBytes ? `• ${formatBytes(attachmentMeta.fileSizeBytes)}` : ""}
                              </>
                            ) : (
                              <>Upload a PDF/DOC/DOCX.</>
                            )}
                          </div>
                        </div>

                        <input
                          className="laFileInput"
                          type="file"
                          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          disabled={busy || attachBusy}
                          onChange={(e) => {
                            const f = e.target.files?.[0] || null;
                            setForm((p) => ({ ...p, attachmentSelected: f }));
                          }}
                        />

                        <button
                          type="button"
                          className="admin-btn laPillBtn"
                          disabled={busy || attachBusy || !attachmentMeta.hasAttachment}
                          onClick={() =>
                            downloadAttachment(pick(editing, ["id", "Id"], null), attachmentMeta.originalName)
                          }
                          title="Download attachment"
                        >
                          <Icon name="download" />
                          Download
                        </button>

                        <button
                          type="button"
                          className="admin-btn primary laPillBtn"
                          disabled={busy || attachBusy || !form.attachmentSelected}
                          onClick={() => uploadAttachment(pick(editing, ["id", "Id"], null), form.attachmentSelected)}
                          title={attachmentMeta.hasAttachment ? "Replace attachment" : "Upload attachment"}
                        >
                          <Icon name="upload" />
                          {attachBusy ? "Uploading…" : attachmentMeta.hasAttachment ? "Replace" : "Upload"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* TipTap */}
                <div className="admin-field admin-span2">
                  <div className="editorLabelRow">
                    <label>
                      <LabelWithTip
                        text={`Formatted Report Content ${editing?.id ? "" : "*"}`}
                        tip="Paste from Word is supported. This HTML is saved with the report."
                      />
                    </label>

                    <div className="miniActions">
                      {!!pick(editing, ["id", "Id"], null) && (
                        <button
                          type="button"
                          className="miniBtn"
                          disabled={busy || attachBusy}
                          onClick={() => openContent(editing)}
                          title="Open the full-page editor (optional)"
                        >
                          Open full editor
                        </button>
                      )}

                      <button
                        type="button"
                        className="miniBtn"
                        disabled={busy || attachBusy}
                        onClick={() => setField("contentText", "<p></p>")}
                        title="Clear content"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <ReportTiptapEditor
                    value={safeDefaultHtml(form.contentText)}
                    onChange={(html) => setField("contentText", html)}
                    disabled={busy || attachBusy}
                  />
                </div>
              </div>
            </div>

            <div className="admin-modal-foot">
              <button className="admin-btn" onClick={closeModal} disabled={busy || attachBusy}>
                Cancel
              </button>

              <button className="admin-btn primary" onClick={save} disabled={busy || attachBusy}>
                {busy ? "Saving…" : editing ? "Save changes" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      <AdminPageFooter
        left={
          <>
            <span className="admin-footer-brand">
              Law<span>A</span>frica
            </span>
            <span className="admin-footer-dot">•</span>
            <span className="admin-footer-muted">LLR Services</span>
            <span className="admin-footer-dot">•</span>
            <span className="admin-footer-muted">{loading ? "Loading…" : `${sorted.length} report(s)`}</span>
          </>
        }
        right={
          <span className="admin-footer-muted">
            Tip: Use <span className="laEm">Country filter</span> + click column headers to sort.
          </span>
        }
      />
    </div>
  );
}
