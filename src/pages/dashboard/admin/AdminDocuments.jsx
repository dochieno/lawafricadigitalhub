// src/pages/dashboard/admin/AdminDocuments.jsx
import { useEffect, useMemo, useState } from "react";
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
  const clean = String(coverImagePath)
    .replace(/^Storage\//i, "")
    .replace(/^\/+/, "")
    .toLowerCase();
  return `${getServerOrigin()}/storage/${clean}`;
}

function toText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    if (v.message) return String(v.message);
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return "An unexpected error occurred.";
    }
  }
  return String(v);
}

function formatMoney(val) {
  // Accepts number|string; returns "1,500.00"
  const n = typeof val === "number" ? val : Number(val);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const emptyForm = {
  title: "",
  description: "",
  author: "",
  publisher: "",
  edition: "",
  version: "1",

  // these must match your backend enums/DTO expectations
  category: "Commentaries",
  countryId: "",

  isPremium: true,
  status: "Published",
  publishedAt: "",

  // Pricing
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
      setError(toText(e?.response?.data || e?.message || "Failed to load admin documents."));
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

      const allow = !!(r.allowPublicPurchase ?? r.AllowPublicPurchase ?? false);
      const currency = String((r.publicCurrency ?? r.PublicCurrency ?? "") || "").toLowerCase();
      const price = String((r.publicPrice ?? r.PublicPrice ?? "") || "").toLowerCase();

      const pricing = `${allow ? "on" : "off"} ${currency} ${price} ${r.pageCount ?? ""}`.toLowerCase();
      const meta = `${status} ${premium} ${pricing}`.toLowerCase();

      return title.includes(s) || meta.includes(s);
    });
  }, [rows, q]);

  function setField(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function openCreate() {
    setError("");
    setInfo("");
    setEditing(null);
    setForm({ ...emptyForm });
    setEbookFile(null);
    setCoverFile(null);
    setOpen(true);
  }

  async function openEdit(row) {
    setError("");
    setInfo("");
    setEditing(row);
    setEbookFile(null);
    setCoverFile(null);
    setOpen(true);

    // Load full details for edit
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

        isPremium: !!d.isPremium,
        status: d.status ?? "Published",
        publishedAt: d.publishedAt ? String(d.publishedAt).slice(0, 10) : "",

        // pricing fields (works even if server returns PascalCase)
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
    return {
      title: form.title.trim(),
      description: form.description?.trim() || null,
      author: form.author?.trim() || null,
      publisher: form.publisher?.trim() || null,
      edition: form.edition?.trim() || null,

      category: form.category,
      countryId: Number(form.countryId),

      // create then upload
      filePath: "",
      fileType: "pdf",
      fileSizeBytes: 0,
      pageCount: 0,
      chapterCount: 0,

      isPremium: !!form.isPremium,
      version: form.version?.trim() || "1",
      status: form.status,
      publishedAt: form.publishedAt ? new Date(form.publishedAt).toISOString() : null,

      allowPublicPurchase: !!form.allowPublicPurchase,
      publicPrice: form.publicPrice === "" ? null : Number(form.publicPrice),
      publicCurrency: form.publicCurrency?.trim() || "KES",
    };
  }

  function buildUpdatePayload() {
    return {
      title: form.title.trim(),
      description: form.description?.trim() || null,
      author: form.author?.trim() || null,
      publisher: form.publisher?.trim() || null,
      edition: form.edition?.trim() || null,

      category: form.category,
      countryId: Number(form.countryId),

      isPremium: !!form.isPremium,
      version: form.version?.trim() || "1",
      status: form.status,
      publishedAt: form.publishedAt ? new Date(form.publishedAt).toISOString() : null,

      allowPublicPurchase: !!form.allowPublicPurchase,
      publicPrice: form.publicPrice === "" ? null : Number(form.publicPrice),
      publicCurrency: form.publicCurrency?.trim() || "KES",
    };
  }

  async function save() {
    setError("");
    setInfo("");

    // ✅ Pricing safety rules
    if (!form.title.trim()) return setError("Title is required.");
    if (!form.countryId) return setError("Country is required.");

    // If not premium => force disable selling fields
    if (!form.isPremium && (form.allowPublicPurchase || form.publicPrice || form.publicCurrency)) {
      setForm((p) => ({
        ...p,
        allowPublicPurchase: false,
        publicPrice: "",
        publicCurrency: "KES",
      }));
    }

    // If selling is ON => currency + price required
    if (form.isPremium && form.allowPublicPurchase) {
      const priceNum = Number(form.publicPrice);
      if (!form.publicCurrency?.trim()) return setError("Currency is required when public purchase is ON.");
      if (!Number.isFinite(priceNum) || priceNum <= 0)
        return setError("Price must be greater than 0 when public purchase is ON.");
    }

    setBusy(true);
    try {
      if (editing) {
        await api.put(`/legal-documents/${editing.id}`, buildUpdatePayload());
        setInfo("Document updated.");
      } else {
        const res = await api.post("/legal-documents", buildCreatePayload());
        const newId = res.data?.id ?? res.data?.data?.id;
        setInfo(`Document created (ID: ${newId}). You can upload files now.`);
      }

      await loadAll();
      closeModal();
    } catch (e) {
      setError(toText(e?.response?.data || e?.message || "Save failed."));
    } finally {
      setBusy(false);
    }
  }

  async function uploadEbook() {
    if (!editing?.id) return setError("Save the document first (edit mode) before uploading an ebook.");
    if (!ebookFile) return setError("Select a PDF or EPUB first.");

    setError("");
    setInfo("");
    setUploadingEbook(true);
    try {
      const fd = new FormData();
      fd.append("File", ebookFile);

      await api.post(`/legal-documents/${editing.id}/upload`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setInfo("Ebook uploaded successfully.");
      await loadAll();
    } catch (e) {
      setError(toText(e?.response?.data || e?.message || "Ebook upload failed."));
    } finally {
      setUploadingEbook(false);
    }
  }

  async function uploadCover() {
    if (!editing?.id) return setError("Save the document first (edit mode) before uploading a cover.");
    if (!coverFile) return setError("Select an image file first.");

    setError("");
    setInfo("");
    setUploadingCover(true);
    try {
      const fd = new FormData();
      fd.append("file", coverFile);

      await api.post(`/legal-documents/${editing.id}/cover`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setInfo("Cover uploaded successfully.");
      await loadAll();
    } catch (e) {
      setError(toText(e?.response?.data || e?.message || "Cover upload failed."));
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
      {/* Minimal scoped styles (no CSS file changes needed) */}
      <style>{`
        .admin-table-wrap {
          max-height: 68vh;
          overflow: auto;
          border-radius: 14px;
        }
        .admin-table thead th {
          position: sticky;
          top: 0;
          z-index: 2;
          background: #fff;
        }
        .row-zebra { background: #fafafa; }
        .row-hover:hover { background: #f3f4f6; }
        .num-cell { text-align: right; font-variant-numeric: tabular-nums; }
        .price-on { font-weight: 900; }
      `}</style>

      <div className="admin-header">
        <div>
          <h1 className="admin-title">Admin · Books (Legal Documents)</h1>
          <p className="admin-subtitle">
            Create, edit, upload ebook files & cover images, and manage public pricing (Admin only).
          </p>
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

      {(error || info) && (
        <div className={`admin-alert ${error ? "error" : "ok"}`}>{error ? error : info}</div>
      )}

      <div className="admin-card admin-card-fill">
        <div className="admin-toolbar">
          <input
            className="admin-search admin-search-wide"
            placeholder="Search by title, status, premium, currency, price…"
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
                <th style={{ width: "8%" }} className="num-cell">
                  Pages
                </th>

                {/* ✅ Currency then Price */}
                <th style={{ width: "10%" }}>Currency</th>
                <th style={{ width: "10%" }} className="num-cell">
                  Public Price
                </th>

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
                      <span
                        className={`admin-pill ${
                          String(r.status).toLowerCase() === "published" ? "ok" : "muted"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>

                    <td>
                      <span className={`admin-pill ${isPremium ? "warn" : "muted"}`}>
                        {isPremium ? "Yes" : "No"}
                      </span>
                    </td>

                    <td className="num-cell">{r.pageCount ?? "—"}</td>

                    {/* Currency */}
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

                    {/* Price with comma + 2 decimals */}
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
                        <button
                          className="admin-action-btn neutral small"
                          onClick={() => window.open(`/dashboard/documents/${r.id}`, "_blank")}
                          disabled={busy}
                          title="Open public document details in a new tab"
                        >
                          View
                        </button>

                        <button
                          className="admin-action-btn neutral small"
                          onClick={() => openEdit(r)}
                          disabled={busy}
                        >
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
                <h3 className="admin-modal-title">
                  {editing ? `Edit Document #${editing.id}` : "Create Document"}
                </h3>
                <div className="admin-modal-subtitle">
                  {editing
                    ? "Edit metadata, pricing, then upload ebook/cover."
                    : "Create metadata first. Upload ebook/cover after you save."}
                </div>
              </div>

              <button
                className="admin-btn"
                onClick={closeModal}
                disabled={busy || uploadingCover || uploadingEbook}
              >
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
                    <option value="Commentaries">Commentaries</option>
                    <option value="Journals">Journals</option>
                    <option value="LawReports">LawReports</option>
                    <option value="Books">Books</option>
                    <option value="Constitution">Constitution</option>
                  </select>
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

                {/* ================= PRICING ================= */}
                <div className="admin-field">
                  <label>Allow public purchase?</label>
                  <select
                    value={String(!!form.allowPublicPurchase)}
                    onChange={(e) => setField("allowPublicPurchase", e.target.value === "true")}
                    disabled={!form.isPremium}
                    title={!form.isPremium ? "Only premium documents should be sold." : ""}
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

                {/* ================= UPLOADS ================= */}
                <div className="admin-field admin-span2">
                  <label>Ebook file (PDF/EPUB)</label>
                  <input type="file" accept=".pdf,.epub" onChange={(e) => setEbookFile(e.target.files?.[0] || null)} />
                  <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                    <button
                      className="admin-btn"
                      onClick={uploadEbook}
                      disabled={!editing || uploadingEbook || busy}
                      title={!editing ? "Save first, then upload." : ""}
                    >
                      {uploadingEbook ? "Uploading…" : "Upload ebook"}
                    </button>
                    <span className="admin-footer-muted">{ebookFile ? ebookFile.name : "No file selected."}</span>
                  </div>
                </div>

                <div className="admin-field admin-span2">
                  <label>Cover image</label>
                  <input type="file" accept="image/*" onChange={(e) => setCoverFile(e.target.files?.[0] || null)} />
                  <div style={{ display: "flex", gap: 10, marginTop: 8, alignItems: "center" }}>
                    <button
                      className="admin-btn"
                      onClick={uploadCover}
                      disabled={!editing || uploadingCover || busy}
                      title={!editing ? "Save first, then upload." : ""}
                    >
                      {uploadingCover ? "Uploading…" : "Upload cover"}
                    </button>

                    <span className="admin-footer-muted">{coverFile ? coverFile.name : "No file selected."}</span>
                  </div>

                  {editing?.coverImagePath && (
                    <div style={{ marginTop: 10 }}>
                      <div className="admin-footer-muted" style={{ marginBottom: 6 }}>
                        Current cover:
                      </div>
                      <img
                        src={buildCoverUrl(editing.coverImagePath)}
                        alt="cover"
                        style={{ width: 140, height: 180, objectFit: "cover", borderRadius: 12 }}
                        onError={(e) => (e.currentTarget.style.display = "none")}
                      />
                    </div>
                  )}
                </div>
              </div>

              <div className="admin-note" style={{ marginTop: 10 }}>
                <b>Backend:</b>{" "}
                <code>GET /api/legal-documents/admin</code>, <code>POST /api/legal-documents</code>,{" "}
                <code>PUT /api/legal-documents/{"{id}"}</code>, <code>POST /api/legal-documents/{"{id}"}/upload</code>,{" "}
                <code>POST /api/legal-documents/{"{id}"}/cover</code>
              </div>
            </div>

            <div className="admin-modal-foot">
              <button className="admin-btn" onClick={closeModal} disabled={busy || uploadingCover || uploadingEbook}>
                Cancel
              </button>

              <button className="admin-btn primary" onClick={save} disabled={busy || uploadingCover || uploadingEbook}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="admin-footer">
        <div className="admin-footer-inner">
          <span>LawAfrica Admin • Books</span>
          <span className="admin-footer-muted">
            Tip: set <b>Allow public purchase</b> + <b>Currency</b> + <b>Price</b> for premium documents to enable public buying.
          </span>
        </div>
      </footer>
    </div>
  );
}
