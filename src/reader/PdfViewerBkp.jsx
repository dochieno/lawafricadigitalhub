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

  /* ---------------- Content Availability ---------------- */
  const [blocked, setBlocked] = useState(false);
  const [blockMessage, setBlockMessage] = useState("");

  /* ---------------- Reader Preferences ---------------- */
  const [zoom, setZoom] = useState(1);
  const [darkMode, setDarkMode] = useState(false);
  const WINDOW_BEFORE = 5;
  const WINDOW_AFTER = 7;

  const endPage = Math.min(maxAllowedPage ?? numPages, page + WINDOW_AFTER);

  /* ---------------- Go to Page ---------------- */
  const [pageJumpError, setPageJumpError] = useState("");
  const pageInputRef = useRef(null);
  const isProgrammaticNavRef = useRef(false);


  /* ---------------- Notes ---------------- */
  const [showNoteBox, setShowNoteBox] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [notes, setNotes] = useState([]);

  // Sidebar always exists; "showNotes" controls open/closed
  const [showNotes, setShowNotes] = useState(true);

  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingContent, setEditingContent] = useState("");

  // ✅ Feature 1: highlight click opens the note
  const [activeNoteId, setActiveNoteId] = useState(null);
  const [flashNoteId, setFlashNoteId] = useState(null);

  // ✅ Feature 3: highlight colors
  const [highlightColor, setHighlightColor] = useState("yellow");

  // ✅ Real highlight meta captured from selection
  const [highlightMeta, setHighlightMeta] = useState(null);
  // highlightMeta = { text, page, start, end }

  /* Reliable jump */
  const pendingJumpRef = useRef(null);

  const noteRefs = useRef({}); // noteId -> HTMLElement

  const fileSource = useMemo(() => getPdfSource(documentId), [documentId]);

  const highlightsByPage = useMemo(() => {
        const map = {};
        for (const h of highlights) {
          if (!map[h.page]) map[h.page] = [];
          map[h.page].push(h);
        }
        return map;
      }, [highlights]);


  /* ==================================================
     SCROLL MODE + PROGRESSIVE RENDER
     ================================================== */
  const scrollRootRef = useRef(null);
  const pageObserverRef = useRef(null);
  const snapTimeoutRef = useRef(null);
  const isUserScrollingRef = useRef(false);

  const pageElsRef = useRef({}); // pageNumber -> wrapper HTMLElement
  const previewLimitTriggeredRef = useRef(false);

  const [renderLimit, setRenderLimit] = useState(10);

  const allowedMaxPage = useMemo(() => {
    if (!numPages) return maxAllowedPage ?? null;
    return maxAllowedPage ? Math.min(maxAllowedPage, numPages) : numPages;
  }, [numPages, maxAllowedPage]);

  function registerPageEl(pageNumber, el) {
    if (el) pageElsRef.current[pageNumber] = el;
  }

  // Scrolling Helper Function
    function scrollToPage(targetPage, behavior = "auto") {
      const el = pageElsRef.current[targetPage];
      if (!el) return;

      el.scrollIntoView({
        behavior,
        block: "start",
      });
    }

  /* ==================================================
     CONTENT AVAILABILITY GUARD
     ================================================== */
  useEffect(() => {
    let cancelled = false;

    api
      .get(`/legal-documents/${documentId}/availability`)
      .then((res) => {
        if (cancelled) return;
        if (!res.data?.hasContent) {
          setBlocked(true);
          setBlockMessage(
            res.data?.message ||
              "This document is listed in our catalog, but its content is not yet available."
          );
        }
      })
      .catch(() => {
        if (cancelled) return;
        setBlocked(true);
        setBlockMessage("Document content is unavailable.");
      });

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  if (blocked) {
    return (
      <div style={{ padding: 24 }}>
        <h2>Document unavailable</h2>
        <p>{blockMessage}</p>
      </div>
    );
  }

  /* ==================================================
     LOAD READING PROGRESS (RESUME) — SINGLE SOURCE
     ================================================== */
  useEffect(() => {
    let cancelled = false;

    api
      .get(`/reading-progress/${documentId}`)
      .then((res) => {
        if (cancelled) return;

        const saved = res.data?.pageNumber;
        if (saved && saved > 0) {
          pendingJumpRef.current = saved;
        }
        setResumeLoaded(true);
      })
      .catch(() => setResumeLoaded(true));

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  /* ==================================================
     SAVE READING PROGRESS (single source of truth)
     ================================================== */
  useEffect(() => {
    if (!ready || !numPages || !resumeLoaded) return;
    if (lastSavedPageRef.current === page) return;

    lastSavedPageRef.current = page;

    const now = Date.now();
    const secondsReadDelta = Math.round(
      (now - readingStartRef.current) / 1000
    );
    readingStartRef.current = now;

    const percentage = Math.round((page / numPages) * 100);

    api
      .put(`/reading-progress/${documentId}`, {
        pageNumber: page,
        percentage,
        secondsReadDelta,
        isCompleted: percentage >= 100,
      })
      .catch((err) => {
        console.warn("Reading progress not saved:", err.message);
      });
  }, [page, ready, numPages, resumeLoaded, documentId]);

  /* ==================================================
     SAFE PAGE SETTER (PREVIEW ENFORCEMENT)
     ================================================== */
  function safeSetPage(nextPage) {
    if (allowedMaxPage && nextPage > allowedMaxPage) {
      if (typeof onPreviewLimitReached === "function") {
        onPreviewLimitReached();
      }
      return;
    }
    setPage(nextPage);

    // keep scroll in sync
    requestAnimationFrame(() => scrollToPage(nextPage, "smooth"));
  }

   /* ---------------- Load notes ---------------- */
  useEffect(() => {
    api
      .get(`/legal-document-notes/document/${documentId}`)
      .then((res) => {
        setNotes(res.data || []);
      })
      .catch((err) => {
        console.warn("Failed to load notes:", err?.response?.data || err?.message);
      });
  }, [documentId]);


    useEffect(() => {
      if (!ready || !numPages) return;

      const maxPage = allowedMaxPage ?? numPages;

      // When user approaches the end of rendered pages,
      // extend the render window forward
      if (page >= renderLimit - 4) {
        setRenderLimit((prev) =>
          Math.min(maxPage, prev + 10)
        );
      }
    }, [page, renderLimit, ready, numPages, allowedMaxPage]);


  /* ==================================================
     PROGRESSIVE RENDER EXTENSION (prevents lag on 779 pages)
     ================================================== */
  useEffect(() => {
    if (!ready || !numPages) return;
    if (!allowedMaxPage) return;

    const EXTEND_THRESHOLD = 4;
    const EXTEND_BY = 10;

    if (page >= renderLimit - EXTEND_THRESHOLD) {
      setRenderLimit((prev) => Math.min(allowedMaxPage, prev + EXTEND_BY));
    }
  }, [page, renderLimit, ready, numPages, allowedMaxPage]);

  /* ==================================================
     INTERSECTION OBSERVER (updates page number on scroll)
     ================================================== */
  useEffect(() => {
    if (!ready) return;

    const root = scrollRootRef.current;
    if (!root) return;

    const pages = root.querySelectorAll(".pdf-page-wrapper");
    if (!pages.length) return;

    if (pageObserverRef.current) {
      pageObserverRef.current.disconnect();
    }

    pageObserverRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!visible) return;

        const current = Number(
          visible.target.getAttribute("data-page-number")
        );

        if (!Number.isNaN(current)) {
          if (!isProgrammaticNavRef.current) {
              if (!isProgrammaticNavRef.current) {
                clearTimeout(pageUpdateTimeoutRef.current);
                pageUpdateTimeoutRef.current = setTimeout(() => {
                  setPage(current);
                }, 100);
              }

               }

          // preview enforcement when user hits last allowed page
          if (
            allowedMaxPage &&
            current === allowedMaxPage &&
            typeof onPreviewLimitReached === "function" &&
            !previewLimitTriggeredRef.current
          ) {
            previewLimitTriggeredRef.current = true;
            onPreviewLimitReached();
          }

          if (allowedMaxPage && current < allowedMaxPage) {
            previewLimitTriggeredRef.current = false;
          }
        }
      },
      {
        root,
        threshold: 0.6,
      }
    );

    pages.forEach((p) => pageObserverRef.current.observe(p));

    return () => pageObserverRef.current?.disconnect();
  }, [ready, zoom, renderLimit, allowedMaxPage]);

  /* ==================================================
     REAL HIGHLIGHT CAPTURE: selection -> page offsets
     ================================================== */
  function getPageWrapperFromSelection(selection) {
    const node = selection?.anchorNode;
    if (!node) return null;

    const el = node.nodeType === 1 ? node : node.parentElement;
    if (!el) return null;

    return el.closest(".pdf-page-wrapper");
  }

  function getTextLayerElForWrapper(wrapperEl) {
    if (!wrapperEl) return null;
    return wrapperEl.querySelector(".react-pdf__Page__textContent");
  }

  function getGlobalOffsetsFromRange(textLayerEl, range) {
    const walker = document.createTreeWalker(
      textLayerEl,
      NodeFilter.SHOW_TEXT,
      null
    );

    let index = 0;
    let start = null;
    let end = null;

    const startContainer = range.startContainer;
    const endContainer = range.endContainer;

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const len = node.nodeValue?.length ?? 0;

      if (node === startContainer) start = index + range.startOffset;
      if (node === endContainer) end = index + range.endOffset;

      index += len;
      if (start != null && end != null) break;
    }

    if (start == null || end == null) return null;

    const s = Math.min(start, end);
    const e = Math.max(start, end);
    if (e - s < 3) return null;

    return { start: s, end: e };
  }


  //I have changed here.
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

      // ✅ SVG-compatible rects (x/y, not top/left)
      const rects = clientRects.map((r) => ({
        x: r.left - pageRect.left,
        y: r.top - pageRect.top,
        width: r.width,
        height: r.height,
      }));


    setSelectedText(text);
    setNoteContent("");

    // 🔑 NEW highlight meta model (rect-based)
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
  /* ---------------- Note jump ---------------- */
  function jumpToPage(p) {
    if (!p) return;

    const target = Math.min(
      Math.max(1, p),
      allowedMaxPage ?? numPages ?? p
    );

    setRenderLimit((prev) =>
      Math.max(prev, Math.min(target + 6, allowedMaxPage ?? numPages))
    );

    setPage(target);

    requestAnimationFrame(() => {
      setTimeout(() => {
        scrollToPage(target, "smooth");
      }, 60);
    });
  }

  /* ==================================================
     FEATURE 4: Prevent overlap/duplicates (frontend guard)
     ================================================== */
  function overlaps(aStart, aEnd, bStart, bEnd) {
    const as = Math.min(aStart, aEnd);
    const ae = Math.max(aStart, aEnd);
    const bs = Math.min(bStart, bEnd);
    const be = Math.max(bStart, bEnd);
    return as < be && ae > bs;
  }

  function hasOverlapOnPage(meta) {
    if (!meta) return false;
    const pageNotes = (notes || []).filter(
      (n) =>
        n.pageNumber === meta.page &&
        n.charOffsetStart != null &&
        n.charOffsetEnd != null
    );

    return pageNotes.some((n) =>
      overlaps(meta.start, meta.end, n.charOffsetStart, n.charOffsetEnd)
    );
  }

  /* ==================================================
     HIGHLIGHT RENDERING (per page wrapper)
     ================================================== */
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
        charOffsetStart: highlightMeta.start,
        charOffsetEnd: highlightMeta.end,
        content: finalContent,
        highlightColor: highlightColor,
      });

      const res = await api.get(`/legal-document-notes/document/${documentId}`);
      setNotes(res.data || []);
      setShowNotes(true);

      setTimeout(() => applyHighlightsForPage(highlightMeta.page), 60);
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

  /* ==================================================
     FEATURE 2: Group notes by page
     ================================================== */
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
     UI
     ================================================== */
  return (
    <div className={`reader-shell ${darkMode ? "dark" : ""}`}>
      {/* ================= TOP NAV ================= */}
<div className="reader-top-nav">
  <div className="reader-top-nav-inner go-only">


    {/* TOOLS (unchanged) */}
    <div className="reader-tools">
      <button onClick={() => setZoom((z) => Math.max(0.7, z - 0.1))}>
        −
      </button>
      <span>{Math.round(zoom * 100)}%</span>
      <button onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))}>
        +
      </button>
      <button onClick={() => setDarkMode((d) => !d)}>
        {darkMode ? "☀️" : "🌙"}
      </button>
      <button onClick={() => setShowNotes((v) => !v)}>📝</button>
    </div>

  </div>
