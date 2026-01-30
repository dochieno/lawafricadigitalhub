// src/pages/Reader.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import PdfViewer from "../reader/PdfViewer";
import api from "../api/client";
import "../styles/reader.css";

/** ---------------------------
 * Small helpers (pure)
 * -------------------------- */
function safeAbort(ctrl) {
  if (!ctrl) return;
  try {
    ctrl.abort();
  } catch (err) {
    // no-empty: keep as debug-only, but DO something
    // (avoid noisy console.error; this is non-critical)
    console.debug("AbortController abort failed (non-fatal):", err);
  }
}

export default function Reader() {
  const { id } = useParams();

  const [doc, setDoc] = useState(null);

  // ToC drawer state
  const [tocOpen, setTocOpen] = useState(false);
  const [toc, setToc] = useState([]);
  const [tocLoading, setTocLoading] = useState(false);
  const [tocError, setTocError] = useState("");

  // Store PdfViewer API in a ref (NOT state)
  const viewerApiRef = useRef(null);

  // avoid setState after unmount
  const mountedRef = useRef(false);

  // Track in-flight requests
  const docAbortRef = useRef(null);
  const tocAbortRef = useRef(null);

  /** ---------------------------
   * Mount / unmount
   * -------------------------- */
  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      safeAbort(docAbortRef.current);
      safeAbort(tocAbortRef.current);
    };
  }, []);

  const handleRegisterApi = useCallback((apiObj) => {
    viewerApiRef.current = apiObj; // { jumpToPage } or null
  }, []);

  /** ---------------------------
   * Load reader state (title + resume)
   * -------------------------- */
  useEffect(() => {
    // Abort previous doc request (if any)
    safeAbort(docAbortRef.current);

    const ctrl = new AbortController();
    docAbortRef.current = ctrl;

    api
      .get(`/documents/${id}/reader-state`, { signal: ctrl.signal })
      .then((res) => {
        if (!mountedRef.current || ctrl.signal.aborted) return;
        setDoc(res.data);
      })
      .catch((err) => {
        // If aborted, do nothing
        if (!mountedRef.current || ctrl.signal.aborted) return;

        // no-empty: record something lightweight
        console.debug("Failed to load reader-state:", err);

        setDoc(null);
      });
  }, [id]);

  /** ---------------------------
   * Open/close ToC (event handler)
   * IMPORTANT: setState happens HERE (event), not in the effect body,
   * to satisfy react-hooks/set-state-in-effect.
   * -------------------------- */
  const openToc = useCallback(() => {
    // If we’re already open, do nothing
    setTocOpen(true);

    // Start loading UX (event-driven, not inside useEffect)
    setTocLoading(true);
    setTocError("");

    // Optional: keep old toc while loading (current behavior)
  }, []);

  const closeToc = useCallback(() => {
    setTocOpen(false);
  }, []);

  /** ---------------------------
   * Load ToC only when drawer opens
   * (NO setState directly in the effect body)
   * -------------------------- */
  useEffect(() => {
    if (!tocOpen) return;

    // Abort previous toc request (if any)
    safeAbort(tocAbortRef.current);

    const ctrl = new AbortController();
    tocAbortRef.current = ctrl;

    api
      .get(`/documents/${id}/toc`, { signal: ctrl.signal })
      .then((res) => {
        if (!mountedRef.current || ctrl.signal.aborted) return;

        const items = Array.isArray(res.data) ? res.data : res.data?.items || [];
        setToc(items);
        setTocLoading(false);
      })
      .catch((err) => {
        if (!mountedRef.current || ctrl.signal.aborted) return;

        // no-empty: keep a trace for debugging
        console.debug("Failed to load ToC:", err);

        setTocError(err?.response?.data?.message || "Failed to load Table of Contents.");
        setTocLoading(false);
      });
  }, [id, tocOpen]);

  const title = useMemo(() => doc?.title || doc?.name || "Reader", [doc]);
  const startPage = doc?.resume?.pageNumber || 1;

  const onTocClick = useCallback((pageNumber) => {
    const p = Number(pageNumber);
    if (!Number.isFinite(p) || p <= 0) return;

    const ok = viewerApiRef.current?.jumpToPage?.(p, "smooth");
    if (ok) setTocOpen(false);
  }, []);

  if (!doc) return <div style={{ padding: 14 }}>Loading document…</div>;

  return (
    <div className="reader-layout">
      {/* Mobile topbar */}
      <div className="readerpage-topbar">
        <button
          className="readerpage-tocbtn"
          type="button"
          onClick={openToc}
          title="Table of Contents"
        >
          ☰ ToC
        </button>

        <div className="readerpage-title" title={title}>
          {title}
        </div>
      </div>

      {/* Backdrop */}
      {tocOpen && <div className="readerpage-tocBackdrop" onClick={closeToc} />}

      {/* ToC drawer */}
      <div className={`readerpage-tocDrawer ${tocOpen ? "open" : ""}`}>
        <div className="readerpage-tocHeader">
          <div className="readerpage-tocTitle">Table of Contents</div>
          <button
            className="readerpage-tocClose"
            type="button"
            onClick={closeToc}
            title="Close"
          >
            ✕
          </button>
        </div>

        <div className="readerpage-tocBody">
          {tocLoading ? (
            <div className="readerpage-tocState">Loading ToC…</div>
          ) : tocError ? (
            <div className="readerpage-tocState error">{tocError}</div>
          ) : toc?.length ? (
            <div className="readerpage-tocList">
              {toc.map((item, idx) => {
                const label =
                  item.title || item.heading || item.text || item.label || `Section ${idx + 1}`;
                const pageNumber = item.pageNumber ?? item.page ?? item.startPage ?? null;

                return (
                  <button
                    key={item.id || `${idx}-${label}`}
                    className="readerpage-tocItem"
                    type="button"
                    onClick={() => onTocClick(pageNumber)}
                    disabled={!pageNumber}
                    title={pageNumber ? `Go to page ${pageNumber}` : "No page mapped"}
                  >
                    <div className="readerpage-tocItemTitle">{label}</div>
                    <div className="readerpage-tocItemPage">{pageNumber ? pageNumber : "—"}</div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="readerpage-tocState">No ToC available.</div>
          )}
        </div>
      </div>

      {/* Main reader */}
      <div className="readerpage-main">
        <PdfViewer documentId={id} startPage={startPage} onRegisterApi={handleRegisterApi} />
      </div>
    </div>
  );
}
