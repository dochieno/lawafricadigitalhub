// src/pages/.../DocumentReader.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import api, { checkDocumentAvailability } from "../../api/client";
import PdfViewer from "../../reader/PdfViewer";
import "../../styles/reader.css";

/**
 * Speed upgrades (no behavior break):
 * ✅ Only block on /access (must be first); everything else is parallel + non-blocking
 * ✅ Avoid heavy blob/range preflight (use checkDocumentAvailability)
 * ✅ Start rendering PdfViewer immediately after /access succeeds (don’t wait for offer/availability)
 * ✅ Keep your existing blocked/unavailable/preview overlays exactly as-is
 */

export default function DocumentReader() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const docId = useMemo(() => Number(id), [id]);

  const [access, setAccess] = useState(null);
  const [offer, setOffer] = useState(null);
  const [contentAvailable, setContentAvailable] = useState(true);
  const [locked, setLocked] = useState(false);

  // ✅ Split loading: gate only on access; keep soft loading for other data
  const [loadingAccess, setLoadingAccess] = useState(true);
  const [loadingMeta, setLoadingMeta] = useState(true);

  // hard-block overlay
  const [blocked, setBlocked] = useState(false);
  const [blockMessage, setBlockMessage] = useState(
    "Access blocked. Please contact your administrator."
  );

  // purchase gating returned by /access
  const [canPurchaseIndividually, setCanPurchaseIndividually] = useState(true);
  const [purchaseDisabledReason, setPurchaseDisabledReason] = useState(null);
  const [blockReason, setBlockReason] = useState(null);

  // success toast when landing from payment
  const [toast, setToast] = useState(null);

  const aliveRef = useRef(true);

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2500);
  }

  // show success toast when redirected from Paystack/MPesa return
  useEffect(() => {
    const qs = new URLSearchParams(location.search);
    const paid = (qs.get("paid") || "").trim();
    const provider = (qs.get("provider") || "").trim();

    if (paid === "1") {
      showToast(`Payment successful ✅${provider ? ` (${provider})` : ""}`, "success");

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    let cancelled = false;

    async function loadAccessOnly() {
      try {
        setLoadingAccess(true);

        // ✅ reset per document
        setLocked(false);
        setBlocked(false);
        setOffer(null);

        setBlockReason(null);
        setCanPurchaseIndividually(true);
        setPurchaseDisabledReason(null);

        setContentAvailable(true);
        setBlockMessage("Access blocked. Please contact your administrator.");

        // 1) Load access rules (must be first)
        const accessRes = await api.get(`/legal-documents/${docId}/access`);
        if (cancelled || !aliveRef.current) return;

        const accessData = accessRes.data;
        setAccess(accessData);

        setCanPurchaseIndividually(accessData?.canPurchaseIndividually !== false);
        setPurchaseDisabledReason(accessData?.purchaseDisabledReason || null);

        // HARD BLOCK from backend decision
        if (accessData?.isBlocked) {
          setBlocked(true);
          setBlockReason(accessData?.blockReason || null);
          setBlockMessage(accessData?.blockMessage || accessData?.message || "Access blocked.");
          return;
        }

        // ✅ If full access, make sure preview lock isn't showing
        if (accessData?.hasFullAccess) setLocked(false);
      } catch (err) {
        console.error("Failed to load access", err);
        if (!cancelled && aliveRef.current) setAccess(null);
      } finally {
        if (!cancelled && aliveRef.current) setLoadingAccess(false);
      }
    }

    async function loadMetaInBackground() {
      setLoadingMeta(true);

      try {
        // 2) Kick off the rest in parallel (non-blocking)
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
            if (status === 401 || status === 403) return true; // auth/access handled elsewhere
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

    // Guard bad ids
    if (!Number.isFinite(docId) || docId <= 0) {
      setAccess(null);
      setLoadingAccess(false);
      setLoadingMeta(false);
      return;
    }

    // ✅ Access gates the page; meta does not
    loadAccessOnly().then(() => {
      // If blocked, meta doesn’t matter (but harmless); we can still skip to save requests
      if (!cancelled && aliveRef.current) {
        loadMetaInBackground();
      }
    });

    return () => {
      cancelled = true;
      aliveRef.current = false;
    };
  }, [docId]);

  // ✅ Gate UI only on access
  if (loadingAccess) {
    return (
      <div
        className="reader-shell"
        style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}
      >
        <div style={{ textAlign: "center", padding: 20 }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Loading reader…</div>
          <div style={{ color: "#6b7280", fontSize: 13 }}>Checking access</div>
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
      canPurchaseIndividually === true &&
      offer?.allowPublicPurchase === true &&
      offer?.alreadyOwned !== true;

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

  // ✅ If meta is still loading, don’t block reading; PdfViewer can start
  // Only block if we have a definitive “not available”
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
    <div className="reader-shell">
      {toast && <div className={`toast toast-${toast.type}`}>{toast.message}</div>}

      {/* Optional tiny “loading meta” hint (non-blocking) */}
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
      />

      {locked && !access.hasFullAccess && (
        <div className="preview-lock-backdrop">
          <div className="preview-lock-card">
            <h2>Preview limit reached</h2>
            <p>
              You’re reading a preview of this publication. To continue beyond page{" "}
              {access.previewMaxPages}, you’ll need full access.
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
  );
}
