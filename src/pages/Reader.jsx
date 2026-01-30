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
    console.debug("AbortController abort failed (non-fatal):", err);
  }
}

/**
 * Normalize ToC items from any API shape:
 * - supports: title/heading/text/label
 * - supports: pageNumber/page/startPage
 * returns { id, label, pageNumber, level }
 */
function normalizeTocItems(raw) {
  const items = Array.isArray(raw) ? raw : raw?.items || [];
  return items
    .map((item, idx) => {
      const label =
        item?.title ||
        item?.heading ||
        item?.text ||
        item?.label ||
        item?.name ||
        `Section ${idx + 1}`;

      const pageNumberRaw = item?.pageNumber ?? item?.page ?? item?.startPage ?? null;
      const pageNumber = Number(pageNumberRaw);

      return {
        id: item?.id ?? `${idx}-${label}`,
        label: String(label),
        pageNumber: Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : null,
        level: Number.isFinite(Number(item?.level)) ? Number(item.level) : 0,
      };
    })
    .filter((x) => x.label && x.label.trim().length > 0);
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
    // apiObj is { jumpToPage } or null
    viewerApiRef.current = apiObj;
  }, []);

  /** ---------------------------
   * Load reader state (title + resume)
   * -------------------------- */
  useEffect(() => {
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
        if (!mountedRef.current || ctrl.signal.aborted) return;
        console.debug("Failed to load reader-state:", err);
        setDoc(null);
      });
  }, [id]);

  /** ---------------------------
   * Open/close ToC
   * -------------------------- */
  const openToc = useCallback(() => {
    setTocOpen(true);
    setTocLoading(true);
    setTocError("");
    // keep existing ToC while loading (nice UX)
  }, []);

  const closeToc = useCallback(() => setTocOpen(false), []);

  /** ---------------------------
   * Load ToC only when drawer opens
   * -------------------------- */
  useEffect(() => {
    if (!tocOpen) return;

    safeAbort(tocAbortRef.current);

    const ctrl = new AbortController();
    tocAbortRef.current = ctrl;

    api
      .get(`/documents/${id}/toc`, { signal: ctrl.signal })
      .then((res) => {
        if (!mountedRef.current || ctrl.signal.aborted) return;

        const normalized = normalizeTocItems(res.data);
        setToc(normalized);
        setTocLoading(false);
      })
      .catch((err) => {
        if (!mountedRef.current || ctrl.signal.aborted) return;

        console.debug("Failed to load ToC:", err);
        setTocError(err?.response?.data?.message || "Failed to load Table of Contents.");
        setTocLoading(false);
      });
  }, [id, tocOpen]);

  const title = useMemo(() => doc?.title || doc?.name || "Reader", [doc]);
  const startPage = useMemo(() => Number(doc?.resume?.pageNumber || 1), [doc]);

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
              {toc.map((item) => (
                <button
                  key={item.id}
                  className="readerpage-tocItem"
                  type="button"
                  onClick={() => onTocClick(item.pageNumber)}
                  disabled={!item.pageNumber}
                  title={item.pageNumber ? `Go to page ${item.pageNumber}` : "No page mapped"}
                  style={{
                    paddingLeft: 12 + Math.min(4, Math.max(0, item.level)) * 12,
                  }}
                >
                  <div className="readerpage-tocItemTitle">{item.label}</div>
                  <div className="readerpage-tocItemPage">{item.pageNumber ? item.pageNumber : "—"}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="readerpage-tocState">No ToC available.</div>
          )}
        </div>
      </div>

      {/* Main reader */}
      <div className="readerpage-main">
        <PdfViewer
          documentId={id}
          startPage={startPage}
          onRegisterApi={handleRegisterApi}
        />
      </div>
    </div>
  );
}
