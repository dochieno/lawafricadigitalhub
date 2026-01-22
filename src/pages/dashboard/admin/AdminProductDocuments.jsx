// src/pages/dashboard/admin/AdminProductDocuments.jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../../api/client";
import "../../../styles/adminUsers.css"; // ✅ branded layout
import "../../../styles/adminCrud.css";  // ✅ keep for shared legacy bits if needed
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
function IRefresh({ spin = false }) {
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
function ISearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  return <div className={`toast ${toast.type === "error" ? "toast-error" : "toast-success"}`}>{toast.msg}</div>;
}

export default function AdminProductDocuments() {
  const nav = useNavigate();
  const { productId } = useParams();

  const [product, setProduct] = useState(null);

  const [rows, setRows] = useState([]);
  const [docs, setDocs] = useState([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // top search (mapped list)
  const [q, setQ] = useState("");

  // toast
  const [toast, setToast] = useState(null); // {type:"success"|"error", msg:string}

  // add form
  const [docId, setDocId] = useState("");
  const [sortOrder, setSortOrder] = useState(0);

  // filter for dropdown (available docs)
  const [docFilter, setDocFilter] = useState("");

  function showToast(type, msg) {
    setToast({ type, msg });
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(null), 2200);
  }

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
    setLoading(true);
    try {
      await Promise.all([loadProduct(), loadMappings(), loadDocuments()]);
    } catch (e) {
      const ui = toUiError(e, "Failed to load product documents.");
      showToast("error", ui.message || "Failed to load product documents.");
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

    const idNum = Number(docId);
    if (!idNum) return showToast("error", "Please select a document.");

    const so = Number(sortOrder);
    if (Number.isNaN(so) || so < 0) return showToast("error", "SortOrder must be 0 or greater.");

    setBusy(true);
    try {
      await api.post(`/content-products/${productId}/documents`, {
        legalDocumentId: idNum,
        sortOrder: so,
      });

      showToast("success", "Document added to product.");
      setDocId("");
      setSortOrder(0);
      setDocFilter("");
      await loadAll();
    } catch (e2) {
      const ui = toUiError(e2, "Failed to add document.");
      showToast("error", ui.message || "Failed to add document.");
    } finally {
      setBusy(false);
    }
  }

  async function updateSort(row, next) {
    const so = Number(next);
    if (Number.isNaN(so) || so < 0) return;

    setBusy(true);
    try {
      const id = row.id ?? row.Id;
      await api.put(`/content-products/${productId}/documents/${id}`, { sortOrder: so });
      showToast("success", "Sort order updated.");
      await loadMappings();
    } catch (e) {
      const ui = toUiError(e, "Failed to update sort order.");
      showToast("error", ui.message || "Failed to update sort order.");
    } finally {
      setBusy(false);
    }
  }

  async function removeRow(row) {
    const title = row.documentTitle ?? row.DocumentTitle ?? "this document";
    if (!window.confirm(`Remove "${title}" from this product?`)) return;

    setBusy(true);
    try {
      const id = row.id ?? row.Id;
      await api.delete(`/content-products/${productId}/documents/${id}`);
      showToast("success", "Document removed.");
      await loadMappings();
      await loadDocuments();
    } catch (e) {
      const ui = toUiError(e, "Failed to remove document.");
      showToast("error", ui.message || "Failed to remove document.");
    } finally {
      setBusy(false);
    }
  }

  const productName = product?.name ?? product?.Name ?? "—";

  return (
    <div className="au-wrap">
      <Toast toast={toast} />

      {/* HERO */}
      <div className="au-hero">
        <div className="au-titleRow">
          <div>
            <div className="au-kicker">LawAfrica • Admin</div>
            <h1 className="au-title">Product Documents</h1>
            <div className="au-subtitle">
              Manage which legal documents belong to: <b>{productName}</b>
            </div>
          </div>

          <div className="au-heroRight" style={{ gap: 10 }}>
            <button className="au-refresh" onClick={() => nav(-1)} disabled={busy}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <IBack /> Back
              </span>
            </button>

            <button className="au-refresh" onClick={loadAll} disabled={busy || loading}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <IRefresh spin={loading} /> {loading ? "Refreshing…" : "Refresh"}
              </span>
            </button>
          </div>
        </div>

        {/* TOPBAR: search (mapped list) */}
        <div className="au-topbar">
          <div className="au-search">
            <span className="au-searchIcon" aria-hidden="true">
              <ISearch />
            </span>
            <input
              placeholder="Search assigned documents by title or status…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={loading}
            />
            {q ? (
              <button className="au-clear" type="button" onClick={() => setQ("")} title="Clear">
                Clear
              </button>
            ) : null}
          </div>

          <div className="au-topbarRight">
            <button
              className="au-refresh"
              type="button"
              onClick={() => {
                const el = document.querySelector(".au-docFilterInput");
                el?.focus?.();
              }}
              disabled={busy || loading}
              title="Jump to Add section"
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <IPlus /> Add
              </span>
            </button>
          </div>
        </div>

        {/* KPIs */}
        <div className="au-kpis">
          <div className="au-kpiCard">
            <div className="au-kpiLabel">Assigned</div>
            <div className="au-kpiValue">{loading ? "…" : filteredRows.length}</div>
          </div>

          <div className="au-kpiCard">
            <div className="au-kpiLabel">Available</div>
            <div className="au-kpiValue">{loading ? "…" : availableDocs.length}</div>
          </div>

          <div className="au-kpiCard">
            <div className="au-kpiLabel">Total docs</div>
            <div className="au-kpiValue">{loading ? "…" : docs.length}</div>
          </div>

          <div className="au-kpiCard">
            <div className="au-kpiLabel">Product ID</div>
            <div className="au-kpiValue">
              <span className="au-mono">{productId}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ADD PANEL (branded) */}
      <div className="au-panel" style={{ marginTop: 14 }}>
        <div className="au-panelTop">
          <div className="au-panelTitle">Add document to product</div>
          <div className="au-pageMeta">{loading ? "Loading…" : `${availableDocs.length} available`}</div>
        </div>

        <div style={{ padding: 14 }}>
          <div className="au-subtitle" style={{ marginTop: 0 }}>
            Tip: <b>SortOrder</b> controls ordering (lower = top).
          </div>

          <form onSubmit={addDocument} style={{ marginTop: 12 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.3fr 1.7fr 0.6fr auto",
                gap: 10,
                alignItems: "end",
              }}
            >
              <div className="au-sort" style={{ width: "100%" }}>
                <span className="au-sortLabel">Find</span>
                <input
                  className="au-docFilterInput"
                  placeholder="Type to filter documents…"
                  value={docFilter}
                  onChange={(e) => setDocFilter(e.target.value)}
                  disabled={busy || loading}
                  style={{
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    fontWeight: 850,
                    color: "var(--au-ink)",
                    width: "100%",
                  }}
                />
              </div>

              <div className="au-sort" style={{ width: "100%" }}>
                <span className="au-sortLabel">Document *</span>
                <select
                  value={docId}
                  onChange={(e) => setDocId(e.target.value)}
                  disabled={busy || loading}
                  aria-label="Select document"
                >
                  <option value="">{loading ? "Loading…" : "Select a document…"}</option>
                  {filteredAvailableDocs.map((d) => (
                    <option key={d.id ?? d.Id} value={d.id ?? d.Id}>
                      {d.title ?? d.Title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="au-sort" style={{ width: "100%" }}>
                <span className="au-sortLabel">SortOrder</span>
                <input
                  type="number"
                  value={String(sortOrder)}
                  onChange={(e) => setSortOrder(e.target.value)}
                  min={0}
                  step={1}
                  disabled={busy || loading}
                  style={{
                    border: "none",
                    outline: "none",
                    background: "transparent",
                    fontWeight: 900,
                    color: "var(--au-ink)",
                    width: "100%",
                  }}
                />
              </div>

              <button
                className="au-refresh"
                type="submit"
                disabled={busy || loading}
                title="Add selected document"
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                  <IAddDoc /> {busy ? "Adding…" : "Add"}
                </span>
              </button>
            </div>

            {!!docFilter.trim() ? (
              <div className="au-pageMeta" style={{ marginTop: 10 }}>
                Showing <b>{filteredAvailableDocs.length}</b> of <b>{availableDocs.length}</b>
              </div>
            ) : null}
          </form>
        </div>

        <div className="au-panelBottom">
          <div className="au-pageMeta">Tip: use low SortOrder for “top” documents.</div>
          <div className="au-pageMeta">{busy ? "Working…" : ""}</div>
        </div>
      </div>

      {/* DIRECTORY (branded table) */}
      <div className="au-panel">
        <div className="au-panelTop">
          <div className="au-panelTitle">Assigned documents</div>
          <div className="au-pageMeta">{loading ? "Loading…" : `${filteredRows.length} record(s)`}</div>
        </div>

        <div className="au-tableWrap">
          <table className="au-table" style={{ minWidth: 980 }}>
            <thead>
              <tr>
                <th style={{ width: "54%" }}>Document</th>
                <th style={{ width: "14%" }}>Status</th>
                <th style={{ width: "12%" }}>Premium?</th>
                <th style={{ width: "12%" }}>SortOrder</th>
                <th className="au-thRight" style={{ width: "8%" }}>
                  Actions
                </th>
              </tr>
            </thead>

            <tbody>
              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="au-empty">
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
                    <td>
                      <div className="au-userCell">
                        <span className={`au-dot ${isPremium ? "" : "on"}`} />
                        <div className="au-userMeta">
                          <div className="au-userName">{title}</div>
                          <div className="au-userSub2">
                            <span className="au-badge au-badge-neutral">
                              <span className="au-muted">Map ID:</span> <span className="au-mono">{id}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className="au-badge au-badge-neutral">{String(status)}</span>
                    </td>

                    <td>
                      <span className={`au-badge ${isPremium ? "au-badge-warn" : "au-badge-neutral"}`}>
                        {pillYesNo(isPremium)}
                      </span>
                    </td>

                    <td>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        defaultValue={String(so)}
                        disabled={busy}
                        onBlur={(e) => updateSort(r, e.target.value)}
                        title="Edit SortOrder then click away to save"
                        style={{
                          width: 110,
                          padding: "10px 12px",
                          borderRadius: 14,
                          border: "1px solid rgba(148, 163, 184, 0.35)",
                          background: "white",
                          fontWeight: 900,
                          color: "var(--au-ink)",
                          outline: "none",
                        }}
                      />
                    </td>

                    <td className="au-tdRight">
                      <div className="au-actionsRow">
                        <button
                          className="au-iconBtn au-iconBtn-danger"
                          type="button"
                          onClick={() => removeRow(r)}
                          disabled={busy}
                          title="Remove from product"
                        >
                          <ITrash />
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
          <div className="au-pageMeta">Tip: edit SortOrder then click away to save.</div>
          <div className="au-pageMeta">{busy ? "Saving…" : ""}</div>
        </div>
      </div>

      <AdminPageFooter right={<span className="admin-footer-muted">Tip: Use low SortOrder for “top” documents.</span>} />
    </div>
  );
}
