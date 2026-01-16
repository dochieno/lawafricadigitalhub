// src/reader/PdfViewer.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import api from "../api/client";
import { getPdfSource } from "../utils/pdfSource";
import "../styles/reader.css";

/* PDF worker */
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export default function PdfViewer({
  documentId,
  startPage = 1,
  maxAllowedPage = null,
  onPreviewLimitReached,
}) {
  const [numPages, setNumPages] = useState(null);
  const [page, setPage] = useState(startPage || 1);
  const [ready, setReady] = useState(false);
  const [highlights, setHighlights] = useState([]);

  /* ---------------- Reading Progress ---------------- */
  const [resumeLoaded, setResumeLoaded] = useState(false);
  const lastSavedPageRef = useRef(null);
  const readingStartRef = useRef(Date.now());
  const pageUpdateTimeoutRef = useRef(null);

  const resumeTargetRef = useRef(null);
  const resumeAppliedRef = useRef(false);

  /* ---------------- Reader Preferences ---------------- */
  const [zoom, setZoom] = useState(1);
  const [darkMode, setDarkMode] = useState(false);

  /* ---------------- Go to Page (popover) ---------------- */
  const [showPageJump, setShowPageJump] = useState(false);
  const [pageJumpValue, setPageJumpValue] = useState("");
  const [pageJumpError, setPageJumpError] = useState("");

  const isProgrammaticNavRef = useRef(false);

  /* ---------------- Notes ---------------- */
  const [showNoteBox, setShowNoteBox] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [notes, setNotes] = useState([]);

  // ✅ notes NOT persistent (closed by default)
  const [showNotes, setShowNotes] = useState(false);

  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingContent, setEditingContent] = useState("");

  const [activeNoteId, setActiveNoteId] = useState(null);
  const [flashNoteId, setFlashNoteId] = useState(null);

  const [highlightColor, setHighlightColor] = useState("yellow");
  const [highlightMeta, setHighlightMeta] = useState(null);

  const pendingJumpRef = useRef(null);
  const noteRefs = useRef({});

  /* Scroll + observer */
  const scrollRootRef = useRef(null);
  const pageObserverRef = useRef(null);
  const snapTimeoutRef = useRef(null);
  const isUserScrollingRef = useRef(false);

  // ✅ NEW: robust scroll-based page detection (fixes “page number not updating”)
  const scrollRafRef = useRef(null);
  const lastScrollComputedPageRef = useRef(null);

  const pageElsRef = useRef({});
  const previewLimitTriggeredRef = useRef(false);

  const [renderLimit, setRenderLimit] = useState(10);

  const fileSource = useMemo(() => getPdfSource(documentId), [documentId]);

  const highlightsByPage = useMemo(() => {
    const map = {};
    for (const h of highlights) {
      if (!map[h.page]) map[h.page] = [];
      map[h.page].push(h);
    }
    return map;
  }, [highlights]);

  const allowedMaxPage = useMemo(() => {
    if (!numPages) return maxAllowedPage ?? null;
    return maxAllowedPage ? Math.min(maxAllowedPage, numPages) : numPages;
  }, [numPages, maxAllowedPage]);

  function registerPageEl(pageNumber, el) {
    if (el) pageElsRef.current[pageNumber] = el;
  }

  function scrollToPage(targetPage, behavior = "auto") {
    const el = pageElsRef.current[targetPage];
    if (!el) return false;
    el.scrollIntoView({ behavior, block: "start" });
    return true;
  }

  /* ==================================================
     LOAD READING PROGRESS
     ================================================== */
  useEffect(() => {
    let cancelled = false;

    setResumeLoaded(false);
    pendingJumpRef.current = null;
    resumeTargetRef.current = null;
    resumeAppliedRef.current = false;

    api
      .get(`/reading-progress/${documentId}`)
      .then((res) => {
        if (cancelled) return;
        const saved = res.data?.pageNumber;
        if (saved && saved > 0) {
          pendingJumpRef.current = saved;
          resumeTargetRef.current = saved;
        }
        setResumeLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setResumeLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  /* ==================================================
     SAVE READING PROGRESS
     ================================================== */
  useEffect(() => {
    if (!ready || !numPages || !resumeLoaded) return;
    if (lastSavedPageRef.current === page) return;

    lastSavedPageRef.current = page;

    const now = Date.now();
    const secondsReadDelta = Math.round((now - readingStartRef.current) / 1000);
    readingStartRef.current = now;

    const percentage = Math.round((page / numPages) * 100);

    api
      .put(`/reading-progress/${documentId}`, {
        pageNumber: page,
        percentage,
        secondsReadDelta,
        isCompleted: percentage >= 100,
      })
      .catch(() => {});
  }, [page, ready, numPages, resumeLoaded, documentId]);

  /* ==================================================
     EXTEND RENDER LIMIT
     ================================================== */
  useEffect(() => {
    if (!ready || !numPages) return;

    const maxPage = allowedMaxPage ?? numPages;

    if (page >= renderLimit - 4) {
      setRenderLimit((prev) => Math.min(maxPage, prev + 10));
    }
  }, [page, renderLimit, ready, numPages, allowedMaxPage]);

  /* ==================================================
     APPLY RESUME (render enough pages, then scroll)
     ================================================== */
  useEffect(() => {
    if (!ready || !numPages || !resumeLoaded) return;
    if (resumeAppliedRef.current) return;

    const targetRaw = resumeTargetRef.current;
    if (!targetRaw) return;

    const maxPage = allowedMaxPage ?? numPages;
    const target = Math.min(Math.max(1, Number(targetRaw)), maxPage);

    setRenderLimit((prev) => Math.max(prev, Math.min(target + 6, maxPage)));
    setPage(target);

    const attemptScroll = () => {
      isProgrammaticNavRef.current = true;

      const ok = scrollToPage(target, "auto");
      if (ok) {
        resumeAppliedRef.current = true;
        setTimeout(() => {
          isProgrammaticNavRef.current = false;
        }, 350);
        return;
      }
      setTimeout(attemptScroll, 80);
    };

    setTimeout(attemptScroll, 80);
  }, [ready, numPages, resumeLoaded, allowedMaxPage]);

  /* ==================================================
     SAFE PAGE SETTER (enforces preview limit)
     ================================================== */
  function safeSetPage(nextPage) {
    if (allowedMaxPage && nextPage > allowedMaxPage) {
      if (typeof onPreviewLimitReached === "function") onPreviewLimitReached();
      return;
    }

    isProgrammaticNavRef.current = true;
    setPage(nextPage);

    requestAnimationFrame(() => {
      scrollToPage(nextPage, "smooth");
      setTimeout(() => {
        isProgrammaticNavRef.current = false;
      }, 350);
    });
  }

  /* ==================================================
     ✅ NEW: Scroll-based current-page detection
     - This fixes cases where IntersectionObserver fails to update (common with react-pdf text/canvas layers)
     ================================================== */
  function computePageFromScroll() {
    const root = scrollRootRef.current;
    if (!root) return;

    const maxPage = allowedMaxPage ?? numPages ?? null;
    if (!maxPage) return;

    const rootRect = root.getBoundingClientRect();
    const anchorY = rootRect.top + 90; // “reading line” near top of viewport

    let bestPage = null;
    let bestDist = Infinity;

    const keys = Object.keys(pageElsRef.current)
      .map((k) => Number(k))
      .filter((n) => Number.isFinite(n) && n > 0 && n <= maxPage)
      .sort((a, b) => a - b);

    for (const p of keys) {
      const el = pageElsRef.current[p];
      if (!el) continue;

      const r = el.getBoundingClientRect();
      // skip pages far outside viewport for perf
      if (r.bottom < rootRect.top - 400) continue;
      if (r.top > rootRect.bottom + 400) break;

      const dist = Math.abs(r.top - anchorY);
      if (dist < bestDist) {
        bestDist = dist;
        bestPage = p;
      }
    }

    if (!bestPage) return;

    // Update state only if it actually changed
    if (
      bestPage !== lastScrollComputedPageRef.current &&
      !isProgrammaticNavRef.current
    ) {
      lastScrollComputedPageRef.current = bestPage;
      clearTimeout(pageUpdateTimeoutRef.current);
      pageUpdateTimeoutRef.current = setTimeout(() => {
        setPage(bestPage);
      }, 60);

      // preview limit trigger
      if (
        allowedMaxPage &&
        bestPage === allowedMaxPage &&
        typeof onPreviewLimitReached === "function" &&
        !previewLimitTriggeredRef.current
      ) {
        previewLimitTriggeredRef.current = true;
        onPreviewLimitReached();
      }
      if (allowedMaxPage && bestPage < allowedMaxPage) {
        previewLimitTriggeredRef.current = false;
      }
    }
  }

  function scheduleComputePageFromScroll() {
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      computePageFromScroll();
    });
  }

  /* ==================================================
     INTERSECTION OBSERVER (kept, but made more forgiving)
     ================================================== */
  useEffect(() => {
    if (!ready) return;

    const root = scrollRootRef.current;
    if (!root) return;

    const pages = root.querySelectorAll(".pdf-page-wrapper");
    if (!pages.length) return;

    if (pageObserverRef.current) pageObserverRef.current.disconnect();

    pageObserverRef.current = new IntersectionObserver(
      (entries) => {
        // pick the most visible element
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!visible) return;

        const current = Number(visible.target.getAttribute("data-page-number"));
        if (!Number.isFinite(current)) return;

        // If IO fires, it’s a strong signal — update quickly
        if (!isProgrammaticNavRef.current) {
          lastScrollComputedPageRef.current = current;
          clearTimeout(pageUpdateTimeoutRef.current);
          pageUpdateTimeoutRef.current = setTimeout(() => {
            setPage(current);
          }, 40);
        }
      },
      {
        root,
        // ✅ Helps with “top-of-viewport” reading; reduces flicker
        rootMargin: "-10% 0px -55% 0px",
        threshold: [0.15, 0.35, 0.55],
      }
    );

    pages.forEach((p) => pageObserverRef.current.observe(p));
    return () => pageObserverRef.current?.disconnect();
  }, [ready, zoom, renderLimit, allowedMaxPage]);

  /* ==================================================
     NOTES: LOAD
     ================================================== */
  useEffect(() => {
    api
      .get(`/legal-document-notes/document/${documentId}`)
      .then((res) => setNotes(res.data || []))
      .catch(() => {});
  }, [documentId]);

  /* ==================================================
     KEYBOARD SHORTCUTS
     ================================================== */
  useEffect(() => {
    function onKeyDown(e) {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const typing =
        tag === "input" || tag === "textarea" || document.activeElement?.isContentEditable;

      if (typing) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        safeSetPage(Math.max(1, page - 1));
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        safeSetPage(Math.min((allowedMaxPage ?? numPages) || 1, page + 1));
      }
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setShowNotes((v) => !v);
      }
      if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        setDarkMode((v) => !v);
      }
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        setZoom((z) => Math.min(1.6, Math.round((z + 0.1) * 10) / 10));
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setZoom((z) => Math.max(0.7, Math.round((z - 0.1) * 10) / 10));
      }
      if (e.key === "Escape") {
        if (showNoteBox) setShowNoteBox(false);
        if (showNotes) setShowNotes(false);
        if (showPageJump) setShowPageJump(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [page, numPages, allowedMaxPage, showNoteBox, showNotes, showPageJump]);

  /* ==================================================
     REAL HIGHLIGHT CAPTURE (unchanged)
     ================================================== */
  function getPageWrapperFromSelection(selection) {
    const node = selection?.anchorNode;
    if (!node) return null;

    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el) return null;

    return el.closest(".pdf-page-wrapper");
  }

  function handleMouseUp() {
    setTimeout(() => {
      if (isUserScrollingRef.current) return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;

      const text = selection.toString().trim();
      if (!text || text.length < 3) return;

      const range = selection.getRangeAt(0);

      const wrapper = getPageWrapperFromSelection(selection);
      if (!wrapper) return;

      const pageNumber = Number(wrapper.getAttribute("data-page-number"));
      if (!pageNumber || Number.isNaN(pageNumber)) return;

      const pageRect = wrapper.getBoundingClientRect();
      const clientRects = Array.from(range.getClientRects());
      if (!clientRects.length) return;

      const rects = clientRects.map((r) => ({
        x: r.left - pageRect.left,
        y: r.top - pageRect.top,
        width: r.width,
        height: r.height,
      }));

      setSelectedText(text);
      setNoteContent("");

      setHighlightMeta({
        id: crypto.randomUUID(),
        page: pageNumber,
        text,
        rects,
      });

      setHighlightColor("yellow");
      setShowNoteBox(true);

      try {
        selection.removeAllRanges();
      } catch {}
    }, 30);
  }

  function jumpToPage(p) {
    if (!p) return;

    const target = Math.min(Math.max(1, p), allowedMaxPage ?? numPages ?? p);

    setRenderLimit((prev) =>
      Math.max(prev, Math.min(target + 6, allowedMaxPage ?? numPages))
    );

    isProgrammaticNavRef.current = true;
    setPage(target);

    requestAnimationFrame(() => {
      setTimeout(() => {
        scrollToPage(target, "smooth");
        setTimeout(() => {
          isProgrammaticNavRef.current = false;
        }, 350);
      }, 60);
    });
  }

  function hasOverlapOnPage(meta) {
    return false;
  }

  /* =========================
     Highlights rendering (offset-based notes)
     ========================= */
  function clearExistingMarks(textLayerEl) {
    const marks = textLayerEl.querySelectorAll("mark.pdf-highlight");
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
    });
  }

  function applyHighlightByOffsets(textLayerEl, start, end, noteId, color = "yellow") {
    const spans = Array.from(textLayerEl.querySelectorAll("span"));
    if (spans.length === 0) return;

    let pos = 0;

    for (const span of spans) {
      const spanText = span.textContent || "";
      const spanStart = pos;
      const spanEnd = pos + spanText.length;
      pos += spanText.length;

      if (spanEnd <= start) continue;
      if (spanStart >= end) break;

      const localStart = Math.max(0, start - spanStart);
      const localEnd = Math.min(spanText.length, end - spanStart);

      const before = spanText.slice(0, localStart);
      const middle = spanText.slice(localStart, localEnd);
      const after = spanText.slice(localEnd);

      span.textContent = "";
      if (before) span.appendChild(document.createTextNode(before));

      const mark = document.createElement("mark");
      mark.className = `pdf-highlight pdf-highlight--${color}`;
      mark.textContent = middle;
      mark.dataset.noteId = String(noteId);

      span.appendChild(mark);

      if (after) span.appendChild(document.createTextNode(after));
    }
  }

  function attachHighlightClickHandler(textLayerEl) {
    if (textLayerEl.dataset.hlClickBound === "1") return;
    textLayerEl.dataset.hlClickBound = "1";

    textLayerEl.addEventListener("click", (e) => {
      const mark = e.target?.closest?.("mark.pdf-highlight");
      if (!mark) return;

      const idStr = mark.dataset.noteId;
      const id = Number(idStr);
      if (!id || Number.isNaN(id)) return;

      focusNote(id);
    });
  }

  function focusNote(noteId) {
    setShowNotes(true);
    setActiveNoteId(noteId);

    setTimeout(() => {
      const el = noteRefs.current[noteId];
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setFlashNoteId(noteId);
        setTimeout(() => setFlashNoteId(null), 900);
      }
    }, 50);
  }

  function applyHighlightsForPage(pageNumber) {
    const wrapper = pageElsRef.current[pageNumber];
    if (!wrapper) return;

    const textLayer = wrapper.querySelector(".react-pdf__Page__textContent");
    if (!textLayer) return;

    clearExistingMarks(textLayer);

    const pageNotes = (notes || []).filter((n) => n.pageNumber === pageNumber);

    for (const n of pageNotes) {
      if (n.charOffsetStart != null && n.charOffsetEnd != null) {
        applyHighlightByOffsets(
          textLayer,
          n.charOffsetStart,
          n.charOffsetEnd,
          n.id,
          n.highlightColor || "yellow"
        );
      }
    }

    attachHighlightClickHandler(textLayer);
  }

  /* ==================================================
     NOTES CRUD
     ================================================== */
  async function saveNote() {
    try {
      if (!highlightMeta) return;

      if (hasOverlapOnPage(highlightMeta)) {
        alert("A highlight already exists in that selected range.");
        return;
      }

      const finalContent =
        noteContent && noteContent.trim().length > 0
          ? noteContent.trim()
          : highlightMeta.text;

      await api.post("/legal-document-notes", {
        legalDocumentId: Number(documentId),
        highlightedText: highlightMeta.text,
        pageNumber: highlightMeta.page,
        charOffsetStart: null,
        charOffsetEnd: null,
        content: finalContent,
        highlightColor: highlightColor,
      });

      const res = await api.get(`/legal-document-notes/document/${documentId}`);
      setNotes(res.data || []);

      setShowNotes(true);

      setHighlights((prev) => [
        ...prev,
        {
          id: highlightMeta.id,
          page: highlightMeta.page,
          rects: highlightMeta.rects,
          color:
            highlightColor === "blue"
              ? "rgba(59,130,246,0.30)"
              : highlightColor === "pink"
              ? "rgba(236,72,153,0.30)"
              : highlightColor === "green"
              ? "rgba(34,197,94,0.28)"
              : "rgba(255, 235, 59, 0.45)",
        },
      ]);

      setTimeout(() => applyHighlightsForPage(highlightMeta.page), 80);
    } catch (err) {
      console.error("Failed to save note:", err);
      alert(
        err?.response?.data?.message ||
          JSON.stringify(err?.response?.data) ||
          "Failed to save note. Please try again."
      );
      return;
    } finally {
      setShowNoteBox(false);
      setSelectedText("");
      setNoteContent("");
      setHighlightMeta(null);
    }
  }

  async function saveEdit(noteId) {
    try {
      await api.put(`/legal-document-notes/${noteId}`, {
        content: editingContent,
      });

      setNotes((ns) =>
        ns.map((n) => (n.id === noteId ? { ...n, content: editingContent } : n))
      );
    } catch (err) {
      alert(
        err?.response?.data?.message ||
          JSON.stringify(err?.response?.data) ||
          "Failed to update note."
      );
    } finally {
      setEditingNoteId(null);
      setEditingContent("");
    }
  }

  async function deleteNote(noteId) {
    if (!confirm("Delete this note?")) return;

    try {
      await api.delete(`/legal-document-notes/${noteId}`);
      setNotes((ns) => ns.filter((n) => n.id !== noteId));
    } catch (err) {
      alert(
        err?.response?.data?.message ||
          JSON.stringify(err?.response?.data) ||
          "Failed to delete note."
      );
    }
  }

  const groupedNotes = useMemo(() => {
    const map = new Map();

    for (const n of notes || []) {
      const key = n.pageNumber ?? -1;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(n);
    }

    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    const keys = Array.from(map.keys()).sort((a, b) => {
      if (a === -1) return 1;
      if (b === -1) return -1;
      return a - b;
    });

    return keys.map((k) => ({
      pageNumber: k === -1 ? null : k,
      items: map.get(k),
    }));
  }, [notes]);

  /* ==================================================
     Page jump helpers
     ================================================== */
  function openPageJump() {
    setPageJumpError("");
    setPageJumpValue(String(page));
    setShowPageJump(true);
  }

  function submitPageJump() {
    const raw = (pageJumpValue || "").trim();
    const n = Number(raw);
    const max = allowedMaxPage ?? numPages ?? 1;

    if (!raw || Number.isNaN(n)) {
      setPageJumpError("Enter a valid page number.");
      return;
    }

    if (n < 1 || n > max) {
      setPageJumpError(`Page must be between 1 and ${max}.`);
      return;
    }

    setShowPageJump(false);
    setPageJumpError("");
    safeSetPage(n);
  }

  /* ==================================================
     Render
     ================================================== */
  return (
    <div className={`reader-shell ${darkMode ? "dark" : ""}`}>
      {/* Minimal “glass” top bar */}
      <div className="reader-topbar">
        <div className="reader-topbar-inner">
          <div className="reader-topbar-left">
            <div className="reader-chip" title="Current page">
              {page} / {numPages || "—"}
            </div>
          </div>

          <div className="reader-topbar-right">
            <button
              className="icon-btn"
              onClick={() => setZoom((z) => Math.max(0.7, Math.round((z - 0.1) * 10) / 10))}
              title="Zoom out (-)"
            >
              −
            </button>
            <div className="reader-chip" title="Zoom">
              {Math.round(zoom * 100)}%
            </div>
            <button
              className="icon-btn"
              onClick={() => setZoom((z) => Math.min(1.6, Math.round((z + 0.1) * 10) / 10))}
              title="Zoom in (+)"
            >
              +
            </button>

            <button
              className="icon-btn"
              onClick={() => setDarkMode((d) => !d)}
              title={darkMode ? "Light mode (D)" : "Dark mode (D)"}
            >
              {darkMode ? "☀️" : "🌙"}
            </button>

            <button
              className={`icon-btn ${showNotes ? "active" : ""}`}
              onClick={() => setShowNotes((v) => !v)}
              title="Notes (N)"
            >
              📝
            </button>
          </div>
        </div>
      </div>

      <div className="reader-container">
        <div
          className="reader-scroll"
          ref={scrollRootRef}
          onMouseUp={handleMouseUp}
          onScroll={() => {
            if (!ready) return;

            // always compute page from scroll (this is the fix)
            if (!isProgrammaticNavRef.current) {
              scheduleComputePageFromScroll();
            }

            isUserScrollingRef.current = true;
            clearTimeout(snapTimeoutRef.current);
            snapTimeoutRef.current = setTimeout(() => {
              isUserScrollingRef.current = false;
            }, 120);
          }}
        >
          <Document
            file={fileSource}
            onLoadError={(err) => {
              console.error("react-pdf onLoadError:", err, "fileSource=", fileSource);
            }}
            onSourceError={(err) => {
              console.error("react-pdf onSourceError:", err, "fileSource=", fileSource);
            }}
            onLoadSuccess={({ numPages }) => {
              setNumPages(numPages);

              const allowed = maxAllowedPage
                ? Math.min(maxAllowedPage, numPages)
                : numPages;

              let initial = startPage || 1;

              if (pendingJumpRef.current != null) {
                initial = pendingJumpRef.current;
                pendingJumpRef.current = null;
              }

              initial = Math.min(Math.max(1, initial), allowed);

              setPage(initial);
              setRenderLimit(Math.min(allowed, Math.max(initial + 6, 10)));
              setReady(true);

              isProgrammaticNavRef.current = true;
              setTimeout(() => {
                scrollToPage(initial, "auto");
                setTimeout(() => {
                  isProgrammaticNavRef.current = false;
                  // ensure navigator syncs right after initial paint
                  scheduleComputePageFromScroll();
                }, 250);
              }, 80);
            }}
          >
            {ready &&
              Array.from({ length: renderLimit }, (_, i) => {
                const pageNumber = i + 1;

                return (
                  <div
                    key={pageNumber}
                    className="pdf-page-wrapper"
                    data-page-number={pageNumber}
                    ref={(el) => registerPageEl(pageNumber, el)}
                  >
                    <svg className="highlight-layer" width="100%" height="100%">
                      {(highlightsByPage?.[pageNumber] || []).map((h) =>
                        (h.rects || []).map((r, idx) => (
                          <rect
                            key={`${h.id}-${idx}`}
                            x={r.x}
                            y={r.y}
                            width={r.width}
                            height={r.height}
                            rx="2"
                            fill={h.color || "rgba(255, 235, 59, 0.45)"}
                          />
                        ))
                      )}
                    </svg>

                    <Page
                      pageNumber={pageNumber}
                      width={Math.round(820 * zoom)}
                      onRenderTextLayerSuccess={() => {
                        applyHighlightsForPage(pageNumber);
                        // when a page finishes rendering, it can change layout -> re-sync page calc
                        scheduleComputePageFromScroll();
                      }}
                    />
                  </div>
                );
              })}
          </Document>

          <div style={{ height: 28 }} />
        </div>
      </div>

      {/* Floating compact navigation pill */}
      <div className="reader-fab">
        <button
          className="fab-btn"
          onClick={() => safeSetPage(Math.max(1, page - 1))}
          disabled={page <= 1}
          title="Previous page (←)"
        >
          ◀
        </button>

        <button className="fab-mid" onClick={openPageJump} title="Go to page">
          Page {page} / {numPages || "—"}
        </button>

        <button
          className="fab-btn"
          onClick={() => safeSetPage(Math.min((allowedMaxPage ?? numPages) || 1, page + 1))}
          disabled={numPages ? page >= (allowedMaxPage ?? numPages) : true}
          title="Next page (→)"
        >
          ▶
        </button>

        {showPageJump && (
          <div className="pagejump-popover" role="dialog" aria-modal="true">
            <div className="pagejump-title">Go to page</div>
            <div className="pagejump-row">
              <input
                className="pagejump-input"
                value={pageJumpValue}
                onChange={(e) => setPageJumpValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitPageJump();
                  if (e.key === "Escape") setShowPageJump(false);
                }}
                inputMode="numeric"
                placeholder="e.g. 12"
              />
              <button className="pagejump-go" onClick={submitPageJump}>
                Go
              </button>
            </div>
            {!!pageJumpError && <div className="pagejump-error">{pageJumpError}</div>}
            <button className="pagejump-close" onClick={() => setShowPageJump(false)}>
              Close
            </button>
          </div>
        )}
      </div>

      {/* NOTE OVERLAY */}
      {showNoteBox && (
        <div className="note-overlay">
          <div className="note-box">
            <h4>Add note</h4>
            <p className="note-preview">“{selectedText.slice(0, 120)}…”</p>

            <div className="hl-color-row">
              <span className="hl-color-label">Highlight:</span>
              {["yellow", "blue", "pink", "green"].map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`hl-color-chip ${c} ${highlightColor === c ? "active" : ""}`}
                  onClick={() => setHighlightColor(c)}
                  title={c}
                />
              ))}
            </div>

            <textarea
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder="Write your note (optional)…"
            />

            <div className="note-actions">
              <button
                className="reader-btn secondary"
                onClick={() => {
                  setShowNoteBox(false);
                  setSelectedText("");
                  setNoteContent("");
                  setHighlightMeta(null);
                }}
              >
                Cancel
              </button>

              <button className="reader-btn" onClick={saveNote}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notes sidebar + backdrop (mobile-friendly) */}
      {showNotes && <div className="notes-backdrop" onClick={() => setShowNotes(false)} />}

      <div className={`notes-sidebar ${showNotes ? "open" : "closed"}`}>
        <div className="notes-header">
          <h3>Notes</h3>
          <button onClick={() => setShowNotes(false)} title="Close (Esc)">
            ✕
          </button>
        </div>

        <div className="notes-list">
          {groupedNotes.length === 0 ? (
            <div className="notes-empty">
              <p>No notes yet</p>
              <p className="notes-empty-hint">Select text in the document to add your first note.</p>
            </div>
          ) : (
            groupedNotes.map((group) => (
              <div key={group.pageNumber ?? "unknown"} className="notes-group">
                <div className="notes-group-title">Page {group.pageNumber ?? "—"}</div>

                {group.items.map((note) => (
                  <div
                    key={note.id}
                    className={[
                      "note-item",
                      note.id === activeNoteId ? "active" : "",
                      note.id === flashNoteId ? "flash" : "",
                    ].join(" ")}
                    ref={(el) => {
                      if (el) noteRefs.current[note.id] = el;
                    }}
                  >
                    <div
                      className="note-meta"
                      onClick={() => jumpToPage(note.pageNumber)}
                      style={{ cursor: "pointer" }}
                    >
                      <span className={`note-color-dot ${note.highlightColor || "yellow"}`} />
                      Page {note.pageNumber ?? "—"}
                    </div>

                    {editingNoteId === note.id ? (
                      <>
                        <textarea
                          className="note-edit"
                          value={editingContent}
                          onChange={(e) => setEditingContent(e.target.value)}
                        />
                        <div className="note-actions-inline">
                          <button onClick={() => saveEdit(note.id)}>💾</button>
                          <button
                            onClick={() => {
                              setEditingNoteId(null);
                              setEditingContent("");
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="note-text">{note.content}</div>
                        <div className="note-actions-inline">
                          <button
                            onClick={() => {
                              setEditingNoteId(note.id);
                              setEditingContent(note.content);
                            }}
                          >
                            ✏️
                          </button>
                          <button onClick={() => deleteNote(note.id)}>🗑️</button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
