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

  // label match (case-insensitive)
  const hit = options.find((o) => o.label.toLowerCase() === s.toLowerCase());
  if (hit) return hit.value;

  // softer match: if API returns enum NAME, try contains match against label words
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
  // Accept many shapes: array, {data:[]}, {items:[]}, {results:[]}
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

// Service options (Create/Edit + search)
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

// CourtType options (enum-backed)
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
          <path
            d="M21 21l-4.35-4.35"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
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
  title: "",

  // ✅ NEW: user selects product (so we can auto-map into product_documents join table)
  contentProductId: "",

  countryId: "",
  service: 1,
  citation: "",
  reportNumber: "",
  year: "",
  caseNumber: "",
  decisionType: 1,
  caseType: 2,

  court: "",
  courtType: 3,

  postCode: "",
  town: "",

  parties: "",
  judges: "",
  decisionDate: "",

  contentText: "<p></p>",
};

export default function AdminLLRServices() {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [countries, setCountries] = useState([]);
  const [countryMap, setCountryMap] = useState(new Map());

  // ✅ NEW: Content Products (light list for dropdown)
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

  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });

  const originalContentRef = useRef("<p></p>");
  const firstLoadRef = useRef(true);

  // ✅ NEW: remember product before editing so we can sync mapping on Save
  const originalProductIdRef = useRef(null);

  function setField(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function resetForm() {
    setEditing(null);
    setForm({ ...emptyForm });
    setTowns([]);
    setTownByPostCode(new Map());
    originalContentRef.current = "<p></p>";
    originalProductIdRef.current = null;
  }

  function closeModal() {
    if (busy) return;
    setOpen(false);
  }

  function autoTitleDraft(next = form) {
    const rn = normalizeText(next.reportNumber);
    const year = normalizeText(next.year);
    const parties = normalizeText(next.parties);
    const ct = COURT_TYPE_OPTIONS.find((x) => x.value === toInt(next.courtType, 0))?.label || "";
    const bits = [rn && year ? `${rn} (${year})` : rn || year, parties, ct].filter(Boolean);
    return bits.join(" — ").trim();
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

  // ✅ NEW: fetch content products for dropdown (tries a few routes to match your API)
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
          // try next route
        }
      }

      const normalized = list.map(normalizeProductRow).filter((x) => x.id && x.name);

      // Pick default: prefer "LawAfrica Reports"
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
        .filter((x) => x.postCode);

      normalized.sort((a, b) => a.postCode.localeCompare(b.postCode));

      const m = new Map();
      for (const t of normalized) {
        if (!m.has(t.postCode)) m.set(t.postCode, t);
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

  function handleCountryChange(newCountryId) {
    setField("countryId", newCountryId);
    setField("postCode", "");
    fetchTownsForCountry(newCountryId);
  }

  function handlePostCodeChange(postCode) {
    const pc = normalizeText(postCode);
    setField("postCode", pc);

    if (!pc) return;
    const hit = townByPostCode.get(pc);
    if (!hit) return;

    if (hit.name) setField("town", hit.name);
    if (hit.countryId && String(form.countryId || "") !== String(hit.countryId)) {
      setField("countryId", String(hit.countryId));
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

  // ✅ NEW: mapping helpers (same API used by AdminProductDocuments.jsx)
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

    // avoid duplicates (also ok if backend enforces unique)
    try {
      const rows2 = await readProductMappings(pid);
      const already = rows2.some((r) => toInt(r.legalDocumentId ?? r.LegalDocumentId, 0) === did);
      if (already) return;
    } catch {
      // ignore and try create
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

  useEffect(() => {
    (async () => {
      await fetchCountries();
      await fetchContentProductsLight(); // ✅ NEW
      await fetchList();
      firstLoadRef.current = false;
    })();
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      const title = String(pick(r, ["title", "Title"], "")).toLowerCase();
      const reportNumber = String(pick(r, ["reportNumber", "ReportNumber"], "")).toLowerCase();
      const year = String(pick(r, ["year", "Year"], "")).toLowerCase();
      const citation = String(pick(r, ["citation", "Citation"], "")).toLowerCase();
      const parties = String(pick(r, ["parties", "Parties"], "")).toLowerCase();
      const court = String(pick(r, ["court", "Court"], "")).toLowerCase();
      const town = String(pick(r, ["town", "Town"], "")).toLowerCase();
      const caseNo = String(pick(r, ["caseNumber", "CaseNumber"], "")).toLowerCase();
      const judges = String(pick(r, ["judges", "Judges"], "")).toLowerCase();

      const countryId = pick(r, ["countryId", "CountryId"], null);
      const countryName = (countryMap.get(Number(countryId)) || "").toLowerCase();

      const courtTypeLabel = String(pick(r, ["courtTypeLabel", "CourtTypeLabel"], "")).toLowerCase();

      const serviceVal = pick(r, ["service", "Service"], null);
      const serviceLabel =
        (pick(r, ["serviceLabel", "ServiceLabel"], null) ||
          SERVICE_OPTIONS.find((x) => x.value === enumToInt(serviceVal, SERVICE_OPTIONS, 0))?.label ||
          "").toLowerCase();

      const meta = `${reportNumber} ${year} ${citation} ${parties} ${court} ${courtTypeLabel} ${town} ${caseNo} ${judges} ${countryName} ${serviceLabel}`;
      return title.includes(s) || meta.includes(s);
    });
  }, [rows, q, countryMap]);

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

      const decisionVal = enumToInt(pick(d, ["decisionType", "DecisionType"], 1), DECISION_OPTIONS, 1);
      const caseVal = enumToInt(pick(d, ["caseType", "CaseType"], 2), CASETYPE_OPTIONS, 2);
      const ctVal = enumToInt(pick(d, ["courtType", "CourtType"], 3), COURT_TYPE_OPTIONS, 3);

      const cid = pick(d, ["countryId", "CountryId"], "");
      if (cid) await fetchTownsForCountry(cid);

      const pc = pick(d, ["postCode", "PostCode", "postcode", "Postcode"], "") ?? "";
      const contentHtml = safeDefaultHtml(pick(d, ["contentText", "ContentText"], "") ?? "<p></p>");

      // ✅ NEW: contentProductId from API (supports a few property names)
      const pid =
        pick(d, ["contentProductId", "ContentProductId"], null) ??
        pick(d, ["productId", "ProductId"], null) ??
        null;

      originalProductIdRef.current = pid ? toInt(pid, 0) : null;

      originalContentRef.current = contentHtml;

      setForm({
        title: pick(d, ["title", "Title"], "") ?? "",

        contentProductId: pid
          ? String(pid)
          : defaultProductIdRef.current
          ? String(defaultProductIdRef.current)
          : "",

        countryId: cid,
        service: enumToInt(pick(d, ["service", "Service"], 1), SERVICE_OPTIONS, 1),
        citation: pick(d, ["citation", "Citation"], "") ?? "",
        reportNumber: pick(d, ["reportNumber", "ReportNumber"], "") ?? "",
        year: pick(d, ["year", "Year"], "") ?? "",
        caseNumber: pick(d, ["caseNumber", "CaseNumber"], "") ?? "",
        decisionType: decisionVal,
        caseType: caseVal,

        courtType: ctVal,
        court: pick(d, ["court", "Court"], "") ?? "",

        postCode: pc,
        town: pick(d, ["town", "Town"], "") ?? "",

        parties: pick(d, ["parties", "Parties"], "") ?? "",
        judges: pick(d, ["judges", "Judges"], "") ?? "",
        decisionDate: dateInputFromIso(pick(d, ["decisionDate", "DecisionDate"], "")),

        contentText: contentHtml,
      });

      const pc2 = normalizeText(pc);
      if (pc2 && !normalizeText(pick(d, ["town", "Town"], ""))) {
        const hit = townByPostCode.get(pc2);
        if (hit?.name) setField("town", hit.name);
      }
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to load report details."));
      closeModal();
    } finally {
      setBusy(false);
    }
  }

  function buildPayload() {
    const pid = toInt(form.contentProductId, 0);

    return {
      category: 6,

      title: normalizeText(form.title) || null,

      // ✅ NEW: prefer backend support; also used by our mapping sync below
      contentProductId: pid ? pid : null,

      countryId: toInt(form.countryId, 0),
      service: toInt(form.service, 1),

      citation: normalizeText(form.citation) || null,
      reportNumber: normalizeText(form.reportNumber),
      year: toInt(form.year, new Date().getUTCFullYear()),
      caseNumber: normalizeText(form.caseNumber) || null,

      decisionType: toInt(form.decisionType, 1),
      caseType: toInt(form.caseType, 2),

      courtType: toInt(form.courtType, 3),
      court: normalizeText(form.court) || null,

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
    if (!normalizeText(form.reportNumber)) return "Report number is required (e.g. CAR353).";

    const year = toInt(form.year, 0);
    if (!year || year < 1900 || year > 2100) return "Year must be between 1900 and 2100.";

    if (!toInt(form.courtType, 0)) return "Court Type is required.";

    // ✅ If products loaded, enforce selection (prevents “manual mapping” scenario)
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
      const payload = buildPayload();
      const id = pick(editing, ["id", "Id"], null);

      const nextPid = toInt(form.contentProductId, 0);

      if (id) {
        await api.put(`/law-reports/${id}`, payload);

        // ✅ NEW: keep product_documents join table in sync (same API as AdminProductDocuments)
        // - if product changed: remove old mapping, add new mapping
        // - if product same: ensure mapping exists
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

        // Your API might return {id} or {data:{id}}; handle both
        const data = res?.data?.data ?? res?.data;
        const newId = pick(data, ["id", "Id"], null);

        // ✅ NEW: auto-map to product docs join table so docs count updates automatically
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
    if (!id) return;

    navigate(`/dashboard/admin/llr-services/${id}/content?id=${id}`, {
      state: {
        title: pick(row, ["title", "Title"], "") || "",
        reportId: id,
        id: id,
      },
    });
  }

  function courtTownDisplay(row) {
    const courtTypeLabel = normalizeText(pick(row, ["courtTypeLabel", "CourtTypeLabel"], ""));
    const legacyCourt = normalizeText(pick(row, ["court", "Court"], ""));
    const town = normalizeText(pick(row, ["town", "Town"], ""));

    const courtPart = courtTypeLabel || legacyCourt;
    if (courtPart && town) return `${courtPart} — ${town}`;
    return courtPart || town || "—";
  }

  const productNameById = useMemo(() => {
    const m = new Map();
    for (const p of products) m.set(p.id, p.name);
    return m;
  }, [products]);

  return (
    <div className="admin-page admin-page-wide admin-llrservices">
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Admin · LLR Services (Reports)</h1>
          <p className="admin-subtitle">
            Category is fixed to <span className="laEm">LLR Services</span>. Create/Edit now includes the{" "}
            <span className="laEm">formatted editor</span> (single entry flow). The <span className="laEm">File</span>{" "}
            button opens the full-page editor (optional).
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
          <div className="toolbarRow">
            <div className="searchWrap">
              <span className="searchIcon">
                <Icon name="search" />
              </span>
              <input
                className="admin-search admin-search-wide laSearch"
                placeholder="Search by title, report number, year, country, parties, citation, court type, town..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>

            <div className="admin-pill muted laCountPill" title="Total results">
              {loading ? "Loading…" : `${filtered.length} report(s)`}
            </div>
          </div>
        </div>

        <div className="admin-table-wrap laTableWrap">
          <table className="admin-table laTable">
            <thead>
              <tr>
                <th style={{ width: "46%" }}>Title</th>
                <th style={{ width: "12%" }}>Country</th>
                <th style={{ width: "12%" }}>Report No.</th>
                <th style={{ width: "6%" }} className="num-cell">
                  Year
                </th>
                <th style={{ width: "10%" }}>Decision</th>
                <th style={{ width: "10%" }}>Case Type</th>
                <th style={{ width: "18%" }}>Parties</th>
                <th style={{ width: "8%" }} className="tight">
                  Date
                </th>
                <th style={{ width: "12%", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="laEmptyRow">
                    No reports found. Click <span className="laEm">New report</span> to add one.
                  </td>
                </tr>
              )}

              {filtered.map((r, idx) => {
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

                const reportNumber = pick(r, ["reportNumber", "ReportNumber"], null);
                const year = pick(r, ["year", "Year"], null);
                const parties = pick(r, ["parties", "Parties"], null);
                const decisionDate = pick(r, ["decisionDate", "DecisionDate"], null);

                const courtLabel = courtTownDisplay(r);

                return (
                  <tr key={id ?? idx} className={`laRow ${idx % 2 === 1 ? "row-zebra" : ""} row-hover`}>
                    <td>
                      <div className="titleCell">
                        <div className="titleMain laTitleMain">{title || "—"}</div>

                        <div className="chips laChips">
                          {courtLabel && courtLabel !== "—" ? (
                            <span className="chip laChipSoft" title="Court type & town">
                              <span className="chipKey">Court:</span>&nbsp;{courtLabel}
                            </span>
                          ) : (
                            <span className="chip muted laChipSoft" title="Court type & town">
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
                            <span className="chip laChipSoft" title="Case number">
                              <span className="chipKey">Case No.:</span>&nbsp;{caseNumber}
                            </span>
                          ) : (
                            <span className="chip muted laChipSoft" title="Case number">
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
                        className={`chip laChipSoft ${
                          decisionVal === 1 ? "good" : decisionVal === 2 ? "warn" : "muted"
                        }`}
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

                    <td className="laParties">{parties || "—"}</td>
                    <td className="tight">{decisionDate ? String(decisionDate).slice(0, 10) : "—"}</td>

                    <td>
                      <div className="actionsRow laActions">
                        <IconButton
                          title="Edit report details + formatted content"
                          onClick={() => openEdit(r)}
                          disabled={busy}
                        >
                          <Icon name="edit" />
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
                <div className="admin-modal-subtitle">
                  Single entry: edit metadata + formatted content here. The <span className="laEm">File</span> screen is
                  optional.
                </div>
              </div>

              <button className="admin-btn" onClick={closeModal} disabled={busy}>
                Close
              </button>
            </div>

            <div className="admin-modal-body admin-modal-scroll">
              <div className="admin-grid">
                {/* Title */}
                <div className="admin-field admin-span2">
                  <div className="editorLabelRow">
                    <label>Title</label>
                    <div className="miniActions">
                      <button
                        type="button"
                        className="miniBtn"
                        disabled={busy}
                        onClick={() => {
                          const t = autoTitleDraft(form);
                          if (t) setField("title", t);
                        }}
                        title="Generate a sensible title from report number/year/parties/court"
                      >
                        Auto title
                      </button>
                    </div>
                  </div>

                  <input
                    value={form.title}
                    onChange={(e) => setField("title", e.target.value)}
                    placeholder="Optional (leave blank if backend generates it) — or click Auto title"
                    disabled={busy}
                  />
                  <div className="hint">Tip: If blank, your backend may auto-generate. Setting it here gives you control.</div>
                </div>

                {/* ✅ NEW: Content Product */}
                <div className="admin-field admin-span2">
                  <label>Content Product *</label>

                  {products.length > 0 ? (
                    <select
                      className="adminSelect"
                      value={String(form.contentProductId || "")}
                      onChange={(e) => setField("contentProductId", e.target.value)}
                      disabled={busy}
                    >
                      <option value="">Select product…</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <>
                      <input
                        type="number"
                        min="1"
                        className="adminSelect"
                        value={String(form.contentProductId || "")}
                        onChange={(e) => setField("contentProductId", e.target.value)}
                        placeholder={productsLoading ? "Loading products…" : "ContentProductId (e.g. LawAfrica Reports id)"}
                        disabled={busy || productsLoading}
                      />
                      <div className="hint">
                        Tip: This links the report to a product so Docs count updates automatically. If this stays empty,
                        your backend should apply a default product.
                      </div>
                    </>
                  )}

                  <div className="hint">
                    Used to auto-map this report to a product (so you don’t manually map later).{" "}
                    {toInt(form.contentProductId, 0) && productNameById.get(toInt(form.contentProductId, 0)) ? (
                      <>
                        Selected: <span className="laEm">{productNameById.get(toInt(form.contentProductId, 0))}</span>
                      </>
                    ) : (
                      <>
                        {productsLoading ? "Loading products…" : "Pick the product where this report belongs."}
                      </>
                    )}
                  </div>
                </div>

                <div className="admin-field">
                  <label>Country *</label>

                  {countries.length > 0 ? (
                    <select
                      value={String(form.countryId || "")}
                      onChange={(e) => handleCountryChange(e.target.value)}
                      disabled={busy}
                    >
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
                        onChange={(e) => handleCountryChange(e.target.value)}
                        placeholder="CountryId (e.g. 1 = Kenya)"
                        disabled={busy}
                      />
                      <div className="hint">Tip: ensure GET /api/country is accessible.</div>
                    </>
                  )}
                </div>

                <div className="admin-field">
                  <label>Service *</label>
                  <select
                    value={String(form.service)}
                    onChange={(e) => setField("service", toInt(e.target.value, 1))}
                    disabled={busy}
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
                    disabled={busy}
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
                    disabled={busy}
                  />
                </div>

                <div className="admin-field">
                  <label>Case Number</label>
                  <input
                    value={form.caseNumber}
                    onChange={(e) => setField("caseNumber", e.target.value)}
                    placeholder="e.g. Petition 12 of 2020"
                    disabled={busy}
                  />
                </div>

                <div className="admin-field">
                  <label>Citation</label>
                  <input
                    value={form.citation}
                    onChange={(e) => setField("citation", e.target.value)}
                    placeholder="Optional (preferred if available)"
                    disabled={busy}
                  />
                </div>

                <div className="admin-field">
                  <label>Court Type *</label>
                  <select
                    value={String(form.courtType)}
                    onChange={(e) => setField("courtType", toInt(e.target.value, 3))}
                    disabled={busy}
                  >
                    {COURT_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <div className="hint">Avoids typing inconsistencies.</div>
                </div>

                <div className="admin-field">
                  <label>Court (optional text)</label>
                  <input
                    value={form.court}
                    onChange={(e) => setField("court", e.target.value)}
                    placeholder="Optional display text (can be blank)"
                    disabled={busy}
                  />
                </div>

                <div className="admin-field">
                  <label>Postcode</label>
                  <select
                    value={String(form.postCode || "")}
                    onChange={(e) => handlePostCodeChange(e.target.value)}
                    disabled={busy || !toInt(form.countryId, 0)}
                  >
                    {!toInt(form.countryId, 0) ? (
                      <option value="">Select country first…</option>
                    ) : (
                      <option value="">{townsLoading ? "Loading postcodes…" : "Select postcode…"}</option>
                    )}

                    {towns.map((t) => (
                      <option key={t.postCode} value={t.postCode}>
                        {t.postCode} — {t.name}
                      </option>
                    ))}
                  </select>
                  <div className="hint">
                    {toInt(form.countryId, 0)
                      ? "Select a postcode to auto-fill Town (Town remains editable)."
                      : "Pick a Country first to load available postcodes."}
                  </div>
                </div>

                <div className="admin-field">
                  <label>Town</label>
                  <input
                    value={form.town}
                    onChange={(e) => setField("town", e.target.value)}
                    placeholder="Auto-filled, but you can edit (e.g. a more specific town name)"
                    disabled={busy}
                  />
                  <div className="hint">You can override the town name (e.g. add a more specific location).</div>
                </div>

                <div className="admin-field">
                  <label>Decision Type *</label>
                  <select
                    value={String(form.decisionType)}
                    onChange={(e) => setField("decisionType", toInt(e.target.value, 1))}
                    disabled={busy}
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
                    disabled={busy}
                  >
                    {CASETYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-field admin-span2">
                  <label>Parties</label>
                  <input
                    value={form.parties}
                    onChange={(e) => setField("parties", e.target.value)}
                    placeholder="e.g. A v B"
                    disabled={busy}
                  />
                </div>

                <div className="admin-field admin-span2">
                  <label>Judges</label>
                  <textarea
                    rows={2}
                    value={form.judges}
                    onChange={(e) => setField("judges", e.target.value)}
                    placeholder="Separate by newline or semicolon"
                    disabled={busy}
                  />
                </div>

                <div className="admin-field">
                  <label>Decision Date</label>
                  <input
                    type="date"
                    value={form.decisionDate}
                    onChange={(e) => setField("decisionDate", e.target.value)}
                    disabled={busy}
                  />
                </div>

                {/* TipTap */}
                <div className="admin-field admin-span2">
                  <div className="editorLabelRow">
                    <label>Formatted Report Content {editing?.id ? "" : "*"}</label>

                    <div className="miniActions">
                      {!!pick(editing, ["id", "Id"], null) && (
                        <button
                          type="button"
                          className="miniBtn"
                          disabled={busy}
                          onClick={() => openContent(editing)}
                          title="Open the full-page editor (optional)"
                        >
                          Open full editor
                        </button>
                      )}

                      <button
                        type="button"
                        className="miniBtn"
                        disabled={busy}
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
                    disabled={busy}
                  />

                  <div className="hint">Paste from Word is supported. This content is saved together with the report (no extra step).</div>
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

      <AdminPageFooter
        left={
          <>
            <span className="admin-footer-brand">
              Law<span>A</span>frica
            </span>
            <span className="admin-footer-dot">•</span>
            <span className="admin-footer-muted">LLR Services</span>
            <span className="admin-footer-dot">•</span>
            <span className="admin-footer-muted">{loading ? "Loading…" : `${filtered.length} report(s)`}</span>
          </>
        }
        right={
          <span className="admin-footer-muted">
            Tip: Use <span className="laEm">Search</span> to filter. Create/Edit now includes the formatted editor.{" "}
            <span className="laEm">File</span> opens the full-page editor (optional).
          </span>
        }
      />
    </div>
  );
}
