// src/pages/dashboard/admin/AdminDocuments.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import api, { API_BASE_URL } from "../../../api/client";
import "../../../styles/adminCrud.css";

/**
 * Covers are served from /storage (NOT /api/storage)
 * API_BASE_URL is usually: https://localhost:7033/api
 */
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

  // ASP.NET validation often looks like { errors: { Field: [msg] } }
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

/** ✅ Must match backend enum values EXACTLY */
const CATEGORY_OPTIONS = [
  "Commentaries",
  "InternationalTitles",
  "Journals",
  "LawReports",
  "Statutes",
  "LLRServices",
];

const emptyForm = {
  title: "",
  description: "",
  author: "",
  publisher: "",
  edition: "",
  version: "1",

  category: "Commentaries",
  countryId: "",

  // ✅ NEW
  pageCount: "",

  isPremium: true,
  status: "Published",
  publishedAt: "",

  allowPublicPurchase: false,
  publicPrice: "",
  publicCurrency: "KES",
};

export default function AdminDocuments() {
  const [rows, setRows] = useState([]);
  const [countries, setCountries] = useState([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

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

  async function loadAll() {
    setError("");
    setInfo("");
    setLoading(true);
    try {
      const [docsRes, countriesRes] = await Promise.all([
        api.get("/legal-documents/admin"),
        api.get("/Country"),
      ]);

      setRows(Array.isArray(docsRes.data) ? docsRes.data : []);
      setCountries(Array.isArray(countriesRes.data) ? countriesRes.data : []);
    } catch (e) {
      setRows([]);
      setError(getApiErrorMessage(e, "Failed to load admin documents."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

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

  function resetUploadInputs() {
    setEbookFile(null);
    setCoverFile(null);
    if (ebookInputRef.current) ebookInputRef.current.value = "";
    if (coverInputRef.current) coverInputRef.current.value = "";
  }

  function openCreate() {
    setError("");
    setInfo("");
    setEditing(null);
    setForm({ ...emptyForm });
    resetUploadInputs();
    setOpen(true);
  }

  async function openEdit(row) {
    setError("");
    setInfo("");
    setEditing(row);
    resetUploadInputs();
    setOpen(true);

    try {
      const res = await api.get(`/legal-documents/${row.id}`);
      const d = res.data;

      setForm({
        title: d.title ?? "",
        description: d.description ?? "",
        author: d.author ?? "",
        publisher: d.publisher ?? "",
        edition: d.edition ?? "",
        version: d.version ?? "1",

        category: d.category ?? "Commentaries",
        countryId: d.countryId ?? "",

        // ✅ NEW
        pageCount: d.pageCount ?? "",

        isPremium: !!d.isPremium,
        status: d.status ?? "Published",
        publishedAt: d.publishedAt ? String(d.publishedAt).slice(0, 10) : "",

        allowPublicPurchase: !!(d.allowPublicPurchase ?? d.AllowPublicPurchase ?? false),
        publicPrice: d.publicPrice ?? d.PublicPrice ?? "",
        publicCurrency: d.publicCurrency ?? d.PublicCurrency ?? "KES",
      });
    } catch {
      setInfo("Loaded partial row (details endpoint failed).");
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
      countryId: Number(form.countryId),

      filePath: "",
      fileType: "pdf",
      fileSizeBytes: 0,

      // ✅ send user entered pages
      pageCount: toIntOrNull(form.pageCount),
      chapterCount: null,

      isPremium,
      version: form.version?.trim() || "1",
      status: form.status,
      publishedAt: form.publishedAt ? new Date(form.publishedAt).toISOString() : null,

      // ✅ For free docs: always off/null
      allowPublicPurchase,
      publicPrice: allowPublicPurchase ? toDecimalOrNull(form.publicPrice) : null,
      publicCurrency: allowPublicPurchase ? (form.publicCurrency?.trim() || "KES") : "KES",
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
      countryId: Number(form.countryId),

      // ✅ NEW: update pages
      pageCount: toIntOrNull(form.pageCount),

      isPremium,
      version: form.version?.trim() || "1",
      status: form.status,
      publishedAt: form.publishedAt ? new Date(form.publishedAt).toISOString() : null,

      allowPublicPurchase,
      publicPrice: allowPublicPurchase ? toDecimalOrNull(form.publicPrice) : null,
      publicCurrency: allowPublicPurchase ? (form.publicCurrency?.trim() || "KES") : "KES",
    };
  }

  async function save() {
    setError("");
    setInfo("");

    if (!form.title.trim()) return setError("Title is required.");
    if (!form.countryId) return setError("Country is required.");

    // ✅ Hard guard: category must match enum
    if (!CATEGORY_OPTIONS.includes(form.category)) {
      return setError("Invalid category selected. Please choose a valid category.");
    }

    // ✅ If not premium, pricing must be off
    if (!form.isPremium) {
      setField("allowPublicPurchase", false);
      setField("publicPrice", "");
      setField("publicCurrency", "KES");
    }

    if (form.isPremium && form.allowPublicPurchase) {
      const priceNum = Number(form.publicPrice);
      if (!form.publicCurrency?.trim()) return setError("Currency is required when public purchase is ON.");
      if (!Number.isFinite(priceNum) || priceNum <= 0) return setError("Price must be greater than 0.");
    }

    setBusy(true);
    try {
      if (editing?.id) {
        await api.put(`/legal-documents/${editing.id}`, buildUpdatePayload());
        setInfo("Document updated.");
        await loadAll();
        closeModal();
        return;
      }

      const res = await api.post("/legal-documents", buildCreatePayload());
      const newId = res.data?.id ?? res.data?.data?.id;

      if (newId) {
        setEditing({ id: newId, title: form.title, coverImagePath: null });
        setInfo(`Document created (#${newId}). Now upload the ebook and cover below.`);
        await loadAll();
      } else {
        setInfo("Document created. Refresh the list, then edit to upload files.");
        await loadAll();
        closeModal();
      }
    } catch (e) {
      setError(getApiErrorMessage(e, "Save failed."));
    } finally {
      setBusy(false);
    }
  }

  async function uploadEbook() {
    if (!editing?.id) return setError("Save the document first, then upload an ebook.");
    if (!ebookFile) return setError("Select a PDF or EPUB first.");

    setError("");
    setInfo("");
    setUploadingEbook(true);

    try {
      const fd = new FormData();
      fd.append("file", ebookFile, ebookFile.name);
      fd.append("File", ebookFile, ebookFile.name);

      await postMultipartWithFallback([`/legal-documents/${editing.id}/upload`], fd);

      setInfo("Ebook uploaded successfully.");
      setEbookFile(null);
      if (ebookInputRef.current) ebookInputRef.current.value = "";
      await loadAll();
    } catch (e) {
      setError(getApiErrorMessage(e, "Ebook upload failed."));
    } finally {
      setUploadingEbook(false);
    }
  }

  async function uploadCover() {
    if (!editing?.id) return setError("Save the document first, then upload a cover.");
    if (!coverFile) return setError("Select an image file first.");

    setError("");
    setInfo("");
    setUploadingCover(true);

    try {
      const fd = new FormData();
      fd.append("file", coverFile, coverFile.name);
      fd.append("File", coverFile, coverFile.name);

      await postMultipartWithFallback([`/legal-documents/${editing.id}/cover`], fd);

      setInfo("Cover uploaded successfully.");
      setCoverFile(null);
      if (coverInputRef.current) coverInputRef.current.value = "";
      await loadAll();
    } catch (e) {
      setError(getApiErrorMessage(e, "Cover upload failed."));
    } finally {
      setUploadingCover(false);
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

  return (
    <div className="admin-page admin-page-wide">
      <style>{`
        .admin-table-wrap { max-height: 68vh; overflow: auto; border-radius: 14px; }
        .admin-table thead th { position: sticky; top: 0; z-index: 2; background: #fafafa; }
        .row-zebra { background: #fafafa; }
        .row-hover:hover td { background: #fbfbff; }
        .num-cell { text-align: right; font-variant-numeric: tabular-nums; }
        .price-on { font-weight: 900; }

        .admin-form-section {
          margin: 12px 0 10px;
          padding: 12px 12px;
          border-radius: 12px;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
        }
        .admin-form-section-title { font-weight: 900; color: #111827; margin-bottom: 4px; }
        .admin-form-section-sub { color: #6b7280; font-size: 12px; line-height: 1.35; }

        .admin-upload-box {
          border: 1px dashed #d1d5db;
          background: #fff;
          border-radius: 14px;
          padding: 12px;
        }
        .admin-upload-actions {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 8px;
          flex-wrap: wrap;
        }
        .filehint { color: #6b7280; font-weight: 700; font-size: 12px; }
        .minihelp { color:#6b7280; font-size:12px; margin-top:6px; line-height:1.35; }
        .minihelp.warn {
          background:#fffbeb; border:1px solid #fcd34d; color:#92400e;
          padding:8px 10px; border-radius:12px; margin-top:8px;
          font-size:12px; font-weight:800;
        }
      `}</style>

      <div className="admin-header">
        <div>
          <h1 className="admin-title">Admin · Books (Legal Documents)</h1>
          <p className="admin-subtitle">Create documents, then upload the ebook and cover image.</p>
        </div>

        <div className="admin-actions">
          <button className="admin-btn" onClick={loadAll} disabled={busy || loading}>
            Refresh
          </button>
          <button className="admin-btn primary compact" onClick={openCreate} disabled={busy}>
            + New
          </button>
        </div>
      </div>

      {(error || info) && <div className={`admin-alert ${error ? "error" : "ok"}`}>{error || info}</div>}

      <div className="admin-card admin-card-fill">
        <div className="admin-toolbar">
          <input
            className="admin-search admin-search-wide"
            placeholder="Search by title, status, premium, pages, currency, price…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="admin-pill muted">{loading ? "Loading…" : `${filtered.length} document(s)`}</div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: "50%" }}>Title</th>
                <th style={{ width: "14%" }}>Status</th>
                <th style={{ width: "10%" }}>Premium</th>
                <th style={{ width: "8%" }} className="num-cell">Pages</th>
                <th style={{ width: "10%" }}>Currency</th>
                <th style={{ width: "10%" }} className="num-cell">Public Price</th>
                <th style={{ textAlign: "right", width: "16%" }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ color: "#6b7280", padding: "14px" }}>
                    No documents found.
                  </td>
                </tr>
              )}

              {filtered.map((r, idx) => {
                const allow = getAllow(r);
                const currency = getCurrency(r);
                const price = getPrice(r);
                const isPremium = !!r.isPremium;

                return (
                  <tr key={r.id} className={`${idx % 2 === 1 ? "row-zebra" : ""} row-hover`}>
                    <td style={{ fontWeight: 900 }}>{r.title}</td>

                    <td>
                      <span className={`admin-pill ${String(r.status).toLowerCase() === "published" ? "ok" : "muted"}`}>
                        {r.status}
                      </span>
                    </td>

                    <td>
                      <span className={`admin-pill ${isPremium ? "warn" : "muted"}`}>{isPremium ? "Yes" : "No"}</span>
                    </td>

                    <td className="num-cell">{r.pageCount ?? "—"}</td>

                    <td>
                      {!isPremium ? (
                        <span className="admin-pill muted">N/A</span>
                      ) : allow ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="admin-pill ok">On</span>
                          <span>{currency || "—"}</span>
                        </span>
                      ) : (
                        <span className="admin-pill muted">Off</span>
                      )}
                    </td>

                    <td className="num-cell">
                      {!isPremium ? (
                        <span className="admin-pill muted">N/A</span>
                      ) : !allow ? (
                        <span className="admin-pill muted">Off</span>
                      ) : price == null ? (
                        "—"
                      ) : (
                        <span className="price-on">{formatMoney(price)}</span>
                      )}
                    </td>

                    <td>
                      <div className="admin-row-actions" style={{ justifyContent: "flex-end", gap: 10 }}>
                        <button className="admin-action-btn neutral small" onClick={() => openEdit(r)} disabled={busy}>
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <div className="admin-modal-overlay" onClick={closeModal}>
          <div className="admin-modal admin-modal-tight" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-head">
              <div>
                <h3 className="admin-modal-title">{editing ? `Edit Document #${editing.id}` : "Create Document"}</h3>
                <div className="admin-modal-subtitle">
                  {editing ? "Update details, pricing and upload files." : "Create first, then upload ebook & cover."}
                </div>
              </div>

              <button className="admin-btn" onClick={closeModal} disabled={busy || uploadingCover || uploadingEbook}>
                Close
              </button>
            </div>

            <div className="admin-modal-body admin-modal-scroll">
              <div className="admin-form-section">
                <div className="admin-form-section-title">Document details</div>
                <div className="admin-form-section-sub">
                  Title, jurisdiction, category, pages and descriptive metadata.
                </div>
              </div>

              <div className="admin-grid">
                <div className="admin-field admin-span2">
                  <label>Title *</label>
                  <input value={form.title} onChange={(e) => setField("title", e.target.value)} />
                </div>

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

                <div className="admin-field">
                  <label>Category</label>
                  <select value={form.category} onChange={(e) => setField("category", e.target.value)}>
                    {CATEGORY_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <div className="minihelp">
                    These options match the backend enum (prevents 400 errors).
                  </div>
                </div>

                {/* ✅ NEW FIELD */}
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
                  <div className="minihelp">Optional. Used for display and search.</div>
                </div>

                <div className="admin-field">
                  <label>Premium?</label>
                  <select
                    value={String(!!form.isPremium)}
                    onChange={(e) => setField("isPremium", e.target.value === "true")}
                  >
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                </div>

                <div className="admin-field">
                  <label>Version</label>
                  <input value={form.version} onChange={(e) => setField("version", e.target.value)} />
                </div>

                <div className="admin-field">
                  <label>Published date</label>
                  <input type="date" value={form.publishedAt} onChange={(e) => setField("publishedAt", e.target.value)} />
                </div>

                <div className="admin-field admin-span2">
                  <label>Description</label>
                  <textarea rows={4} value={form.description} onChange={(e) => setField("description", e.target.value)} />
                </div>

                <div className="admin-field">
                  <label>Author</label>
                  <input value={form.author} onChange={(e) => setField("author", e.target.value)} />
                </div>

                <div className="admin-field">
                  <label>Publisher</label>
                  <input value={form.publisher} onChange={(e) => setField("publisher", e.target.value)} />
                </div>

                <div className="admin-field">
                  <label>Edition</label>
                  <input value={form.edition} onChange={(e) => setField("edition", e.target.value)} />
                </div>
              </div>

              <div className="admin-form-section">
                <div className="admin-form-section-title">Pricing rules</div>
                <div className="admin-form-section-sub">
                  Only premium documents can be sold publicly.
                </div>

                {!showPricing && (
                  <div className="minihelp warn">
                    This document is FREE (Premium = No). Pricing is disabled and will not be saved.
                  </div>
                )}
              </div>

              <div className="admin-grid">
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
              </div>

              <div className="admin-form-section">
                <div className="admin-form-section-title">Files</div>
                <div className="admin-form-section-sub">
                  Save first (to get an ID), then upload ebook and cover.
                </div>
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
                        onClick={uploadEbook}
                        disabled={!editing || uploadingEbook || uploadingCover || busy}
                      >
                        {uploadingEbook ? "Uploading…" : "Upload ebook"}
                      </button>
                      <span className="filehint">{ebookFile ? ebookFile.name : "No file selected."}</span>
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

                    <div className="admin-upload-actions">
                      <button
                        className="admin-btn"
                        onClick={uploadCover}
                        disabled={!editing || uploadingCover || uploadingEbook || busy}
                      >
                        {uploadingCover ? "Uploading…" : "Upload cover"}
                      </button>
                      <span className="filehint">{coverFile ? coverFile.name : "No file selected."}</span>
                    </div>

                    {editing?.coverImagePath && (
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
                        <div className="filehint" style={{ maxWidth: 520 }}>
                          Current cover is shown if available.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="admin-modal-foot">
              <button className="admin-btn" onClick={closeModal} disabled={busy || uploadingCover || uploadingEbook}>
                Cancel
              </button>

              <button className="admin-btn primary" onClick={save} disabled={busy || uploadingCover || uploadingEbook}>
                {busy ? "Saving…" : editing ? "Save changes" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
