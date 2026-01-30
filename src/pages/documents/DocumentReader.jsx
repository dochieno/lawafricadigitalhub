// src/pages/documents/DocumentReader.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import api, { checkDocumentAvailability } from "../../api/client";
import PdfViewer from "../../reader/PdfViewer";
import "../../styles/reader.css";

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

/** ---------------------------
 * Outline helpers (tree DTO aware)
 * - Supports both camelCase and PascalCase (in case API serializer differs)
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

function nodeJumpPage(n) {
  const startPage = n?.startPage ?? n?.StartPage;
  const p = Number(startPage);
  if (Number.isFinite(p) && p > 0) return p;

  const pageNumber = n?.pageNumber ?? n?.page ?? n?.Page;
  const p2 = Number(pageNumber);
  if (Number.isFinite(p2) && p2 > 0) return p2;

  return null;
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
        // clone node shallowly, keep only filtered children
        out.push({
          ...n,
          children: keptKids,
          Children: keptKids, // support both shapes
        });
      }
    }
    return out;
  }

  return walk(nodes);
}

function OutlineTree({
  nodes,
  depth = 0,
  expanded,
  activePage,
  onToggle,
  onPick,
}) {
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
        const jumpPage = nodeJumpPage(n);

        const isActive =
          Number.isFinite(activePage) &&
          Number.isFinite(jumpPage) &&
          jumpPage > 0 &&
          activePage === jumpPage;

        return (
          <div key={id} className="readerOutlineRow" style={{ "--outline-depth": depth }}>
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
                onClick={() => jumpPage && onPick(jumpPage)}
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
  // ✅ Outline state + PdfViewer API bridge
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

  // drawer width (desktop) persisted per browser
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

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      safeAbort(outlineAbortRef.current);
    };
  }, []);

  const handleRegisterApi = useCallback((apiObj) => {
    viewerApiRef.current = apiObj;
  }, []);

  const openOutline = useCallback(() => setOutlineOpen(true), []);
  const closeOutline = useCallback(() => setOutlineOpen(false), []);

  // ✅ Preview clamp + jump
  const onOutlineClick = useCallback(
    (pageNumber) => {
      const p = Number(pageNumber);
      if (!Number.isFinite(p) || p <= 0) return;

      // Preview clamp
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
      if (ok) setOutlineOpen(false);
    },
    [access]
  );

  const toggleOutlineNode = useCallback((idStr) => {
    setOutlineExpanded((prevSet) => {
      const next = new Set(prevSet);
      if (next.has(idStr)) next.delete(idStr);
      else next.add(idStr);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setOutlineExpanded(() => collectAllNodeIds(outline));
  }, [outline]);

  const collapseAll = useCallback(() => {
    setOutlineExpanded(() => new Set());
  }, []);

  // Persist expanded state per document
  useEffect(() => {
    if (!OUTLINE_EXPANDED_KEY) return;
    const arr = Array.from(outlineExpanded.values());
    localStorage.setItem(OUTLINE_EXPANDED_KEY, JSON.stringify(arr));
  }, [OUTLINE_EXPANDED_KEY, outlineExpanded]);

  // Restore expanded state when doc changes (after outline loads)
  const restoreExpandedForDoc = useCallback(() => {
    if (!OUTLINE_EXPANDED_KEY) return;
    const raw = localStorage.getItem(OUTLINE_EXPANDED_KEY);
    const arr = safeJsonParse(raw || "[]", []);
    if (Array.isArray(arr) && arr.length) {
      setOutlineExpanded(new Set(arr.map(String)));
    } else {
      // default expand top-level later
      setOutlineExpanded(new Set());
    }
  }, [OUTLINE_EXPANDED_KEY]);

  // Persist width
  useEffect(() => {
    localStorage.setItem(OUTLINE_WIDTH_KEY, String(outlineWidth));
  }, [outlineWidth]);

  // Best-effort active page tracking (only works if PdfViewer exposes getCurrentPage())
  useEffect(() => {
    let t = null;

    function tick() {
      const p = viewerApiRef.current?.getCurrentPage?.();
      const n = Number(p);
      if (Number.isFinite(n) && n > 0) {
        setActivePage((prev) => (prev === n ? prev : n));
      }
    }

    // start polling once viewer api exists
    t = window.setInterval(() => tick(), 500);

    return () => {
      if (t) window.clearInterval(t);
    };
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

  const onResizePointerMove = useCallback((e) => {
    if (!draggingRef.current) return;
    const x = e.clientX;
    // Drawer is left side; width = x (approx) minus a small margin if you have outer padding
    const next = Math.max(260, Math.min(560, x));
    setOutlineWidth(next);
  }, []);

  const onResizePointerUp = useCallback(() => {
    draggingRef.current = false;
    document.body.classList.remove("readerOutlineResizing");
  }, []);

  // ✅ Always fetch Outline when docId changes (BACKGROUND)
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

      // restore persisted expanded for doc (if any)
      restoreExpandedForDoc();

      // Expand top-level by default once if nothing restored
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
    const canPay =
      canPurchaseIndividually === true && offer?.allowPublicPurchase === true && offer?.alreadyOwned !== true;

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

            {canPay && (
              <p className="preview-lock-footnote readerTip">
                Tip: Go to the details page to complete the purchase.
              </p>
            )}
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

  return (
    <div
      className="reader-layout"
      style={{ "--reader-outline-width": `${outlineWidth}px` }}
      onPointerMove={onResizePointerMove}
      onPointerUp={onResizePointerUp}
    >
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

      {/* Mobile topbar */}
      <div className="readerpage-topbar">
        <button className="readerpage-tocbtn" type="button" onClick={openOutline} title="Table of Contents">
          ☰ ToC
        </button>

        <div className="readerpage-title" title={`Document ${docId}`}>
          Reader
        </div>
      </div>

      {/* Backdrop (mobile) */}
      {outlineOpen && <div className="readerpage-tocBackdrop" onClick={closeOutline} />}

      {/* Drawer / sidebar */}
      <div className={`readerpage-tocDrawer ${outlineOpen ? "open" : ""}`}>
        <div className="readerpage-tocHeader">
          <div className="readerpage-tocTitle">Table of Contents</div>

          <div className="readerOutlineHeaderActions">
            <button className="readerOutlineMiniBtn" type="button" onClick={expandAll} title="Expand all">
              Expand
            </button>
            <button className="readerOutlineMiniBtn" type="button" onClick={collapseAll} title="Collapse all">
              Collapse
            </button>
          </div>

          <button className="readerpage-tocClose" type="button" onClick={closeOutline} title="Close">
            ✕
          </button>
        </div>

        <div className="readerpage-tocBody">
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
              <button
                type="button"
                className="readerOutlineClear"
                onClick={() => setOutlineQuery("")}
                title="Clear search"
              >
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
                You’re reading a preview of this publication. To continue beyond page {access.previewMaxPages}, you’ll
                need full access.
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
