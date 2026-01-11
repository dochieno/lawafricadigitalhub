import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../../api/client";
import "../../../styles/adminCrud.css";
import AdminPageFooter from "../../../components/AdminPageFooter";

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

function pillYesNo(v) {
  return v ? "Yes" : "No";
}

export default function AdminProductDocuments() {
  const nav = useNavigate();
  const { productId } = useParams();

  const [product, setProduct] = useState(null);

  const [rows, setRows] = useState([]);
  const [docs, setDocs] = useState([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  // add form
  const [docId, setDocId] = useState("");
  const [sortOrder, setSortOrder] = useState(0);

  // ✅ UX: filter for the document dropdown
  const [docFilter, setDocFilter] = useState("");

  async function loadProduct() {
    try {
      const res = await api.get(`/content-products/${productId}`);
      const data = res.data?.data ?? res.data;
      setProduct(data ?? null);
    } catch {
      setProduct(null);
    }
  }

  async function loadMappings() {
    const res = await api.get(`/content-products/${productId}/documents`);
    const data = res.data?.data ?? res.data;
    setRows(Array.isArray(data) ? data : []);
  }

  async function loadDocuments() {
    const res = await api.get("/legal-documents");
    const data = res.data?.data ?? res.data;
    setDocs(Array.isArray(data) ? data : []);
  }

  async function loadAll() {
    setError("");
    setInfo("");
    setLoading(true);
    try {
      await Promise.all([loadProduct(), loadMappings(), loadDocuments()]);
    } catch (e) {
      setError(toText(e?.response?.data || e?.message || "Failed to load product documents."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const filteredRows = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      const title = (r.documentTitle ?? r.DocumentTitle ?? "").toLowerCase();
      const status = String(r.status ?? r.Status ?? "").toLowerCase();
      return title.includes(s) || status.includes(s);
    });
  }, [rows, q]);

  const availableDocs = useMemo(() => {
    const mapped = new Set(rows.map((r) => Number(r.legalDocumentId ?? r.LegalDocumentId)));
    return docs.filter((d) => !mapped.has(Number(d.id ?? d.Id)));
  }, [docs, rows]);

  const filteredAvailableDocs = useMemo(() => {
    const s = docFilter.trim().toLowerCase();
    if (!s) return availableDocs;
    return availableDocs.filter((d) => (d.title ?? d.Title ?? "").toLowerCase().includes(s));
  }, [availableDocs, docFilter]);

  async function addDocument(e) {
    e?.preventDefault?.();
    setError("");
    setInfo("");

    const idNum = Number(docId);
    if (!idNum) return setError("Please select a document.");
    const so = Number(sortOrder);
    if (Number.isNaN(so) || so < 0) return setError("SortOrder must be 0 or greater.");

    setBusy(true);
    try {
      await api.post(`/content-products/${productId}/documents`, {
        legalDocumentId: idNum,
        sortOrder: so,
      });

      setInfo("Document added to product.");
      setDocId("");
      setSortOrder(0);
      setDocFilter("");
      await loadAll();
    } catch (e2) {
      setError(toText(e2?.response?.data || e2?.message || "Failed to add document."));
    } finally {
      setBusy(false);
    }
  }

  async function updateSort(row, next) {
    const so = Number(next);
    if (Number.isNaN(so) || so < 0) return;

    setError("");
    setInfo("");
    setBusy(true);
    try {
      const id = row.id ?? row.Id;
      await api.put(`/content-products/${productId}/documents/${id}`, { sortOrder: so });
      setInfo("Sort order updated.");
      await loadMappings();
    } catch (e) {
      setError(toText(e?.response?.data || e?.message || "Failed to update sort order."));
    } finally {
      setBusy(false);
    }
  }

  async function removeRow(row) {
    const title = row.documentTitle ?? row.DocumentTitle ?? "this document";
    if (!window.confirm(`Remove "${title}" from this product?`)) return;

    setError("");
    setInfo("");
    setBusy(true);
    try {
      const id = row.id ?? row.Id;
      await api.delete(`/content-products/${productId}/documents/${id}`);
      setInfo("Document removed.");
      await loadMappings();
      await loadDocuments();
    } catch (e) {
      setError(toText(e?.response?.data || e?.message || "Failed to remove document."));
    } finally {
      setBusy(false);
    }
  }

  const productName = product?.name ?? product?.Name ?? "—";

  return (
    <div className="admin-page admin-page-wide admin-docmap">
      <div className="admin-header">
        <div>
          <h1 className="admin-title">Admin · Product Documents</h1>
          <p className="admin-subtitle">
            Manage which legal documents belong to: <b>{productName}</b>
          </p>
        </div>

        <div className="admin-actions">
          <button className="admin-btn" onClick={() => nav(-1)} disabled={busy}>
            ← Back
          </button>
          <button className="admin-btn" onClick={loadAll} disabled={busy || loading}>
            Refresh
          </button>
        </div>
      </div>

      {(error || info) && <div className={`admin-alert ${error ? "error" : "ok"}`}>{error ? error : info}</div>}

      {/* ✅ Add panel (COMPACT: no admin-card-fill here) */}
      <div className="admin-card admin-docmap-add admin-docmap-add-compact">
        <div className="admin-docmap-addhead">
          <div>
            <div className="admin-docmap-addtitle">Add document to product</div>
            <div className="admin-docmap-addsub">Tip: SortOrder controls ordering (lower = top).</div>
          </div>

          <div className="admin-pill muted">{loading ? "Loading…" : `${availableDocs.length} available`}</div>
        </div>

        <form className="admin-docmap-addrow" onSubmit={addDocument}>
          <div className="admin-docmap-left">
            <div className="admin-field admin-docmap-field">
              <label>Find a document</label>
              <input
                className="admin-docmap-filter"
                placeholder="Type to filter documents…"
                value={docFilter}
                onChange={(e) => setDocFilter(e.target.value)}
                disabled={busy || loading}
              />
            </div>

            <div className="admin-field admin-docmap-field">
              <label>Select document *</label>
              <div className="admin-docmap-selectwrap">
                <select value={docId} onChange={(e) => setDocId(e.target.value)} disabled={busy || loading}>
                  <option value="">{loading ? "Loading…" : "Select a document…"}</option>
                  {filteredAvailableDocs.map((d) => (
                    <option key={d.id ?? d.Id} value={d.id ?? d.Id}>
                      {d.title ?? d.Title}
                    </option>
                  ))}
                </select>
                <span className="admin-docmap-chevron" aria-hidden="true">
                  ▾
                </span>
              </div>

              {!!docFilter.trim() && (
                <div className="admin-help" style={{ marginTop: 6 }}>
                  Showing <b>{filteredAvailableDocs.length}</b> of <b>{availableDocs.length}</b>
                </div>
              )}
            </div>
          </div>

          <div className="admin-docmap-right">
            <div className="admin-field admin-docmap-field admin-docmap-so">
              <label>SortOrder</label>
              <input
                type="number"
                value={String(sortOrder)}
                onChange={(e) => setSortOrder(e.target.value)}
                min={0}
                step={1}
                disabled={busy || loading}
              />
            </div>

            <button className="admin-btn primary admin-docmap-addbtn" type="submit" disabled={busy || loading}>
              {busy ? "Adding…" : "Add"}
            </button>
          </div>
        </form>
      </div>

      {/* ✅ List (THIS is the one that should fill height + internally scroll) */}
      <div className="admin-card admin-card-fill admin-docmap-list">
        <div className="admin-toolbar admin-docmap-toolbar">
          <input
            className="admin-search admin-search-wide"
            placeholder="Search by title or status…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="admin-pill muted">{loading ? "Loading…" : `${filteredRows.length} document(s)`}</div>
        </div>

        {/* ✅ NEW: internal scroll wrapper */}
        <div className="admin-docmap-tablewrap">
          <table className="admin-table admin-table-compact">
            <thead>
              <tr>
                <th style={{ width: "55%" }}>Document</th>
                <th style={{ width: "12%" }}>Status</th>
                <th style={{ width: "10%" }}>Premium?</th>
                <th style={{ width: "13%" }}>SortOrder</th>
                <th style={{ width: "10%", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ color: "#6b7280", padding: "12px" }}>
                    No documents assigned to this product.
                  </td>
                </tr>
              )}

              {filteredRows.map((r) => {
                const id = r.id ?? r.Id;
                const title = r.documentTitle ?? r.DocumentTitle ?? "—";
                const status = r.status ?? r.Status ?? "—";
                const isPremium = !!(r.isPremium ?? r.IsPremium);
                const so = r.sortOrder ?? r.SortOrder ?? 0;

                return (
                  <tr key={id}>
                    <td className="admin-docmap-title">{title}</td>

                    <td>
                      <span className="admin-pill muted">{String(status)}</span>
                    </td>

                    <td>
                      <span className={`admin-pill ${isPremium ? "warn" : "muted"}`}>{pillYesNo(isPremium)}</span>
                    </td>

                    <td>
                      <input
                        className="admin-input-compact"
                        type="number"
                        min={0}
                        step={1}
                        defaultValue={String(so)}
                        disabled={busy}
                        onBlur={(e) => updateSort(r, e.target.value)}
                        title="Edit and click away to save"
                      />
                    </td>

                    <td style={{ textAlign: "right" }}>
                      <button
                        className="admin-action-btn neutral small danger-outline"
                        onClick={() => removeRow(r)}
                        disabled={busy}
                        title="Remove from product"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <AdminPageFooter right={<span className="admin-footer-muted">Tip: Use low SortOrder for “top” documents.</span>} />
    </div>
  );
}