</div>


      {/* ================= PDF CONTENT (SCROLL) ================= */}
      <div className="reader-container">
        <div
          className="reader-scroll"
          ref={scrollRootRef}
          onMouseUp={handleMouseUp}
            onScroll={() => {
              if (isProgrammaticNavRef.current) return;

              isUserScrollingRef.current = true;

              clearTimeout(snapTimeoutRef.current);
              snapTimeoutRef.current = setTimeout(() => {
                isUserScrollingRef.current = false;
              }, 120);
            }}
        >
<Document
  file={fileSource}
  onLoadSuccess={({ numPages }) => {
    setNumPages(numPages);

    const allowed = maxAllowedPage
      ? Math.min(maxAllowedPage, numPages)
      : numPages;

    // ✅ Choose initial page:
    let initial = startPage || 1;

    if (pendingJumpRef.current != null) {
      initial = pendingJumpRef.current;
      pendingJumpRef.current = null;
    }

    initial = Math.min(Math.max(1, initial), allowed);

    setPage(initial);
    setRenderLimit(Math.min(allowed, Math.max(initial + 6, 10)));
    setReady(true);

    setTimeout(() => scrollToPage(initial, "auto"), 80);
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
          {/* 🟨 SVG HIGHLIGHT LAYER */}
          <svg
            className="highlight-layer"
            width="100%"
            height="100%"
          >
            {(highlightsByPage?.[pageNumber] || []).map((h) =>
              h.rects.map((r, idx) => (
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

          {/* 📄 PDF PAGE */}
          <Page
            pageNumber={pageNumber}
            width={Math.round(820 * zoom)}
            onRenderTextLayerSuccess={() =>
              applyHighlightsForPage(pageNumber)
            }
          />
        </div>
      );
    })}
</Document>


          <div style={{ height: 32 }} />
        </div>
      </div>

      {/* ================= BOTTOM NAV ================= */}
      <div className="reader-nav">
        <div className="reader-nav-inner">
          <button
            className="reader-btn secondary"
            onClick={() => safeSetPage(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            ◀ Previous
          </button>

          <div className="reader-page-indicator">
            Page {page} / {numPages}
          </div>

          <button
            className="reader-btn"
            onClick={() =>
              safeSetPage(Math.min((allowedMaxPage ?? numPages) || 1, page + 1))
            }
            disabled={numPages ? page >= (allowedMaxPage ?? numPages) : true}
          >
            Next ▶
          </button>
        </div>
      </div>

      {/* ================= NOTE MODAL ================= */}
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
                  className={`hl-color-chip ${c} ${
                    highlightColor === c ? "active" : ""
                  }`}
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

      {/* ================= NOTES SIDEBAR (ALWAYS PRESENT) ================= */}
      <div className={`notes-sidebar ${showNotes ? "open" : "closed"}`}>
        <div className="notes-header">
          <h3>Notes</h3>
          <button onClick={() => setShowNotes(false)}>✕</button>
        </div>

        <div className="notes-list">
          {groupedNotes.length === 0 ? (
            <div className="notes-empty">
              <p>No notes yet</p>
              <p className="notes-empty-hint">
                Select text in the document to add your first note.
              </p>
            </div>
          ) : (
            groupedNotes.map((group) => (
              <div key={group.pageNumber ?? "unknown"} className="notes-group">
                <div className="notes-group-title">
                  Page {group.pageNumber ?? "—"}
                </div>

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
                      <span
                        className={`note-color-dot ${
                          note.highlightColor || "yellow"
                        }`}
                      />
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
