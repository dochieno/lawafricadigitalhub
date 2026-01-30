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

/** ---------------------------
 * ToC helpers (tree DTO aware)
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

function TocTree({ nodes, depth = 0, expanded, onToggle, onPick }) {
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

        return (
          <div key={id} style={{ marginLeft: depth * 14 }}>
            <div style={{ display: "flex", alignItems: "stretch", gap: 8 }}>
              <button
                type="button"
                onClick={() => hasChildren && onToggle(id)}
                disabled={!hasChildren}
                title={hasChildren ? (isOpen ? "Collapse" : "Expand") : ""}
                style={{
                  width: 30,
                  minWidth: 30,
                  border: "none",
                  background: "transparent",
                  cursor: hasChildren ? "pointer" : "default",
                  opacity: hasChildren ? 1 : 0.25,
                  fontSize: 14,
                  lineHeight: "34px",
                }}
                aria-label={hasChildren ? (isOpen ? "Collapse section" : "Expand section") : "No children"}
              >
                {hasChildren ? (isOpen ? "▾" : "▸") : "•"}
              </button>

              <button
                className="readerpage-tocItem"
                type="button"
                disabled={!jumpPage}
                onClick={() => jumpPage && onPick(jumpPage)}
                title={jumpPage ? `Go to page ${jumpPage}` : "No page mapped"}
                style={{ flex: 1 }}
              >
                <div className="readerpage-tocItemTitle">{title || "—"}</div>
                <div className="readerpage-tocItemPage">{right || "—"}</div>
              </button>
            </div>

            {hasChildren && isOpen ? (
              <div style={{ marginTop: 2 }}>
                <TocTree nodes={children} depth={depth + 1} expanded={expanded} onToggle={onToggle} onPick={onPick} />
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
  // ✅ ToC state + PdfViewer API bridge
  // ---------------------------------------------
  const [tocOpen, setTocOpen] = useState(false);
  const [toc, setToc] = useState([]);
  const [tocLoading, setTocLoading] = useState(false);
  const [tocError, setTocError] = useState("");

  const [tocExpanded, setTocExpanded] = useState(() => new Set());

  const viewerApiRef = useRef(null);

  const mountedRef = useRef(false);
  const tocAbortRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      safeAbort(tocAbortRef.current);
    };
  }, []);

  const handleRegisterApi = useCallback((apiObj) => {
    viewerApiRef.current = apiObj;
  }, []);

  const openToc = useCallback(() => {
    setTocOpen(true);
  }, []);

  const closeToc = useCallback(() => {
    setTocOpen(false);
  }, []);

  const onTocClick = useCallback((pageNumber) => {
    const p = Number(pageNumber);
    if (!Number.isFinite(p) || p <= 0) return;

    const ok = viewerApiRef.current?.jumpToPage?.(p, "smooth");
    if (ok) setTocOpen(false);
  }, []);

  const toggleTocNode = useCallback((idStr) => {
    setTocExpanded((prevSet) => {
      const next = new Set(prevSet);
      if (next.has(idStr)) next.delete(idStr);
      else next.add(idStr);
      return next;
    });
  }, []);

  // ✅ Always fetch ToC when docId changes (BACKGROUND)
  const fetchToc = useCallback(async () => {
    if (!Number.isFinite(docId) || docId <= 0) return;

    safeAbort(tocAbortRef.current);
    const ctrl = new AbortController();
    tocAbortRef.current = ctrl;

    setTocLoading(true);
    setTocError("");

    try {
      // IMPORTANT: Reader endpoint
      const res = await api.get(`/legal-documents/${docId}/toc`, { signal: ctrl.signal });

      if (!mountedRef.current || ctrl.signal.aborted) return;

      const items = res.data?.items ?? [];
      const arr = Array.isArray(items) ? items : [];
      setToc(arr);

      // Expand top-level by default once
      setTocExpanded((prevSet) => {
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
      console.debug("Failed to load ToC:", err);
      setToc([]);
      setTocError(err?.response?.data?.message || "Failed to load Table of Contents.");
    } finally {
  if (mountedRef.current && !ctrl.signal.aborted) {
    setTocLoading(false);
  }
}

  }, [docId]);

  useEffect(() => {
    // load ToC as soon as document changes
    if (!Number.isFinite(docId) || docId <= 0) return;
    fetchToc();
  }, [docId, fetchToc]);

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
      <div className="reader-shell" style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center", padding: 20 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Loading reader…</div>
          <div style={{ color: "#6b7280", fontSize: 13 }}>{loadingAccessHint}</div>
        </div>
      </div>
    );
  }

  if (!access) {
    return (
      <div className="reader-shell" style={{ padding: 20 }}>
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

            {blockReason && (
              <div
                style={{
                  display: "inline-flex",
                  padding: "6px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 900,
                  border: "1px solid #fecaca",
                  background: "#fef2f2",
                  color: "#991b1b",
                  marginBottom: 10,
                }}
              >
                {blockReason}
              </div>
            )}

            <p style={{ whiteSpace: "pre-wrap" }}>{blockMessage}</p>

            {!canPurchaseIndividually && (
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "#fffbeb",
                  border: "1px solid #fcd34d",
                  color: "#92400e",
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
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
              <p className="preview-lock-footnote" style={{ marginTop: 6 }}>
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
    <div className="reader-layout">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

      {/* Mobile topbar */}
      <div className="readerpage-topbar">
        <button className="readerpage-tocbtn" type="button" onClick={openToc} title="Table of Contents">
          ☰ ToC
        </button>

        <div className="readerpage-title" title={`Document ${docId}`}>
          Reader
        </div>
      </div>

      {/* Backdrop (mobile) */}
      {tocOpen && <div className="readerpage-tocBackdrop" onClick={closeToc} />}

      {/* ToC drawer / sidebar */}
      <div className={`readerpage-tocDrawer ${tocOpen ? "open" : ""}`}>
        <div className="readerpage-tocHeader">
          <div className="readerpage-tocTitle">Table of Contents</div>
          <button className="readerpage-tocClose" type="button" onClick={closeToc} title="Close">
            ✕
          </button>
        </div>

        <div className="readerpage-tocBody">
          {tocLoading ? (
            <div className="readerpage-tocState">Loading ToC…</div>
          ) : tocError ? (
            <div className="readerpage-tocState error">
              {tocError}
              <div style={{ marginTop: 10 }}>
                <button className="outline-btn" type="button" onClick={fetchToc}>
                  Retry
                </button>
              </div>
            </div>
          ) : toc?.length ? (
            <div className="readerpage-tocList">
              <TocTree nodes={toc} expanded={tocExpanded} onToggle={toggleTocNode} onPick={onTocClick} />
            </div>
          ) : (
            <div className="readerpage-tocState">
              No ToC available for document #{docId}.
              <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                Confirm the Reader API returns it:{" "}
                <span style={{ fontWeight: 800 }}>/api/legal-documents/{docId}/toc</span>
              </div>
              <div style={{ marginTop: 10 }}>
                <button className="outline-btn" type="button" onClick={fetchToc}>
                  Reload ToC
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main reader */}
      <div className="readerpage-main">
        {loadingMeta ? (
          <div
            style={{
              position: "fixed",
              top: 62,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 20,
              fontSize: 12,
              fontWeight: 800,
              color: "#6b7280",
              background: "rgba(255,255,255,0.75)",
              border: "1px solid rgba(229,231,235,0.9)",
              padding: "6px 10px",
              borderRadius: 999,
              backdropFilter: "blur(6px)",
            }}
          >
            Preparing document…
          </div>
        ) : null}

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
