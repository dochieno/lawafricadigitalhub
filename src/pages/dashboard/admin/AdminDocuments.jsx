// src/pages/dashboard/admin/AdminDocuments.jsx
import { useEffect, useMemo, useRef, useState, useCallback} from "react";
import api, { API_BASE_URL } from "../../../api/client";
import "../../../styles/adminCrud.css";
import "../../../styles/adminUsers.css";

function getServerOrigin() {
  return String(API_BASE_URL || "").replace(/\/api\/?$/i, "");
}
function buildCoverUrl(coverImagePath) {
  if (!coverImagePath) return null;
  const clean = String(coverImagePath).replace(/^Storage\//i, "").replace(/^\/+/, "");
  return `${getServerOrigin()}/storage/${clean}`;
}

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

function formatMoney(val) {
  const n = typeof val === "number" ? val : Number(val);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function safeBool(v, fallback = false) {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v.toLowerCase() === "true";
  if (typeof v === "number") return v !== 0;
  return fallback;
}

function toIntOrNull(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

function toDecimalOrNull(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Try multiple endpoints (in case environments differ)
async function postMultipartWithFallback(paths, formData) {
  let lastErr = null;
  for (const p of paths) {
    try {
      return await api.post(p, formData, { headers: { "Content-Type": "multipart/form-data" } });
    } catch (e) {
      lastErr = e;
      const status = e?.response?.status;
      if (status === 404 || status === 405) continue; // try next route
      throw e; // real error (500/401/etc)
    }
  }
  throw lastErr || new Error("Upload failed.");
}

async function getVatRatesWithFallback() {
  const paths = ["/admin/vat-rates"];

  for (const p of paths) {
    try {
      const res = await api.get(p);
      const arr = Array.isArray(res.data) ? res.data : [];
      return arr
        .map((x) => ({
          id: x?.id ?? x?.Id,
          code: x?.code ?? x?.Code ?? x?.name ?? x?.Name ?? null,
          ratePercent: x?.ratePercent ?? x?.RatePercent ?? x?.rate ?? x?.Rate ?? null,
        }))
        .filter((x) => x.id != null);
    } catch (e) {
      const status = e?.response?.status;
      if (status === 404 || status === 405) continue;
      break;
    }
  }

  return [];
}

async function getDocSubCategories(categoryId) {
  // relies on LookupsController (authorized)
  const res = await api.get("/lookups/legal-document-subcategories", {
    params: categoryId ? { categoryId } : {},
  });
  const items = res?.data?.items || [];
  return Array.isArray(items) ? items : [];
}

/** ✅ Must match backend enum values EXACTLY */
const CATEGORY_OPTIONS = ["Commentaries", "InternationalTitles", "Journals", "LawReports", "Statutes", "LLRServices","Gazette"];

// enum id mapping (must match backend enum numeric values)
const CATEGORY_ID_BY_NAME = {
  Commentaries: 1,
  InternationalTitles: 2,
  Journals: 3,
  LawReports: 4,
  Statutes: 5,
  LLRServices: 6,
  Gazette: 7,
};

function pickKind(r) {
  return r?.kind ?? r?.Kind ?? null;
}
function pickFileType(r) {
  const ft = r?.fileType ?? r?.FileType ?? null;
  return ft == null ? "" : String(ft);
}

function isReportRow(r) {
  const k = pickKind(r);
  const ft = pickFileType(r).toLowerCase();
  return k === "Report" || k === 2 || ft === "report";
}

async function enrichAdminListIfNeeded(all) {
  if (!Array.isArray(all) || all.length === 0) return all;

  const needs = all.filter((r) => {
    const k = pickKind(r);
    const ft = pickFileType(r);
    return (k === null || k === undefined || k === "") && (!ft || ft === "");
  });

  if (needs.length === 0) return all;

  const byId = new Map(all.map((r) => [r.id, { ...r }]));
  const ids = needs.map((r) => r.id).filter(Boolean);

  const CHUNK = 8;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const results = await Promise.all(
      slice.map(async (id) => {
        try {
          const res = await api.get(`/legal-documents/${id}`);
          return res.data;
        } catch {
          return null;
        }
      })
    );

    for (const d of results) {
      if (!d?.id) continue;
      const existing = byId.get(d.id) || {};
      byId.set(d.id, { ...existing, ...d });
    }
  }

  return Array.from(byId.values());
}

const emptyForm = {
  title: "",
  description: "",
  author: "",
  publisher: "",
  edition: "",
  version: "1",

  category: "Commentaries",
  subCategoryId: "", // ✅ NEW (nullable)

  countryId: "",

  pageCount: "",

  isPremium: true,
  status: "Published",
  publishedAt: "",

  allowPublicPurchase: false,
  publicPrice: "",
  publicCurrency: "KES",

  // ✅ VAT
  vatRateId: "",
  isTaxInclusive: true,
};

/* =========================
   Tiny icons (no deps)
========================= */
function ISearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M21 21l-4.3-4.3m1.3-5.4a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function IRefresh({ spin = false } = {}) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className={spin ? "au-spin" : undefined}
    >
      <path d="M21 12a9 9 0 1 1-2.64-6.36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M21 3v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function IEdit() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function ICopy() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 9h13v13H9V9z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M5 15H2V2h13v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Badge({ children, kind = "neutral", title }) {
  const cls =
    kind === "success"
      ? "au-badge au-badge-success"
      : kind === "warn"
      ? "au-badge au-badge-warn"
      : kind === "info"
      ? "au-badge au-badge-info"
      : kind === "danger"
      ? "au-badge au-badge-danger"
      : "au-badge au-badge-neutral";

  return (
    <span className={cls} title={title}>
      {children}
    </span>
  );
}

export default function AdminDocuments() {
  const [rows, setRows] = useState([]);
  const [countries, setCountries] = useState([]);
  const [vatRates, setVatRates] = useState([]);

  // ✅ NEW: subcategories cache per categoryId
  const [subcatsByCategory, setSubcatsByCategory] = useState({}); // { [categoryId]: items[] }
  const [subcatsLoading, setSubcatsLoading] = useState(false);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState("");

  // ✅ No toast — use simple banners (top of page + in modal)
  const [banner, setBanner] = useState(null); // {type:"success"|"error"|"info", text:string}

  // Modal state
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });

  // Upload state
  const [ebookFile, setEbookFile] = useState(null);
  const [coverFile, setCoverFile] = useState(null);
  const [uploadingEbook, setUploadingEbook] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);

  const ebookInputRef = useRef(null);
  const coverInputRef = useRef(null);

  function setField(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
  }

