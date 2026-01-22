// src/pages/dashboard/admin/AdminProductDocuments.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../../api/client";
import "../../../styles/adminCrud.css";
import AdminPageFooter from "../../../components/AdminPageFooter";

/* =========================
   Helpers
========================= */
function toText(v) {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    if (v.message) return String(v.message);
    if (v.error) return String(v.error);
    if (v.title) return String(v.title);
    if (v.detail) return String(v.detail);
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

/**
 * Friendly + consistent error object for all fetches/actions
 * (includes optional technical details for debugging).
 */
function toUiError(e, fallbackMessage = "Something went wrong.") {
  // Network / CORS / DNS: axios has no response
  if (e?.request && !e?.response) {
    return {
      title: "Connection problem",
      message: "We couldn’t reach the server. Check your internet connection and try again.",
      details: toText(e?.message || "No response from server."),
    };
  }

  const status = e?.response?.status;
  const data = e?.response?.data;

  if (status === 401) {
    return {
      title: "Session expired",
      message: "Please sign in again and retry.",
      details: toText(data || "401 Unauthorized"),
    };
  }
  if (status === 403) {
    return {
      title: "Not allowed",
      message: "You don’t have permission to perform this action.",
      details: toText(data || "403 Forbidden"),
    };
  }
  if (status >= 500) {
    return {
      title: "Server error",
      message: "The server ran into a problem while processing your request. Please try again shortly.",
      details: toText(data || e?.message || `HTTP ${status}`),
    };
  }

  // Prefer backend string/object messages
  const message =
    (typeof data === "string" && data.trim()) ||
    (data && typeof data === "object" && (data.message || data.error || data.title || data.detail)) ||
    e?.message ||
    fallbackMessage;

  return {
    title: "Something went wrong",
    message: toText(message),
    details: toText(data || e?.message || fallbackMessage),
  };
}

/* =========================
   Tiny icons (no deps)
========================= */
function IBack() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IRefresh() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
function ITrash() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 6h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M8 6V4h8v2m-1 0v14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V6h10Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function IAddDoc() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 11v6M9 14h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Match Institutions: action buttons use admin-action-btn + admin-icon-btn
 * (adminCrud.css already styles these consistently)
 */
function IconButton({ title, onClick, disabled, children, kind = "neutral" }) {
  const className = ["admin-action-btn", "neutral", "small", "admin-icon-btn"].join(" ");
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      data-kind={kind}
    >
      {children}
    </button>
  );
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

  // ✅ Branded alert pattern (like Institutions)
  const [uiError, setUiError] = useState(null); // {title,message,details}
  const [info, setInfo] = useState("");

  // add form
  const [docId, setDocId] = useState("");
  const [sortOrder, setSortOrder] = useState(0);

  // filter for dropdown
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
    setUiError(null);
    setInfo("");
    setLoading(true);
    try {
      await Promise.all([loadProduct(), loadMappings(), loadDocuments()]);
    } catch (e) {
      setUiError(toUiError(e, "Failed to load product documents."));
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
    setUiError(null);
    setInfo("");

    const idNum = Number(docId);
    if (!idNum) return setUiError({ title: "Missing information", message: "Please select a document." });

    const so = Number(sortOrder);
    if (Number.isNaN(so) || so < 0) {
      return setUiError({ title: "Invalid value", message: "SortOrder must be 0 or greater." });
    }

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
      setUiError(toUiError(e2, "Failed to add document."));
    } finally {
      setBusy(false);
    }
  }

  async function updateSort(row, next) {
    const so = Number(next);
    if (Number.isNaN(so) || so < 0) return;

    setUiError(null);
    setInfo("");
    setBusy(true);
    try {
      const id = row.id ?? row.Id;
      await api.put(`/content-products/${productId}/documents/${id}`, { sortOrder: so });
      setInfo("Sort order updated.");
      await loadMappings();
    } catch (e) {
      setUiError(toUiError(e, "Failed to update sort order."));
    } finally {
      setBusy(false);
    }
  }

  async function removeRow(row) {
    const title = row.documentTitle ?? row.DocumentTitle ?? "this document";
    if (!window.confirm(`Remove "${title}" from this product?`)) return;

    setUiError(null);
    setInfo("");
    setBusy(true);
    try {
      const id = row.id ?? row.Id;
      await api.delete(`/content-products/${productId}/documents/${id}`);
      setInfo("Document removed.");
      await loadMappings();
      await loadDocuments();
    } catch (e) {
      setUiError(toUiError(e, "Failed to remove document."));
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

        {/* ✅ Compact icon actions (same pattern as Institutions) */}
        <div className="admin-actions">
          <IconButton title="Back" onClick={() => nav(-1)} disabled={busy} kind="neutral">
            <IBack />
          </IconButton>

          <IconButton title="Refresh list" onClick={loadAll} disabled={busy || loading} kind="neutral">
            <IRefresh />
          </IconButton>

          <button
            className="admin-btn primary compact admin-btn-icon"
            type="button"
            onClick={() => {
              const el = document.querySelector(".admin-docmap-filter");
              el?.focus?.();
            }}
            disabled={busy || loading}
            title="Add a document"
          >
            <IPlus /> <span>Add</span>
          </button>
        </div>
      </div>

      {/* ✅ Clearer alert block (supports technical details) */}
      {(uiError || info) && (
        <div className={`admin-alert ${uiError ? "error" : "ok"}`}>
          {uiError ? (
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontWeight: 900 }}>{uiError.title || "Error"}</div>
              <div style={{ whiteSpace: "pre-wrap" }}>{uiError.message}</div>

              {uiError.details && uiError.details !== uiError.message ? (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 800 }}>Show technical details</summary>
                  <pre
                    style={{
                      marginTop: 8,
                      padding: 10,
                      borderRadius: 10,
                      background: "rgba(0,0,0,0.04)",
                      overflow: "auto",
                      maxHeight: 220,
                      fontSize: 12,
                      lineHeight: 1.4,
                    }}
                  >
                    {uiError.details}
                  </pre>
                </details>
              ) : null}
            </div>
          ) : (
            info
          )}
        </div>
      )}

      {/* Add panel */}
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
                <div className="admin-help" style={{ marginTop: 6, fontSize: 12, color: "#6b7280", fontWeight: 700 }}>
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
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <IAddDoc /> {busy ? "Adding…" : "Add"}
              </span>
            </button>
          </div>
        </form>
      </div>

      {/* List */}
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
                        title="Edit SortOrder then click away to save"
                      />
                    </td>

                    <td style={{ textAlign: "right" }}>
                      <div className="admin-row-actions actions-inline no-wrap" style={{ justifyContent: "flex-end" }}>
                        <IconButton
                          title="Remove from product"
                          onClick={() => removeRow(r)}
                          disabled={busy}
                          kind="danger"
                        >
                          <ITrash />
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

      <AdminPageFooter right={<span className="admin-footer-muted">Tip: Use low SortOrder for “top” documents.</span>} />
    </div>
  );
}
