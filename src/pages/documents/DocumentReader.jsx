// src/pages/documents/DocumentReader.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import api, { checkDocumentAvailability } from "../../api/client";
import { summarizeLegalDocSection } from "../../api/aiSections";
import PdfViewer from "../../reader/PdfViewer";
import SectionSummaryPanel from "../../components/reader/SectionSummaryPanel";
import "../../styles/reader.css";

import lawAfricaLogo from "../../assets/brand/lawafrica-logo.png";

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

function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function safeGetLS(key) {
  try {
    return window?.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safeSetLS(key, value) {
  try {
    window?.localStorage?.setItem(key, value);
  } catch {
    // ignore
  }
}

async function safeCopyToClipboard(text) {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // ignore and fallback
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.className = "laHiddenTextareaCopy";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}

// ✅ Summary ownership key (frontend fallback)
// (Backend now returns OwnerKey; we prefer backend key whenever present.)
function makeSummaryOwnerKey(docId, payload) {
  const d = Number(docId) || 0;
  if (!payload) return `doc:${d}|none`;

  if (payload.tocEntryId != null) return `doc:${d}|toc:${payload.tocEntryId}`;

  const s = payload.startPage ?? "?";
  const e = payload.endPage ?? "?";
  return `doc:${d}|range:${s}-${e}`;
}

/** ---------------------------
 * Outline helpers (tree DTO aware)
 * - Supports both camelCase and PascalCase
 * -------------------------- */
function nodeId(n, fallback) {
  return String(n?.id ?? n?.Id ?? fallback);
}

function nodeTitle(n, fallback = "—") {
  return String(n?.title ?? n?.Title ?? n?.label ?? n?.text ?? n?.heading ?? fallback);
}

function nodeChildren(n) {
  const c = n?.children ?? n?.Children;
  return Array.isArray(c) ? c : [];
}

function nodeRightLabel(n) {
  const pageLabel = n?.pageLabel ?? n?.PageLabel;
  const startPage = n?.startPage ?? n?.StartPage;
  const endPage = n?.endPage ?? n?.EndPage;

  if (pageLabel) return String(pageLabel);
  if (startPage != null || endPage != null) {
    return `${startPage ?? ""}${endPage != null ? `–${endPage}` : ""}`.trim();
  }
  return "";
}

function nodeStartPage(n) {
  const startPage = n?.startPage ?? n?.StartPage;
  const p = Number(startPage);
  return Number.isFinite(p) && p > 0 ? p : null;
}

function nodeEndPage(n) {
  const endPage = n?.endPage ?? n?.EndPage;
  const p = Number(endPage);
  return Number.isFinite(p) && p > 0 ? p : null;
}

function collectAllNodeIds(nodes, depth = 0, out = new Set()) {
  const arr = Array.isArray(nodes) ? nodes : [];
  for (let i = 0; i < arr.length; i += 1) {
    const n = arr[i];
    const id = nodeId(n, `${depth}-${i}-${nodeTitle(n, "node")}`);
    if (id) out.add(id);
    const kids = nodeChildren(n);
    if (kids.length) collectAllNodeIds(kids, depth + 1, out);
  }
  return out;
}

/**
 * Filter tree by title, keeping ancestor chain for matches.
 * Returns a NEW tree (safe).
 */
function filterOutlineTree(nodes, query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return Array.isArray(nodes) ? nodes : [];

  function walk(list) {
    const arr = Array.isArray(list) ? list : [];
    const out = [];
    for (const n of arr) {
      const title = nodeTitle(n, "").toLowerCase();
      const kids = nodeChildren(n);
      const keptKids = walk(kids);

      const match = title.includes(q);
      if (match || keptKids.length) {
        out.push({
          ...n,
          children: keptKids,
          Children: keptKids,
        });
      }
    }
    return out;
  }

  return walk(nodes);
}

/** =========================================================
 * OUTLINE TREE (range-active)
 * ========================================================= */
function OutlineTree({ nodes, depth = 0, expanded, activePage, pdfPageOffset, onToggle, onPick }) {
  const arr = Array.isArray(nodes) ? nodes : [];

  return (
    <>
      {arr.map((n, idx) => {
        const id = nodeId(n, `${depth}-${idx}-${nodeTitle(n, "node")}`);
        const title = nodeTitle(n);
        const children = nodeChildren(n);
        const hasChildren = children.length > 0;
        const isOpen = expanded.has(id);
        const right = nodeRightLabel(n);

        // Raw pages from ToC (printed/page labels)
        const startRaw = nodeStartPage(n);
        const endRaw = nodeEndPage(n);

        // ✅ PDF page = printed page + offset
        const startPdf = startRaw != null ? startRaw + pdfPageOffset : null;
        const endPdf = endRaw != null ? endRaw + pdfPageOffset : null;

        // Click target: prefer start page
        const jumpPage = startPdf;

        // ✅ Range-active: active if activePage falls inside [startPdf..endPdf]
        const isActive = (() => {
          const p = Number(activePage);
          if (!Number.isFinite(p) || p <= 0) return false;
          if (!Number.isFinite(startPdf) || !startPdf) return false;

          if (Number.isFinite(endPdf) && endPdf && endPdf >= startPdf) {
            return p >= startPdf && p <= endPdf;
          }
          return p === startPdf;
        })();

        const depthClass = `readerOutlineDepth readerOutlineDepth-${Math.min(depth, 12)}`;

        return (
          <div key={id} className={`readerOutlineRow ${depthClass}`}>
            <div className="readerOutlineRowInner">
              <button
                type="button"
                className={`readerOutlineTwisty ${hasChildren ? "" : "disabled"}`}
                onClick={() => hasChildren && onToggle(id)}
                disabled={!hasChildren}
                title={hasChildren ? (isOpen ? "Collapse" : "Expand") : ""}
                aria-label={hasChildren ? (isOpen ? "Collapse section" : "Expand section") : "No children"}
              >
                {hasChildren ? (isOpen ? "▾" : "▸") : "•"}
              </button>

              <button
                className={`readerpage-tocItem ${isActive ? "active" : ""}`}
                type="button"
                disabled={!jumpPage}
                onClick={() => jumpPage && onPick(n, jumpPage)}
                title={jumpPage ? `Go to page ${jumpPage}` : "No page mapped"}
              >
                <div className="readerpage-tocItemTitle">{title || "—"}</div>
                <div className="readerpage-tocItemPage">{right || "—"}</div>
              </button>
            </div>

            {hasChildren && isOpen ? (
              <div className="readerOutlineChildren">
                <OutlineTree
                  nodes={children}
                  depth={depth + 1}
                  expanded={expanded}
                  activePage={activePage}
                  pdfPageOffset={pdfPageOffset}
                  onToggle={onToggle}
                  onPick={onPick}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </>
  );
}

export default function DocumentReader() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const docId = useMemo(() => Number(id), [id]);

  const [access, setAccess] = useState(null);
  const [offer, setOffer] = useState(null);
  const [contentAvailable, setContentAvailable] = useState(true);

  // ✅ replace fullscreen lock with bottom unlock bar
  const [locked, setLocked] = useState(false);
  const [unlockBarDismissed, setUnlockBarDismissed] = useState(false);

  const [loadingAccess, setLoadingAccess] = useState(true);
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingAccessHint, setLoadingAccessHint] = useState("Checking access");

  const [blocked, setBlocked] = useState(false);
  const [blockMessage, setBlockMessage] = useState("Access blocked. Please contact your administrator.");

  const [canPurchaseIndividually, setCanPurchaseIndividually] = useState(true);
  const [purchaseDisabledReason, setPurchaseDisabledReason] = useState(null);
  const [blockReason, setBlockReason] = useState(null);

  const [toast, setToast] = useState(null);

  const [justPaid, setJustPaid] = useState(false);
  const [paidProvider, setPaidProvider] = useState("");

  const aliveRef = useRef(true);

  const showToast = useCallback((message, type = "success") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 2500);
  }, []);

  // ---------------------------------------------
  // ✅ Outline state + PdfViewer API bridge
  // ---------------------------------------------
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [outline, setOutline] = useState([]);
  const [outlineLoading, setOutlineLoading] = useState(false);
  const [outlineError, setOutlineError] = useState("");

  const [outlineExpanded, setOutlineExpanded] = useState(() => new Set());
  const [outlineQuery, setOutlineQuery] = useState("");
  const [activePage, setActivePage] = useState(null);

  // ✅ page count in topbar
  const [totalPages, setTotalPages] = useState(null);

  // ✅ proper title in topbar
  const [docTitle, setDocTitle] = useState("");

  // ✅ Find-in-document (best-effort)
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findBusy, setFindBusy] = useState(false);
  const [findInlineHint, setFindInlineHint] = useState(""); // ✅ avoids “popup” toast spam

  // ✅ sticky ToC header+search on desktop (JS-only via inline style)
  const [isDesktop, setIsDesktop] = useState(false);

  // ✅ AI panel (dedicated, NOT inside ToC)
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [aiDrawerCollapsed, setAiDrawerCollapsed] = useState(false);

  const viewerApiRef = useRef(null);
  const viewerUnsubRef = useRef(null); // ✅ unsubscribe for onPageChange if supported
  const mountedRef = useRef(false);
  const outlineAbortRef = useRef(null);

  // drawer width (desktop) persisted per browser
  const OUTLINE_WIDTH_KEY = "la_reader_outline_width";
  const OUTLINE_EXPANDED_KEY = useMemo(
    () => (Number.isFinite(docId) && docId > 0 ? `la_reader_outline_expanded_${docId}` : ""),
    [docId]
  );

  const [outlineWidth, setOutlineWidth] = useState(() => {
    const raw = safeGetLS(OUTLINE_WIDTH_KEY);
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 260 && n <= 560) return n;
    return 340;
  });

  // =========================================================
  // ✅ V2: per-document PDF offset calibration (stored in localStorage)
  // - printed page -> PDF page conversion uses: pdf = printed + offset
  // =========================================================
  const OFFSET_KEY = useMemo(
    () => (Number.isFinite(docId) && docId > 0 ? `la_reader_pdf_offset_${docId}` : ""),
    [docId]
  );
  const OFFSET_VERIFIED_KEY = useMemo(
    () => (Number.isFinite(docId) && docId > 0 ? `la_reader_pdf_offset_verified_${docId}` : ""),
    [docId]
  );

  const [pdfPageOffset, setPdfPageOffset] = useState(0);
  const [offsetVerified, setOffsetVerified] = useState(false);

  // Load offset per doc
  useEffect(() => {
    if (!OFFSET_KEY) return;
    const raw = safeGetLS(OFFSET_KEY);
    const n = Number(raw);
    setPdfPageOffset(Number.isFinite(n) ? n : 0);

    const vraw = safeGetLS(OFFSET_VERIFIED_KEY);
    setOffsetVerified(vraw === "1");
  }, [OFFSET_KEY, OFFSET_VERIFIED_KEY]);

  // Persist offset
  useEffect(() => {
    if (!OFFSET_KEY) return;
    safeSetLS(OFFSET_KEY, String(pdfPageOffset));
  }, [OFFSET_KEY, pdfPageOffset]);

  useEffect(() => {
    if (!OFFSET_VERIFIED_KEY) return;
    safeSetLS(OFFSET_VERIFIED_KEY, offsetVerified ? "1" : "0");
  }, [OFFSET_VERIFIED_KEY, offsetVerified]);

  // Apply drawer width CSS var
  useEffect(() => {
    document.documentElement.style.setProperty("--reader-outline-width", `${outlineWidth}px`);
    return () => {
      document.documentElement.style.removeProperty("--reader-outline-width");
    };
  }, [outlineWidth]);

  // =========================================================
  // ✅ Summary panel state
  // =========================================================
  const [summaryPanelOpen, setSummaryPanelOpen] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  // ✅ Selected node + AI summary state
  const [selectedTocNode, setSelectedTocNode] = useState(null);
  const [sectionSummaryType, setSectionSummaryType] = useState("basic"); // "basic" | "extended"
  const [sectionSummaryLoading, setSectionSummaryLoading] = useState(false);
  const [sectionSummaryError, setSectionSummaryError] = useState("");
  const [sectionSummaryText, setSectionSummaryText] = useState("");
  const [sectionSummaryMeta, setSectionSummaryMeta] = useState(null);
  const lastSummaryKeyRef = useRef("");
  const [summaryOwnerKey, setSummaryOwnerKey] = useState(""); // which section the current summary belongs to

  // ✅ store server cache keys (for debugging and UI clarity)
  const [summaryCacheKey, setSummaryCacheKey] = useState("");
  const [summaryContentHash, setSummaryContentHash] = useState("");
  const [summaryPromptVersion, setSummaryPromptVersion] = useState("");
  const [summaryModelUsed, setSummaryModelUsed] = useState("");

  // ✅ inline “Copied” state for AI copy (quiet feedback)
  const [aiCopied, setAiCopied] = useState(false);

  // =========================================================
  // ✅ Remember last summary per document (localStorage)
  // =========================================================
  const SUMMARY_LAST_KEY = useMemo(
    () => (Number.isFinite(docId) && docId > 0 ? `la_reader_last_summary_${docId}` : ""),
    [docId]
  );

  // Load last summary when doc opens
  useEffect(() => {
    if (!SUMMARY_LAST_KEY) return;
    const raw = safeGetLS(SUMMARY_LAST_KEY);
    const data = safeJsonParse(raw || "null", null);
    if (!data) return;

    if (typeof data.summaryText === "string" && data.summaryText.trim()) {
      setSectionSummaryText(data.summaryText);
      setSectionSummaryMeta(data.meta || null);
      setSectionSummaryType(data.type === "extended" ? "extended" : "basic");
      setSelectedTocNode(data.selectedNode || null);

      // restore keys (best effort)
      if (typeof data.ownerKey === "string") setSummaryOwnerKey(data.ownerKey);
      if (typeof data.cacheKey === "string") setSummaryCacheKey(data.cacheKey);
      if (typeof data.contentHash === "string") setSummaryContentHash(data.contentHash);
      if (typeof data.promptVersion === "string") setSummaryPromptVersion(data.promptVersion);
      if (typeof data.modelUsed === "string") setSummaryModelUsed(data.modelUsed);
    }
  }, [SUMMARY_LAST_KEY]);

  // Persist last summary (whenever summary changes)
  useEffect(() => {
    if (!SUMMARY_LAST_KEY) return;
    if (!sectionSummaryText || !sectionSummaryText.trim()) return;

    const payload = {
      type: sectionSummaryType,
      summaryText: sectionSummaryText,
      meta: sectionSummaryMeta,
      ownerKey: summaryOwnerKey || "",
      cacheKey: summaryCacheKey || "",
      contentHash: summaryContentHash || "",
      promptVersion: summaryPromptVersion || "",
      modelUsed: summaryModelUsed || "",
      selectedNode: selectedTocNode
        ? {
            id: selectedTocNode?.id ?? selectedTocNode?.Id ?? null,
            title: nodeTitle(selectedTocNode, ""),
            pageLabel: nodeRightLabel(selectedTocNode),
            startPage: nodeStartPage(selectedTocNode),
            endPage: nodeEndPage(selectedTocNode),
          }
        : null,
      savedAt: new Date().toISOString(),
    };

    safeSetLS(SUMMARY_LAST_KEY, JSON.stringify(payload));
  }, [
    SUMMARY_LAST_KEY,
    sectionSummaryType,
    sectionSummaryText,
    sectionSummaryMeta,
    selectedTocNode,
    summaryOwnerKey,
    summaryCacheKey,
    summaryContentHash,
    summaryPromptVersion,
    summaryModelUsed,
  ]);

  // =========================================================
  // ✅ Advanced manual page summary (Printed or PDF mode)
  // =========================================================
  const [advancedEnabled, setAdvancedEnabled] = useState(false);
  const [pageMode, setPageMode] = useState("printed"); // "printed" | "pdf"
  const [manualStart, setManualStart] = useState("");
  const [manualEnd, setManualEnd] = useState("");

  // Span clamps (client-side; backend also clamps)
  const BASIC_MAX_SPAN = 6;
  const EXTENDED_MAX_SPAN = 12;

  // ✅ desktop breakpoint (JS-only)
  useEffect(() => {
    const mq = window.matchMedia?.("(min-width: 980px)");
    if (!mq) {
      setIsDesktop(true);
      return;
    }
    const apply = () => setIsDesktop(!!mq.matches);
    apply();
    try {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    } catch {
      mq.addListener?.(apply);
      return () => mq.removeListener?.(apply);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      safeAbort(outlineAbortRef.current);
      try {
        if (typeof viewerUnsubRef.current === "function") viewerUnsubRef.current();
      } catch {
        // ignore
      }
      viewerUnsubRef.current = null;
    };
  }, []);

  // ✅ Register PdfViewer API + subscribe to page change if supported
  const handleRegisterApi = useCallback((apiObj) => {
    viewerApiRef.current = apiObj;

    // cleanup old
    try {
      if (typeof viewerUnsubRef.current === "function") viewerUnsubRef.current();
    } catch {
      // ignore
    }
    viewerUnsubRef.current = null;

    // total pages (best-effort)
    try {
      const t =
        apiObj?.getTotalPages?.() ??
        apiObj?.getPageCount?.() ??
        apiObj?.pageCount ??
        apiObj?.totalPages ??
        null;
      const tn = Number(t);
      if (Number.isFinite(tn) && tn > 0) setTotalPages(tn);
    } catch {
      // ignore
    }

    // if viewer supports event-driven page change, use it
    if (apiObj?.onPageChange) {
      try {
        viewerUnsubRef.current = apiObj.onPageChange((p) => {
          const n = Number(p);
          if (Number.isFinite(n) && n > 0) setActivePage(n);

          // also refresh total pages occasionally if available
          try {
            const tp =
              apiObj?.getTotalPages?.() ??
              apiObj?.getPageCount?.() ??
              apiObj?.pageCount ??
              apiObj?.totalPages ??
              null;
            const tpn = Number(tp);
            if (Number.isFinite(tpn) && tpn > 0) setTotalPages(tpn);
          } catch {
            // ignore
          }
        });
      } catch {
        // ignore
      }
    }
  }, []);

  const openOutline = useCallback(() => setOutlineOpen(true), []);
  const closeOutline = useCallback(() => setOutlineOpen(false), []);

  const openSummaryPanel = useCallback(() => {
    if (!sectionSummaryText || !sectionSummaryText.trim()) {
      showToast("No summary for this section yet. Run Basic or Extended first.", "error");
      return;
    }

    // ✅ strict ownership check (prefer server OwnerKey; fallback to computed key)
    const expectedOwnerKey = (() => {
      if (!selectedTocNode) return "";
      const tocEntryId = selectedTocNode?.id ?? selectedTocNode?.Id ?? null;
      if (tocEntryId != null) return `doc:${Number(docId) || 0}|toc:${tocEntryId}`;
      return "";
    })();

    if (expectedOwnerKey && summaryOwnerKey && summaryOwnerKey !== expectedOwnerKey) {
      showToast("That summary belongs to a different section. Please generate again for this section.", "error");
      return;
    }

    setSummaryPanelOpen(true);
  }, [docId, sectionSummaryText, selectedTocNode, showToast, summaryOwnerKey]);

  const closeSummaryPanel = useCallback(() => setSummaryPanelOpen(false), []);
  const toggleSummaryExpanded = useCallback(() => setSummaryExpanded((p) => !p), []);

  // ✅ AI drawer helpers
  const openAiDrawer = useCallback(() => setAiDrawerOpen(true), []);
  const closeAiDrawer = useCallback(() => {
    setAiDrawerOpen(false);
    setAiDrawerCollapsed(false);
  }, []);

  // ✅ Calibrate offset from a ToC click:
  // offset = (pdfPage we jump to) - (printed start page from ToC)
  const calibrateOffsetFromTocNode = useCallback(
    (node, pdfPage) => {
      const printedStart = nodeStartPage(node);
      const pdf = Number(pdfPage);
      if (!Number.isFinite(pdf) || pdf <= 0) return;

      if (!Number.isFinite(printedStart) || !printedStart || printedStart <= 0) {
        showToast("Cannot calibrate: this ToC item has no printed start page.", "error");
        return;
      }

      const nextOffset = pdf - printedStart;
      if (!Number.isFinite(nextOffset)) return;

      setPdfPageOffset(nextOffset);
      setOffsetVerified(true);
      showToast(`Offset calibrated: ${nextOffset >= 0 ? `+${nextOffset}` : nextOffset}`, "success");
    },
    [showToast]
  );

  // ✅ Preview clamp + jump (also sets selected node now)
  const onOutlineClick = useCallback(
    (node, pageNumber) => {
      setSelectedTocNode(node);

      // ✅ If summary currently belongs to another section, clear UI immediately
      const tocEntryId = node?.id ?? node?.Id ?? null;
      const nextOwnerKey = tocEntryId != null ? `doc:${Number(docId) || 0}|toc:${tocEntryId}` : "";

      if (summaryOwnerKey && nextOwnerKey && summaryOwnerKey !== nextOwnerKey) {
        setSectionSummaryText("");
        setSectionSummaryMeta(null);
        setSectionSummaryError("");
        lastSummaryKeyRef.current = "";
        setSummaryOwnerKey("");
        setSummaryCacheKey("");
        setSummaryContentHash("");
        setSummaryPromptVersion("");
        setSummaryModelUsed("");
      }

      const p = Number(pageNumber);
      if (!Number.isFinite(p) || p <= 0) return;

      if (!access?.hasFullAccess && Number.isFinite(access?.previewMaxPages)) {
        if (p > access?.previewMaxPages) {
          showToast(
            `This section is outside preview (ends at page ${access?.previewMaxPages}). Purchase to continue.`,
            "error"
          );
          setLocked(true);
          setUnlockBarDismissed(false);
          return;
        }
      }

      const ok = viewerApiRef.current?.jumpToPage?.(p, "smooth");
      if (ok) {
        calibrateOffsetFromTocNode(node, p);
        setOutlineOpen(false);
      }
    },
    [access?.hasFullAccess, access?.previewMaxPages, calibrateOffsetFromTocNode, docId, showToast, summaryOwnerKey]
  );

  const toggleOutlineNode = useCallback((idStr) => {
    setOutlineExpanded((prevSet) => {
      const next = new Set(prevSet);
      if (next.has(idStr)) next.delete(idStr);
      else next.add(idStr);
      return next;
    });
  }, []);

  const toggleExpandCollapseAll = useCallback(() => {
    const allIds = collectAllNodeIds(outline);
    setOutlineExpanded((prev) => {
      const isAllExpanded = prev.size > 0 && prev.size >= allIds.size;
      return isAllExpanded ? new Set() : allIds;
    });
  }, [outline]);

  // Persist expanded state per document
  useEffect(() => {
    if (!OUTLINE_EXPANDED_KEY) return;
    const arr = Array.from(outlineExpanded.values());
    safeSetLS(OUTLINE_EXPANDED_KEY, JSON.stringify(arr));
  }, [OUTLINE_EXPANDED_KEY, outlineExpanded]);

  // Restore expanded state when doc changes (after outline loads)
  const restoreExpandedForDoc = useCallback(() => {
    if (!OUTLINE_EXPANDED_KEY) return;
    const raw = safeGetLS(OUTLINE_EXPANDED_KEY);
    const arr = safeJsonParse(raw || "[]", []);
    if (Array.isArray(arr) && arr.length) {
      setOutlineExpanded(new Set(arr.map(String)));
    } else {
      setOutlineExpanded(new Set());
    }
  }, [OUTLINE_EXPANDED_KEY]);

  // Persist width
  useEffect(() => {
    safeSetLS(OUTLINE_WIDTH_KEY, String(outlineWidth));
  }, [outlineWidth]);

  // ✅ Active page tracking fallback (ONLY if viewer has no onPageChange)
  useEffect(() => {
    if (viewerApiRef.current?.onPageChange) return;

    const t = window.setInterval(() => {
      const p = viewerApiRef.current?.getCurrentPage?.();
      const n = Number(p);
      if (Number.isFinite(n) && n > 0) {
        setActivePage((prev) => (prev === n ? prev : n));
      }

      // total pages fallback
      const tp =
        viewerApiRef.current?.getTotalPages?.() ??
        viewerApiRef.current?.getPageCount?.() ??
        viewerApiRef.current?.pageCount ??
        viewerApiRef.current?.totalPages ??
        null;
      const tpn = Number(tp);
      if (Number.isFinite(tpn) && tpn > 0) {
        setTotalPages((prev) => (prev === tpn ? prev : tpn));
      }
    }, 600);

    return () => window.clearInterval(t);
  }, []);

  // Resizable drawer drag
  const draggingRef = useRef(false);

  const onResizePointerDown = useCallback((e) => {
    draggingRef.current = true;
    document.body.classList.add("readerOutlineResizing");
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // non-fatal
    }
  }, []);

  const onResizePointerMove = useCallback(
    (e) => {
      if (!draggingRef.current) return;
      const x = e.clientX;
      const next = Math.max(260, Math.min(560, x));
      setOutlineWidth(next);
    },
    [setOutlineWidth]
  );

  const onResizePointerUp = useCallback(() => {
    draggingRef.current = false;
    document.body.classList.remove("readerOutlineResizing");
  }, []);

  // ✅ Always fetch Outline when docId changes
  const fetchOutline = useCallback(async () => {
    if (!Number.isFinite(docId) || docId <= 0) return;

    safeAbort(outlineAbortRef.current);
    const ctrl = new AbortController();
    outlineAbortRef.current = ctrl;

    setOutlineLoading(true);
    setOutlineError("");

    try {
      const res = await api.get(`/legal-documents/${docId}/outline`, { signal: ctrl.signal });

      if (!mountedRef.current || ctrl.signal.aborted) return;

      const items = res?.data?.items;
      const arr = Array.isArray(items) ? items : [];
      setOutline(arr);

      restoreExpandedForDoc();

      setOutlineExpanded((prevSet) => {
        if (prevSet.size > 0) return prevSet;
        const next = new Set();
        for (const n of arr) {
          const idStr = nodeId(n, "");
          if (idStr) next.add(idStr);
        }
        return next;
      });
    } catch (err) {
      if (!mountedRef.current || ctrl.signal.aborted) return;
      console.debug("Failed to load Outline:", err);
      setOutline([]);
      setOutlineError(err?.response?.data?.message || "Failed to load table of contents.");
    } finally {
      if (mountedRef.current && !ctrl.signal.aborted) {
        setOutlineLoading(false);
      }
    }
  }, [docId, restoreExpandedForDoc]);

  useEffect(() => {
    if (!Number.isFinite(docId) || docId <= 0) return;
    setOutlineQuery("");
    setActivePage(null);
    setTotalPages(null);

    // reset summary state when doc changes
    setSectionSummaryError("");
    setSectionSummaryLoading(false);
    lastSummaryKeyRef.current = "";

    // reset summary keys
    setSummaryOwnerKey("");
    setSummaryCacheKey("");
    setSummaryContentHash("");
    setSummaryPromptVersion("");
    setSummaryModelUsed("");

    // reset advanced UI
    setAdvancedEnabled(false);
    setPageMode("printed");
    setManualStart("");
    setManualEnd("");

    // close panels on doc switch
    setSummaryPanelOpen(false);
    setSummaryExpanded(false);
    setAiDrawerOpen(false);

    // unlock bar reset
    setLocked(false);
    setUnlockBarDismissed(false);

    // find reset
    setFindOpen(false);
    setFindQuery("");
    setFindBusy(false);
    setFindInlineHint("");

    // copy state reset
    setAiCopied(false);

    fetchOutline();
  }, [docId, fetchOutline]);

  const filteredOutline = useMemo(() => {
    return filterOutlineTree(outline, outlineQuery);
  }, [outline, outlineQuery]);

  // Detect landing from Paystack/MPESA
  useEffect(() => {
    const qs = new URLSearchParams(location.search);
    const paidQs = (qs.get("paid") || "").trim();
    const providerQs = (qs.get("provider") || "").trim();

    const paidState = location.state?.paid === true;
    const providerState = (location.state?.provider || "").trim();

    const paid = paidState || paidQs === "1";
    const provider = providerState || providerQs;

    if (paid) {
      setJustPaid(true);
      setPaidProvider(provider);
      showToast(`Payment successful ✅${provider ? ` (${provider})` : ""}`, "success");

      if (paidQs === "1") {
        qs.delete("paid");
        qs.delete("provider");
        navigate(
          {
            pathname: location.pathname,
            search: qs.toString() ? `?${qs.toString()}` : "",
          },
          { replace: true }
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Access + meta loading
  useEffect(() => {
    aliveRef.current = true; // ✅ important: reset on each run
    let cancelled = false;

    function sleep(ms) {
      return new Promise((r) => setTimeout(r, ms));
    }

    function isIgnorable(err) {
      return axios.isCancel(err) || err?.code === "ERR_CANCELED";
    }

    async function fetchAccessOnce() {
      const accessRes = await api.get(`/legal-documents/${docId}/access`, { __skipThrottle: true });
      return accessRes.data;
    }

    async function loadAccessOnlyWithRetryIfPaid() {
      try {
        setLoadingAccess(true);

        setLocked(false);
        setUnlockBarDismissed(false);
        setBlocked(false);
        setOffer(null);

        setBlockReason(null);
        setCanPurchaseIndividually(true);
        setPurchaseDisabledReason(null);

        setContentAvailable(true);
        setBlockMessage("Access blocked. Please contact your administrator.");

        const maxAttempts = justPaid ? 10 : 1;
        let attempt = 0;

        const delays = [400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200];

        while (!cancelled && aliveRef.current) {
          attempt += 1;

          if (justPaid) {
            setLoadingAccessHint(
              `Finalizing payment${paidProvider ? ` (${paidProvider})` : ""}… (${attempt}/${maxAttempts})`
            );
          } else {
            setLoadingAccessHint("Checking access");
          }

          try {
            const accessData = await fetchAccessOnce();
            if (cancelled || !aliveRef.current) return;

            setAccess(accessData);

            setCanPurchaseIndividually(accessData?.canPurchaseIndividually !== false);
            setPurchaseDisabledReason(accessData?.purchaseDisabledReason || null);

            if (accessData?.isBlocked) {
              setBlocked(true);
              setBlockReason(accessData?.blockReason || null);
              setBlockMessage(accessData?.blockMessage || accessData?.message || "Access blocked.");
              return;
            }

            if (accessData?.hasFullAccess) {
              setLocked(false);
              setUnlockBarDismissed(false);
            }

            if (justPaid) setJustPaid(false);

            return;
          } catch (err) {
            if (cancelled || !aliveRef.current) return;

            if (!isIgnorable(err)) {
              const status = err?.response?.status;
              if (!justPaid) throw err;
              if (status === 401) throw err;
            }

            if (attempt >= maxAttempts) throw err;
            await sleep(delays[Math.min(attempt - 1, delays.length - 1)]);
          }
        }
      } catch (err) {
        if (err?.code === "ERR_CANCELED") return;
        console.error("Failed to load access", err);
        if (!cancelled && aliveRef.current) setAccess(null);
      } finally {
        if (!cancelled && aliveRef.current) setLoadingAccess(false);
      }
    }

    function pickDocTitleFromAny(data) {
      if (!data) return "";
      return (
        data?.title ??
        data?.Title ??
        data?.name ??
        data?.Name ??
        data?.documentTitle ??
        data?.DocumentTitle ??
        data?.publicationTitle ??
        data?.PublicationTitle ??
        data?.legalDocumentTitle ??
        data?.LegalDocumentTitle ??
        data?.citation ??
        data?.Citation ??
        ""
      );
    }

    async function loadMetaInBackground() {
      setLoadingMeta(true);

      try {
        const offerPromise = api
          .get(`/legal-documents/${docId}/public-offer`)
          .then((r) => r.data)
          .catch(() => null);

        const docMetaPromise = api
          .get(`/legal-documents/${docId}`)
          .then((r) => r.data)
          .catch(() => null);

        const availabilityPromise = (async () => {
          try {
            const data = await checkDocumentAvailability(docId);

            if (data == null) return true;
            if (typeof data === "boolean") return data;

            if (typeof data.available === "boolean") return data.available;
            if (typeof data.isAvailable === "boolean") return data.isAvailable;
            if (typeof data.exists === "boolean") return data.exists;
            if (typeof data.contentAvailable === "boolean") return data.contentAvailable;

            return true;
          } catch (err) {
            const status = err?.response?.status;
            if (status === 404) return false;
            if (status === 401 || status === 403) return true;
            console.warn("Availability check failed (non-blocking):", err);
            return true;
          }
        })();

        const [offerData, docMeta, isAvailable] = await Promise.all([offerPromise, docMetaPromise, availabilityPromise]);
        if (cancelled || !aliveRef.current) return;

        if (offerData) setOffer(offerData);
        setContentAvailable(!!isAvailable);

        const titleFromDoc = pickDocTitleFromAny(docMeta);
        const titleFromOffer = pickDocTitleFromAny(offerData);
        const t = String(titleFromDoc || titleFromOffer || "").trim();
        setDocTitle(t);
      } finally {
        if (!cancelled && aliveRef.current) setLoadingMeta(false);
      }
    }

    if (!Number.isFinite(docId) || docId <= 0) {
      setAccess(null);
      setLoadingAccess(false);
      setLoadingMeta(false);
      return () => {};
    }

    loadAccessOnlyWithRetryIfPaid().then(() => {
      if (!cancelled && aliveRef.current) loadMetaInBackground();
    });

    return () => {
      cancelled = true;
      aliveRef.current = false;
    };
  }, [docId, justPaid, paidProvider, showToast]);

  // =========================================================
  // ✅ AI Summary actions (ToC -> payload)
  // =========================================================
  const buildSummaryPayloadFromNode = useCallback(
    (node, type, forceRegenerate) => {
      if (!node) return null;

      const tocEntryId = node?.id ?? node?.Id ?? null;

      if (tocEntryId) {
        return {
          tocEntryId,
          legalDocumentId: docId,
          type,
          forceRegenerate: !!forceRegenerate,
          sectionTitle: nodeTitle(node, ""),
          // promptVersion: "v1", // optional (backend defaults); add later if you want explicit pinning
        };
      }

      const startRaw = nodeStartPage(node);
      if (!startRaw) return null;

      const endRaw = nodeEndPage(node) ?? startRaw;

      const startPdf = startRaw + pdfPageOffset;
      const endPdf = endRaw + pdfPageOffset;

      const endClamped =
        !access?.hasFullAccess && Number.isFinite(access?.previewMaxPages)
          ? Math.min(endPdf, access.previewMaxPages)
          : endPdf;

      return {
        tocEntryId: null,
        legalDocumentId: docId,
        type,
        startPage: startPdf,
        endPage: endClamped,
        forceRegenerate: !!forceRegenerate,
        sectionTitle: nodeTitle(node, ""),
        // promptVersion: "v1",
      };
    },
    [access, docId, pdfPageOffset]
  );

  const applySummaryResponse = useCallback(
    (payload, data) => {
      const summary = data?.summary ?? data?.Summary ?? "";
      if (!summary) {
        setSectionSummaryError("No summary returned.");
        return;
      }

      setSectionSummaryText(String(summary));

      const fromCache = data?.fromCache ?? data?.FromCache ?? false;
      const usedStart = data?.startPage ?? data?.StartPage ?? null;
      const usedEnd = data?.endPage ?? data?.EndPage ?? null;
      const inputCharCount = data?.inputCharCount ?? data?.InputCharCount ?? 0;

      const warnings = data?.warnings ?? data?.Warnings ?? [];
      const warningsArr = Array.isArray(warnings) ? warnings : [];

      // ✅ prefer server-owned keys (new backend alignment)
      const serverOwnerKey = data?.ownerKey ?? data?.OwnerKey ?? "";
      const serverCacheKey = data?.cacheKey ?? data?.CacheKey ?? "";
      const serverHash = data?.contentHash ?? data?.ContentHash ?? "";
      const serverPv = data?.promptVersion ?? data?.PromptVersion ?? "";
      const serverModel = data?.modelUsed ?? data?.ModelUsed ?? "";

      const effectiveOwnerKey = String(serverOwnerKey || makeSummaryOwnerKey(docId, payload) || "");

      setSummaryOwnerKey(effectiveOwnerKey);
      setSummaryCacheKey(String(serverCacheKey || ""));
      setSummaryContentHash(String(serverHash || ""));
      setSummaryPromptVersion(String(serverPv || ""));
      setSummaryModelUsed(String(serverModel || ""));

      setSectionSummaryMeta({
        fromCache,
        usedPages:
          usedStart != null || usedEnd != null
            ? `${usedStart ?? "?"}-${usedEnd ?? "?"}`
            : payload.startPage != null || payload.endPage != null
            ? `${payload.startPage ?? "?"}-${payload.endPage ?? "?"}`
            : "—",
        inputCharCount: Number(inputCharCount) || 0,
        warnings: warningsArr.map((w) => String(w)),
        ownerKey: effectiveOwnerKey,
        cacheKey: String(serverCacheKey || ""),
        contentHash: String(serverHash || ""),
        promptVersion: String(serverPv || ""),
        modelUsed: String(serverModel || ""),
      });

      // quiet + subtle
      showToast(fromCache ? "Loaded from cache" : "Summary ready", "success");
    },
    [docId, showToast]
  );

  const runSectionSummary = useCallback(
    async (type, opts = {}) => {
      const { force = false, openPanel = false } = opts;

      setSectionSummaryError("");
      setSectionSummaryType(type);

      if (!selectedTocNode) {
        setSectionSummaryError("Select a section from the ToC first.");
        return;
      }

      const payload = buildSummaryPayloadFromNode(selectedTocNode, type, force);
      if (!payload) {
        setSectionSummaryError("This ToC section has no usable mapping.");
        return;
      }

      const key = `${payload.legalDocumentId}|${payload.tocEntryId ?? ""}|${payload.type}|${
        payload.startPage ?? ""
      }-${payload.endPage ?? ""}|force=${payload.forceRegenerate ? "1" : "0"}`;
      if (sectionSummaryLoading && lastSummaryKeyRef.current === key) return;
      lastSummaryKeyRef.current = key;

      setSectionSummaryLoading(true);

      try {
        const data = await summarizeLegalDocSection(payload);
        applySummaryResponse(payload, data);
        if (openPanel) setSummaryPanelOpen(true);
      } catch (err) {
        console.error("Section summary failed:", err);
        const msg =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          "Failed to summarize section. (Check endpoint route + auth)";
        setSectionSummaryError(String(msg));
      } finally {
        setSectionSummaryLoading(false);
      }
    },
    [applySummaryResponse, buildSummaryPayloadFromNode, selectedTocNode, sectionSummaryLoading]
  );

  const onCopySummary = useCallback(async () => {
    if (!sectionSummaryText) return;

    // ✅ quiet feedback (NO toast, avoids “popup” UX)
    const ok = await safeCopyToClipboard(sectionSummaryText);
    setAiCopied(true);
    window.setTimeout(() => setAiCopied(false), 1100);

    if (!ok) {
      // still allow a small toast on true failure
      showToast("Copy failed (browser blocked clipboard)", "error");
    }
  }, [sectionSummaryText, showToast]);

  const onRegenerateSummary = useCallback(() => {
    runSectionSummary(sectionSummaryType, { force: true, openPanel: true });
  }, [runSectionSummary, sectionSummaryType]);

  const onSwitchSummaryType = useCallback(
    (nextType) => {
      const t = nextType === "extended" ? "extended" : "basic";
      if (t === sectionSummaryType) return;
      setSectionSummaryType(t);
      if (selectedTocNode) runSectionSummary(t, { force: false, openPanel: true });
    },
    [runSectionSummary, sectionSummaryType, selectedTocNode]
  );

  // =========================================================
  // ✅ Manual range → compute effective PDF pages + run summary
  // =========================================================
  function parsePositiveInt(raw) {
    const n = Number(String(raw || "").trim());
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  }

  function normalizeRange(a, b) {
    if (a == null || b == null) return null;
    let start = a;
    let end = b;
    if (end < start) [start, end] = [end, start];
    return { start, end };
  }

  function clampSpan(startPdf, endPdf, type) {
    const maxSpan = type === "extended" ? EXTENDED_MAX_SPAN : BASIC_MAX_SPAN;
    const span = endPdf - startPdf + 1;
    if (span <= maxSpan) return { startPdf, endPdf, clamped: false, note: "" };
    const nextEnd = startPdf + maxSpan - 1;
    return {
      startPdf,
      endPdf: nextEnd,
      clamped: true,
      note: `Range too large (${span} pages). Clamped to ${maxSpan} pages.`,
    };
  }

  const effectiveManual = useMemo(() => {
    function clampToPreview(endPdf) {
      if (!access?.hasFullAccess && Number.isFinite(access?.previewMaxPages)) {
        return Math.min(endPdf, access.previewMaxPages);
      }
      return endPdf;
    }

    const a = parsePositiveInt(manualStart);
    const b = parsePositiveInt(manualEnd);
    const nr = normalizeRange(a, b);
    if (!nr) {
      return { ok: false, label: "—", clampNote: "", startPdf: null, endPdf: null };
    }

    let startPdf;
    let endPdf;
    let labelPrefix;

    if (pageMode === "printed") {
      if (!offsetVerified) {
        return {
          ok: false,
          label: `Printed ${nr.start}–${nr.end} (offset not verified)`,
          clampNote: "Offset not confirmed. Click a ToC item to calibrate.",
          startPdf: null,
          endPdf: null,
        };
      }

      startPdf = nr.start + pdfPageOffset;
      endPdf = nr.end + pdfPageOffset;
      labelPrefix = `Printed ${nr.start}–${nr.end} → PDF ${startPdf}–${endPdf}`;
    } else {
      startPdf = nr.start;
      endPdf = nr.end;
      labelPrefix = `PDF ${startPdf}–${endPdf}`;
    }

    if (!Number.isFinite(startPdf) || startPdf <= 0 || !Number.isFinite(endPdf) || endPdf <= 0) {
      return {
        ok: false,
        label: labelPrefix,
        clampNote: "Computed PDF pages are invalid.",
        startPdf: null,
        endPdf: null,
      };
    }

    const endPreviewClamped = clampToPreview(endPdf);
    const previewNote = endPreviewClamped !== endPdf ? `Clamped to preview max page ${access?.previewMaxPages}.` : "";

    return { ok: true, label: labelPrefix, clampNote: previewNote, startPdf, endPdf: endPreviewClamped };
  }, [manualStart, manualEnd, pageMode, offsetVerified, pdfPageOffset, access]);

  const runManualSectionSummary = useCallback(
    async (type) => {
      setSectionSummaryError("");
      setSectionSummaryType(type);

      if (!effectiveManual.ok || effectiveManual.startPdf == null || effectiveManual.endPdf == null) {
        setSectionSummaryError("Enter a valid page range first.");
        return;
      }

      const spanClamped = clampSpan(effectiveManual.startPdf, effectiveManual.endPdf, type);

      const payload = {
        tocEntryId: null,
        legalDocumentId: docId,
        type,
        startPage: spanClamped.startPdf,
        endPage: spanClamped.endPdf,
        forceRegenerate: false,
        sectionTitle: pageMode === "printed" ? "Manual range (printed pages)" : "Manual range (PDF pages)",
      };

      const key = `${payload.legalDocumentId}|manual|${payload.type}|${payload.startPage}-${payload.endPage}`;
      if (sectionSummaryLoading && lastSummaryKeyRef.current === key) return;
      lastSummaryKeyRef.current = key;

      setSectionSummaryLoading(true);

      try {
        const data = await summarizeLegalDocSection(payload);

        const localNotes = [];
        if (spanClamped.clamped && spanClamped.note) localNotes.push(spanClamped.note);
        if (effectiveManual.clampNote) localNotes.push(effectiveManual.clampNote);

        applySummaryResponse(payload, {
          ...data,
          warnings: [...localNotes, ...((data?.warnings ?? data?.Warnings ?? []) || [])],
        });

        setSummaryPanelOpen(true);
      } catch (err) {
        console.error("Manual section summary failed:", err);
        const msg =
          err?.response?.data?.message ||
          err?.response?.data?.error ||
          "Failed to summarize manual range. (Check endpoint route + auth)";
        setSectionSummaryError(String(msg));
      } finally {
        setSectionSummaryLoading(false);
      }
    },
    [applySummaryResponse, docId, effectiveManual, pageMode, sectionSummaryLoading]
  );

  const canRunManual =
    advancedEnabled &&
    effectiveManual.ok &&
    effectiveManual.startPdf != null &&
    effectiveManual.endPdf != null &&
    (pageMode !== "printed" || offsetVerified);

  // =========================================================
  // ✅ Find in document (best-effort bridge to PdfViewer)
  // - IMPORTANT: No toast spam here (this was the “popup” you complained about)
  // =========================================================
  const tryInvokeFind = useCallback(async (q, dir = "next") => {
    const query = String(q || "").trim();
    if (!query) return;

    const apiObj = viewerApiRef.current;
    if (!apiObj) {
      setFindInlineHint("Viewer not ready yet.");
      return;
    }

    setFindBusy(true);
    setFindInlineHint("");

    try {
      const fns = [
        () => apiObj.openFind?.(),
        () => apiObj.openSearch?.(),
        () => apiObj.find?.(query, { direction: dir }),
        () => apiObj.findText?.(query, { direction: dir }),
        () => apiObj.searchText?.(query, { direction: dir }),
        () => apiObj.search?.(query, { direction: dir }),
        () => apiObj.setFindQuery?.(query),
      ];

      let did = false;
      for (const fn of fns) {
        try {
          const res = fn();
          if (res !== undefined) {
            did = true;
            break;
          }
        } catch {
          // keep trying
        }
      }

      if (!did) {
        setFindInlineHint("Search is not supported by this viewer yet. Use Ctrl+F.");
      }
    } finally {
      setFindBusy(false);
    }
  }, []);

  const openFind = useCallback(() => {
    setFindOpen(true);
    setFindInlineHint("");
    try {
      viewerApiRef.current?.openFind?.();
    } catch {
      // ignore
    }
  }, []);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    setFindQuery("");
    setFindBusy(false);
    setFindInlineHint("");
  }, []);

  // keyboard shortcut: Ctrl/Cmd + F opens our bar
  useEffect(() => {
    function onKeyDown(e) {
      const isF = (e.key || "").toLowerCase() === "f";
      const meta = e.metaKey || e.ctrlKey;
      if (meta && isF) {
        const tag = (e.target?.tagName || "").toLowerCase();
        const isTyping = tag === "input" || tag === "textarea" || e.target?.isContentEditable;
        if (!isTyping) {
          e.preventDefault();
          openFind();
        }
      }
      if ((e.key || "").toLowerCase() === "escape") {
        if (findOpen) closeFind();
        if (outlineOpen) closeOutline();
        if (aiDrawerOpen) closeAiDrawer();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [aiDrawerOpen, closeAiDrawer, closeFind, closeOutline, findOpen, openFind, outlineOpen]);

  // ✅ Gate UI only on access
  if (loadingAccess) {
    return (
      <div className="reader-shell readerCenter">
        <div className="readerLoadingCard">
          <div className="readerLoadingTitle">Loading reader…</div>
          <div className="readerLoadingHint">{loadingAccessHint}</div>
        </div>
      </div>
    );
  }

  if (!access) {
    return (
      <div className="reader-shell readerPadded">
        <p>Unable to open document.</p>
        <button className="outline-btn" onClick={() => navigate("/dashboard/explore")}>
          Back to Explore
        </button>
      </div>
    );
  }

  // HARD BLOCK overlay
  if (blocked) {
    const canPay = canPurchaseIndividually === true && offer?.allowPublicPurchase === true && offer?.alreadyOwned !== true;

    const primaryLabel = (() => {
      if (!canPurchaseIndividually) return "Purchases disabled";
      if (offer?.alreadyOwned) return "Already owned";
      return "Purchase options";
    })();

    return (
      <div className="reader-shell">
        {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

        <div className="preview-lock-backdrop">
          <div className="preview-lock-card">
            <h2>Access blocked</h2>

            {blockReason && <div className="readerBlockBadge">{blockReason}</div>}

            <p className="readerBlockMessage">{blockMessage}</p>

            {!canPurchaseIndividually && (
              <div className="readerBlockWarn">
                {purchaseDisabledReason ||
                  "Purchases are disabled for institution accounts. Please contact your administrator."}
              </div>
            )}

            <div className="preview-lock-actions">
              <button className="outline-btn" onClick={() => navigate(`/dashboard/documents/${id}`)}>
                Back to Details
              </button>

              <button
                className="primary-btn"
                disabled={!canPurchaseIndividually || offer?.alreadyOwned === true}
                onClick={() => navigate(`/dashboard/documents/${id}`)}
                title={
                  !canPurchaseIndividually
                    ? purchaseDisabledReason || "Purchases disabled"
                    : offer?.alreadyOwned
                    ? "You already own this document."
                    : ""
                }
              >
                {primaryLabel}
              </button>
            </div>

            <p className="preview-lock-footnote">
              {canPurchaseIndividually
                ? "If available for sale, you can purchase this publication as an individual user."
                : "Purchasing is disabled for your institution account. Please contact your administrator."}
            </p>

            {canPay && <p className="preview-lock-footnote readerTip">Tip: Go to the details page to complete the purchase.</p>}
          </div>
        </div>
      </div>
    );
  }

  if (!contentAvailable) {
    return (
      <div className="reader-error-state">
        {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

        <h2>Document unavailable</h2>
        <p>This publication is listed in the catalog, but its content is not available yet.</p>

        <div className="reader-error-actions">
          <button className="outline-btn" onClick={() => navigate(`/dashboard/documents/${id}`)}>
            Back to Details
          </button>

          <button className="primary-btn" onClick={() => navigate("/dashboard/explore")}>
            Explore Other Publications
          </button>
        </div>
      </div>
    );
  }

  const maxPages = access.hasFullAccess ? null : access.previewMaxPages;

  const resolvedTitle = (docTitle || "").trim() || `Document #${docId}`;

  const pageLabel = (() => {
    const p = Number(activePage);
    const t = Number(totalPages);
    if (Number.isFinite(p) && p > 0 && Number.isFinite(t) && t > 0) return `Page ${p} / ${t}`;
    if (Number.isFinite(p) && p > 0) return `Page ${p}`;
    if (Number.isFinite(t) && t > 0) return `${t} pages`;
    return "—";
  })();

  // unlock bar should show if locked AND not dismissed
  const showUnlockBar = locked && !access.hasFullAccess && !unlockBarDismissed;

  // desktop sticky styles (JS-only, applied inline)
  const stickyWrapStyle = isDesktop
    ? { position: "sticky", top: 0, zIndex: 5, background: "var(--reader-drawer-bg, #fff)" }
    : undefined;

  const stickySearchStyle = isDesktop
    ? { position: "sticky", top: 0, zIndex: 6, background: "var(--reader-drawer-bg, #fff)", paddingBottom: 10 }
    : undefined;

  // Small input style hook (we’ll finalize in CSS next)
  const tinyInputStyle = { transform: "scale(0.85)", transformOrigin: "left center" };

  return (
    <div className="reader-layout" onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp}>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

      {/* ✅ V2 Summary Panel (modal-like) */}
      <SectionSummaryPanel
        open={summaryPanelOpen}
        logoSrc={lawAfricaLogo}
        title={selectedTocNode ? nodeTitle(selectedTocNode, "") : "Selected section"}
        type={sectionSummaryType}
        loading={sectionSummaryLoading}
        error={sectionSummaryError}
        summaryText={sectionSummaryText}
        meta={sectionSummaryMeta}
        expanded={summaryExpanded}
        onToggleExpanded={toggleSummaryExpanded}
        onClose={closeSummaryPanel}
        onCopy={onCopySummary}
        onRegenerate={onRegenerateSummary}
        onSwitchType={onSwitchSummaryType}
      />

      {/* Topbar */}
      <div className="readerpage-topbar">
        <button className="readerpage-tocbtn" type="button" onClick={openOutline} title="Table of Contents">
          ☰ ToC
        </button>

        <div className="readerpage-title" title={resolvedTitle}>
          {resolvedTitle}
          <span className="readerpage-titleSub" title={pageLabel}>
            {pageLabel}
          </span>
        </div>

        <button
          className="readerpage-aiBtn"
          type="button"
          onClick={() => {
            if (!aiDrawerOpen) {
              setAiDrawerOpen(true);
              setAiDrawerCollapsed(false);
            } else if (aiDrawerCollapsed) {
              setAiDrawerCollapsed(false);
            } else {
              setAiDrawerCollapsed(true);
            }
          }}
          title="Summary"
        >
          Summary
        </button>
      </div>

      {/* Backdrops */}
      {outlineOpen && <div className="readerpage-tocBackdrop" onClick={closeOutline} />}
      {aiDrawerOpen && <div className="readerpage-tocBackdrop" onClick={closeAiDrawer} />}

      {/* Drawer / sidebar (ToC only) */}
      <div className={`readerpage-tocDrawer ${outlineOpen ? "open" : ""}`}>
        <div className="readerpage-tocSticky" style={stickyWrapStyle}>
          <div className="readerpage-tocHeader" style={stickySearchStyle}>
            <div className="readerpage-tocTitle">Table of Contents</div>

            <div className="readerOutlineHeaderActions">
              <button
                className="readerOutlineMiniBtn"
                type="button"
                onClick={toggleExpandCollapseAll}
                title={outlineExpanded.size ? "Collapse all" : "Expand all"}
              >
                {outlineExpanded.size ? "Collapse" : "Expand"}
              </button>

              <button
                className="readerpage-aiBtn"
                type="button"
                onClick={openAiDrawer}
                title="AI tools (summary, copy, advanced range)"
              >
                AI Summary
              </button>
            </div>

            <button className="readerpage-tocClose" type="button" onClick={closeOutline} title="Close">
              ✕
            </button>
          </div>

          {/* Offset status */}
          <div className="laInlineOffsetCard">
            <div className="laInlineOffsetRow">
              <div className="laInlineOffsetLeft">
                <strong>PDF offset:</strong>{" "}
                <span className="laInlineOffsetValue">
                  {pdfPageOffset >= 0 ? `+${pdfPageOffset}` : pdfPageOffset}{" "}
                  <span className={`laInlineOffsetBadge ${offsetVerified ? "ok" : "warn"}`}>
                    {offsetVerified ? "verified" : "unverified"}
                  </span>
                </span>
              </div>

              <button
                type="button"
                className="readerOutlineMiniBtn"
                onClick={() => {
                  setPdfPageOffset(0);
                  setOffsetVerified(false);
                  showToast("Offset reset to 0 (not verified)", "success");
                }}
                title="Reset offset"
              >
                Reset
              </button>
            </div>

            <div className="laInlineOffsetTip">
              Tip: Click a ToC item to calibrate automatically. (offset = PDF page − printed start page)
            </div>
          </div>

          <div className="readerOutlineSearchWrap">
            <input
              className="readerOutlineSearch"
              type="search"
              value={outlineQuery}
              onChange={(e) => setOutlineQuery(e.target.value)}
              placeholder="Search sections…"
              aria-label="Search table of contents"
            />
            {outlineQuery ? (
              <button type="button" className="readerOutlineClear" onClick={() => setOutlineQuery("")} title="Clear search">
                ✕
              </button>
            ) : null}
          </div>
        </div>

        <div className="readerpage-tocBody">
          {outlineLoading ? (
            <div className="readerpage-tocState">Loading ToC…</div>
          ) : outlineError ? (
            <div className="readerpage-tocState error">
              {outlineError}
              <div className="readerOutlineStateActions">
                <button className="outline-btn" type="button" onClick={fetchOutline}>
                  Retry
                </button>
              </div>
            </div>
          ) : filteredOutline?.length ? (
            <div className="readerpage-tocList">
              <OutlineTree
                nodes={filteredOutline}
                expanded={outlineExpanded}
                activePage={activePage}
                pdfPageOffset={pdfPageOffset}
                onToggle={toggleOutlineNode}
                onPick={onOutlineClick}
              />
            </div>
          ) : outline?.length ? (
            <div className="readerpage-tocState">
              No matches for <strong>{outlineQuery.trim()}</strong>.
              <div className="readerOutlineStateActions">
                <button className="outline-btn" type="button" onClick={() => setOutlineQuery("")}>
                  Clear search
                </button>
              </div>
            </div>
          ) : (
            <div className="readerpage-tocState">
              <div className="readerNoTocCard">
                <div className="readerNoTocTitle">No table of contents available</div>
                <div className="readerNoTocBody">
                  This PDF does not have a usable outline yet, or the ToC endpoint returned an empty tree.
                </div>

                <div className="readerNoTocActions">
                  <button className="outline-btn" type="button" onClick={fetchOutline}>
                    Reload ToC
                  </button>

                  <button className="outline-btn" type="button" onClick={() => navigate(`/dashboard/documents/${id}`)}>
                    Details
                  </button>

                  <button
                    className="outline-btn"
                    type="button"
                    onClick={async () => {
                      const endpoint = `/api/legal-documents/${docId}/outline`;
                      const ok = await safeCopyToClipboard(endpoint);
                      showToast(ok ? "Copied endpoint ✅" : "Copy failed", ok ? "success" : "error");
                    }}
                    title="Copy the expected endpoint path"
                  >
                    Copy endpoint
                  </button>
                </div>

                <div className="readerNoTocHint">
                  Tip: You can still use <strong>Find</strong> to search inside the PDF.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Desktop resize handle */}
        <div
          className="readerOutlineResizeHandle"
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize"
          onPointerDown={onResizePointerDown}
        />
      </div>

      {/* ✅ AI Drawer (NOT in ToC) */}
      <div
        className={`readerpage-aiDrawer ${aiDrawerOpen ? "open" : ""} ${aiDrawerCollapsed ? "collapsed" : ""}`}
        role="complementary"
        aria-label="AI tools"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="readerpage-aiHeader">
          <div className="readerpage-aiTitle">Summary</div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              className="readerOutlineMiniBtn"
              onClick={() => setAiDrawerCollapsed((v) => !v)}
              title={aiDrawerCollapsed ? "Show panel" : "Hide panel"}
            >
              {aiDrawerCollapsed ? "Show" : "Hide"}
            </button>

            <button className="readerpage-tocClose" type="button" onClick={closeAiDrawer} title="Close">
              ✕
            </button>
          </div>
        </div>

        {!aiDrawerCollapsed ? (
          <div className="readerpage-aiBody">
            {/* Selected section */}
            <div className="laAiCard">
              <div className="laAiCardTop">
                <div className="laAiCardTitle">Section summary</div>
                <div className="laAiCardActions">
                  <button
                    type="button"
                    className="readerOutlineMiniBtn"
                    disabled={!sectionSummaryText}
                    onClick={onCopySummary}
                    title="Copy summary"
                  >
                    {aiCopied ? "Copied" : "Copy"}
                  </button>

                  <button
                    type="button"
                    className="readerOutlineMiniBtn laAccent"
                    disabled={!sectionSummaryText}
                    onClick={openSummaryPanel}
                    title="Open full summary panel"
                  >
                    Open
                  </button>
                </div>
              </div>

              <div className="laAiCardInfo">
                {selectedTocNode ? (
                  <>
                    <div className="laAiSectionTitle">{nodeTitle(selectedTocNode)}</div>
                    <div className="laAiSectionMeta">Pages: {nodeRightLabel(selectedTocNode) || "—"}</div>
                  </>
                ) : (
                  <div className="laInlineMuted">Pick a ToC section first (☰ ToC), then run Basic or Extended.</div>
                )}
              </div>

              <div className="laAiCardBtns">
                <button
                  type="button"
                  className="outline-btn"
                  disabled={!selectedTocNode || sectionSummaryLoading}
                  onClick={() => runSectionSummary("basic", { force: false, openPanel: false })}
                >
                  {sectionSummaryLoading && sectionSummaryType === "basic" ? "Basic…" : "Basic"}
                </button>

                <button
                  type="button"
                  className="outline-btn"
                  disabled={!selectedTocNode || sectionSummaryLoading}
                  onClick={() => runSectionSummary("extended", { force: false, openPanel: false })}
                >
                  {sectionSummaryLoading && sectionSummaryType === "extended" ? "Extended…" : "Extended"}
                </button>

                <button
                  type="button"
                  className="outline-btn laPrimary"
                  disabled={!selectedTocNode || sectionSummaryLoading}
                  onClick={() => runSectionSummary(sectionSummaryType, { force: true, openPanel: true })}
                  title="Regenerate (force)"
                >
                  {sectionSummaryLoading ? "Working…" : "Regenerate"}
                </button>
              </div>

              {sectionSummaryError ? <div className="laInlineError">{sectionSummaryError}</div> : null}

              {sectionSummaryMeta ? (
                <div className="laInlineMetaCard">
                  <div className="laInlineMetaRow">
                    <div>
                      <strong>Used pages:</strong> {sectionSummaryMeta.usedPages}
                    </div>
                    <div>
                      <strong>Input chars:</strong> {sectionSummaryMeta.inputCharCount}
                    </div>
                    <div>
                      <strong>Cache:</strong> {sectionSummaryMeta.fromCache ? "yes" : "no"}
                    </div>
                  </div>

                  {/* ✅ optional debug line (quiet, helps support) */}
                  <div className="laInlineMetaRow" style={{ marginTop: 6, opacity: 0.85 }}>
                    <div title={sectionSummaryMeta.ownerKey || ""}>
                      <strong>Owner:</strong> {String(sectionSummaryMeta.ownerKey || "—").slice(0, 26)}
                      {String(sectionSummaryMeta.ownerKey || "").length > 26 ? "…" : ""}
                    </div>
                    <div title={sectionSummaryMeta.promptVersion || ""}>
                      <strong>PV:</strong> {sectionSummaryMeta.promptVersion || "—"}
                    </div>
                    <div title={sectionSummaryMeta.modelUsed || ""}>
                      <strong>Model:</strong> {sectionSummaryMeta.modelUsed || "—"}
                    </div>
                  </div>

                  {sectionSummaryMeta.warnings?.length ? (
                    <div className="laInlineWarnings">
                      <div className="laInlineWarningsTitle">Warnings</div>
                      <ul className="laInlineWarningsList">
                        {sectionSummaryMeta.warnings.map((w, i) => (
                          <li key={`${i}-${w}`}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Advanced summary (manual pages) */}
            <div className="laAiCard">
              <div className="laInlineAdvancedHeader">
                <div className="laInlineAdvancedTitle">Advanced summary</div>

                <label className="laInlineCheckbox laTinyCheck">
                  <input
                    style={tinyInputStyle}
                    type="checkbox"
                    checked={advancedEnabled}
                    onChange={(e) => setAdvancedEnabled(e.target.checked)}
                  />
                  Use manual page range
                </label>
              </div>

              {advancedEnabled ? (
                <div className="laInlineAdvancedBody">
                  <div className="laInlineRadios">
                    <label className="laInlineRadio laTinyCheck">
                      <input
                        style={tinyInputStyle}
                        type="radio"
                        name="pageMode"
                        checked={pageMode === "printed"}
                        onChange={() => setPageMode("printed")}
                      />
                      Printed pages (recommended)
                    </label>

                    <label className="laInlineRadio laTinyCheck">
                      <input
                        style={tinyInputStyle}
                        type="radio"
                        name="pageMode"
                        checked={pageMode === "pdf"}
                        onChange={() => setPageMode("pdf")}
                      />
                      PDF pages (advanced)
                    </label>
                  </div>

                  {pageMode === "printed" ? (
                    <div className="laInlineOffsetInfo">
                      <div>
                        <strong>Offset:</strong>{" "}
                        {Number.isFinite(pdfPageOffset) ? (
                          <span>
                            {pdfPageOffset >= 0 ? `+${pdfPageOffset}` : pdfPageOffset}{" "}
                            <span className={`laInlineOffsetBadge ${offsetVerified ? "ok" : "warn"}`}>
                              {offsetVerified ? "verified" : "unverified"}
                            </span>
                          </span>
                        ) : (
                          <span>not set</span>
                        )}
                      </div>

                      {!offsetVerified ? (
                        <div className="laInlineWarnText">
                          Offset not confirmed. Click a ToC item to calibrate before running to avoid wrong output.
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="laInlineManualInputs">
                    <div className="laInlineManualCol">
                      <div className="laInlineManualLabel">Start {pageMode === "printed" ? "printed" : "PDF"} page</div>
                      <input
                        className="readerOutlineSearch"
                        inputMode="numeric"
                        value={manualStart}
                        onChange={(e) => setManualStart(e.target.value)}
                        placeholder={pageMode === "printed" ? "e.g. 41" : "e.g. 81"}
                      />
                    </div>

                    <div className="laInlineManualCol">
                      <div className="laInlineManualLabel">End {pageMode === "printed" ? "printed" : "PDF"} page</div>
                      <input
                        className="readerOutlineSearch"
                        inputMode="numeric"
                        value={manualEnd}
                        onChange={(e) => setManualEnd(e.target.value)}
                        placeholder={pageMode === "printed" ? "e.g. 46" : "e.g. 86"}
                      />
                    </div>
                  </div>

                  <div className="laInlineEffectiveRange">
                    <div className="laInlineEffectiveText">
                      <strong>Effective range:</strong> <span>{effectiveManual.label}</span>
                    </div>
                    {effectiveManual.clampNote ? <div className="laInlineWarnText">{effectiveManual.clampNote}</div> : null}
                  </div>

                  <div className="laInlineManualBtns">
                    <button
                      type="button"
                      className="outline-btn"
                      disabled={!canRunManual || sectionSummaryLoading}
                      onClick={() => runManualSectionSummary("basic")}
                    >
                      {sectionSummaryLoading && sectionSummaryType === "basic" ? "Basic…" : "Basic"}
                    </button>

                    <button
                      type="button"
                      className="outline-btn"
                      disabled={!canRunManual || sectionSummaryLoading}
                      onClick={() => runManualSectionSummary("extended")}
                    >
                      {sectionSummaryLoading && sectionSummaryType === "extended" ? "Extended…" : "Extended"}
                    </button>

                    <button
                      type="button"
                      className="outline-btn laPrimary"
                      disabled={!canRunManual || sectionSummaryLoading}
                      onClick={() => runManualSectionSummary(sectionSummaryType)}
                      title="Open panel after generating"
                    >
                      {sectionSummaryLoading ? "Working…" : "Open in panel"}
                    </button>
                  </div>

                  <div className="laInlineHint">
                    Tip: keep ranges small (Basic ≤ {BASIC_MAX_SPAN} pages, Extended ≤ {EXTENDED_MAX_SPAN} pages). Preview limits
                    still apply.
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div style={{ padding: 10 }}>
            <button
              type="button"
              className="readerOutlineMiniBtn laAccent"
              onClick={() => setAiDrawerCollapsed(false)}
              title="Show summary tools"
            >
              Open Summary
            </button>
          </div>
        )}
      </div>

      {/* Main reader */}
      <div
        className="readerpage-main"
        onMouseDown={() => {
          if (aiDrawerOpen) setAiDrawerCollapsed(true);
        }}
      >
        {loadingMeta ? <div className="readerMetaPill">Preparing document…</div> : null}

        <PdfViewer
          documentId={docId}
          maxAllowedPage={maxPages}
          onPreviewLimitReached={() => {
            setLocked(true);
            setUnlockBarDismissed(false);
          }}
          onRegisterApi={handleRegisterApi}
        />

        {/* ✅ Find bar */}
        {findOpen ? (
          <div className="readerFindBar" role="dialog" aria-label="Find in document">
            <div className="readerFindBarInner">
              <div className="readerFindBarTitle">Find</div>

              <input
                className="readerFindInput"
                value={findQuery}
                onChange={(e) => setFindQuery(e.target.value)}
                placeholder="Type to search…"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    tryInvokeFind(findQuery, "next");
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    closeFind();
                  }
                }}
              />

              <div className="readerFindBarBtns">
                <button
                  type="button"
                  className="readerOutlineMiniBtn"
                  disabled={!findQuery.trim() || findBusy}
                  onClick={() => tryInvokeFind(findQuery, "prev")}
                  title="Previous match"
                >
                  Prev
                </button>

                <button
                  type="button"
                  className="readerOutlineMiniBtn laAccent"
                  disabled={!findQuery.trim() || findBusy}
                  onClick={() => tryInvokeFind(findQuery, "next")}
                  title="Next match"
                >
                  Next
                </button>

                <button type="button" className="readerOutlineMiniBtn" onClick={closeFind} title="Close (Esc)">
                  ✕
                </button>
              </div>
            </div>

            {/* ✅ inline hint (no toast / no popup spam) */}
            <div className="readerFindHint">
              {findInlineHint ? (
                <span>{findInlineHint}</span>
              ) : (
                <span>
                  Tip: If the PDF viewer doesn’t support search yet, use <strong>Ctrl+F</strong>.
                </span>
              )}
            </div>
          </div>
        ) : null}

        {/* ✅ Bottom unlock bar */}
        {showUnlockBar ? (
          <div className="readerUnlockBar" role="region" aria-label="Unlock full access">
            <div className="readerUnlockBarInner">
              <div className="readerUnlockBarText">
                <strong>Preview limit reached.</strong> Continue beyond page {access.previewMaxPages} by unlocking full access.
              </div>

              <div className="readerUnlockBarActions">
                <button className="outline-btn" onClick={() => navigate(`/dashboard/documents/${id}`)}>
                  Details
                </button>

                <button className="primary-btn" onClick={() => navigate(`/dashboard/documents/${id}`)}>
                  Unlock
                </button>

                <button
                  className="outline-btn"
                  onClick={() => {
                    setUnlockBarDismissed(true);
                    showToast("Dismissed", "success");
                  }}
                  title="Dismiss"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