const showBanner = useCallback((type, text, ms = 3500) => {
  setBanner({ type, text: String(text || "") });
  window.clearTimeout(showBanner._t);
  if (ms > 0) {
    showBanner._t = window.setTimeout(() => setBanner(null), ms);
  }
}, []);

const showError = useCallback(
  (msg) => {
    showBanner("error", msg, 4500);
  },
  [showBanner]
);

const showSuccess = useCallback(
  (msg) => {
    showBanner("success", msg, 2500);
  },
  [showBanner]
);

  async function ensureSubcatsLoadedForCategoryId(categoryId) {
    if (!categoryId) return;
    const key = String(categoryId);
    if (subcatsByCategory[key]) return;

    setSubcatsLoading(true);
    try {
      const items = await getDocSubCategories(categoryId);
      setSubcatsByCategory((prev) => ({ ...prev, [key]: items }));
    } catch (e) {
      // fail-soft (don’t break page)
      showError(getApiErrorMessage(e, "Failed to load subcategories."));
    } finally {
      setSubcatsLoading(false);
    }
  }

const loadAll = useCallback(async () => {
  setBanner(null);
  setLoading(true);

  try {
    const [docsRes, countriesRes, vatRes] = await Promise.all([
      api.get("/legal-documents/admin"),
      api.get("/Country"),
      getVatRatesWithFallback(),
    ]);

    let all = Array.isArray(docsRes.data) ? docsRes.data : [];
    all = await enrichAdminListIfNeeded(all);

    setRows(all.filter((r) => !isReportRow(r)));
    setCountries(Array.isArray(countriesRes.data) ? countriesRes.data : []);
    setVatRates(Array.isArray(vatRes) ? vatRes : []);
  } catch (e) {
    setRows([]);
    showError(getApiErrorMessage(e, "Failed to load admin documents."));
  } finally {
    setLoading(false);
  }
}, [showError]); // ✅ REQUIRED

