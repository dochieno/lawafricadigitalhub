// src/pages/dashboard/admin/AdminLLRServices.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import api, { API_BASE_URL } from "../../../api/client";
import "../../../styles/adminCrud.css";

/**
 * LLR Services = Report-kind LegalDocuments only.
 * IMPORTANT:
 * - Your /legal-documents/admin list DTO may NOT include Kind.
 * - Fallback filter uses FileType === "report" (since DB has fileType=report).
 * - Create defaults: Kind=Report + FileType=report
 * - No ebook upload (cover only)
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

// Cover upload helper
async function postMultipartWithFallback(paths, formData) {
  let lastErr = null;
  for (const p of paths) {
    try {
      return await api.post(p, formData, { headers: { "Content-Type": "multipart/form-data" } });
    } catch (e) {
      lastErr = e;
      const status = e?.response?.status;
      if (status === 404 || status === 405) continue;
      throw e;
    }
  }
  throw lastErr || new Error("Upload failed.");
}

/** Must match backend enum names (you already use strings) */
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

  category: "LawReports",
  countryId: "",

  pageCount: "",

  // ✅ fixed defaults for this page
  kind: "Report",
  contentProductId: "",

  isPremium: true,
  status: "Published",
  publishedAt: "",

  allowPublicPurchase: false,
  publicPrice: "",
  publicCurrency: "KES",
};

function isReportRow(r) {
  // backend might return enum string ("Report") or int (2) OR not return Kind at all.
  const k = r?.kind ?? r?.Kind;
  const ft = String(r?.fileType ?? r?.FileType ?? "").toLowerCase();
  return k === "Report" || k === 2 || ft === "report";
}

