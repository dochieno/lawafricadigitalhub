// src/pages/documents/DocumentReader.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import api, { checkDocumentAvailability } from "../../api/client";
import { summarizeLegalDocSection } from "../../api/aiSections";
import PdfViewer from "../../reader/PdfViewer";
import SectionSummaryPanel from "../../components/reader/SectionSummaryPanel";
import "../../styles/reader.css";

// ✅ If you updated parseAiSummary.js as I gave you earlier, keep this import.
// If you haven't updated that file yet, comment this import and the usage in onCopySummary.
import { formatAiSummaryForCopy } from "../../reader/ai/parseAiSummary";

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

// Helper
function stripInlineMetaFromSummary(text) {
  const raw = String(text || "");
  if (!raw.trim()) return "";

  // Removes common header/meta lines if they appear at the top of the summary text
  const lines = raw.split(/\r?\n/);
  const out = [];

  let skipping = true;
  for (const line of lines) {
    const l = line.trim();

    if (skipping) {
      const isMetaLine =
        /^used pages\s*:/i.test(l) ||
        /^input chars\s*:/i.test(l) ||
        /^cache\s*:/i.test(l) ||
        /^warnings\s*$/i.test(l) ||
        /^page range/i.test(l) ||
        /^input text was truncated/i.test(l);

      // skip blank lines while skipping meta
      if (!l) continue;

      if (isMetaLine) continue;

      // first non-meta content starts here
      skipping = false;
    }

    out.push(line);
  }

  return out.join("\n").trim();
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

        const startRaw = nodeStartPage(n);
        const endRaw = nodeEndPage(n);

        const startPdf = startRaw != null ? startRaw + pdfPageOffset : null;
        const endPdf = endRaw != null ? endRaw + pdfPageOffset : null;

        const jumpPage = startPdf;

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
  const [locked, setLocked] = useState(false);

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

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }

  // ---------------------------------------------
  // Outline state + PdfViewer API bridge
  // ---------------------------------------------
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [outline, setOutline] = useState([]);
  const [outlineLoading, setOutlineLoading] = useState(false);
  const [outlineError, setOutlineError] = useState("");

  const [outlineExpanded, setOutlineExpanded] = useState(() => new Set());
  const [outlineQuery, setOutlineQuery] = useState("");
  const [activePage, setActivePage] = useState(null);

  const viewerApiRef = useRef(null);
  const mountedRef = useRef(false);
  const outlineAbortRef = useRef(null);

  // ✅ page sync fix: support event-driven updates if PdfViewer exposes them
  const pageSyncUnsubRef = useRef(null);
  const pageSyncTimerRef = useRef(null);
  const lastPageEmitRef = useRef(0);

  const OUTLINE_WIDTH_KEY = "la_reader_outline_width";
  const OUTLINE_EXPANDED_KEY = useMemo(
    () => (Number.isFinite(docId) && docId > 0 ? `la_reader_outline_expanded_${docId}` : ""),
    [docId]
  );

  const [outlineWidth, setOutlineWidth] = useState(() => {
    const raw = localStorage.getItem(OUTLINE_WIDTH_KEY);
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 260 && n <= 560) return n;
    return 340;
  });

  // =========================================================
  // per-document PDF offset calibration (stored in localStorage)
  // printed page -> PDF page uses: pdf = printed + offset
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

  useEffect(() => {
    if (!OFFSET_KEY) return;
    const raw = localStorage.getItem(OFFSET_KEY);
    const n = Number(raw);
    setPdfPageOffset(Number.isFinite(n) ? n : 0);

    const vraw = localStorage.getItem(OFFSET_VERIFIED_KEY);
    setOffsetVerified(vraw === "1");
  }, [OFFSET_KEY, OFFSET_VERIFIED_KEY]);

  useEffect(() => {
    if (!OFFSET_KEY) return;
    localStorage.setItem(OFFSET_KEY, String(pdfPageOffset));
  }, [OFFSET_KEY, pdfPageOffset]);

  useEffect(() => {
    if (!OFFSET_VERIFIED_KEY) return;
    localStorage.setItem(OFFSET_VERIFIED_KEY, offsetVerified ? "1" : "0");
  }, [OFFSET_VERIFIED_KEY, offsetVerified]);

  useEffect(() => {
    document.documentElement.style.setProperty("--reader-outline-width", `${outlineWidth}px`);
    return () => {
      document.documentElement.style.removeProperty("--reader-outline-width");
    };
  }, [outlineWidth]);

  // =========================================================
  // Summary panel state
  // =========================================================
  const [summaryPanelOpen, setSummaryPanelOpen] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(false);

  const [selectedTocNode, setSelectedTocNode] = useState(null);
  const [sectionSummaryType, setSectionSummaryType] = useState("basic"); // "basic" | "extended"
  const [sectionSummaryLoading, setSectionSummaryLoading] = useState(false);
  const [sectionSummaryError, setSectionSummaryError] = useState("");
  const [sectionSummaryText, setSectionSummaryText] = useState("");
  const [sectionSummaryMeta, setSectionSummaryMeta] = useState(null);
  const lastSummaryKeyRef = useRef("");

  const SUMMARY_LAST_KEY = useMemo(
    () => (Number.isFinite(docId) && docId > 0 ? `la_reader_last_summary_${docId}` : ""),
    [docId]
  );

  useEffect(() => {
    if (!SUMMARY_LAST_KEY) return;
    const raw = localStorage.getItem(SUMMARY_LAST_KEY);
    const data = safeJsonParse(raw || "null", null);
    if (!data) return;

    if (typeof data.summaryText === "string" && data.summaryText.trim()) {
      setSectionSummaryText(data.summaryText);
      setSectionSummaryMeta(data.meta || null);
      setSectionSummaryType(data.type === "extended" ? "extended" : "basic");
      setSelectedTocNode(data.selectedNode || null);
    }
  }, [SUMMARY_LAST_KEY]);

  useEffect(() => {
    if (!SUMMARY_LAST_KEY) return;
    if (!sectionSummaryText || !sectionSummaryText.trim()) return;

    const payload = {
      type: sectionSummaryType,
      summaryText: sectionSummaryText,
      meta: sectionSummaryMeta,
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

    localStorage.setItem(SUMMARY_LAST_KEY, JSON.stringify(payload));
  }, [SUMMARY_LAST_KEY, sectionSummaryType, sectionSummaryText, sectionSummaryMeta, selectedTocNode]);

  // Advanced manual summary
  const [advancedEnabled, setAdvancedEnabled] = useState(false);
  const [pageMode, setPageMode] = useState("printed"); // "printed" | "pdf"
  const [manualStart, setManualStart] = useState("");
  const [manualEnd, setManualEnd] = useState("");

  const BASIC_MAX_SPAN = 6;
  const EXTENDED_MAX_SPAN = 12;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      safeAbort(outlineAbortRef.current);
      try {
        pageSyncUnsubRef.current?.();
      } catch {
        // ignore
      }
      pageSyncUnsubRef.current = null;
      if (pageSyncTimerRef.current) {
        window.clearInterval(pageSyncTimerRef.current);
        pageSyncTimerRef.current = null;
      }
    };
  }, []);

  const openOutline = useCallback(() => setOutlineOpen(true), []);
  const closeOutline = useCallback(() => setOutlineOpen(false), []);

  const openSummaryPanel = useCallback(() => setSummaryPanelOpen(true), []);
  const closeSummaryPanel = useCallback(() => setSummaryPanelOpen(false), []);
  const toggleSummaryExpanded = useCallback(() => setSummaryExpanded((p) => !p), []);

  // ✅ page sync “source of truth”: emitActivePage()
  const emitActivePage = useCallback((p) => {
    const n = Number(p);
    if (!Number.isFinite(n) || n <= 0) return;

    // tiny throttle to avoid re-render storms while scrolling
    const now = Date.now();
    if (now - lastPageEmitRef.current < 60) return;
    lastPageEmitRef.current = now;

    setActivePage((prev) => (prev === n ? prev : n));
  }, []);

  // ✅ PdfViewer API bridge (also installs stronger page-change sync if supported)
  const handleRegisterApi = useCallback(
    (apiObj) => {
      viewerApiRef.current = apiObj;

      // cleanup previous listeners/timers
      try {
        pageSyncUnsubRef.current?.();
      } catch {
        // ignore
      }
      pageSyncUnsubRef.current = null;

      if (pageSyncTimerRef.current) {
        window.clearInterval(pageSyncTimerRef.current);
        pageSyncTimerRef.current = null;
      }

      // 1) Prefer event-driven updates if PdfViewer exposes it.
      // Supported shapes (we try all, safely):
      // - apiObj.onPageChange((page)=>{}) -> returns unsubscribe
      // - apiObj.subscribe("pagechange", (page)=>{}) -> returns unsubscribe
      // - apiObj.subscribe({ type:"pagechange", handler }) -> returns unsubscribe
      let unsub = null;

      try {
        if (typeof apiObj?.onPageChange === "function") {
          const ret = apiObj.onPageChange((page) => emitActivePage(page));
          if (typeof ret === "function") unsub = ret;
        }
      } catch {
        // ignore
      }

      if (!unsub) {
        try {
          if (typeof apiObj?.subscribe === "function") {
            const ret1 = apiObj.subscribe("pagechange", (page) => emitActivePage(page));
            if (typeof ret1 === "function") unsub = ret1;

            if (!unsub) {
              const ret2 = apiObj.subscribe({ type: "pagechange", handler: (page) => emitActivePage(page) });
              if (typeof ret2 === "function") unsub = ret2;
            }
          }
        } catch {
          // ignore
        }
      }

      if (unsub) {
        pageSyncUnsubRef.current = unsub;
      }

      // 2) Always keep a polling fallback (covers scroll cases where events are not emitted)
      pageSyncTimerRef.current = window.setInterval(() => {
        const page = viewerApiRef.current?.getCurrentPage?.();
        emitActivePage(page);
      }, 200);

      // initial snapshot
      try {
        const page = apiObj?.getCurrentPage?.();
        emitActivePage(page);
      } catch {
        // ignore
      }
    },
    [emitActivePage]
  );

  // Calibrate offset from ToC click
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
    [setPdfPageOffset, setOffsetVerified]
  );

  // Preview clamp + jump
  const onOutlineClick = useCallback(
    (node, pageNumber) => {
      setSelectedTocNode(node);

      const p = Number(pageNumber);
      if (!Number.isFinite(p) || p <= 0) return;

      if (!access?.hasFullAccess && Number.isFinite(access?.previewMaxPages)) {
        if (p > access.previewMaxPages) {
          showToast(
            `This section is outside preview (ends at page ${access.previewMaxPages}). Purchase to continue.`,
            "error"
          );
          setLocked(true);
          return;
        }
      }

      const ok = viewerApiRef.current?.jumpToPage?.(p, "smooth");
      if (ok) {
        calibrateOffsetFromTocNode(node, p);
        setOutlineOpen(false);

        // force UI page to update immediately after jump
        emitActivePage(p);
      }
    },
    [access, calibrateOffsetFromTocNode, emitActivePage]
  );

  const toggleOutlineNode = useCallback((idStr) => {
    setOutlineExpanded((prevSet) => {
      const next = new Set(prevSet);
      if (next.has(idStr)) next.delete(idStr);
      else next.add(idStr);
      return next;
    });
  }, []);

  const allNodeIds = useMemo(() => collectAllNodeIds(outline), [outline]);

  const allExpanded = useMemo(() => {
    if (!allNodeIds.size) return false;
    for (const idStr of allNodeIds) {
      if (!outlineExpanded.has(idStr)) return false;
    }
    return true;
  }, [allNodeIds, outlineExpanded]);

  const toggleExpandCollapseAll = useCallback(() => {
    if (!outline?.length) return;

    setOutlineExpanded((prev) => {
      let isAll = true;
      for (const idStr of allNodeIds) {
        if (!prev.has(idStr)) {
          isAll = false;
          break;
        }
      }
      return isAll ? new Set() : new Set(allNodeIds);
    });
  }, [outline, allNodeIds]);

  // Persist expanded state per document
  useEffect(() => {
    if (!OUTLINE_EXPANDED_KEY) return;
    const arr = Array.from(outlineExpanded.values());
    localStorage.setItem(OUTLINE_EXPANDED_KEY, JSON.stringify(arr));
  }, [OUTLINE_EXPANDED_KEY, outlineExpanded]);

  const restoreExpandedForDoc = useCallback(() => {
    if (!OUTLINE_EXPANDED_KEY) return;
    const raw = localStorage.getItem(OUTLINE_EXPANDED_KEY);
    const arr = safeJsonParse(raw || "[]", []);
    if (Array.isArray(arr) && arr.length) {
      setOutlineExpanded(new Set(arr.map(String)));
    } else {
      setOutlineExpanded(new Set());
    }
  }, [OUTLINE_EXPANDED_KEY]);

  useEffect(() => {
    localStorage.setItem(OUTLINE_WIDTH_KEY, String(outlineWidth));
  }, [outlineWidth]);

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

  // Fetch Outline
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

    setSectionSummaryError("");
    setSectionSummaryLoading(false);
    lastSummaryKeyRef.current = "";

    setAdvancedEnabled(false);
    setPageMode("printed");
    setManualStart("");
    setManualEnd("");

    setSummaryPanelOpen(false);
    setSummaryExpanded(false);

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

  // Access + Meta load
  useEffect(() => {
    aliveRef.current = true;
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

            if (accessData?.hasFullAccess) setLocked(false);
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

    async function loadMetaInBackground() {
      setLoadingMeta(true);

      try {
        const offerPromise = api
          .get(`/legal-documents/${docId}/public-offer`)
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

        const [offerData, isAvailable] = await Promise.all([offerPromise, availabilityPromise]);
        if (cancelled || !aliveRef.current) return;

        if (offerData) setOffer(offerData);
        setContentAvailable(!!isAvailable);
      } finally {
        if (!cancelled && aliveRef.current) setLoadingMeta(false);
      }
    }

    if (!Number.isFinite(docId) || docId <= 0) {
      setAccess(null);
      setLoadingAccess(false);
      setLoadingMeta(false);
      return;
    }

    loadAccessOnlyWithRetryIfPaid().then(() => {
      if (!cancelled && aliveRef.current) loadMetaInBackground();
    });

    return () => {
      cancelled = true;
      aliveRef.current = false;
    };
  }, [docId, justPaid, paidProvider]);

  // =========================================================
  // AI Summary actions (ToC -> payload)
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

      setSectionSummaryText(stripInlineMetaFromSummary(summary));

      const fromCache = data?.fromCache ?? data?.FromCache ?? false;
      const usedStart = data?.startPage ?? data?.StartPage ?? null;
      const usedEnd = data?.endPage ?? data?.EndPage ?? null;
      const inputCharCount = data?.inputCharCount ?? data?.InputCharCount ?? 0;

      const warnings = data?.warnings ?? data?.Warnings ?? [];
      const warningsArr = Array.isArray(warnings) ? warnings : [];

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
      });

      showToast(fromCache ? "Loaded from cache" : "Summary generated", "success");
    },
    [setSectionSummaryMeta, setSectionSummaryText]
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

    const textToCopy =
      typeof formatAiSummaryForCopy === "function"
        ? formatAiSummaryForCopy(sectionSummaryText)
        : sectionSummaryText;

    const ok = await safeCopyToClipboard(textToCopy);
    if (ok) showToast("Copied ✅", "success");
    else showToast("Copy failed (browser blocked clipboard)", "error");
  }, [sectionSummaryText]);

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
  // Manual range summary helpers
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

  // Gate UI only on access
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
                {purchaseDisabledReason || "Purchases are disabled for institution accounts. Please contact your administrator."}
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

  const pageLabel = Number.isFinite(activePage) && activePage > 0 ? `Page ${activePage}` : "—";

  return (
    <div className="reader-layout" onPointerMove={onResizePointerMove} onPointerUp={onResizePointerUp}>
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

      {/* ✅ Summary Panel */}
      <SectionSummaryPanel
        open={summaryPanelOpen}
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

      {/* Topbar (premium-ish layout; CSS later) */}
      <div className="readerpage-topbar">
        <div className="readerTopbarLeft">
          <button className="readerpage-tocbtn" type="button" onClick={openOutline} title="Table of Contents">
            ☰ ToC
          </button>

          <div className="readerTopbarMeta" title={`Document ${docId}`}>
            <div className="readerpage-title">Reader</div>
            <div className="readerTopbarSub">
              <span className="readerTopbarPage">{pageLabel}</span>
              {!access?.hasFullAccess && Number.isFinite(access?.previewMaxPages) ? (
                <span className="readerTopbarSep">·</span>
              ) : null}
              {!access?.hasFullAccess && Number.isFinite(access?.previewMaxPages) ? (
                <span className="readerTopbarPreview">Preview up to {access.previewMaxPages}</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="readerTopbarRight">
          <button
            className="readerpage-aiBtn"
            type="button"
            onClick={openSummaryPanel}
            disabled={!sectionSummaryText}
            title={sectionSummaryText ? "Open Summary" : "Generate a summary first (ToC → Basic/Extended)"}
          >
            Summary
          </button>
        </div>
      </div>

      {/* Backdrop (mobile) */}
      {outlineOpen && <div className="readerpage-tocBackdrop" onClick={closeOutline} />}

      {/* Drawer / sidebar */}
      <div className={`readerpage-tocDrawer ${outlineOpen ? "open" : ""}`}>
        <div className="readerpage-tocHeader">
          <div className="readerpage-tocTitle">Table of Contents</div>

          {/* ✅ Compact header actions: icon toggle + Summary (no wrap) */}
          <div className="readerOutlineHeaderActions">
            <button
              className="readerOutlineIconBtn"
              type="button"
              onClick={toggleExpandCollapseAll}
              title={allExpanded ? "Collapse all" : "Expand all"}
              aria-label={allExpanded ? "Collapse all" : "Expand all"}
            >
              {allExpanded ? "▾" : "▸"}
            </button>

            <button
              className="readerOutlineMiniBtn laAccent readerOutlineSummaryBtn"
              type="button"
              onClick={openSummaryPanel}
              disabled={!sectionSummaryText}
              title={sectionSummaryText ? "Open summary" : "Generate a summary first"}
            >
              Summary
            </button>
          </div>

          <button className="readerpage-tocClose" type="button" onClick={closeOutline} title="Close">
            ✕
          </button>
        </div>

        <div className="readerpage-tocBody">
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
              No ToC available for document #{docId}.
              <div className="readerOutlineHint">
                Confirm the Reader API returns it: <span>/api/legal-documents/{docId}/outline</span>
              </div>
              <div className="readerOutlineStateActions">
                <button className="outline-btn" type="button" onClick={fetchOutline}>
                  Reload
                </button>
              </div>
            </div>
          )}

          {/* ✅ AI summary (controls only — no used-pages / no raw text preview) */}
          <div className="laInlineTocSummary">
            <div className="laInlineTocSummaryTop">
              <div className="laInlineTocSummaryTitle">AI · Section summary</div>

              <div className="laInlineTocSummaryTopActions">
                <button
                  type="button"
                  className="readerOutlineMiniBtn"
                  disabled={!sectionSummaryText || sectionSummaryLoading}
                  onClick={onCopySummary}
                  title="Copy summary"
                >
                  Copy
                </button>

                <button
                  type="button"
                  className="readerOutlineMiniBtn laAccent"
                  disabled={!sectionSummaryText}
                  onClick={openSummaryPanel}
                  title={sectionSummaryText ? "Open summary panel" : "Generate a summary first"}
                >
                  Open
                </button>
              </div>
            </div>

            <div className="laInlineTocSummaryInfo">
              {selectedTocNode ? (
                <>
                  <div className="laInlineTocSummarySection">{nodeTitle(selectedTocNode)}</div>
                  <div className="laInlineTocSummaryPages">Pages: {nodeRightLabel(selectedTocNode) || "—"}</div>
                </>
              ) : (
                <div className="laInlineMuted">Select a ToC section, then choose Basic or Extended.</div>
              )}
            </div>

            <div className="laInlineTocSummaryBtns">
              <button
                type="button"
                className="outline-btn"
                disabled={!selectedTocNode || sectionSummaryLoading}
                onClick={() => runSectionSummary("basic", { force: false, openPanel: false })}
                title="Generate basic summary"
              >
                {sectionSummaryLoading && sectionSummaryType === "basic" ? "Basic…" : "Basic"}
              </button>

              <button
                type="button"
                className="outline-btn"
                disabled={!selectedTocNode || sectionSummaryLoading}
                onClick={() => runSectionSummary("extended", { force: false, openPanel: false })}
                title="Generate extended summary"
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

            {sectionSummaryText ? (
              <div className="laInlineMuted" style={{ marginTop: 8 }}>
                Summary ready. Click <strong>Open</strong> to view.
              </div>
            ) : null}
          </div>

          {/* Advanced manual */}
          <div className="laInlineAdvanced">
            <div className="laInlineAdvancedHeader">
              <div className="laInlineAdvancedTitle">Advanced summary</div>

              <label className="laInlineCheckbox">
                <input type="checkbox" checked={advancedEnabled} onChange={(e) => setAdvancedEnabled(e.target.checked)} />
                Use manual page range
              </label>
            </div>

            {advancedEnabled ? (
              <div className="laInlineAdvancedBody">
                <div className="laInlineRadios">
                  <label className="laInlineRadio">
                    <input type="radio" name="pageMode" checked={pageMode === "printed"} onChange={() => setPageMode("printed")} />
                    Printed pages (recommended)
                  </label>

                  <label className="laInlineRadio">
                    <input type="radio" name="pageMode" checked={pageMode === "pdf"} onChange={() => setPageMode("pdf")} />
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
                    title="Generate basic summary"
                  >
                    {sectionSummaryLoading && sectionSummaryType === "basic" ? "Basic…" : "Basic"}
                  </button>

                  <button
                    type="button"
                    className="outline-btn"
                    disabled={!canRunManual || sectionSummaryLoading}
                    onClick={() => runManualSectionSummary("extended")}
                    title="Generate extended summary"
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
                  Tip: keep ranges small (Basic ≤ {BASIC_MAX_SPAN} pages, Extended ≤ {EXTENDED_MAX_SPAN} pages). Preview limits still apply.
                </div>
              </div>
            ) : null}
          </div>
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

      {/* Main reader */}
      <div className="readerpage-main">
        {loadingMeta ? <div className="readerMetaPill">Preparing document…</div> : null}

        <PdfViewer
          documentId={docId}
          maxAllowedPage={maxPages}
          onPreviewLimitReached={() => setLocked(true)}
          onRegisterApi={handleRegisterApi}
        />

        {locked && !access.hasFullAccess && (
          <div className="preview-lock-backdrop">
            <div className="preview-lock-card">
              <h2>Preview limit reached</h2>
              <p>
                You’re reading a preview of this publication. To continue beyond page {access.previewMaxPages}, you’ll need full access.
              </p>

              <div className="preview-lock-actions">
                <button className="outline-btn" onClick={() => navigate(`/dashboard/documents/${id}`)}>
                  Back to Details
                </button>

                <button className="primary-btn" onClick={() => navigate(`/dashboard/documents/${id}`)}>
                  Purchase Access
                </button>

                <button className="outline-btn" onClick={() => navigate("/dashboard/explore")}>
                  Explore More
                </button>
              </div>

              <p className="preview-lock-footnote">
                You can purchase this publication from the details page to unlock full reading access.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