useEffect(() => {
  loadAll();
}, [loadAll]);

  // when category changes in form, load subcats and clean invalid selection
  useEffect(() => {
    if (!open) return;

    const categoryName = form.category;
    const categoryId = CATEGORY_ID_BY_NAME[categoryName] || null;

    if (!categoryId) {
      setField("subCategoryId", "");
      return;
    }

    ensureSubcatsLoadedForCategoryId(categoryId);

    // if category is not Statutes, keep subCategory nullable but clear by default
    // (still allows other categories later if you seed them)
    if (categoryName !== "Statutes") {
      setField("subCategoryId", "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.category]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;

    return rows.filter((r) => {
      const title = String(r.title ?? "").toLowerCase();
      const status = String(r.status ?? "").toLowerCase();
      const premium = r.isPremium ? "premium" : "free";

      const allow = safeBool(r.allowPublicPurchase ?? r.AllowPublicPurchase, false);
      const currency = String((r.publicCurrency ?? r.PublicCurrency ?? "") || "").toLowerCase();
      const price = String((r.publicPrice ?? r.PublicPrice ?? "") || "").toLowerCase();

      const pages = String(r.pageCount ?? "").toLowerCase();
      const pricing = `${allow ? "on" : "off"} ${currency} ${price} ${pages}`;
      const meta = `${status} ${premium} ${pricing}`.toLowerCase();

      return title.includes(s) || meta.includes(s);
    });
  }, [rows, q]);

  const kpis = useMemo(() => {
    const total = filtered.length;
    let premium = 0;
    let publicOn = 0;
    let pagesKnown = 0;

    for (const r of filtered) {
      if (r.isPremium) premium += 1;
      const allow = safeBool(r.allowPublicPurchase ?? r.AllowPublicPurchase, false);
      if (r.isPremium && allow) publicOn += 1;
      if (r.pageCount != null && r.pageCount !== "") pagesKnown += 1;
    }

    return { total, premium, publicOn, pagesKnown };
  }, [filtered]);

  function resetUploadInputs() {
    setEbookFile(null);
    setCoverFile(null);
    if (ebookInputRef.current) ebookInputRef.current.value = "";
    if (coverInputRef.current) coverInputRef.current.value = "";
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm });
    resetUploadInputs();
    setOpen(true);
    setBanner(null);

    // preload statutes subcats for a smoother first use
    ensureSubcatsLoadedForCategoryId(CATEGORY_ID_BY_NAME.Statutes);
  }

  async function openEdit(row) {
    resetUploadInputs();
    setEditing(row);
    setOpen(true);
    setBanner(null);

    try {
      const res = await api.get(`/legal-documents/${row.id}`);
      const d = res.data;

      if (isReportRow(d)) {
        showError("This item is a Report. Please manage it from Admin → LLR Services.");
        setOpen(false);
        return;
      }

      const catName = d.category ?? "Commentaries";
      const catId = CATEGORY_ID_BY_NAME[catName] || null;
      if (catId) await ensureSubcatsLoadedForCategoryId(catId);

      setForm({
        title: d.title ?? "",
        description: d.description ?? "",
        author: d.author ?? "",
        publisher: d.publisher ?? "",
        edition: d.edition ?? "",
        version: d.version ?? "1",

        category: catName,
        subCategoryId: d.subCategoryId ?? d.SubCategoryId ?? "",

        countryId: d.countryId ?? "",

        pageCount: d.pageCount ?? "",

        isPremium: !!d.isPremium,
        status: d.status ?? "Published",
        publishedAt: d.publishedAt ? String(d.publishedAt).slice(0, 10) : "",

        allowPublicPurchase: !!(d.allowPublicPurchase ?? d.AllowPublicPurchase ?? false),
        publicPrice: d.publicPrice ?? d.PublicPrice ?? "",
        publicCurrency: d.publicCurrency ?? d.PublicCurrency ?? "KES",

        vatRateId: d.vatRateId ?? d.VatRateId ?? "",
        isTaxInclusive: safeBool(d.isTaxInclusive ?? d.IsTaxInclusive, true),
      });

      setEditing((p) => ({
        ...(p || row),
        coverImagePath: d.coverImagePath ?? d.CoverImagePath ?? (p?.coverImagePath ?? row?.coverImagePath ?? null),
      }));
    } catch (e) {
      showError(getApiErrorMessage(e, "Loaded partial row (details endpoint failed)."));
    }
  }

  function closeModal() {
    if (busy || uploadingCover || uploadingEbook) return;
    setOpen(false);
  }

  function buildCreatePayload() {
    const isPremium = !!form.isPremium;
    const allowPublicPurchase = isPremium ? !!form.allowPublicPurchase : false;

    return {
      title: form.title.trim(),
      description: form.description?.trim() || null,
      author: form.author?.trim() || null,
      publisher: form.publisher?.trim() || null,
      edition: form.edition?.trim() || null,

      category: form.category,
      subCategoryId: toIntOrNull(form.subCategoryId), // ✅ NEW

      countryId: Number(form.countryId),

      // ✅ Standard page forces Kind=Standard
      kind: "Standard",

      filePath: "",
      fileType: "pdf",
      fileSizeBytes: 0,

      pageCount: toIntOrNull(form.pageCount),
      chapterCount: null,

      isPremium,
      version: form.version?.trim() || "1",
      status: form.status,
      publishedAt: form.publishedAt ? new Date(form.publishedAt).toISOString() : null,

      allowPublicPurchase,
      publicPrice: allowPublicPurchase ? toDecimalOrNull(form.publicPrice) : null,
      publicCurrency: allowPublicPurchase ? (form.publicCurrency?.trim() || "KES") : "KES",

      vatRateId: toIntOrNull(form.vatRateId),
      isTaxInclusive: safeBool(form.isTaxInclusive, true),
    };
  }

  function buildUpdatePayload() {
    const isPremium = !!form.isPremium;
    const allowPublicPurchase = isPremium ? !!form.allowPublicPurchase : false;

    return {
      title: form.title.trim(),
      description: form.description?.trim() || null,
      author: form.author?.trim() || null,
      publisher: form.publisher?.trim() || null,
      edition: form.edition?.trim() || null,

      category: form.category,
      subCategoryId: toIntOrNull(form.subCategoryId), // ✅ NEW

      countryId: Number(form.countryId),

      pageCount: toIntOrNull(form.pageCount),

      isPremium,
      version: form.version?.trim() || "1",
      status: form.status,
      publishedAt: form.publishedAt ? new Date(form.publishedAt).toISOString() : null,

      allowPublicPurchase,
      publicPrice: allowPublicPurchase ? toDecimalOrNull(form.publicPrice) : null,
      publicCurrency: allowPublicPurchase ? (form.publicCurrency?.trim() || "KES") : "KES",

      vatRateId: toIntOrNull(form.vatRateId),
      isTaxInclusive: safeBool(form.isTaxInclusive, true),
      kind: "Standard", // keep backend satisfied if it expects this in update payloads
    };
  }

  async function save() {
    if (!form.title.trim()) return showError("Title is required.");
    if (!form.countryId) return showError("Country is required.");

    if (!CATEGORY_OPTIONS.includes(form.category)) {
      return showError("Invalid category selected. Please choose a valid category.");
    }

    // SubCategory is optional; but if set, require it to exist in current list to avoid backend 400
    if (form.subCategoryId) {
      const catId = CATEGORY_ID_BY_NAME[form.category];
      const list = subcatsByCategory[String(catId)] || [];
      const ok = list.some((x) => String(x.id) === String(form.subCategoryId));
      if (!ok) return showError("Invalid subcategory selection. Please re-select.");
    }

    if (!form.isPremium) {
      setField("allowPublicPurchase", false);
      setField("publicPrice", "");
      setField("publicCurrency", "KES");
    }

    if (form.isPremium && form.allowPublicPurchase) {
      const priceNum = Number(form.publicPrice);
      if (!form.publicCurrency?.trim()) return showError("Currency is required when public purchase is ON.");
      if (!Number.isFinite(priceNum) || priceNum <= 0) return showError("Price must be greater than 0.");
    }

    setBusy(true);
    try {
      if (editing?.id) {
        await api.put(`/legal-documents/${editing.id}`, buildUpdatePayload());
        showSuccess("Document updated.");
        await loadAll();
        closeModal();
        return;
      }

      const res = await api.post("/legal-documents", buildCreatePayload());
      const newId = res.data?.id ?? res.data?.data?.id;

      if (newId) {
        setEditing({ id: newId, title: form.title, coverImagePath: null });
        showSuccess(`Document created (#${newId}). Now upload the ebook and cover below.`);
        await loadAll();
      } else {
        showSuccess("Document created. Refresh the list, then edit to upload files.");
        await loadAll();
        closeModal();
      }
    } catch (e) {
      showError(getApiErrorMessage(e, "Save failed."));
    } finally {
      setBusy(false);
    }
  }

  async function uploadEbook() {
    if (!editing?.id) return showError("Save the document first, then upload an ebook.");
    if (!ebookFile) return showError("Select a PDF or EPUB first.");

    setUploadingEbook(true);

    try {
      const fd = new FormData();
      fd.append("file", ebookFile, ebookFile.name);
      fd.append("File", ebookFile, ebookFile.name);

      await postMultipartWithFallback([`/legal-documents/${editing.id}/upload`], fd);

      showSuccess("Ebook uploaded successfully.");
      setEbookFile(null);
      if (ebookInputRef.current) ebookInputRef.current.value = "";
      await loadAll();
    } catch (e) {
      showError(getApiErrorMessage(e, "Ebook upload failed."));
    } finally {
      setUploadingEbook(false);
    }
  }

  async function uploadCover() {
    if (!editing?.id) return showError("Save the document first, then upload a cover.");
    if (!coverFile) return showError("Select an image file first.");

    setUploadingCover(true);

    try {
      const fd = new FormData();
      fd.append("file", coverFile, coverFile.name);
      fd.append("File", coverFile, coverFile.name);

      await postMultipartWithFallback([`/legal-documents/${editing.id}/cover`], fd);

      showSuccess("Cover uploaded successfully.");
      setCoverFile(null);
      if (coverInputRef.current) coverInputRef.current.value = "";
      await loadAll();
    } catch (e) {
      showError(getApiErrorMessage(e, "Cover upload failed."));
    } finally {
      setUploadingCover(false);
    }
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(String(text || ""));
      showSuccess("Copied to clipboard.");
    } catch {
      showError("Copy failed. Please copy manually.");
    }
  }

  function getCurrency(r) {
    return r.publicCurrency ?? r.PublicCurrency ?? null;
  }
  function getPrice(r) {
    const v = r.publicPrice ?? r.PublicPrice ?? null;
    return v == null ? null : v;
  }
  function getAllow(r) {
    return !!(r.allowPublicPurchase ?? r.AllowPublicPurchase ?? false);
  }

  const showPricing = !!form.isPremium;
  const canClose = !(busy || uploadingCover || uploadingEbook);

  const catIdForForm = CATEGORY_ID_BY_NAME[form.category] || null;
  const subcatOptions = catIdForForm ? subcatsByCategory[String(catIdForForm)] || [] : [];
  const showSubcategoryField = form.category === "Statutes"; // primary use-case; keeps UI clean

  return (
    <div className="au-wrap">
      {/* Page banner (no toast) */}
      {banner?.text ? (
        <div
          className={`admin-alert ${banner.type === "error" ? "danger" : banner.type === "success" ? "success" : "info"}`}
          style={{ marginBottom: 12 }}
        >
          {banner.text}
        </div>
      ) : null}

      {/* HERO */}
      <div className="au-hero">
        <div className="au-titleRow">
          <div>
            <div className="au-kicker">LAWFRAICA • ADMIN</div>
            <h1 className="au-title">Books</h1>
            <p className="au-subtitle">
              This page is for <b>Standard</b> documents (PDF/EPUB). Reports are managed under <b>Admin → LLR Services</b>.
            </p>
          </div>

          <div className="au-heroRight" style={{ gap: 10 }}>
            <button className="au-refresh" onClick={loadAll} disabled={busy || loading} title="Refresh">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <IRefresh spin={loading} /> Refresh
              </span>
            </button>

            <button
              className="au-refresh"
              style={{
                background: "linear-gradient(180deg, rgba(139, 28, 28, 0.95) 0%, rgba(161, 31, 31, 0.95) 100%)",
                borderColor: "rgba(139, 28, 28, 0.35)",
              }}
              onClick={openCreate}
              disabled={busy}
              title="Create a new document"
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <IPlus /> New
              </span>
            </button>
          </div>
        </div>

        {/* TOPBAR */}
        <div className="au-topbar">
          <div className="au-search">
            <span className="au-searchIcon" aria-hidden="true">
              <ISearch />
            </span>
            <input
              placeholder="Search by title, status, premium, pages, currency, price…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={loading}
            />
            {q ? (
              <button className="au-clear" onClick={() => setQ("")} title="Clear">
                Clear
              </button>
            ) : null}
          </div>

          <div className="au-topbarRight">
            <div className="au-mePill" title="Quick stats">
              <span className={`au-meDot ${loading ? "" : "ga"}`} />
              <span className="au-meText">{loading ? "Loading…" : `${filtered.length} document(s)`}</span>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="au-kpis">
          <div className="au-kpiCard">
            <div className="au-kpiLabel">Shown</div>
            <div className="au-kpiValue">{loading ? "…" : kpis.total}</div>
          </div>
          <div className="au-kpiCard">
            <div className="au-kpiLabel">Premium</div>
            <div className="au-kpiValue">{loading ? "…" : kpis.premium}</div>
          </div>
          <div className="au-kpiCard">
            <div className="au-kpiLabel">Public purchase ON</div>
            <div className="au-kpiValue">{loading ? "…" : kpis.publicOn}</div>
          </div>
          <div className="au-kpiCard">
            <div className="au-kpiLabel">Page count set</div>
            <div className="au-kpiValue">{loading ? "…" : kpis.pagesKnown}</div>
          </div>
        </div>
      </div>

      {/* PANEL */}
      <div className="au-panel">
        <div className="au-panelTop">
          <div className="au-panelTitle">Standard documents</div>
          <div className="au-pageMeta">{loading ? "Loading…" : `${filtered.length} record(s)`}</div>
        </div>

        <div className="au-tableWrap">
          <table className="au-table">
            <thead>
              <tr>
                <th style={{ width: "46%" }}>Title</th>
                <th style={{ width: "12%" }}>Status</th>
                <th style={{ width: "10%" }}>Premium</th>
                <th className="au-thRight" style={{ width: "8%" }}>
                  Pages
                </th>
                <th style={{ width: "10%" }}>Public</th>
                <th className="au-thRight" style={{ width: "14%" }}>
                  Price
                </th>
                <th className="au-thRight" style={{ width: "16%" }}>
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="au-empty">No documents found.</div>
                  </td>
                </tr>
              )}

              {filtered.map((r) => {
                const allow = getAllow(r);
                const currency = getCurrency(r);
                const price = getPrice(r);
                const isPremium = !!r.isPremium;
                const pages = r.pageCount ?? "—";

                const status = String(r.status || "—");
                const statusLower = status.toLowerCase();
                const statusKind = statusLower === "published" ? "success" : "neutral";

                return (
                  <tr key={r.id}>
                    <td>
                      <div className="au-userCell">
                        <span className={`au-dot ${statusLower === "published" ? "on" : ""}`} />
                        <div className="au-userMeta">
                          <div className="au-userName">{r.title || "—"}</div>
                          <div className="au-userSub">
                            <span className="au-muted au-mono">#{r.id}</span>
                            {r.category ? (
                              <>
                                <span className="au-sep">•</span>
                                <span className="au-muted">{r.categoryName || r.category}</span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <Badge kind={statusKind}>{status}</Badge>
                    </td>

                    <td>
                      <Badge kind={isPremium ? "warn" : "neutral"}>{isPremium ? "Yes" : "No"}</Badge>
                    </td>

                    <td className="au-tdRight">
                      <span className="au-mono">{pages}</span>
                    </td>

                    <td>
                      {!isPremium ? (
                        <Badge>N/A</Badge>
                      ) : allow ? (
                        <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <Badge kind="success">On</Badge>
                          <span className="au-muted" style={{ fontWeight: 950 }}>
                            {currency || "—"}
                          </span>
                        </span>
                      ) : (
                        <Badge>Off</Badge>
                      )}
                    </td>

                    <td className="au-tdRight">
                      {!isPremium ? (
                        <Badge>N/A</Badge>
                      ) : !allow ? (
                        <Badge>Off</Badge>
                      ) : price == null ? (
                        <span className="au-muted">—</span>
                      ) : (
                        <span style={{ fontWeight: 950 }}>{formatMoney(price)}</span>
                      )}
                    </td>

                    <td className="au-tdRight">
                      <div className="au-actionsRow">
                        <button
                          className="au-iconBtn au-iconBtn-neutral"
                          onClick={() => openEdit(r)}
                          disabled={busy}
                          title="Edit"
                        >
                          <IEdit />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="au-panelBottom">
          <span className="au-pageMeta">Tip: Reports are managed under Admin → LLR Services (not here).</span>
          <span className="au-pageMeta">Covers are served from /storage (not /api/storage).</span>
        </div>
      </div>

      {/* MODAL */}
      {open && (
        <div className="admin-modal-overlay" onClick={closeModal}>
          <div className="admin-modal admin-modal-tight" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head admin-modal-head-x">
              <div>
                <h3 className="admin-modal-title">{editing ? `Edit Document #${editing.id}` : "Create Document"}</h3>
                <div className="admin-modal-subtitle">
                  {editing ? "Update details, pricing and upload files." : "Create first, then upload ebook & cover."}
                </div>
              </div>

              <button
                type="button"
                className="admin-modal-xbtn"
                onClick={closeModal}
                disabled={!canClose}
                aria-label="Close"
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="admin-modal-body admin-modal-scroll">
              {/* Inline modal banner (no toast) */}
              {banner?.text ? (
                <div
                  className={`admin-alert ${banner.type === "error" ? "danger" : banner.type === "success" ? "success" : "info"}`}
                  style={{ marginBottom: 12 }}
                >
                  {banner.text}
                </div>
              ) : null}

              <div className="admin-form-section">
                <div className="admin-form-section-title">Document details</div>
                <div className="admin-form-section-sub">
                  Each row has two fields (unless otherwise). Statutes can optionally use a subcategory.
                </div>
              </div>

              <div className="admin-grid">
                {/* Row 1 (full width) */}
                <div className="admin-field admin-span2">
                  <label>Title *</label>
                  <input value={form.title} onChange={(e) => setField("title", e.target.value)} />
                </div>

                {/* Row 2 */}
                <div className="admin-field">
                  <label>Country *</label>
                  <select value={String(form.countryId)} onChange={(e) => setField("countryId", e.target.value)}>
                    <option value="">Select…</option>
                    {countries.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="admin-field">
                  <label>Status</label>
                  <select value={form.status} onChange={(e) => setField("status", e.target.value)}>
                    <option value="Published">Published</option>
                    <option value="Draft">Draft</option>
                    <option value="Archived">Archived</option>
                  </select>
                </div>

                {/* Row 3 */}
                <div className="admin-field">
                  <label>Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setField("category", e.target.value)}
                    disabled={subcatsLoading}
                  >
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <div className="admin-help">These options match the backend enum (prevents 400 errors).</div>
                </div>

                <div className="admin-field">
                  <label>No of Pages</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.pageCount}
                    onChange={(e) => setField("pageCount", e.target.value)}
                    placeholder="e.g. 120"
                  />
                  <div className="admin-help">Optional. Used for display and search.</div>
                </div>

                {/* Row 4 (subcategory only for statutes) */}
                {showSubcategoryField ? (
                  <>
                    <div className="admin-field">
                      <label>Subcategory (Statutes)</label>
                      <select
                        value={String(form.subCategoryId ?? "")}
                        onChange={(e) => setField("subCategoryId", e.target.value)}
                        disabled={subcatsLoading}
                      >
                        <option value="">None</option>
                        {subcatOptions
                          .filter((x) => x.isActive !== false)
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                      </select>
                      <div className="admin-help">
                        Optional. Used to improve Statutes search (e.g., Constitutional, Criminal, Taxation…).
                      </div>
                    </div>

                    <div className="admin-field">
                      <label>Premium?</label>
                      <select value={String(!!form.isPremium)} onChange={(e) => setField("isPremium", e.target.value === "true")}>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="admin-field">
                      <label>Premium?</label>
                      <select value={String(!!form.isPremium)} onChange={(e) => setField("isPremium", e.target.value === "true")}>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                    </div>

                    <div className="admin-field">
                      <label>Version</label>
                      <input value={form.version} onChange={(e) => setField("version", e.target.value)} />
                    </div>
                  </>
                )}

                {/* Row 5 */}
                <div className="admin-field">
                  <label>Version</label>
                  <input value={form.version} onChange={(e) => setField("version", e.target.value)} />
                </div>

                <div className="admin-field">
                  <label>Published date</label>
                  <input type="date" value={form.publishedAt} onChange={(e) => setField("publishedAt", e.target.value)} />
                </div>

                {/* Row 6 (full width) */}
                <div className="admin-field admin-span2">
                  <label>Description</label>
                  <textarea rows={4} value={form.description} onChange={(e) => setField("description", e.target.value)} />
                </div>

                {/* Row 7 */}
                <div className="admin-field">
                  <label>Author</label>
                  <input value={form.author} onChange={(e) => setField("author", e.target.value)} />
                </div>

                <div className="admin-field">
                  <label>Publisher</label>
                  <input value={form.publisher} onChange={(e) => setField("publisher", e.target.value)} />
                </div>

                {/* Row 8 */}
                <div className="admin-field">
                  <label>Edition</label>
                  <input value={form.edition} onChange={(e) => setField("edition", e.target.value)} />
                </div>

                <div className="admin-field">
                  <label style={{ opacity: 0.85 }}>Kind</label>
                  <input value="Standard" disabled />
                  <div className="admin-help">This screen manages Standard documents only.</div>
                </div>
              </div>

              <div className="admin-form-section">
                <div className="admin-form-section-title">Pricing rules</div>
                <div className="admin-form-section-sub">Only premium documents can be sold publicly.</div>
                {!showPricing ? (
                  <div className="admin-alert warn" style={{ marginTop: 10 }}>
                    This document is FREE (Premium = No). Pricing is disabled and will not be saved.
                  </div>
                ) : null}
              </div>

              <div className="admin-grid">
                {/* Row 1 */}
                <div className="admin-field">
                  <label>Allow public purchase?</label>
                  <select
                    value={String(!!form.allowPublicPurchase)}
                    onChange={(e) => setField("allowPublicPurchase", e.target.value === "true")}
                    disabled={!form.isPremium}
                  >
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </div>

                <div className="admin-field">
                  <label>Currency</label>
                  <input
                    value={form.publicCurrency}
                    onChange={(e) => setField("publicCurrency", e.target.value)}
                    disabled={!form.isPremium || !form.allowPublicPurchase}
                  />
                </div>

                {/* Row 2 */}
                <div className="admin-field">
                  <label>Public price</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.publicPrice}
                    onChange={(e) => setField("publicPrice", e.target.value)}
                    disabled={!form.isPremium || !form.allowPublicPurchase}
                  />
                </div>

                <div className="admin-field">
                  <label>VAT Code</label>
                  <select value={String(form.vatRateId ?? "")} onChange={(e) => setField("vatRateId", e.target.value)}>
                    <option value="">None</option>
                    {vatRates.map((v) => (
                      <option key={v.id} value={v.id}>
                        {String(v.code || `VAT-${v.id}`)}
                        {v.ratePercent != null ? ` (${v.ratePercent}%)` : ""}
                      </option>
                    ))}
                  </select>
                  <div className="admin-help">Optional. Used for VAT calculation on purchases + invoice printout.</div>
                </div>

                {/* Row 3 */}
                <div className="admin-field">
                  <label>Tax Inclusive?</label>
                  <select value={String(!!form.isTaxInclusive)} onChange={(e) => setField("isTaxInclusive", e.target.value === "true")}>
                    <option value="true">Yes (price includes VAT)</option>
                    <option value="false">No (VAT added on top)</option>
                  </select>
                  <div className="admin-help">Controls how invoice totals are computed when VAT Code is set.</div>
                </div>

                <div className="admin-field">
                  <label style={{ opacity: 0.85 }}>VAT Preview</label>
                  <input
                    value={
                      form.vatRateId
                        ? `VAT: ${
                            vatRates.find((x) => String(x.id) === String(form.vatRateId))?.ratePercent ?? "—"
                          }%`
                        : "No VAT"
                    }
                    disabled
                  />
                </div>
              </div>

              <div className="admin-form-section">
                <div className="admin-form-section-title">Files</div>
                <div className="admin-form-section-sub">Save first (to get an ID), then upload ebook and cover.</div>
              </div>

              <div className="admin-grid">
                <div className="admin-field admin-span2">
                  <label>Ebook file (PDF/EPUB)</label>
                  <div className="admin-upload-box">
                    <input
                      ref={ebookInputRef}
                      type="file"
                      accept=".pdf,.epub"
                      onChange={(e) => setEbookFile(e.target.files?.[0] || null)}
                      disabled={!editing || uploadingEbook || uploadingCover || busy}
                      title={!editing ? "Save first, then upload." : ""}
                    />

                    <div className="admin-upload-actions">
                      <button
                        className="admin-btn"
                        type="button"
                        onClick={uploadEbook}
                        disabled={!editing || uploadingEbook || uploadingCover || busy}
                      >
                        {uploadingEbook ? "Uploading…" : "Upload ebook"}
                      </button>
                      <span className="admin-help">{ebookFile ? ebookFile.name : "No file selected."}</span>
                    </div>
                  </div>
                </div>

                <div className="admin-field admin-span2">
                  <label>Cover image</label>
                  <div className="admin-upload-box">
                    <input
                      ref={coverInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
                      disabled={!editing || uploadingCover || uploadingEbook || busy}
                      title={!editing ? "Save first, then upload." : ""}
                    />

                    <div className="admin-upload-actions" style={{ flexWrap: "wrap" }}>
                      <button
                        className="admin-btn"
                        type="button"
                        onClick={uploadCover}
                        disabled={!editing || uploadingCover || uploadingEbook || busy}
                      >
                        {uploadingCover ? "Uploading…" : "Upload cover"}
                      </button>

                      <span className="admin-help">{coverFile ? coverFile.name : "No file selected."}</span>

                      {editing?.coverImagePath ? (
                        <button
                          type="button"
                          className="admin-btn"
                          onClick={() => copyToClipboard(buildCoverUrl(editing.coverImagePath))}
                          disabled={!editing?.coverImagePath}
                          title="Copy cover URL"
                          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                        >
                          <ICopy /> Copy URL
                        </button>
                      ) : null}
                    </div>

                    {editing?.coverImagePath ? (
                      <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center" }}>
                        <img
                          src={buildCoverUrl(editing.coverImagePath)}
                          alt="cover"
                          style={{
                            width: 110,
                            height: 140,
                            objectFit: "cover",
                            borderRadius: 12,
                            border: "1px solid #e5e7eb",
                          }}
                          onError={(e) => (e.currentTarget.style.display = "none")}
                        />
                        <div className="admin-help" style={{ maxWidth: 520 }}>
                          Current cover is shown if available.
                        </div>
                      </div>
                    ) : (
                      <div className="admin-help" style={{ marginTop: 8 }}>
                        No cover uploaded yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="admin-modal-foot">
              <button className="admin-btn" onClick={closeModal} disabled={!canClose}>
                Cancel
              </button>

              <button className="admin-btn primary" onClick={save} disabled={!canClose}>
                {busy ? "Saving…" : editing ? "Save changes" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}