export default function AdminLLRServices() {
  const [rows, setRows] = useState([]);
  const [countries, setCountries] = useState([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // Debug banner: helps confirm endpoint missing Kind
  const [debugBanner, setDebugBanner] = useState("");

  // Modal state
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ ...emptyForm });

  // Cover upload only
  const [coverFile, setCoverFile] = useState(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef(null);

  function setField(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function loadAll() {
    setError("");
    setInfo("");
    setDebugBanner("");
    setLoading(true);

    try {
      const [docsRes, countriesRes] = await Promise.all([
        api.get("/legal-documents/admin"),
        api.get("/Country"),
      ]);

      const all = Array.isArray(docsRes.data) ? docsRes.data : [];
      const reports = all.filter(isReportRow);

      // If none matched, it usually means the endpoint is not returning Kind and also not returning fileType.
      if (all.length > 0 && reports.length === 0) {
        setDebugBanner(
          `No items matched as Report. This usually means /legal-documents/admin is not returning Kind or FileType. ` +
            `Quick fix: include Kind + FileType in the admin list DTO/projection.`
        );
      }

      setRows(reports);
      setCountries(Array.isArray(countriesRes.data) ? countriesRes.data : []);
    } catch (e) {
      setRows([]);
      setError(getApiErrorMessage(e, "Failed to load LLR Services."));
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
      const pages = String(r.pageCount ?? "").toLowerCase();
      const ft = String(r.fileType ?? r.FileType ?? "").toLowerCase();

      const allow = safeBool(r.allowPublicPurchase ?? r.AllowPublicPurchase, false);
      const currency = String((r.publicCurrency ?? r.PublicCurrency ?? "") || "").toLowerCase();
      const price = String((r.publicPrice ?? r.PublicPrice ?? "") || "").toLowerCase();
      const pricing = `${allow ? "on" : "off"} ${currency} ${price}`;

      const meta = `${status} ${premium} ${pages} ${pricing} ${ft}`.toLowerCase();
      return title.includes(s) || meta.includes(s);
    });
  }, [rows, q]);

  function resetCoverInput() {
    setCoverFile(null);
    if (coverInputRef.current) coverInputRef.current.value = "";
  }

  function openCreate() {
    setError("");
    setInfo("");
    setEditing(null);
    setForm({ ...emptyForm }); // ✅ always defaults to Report
    resetCoverInput();
    setOpen(true);
  }

  async function openEdit(row) {
    setError("");
    setInfo("");
    setEditing(row);
    resetCoverInput();
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

        category: d.category ?? "LawReports",
        countryId: d.countryId ?? "",

        pageCount: d.pageCount ?? "",

        // ✅ keep Report fixed
        kind: "Report",
        contentProductId: d.contentProductId ?? "",

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
    if (busy || uploadingCover) return;
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

      // ✅ Force Report
      kind: "Report",
      contentProductId: toIntOrNull(form.contentProductId),

      filePath: "",
      fileType: "report",
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

      pageCount: toIntOrNull(form.pageCount),

      isPremium,
      version: form.version?.trim() || "1",
      status: form.status,
      publishedAt: form.publishedAt ? new Date(form.publishedAt).toISOString() : null,

      allowPublicPurchase,
      publicPrice: allowPublicPurchase ? toDecimalOrNull(form.publicPrice) : null,
      publicCurrency: allowPublicPurchase ? (form.publicCurrency?.trim() || "KES") : "KES",

      // If your PUT supports it:
      kind: "Report",
      contentProductId: toIntOrNull(form.contentProductId),
    };
  }

  async function save() {
    setError("");
    setInfo("");

    if (!form.title.trim()) return setError("Title is required.");
    if (!form.countryId) return setError("Country is required.");
    if (!CATEGORY_OPTIONS.includes(form.category)) {
      return setError("Invalid category selected. Please choose a valid category.");
    }

    if (!form.isPremium) {
      setField("allowPublicPurchase", false);
      setField("publicPrice", "");
      setField("publicCurrency", "KES");
    }

    if (form.isPremium && form.allowPublicPurchase) {
      const priceNum = Number(form.publicPrice);
      if (!form.publicCurrency?.trim())
        return setError("Currency is required when public purchase is ON.");
      if (!Number.isFinite(priceNum) || priceNum <= 0)
        return setError("Price must be greater than 0.");
    }

    setBusy(true);
    try {
      if (editing?.id) {
        await api.put(`/legal-documents/${editing.id}`, buildUpdatePayload());
        setInfo("LLR Service (Report) updated.");
        await loadAll();
        closeModal();
        return;
      }

      const res = await api.post("/legal-documents", buildCreatePayload());
      const newId = res.data?.id ?? res.data?.data?.id;

      if (newId) {
        setEditing({ id: newId, title: form.title, coverImagePath: null });
        setInfo(`Report created (#${newId}). Upload cover below, then open Report Content to add text.`);
        await loadAll();
      } else {
        setInfo("Report created. Refresh list.");
        await loadAll();
        closeModal();
      }
    } catch (e) {
      setError(getApiErrorMessage(e, "Save failed."));
    } finally {
      setBusy(false);
    }
  }

  async function uploadCover() {
    if (!editing?.id) return setError("Save the report first, then upload a cover.");
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
      resetCoverInput();
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

  return (
    <div className="admin-page admin-page-wide">
      <style>{`
        .admin-table-wrap { max-height: 68vh; overflow: auto; border-radius: 14px; }
        .admin-table thead th { position: sticky; top: 0; z-index: 2; background: #fafafa; }
        .row-zebra { background: #fafafa; }
        .row-hover:hover td { background: #fbfbff; }
        .num-cell { text-align: right; font-variant-numeric: tabular-nums; }
        .price-on { font-weight: 900; }
        .admin-upload-box {
          border: 1px dashed #d1d5db;
          background: #fff;
          border-radius: 14px;
          padding: 12px;
        }
        .admin-upload-actions { display:flex; align-items:center; gap:10px; margin-top:8px; flex-wrap:wrap; }
        .filehint { color: #6b7280; font-weight: 700; font-size: 12px; }
        .minihelp { color:#6b7280; font-size:12px; margin-top:6px; line-height:1.35; }
        .minihelp.warn {
          background:#fffbeb; border:1px solid #fcd34d; color:#92400e;
          padding:8px 10px; border-radius:12px; margin-top:8px;
          font-size:12px; font-weight:800;
        }
        .minihelp.ok {
          background:#ecfdf5; border:1px solid #34d399; color:#065f46;
          padding:10px 12px; border-radius:12px; margin:10px 0;
          font-size:12px; font-weight:800;
        }
      `}</style>

      <div className="admin-header">
        <div>
          <h1 className="admin-title">Admin · LLR Services (Reports)</h1>
          <p className="admin-subtitle">
            Reports are subscription-only and text-based. Create here, then open “Report Content” to add the text.
          </p>
        </div>

        <div className="admin-actions">
          <button className="admin-btn" onClick={loadAll} disabled={busy || loading}>
            Refresh
          </button>
          <button className="admin-btn primary compact" onClick={openCreate} disabled={busy}>
            + New Report
          </button>
        </div>
      </div>

      {(error || info) && <div className={`admin-alert ${error ? "error" : "ok"}`}>{error || info}</div>}
      {debugBanner && <div className="minihelp ok">{debugBanner}</div>}

      <div className="admin-card admin-card-fill">
        <div className="admin-toolbar">
          <input
            className="admin-search admin-search-wide"
            placeholder="Search reports by title, status, premium, pages, file type…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="admin-pill muted">{loading ? "Loading…" : `${filtered.length} report(s)`}</div>
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: "44%" }}>Title</th>
                <th style={{ width: "12%" }}>Status</th>
                <th style={{ width: "10%" }}>Premium</th>
                <th style={{ width: "8%" }} className="num-cell">Pages</th>
                <th style={{ width: "10%" }}>Public</th>
                <th style={{ width: "10%" }} className="num-cell">Price</th>
                <th style={{ width: "6%" }}>Type</th>
                <th style={{ textAlign: "right", width: "10%" }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ color: "#6b7280", padding: "14px" }}>
                    No reports found.
                  </td>
                </tr>
              )}

              {filtered.map((r, idx) => {
                const allow = getAllow(r);
                const currency = getCurrency(r);
                const price = getPrice(r);
                const isPremium = !!r.isPremium;
                const ft = String(r.fileType ?? r.FileType ?? "—").toLowerCase();

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
                        <span className="admin-pill ok">On</span>
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
                        <span className="price-on">
                          {currency || "—"} {formatMoney(price)}
                        </span>
                      )}
                    </td>

                    <td>
                      <span className="admin-pill muted">{ft}</span>
                    </td>

                    <td>
                      <div className="admin-row-actions" style={{ justifyContent: "flex-end", gap: 10 }}>
                        <button className="admin-action-btn neutral small" onClick={() => openEdit(r)} disabled={busy}>
                          Edit
                        </button>

                        {/* Placeholder: we will wire this to a ReportContent page */}
                        <button
                          className="admin-action-btn small"
                          onClick={() => setInfo(`Next: open Report Content for LegalDocumentId=${r.id}`)}
                          disabled={busy}
                          title="We will wire this to the Report Content editor page"
                        >
                          Report Content
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
                <h3 className="admin-modal-title">{editing ? `Edit Report #${editing.id}` : "Create Report"}</h3>
                <div className="admin-modal-subtitle">Metadata only. (Text content is in the Reports module.)</div>
              </div>

              <button className="admin-btn" onClick={closeModal} disabled={busy || uploadingCover}>
                Close
              </button>
            </div>

            <div className="admin-modal-body admin-modal-scroll">
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
                </div>

                <div className="admin-field">
                  <label>No of Pages</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.pageCount}
                    onChange={(e) => setField("pageCount", e.target.value)}
                    placeholder="e.g. 12"
                  />
                </div>

                <div className="admin-field">
                  <label>ContentProductId (optional)</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={form.contentProductId}
                    onChange={(e) => setField("contentProductId", e.target.value)}
                    placeholder="e.g. 1 (LawAfrica Reports)"
                  />
                  <div className="minihelp">If set, report is mapped to that product (shows under DOCS).</div>
                </div>

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
                <div className="admin-form-section-title">Pricing</div>
                <div className="admin-form-section-sub">Only premium documents can be sold publicly.</div>
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
                <div className="admin-form-section-title">Cover image</div>
                <div className="admin-form-section-sub">Save first, then upload a cover (optional).</div>
              </div>

              <div className="admin-grid">
                <div className="admin-field admin-span2">
                  <label>Cover image</label>
                  <div className="admin-upload-box">
                    <input
                      ref={coverInputRef}
                      type="file"
                      accept="image/*"
                      onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
                      disabled={!editing || uploadingCover || busy}
                      title={!editing ? "Save first, then upload." : ""}
                    />

                    <div className="admin-upload-actions">
                      <button className="admin-btn" onClick={uploadCover} disabled={!editing || uploadingCover || busy}>
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

                    <div className="minihelp warn">
                      Ebook uploads are disabled here. Reports are text-based and managed in the Reports module.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="admin-modal-foot">
              <button className="admin-btn" onClick={closeModal} disabled={busy || uploadingCover}>
                Cancel
              </button>

              <button className="admin-btn primary" onClick={save} disabled={busy || uploadingCover}>
                {busy ? "Saving…" : editing ? "Save changes" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
